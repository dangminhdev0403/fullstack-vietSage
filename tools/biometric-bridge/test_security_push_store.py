"""
test_security_push_store.py - Unit tests for SecurityPushStore SQLite state machine, queue, and event spool persistence.
"""

import os
import tempfile
import unittest
from security_push_store import SecurityPushStore


class TestSecurityPushStore(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_push.db")
        self.store = SecurityPushStore(self.db_path)
        self.sn = "TEST-SN-A"
        self.valid_jpeg = b"\xff\xd8\x00\x00\xff\xd9"

    def tearDown(self):
        self.store.close()
        self.temp_dir.cleanup()

    def test_one_outstanding_command_per_device(self):
        self.store.enqueue("12345", "User One", self.valid_jpeg)

        cmd1 = self.store.next_command(self.sn)
        self.assertIsNotNone(cmd1)
        self.assertIn("DATA UPDATE user", cmd1)

        # Calling next_command while command is outstanding must return None
        cmd2 = self.store.next_command(self.sn)
        self.assertIsNone(cmd2)

    def test_user_ack_zero_advances_to_type9_biophoto(self):
        self.store.enqueue("12345", "User One", self.valid_jpeg)

        user_cmd = self.store.next_command(self.sn)
        self.assertIsNotNone(user_cmd)
        # Extract cmd ID
        parsed_cmd_id = self.store.get_outstanding(self.sn)["id"]

        # ACK return=0 for user command
        self.store.ack(self.sn, f"ID={parsed_cmd_id}&Return=0")

        # Next command must be biophoto Type=9
        face_cmd = self.store.next_command(self.sn)
        self.assertIsNotNone(face_cmd)
        self.assertIn("DATA UPDATE biophoto", face_cmd)
        self.assertIn("Type=9", face_cmd)

    def test_nonzero_user_ack_blocks_face_command(self):
        self.store.enqueue("12345", "User One", self.valid_jpeg)

        user_cmd = self.store.next_command(self.sn)
        parsed_cmd_id = self.store.get_outstanding(self.sn)["id"]

        # Non-zero user ACK (error)
        self.store.ack(self.sn, f"ID={parsed_cmd_id}&Return=-1")

        # Device is now blocked in error state
        face_cmd = self.store.next_command(self.sn)
        self.assertIsNone(face_cmd)
        state = self.store.get_device_state(self.sn)
        self.assertIsNotNone(state["error"])
        self.assertIn("user return=-1", state["error"])

    def test_face_return_zero_completes_enrollment(self):
        self.store.enqueue("12345", "User One", self.valid_jpeg)

        user_cmd = self.store.next_command(self.sn)
        user_id = self.store.get_outstanding(self.sn)["id"]
        self.store.ack(self.sn, f"ID={user_id}&Return=0")

        face_cmd = self.store.next_command(self.sn)
        face_id = self.store.get_outstanding(self.sn)["id"]
        self.store.ack(self.sn, f"ID={face_id}&Return=0")

        # Enrollment is complete
        state = self.store.get_device_state(self.sn)
        self.assertEqual(state["completed_count"], 1)
        self.assertEqual(state["queue_index"], 1)
        self.assertIsNone(self.store.next_command(self.sn))

    def test_sequential_enrollments_restart_at_user(self):
        self.store.enqueue("10001", "User One", self.valid_jpeg)
        self.store.enqueue("10002", "User Two", self.valid_jpeg)

        # Profile 1: User -> ACK -> Face -> ACK
        cmd_user1 = self.store.next_command(self.sn)
        id1 = self.store.get_outstanding(self.sn)["id"]
        self.store.ack(self.sn, f"ID={id1}&Return=0")

        cmd_face1 = self.store.next_command(self.sn)
        id2 = self.store.get_outstanding(self.sn)["id"]
        self.store.ack(self.sn, f"ID={id2}&Return=0")

        # Profile 2: Must start at User
        cmd_user2 = self.store.next_command(self.sn)
        self.assertIsNotNone(cmd_user2)
        self.assertIn("DATA UPDATE user", cmd_user2)
        self.assertIn("Pin=10002", cmd_user2)

    def test_stale_ack_does_not_advance_state(self):
        self.store.enqueue("12345", "User One", self.valid_jpeg)

        self.store.next_command(self.sn)
        # ACK with wrong command ID
        self.store.ack(self.sn, "ID=9999&Return=0")

        # State remains outstanding for the original command
        outstanding = self.store.get_outstanding(self.sn)
        self.assertIsNotNone(outstanding)

    def test_deterministic_event_dedupe(self):
        event_line = "2026-08-01 12:00:00\t12345\t15\t1\t0\t0"

        # First insert succeeds
        added1 = self.store.add_event(self.sn, event_line)
        self.assertTrue(added1)

        # Duplicate insert returns False and is deduplicated
        added2 = self.store.add_event(self.sn, event_line)
        self.assertFalse(added2)

        events = self.store.get_events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["pin"], "12345")

    def test_event_dedupe_distinguishes_table_and_index(self):
        base = {
            "sn": self.sn, "pin": "12345", "timestamp": "2026-08-01 12:00:00",
            "verifytype": "1010000000000000", "event_code": "0", "in_out_status": "1",
            "raw_line": "synthetic",
        }
        self.assertTrue(self.store.add_event(self.sn, dict(base, source_table="rtlog", device_index="7")))
        self.assertTrue(self.store.add_event(self.sn, dict(base, source_table="transaction", device_index="7")))
        self.assertTrue(self.store.add_event(self.sn, dict(base, source_table="rtlog", device_index="8")))
        self.assertFalse(self.store.add_event(self.sn, dict(base, source_table="rtlog", device_index="7")))

    def test_restart_preserves_outstanding_command(self):
        self.store.enqueue("12345", "User One", self.valid_jpeg)
        self.store.next_command(self.sn)
        outstanding = self.store.get_outstanding(self.sn)
        self.store.close()
        restarted_store = SecurityPushStore(self.db_path)
        try:
            self.assertEqual(restarted_store.get_outstanding(self.sn), outstanding)
            self.assertIsNone(restarted_store.next_command(self.sn))
        finally:
            restarted_store.close()

    def test_sqlite_persists_state_and_spool_across_restart(self):
        self.store.enqueue("12345", "User One", self.valid_jpeg)

        # Send User cmd, receive ACK 0
        cmd1 = self.store.next_command(self.sn)
        id1 = self.store.get_outstanding(self.sn)["id"]
        self.store.ack(self.sn, f"ID={id1}&Return=0")

        # Add an event
        event_line = "2026-08-01 12:00:00\t12345\t15\t1\t0\t0"
        self.store.add_event(self.sn, event_line)

        # Close first store connection
        self.store.close()

        # Re-open store with same SQLite file (simulating process restart)
        restarted_store = SecurityPushStore(self.db_path)

        try:
            # Stage should still be 'face' for profile 1
            face_cmd = restarted_store.next_command(self.sn)
            self.assertIsNotNone(face_cmd)
            self.assertIn("DATA UPDATE biophoto", face_cmd)
            self.assertIn("Type=9", face_cmd)

            # Event spool retained across restart
            events = restarted_store.get_events()
            self.assertEqual(len(events), 1)

            # Dedupe still works after restart
            dup_added = restarted_store.add_event(self.sn, event_line)
            self.assertFalse(dup_added)
        finally:
            restarted_store.close()


if __name__ == "__main__":
    unittest.main()
