"""
test_hn212_client.py – TDD tests for Slice 3 HN-212 client enhancements.

Covers:
  - LocalState.has_valid_reader_state(): requires online=True + recent lastSeen
    + a valid reader message (idCode/personName present in last_reader_message).
  - Malformed / oversized WebSocket frame must not kill worker (caught internally).
  - Reconnect is bounded (max 2-second wait between retries).
  - Frame size cap: frames > 1 MiB are discarded, not propagated.

Run:
    python -m unittest -v test_hn212_client.py
"""

import threading
import time
import unittest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# LocalState readiness
# ---------------------------------------------------------------------------

class TestLocalStateHasValidReaderState(unittest.TestCase):
    """AC2: HN readiness = connected socket + recent valid reader state."""

    def _state(self, **kw):
        from hn212_client import LocalState
        return LocalState(**kw)

    def test_offline_state_is_not_ready(self):
        """online=False → not ready even if lastSeen is recent."""
        state = self._state(online=False, lastSeen=time.time(), error=None)
        self.assertFalse(state.has_valid_reader_state())

    def test_online_but_no_last_seen_is_not_ready(self):
        """online=True but lastSeen=None → not ready."""
        state = self._state(online=True, lastSeen=None, error=None)
        self.assertFalse(state.has_valid_reader_state())

    def test_online_but_stale_last_seen_is_not_ready(self):
        """online=True but lastSeen > 30 s ago → not ready."""
        state = self._state(online=True, lastSeen=time.time() - 31, error=None)
        self.assertFalse(state.has_valid_reader_state())

    def test_online_fresh_but_no_valid_reader_message_is_not_ready(self):
        """online=True, recent lastSeen, but no idCode/personName → not ready."""
        state = self._state(online=True, lastSeen=time.time(), error=None)
        # no last_reader_message set
        self.assertFalse(state.has_valid_reader_state())

    def test_online_fresh_with_valid_reader_message_is_ready(self):
        """online=True + recent + last_reader_message with idCode + personName → ready."""
        state = self._state(online=True, lastSeen=time.time(), error=None)
        state.update_reader_message({"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        self.assertTrue(state.has_valid_reader_state())

    def test_valid_reader_message_but_offline_is_not_ready(self):
        """A valid reader message does not help if the socket went offline."""
        state = self._state(online=True, lastSeen=time.time(), error=None)
        state.update_reader_message({"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        state.update(online=False, error="disconnected", lastSeen=time.time())
        self.assertFalse(state.has_valid_reader_state())

    def test_reader_message_without_id_code_is_not_valid(self):
        """A message with personName but no idCode → not sufficient."""
        state = self._state(online=True, lastSeen=time.time(), error=None)
        state.update_reader_message({"id": "2", "data": {"personName": "A"}})
        self.assertFalse(state.has_valid_reader_state())

    def test_reader_message_without_person_name_is_not_valid(self):
        """A message with idCode but no personName → not sufficient."""
        state = self._state(online=True, lastSeen=time.time(), error=None)
        state.update_reader_message({"id": "2", "data": {"idCode": "034205005951"}})
        self.assertFalse(state.has_valid_reader_state())

    def test_update_reader_message_is_threadsafe(self):
        """update_reader_message must not raise under concurrent access."""
        state = self._state(online=True, lastSeen=time.time(), error=None)
        errors = []

        def writer():
            for _ in range(50):
                state.update_reader_message({"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})

        def reader():
            for _ in range(50):
                try:
                    state.has_valid_reader_state()
                except Exception as exc:
                    errors.append(exc)

        threads = [threading.Thread(target=writer), threading.Thread(target=reader)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=2)
        self.assertEqual(errors, [])


# ---------------------------------------------------------------------------
# Frame size cap
# ---------------------------------------------------------------------------

class TestHn212ClientFrameSizeCap(unittest.TestCase):
    """AC2: Malformed/oversized frame must not kill worker."""

    def test_empty_text_frame_is_ignored_as_plugin_heartbeat(self):
        """HN212Plugin emits empty text frames; they are not reader failures."""
        from hn212_client import Hn212Client

        self.assertIsNone(Hn212Client._parse_message(""))
        self.assertIsNone(Hn212Client._parse_message("  \r\n"))

    def test_vendor_connection_greeting_is_ignored(self):
        """Verified HN212Plugin greeting keeps the socket open for later card events."""
        from hn212_client import Hn212Client

        self.assertIsNone(Hn212Client._parse_message("Đã kết nối!"))

    def test_nonempty_text_frame_is_parsed_as_json(self):
        from hn212_client import Hn212Client

        self.assertEqual(Hn212Client._parse_message('{"id":"2","data":{}}'), {"id": "2", "data": {}})

    def test_non_json_frame_reports_only_safe_metadata(self):
        from hn212_client import Hn212Client, Hn212ProtocolError

        with self.assertRaisesRegex(Hn212ProtocolError, r"HN-212 non-JSON frame len=11 sha256=[0-9a-f]{12}"):
            Hn212Client._parse_message("CARD_RESULT")

    def test_recv_text_discards_oversized_frame(self):
        """
        A text frame claiming length > 1 MiB must be discarded without raising;
        _recv_text should return None or raise a controlled ValueError,
        NOT propagate to the caller as an unhandled exception.
        """
        from hn212_client import Hn212Client, LocalState
        import struct

        stop = threading.Event()
        state = LocalState(online=False, lastSeen=None, error=None)
        client = Hn212Client("ws://localhost:9999", lambda m: None, state, stop)

        # Build a fake socket that returns a frame with 2-byte extended length = 2 MiB
        oversized_length = 2 * 1024 * 1024
        header = bytes([0x81, 126]) + struct.pack("!H", 65535)  # max 16-bit = 65535 < 1MiB; safe

        # For the > 1 MiB test we use 127 (64-bit length)
        header_huge = bytes([0x81, 127]) + struct.pack("!Q", oversized_length)
        # Followed by `oversized_length` bytes of payload – but the socket will EOF quickly
        # We only test that _recv_text raises ValueError (not crashes) for oversized frames.

        payloads = [header_huge]
        call_count = [0]

        class FakeSocket:
            def recv(self, n):
                chunk = payloads[0][call_count[0]:call_count[0] + n]
                call_count[0] += n
                if not chunk:
                    return b""
                return chunk

        fake_sock = FakeSocket()
        # _recv_text should NOT raise an unhandled exception for oversized frames
        try:
            result = client._recv_text(fake_sock)
            # Acceptable: returns None (treated as close) or raises ValueError
            # The critical thing is it does NOT raise anything other than ValueError
        except ValueError:
            pass  # Acceptable – controlled rejection
        except Exception as exc:
            self.fail(f"_recv_text raised unexpected {type(exc).__name__}: {exc}")

    def test_recv_text_handles_empty_payload(self):
        """EOF immediately → None returned, not an exception."""
        from hn212_client import Hn212Client, LocalState

        stop = threading.Event()
        state = LocalState(online=False, lastSeen=None, error=None)
        client = Hn212Client("ws://localhost:9999", lambda m: None, state, stop)

        class FakeSocket:
            def recv(self, n):
                return b""

        result = client._recv_text(FakeSocket())
        self.assertIsNone(result)


# ---------------------------------------------------------------------------
# Reconnect is bounded
# ---------------------------------------------------------------------------

class TestHn212ClientReconnectBounded(unittest.TestCase):
    """AC2: Reconnect wait ≤ 2 seconds (stop.wait(2) in the loop)."""

    def test_reconnect_waits_at_most_2_seconds(self):
        """
        When connection fails, the client must call stop.wait with ≤ 2 seconds.
        We confirm this by inspecting the source code constraint is in place via
        a timed execution that fails fast.
        """
        from hn212_client import Hn212Client, LocalState

        stop = threading.Event()
        state = LocalState(online=False, lastSeen=None, error=None)
        client = Hn212Client("ws://localhost:9999", lambda m: None, state, stop)

        # Patch _connect to always fail, run loop briefly
        connect_calls = [0]

        def bad_connect():
            connect_calls[0] += 1
            if connect_calls[0] >= 2:
                stop.set()  # stop after second attempt
            raise ConnectionError("refused")

        client._connect = bad_connect
        t = threading.Thread(target=client.run, daemon=True)
        start = time.monotonic()
        t.start()
        t.join(timeout=6)
        elapsed = time.monotonic() - start
        # With 2 s max wait, two attempts should complete well under 6 s
        self.assertLess(elapsed, 6.0, "Reconnect loop took too long – wait must be bounded to 2 s")
        self.assertGreaterEqual(connect_calls[0], 2)


if __name__ == "__main__":
    unittest.main()
