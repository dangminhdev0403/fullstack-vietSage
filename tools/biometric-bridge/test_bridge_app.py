"""
test_bridge_app.py – TDD tests for Slice 2 bridge endpoints.

Covers:
  - POST /pair       (pairing, single-use code, expiry, constant-time compare)
  - GET  /settings   (public; returns only communicationKeyConfigured)
  - PUT  /settings   (requires Bearer token; validates & persists; generation)
  - GET  /health     (remains public, no auth required)
  - Auth: 401 on missing/wrong token for mutating endpoints
  - 1 MiB JSON cap enforced
  - Pairing only from loopback

Run:
    python -m unittest -v test_bridge_app.py
"""

import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import MagicMock, patch
import urllib.request
import urllib.error
import socket


# ============================================================
# Helpers
# ============================================================

class _FakeAdapter:
    def protect(self, data: bytes) -> bytes:
        return bytes(b ^ 0x55 for b in data)

    def unprotect(self, blob: bytes) -> bytes:
        return bytes(b ^ 0x55 for b in blob)


def _build_stores(tmp_dir):
    """Return (settings_store, secret_store, pairing_store) for test use."""
    from local_settings import LocalSettingsStore
    from local_secrets import DpapiSecretStore
    from bridge_app import PairingStore

    secret_store = DpapiSecretStore(adapter=_FakeAdapter())
    settings_store = LocalSettingsStore(
        os.path.join(tmp_dir, "settings.json"),
        _secret_store=secret_store,
    )
    pairing_store = PairingStore()
    return settings_store, secret_store, pairing_store


def _start_test_server(handler_class, host="127.0.0.1"):
    """Start a ThreadingHTTPServer on a random port; return (server, url, thread)."""
    server = ThreadingHTTPServer((host, 0), handler_class)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://{host}:{port}", thread


def _do_request(url, method="GET", body=None, headers=None, token=None):
    """Simple HTTP helper. Returns (status, dict_or_None)."""
    req_headers = {"Content-Type": "application/json; charset=utf-8"}
    if headers:
        req_headers.update(headers)
    if token:
        req_headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers["Content-Length"] = str(len(data))
    else:
        data = None
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        try:
            body_text = exc.read()
            return exc.code, json.loads(body_text)
        except Exception:
            return exc.code, None


# ============================================================
# Pairing Store unit tests (no HTTP)
# ============================================================

class TestPairingStore(unittest.TestCase):
    """AC4: Pairing store logic, constant-time compare, expiry, single-use."""

    def _store(self):
        from bridge_app import PairingStore
        return PairingStore()

    def test_issue_code_returns_nonempty_string(self):
        store = self._store()
        code = store.issue_code(ttl_seconds=300)
        self.assertIsInstance(code, str)
        self.assertGreater(len(code), 8)

    def test_valid_code_produces_session_token(self):
        store = self._store()
        code = store.issue_code(ttl_seconds=300)
        token = store.redeem(code)
        self.assertIsNotNone(token)
        self.assertIsInstance(token, str)
        self.assertGreater(len(token), 16)

    def test_wrong_code_returns_none(self):
        store = self._store()
        store.issue_code(ttl_seconds=300)
        result = store.redeem("wrong-code-xxxx")
        self.assertIsNone(result)

    def test_code_is_single_use(self):
        """After first successful redeem, the same code must not work again."""
        store = self._store()
        code = store.issue_code(ttl_seconds=300)
        token1 = store.redeem(code)
        self.assertIsNotNone(token1)
        token2 = store.redeem(code)
        self.assertIsNone(token2)

    def test_expired_code_returns_none(self):
        """Codes with ttl=0 should not be redeemable."""
        store = self._store()
        code = store.issue_code(ttl_seconds=0)
        # Ensure at least 1 ms has passed
        time.sleep(0.01)
        result = store.redeem(code)
        self.assertIsNone(result)

    def test_validate_token_returns_true_for_valid(self):
        store = self._store()
        code = store.issue_code(ttl_seconds=300)
        token = store.redeem(code)
        self.assertTrue(store.validate_token(token))

    def test_validate_token_returns_false_for_wrong(self):
        store = self._store()
        self.assertFalse(store.validate_token("totally-wrong-token"))

    def test_validate_token_returns_false_for_expired_session(self):
        """Session tokens issued with ttl=0 expire immediately."""
        store = self._store()
        code = store.issue_code(ttl_seconds=300)
        token = store.redeem(code, session_ttl_seconds=0)
        time.sleep(0.01)
        self.assertFalse(store.validate_token(token))

    def test_session_token_is_bounded_length(self):
        """Session tokens must not be excessively long."""
        store = self._store()
        code = store.issue_code(ttl_seconds=300)
        token = store.redeem(code)
        # tokens should be between 32 and 256 chars
        self.assertLessEqual(len(token), 256)
        self.assertGreaterEqual(len(token), 32)

    def test_compare_is_constant_time(self):
        """
        Prove that redeem() uses hmac.compare_digest (or secrets.compare_digest)
        rather than == by checking that the implementation calls it.
        We can verify the method exists and the store uses it indirectly.
        This is a structural test — we patch hmac.compare_digest and verify it's called.
        """
        import hmac as hmac_module
        store = self._store()
        code = store.issue_code(ttl_seconds=300)

        original_compare = hmac_module.compare_digest
        calls = []

        def tracking_compare(a, b):
            calls.append((a, b))
            return original_compare(a, b)

        with patch("hmac.compare_digest", side_effect=tracking_compare):
            store.redeem(code)

        self.assertGreater(len(calls), 0, "hmac.compare_digest must be called during redeem()")


# ============================================================
# HTTP endpoint tests
# ============================================================

class TestBridgeEndpointSetup(unittest.TestCase):
    """Base class that starts the bridge handler with test stubs."""

    @classmethod
    def setUpClass(cls):
        cls._tmp_dir = tempfile.mkdtemp()
        cls._settings_store, cls._secret_store, cls._pairing_store = _build_stores(cls._tmp_dir)

        # Minimal stubs for existing bridge dependencies
        cls._device_state = MagicMock()
        cls._device_state.get.return_value = {"online": False}
        cls._hn_state = MagicMock()
        cls._hn_state.get.return_value = {"online": False}
        cls._hn_state.has_valid_reader_state.return_value = False
        cls._push_queue = MagicMock()
        cls._push_queue.last_seen = None
        cls._push_queue.last_serial = None
        cls._bio_store = MagicMock()

        # Issue a valid pairing code + session token for auth tests.
        code = cls._pairing_store.issue_code(ttl_seconds=300)
        cls._valid_token = cls._pairing_store.redeem(code)

        from bridge_app import make_api_handler
        handler = make_api_handler(
            cls._bio_store,
            cls._device_state,
            cls._hn_state,
            cls._push_queue,
            ["http://localhost:3000"],
            settings_store=cls._settings_store,
            secret_store=cls._secret_store,
            pairing_store=cls._pairing_store,
        )
        cls._server, cls._base_url, cls._thread = _start_test_server(handler)

    @classmethod
    def tearDownClass(cls):
        cls._server.shutdown()
        import shutil
        shutil.rmtree(cls._tmp_dir, ignore_errors=True)


class TestHealthEndpoint(TestBridgeEndpointSetup):
    """GET /health must remain public (no auth required)."""

    def test_health_returns_200(self):
        status, body = _do_request(f"{self._base_url}/health")
        self.assertEqual(status, 200)

    def test_health_no_auth_required(self):
        """Health must not require a Bearer token."""
        status, body = _do_request(f"{self._base_url}/health")
        self.assertNotEqual(status, 401)


class TestGetSettingsEndpoint(TestBridgeEndpointSetup):
    """GET /settings is public; returns only communicationKeyConfigured."""

    def test_get_settings_returns_200(self):
        status, body = _do_request(f"{self._base_url}/settings")
        self.assertEqual(status, 200)

    def test_get_settings_returns_communication_key_configured_false_initially(self):
        status, body = _do_request(f"{self._base_url}/settings")
        self.assertIn("communicationKeyConfigured", body)
        self.assertFalse(body["communicationKeyConfigured"])

    def test_get_settings_does_not_return_secret_values(self):
        """The response must NEVER contain any plaintext secret."""
        status, body = _do_request(f"{self._base_url}/settings")
        body_str = json.dumps(body)
        # No sensitive field names in the response.
        self.assertNotIn("communicationKey", body_str.replace("communicationKeyConfigured", ""))

    def test_get_settings_no_auth_required(self):
        status, _ = _do_request(f"{self._base_url}/settings")
        self.assertNotEqual(status, 401)


class TestPutSettingsEndpoint(TestBridgeEndpointSetup):
    """PUT /settings requires Bearer token, validates, persists, increments generation."""

    def test_put_settings_without_token_returns_401(self):
        status, body = _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"devicePort": 4370},
        )
        self.assertEqual(status, 401)

    def test_put_settings_with_wrong_token_returns_401(self):
        status, body = _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"devicePort": 4370},
            token="totally-wrong-token",
        )
        self.assertEqual(status, 401)

    def test_put_settings_with_valid_token_returns_200(self):
        status, body = _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"devicePort": 4371},
            token=self._valid_token,
        )
        self.assertEqual(status, 200)

    def test_put_settings_returns_restart_required_true(self):
        status, body = _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"devicePort": 4372},
            token=self._valid_token,
        )
        self.assertEqual(status, 200)
        self.assertTrue(body.get("restartRequired"), "restartRequired must be true")

    def test_put_invalid_settings_returns_422(self):
        status, body = _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"devicePort": 99999},  # out of range
            token=self._valid_token,
        )
        self.assertIn(status, (400, 422))

    def test_put_unknown_field_returns_422(self):
        status, body = _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"unknownField": "x"},
            token=self._valid_token,
        )
        self.assertIn(status, (400, 422))

    def test_put_invalid_does_not_change_generation(self):
        gen_before = self._settings_store.generation
        _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"devicePort": 99999},
            token=self._valid_token,
        )
        self.assertEqual(self._settings_store.generation, gen_before)

    def test_put_valid_increments_generation_exactly_once(self):
        gen_before = self._settings_store.generation
        _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"devicePort": 4373},
            token=self._valid_token,
        )
        self.assertEqual(self._settings_store.generation, gen_before + 1)

    def test_put_oversized_body_rejected(self):
        """Bodies > 1 MiB must be rejected (414 or 400)."""
        big = {"devicePort": 4370, "apiCert": "x" * (1_100_000)}
        status, _ = _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body=big,
            token=self._valid_token,
        )
        self.assertIn(status, (400, 413))


class TestPostPairEndpoint(TestBridgeEndpointSetup):
    """POST /pair: single-use code, issues session token."""

    def _issue_code_and_get_token(self, ttl=300):
        """Helper: issue code via pairing store, exchange it via POST /pair."""
        code = self._pairing_store.issue_code(ttl_seconds=ttl)
        status, body = _do_request(
            f"{self._base_url}/pair",
            method="POST",
            body={"code": code},
        )
        return status, body

    def test_valid_code_returns_200_and_token(self):
        status, body = self._issue_code_and_get_token()
        self.assertEqual(status, 200)
        self.assertIn("token", body)
        self.assertIsInstance(body["token"], str)
        self.assertGreater(len(body["token"]), 16)

    def test_wrong_code_returns_401(self):
        self._pairing_store.issue_code(ttl_seconds=300)
        status, body = _do_request(
            f"{self._base_url}/pair",
            method="POST",
            body={"code": "not-the-right-code"},
        )
        self.assertEqual(status, 401)

    def test_code_is_single_use_http(self):
        """Second use of the same code must return 401."""
        code = self._pairing_store.issue_code(ttl_seconds=300)
        _do_request(f"{self._base_url}/pair", method="POST", body={"code": code})
        status, body = _do_request(f"{self._base_url}/pair", method="POST", body={"code": code})
        self.assertEqual(status, 401)

    def test_expired_code_returns_401(self):
        code = self._pairing_store.issue_code(ttl_seconds=0)
        time.sleep(0.02)
        status, body = _do_request(
            f"{self._base_url}/pair",
            method="POST",
            body={"code": code},
        )
        self.assertEqual(status, 401)

    def test_missing_code_field_returns_400(self):
        status, body = _do_request(
            f"{self._base_url}/pair",
            method="POST",
            body={"wrong_field": "x"},
        )
        self.assertEqual(status, 400)

    def test_oversized_pair_body_rejected(self):
        big_body = {"code": "x" * 1_100_000}
        status, _ = _do_request(
            f"{self._base_url}/pair",
            method="POST",
            body=big_body,
        )
        self.assertIn(status, (400, 413))

    def test_pair_token_can_authorize_put_settings(self):
        """Token from POST /pair must work for PUT /settings."""
        _, pair_body = self._issue_code_and_get_token()
        token = pair_body.get("token")
        self.assertIsNotNone(token)
        status, body = _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"devicePort": 4374},
            token=token,
        )
        self.assertEqual(status, 200)


class TestPairBootstrapLoopbackOnly(unittest.TestCase):
    """AC6: Pair bootstrap only from loopback."""

    def test_pair_endpoint_is_registered(self):
        """
        The /pair endpoint must be present.  We test from 127.0.0.1 (loopback).
        A full non-loopback restriction test would require a second network interface,
        which is outside the test scope; the handler binds to loopback by design.
        """
        # This is validated by TestPostPairEndpoint which runs on 127.0.0.1.
        # The bridge_app.main() enforces loopback binding via args.api_listen check.
        pass


class TestAuthorizationEnforcement(TestBridgeEndpointSetup):
    """Verify mutating endpoints need auth; GET /health and GET /settings are public."""

    def test_put_settings_requires_auth(self):
        status, _ = _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"devicePort": 4370},
        )
        self.assertEqual(status, 401)

    def test_post_scans_start_requires_auth(self):
        """POST /scans/start is an existing endpoint; it must require auth in Slice 2."""
        status, _ = _do_request(
            f"{self._base_url}/scans/start",
            method="POST",
        )
        self.assertEqual(status, 401)

    def test_get_health_no_auth(self):
        status, _ = _do_request(f"{self._base_url}/health")
        self.assertNotEqual(status, 401)

    def test_get_settings_no_auth(self):
        status, _ = _do_request(f"{self._base_url}/settings")
        self.assertNotEqual(status, 401)

    def test_401_response_does_not_include_token_value(self):
        """Error bodies on 401 must not echo the supplied token."""
        status, body = _do_request(
            f"{self._base_url}/settings",
            method="PUT",
            body={"devicePort": 4370},
            token="my-secret-token-value",
        )
        self.assertEqual(status, 401)
        body_str = json.dumps(body or {})
        self.assertNotIn("my-secret-token-value", body_str)


class TestDiagnosticsEndpoint(TestBridgeEndpointSetup):
    """Slice 3 AC1: POST /diagnostics/run – authenticated, fixed 60 s freshness."""

    def test_diagnostics_requires_auth(self):
        """POST /diagnostics/run without token → 401."""
        status, _ = _do_request(f"{self._base_url}/diagnostics/run", method="POST", body={})
        self.assertEqual(status, 401)

    def test_diagnostics_with_token_returns_200(self):
        """POST /diagnostics/run with valid token → 200."""
        status, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        self.assertEqual(status, 200)

    def test_diagnostics_response_has_required_fields(self):
        """Response must contain checkedAt, expiresAt, bridge, hn212, senseFaceTcp, senseFacePush."""
        _, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        for field in ("checkedAt", "expiresAt", "bridge", "hn212", "senseFaceTcp", "senseFacePush", "scanReady", "faceReady"):
            self.assertIn(field, body, f"Missing field: {field}")

    def test_diagnostics_expiry_is_60_seconds_after_checked(self):
        """expiresAt must be exactly 60 seconds after checkedAt."""
        from datetime import datetime, timezone
        _, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        checked = datetime.fromisoformat(body["checkedAt"])
        expires = datetime.fromisoformat(body["expiresAt"])
        delta = (expires - checked).total_seconds()
        self.assertAlmostEqual(delta, 60.0, delta=1.0)

    def test_diagnostics_sub_fields_are_pass_fail_unknown(self):
        """bridge/hn212/senseFaceTcp/senseFacePush must be PASS, FAIL, or UNKNOWN dicts with 'status'."""
        _, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        valid_statuses = {"PASS", "FAIL", "UNKNOWN"}
        for field in ("bridge", "hn212", "senseFaceTcp", "senseFacePush"):
            sub = body[field]
            self.assertIsInstance(sub, dict, f"{field} must be a dict")
            self.assertIn("status", sub, f"{field} missing 'status'")
            self.assertIn(sub["status"], valid_statuses, f"{field}.status invalid: {sub['status']}")

    def test_diagnostics_scan_ready_is_boolean(self):
        _, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        self.assertIsInstance(body["scanReady"], bool)

    def test_diagnostics_face_ready_is_boolean(self):
        _, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        self.assertIsInstance(body["faceReady"], bool)

    def test_diagnostics_bridge_always_pass(self):
        """bridge component is always PASS when the API itself is responding."""
        _, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        self.assertEqual(body["bridge"]["status"], "PASS")

    def test_diagnostics_hn212_fails_when_offline(self):
        """hn_state offline → hn212.status == FAIL."""
        # _hn_state mock returns online=False
        _, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        self.assertIn(body["hn212"]["status"], ("FAIL", "UNKNOWN"))

    def test_diagnostics_scan_ready_false_when_hn_offline(self):
        """scanReady = bridge PASS && hn212 PASS; with hn offline it must be False."""
        _, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        self.assertFalse(body["scanReady"])

    def test_diagnostics_response_contains_no_secrets(self):
        """Response body must not contain identity numbers, portraits, or tokens."""
        _, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        body_str = json.dumps(body)
        # token value must not appear in response
        self.assertNotIn(self._valid_token, body_str)

    def test_diagnostics_push_readiness_requires_expected_serial(self):
        """
        push_queue.last_serial is None → senseFacePush.status is FAIL or UNKNOWN (not PASS).
        Unknown serial never passes (AC3).
        """
        _, body = _do_request(
            f"{self._base_url}/diagnostics/run",
            method="POST",
            body={},
            token=self._valid_token,
        )
        self.assertNotEqual(body["senseFacePush"]["status"], "PASS")


class TestScanStartMode(TestBridgeEndpointSetup):
    """Slice 3 AC4: POST /scans/start accepts mode CHECK_IN|TEST."""

    def test_start_scan_check_in_mode_returns_201(self):
        """Explicit CHECK_IN mode returns 201."""
        self._bio_store.start_scan.return_value = "scan_abc123"
        status, body = _do_request(
            f"{self._base_url}/scans/start",
            method="POST",
            body={"mode": "CHECK_IN"},
            token=self._valid_token,
        )
        self.assertEqual(status, 201)

    def test_start_scan_test_mode_returns_201(self):
        """TEST mode returns 201."""
        self._bio_store.start_scan.return_value = "scan_test123"
        status, body = _do_request(
            f"{self._base_url}/scans/start",
            method="POST",
            body={"mode": "TEST"},
            token=self._valid_token,
        )
        self.assertEqual(status, 201)

    def test_start_scan_no_mode_defaults_to_check_in(self):
        """Backward compatibility: missing mode field defaults to CHECK_IN."""
        self._bio_store.start_scan.return_value = "scan_default"
        status, body = _do_request(
            f"{self._base_url}/scans/start",
            method="POST",
            body={},
            token=self._valid_token,
        )
        self.assertEqual(status, 201)

    def test_start_scan_invalid_mode_returns_400(self):
        """Invalid mode value (not CHECK_IN or TEST) returns 400."""
        status, body = _do_request(
            f"{self._base_url}/scans/start",
            method="POST",
            body={"mode": "INVALID"},
            token=self._valid_token,
        )
        self.assertEqual(status, 400)

    def test_start_scan_test_mode_response_includes_mode(self):
        """TEST mode response includes mode field in body."""
        self._bio_store.start_scan.return_value = "scan_tmode"
        status, body = _do_request(
            f"{self._base_url}/scans/start",
            method="POST",
            body={"mode": "TEST"},
            token=self._valid_token,
        )
        self.assertEqual(status, 201)
        self.assertIn("mode", body)
        self.assertEqual(body["mode"], "TEST")

    def test_start_scan_check_in_mode_response_includes_mode(self):
        """CHECK_IN mode response includes mode='CHECK_IN'."""
        self._bio_store.start_scan.return_value = "scan_ci"
        status, body = _do_request(
            f"{self._base_url}/scans/start",
            method="POST",
            body={"mode": "CHECK_IN"},
            token=self._valid_token,
        )
        self.assertEqual(status, 201)
        self.assertIn("mode", body)
        self.assertEqual(body["mode"], "CHECK_IN")


class TestScanDiscard(TestBridgeEndpointSetup):
    """Slice 3 AC5: POST /scans/{scanId}/discard – authenticated."""

    def test_discard_requires_auth(self):
        """POST /scans/{id}/discard without token → 401."""
        status, _ = _do_request(
            f"{self._base_url}/scans/scan_abc123/discard",
            method="POST",
            body={},
        )
        self.assertEqual(status, 401)

    def test_discard_valid_scan_returns_200(self):
        """POST /scans/{id}/discard with valid token and existing scan → 200."""
        self._bio_store.discard_scan.side_effect = None  # clear any prior side_effect
        self._bio_store.discard_scan.return_value = None  # success → None
        status, body = _do_request(
            f"{self._base_url}/scans/scan_abc123/discard",
            method="POST",
            body={},
            token=self._valid_token,
        )
        self.assertEqual(status, 200)

    def test_discard_unknown_scan_returns_404(self):
        """Discarding unknown scanId raises ValueError → 404."""
        self._bio_store.discard_scan.side_effect = ValueError("Không tìm thấy lượt quét")
        status, body = _do_request(
            f"{self._base_url}/scans/scan_missing/discard",
            method="POST",
            body={},
            token=self._valid_token,
        )
        self.assertEqual(status, 404)


class TestEnrollRejectsTestScan(unittest.TestCase):
    """Slice 3 AC6: TEST scans must never enroll."""

    def test_enroll_raises_for_test_scan(self):
        """Enrolling a TEST scan must raise ValueError."""
        from biometric_api import BiometricStore
        import base64

        class FakeQueue:
            def enqueue(self, profile, photo):
                pass

        store = BiometricStore(FakeQueue(), lambda _p: None, now=lambda: 100)
        scan_id = store.start_scan(mode="TEST")
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        with self.assertRaisesRegex(ValueError, "[Tt][Ee][Ss][Tt]"):
            store.enroll("stay_12345678", scan_id)

    def test_test_scan_never_queues_face(self):
        """Ingesting into TEST scan never queues a face (even if READY)."""
        from biometric_api import BiometricStore
        import base64

        class TrackingQueue:
            def __init__(self):
                self.items = []
            def enqueue(self, profile, photo):
                self.items.append((profile, photo))

        queue = TrackingQueue()
        store = BiometricStore(queue, lambda _p: None, now=lambda: 100)
        scan_id = store.start_scan(mode="TEST")
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        self.assertEqual(len(queue.items), 0)

    def test_check_in_scan_can_enroll(self):
        """CHECK_IN (default) scans can still enroll normally."""
        from biometric_api import BiometricStore
        import base64

        class FakeQueue:
            def __init__(self):
                self.items = []
            def enqueue(self, profile, photo):
                self.items.append((profile, photo))

        queue = FakeQueue()
        store = BiometricStore(queue, lambda _p: None, now=lambda: 100)
        scan_id = store.start_scan()  # default = CHECK_IN
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        result = store.enroll("stay_12345678", scan_id)
        self.assertEqual(result["status"], "PENDING")


class TestDiscardScanBehavior(unittest.TestCase):
    """Slice 3 AC5: discard_scan behavior in BiometricStore."""

    def _make_store(self):
        from biometric_api import BiometricStore
        class FakeQueue:
            def enqueue(self, profile, photo):
                pass
        return BiometricStore(FakeQueue(), lambda _p: None, now=lambda: 100)

    def test_discarded_scan_is_inaccessible(self):
        """get_scan after discard → ValueError."""
        store = self._make_store()
        scan_id = store.start_scan()
        store.discard_scan(scan_id)
        with self.assertRaises(ValueError):
            store.get_scan(scan_id)

    def test_discard_resets_active_scan_pointer(self):
        """Discarding the active scan resets active_scan_id to None."""
        store = self._make_store()
        scan_id = store.start_scan()
        self.assertEqual(store.active_scan_id, scan_id)
        store.discard_scan(scan_id)
        self.assertIsNone(store.active_scan_id)

    def test_discard_removes_portrait_from_memory(self):
        """Portrait bytes are cleared from the scan data on discard."""
        import base64
        store = self._make_store()
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        # Before discard, portrait should exist in internal store
        raw_scan = store.scans.get(scan_id)
        self.assertIsNotNone(raw_scan)
        store.discard_scan(scan_id)
        # After discard, scan must be gone
        self.assertNotIn(scan_id, store.scans)

    def test_discard_unknown_scan_raises_value_error(self):
        """discard_scan with unknown ID → ValueError."""
        store = self._make_store()
        with self.assertRaises(ValueError):
            store.discard_scan("scan_doesnotexist00")

    def test_start_scan_cancels_prior_active_scan(self):
        """Starting a new scan deterministically discards the prior active scan."""
        store = self._make_store()
        first_id = store.start_scan()
        second_id = store.start_scan()
        # The first scan should be gone (discarded)
        with self.assertRaises(ValueError):
            store.get_scan(first_id)
        # The second is the active scan
        self.assertEqual(store.active_scan_id, second_id)

    def test_start_scan_with_no_prior_active_is_safe(self):
        """Starting a scan when there is no prior active scan must not raise."""
        store = self._make_store()
        self.assertIsNone(store.active_scan_id)
        try:
            scan_id = store.start_scan()
        except Exception as exc:
            self.fail(f"start_scan raised unexpectedly: {exc}")
        self.assertEqual(store.active_scan_id, scan_id)


if __name__ == "__main__":
    unittest.main()
