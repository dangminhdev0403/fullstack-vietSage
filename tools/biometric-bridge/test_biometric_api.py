import base64
import unittest

from biometric_api import BiometricStore, mask_identity


class Queue:
    def __init__(self):
        self.items = []

    def enqueue(self, profile, photo):
        self.items.append((profile, photo))


class FailingQueue(Queue):
    def enqueue(self, profile, photo):
        raise RuntimeError("queue unavailable")


class CallbackQueue(Queue):
    def __init__(self):
        super().__init__()
        self.callback = None

    def enqueue(self, profile, photo):
        super().enqueue(profile, photo)
        self.callback(profile["idCode"])


class BiometricStoreTests(unittest.TestCase):
    def test_scan_stays_pending_and_does_not_queue_before_enroll(self):
        queue = Queue()
        store = BiometricStore(queue, lambda _profile: None, now=lambda: 100)
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        self.assertEqual(store.get_scan(scan_id)["status"], "READY")
        self.assertEqual(queue.items, [])

    def test_oversized_scan_photo_is_rejected(self):
        store = BiometricStore(Queue(), lambda _profile: None, now=lambda: 100)
        scan_id = store.start_scan()
        with self.assertRaisesRegex(ValueError, "quá lớn"):
            store.ingest(scan_id, {"id": "4", "data": {"img_data": "A" * 1_500_001}})
        self.assertIsNone(store.get_scan(scan_id)["portrait"])

    def test_expired_scan_is_unavailable(self):
        clock = [100]
        store = BiometricStore(Queue(), lambda _profile: None, ttl_seconds=10, now=lambda: clock[0])
        scan_id = store.start_scan()
        clock[0] = 111
        with self.assertRaisesRegex(ValueError, "hết hạn"):
            store.get_scan(scan_id)

    def test_explicit_enroll_is_idempotent_and_queues_face_once(self):
        queue, provisioned = Queue(), []
        store = BiometricStore(queue, provisioned.append, now=lambda: 100)
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        first = store.enroll("stay_12345678", scan_id)
        second = store.enroll("stay_12345678", scan_id)
        self.assertEqual(first["requestId"], second["requestId"])
        self.assertEqual(len(queue.items), 1)
        self.assertEqual(len(provisioned), 1)

    def test_retry_requeues_failed_enrollment(self):
        queue = Queue()
        store = BiometricStore(queue, lambda _profile: None, now=lambda: 100)
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        request_id = store.enroll("stay_12345678", scan_id)["requestId"]
        store.fail(request_id, "device timeout")
        store.retry(request_id)
        self.assertEqual(len(queue.items), 2)
        self.assertEqual(store.get_enrollment(request_id)["status"], "PENDING")

    def test_enroll_queue_failure_leaves_retryable_failed_record(self):
        store = BiometricStore(FailingQueue(), lambda _profile: None, now=lambda: 100)
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        enrollment = store.enroll("stay_12345678", scan_id)
        self.assertEqual(enrollment["status"], "FAILED")
        self.assertIn("queue unavailable", enrollment["error"])

    def test_retry_marks_pending_before_synchronous_ack_callback(self):
        queue = CallbackQueue()
        store = BiometricStore(queue, lambda _profile: None, now=lambda: 100)
        queue.callback = store.synced
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        request_id = store.enroll("stay_12345678", scan_id)["requestId"]
        store.fail(request_id, "retry")
        store.retry(request_id)
        self.assertEqual(store.get_enrollment(request_id)["status"], "SYNCED")

    def test_identity_is_masked(self):
        self.assertEqual(mask_identity("034205005951"), "********5951")

    def test_enroll_record_exists_even_when_provision_fails(self):
        # AC1: record must be stored before side-effects; a provision error should
        # leave the enrollment as FAILED (retryable), not erase it.
        queue = Queue()
        def bad_provision(_profile):
            raise RuntimeError("provision timeout")
        store = BiometricStore(queue, bad_provision, now=lambda: 100)
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        result = store.enroll("stay_12345678", scan_id)
        # The call must not propagate the exception; enrollment is FAILED but exists
        self.assertEqual(result["status"], "FAILED")
        # Record must be retrievable by requestId
        stored = store.get_enrollment(result["requestId"])
        self.assertEqual(stored["status"], "FAILED")
        # Queue must NOT have received the photo (provision failed before enqueue)
        self.assertEqual(len(queue.items), 0)

    def test_synced_does_not_promote_failed_enrollment(self):
        # AC2: a late ACK (synced) must not change FAILED back to SYNCED
        queue = Queue()
        store = BiometricStore(queue, lambda _profile: None, now=lambda: 100)
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        request_id = store.enroll("stay_12345678", scan_id)["requestId"]
        store.fail(request_id, "device error")
        # Now simulate a late ACK for the same identity
        store.synced("034205005951")
        self.assertEqual(store.get_enrollment(request_id)["status"], "FAILED")

    def test_identity_ack_completes_only_one_pending_enrollment(self):
        store = BiometricStore(Queue(), lambda _profile: None, now=lambda: 100)
        request_ids = []
        for stay_id in ("stay_12345678", "stay_87654321"):
            scan_id = store.start_scan()
            store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
            store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
            request_ids.append(store.enroll(stay_id, scan_id)["requestId"])
        store.synced("034205005951")
        statuses = [store.get_enrollment(request_id)["status"] for request_id in request_ids]
        self.assertEqual(statuses, ["SYNCED", "PENDING"])

    def test_enroll_does_not_hold_lock_during_provision(self):
        # AC1: provision must be called outside the store lock.  We detect a
        # deadlock by calling store.get_enrollment() from inside provision.
        import threading
        queue = Queue()
        result_box = [None]
        lock_held_during_provision = [False]

        def reentering_provision(_profile):
            # If the store lock is held, this will deadlock.  We use a non-blocking
            # acquire to detect it instead of actually deadlocking.
            acquired = store.lock.acquire(blocking=False)
            lock_held_during_provision[0] = not acquired
            if acquired:
                store.lock.release()

        store = BiometricStore(queue, reentering_provision, now=lambda: 100)
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        store.enroll("stay_12345678", scan_id)
        self.assertFalse(lock_held_during_provision[0], "store lock was held during provision call")

    def test_retry_does_not_hold_lock_during_provision(self):
        # AC1: same lock-freedom requirement for retry
        queue = Queue()
        lock_held = [False]

        def reentering_provision(_profile):
            acquired = store.lock.acquire(blocking=False)
            lock_held[0] = not acquired
            if acquired:
                store.lock.release()

        store = BiometricStore(queue, reentering_provision, now=lambda: 100)
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        req = store.enroll("stay_12345678", scan_id)
        store.fail(req["requestId"], "err")
        store.retry(req["requestId"])
        self.assertFalse(lock_held[0], "store lock was held during retry provision call")

class TestScanModeAndDiscard(unittest.TestCase):
    """Slice 3: TEST mode scan + discard_scan."""

    def _make_store(self, queue=None, provision=None):
        if queue is None:
            queue = Queue()
        if provision is None:
            provision = lambda _p: None
        return BiometricStore(queue, provision, now=lambda: 100)

    # -- start_scan mode --

    def test_start_scan_default_mode_is_check_in(self):
        """start_scan() with no args produces a CHECK_IN scan."""
        store = self._make_store()
        scan_id = store.start_scan()
        scan = store.scans[scan_id]
        self.assertEqual(scan.get("mode"), "CHECK_IN")

    def test_start_scan_explicit_check_in(self):
        store = self._make_store()
        scan_id = store.start_scan(mode="CHECK_IN")
        self.assertEqual(store.scans[scan_id]["mode"], "CHECK_IN")

    def test_start_scan_test_mode(self):
        store = self._make_store()
        scan_id = store.start_scan(mode="TEST")
        self.assertEqual(store.scans[scan_id]["mode"], "TEST")

    def test_start_scan_invalid_mode_raises(self):
        store = self._make_store()
        with self.assertRaises(ValueError):
            store.start_scan(mode="WRONG")

    # -- TEST scan enroll rejection --

    def test_enroll_rejects_test_scan(self):
        store = self._make_store()
        scan_id = store.start_scan(mode="TEST")
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        with self.assertRaisesRegex(ValueError, "[Tt][Ee][Ss][Tt]"):
            store.enroll("stay_12345678", scan_id)

    def test_test_scan_is_ready_when_data_complete(self):
        """TEST scans still reach READY state (parser reused)."""
        store = self._make_store()
        scan_id = store.start_scan(mode="TEST")
        store.ingest(scan_id, {"id": "2", "data": {"idCode": "034205005951", "personName": "A"}})
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        self.assertEqual(store.get_scan(scan_id)["status"], "READY")

    def test_test_scan_public_view_includes_mode(self):
        """get_scan response includes mode field."""
        store = self._make_store()
        scan_id = store.start_scan(mode="TEST")
        pub = store.get_scan(scan_id)
        self.assertIn("mode", pub)
        self.assertEqual(pub["mode"], "TEST")

    def test_check_in_scan_public_view_includes_mode(self):
        """get_scan response includes mode=CHECK_IN for default scans."""
        store = self._make_store()
        scan_id = store.start_scan()
        pub = store.get_scan(scan_id)
        self.assertIn("mode", pub)
        self.assertEqual(pub["mode"], "CHECK_IN")

    # -- discard_scan --

    def test_discard_scan_removes_from_scans_dict(self):
        store = self._make_store()
        scan_id = store.start_scan()
        store.discard_scan(scan_id)
        self.assertNotIn(scan_id, store.scans)

    def test_discard_scan_resets_active_pointer_when_active(self):
        store = self._make_store()
        scan_id = store.start_scan()
        self.assertEqual(store.active_scan_id, scan_id)
        store.discard_scan(scan_id)
        self.assertIsNone(store.active_scan_id)

    def test_discard_scan_does_not_reset_pointer_when_not_active(self):
        """Discarding a non-active scan must not change the active pointer."""
        store = self._make_store()
        old_id = store.start_scan()
        store.discard_scan(old_id)
        new_id = store.start_scan()
        # Manually add an old entry to test
        store.scans["scan_orphan00000000000000"] = {
            "scanId": "scan_orphan00000000000000",
            "createdAt": 100,
            "status": "WAITING",
            "mode": "CHECK_IN",
            "data": {},
        }
        store.discard_scan("scan_orphan00000000000000")
        # Active should still be new_id, not changed
        self.assertEqual(store.active_scan_id, new_id)

    def test_discard_scan_unknown_id_raises_value_error(self):
        store = self._make_store()
        with self.assertRaises(ValueError):
            store.discard_scan("scan_doesnotexist00")

    def test_discard_scan_clears_photo_from_memory(self):
        """Portrait data is no longer in memory after discard."""
        store = self._make_store()
        scan_id = store.start_scan()
        store.ingest(scan_id, {"id": "4", "data": {"img_data": base64.b64encode(b"jpg").decode()}})
        # Confirm portrait exists before discard
        self.assertIsNotNone(store.scans[scan_id]["data"].get("photo"))
        store.discard_scan(scan_id)
        self.assertNotIn(scan_id, store.scans)

    def test_start_scan_discards_prior_active(self):
        """Starting a second scan must discard the first active scan."""
        store = self._make_store()
        first_id = store.start_scan()
        self.assertIn(first_id, store.scans)
        second_id = store.start_scan()
        self.assertNotIn(first_id, store.scans)
        self.assertEqual(store.active_scan_id, second_id)

    def test_start_scan_no_prior_active_is_safe(self):
        """First start_scan with no prior active must not raise."""
        store = self._make_store()
        self.assertIsNone(store.active_scan_id)
        scan_id = store.start_scan()
        self.assertIsNotNone(scan_id)


if __name__ == "__main__":
    unittest.main()
