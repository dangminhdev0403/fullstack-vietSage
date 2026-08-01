import argparse
import hmac
import json
import os
import secrets
import ssl
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from biometric_api import BiometricStore
from hn212_client import Hn212Client, LocalState
from push_receiver import PushQueue, make_handler as make_push_handler, make_tls_context
from zkteco_bridge import DeviceState, EventStore, device_worker, provision_user

# Fixed freshness window for diagnostics (AC1).
_DIAG_FRESHNESS_S = 60

# How long a PUSH heartbeat from the expected serial is considered fresh (AC3).
_PUSH_FRESHNESS_S = 60


# ---------------------------------------------------------------------------
# Pairing store
# ---------------------------------------------------------------------------

class PairingStore:
    """
    Operator-issued single-use pairing codes and session tokens.

    Security properties:
      - Codes are single-use and expire after ttl_seconds.
      - Comparison is constant-time (hmac.compare_digest).
      - Session tokens are bounded (32–256 chars) and expire independently.
    """

    def __init__(self):
        self._lock = threading.Lock()
        # {code: {"expires_at": float}}
        self._pending_codes: dict = {}
        # {token: {"expires_at": float}}
        self._sessions: dict = {}

    def issue_code(self, ttl_seconds: int = 300) -> str:
        """Generate and store a new single-use pairing code."""
        code = secrets.token_urlsafe(32)
        expires_at = time.monotonic() + ttl_seconds
        with self._lock:
            self._pending_codes[code] = {"expires_at": expires_at}
        return code

    def redeem(self, code: str, session_ttl_seconds: int = 86400) -> str | None:
        """
        Validate *code* with constant-time compare; if valid issue a session token.

        Returns the session token, or None if the code is invalid/expired/already used.
        """
        now = time.monotonic()
        with self._lock:
            # Build a canonical list for constant-time scan.
            found_code = None
            for stored_code, meta in list(self._pending_codes.items()):
                if hmac.compare_digest(stored_code, code):
                    found_code = stored_code
                    expires_at = meta["expires_at"]
                    break

            if found_code is None:
                return None
            if now >= expires_at:
                del self._pending_codes[found_code]
                return None
            # Single-use: remove immediately.
            del self._pending_codes[found_code]

        # Issue session token outside the lock.
        token = secrets.token_urlsafe(48)  # 64-char URL-safe string < 256 chars
        session_expires = time.monotonic() + session_ttl_seconds
        with self._lock:
            self._sessions[token] = {"expires_at": session_expires}
        return token

    def validate_token(self, token: str) -> bool:
        """Return True if *token* is valid and not expired."""
        if not token:
            return False
        now = time.monotonic()
        with self._lock:
            for stored_token, meta in self._sessions.items():
                if hmac.compare_digest(stored_token, token):
                    return now < meta["expires_at"]
        return False


# ---------------------------------------------------------------------------
# Diagnostics helper
# ---------------------------------------------------------------------------

def _run_diagnostics(device_state, hn_state, push_queue, expected_serial=None, now=None):
    """
    Collect component readiness and return a diagnostics dict.

    AC1: bridge/hn212/senseFaceTcp/senseFacePush each has 'status': PASS|FAIL|UNKNOWN.
    AC2: hn212 readiness requires connected WebSocket + recent valid reader state.
    AC3: senseFacePush requires last_serial == expected_serial within 60 s.

    Parameters
    ----------
    device_state:    DeviceState instance.
    hn_state:        LocalState instance.
    push_queue:      PushQueue instance.
    expected_serial: The only serial number that counts as PASS for PUSH.
                     If None, PUSH is always FAIL (unknown serial never passes).
    now:             Callable returning current Unix timestamp (injectable for tests).
    """
    if now is None:
        now = time.time
    ts = now()
    checked_at = datetime.fromtimestamp(ts, timezone.utc).isoformat()
    expires_at = datetime.fromtimestamp(ts + _DIAG_FRESHNESS_S, timezone.utc).isoformat()

    # --- bridge: always PASS (if we can reply, bridge is up) ---
    bridge = {"status": "PASS"}

    # --- hn212: requires online + recent valid reader message ---
    try:
        hn_ready = hn_state.has_valid_reader_state()
        hn_data = hn_state.get()
        if hn_ready:
            hn212 = {"status": "PASS"}
        elif hn_data.get("online"):
            # Connected but no valid reader data yet.
            hn212 = {"status": "FAIL", "reason": "Kết nối nhưng chưa có dữ liệu đọc hợp lệ"}
        else:
            hn212 = {"status": "FAIL", "reason": hn_data.get("error") or "Chưa kết nối"}
    except Exception as exc:
        hn212 = {"status": "UNKNOWN", "reason": str(exc)[:120]}

    # --- senseFaceTcp: requires online + serial ---
    try:
        dev = device_state.get()
        if dev.get("online") and dev.get("serial"):
            sense_tcp = {"status": "PASS"}
        elif dev.get("online"):
            sense_tcp = {"status": "FAIL", "reason": "Kết nối TCP nhưng không lấy được số serial"}
        else:
            sense_tcp = {"status": "FAIL", "reason": dev.get("error") or "Chưa kết nối TCP"}
    except Exception as exc:
        sense_tcp = {"status": "UNKNOWN", "reason": str(exc)[:120]}

    # --- senseFacePush: expected serial seen within 60 s ---
    # AC3: unknown serial never passes; expected_serial=None → always FAIL.
    try:
        last_serial = push_queue.last_serial
        last_seen = push_queue.last_seen
        if expected_serial is None:
            sense_push = {"status": "FAIL", "reason": "Chưa cấu hình số serial mong đợi"}
        elif last_serial is None or last_seen is None:
            sense_push = {"status": "FAIL", "reason": "Chưa nhận PUSH heartbeat"}
        elif last_serial != expected_serial:
            # AC7: never log the serial value – just indicate mismatch.
            sense_push = {"status": "FAIL", "reason": "Serial không khớp với thiết bị mong đợi"}
        elif ts - last_seen > _PUSH_FRESHNESS_S:
            sense_push = {"status": "FAIL", "reason": f"PUSH heartbeat cũ hơn {_PUSH_FRESHNESS_S}s"}
        else:
            sense_push = {"status": "PASS"}
    except Exception as exc:
        sense_push = {"status": "UNKNOWN", "reason": str(exc)[:120]}

    # --- Composite readiness ---
    scan_ready = bridge["status"] == "PASS" and hn212["status"] == "PASS"
    face_ready = scan_ready and sense_tcp["status"] == "PASS" and sense_push["status"] == "PASS"

    return {
        "checkedAt": checked_at,
        "expiresAt": expires_at,
        "bridge": bridge,
        "hn212": hn212,
        "senseFaceTcp": sense_tcp,
        "senseFacePush": sense_push,
        "scanReady": scan_ready,
        "faceReady": face_ready,
    }


# ---------------------------------------------------------------------------
# CORS / auth helpers captured in make_api_handler closure
# ---------------------------------------------------------------------------

_LOOPBACK_HOSTS = frozenset(("127.0.0.1", "::1", "localhost"))

_PUBLIC_GET_PATHS = frozenset(("/health", "/settings"))
_PUBLIC_POST_PATHS = frozenset(("/pair",))

_VALID_SCAN_MODES = frozenset(("CHECK_IN", "TEST"))


def make_api_handler(
    store,
    device_state,
    hn_state,
    push_queue,
    allowed_origins,
    *,
    settings_store=None,
    secret_store=None,
    pairing_store=None,
    expected_serial=None,
):
    """
    Build the HTTP request handler class.

    Parameters
    ----------
    store, device_state, hn_state, push_queue, allowed_origins:
        Same as before (Slice 1 interface).
    settings_store:    LocalSettingsStore instance (optional; enables /settings).
    secret_store:      DpapiSecretStore instance (optional; enables communicationKey).
    pairing_store:     PairingStore instance (optional; enables /pair).
    expected_serial:   The only PUSH serial that counts as PASS in diagnostics (AC3).
    """
    allowed_origins = frozenset(allowed_origins)

    class Handler(BaseHTTPRequestHandler):
        server_version = "VietSageBiometricBridge/1.0"

        # ------------------------------------------------------------------
        # Helpers
        # ------------------------------------------------------------------

        def _origin(self):
            return self.headers.get("Origin")

        def _cors_allowed(self):
            origin = self._origin()
            return not origin or origin in allowed_origins

        def _reply(self, payload, status=200):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            origin = self._origin()
            if origin in allowed_origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.end_headers()
            self.wfile.write(body)

        def _json(self):
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 1_000_000:
                # Drain only a bounded near-limit body so Windows can deliver the
                # JSON error instead of resetting a connection with unread data.
                if 0 < length <= 2_000_000:
                    self.rfile.read(length)
                else:
                    self.close_connection = True
                raise ValueError("Payload không hợp lệ")
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict):
                raise ValueError("Payload phải là object")
            return value

        def _bearer_token(self) -> str | None:
            """Extract Bearer token from Authorization header, or None."""
            auth = self.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                return auth[7:]
            return None

        def _require_auth(self) -> bool:
            """
            Check Bearer token.  Returns True if authorised, else sends 401 and returns False.
            Never echoes the token back.
            """
            if pairing_store is None:
                # No pairing store configured; deny all protected requests.
                self._reply({"error": "Chưa cấu hình xác thực"}, 401)
                return False
            token = self._bearer_token()
            if not token or not pairing_store.validate_token(token):
                self._reply({"error": "Không được phép"}, 401)
                return False
            return True

        def _is_loopback(self) -> bool:
            """Return True if the connection came from a loopback address."""
            client_host = self.client_address[0]
            return client_host in _LOOPBACK_HOSTS

        # ------------------------------------------------------------------
        # HTTP verbs
        # ------------------------------------------------------------------

        def do_OPTIONS(self):
            if not self._cors_allowed():
                return self._reply({"error": "Origin không được phép"}, 403)
            self.send_response(204)
            origin = self._origin()
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Access-Control-Max-Age", "600")
            self.end_headers()

        def do_GET(self):
            if not self._cors_allowed():
                return self._reply({"error": "Origin không được phép"}, 403)
            path = urlparse(self.path).path
            try:
                # ---- Public endpoints (no auth) ----
                if path == "/health":
                    device = device_state.get()
                    last_push = push_queue.last_seen
                    sense_ready = bool(device.get("online")) and bool(last_push and time.time() - last_push < 120)
                    return self._reply({
                        "bridge": {"status": "online", "version": "1.0"},
                        "hn212": {"status": "online" if hn_state.get().get("online") else "offline", **hn_state.get()},
                        "senseFace": {
                            "status": "online" if sense_ready else "offline",
                            "tcp4370": bool(device.get("online")),
                            "push18081": bool(last_push and time.time() - last_push < 120),
                            "serialConfigured": bool(push_queue.last_serial or device.get("serial")),
                            "lastPushSeenAt": datetime.fromtimestamp(last_push, timezone.utc).isoformat() if last_push else None,
                            "error": None if sense_ready else device.get("error") or "Chưa thấy PUSH gần đây",
                        },
                    })

                if path == "/settings":
                    # Public: returns only communicationKeyConfigured (no secret value).
                    configured = secret_store.is_configured if secret_store else False
                    return self._reply({"communicationKeyConfigured": configured})

                # ---- Protected GET endpoints (require auth) ----
                if not self._require_auth():
                    return

                if path.startswith("/scans/"):
                    return self._reply(store.get_scan(path.rsplit("/", 1)[-1]))
                if path.startswith("/enrollments/"):
                    return self._reply(store.get_enrollment(path.rsplit("/", 1)[-1]))
                return self._reply({"error": "Not found"}, 404)
            except ValueError as error:
                return self._reply({"error": str(error)}, 404)

        def do_PUT(self):
            if not self._cors_allowed():
                return self._reply({"error": "Origin không được phép"}, 403)
            path = urlparse(self.path).path

            if path == "/settings":
                # Requires authentication.
                if not self._require_auth():
                    return
                try:
                    raw = self._json()
                except ValueError as exc:
                    return self._reply({"error": str(exc)}, 400)

                if settings_store is None:
                    return self._reply({"error": "Settings store not configured"}, 503)

                try:
                    from local_settings import SettingsValidationError
                    settings_store.put(raw)
                except SettingsValidationError as exc:
                    return self._reply({"error": str(exc)}, 422)
                except Exception as exc:
                    return self._reply({"error": str(exc)}, 500)

                # Slice 2: do NOT hot-reconnect; just signal that restart is required.
                return self._reply({"restartRequired": True})

            return self._reply({"error": "Not found"}, 404)

        def do_POST(self):
            if not self._cors_allowed():
                return self._reply({"error": "Origin không được phép"}, 403)
            path = urlparse(self.path).path
            try:
                # ---- Public POST: /pair (loopback only) ----
                if path == "/pair":
                    if not self._is_loopback():
                        return self._reply({"error": "Chỉ cho phép từ loopback"}, 403)
                    if pairing_store is None:
                        return self._reply({"error": "Pairing not configured"}, 503)
                    payload = self._json()
                    code = payload.get("code")
                    if not code or not isinstance(code, str):
                        return self._reply({"error": "Thiếu trường 'code'"}, 400)
                    token = pairing_store.redeem(code)
                    if token is None:
                        return self._reply({"error": "Mã ghép nối không hợp lệ hoặc đã hết hạn"}, 401)
                    return self._reply({"token": token})

                # ---- Protected POST endpoints (require auth) ----
                if not self._require_auth():
                    return

                # AC1: POST /diagnostics/run
                if path == "/diagnostics/run":
                    result = _run_diagnostics(device_state, hn_state, push_queue, expected_serial=expected_serial)
                    return self._reply(result)

                if path == "/scans/start":
                    # AC4: accept optional mode field; default to CHECK_IN for backward compat.
                    payload = {}
                    content_length = int(self.headers.get("Content-Length", "0"))
                    if content_length > 0:
                        try:
                            payload = self._json()
                        except ValueError as exc:
                            return self._reply({"error": str(exc)}, 400)
                    mode = payload.get("mode", "CHECK_IN")
                    if mode not in _VALID_SCAN_MODES:
                        return self._reply({"error": f"Chế độ không hợp lệ: {mode!r}. Phải là CHECK_IN hoặc TEST."}, 400)
                    scan_id = store.start_scan(mode=mode)
                    return self._reply({"scanId": scan_id, "status": "WAITING", "mode": mode}, 201)

                # AC5: POST /scans/{scanId}/discard
                if path.startswith("/scans/") and path.endswith("/discard"):
                    parts = path.split("/")
                    if len(parts) == 4:  # /scans/{scanId}/discard
                        scan_id = parts[2]
                        try:
                            store.discard_scan(scan_id)
                        except ValueError as exc:
                            return self._reply({"error": str(exc)}, 404)
                        return self._reply({"discarded": True})

                if path == "/enrollments":
                    payload = self._json()
                    return self._reply(store.enroll(payload.get("stayId"), payload.get("scanId")), 202)
                if path.startswith("/enrollments/") and path.endswith("/retry"):
                    request_id = path.split("/")[2]
                    return self._reply(store.retry(request_id), 202)
                return self._reply({"error": "Not found"}, 404)
            except (ValueError, json.JSONDecodeError) as error:
                return self._reply({"error": str(error)}, 400)
            except Exception:
                return self._reply({"error": "Thiết bị sinh trắc chưa sẵn sàng"}, 502)

        def log_message(self, fmt, *args):
            # Avoid logging bodies, identities, scan IDs, or enrollment IDs.
            print(f"API {self.command} {urlparse(self.path).path.split('/')[1:2]} {fmt % args}", flush=True)

    return Handler


def main():
    parser = argparse.ArgumentParser(description="VietSage local HN-212 + SenseFace bridge")
    parser.add_argument("--api-listen", default="127.0.0.1")
    parser.add_argument("--api-port", type=int, default=18080)
    parser.add_argument("--api-cert")
    parser.add_argument("--api-key")
    parser.add_argument("--allowed-origin", action="append", default=["http://localhost:3000", "http://127.0.0.1:3000"])
    parser.add_argument("--hn212-url", default="ws://localhost:8000")
    parser.add_argument("--device-ip", default="192.168.55.11")
    parser.add_argument("--device-port", type=int, default=4370)
    parser.add_argument("--push-listen", default="192.168.55.10")
    parser.add_argument("--push-port", type=int, default=18081)
    parser.add_argument("--push-cert", required=True)
    parser.add_argument("--push-key", required=True)
    parser.add_argument("--scan-ttl", type=int, default=1800)
    parser.add_argument("--password", type=int, default=int(os.environ.get("ZK_COMM_KEY", "0")))
    parser.add_argument("--settings-file", default="bridge_settings.json",
                        help="Path to the local non-secret settings JSON file")
    # AC3: expected serial for PUSH diagnostics; no default so PUSH is FAIL until set.
    parser.add_argument("--expected-serial", default=None,
                        help="SenseFace device serial number expected for PUSH readiness")
    args = parser.parse_args()
    if args.api_listen not in ("127.0.0.1", "::1", "localhost"):
        raise SystemExit("API browser-facing chỉ được bind loopback")
    if bool(args.api_cert) != bool(args.api_key):
        raise SystemExit("Cần cả --api-cert và --api-key")

    # Initialise Slice 2 stores (best-effort; unavailable on non-Windows).
    settings_store = None
    secret_store = None
    pairing_store = PairingStore()
    pairing_code = pairing_store.issue_code(ttl_seconds=300)
    # Local operator bootstrap: shown once in this terminal, single-use, expires in 5 minutes.
    print(f"Mã ghép nối: {pairing_code}", flush=True)
    try:
        from local_settings import LocalSettingsStore
        from local_secrets import DpapiSecretStore, SecretStoreUnavailable
        try:
            secret_store = DpapiSecretStore()
        except SecretStoreUnavailable:
            print("DPAPI unavailable (non-Windows); communicationKey protection disabled", flush=True)
        settings_store = LocalSettingsStore(
            os.path.abspath(args.settings_file),
            _secret_store=secret_store,
        )
        try:
            settings_store.load()
        except Exception as exc:
            print(f"Settings load warning: {exc}", flush=True)
    except ImportError:
        pass

    stop = threading.Event()
    events = EventStore()
    device_state = DeviceState(args.device_ip, args.device_port)
    hn_state = LocalState(online=False, lastSeen=None, error="Chưa kết nối")
    holder = {}

    def result(identity, ok, error):
        store = holder.get("store")
        if store:
            store.synced(identity) if ok else store.fail_identity(identity, error)

    push_queue = PushQueue([], face_only=True, on_result=result)
    store = BiometricStore(
        push_queue,
        lambda profile: provision_user(args.device_ip, args.device_port, args.password, profile),
        ttl_seconds=args.scan_ttl,
    )
    holder["store"] = store

    push_server = ThreadingHTTPServer((args.push_listen, args.push_port), make_push_handler(push_queue))
    push_server.socket = make_tls_context(args.push_cert, args.push_key).wrap_socket(push_server.socket, server_side=True)
    api_server = ThreadingHTTPServer(
        (args.api_listen, args.api_port),
        make_api_handler(
            store,
            device_state,
            hn_state,
            push_queue,
            args.allowed_origin,
            settings_store=settings_store,
            secret_store=secret_store,
            pairing_store=pairing_store,
            expected_serial=args.expected_serial,
        ),
    )
    if args.api_cert:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(args.api_cert, args.api_key)
        api_server.socket = context.wrap_socket(api_server.socket, server_side=True)

    threads = [
        threading.Thread(target=push_server.serve_forever, daemon=True),
        threading.Thread(target=device_worker, args=(args.device_ip, args.device_port, args.password, events, device_state, stop), daemon=True),
        threading.Thread(target=Hn212Client(args.hn212_url, store.ingest_active, hn_state, stop).run, daemon=True),
    ]
    for thread in threads:
        thread.start()
    scheme = "https" if args.api_cert else "http"
    print(f"VietSage biometric bridge: {scheme}://{args.api_listen}:{args.api_port}", flush=True)
    try:
        api_server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        api_server.server_close()
        push_server.shutdown()
        push_server.server_close()


if __name__ == "__main__":
    main()
