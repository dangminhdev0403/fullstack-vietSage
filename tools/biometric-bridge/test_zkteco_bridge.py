import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from zkteco_bridge import EventStore, ProfileStore, normalize_attendance, persist_biometric_capture, persist_portrait, resolve_display_name, save_profile


class Attendance:
    user_id = "7"
    timestamp = datetime(2026, 7, 29, 15, 30, 0)
    status = 1
    punch = 15


class BridgeTests(unittest.TestCase):
    def test_normalize_attendance_preserves_raw_codes(self):
        event = normalize_attendance(Attendance(), "192.168.55.11")
        self.assertEqual(event["userId"], "7")
        self.assertEqual(event["timestamp"], "2026-07-29T15:30:00")
        self.assertEqual(event["statusCode"], 1)
        self.assertEqual(event["punchCode"], 15)
        self.assertEqual(event["deviceIp"], "192.168.55.11")
        self.assertEqual(event["result"], "success")
        self.assertEqual(event["method"], "fingerprint")

    def test_firmware_status_15_means_face_and_unknown_stays_unknown(self):
        face = Attendance()
        face.status = 15
        self.assertEqual(normalize_attendance(face, "192.168.55.11")["method"], "face")
        other = Attendance()
        other.status = 99
        self.assertEqual(normalize_attendance(other, "192.168.55.11")["method"], "unknown")

    def test_store_rejects_duplicate_events(self):
        store = EventStore(limit=5)
        event = {"userId": "7", "timestamp": "2026-07-29T15:30:00", "statusCode": 1, "punchCode": 15}
        self.assertTrue(store.add(event))
        self.assertFalse(store.add(dict(event)))
        self.assertEqual(store.list(), [event])

    def test_clear_events_removes_pc_session_and_allows_same_event_again(self):
        store = EventStore(limit=5)
        event = {"userId": "7", "timestamp": "2026-07-29T15:30:00", "statusCode": 1, "punchCode": 15}
        store.add(event)
        store.clear()
        self.assertEqual(store.list(), [])
        self.assertTrue(store.add(event))

    def test_profile_store_rejects_duplicate_identity_number(self):
        with tempfile.TemporaryDirectory() as folder:
            store = ProfileStore(Path(folder) / "profiles.json")
            first = store.create({"idCode": "001234567890", "personName": "A", "photo": "data:image/jpeg;base64,/9j/AA=="})
            self.assertEqual(first["biometricUserId"], "001234567890")
            with self.assertRaisesRegex(ValueError, "đã tồn tại"):
                store.create({"idCode": "001234567890", "personName": "B", "photo": "data:image/jpeg;base64,/9j/AA=="})

    def test_event_store_enriches_attendance_from_identity_profile(self):
        profiles = {"001234567890": {"idCode": "001234567890", "personName": "Nguyễn Văn A"}}
        store = EventStore(profile_lookup=lambda user_id: profiles.get(user_id))
        event = {"userId": "001234567890", "timestamp": "2026-07-29T15:30:00", "statusCode": 1, "punchCode": 15}
        store.add(event)
        self.assertEqual(store.list()[0]["profile"]["personName"], "Nguyễn Văn A")

    def test_display_name_prefers_pc_then_device_then_user_id(self):
        self.assertEqual(resolve_display_name("2", {"personName": "Tên PC"}, {"2": "Tên máy"}), "Tên PC")
        self.assertEqual(resolve_display_name("2", None, {"2": "Tên máy"}), "Tên máy")
        self.assertEqual(resolve_display_name("9", None, {}), "User 9")

    def test_persist_portrait_writes_image_and_returns_relative_link(self):
        with tempfile.TemporaryDirectory() as folder:
            profile = {"idCode": "001234567890", "photo": "data:image/jpeg;base64,/9j/AA=="}
            saved = persist_portrait(profile, Path(folder))
            self.assertEqual(saved["portraitPath"], "data/portraits/001234567890/cccd.jpg")
            self.assertNotIn("photo", saved)
            self.assertEqual((Path(folder) / saved["portraitPath"]).read_bytes(), b"\xff\xd8\xff\x00")
            self.assertTrue((Path(folder) / "data/fingerprints/001234567890").is_dir())

    def test_clear_removes_pc_profiles_and_biometric_files_only(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            store = ProfileStore(root / "profiles.json")
            store.create({"idCode": "001234567890", "personName": "A", "photo": "data:image/jpeg;base64,/9j/AA=="})
            (root / "data/fingerprints/001234567890/sample.bin").write_bytes(b"finger")
            store.clear()
            self.assertEqual(store.list(), [])
            self.assertEqual((root / "profiles.json").read_text(encoding="utf-8"), "[]")
            self.assertFalse((root / "data/portraits/001234567890").exists())
            self.assertFalse((root / "data/fingerprints/001234567890").exists())

    def test_persist_biometric_capture_writes_pc_file(self):
        with tempfile.TemporaryDirectory() as folder:
            relative = persist_biometric_capture("001234567890", "fingerprints", "data:image/png;base64,iVBORw==", Path(folder), "20260729T170000")
            self.assertEqual(relative, "data/fingerprints/001234567890/20260729T170000.png")
            self.assertEqual((Path(folder) / relative).read_bytes(), b"\x89PNG")

    def test_both_save_persists_pc_before_device_provision(self):
        with tempfile.TemporaryDirectory() as folder:
            store = ProfileStore(Path(folder) / "profiles.json")
            observed = []

            def failing_provision(profile):
                observed.append(store.get(profile["biometricUserId"]) is not None)
                raise RuntimeError("device offline")

            with self.assertRaisesRegex(RuntimeError, "device offline"):
                save_profile(
                    store,
                    {"idCode": "001234567890", "personName": "A", "photo": "data:image/jpeg;base64,/9j/AA=="},
                    "both",
                    failing_provision,
                )
            self.assertEqual(observed, [True])
            self.assertIsNotNone(store.get("001234567890"))

    def test_persist_portrait_rejects_path_traversal(self):
        # AC5: idCode must match \d{9,12}; path traversal idCodes must be rejected
        with tempfile.TemporaryDirectory() as folder:
            for bad_id in ("../etc/passwd", "..%2fetc", "abc", "", "../../x", "1234567890123"):
                with self.assertRaises(ValueError, msg=f"Expected rejection of idCode={bad_id!r}"):
                    persist_portrait(
                        {"idCode": bad_id, "photo": "data:image/jpeg;base64,/9j/AA=="},
                        Path(folder),
                    )

    def test_persist_biometric_capture_rejects_path_traversal(self):
        # AC5: same guard for persist_biometric_capture
        with tempfile.TemporaryDirectory() as folder:
            for bad_id in ("../evil", "..", "abc", "", "1234567890123"):
                with self.assertRaises(ValueError, msg=f"Expected rejection of idCode={bad_id!r}"):
                    persist_biometric_capture(
                        bad_id, "fingerprints",
                        "data:image/png;base64,iVBORw==",
                        Path(folder), "20260729T170000",
                    )


if __name__ == "__main__":
    unittest.main()
