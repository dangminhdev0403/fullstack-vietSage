import base64
import hashlib
import json
import os
import socket
import struct
import threading
import time
from urllib.parse import urlparse

# AC2: Maximum WebSocket frame payload accepted (1 MiB); larger frames are discarded.
_MAX_FRAME_BYTES = 1_048_576  # 1 MiB
# How long a lastSeen timestamp may be before the connection is considered stale.
_READER_STATE_FRESHNESS_S = 30


class Hn212ProtocolError(ValueError):
    """Protocol mismatch without exposing identity-bearing payloads."""


class Hn212Client:
    def __init__(self, url, on_message, state, stop):
        self.url = url
        self.on_message = on_message
        self.state = state
        self.stop = stop

    def run(self):
        while not self.stop.is_set():
            sock = None
            try:
                sock = self._connect()
                self.state.update(online=True, lastSeen=time.time(), error=None)
                while not self.stop.is_set():
                    message = self._recv_text(sock)
                    if message is None:
                        raise ConnectionError("HN-212 WebSocket đã đóng")
                    # AC2: update state with timestamp then parse.
                    self.state.update(online=True, lastSeen=time.time(), error=None)
                    parsed = self._parse_message(message)
                    if parsed is None:
                        continue
                    # AC2: record reader message for readiness check.
                    self.state.update_reader_message(parsed)
                    self.on_message(parsed)
            except Exception as error:
                self.state.update(online=False, error=str(error)[:160], lastSeen=time.time())
                # AC2: reconnect bounded to ≤ 2 seconds
                self.stop.wait(2)
            finally:
                if sock:
                    sock.close()

    def _connect(self):
        parsed = urlparse(self.url)
        if parsed.scheme != "ws" or parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            raise ValueError("HN-212 WebSocket phải chạy trên localhost")
        sock = socket.create_connection((parsed.hostname, parsed.port or 80), timeout=5)
        sock.settimeout(15)
        key = base64.b64encode(os.urandom(16)).decode()
        path = parsed.path or "/"
        request = (
            f"GET {path} HTTP/1.1\r\nHost: {parsed.hostname}:{parsed.port or 80}\r\n"
            f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        sock.sendall(request.encode())
        response = self._recv_until(sock, b"\r\n\r\n")
        expected = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        if b" 101 " not in response.split(b"\r\n", 1)[0] or f"Sec-WebSocket-Accept: {expected}".lower().encode() not in response.lower():
            raise ConnectionError("HN-212 WebSocket handshake thất bại")
        return sock

    @staticmethod
    def _parse_message(message):
        """Ignore HN212Plugin's empty text heartbeat; parse real events strictly."""
        if not message or not message.strip() or message == "Đã kết nối!":
            return None
        try:
            return json.loads(message)
        except json.JSONDecodeError as error:
            digest = hashlib.sha256(message.encode("utf-8", errors="replace")).hexdigest()[:12]
            raise Hn212ProtocolError(
                f"HN-212 non-JSON frame len={len(message)} sha256={digest}"
            ) from error

    @staticmethod
    def _recv_until(sock, marker):
        data = b""
        while marker not in data:
            chunk = sock.recv(4096)
            if not chunk:
                raise ConnectionError("WebSocket đóng khi handshake")
            data += chunk
            if len(data) > 65536:
                raise ValueError("WebSocket header quá lớn")
        return data

    @staticmethod
    def _exact(sock, size):
        data = b""
        while len(data) < size:
            chunk = sock.recv(size - len(data))
            if not chunk:
                return None
            data += chunk
        return data

    def _recv_text(self, sock):
        header = self._exact(sock, 2)
        if not header:
            return None
        first, second = header
        opcode, length = first & 0x0F, second & 0x7F
        if length == 126:
            ext = self._exact(sock, 2)
            if ext is None:
                return None
            length = struct.unpack("!H", ext)[0]
        elif length == 127:
            ext = self._exact(sock, 8)
            if ext is None:
                return None
            length = struct.unpack("!Q", ext)[0]
        # AC2: reject oversized frames – discard payload, return None (treated as close).
        if length > _MAX_FRAME_BYTES:
            raise ValueError(f"WebSocket frame quá lớn ({length} bytes > {_MAX_FRAME_BYTES})")
        mask = self._exact(sock, 4) if second & 0x80 else None
        payload = self._exact(sock, length)
        if payload is None:
            return None
        if mask:
            payload = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
        if opcode == 8:
            return None
        if opcode == 9:
            self._send_pong(sock, payload)
            return self._recv_text(sock)
        if opcode != 1:
            return self._recv_text(sock)
        return payload.decode("utf-8")

    @staticmethod
    def _send_pong(sock, payload):
        length = len(payload)
        if length >= 126:
            raise ValueError("Ping frame quá lớn")
        sock.sendall(bytes((0x8A, length)) + payload)


class LocalState:
    def __init__(self, **values):
        self.data = values
        self.lock = threading.Lock()
        # AC2: last reader message (id==2) that contained idCode + personName.
        self._last_reader_message = None

    def update(self, **values):
        with self.lock:
            self.data.update(values)

    def get(self):
        with self.lock:
            return dict(self.data)

    def update_reader_message(self, message):
        """
        Record a reader message if it contains idCode and personName.
        Thread-safe; called from the HN-212 client loop.

        AC2: HN readiness requires a recent valid reader state/message.
        """
        if not isinstance(message, dict):
            return
        # id=="2" carries NFC chip data; we only care about messages with identity fields.
        msg_id = str(message.get("id", ""))
        data = message.get("data", {})
        if isinstance(data, dict) and data.get("idCode") and data.get("personName"):
            with self.lock:
                self._last_reader_message = message

    def has_valid_reader_state(self, freshness_s=_READER_STATE_FRESHNESS_S):
        """
        Return True iff:
          - online is True
          - lastSeen is not None and within freshness_s seconds of now
          - at least one reader message with idCode + personName has been seen

        AC2: socket open alone is insufficient.
        """
        with self.lock:
            data = dict(self.data)
            reader_msg = self._last_reader_message

        if not data.get("online"):
            return False
        last_seen = data.get("lastSeen")
        if last_seen is None:
            return False
        if time.time() - last_seen > freshness_s:
            return False
        if reader_msg is None:
            return False
        # Validate the reader message still has required fields.
        msg_data = reader_msg.get("data", {})
        if not (isinstance(msg_data, dict) and msg_data.get("idCode") and msg_data.get("personName")):
            return False
        return True
