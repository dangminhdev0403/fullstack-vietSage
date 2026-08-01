import argparse
import base64
import json
import re
import ssl
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent


def validate_pin(value):
    pin = str(value or "").strip()
    if not re.fullmatch(r"\d{9,12}", pin):
        raise ValueError("Số định danh không hợp lệ")
    return pin


def make_tls_context(cert, key):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    return context


def load_profiles(root=ROOT):
    root = Path(root).resolve()
    profiles = json.loads((root / "profiles.json").read_text(encoding="utf-8"))
    loaded = []
    for profile in profiles:
        if not profile.get("idCode") or not profile.get("portraitPath"):
            continue
        validate_pin(profile["idCode"])
        portrait = (root / profile["portraitPath"]).resolve()
        try:
            portrait.relative_to(root)
        except ValueError as error:
            raise ValueError("Đường dẫn ảnh không hợp lệ") from error
        loaded.append((profile, portrait.read_bytes()))
    return loaded


def build_user_command(cmd_id, profile):
    pin = validate_pin(profile["idCode"])
    name = str(profile.get("personName", "")).replace("\t", " ").replace("\r", " ").replace("\n", " ")[:24]
    return f"C:{cmd_id}:DATA UPDATE user CardNo=\tPin={pin}\tPassword=\tGroup=0\tStartTime=0\tEndTime=0\tName={name}\tPrivilege=0\tDisable=0"


def build_biophoto_command(cmd_id, pin, photo):
    pin = validate_pin(pin)
    encoded = base64.b64encode(photo).decode("ascii")
    return f"C:{cmd_id}:DATA UPDATE biophoto PIN={pin}\tType=9\tNo=0\tIndex=0\tSize={len(encoded)}\tContent={encoded}\tFormat=0\tPostBackTmpFlag=1"


def upload_response(path, query):
    if path == "/iclock/fdata":
        return "OK"
    table = query.get("tablename", [""])[0]
    count = query.get("count", ["1"])[0]
    return f"{table}={count}" if table else "OK"


class PushQueue:
    def __init__(self, profiles, face_only=False, on_result=None):
        self.profiles = list(profiles)
        self.face_only = face_only
        self.states = {}
        self.next_id = 1
        self.lock = threading.Lock()
        self.on_result = on_result
        self.last_seen = None
        self.last_serial = None

    def enqueue(self, profile, photo):
        with self.lock:
            self.profiles.append((dict(profile), bytes(photo)))
            # AC3: do NOT clear existing device errors; each device manages its own
            # error state independently of the profile queue.

    def _state(self, sn):
        return self.states.setdefault(sn, {"index": 0, "stage": "face" if self.face_only else "user", "outstanding": None, "done": 0, "error": None})

    def next_command(self, sn):
        with self.lock:
            state = self._state(sn)
            if state["outstanding"] or state["error"] or state["index"] >= len(self.profiles):
                return None
            profile, photo = self.profiles[state["index"]]
            cmd_id = self.next_id
            self.next_id += 1
            if state["stage"] == "user":
                command = build_user_command(cmd_id, profile)
            else:
                command = build_biophoto_command(cmd_id, profile["idCode"], photo)
            state["outstanding"] = {"id": cmd_id, "stage": state["stage"], "pin": profile["idCode"]}
            return command

    def ack(self, sn, body):
        with self.lock:
            state = self._state(sn)
            pending = state["outstanding"]
            match = re.search(r"(?:Return|return)=(-?\d+)", body)
            command_id = re.search(r"(?:^|[&\s])ID=(\d+)(?:[&\s]|$)", body, re.IGNORECASE)
            if not pending or not match or not command_id or int(command_id.group(1)) != pending["id"]:
                return
            result = int(match.group(1))
            state["outstanding"] = None
            if result != 0:
                state["error"] = f"{pending['stage']} return={result}"
                if self.on_result:
                    self.on_result(pending["pin"], False, state["error"])
                print(f"PUSH FAIL sn=***{str(sn)[-4:]} pin=***{str(pending['pin'])[-4:]} {state['error']}", flush=True)
                return
            if pending["stage"] == "user":
                state["stage"] = "face"
                print(f"PUSH USER OK sn=***{str(sn)[-4:]} pin=***{str(pending['pin'])[-4:]}", flush=True)
            else:
                state["done"] += 1
                state["index"] += 1
                state["stage"] = "face" if self.face_only else "user"
                if self.on_result:
                    self.on_result(pending["pin"], True, None)
                print(f"PUSH FACE OK sn=***{str(sn)[-4:]} pin=***{str(pending['pin'])[-4:]}", flush=True)

    def status(self):
        with self.lock:
            return json.loads(json.dumps(self.states))

    def seen(self, sn):
        with self.lock:
            self.last_serial = sn
            self.last_seen = time.time()


def make_handler(queue):
    class Handler(BaseHTTPRequestHandler):
        server_version = "ZKPush/1.0"

        def _reply(self, body="OK", status=200, content_type="text/plain; charset=utf-8"):
            data = body.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _request(self):
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            sn = query.get("SN", ["unknown"])[0]
            if sn != "unknown":
                queue.seen(sn)
            return parsed.path, query, sn

        def _body(self):
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1024 * 1024:
                # AC4: reject bodies larger than 1 MiB to prevent memory exhaustion
                raise ValueError("body_too_large")
            return self.rfile.read(length).decode("utf-8", "replace")

        def do_GET(self):
            path, query, sn = self._request()
            if path == "/health":
                return self._reply(json.dumps({"profiles": len(queue.profiles), "devices": queue.status()}, ensure_ascii=False), content_type="application/json; charset=utf-8")
            if path == "/iclock/cdata":
                return self._reply("OK")
            if path == "/iclock/registry":
                return self._reply("RegistryCode=1234567890")
            if path == "/iclock/push":
                return self._reply("\n".join((
                    "ServerVersion=3.0.1", "ServerName=ADMS", "PushVersion=3.0.1",
                    "ErrorDelay=30", "RequestDelay=2", "TransTimes=00:00\t14:00",
                    "TransInterval=1", "TransTables=User\tTransaction", "Realtime=1",
                    f"SessionID={sn}", "TimeoutSec=10",
                    "MultiBioDataSupport=0:0:0:0:0:0:0:0:0:1",
                    "MultiBioPhotoSupport=0:0:0:0:0:0:0:0:0:1",
                )))
            if path == "/iclock/getrequest":
                return self._reply(queue.next_command(sn) or "OK")
            if path == "/iclock/ping":
                return self._reply("OK")
            return self._reply("Not found", 404)

        def do_POST(self):
            path, query, sn = self._request()
            try:
                body = self._body()
            except ValueError:
                return self._reply("Request body too large", 413)
            if path == "/iclock/registry":
                print(f"PUSH REGISTER sn=***{str(sn)[-4:]}", flush=True)
                return self._reply("RegistryCode=1234567890")
            if path == "/iclock/devicecmd":
                queue.ack(sn, body)
                return self._reply("OK")
            if path in ("/iclock/cdata", "/iclock/querydata", "/iclock/fdata"):
                return self._reply(upload_response(path, query))
            return self._reply("Not found", 404)

        def log_message(self, fmt, *args):
            if not hasattr(self, "path"):
                return
            path, _, sn = self._request()
            print(f"PUSH {self.command} {path} sn={sn}", flush=True)

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Minimal non-destructive ZKTeco PUSH face-photo provisioner")
    parser.add_argument("--listen", default="192.168.55.10")
    parser.add_argument("--port", type=int, default=18081)
    parser.add_argument("--cert", default=str(ROOT / ".runtime/push.crt"))
    parser.add_argument("--key", default=str(ROOT / ".runtime/push.key"))
    parser.add_argument("--face-only", action="store_true")
    args = parser.parse_args()
    queue = PushQueue(load_profiles(), face_only=args.face_only)
    server = ThreadingHTTPServer((args.listen, args.port), make_handler(queue))
    server.socket = make_tls_context(args.cert, args.key).wrap_socket(server.socket, server_side=True)
    print(f"ZKTeco PUSH receiver: https://{args.listen}:{args.port} profiles={len(queue.profiles)}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
