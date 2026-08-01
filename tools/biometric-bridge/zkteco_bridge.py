import argparse
import base64
import json
import os
import queue
import shutil
import threading
import time
from collections import deque
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from push_receiver import PushQueue, make_handler as make_push_handler, make_tls_context

import re

ROOT = Path(__file__).resolve().parent

# AC6: process-level lock to serialize provision_user UID allocation
_provision_lock = threading.Lock()


def persist_portrait(profile, root=ROOT):
    saved = dict(profile)
    id_code = str(saved.get("idCode", "")).strip()
    photo = saved.pop("photo", "")
    # AC5: validate idCode is exactly 9-12 digits before using as path segment
    if not re.fullmatch(r"\d{9,12}", id_code):
        raise ValueError("Số định danh không hợp lệ hoặc thiếu")
    if not photo:
        raise ValueError("Thiếu số định danh hoặc ảnh CCCD")
    try:
        _, encoded = photo.split(",", 1)
        image = base64.b64decode(encoded, validate=True)
    except Exception as error:
        raise ValueError("Ảnh CCCD không hợp lệ") from error
    relative = Path("data") / "portraits" / id_code / "cccd.jpg"
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(image)
    (root / "data" / "fingerprints" / id_code).mkdir(parents=True, exist_ok=True)
    saved["portraitPath"] = relative.as_posix()
    return saved


def persist_biometric_capture(id_code, kind, data_url, root=ROOT, stamp=None):
    if kind not in ("fingerprints", "live-faces"):
        raise ValueError("Loại dữ liệu sinh trắc học không hợp lệ")
    # AC5: validate idCode is exactly 9-12 digits before using as path segment
    if not re.fullmatch(r"\d{9,12}", str(id_code).strip()):
        raise ValueError("Số định danh không hợp lệ")
    if not str(data_url).startswith("data:image/"):
        raise ValueError("Thiếu ID hoặc dữ liệu ảnh")
    header, encoded = data_url.split(",", 1)
    extension = "png" if "png" in header else "jpg"
    stamp = stamp or datetime.now().strftime("%Y%m%dT%H%M%S%f")
    relative = Path("data") / kind / str(id_code).strip() / f"{stamp}.{extension}"
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(base64.b64decode(encoded))
    return relative.as_posix()


def resolve_display_name(user_id, profile, device_users):
    return (profile or {}).get("personName") or device_users.get(str(user_id)) or f"User {user_id}"


def normalize_attendance(attendance, device_ip):
    timestamp = attendance.timestamp
    return {
        "userId": str(attendance.user_id),
        "timestamp": timestamp.isoformat(timespec="seconds") if isinstance(timestamp, datetime) else str(timestamp),
        "statusCode": attendance.status,
        "punchCode": attendance.punch,
        "deviceIp": device_ip,
        "result": "success",
        # Verified against this SenseFace 7A firmware's real attendance log.
        "method": {1: "fingerprint", 15: "face"}.get(attendance.status, "unknown"),
    }


class ProfileStore:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.Lock()
        self.profiles = {}
        if self.path.exists():
            for profile in json.loads(self.path.read_text(encoding="utf-8")):
                self.profiles[profile["idCode"]] = profile

    def create(self, profile):
        id_code = str(profile.get("idCode", "")).strip()
        if not id_code:
            raise ValueError("Thiếu số định danh")
        with self.lock:
            if id_code in self.profiles:
                raise ValueError("Số định danh đã tồn tại")
            saved = persist_portrait(dict(profile, biometricUserId=id_code, savedAt=datetime.now().isoformat(timespec="seconds")), self.path.parent)
            self.profiles[id_code] = saved
            self._write()
            return saved

    def get(self, id_code):
        with self.lock:
            profile = self.profiles.get(str(id_code))
            return dict(profile) if profile else None

    def list(self):
        with self.lock:
            return list(reversed(list(self.profiles.values())))

    def clear(self):
        with self.lock:
            id_codes = tuple(self.profiles)
            self.profiles.clear()
            self._write()
        for id_code in id_codes:
            shutil.rmtree(self.path.parent / "data" / "portraits" / id_code, ignore_errors=True)
            shutil.rmtree(self.path.parent / "data" / "fingerprints" / id_code, ignore_errors=True)

    def _write(self):
        self.path.write_text(json.dumps(list(self.profiles.values()), ensure_ascii=False, indent=2), encoding="utf-8")


class EventStore:
    def __init__(self, limit=200, profile_lookup=None):
        self.events = deque(maxlen=limit)
        self.keys = set()
        self.subscribers = set()
        self.lock = threading.Lock()
        self.profile_lookup = profile_lookup or (lambda _user_id: None)

    @staticmethod
    def key(event):
        return (event.get("userId"), event.get("timestamp"), event.get("statusCode"), event.get("punchCode"))

    def add(self, event):
        event = dict(event)
        profile = self.profile_lookup(event.get("userId"))
        if profile:
            event["profile"] = profile
        key = self.key(event)
        with self.lock:
            if key in self.keys:
                return False
            if len(self.events) == self.events.maxlen and self.events:
                self.keys.discard(self.key(self.events[0]))
            self.events.append(event)
            self.keys.add(key)
            subscribers = tuple(self.subscribers)
        for subscriber in subscribers:
            subscriber.put(event)
        return True

    def list(self):
        with self.lock:
            return list(reversed(self.events))

    def clear(self):
        with self.lock:
            count = len(self.events)
            self.events.clear()
            self.keys.clear()
        return count

    def subscribe(self):
        subscriber = queue.Queue()
        with self.lock:
            self.subscribers.add(subscriber)
        return subscriber

    def unsubscribe(self, subscriber):
        with self.lock:
            self.subscribers.discard(subscriber)


class DeviceState:
    def __init__(self, ip, port):
        self.data = {"online": False, "ip": ip, "port": port, "serial": None, "lastSeen": None, "error": "Chưa kết nối"}
        self.lock = threading.Lock()

    def update(self, **values):
        with self.lock:
            self.data.update(values)

    def get(self):
        with self.lock:
            return dict(self.data)


def device_worker(ip, port, password, store, state, stop):
    from zk import ZK
    while not stop.is_set():
        connection = None
        try:
            connection = ZK(ip, port=port, timeout=5, password=password, force_udp=False, ommit_ping=False).connect()
            serial = None
            try:
                serial = connection.get_serialnumber()
            except Exception:
                pass
            device_users = {str(user.user_id): user.name for user in connection.get_users()}
            state.update(online=True, serial=serial, users=device_users, lastSeen=datetime.now().isoformat(timespec="seconds"), error=None)
            seen = {store.key(normalize_attendance(item, ip)) for item in connection.get_attendance()}
            while not stop.wait(2):
                for attendance in connection.get_attendance():
                    event = normalize_attendance(attendance, ip)
                    key = store.key(event)
                    if key in seen:
                        continue
                    seen.add(key)
                    event["deviceName"] = device_users.get(event["userId"])
                    store.add(event)
                state.update(online=True, lastSeen=datetime.now().isoformat(timespec="seconds"), error=None)
        except Exception as error:
            state.update(online=False, error=str(error), lastSeen=datetime.now().isoformat(timespec="seconds"))
            stop.wait(3)
        finally:
            if connection:
                try:
                    connection.disconnect()
                except Exception:
                    pass


def provision_user(ip, port, password, profile):
    from zk import ZK
    user_id = str(profile.get("biometricUserId", "")).strip()
    if not re.fullmatch(r"\d{9,12}", user_id):
        raise ValueError("Số định danh không hợp lệ")
    # AC6: serialize UID allocation so concurrent calls do not pick the same uid
    with _provision_lock:
        connection = ZK(ip, port=port, timeout=5, password=password).connect()
        try:
            users = connection.get_users()
            existing = next((user for user in users if str(user.user_id) == user_id), None)
            uid = existing.uid if existing else max((user.uid for user in users), default=0) + 1
            connection.set_user(uid=uid, name=str(profile.get("personName", ""))[:24], user_id=user_id)
        finally:
            connection.disconnect()


def clear_device_attendance(ip, port, password):
    from zk import ZK
    connection = ZK(ip, port=port, timeout=5, password=password).connect()
    try:
        count = len(connection.get_attendance())
        connection.clear_attendance()
        return count
    finally:
        connection.disconnect()


def save_profile(profiles, payload, target, provision):
    device_profile = dict(payload, biometricUserId=str(payload.get("idCode", "")).strip())
    if target == "senseface":
        provision(device_profile)
        return dict(device_profile, saveTarget=target)
    profile = profiles.create(payload)
    if target == "both":
        provision(dict(profile, biometricUserId=profile["idCode"]))
    return dict(profile, saveTarget=target)


def make_handler(store, profiles, state, device_config, push_queue=None):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def send_json(self, payload, status=200):
            body = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/api/device":
                return self.send_json(state.get())
            if path == "/api/events":
                return self.send_json(store.list())
            if path == "/api/profiles":
                return self.send_json(profiles.list())
            if path == "/api/events/stream":
                return self.stream_events()
            return super().do_GET()

        def read_json(self):
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 1024 * 1024:
                raise ValueError("Payload không hợp lệ")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Payload phải là object")
            return payload

        def do_POST(self):
            path = urlparse(self.path).path
            if path == "/api/biometric-captures":
                try:
                    payload = self.read_json()
                    id_code = str(payload.get("idCode", "")).strip()
                    if not profiles.get(id_code):
                        raise ValueError("Hồ sơ chưa lưu trên PC")
                    relative = persist_biometric_capture(id_code, payload.get("kind"), payload.get("data", ""))
                    return self.send_json({"path": relative, "storage": "pc-only"}, 201)
                except ValueError as error:
                    return self.send_json({"error": str(error)}, 400)
            if path == "/api/profiles":
                try:
                    payload = self.read_json()
                    target = payload.pop("saveTarget", "both")
                    if target not in ("pc", "senseface", "both"):
                        raise ValueError("Đích lưu không hợp lệ")
                    saved = save_profile(
                        profiles,
                        payload,
                        target,
                        lambda profile: provision_user(*device_config, profile),
                    )
                    if target == "both" and push_queue:
                        profile = profiles.get(saved["idCode"])
                        photo = (profiles.path.parent / profile["portraitPath"]).read_bytes()
                        push_queue.enqueue(profile, photo)
                    return self.send_json(dict(saved, faceQueued=target == "both"), 201)
                except ValueError as error:
                    return self.send_json({"error": str(error)}, 409)
                except Exception as error:
                    return self.send_json({"error": f"Lưu chưa hoàn tất: {error}"}, 502)
            if path != "/api/mock-event":
                return self.send_json({"error": "Not found"}, 404)
            device = state.get()
            user_id = next(iter(device.get("users", {})), "TEST-01")
            event = {"userId": user_id, "deviceName": device.get("users", {}).get(user_id), "timestamp": datetime.now().isoformat(timespec="seconds"), "statusCode": 1, "punchCode": 15, "deviceIp": device["ip"], "result": "success", "method": "unknown"}
            store.add(event)
            self.send_json(event, 201)

        def do_DELETE(self):
            path = urlparse(self.path).path
            if path == "/api/device/events":
                try:
                    count = clear_device_attendance(*device_config)
                    return self.send_json({"deleted": count, "scope": "senseface-attendance-only"})
                except Exception as error:
                    return self.send_json({"error": str(error)}, 502)
            if path == "/api/events":
                return self.send_json({"deleted": store.clear(), "scope": "pc-session-only"})
            if path == "/api/profiles":
                profiles.clear()
                return self.send_json({"deleted": "pc-only"})
            self.send_json({"error": "Not found"}, 404)

        def stream_events(self):
            subscriber = store.subscribe()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                self.wfile.write(b": connected\n\n")
                self.wfile.flush()
                while True:
                    try:
                        event = subscriber.get(timeout=15)
                        payload = json.dumps(event, ensure_ascii=False).encode()
                        self.wfile.write(b"data: " + payload + b"\n\n")
                    except queue.Empty:
                        self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                store.unsubscribe(subscriber)

        def log_message(self, format, *args):
            print(f"[{self.log_date_time_string()}] {format % args}")

    return Handler


def main():
    parser = argparse.ArgumentParser(description="SenseFace 7A local bridge")
    parser.add_argument("--device-ip", default="192.168.55.11")
    parser.add_argument("--device-port", type=int, default=4370)
    parser.add_argument("--password", type=int, default=int(os.environ.get("ZK_COMM_KEY", "0")), help="Communication key; prefer local ZK_COMM_KEY environment variable")
    parser.add_argument("--listen", default="127.0.0.1")
    parser.add_argument("--http-port", type=int, default=8080)
    parser.add_argument("--push-listen", default="192.168.55.10")
    parser.add_argument("--push-port", type=int, default=18081)
    parser.add_argument("--no-device", action="store_true", help="Run UI/API without connecting hardware")
    args = parser.parse_args()
    profiles = ProfileStore(ROOT / "profiles.json")
    store = EventStore(profile_lookup=profiles.get)
    state, stop = DeviceState(args.device_ip, args.device_port), threading.Event()
    push_queue = PushQueue([], face_only=True)
    push_server = ThreadingHTTPServer((args.push_listen, args.push_port), make_push_handler(push_queue))
    push_server.socket = make_tls_context(ROOT / ".runtime/push.crt", ROOT / ".runtime/push.key").wrap_socket(push_server.socket, server_side=True)
    threading.Thread(target=push_server.serve_forever, daemon=True).start()
    if not args.no_device:
        threading.Thread(target=device_worker, args=(args.device_ip, args.device_port, args.password, store, state, stop), daemon=True).start()
    server = ThreadingHTTPServer((args.listen, args.http_port), make_handler(store, profiles, state, (args.device_ip, args.device_port, args.password), push_queue))
    print(f"SenseFace bridge: http://{args.listen}:{args.http_port}/device.html")
    print(f"SenseFace PUSH: https://{args.push_listen}:{args.push_port} (queue after Save only)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        push_server.shutdown()
        push_server.server_close()
        server.server_close()


if __name__ == "__main__":
    main()
