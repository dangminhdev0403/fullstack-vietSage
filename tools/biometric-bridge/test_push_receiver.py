import base64
import ssl
import tempfile
import unittest
from pathlib import Path

from push_receiver import PushQueue, build_biophoto_command, build_user_command, load_profiles, make_handler, make_tls_context, upload_response


class PushReceiverTests(unittest.TestCase):
    def test_builds_user_then_visible_face_photo_after_successful_ack(self):
        profile = {"idCode": "034205005951", "personName": "Đặng Hoàng Minh"}
        photo = b"\xff\xd8\xff\xd9"
        queue = PushQueue([(profile, photo)])

        user = queue.next_command("2145254200013")
        self.assertIn("DATA UPDATE user", user)
        self.assertIn("Pin=034205005951", user)
        self.assertIsNone(queue.next_command("2145254200013"))

        queue.ack("2145254200013", "ID=1&Return=0&CMD=DATA UPDATE")
        face = queue.next_command("2145254200013")
        self.assertIn("DATA UPDATE biophoto", face)
        self.assertIn("Type=9", face)
        self.assertIn("Format=0", face)
        self.assertIn("Content=" + base64.b64encode(photo).decode(), face)

    def test_failed_user_ack_does_not_send_face(self):
        queue = PushQueue([({"idCode": "000000001", "personName": "A"}, b"jpeg")])
        queue.next_command("SN")
        queue.ack("SN", "ID=1&Return=-1&CMD=DATA UPDATE")
        self.assertIsNone(queue.next_command("SN"))

    def test_face_only_starts_with_biophoto(self):
        queue = PushQueue([({"idCode": "000000001", "personName": "A"}, b"jpeg")], face_only=True)
        self.assertIn("DATA UPDATE biophoto", queue.next_command("SN"))

    def test_dynamic_queue_is_empty_until_save_enqueues_profile(self):
        queue = PushQueue([], face_only=True)
        self.assertIsNone(queue.next_command("SN"))
        queue.enqueue({"idCode": "000000001", "personName": "A"}, b"jpeg")
        self.assertIn("DATA UPDATE biophoto", queue.next_command("SN"))

    def test_face_only_stays_face_only_for_second_saved_profile(self):
        queue = PushQueue([], face_only=True)
        queue.enqueue({"idCode": "000000001"}, b"first")
        self.assertIn("DATA UPDATE biophoto", queue.next_command("SN"))
        queue.ack("SN", "ID=1&return=0&CMD=DATA")
        queue.enqueue({"idCode": "000000002"}, b"second")
        self.assertIn("DATA UPDATE biophoto", queue.next_command("SN"))

    def test_biophoto_size_is_base64_length(self):
        command = build_biophoto_command(7, "000000001", b"abc")
        self.assertIn("Size=4", command)
        self.assertIn("Content=YWJj", command)
        self.assertIn("PostBackTmpFlag=1", command)

    def test_user_fields_are_tab_separated(self):
        command = build_user_command(3, {"idCode": "000000001", "personName": "A"})
        self.assertTrue(command.startswith("C:3:DATA UPDATE user "))
        self.assertIn("\tPin=000000001\t", command)

    def test_load_profiles_reads_portrait_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "data/portraits/000000001").mkdir(parents=True)
            (root / "data/portraits/000000001/cccd.jpg").write_bytes(b"jpeg")
            (root / "profiles.json").write_text('[{"idCode":"000000001","personName":"A","portraitPath":"data/portraits/000000001/cccd.jpg"}]', encoding="utf-8")
            self.assertEqual(load_profiles(root), [({"idCode": "000000001", "personName": "A", "portraitPath": "data/portraits/000000001/cccd.jpg"}, b"jpeg")])

    def test_commands_reject_invalid_identity_pin(self):
        with self.assertRaises(ValueError):
            build_user_command(1, {"idCode": "../../bad", "personName": "A"})
        with self.assertRaises(ValueError):
            build_biophoto_command(1, "../../bad", b"jpg")

    def test_stale_ack_id_does_not_advance_current_command(self):
        queue = PushQueue([({"idCode": "034205005951", "personName": "A"}, b"jpeg")])
        queue.next_command("SN")
        queue.ack("SN", "ID=999&Return=0&CMD=DATA")
        self.assertIsNone(queue.next_command("SN"))
        self.assertEqual(queue.status()["SN"]["outstanding"]["id"], 1)

    def test_load_profiles_rejects_portrait_outside_root(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            outside = root.parent / "outside-portrait.jpg"
            outside.write_bytes(b"jpeg")
            try:
                (root / "profiles.json").write_text(
                    '[{"idCode":"034205005951","portraitPath":"../outside-portrait.jpg"}]',
                    encoding="utf-8",
                )
                with self.assertRaises(ValueError):
                    load_profiles(root)
            finally:
                outside.unlink(missing_ok=True)

    def test_fdata_upload_is_acknowledged_without_storage(self):
        self.assertEqual(upload_response("/iclock/fdata", {}), "OK")

    def test_tls_context_is_server_context(self):
        with tempfile.TemporaryDirectory() as folder:
            cert = Path(folder) / "cert.pem"
            key = Path(folder) / "key.pem"
            cert.write_text("invalid", encoding="utf-8")
            key.write_text("invalid", encoding="utf-8")
            with self.assertRaises(ssl.SSLError):
                make_tls_context(cert, key)

    def test_enqueue_does_not_clear_existing_device_error(self):
        # AC3: enqueue of a new profile must not clear an existing device error
        queue = PushQueue([({"idCode": "000000001", "personName": "A"}, b"first")], face_only=True)
        # Simulate a device that has already failed
        queue.next_command("SN")
        queue.ack("SN", "ID=1&Return=-1&CMD=DATA")
        self.assertIsNotNone(queue.status()["SN"]["error"])
        # Now enqueue a new profile — error must NOT be cleared
        queue.enqueue({"idCode": "000000002", "personName": "B"}, b"second")
        self.assertIsNotNone(queue.status()["SN"]["error"],
                             "enqueue must not clear existing device error")

    def test_ack_without_outstanding_is_noop(self):
        # AC3: ACK arriving before any command is sent must not change state
        queue = PushQueue([({"idCode": "000000001", "personName": "A"}, b"jpeg")], face_only=True)
        # No next_command called yet, so outstanding is None
        before = queue.status()
        queue.ack("SN", "ID=1&Return=0&CMD=DATA")
        after = queue.status()
        # Status should not have changed (still no state for SN or same state)
        # The key check: no spurious index advance
        cmd = queue.next_command("SN")
        self.assertIn("DATA UPDATE biophoto", cmd,
                      "first command should still be available after no-op ack")

    def test_push_body_over_1mib_returns_413(self):
        # AC4: a PUSH POST body larger than 1 MiB must be rejected with 413
        import io
        import unittest.mock as mock
        queue = PushQueue([], face_only=True)
        handler_class = make_handler(queue)
        large_body = b"x" * (1024 * 1024 + 1)
        request_line = b"POST /iclock/devicecmd?SN=TEST HTTP/1.1\r\n"
        headers_str = (
            f"Content-Length: {len(large_body)}\r\n"
            "Content-Type: text/plain\r\n"
            "\r\n"
        ).encode()
        raw = request_line + headers_str + large_body
        rfile = io.BytesIO(raw)
        wfile = io.BytesIO()
        # We need to call the handler; simulate minimal request environment
        with mock.patch.object(handler_class, "__init__", lambda self, *a, **kw: None):
            h = handler_class.__new__(handler_class)
            h.rfile = io.BytesIO(large_body)
            h.wfile = wfile
            h.headers = {"Content-Length": str(len(large_body))}
            h.path = "/iclock/devicecmd?SN=TEST"
            h.command = "POST"
            h.requestline = "POST /iclock/devicecmd?SN=TEST HTTP/1.1"
            h.server = mock.MagicMock()
            h.connection = mock.MagicMock()
            h.client_address = ("127.0.0.1", 9999)
            # Patch send_response to track status
            responses = []
            h.send_response = lambda code, *a: responses.append(code)
            h.send_header = lambda *a: None
            h.end_headers = lambda: None
            h.wfile.write = lambda data: None
            h._reply = lambda body="OK", status=200, **kw: responses.append(status)
            h._request = lambda: ("/iclock/devicecmd", {"SN": ["TEST"]}, "TEST")
            h._body = handler_class._body.__get__(h, handler_class)
            h.do_POST()
        self.assertIn(413, responses, "body > 1 MiB must return 413")


if __name__ == "__main__":
    unittest.main()
