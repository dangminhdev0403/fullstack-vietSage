import base64
import re
import secrets
import threading
import time

_VALID_MODES = frozenset(("CHECK_IN", "TEST"))


def mask_identity(value):
    value = str(value or "")
    return "*" * max(0, len(value) - 4) + value[-4:]


class BiometricStore:
    def __init__(self, push_queue, provision, ttl_seconds=1800, now=time.time):
        self.push_queue = push_queue
        self.provision = provision
        self.ttl_seconds = ttl_seconds
        self.now = now
        self.scans = {}
        self.enrollments = {}
        self.by_stay = {}
        self.active_scan_id = None
        self.lock = threading.Lock()

    def start_scan(self, mode="CHECK_IN"):
        """
        Create a new scan.  If there is a prior active scan it is silently
        discarded first (AC5: replacement scan deterministically cancels prior).

        Parameters
        ----------
        mode : str
            "CHECK_IN" (default) or "TEST".  Any other value raises ValueError.
        """
        if mode not in _VALID_MODES:
            raise ValueError(f"Chế độ quét không hợp lệ: {mode!r}. Phải là CHECK_IN hoặc TEST.")
        scan_id = "scan_" + secrets.token_urlsafe(24)
        with self.lock:
            # AC5: discard any currently-active scan before registering the new one.
            prev_id = self.active_scan_id
            if prev_id and prev_id in self.scans:
                _discard_scan_locked(self.scans, prev_id)
            self.scans[scan_id] = {
                "scanId": scan_id,
                "createdAt": self.now(),
                "status": "WAITING",
                "mode": mode,
                "data": {},
            }
            self.active_scan_id = scan_id
        return scan_id

    def ingest_active(self, message):
        with self.lock:
            scan_id = self.active_scan_id
        if scan_id:
            return self.ingest(scan_id, message)
        return None

    def ingest(self, scan_id, message):
        with self.lock:
            scan = self._scan(scan_id)
            data = scan["data"]
            message_id = str(message.get("id", ""))
            if message_id == "2" and isinstance(message.get("data"), dict):
                data.update(message["data"])
            elif message_id == "4" and isinstance(message.get("data"), dict):
                encoded = message["data"].get("img_data") or message["data"].get("dg2")
                if encoded:
                    data["photo"] = encoded if str(encoded).startswith("data:") else "data:image/jpeg;base64," + str(encoded)
            if "photo" in data and len(str(data["photo"])) > 1_500_000:
                data.pop("photo", None)
                raise ValueError("Ảnh CCCD quá lớn")
            if "ChipAuthen" in message:
                data["chipAuthenticated"] = int(message["ChipAuthen"]) == 1
            if "VerifySOD" in message:
                data["sodVerified"] = int(message["VerifySOD"]) == 1
            scan["status"] = "READY" if data.get("idCode") and data.get("personName") and data.get("photo") else "WAITING"
            return self._public_scan(scan)

    def get_scan(self, scan_id):
        with self.lock:
            return self._public_scan(self._scan(scan_id))

    def discard_scan(self, scan_id):
        """
        Discard a scan: remove it from memory (including portrait), reset active
        pointer if this was the active scan.  Raises ValueError if not found/invalid.

        AC5: discarded scans are inaccessible; portrait removed from memory.
        """
        if not re.fullmatch(r"scan_[A-Za-z0-9_-]{16,64}", str(scan_id or "")):
            raise ValueError("scanId không hợp lệ")
        with self.lock:
            scan = self.scans.get(scan_id)
            if not scan:
                raise ValueError("Không tìm thấy lượt quét")
            _discard_scan_locked(self.scans, scan_id)
            if self.active_scan_id == scan_id:
                self.active_scan_id = None

    def enroll(self, stay_id, scan_id):
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,128}", str(stay_id or "")):
            raise ValueError("stayId không hợp lệ")
        with self.lock:
            existing = self.by_stay.get(stay_id)
            if existing:
                return self._public_enrollment(self.enrollments[existing])
            scan = self._scan(scan_id)
            # AC6: TEST scans can never enroll.
            if scan.get("mode") == "TEST":
                raise ValueError("Lượt quét TEST không thể đăng ký (chế độ TEST không lưu dữ liệu)")
            if scan["status"] != "READY":
                raise ValueError("Lượt quét chưa đủ dữ liệu")
            data = scan["data"]
            identity = str(data.get("idCode", "")).strip()
            if not re.fullmatch(r"\d{9,12}", identity):
                raise ValueError("Số CCCD không hợp lệ")
            header, encoded = data["photo"].split(",", 1)
            if not header.startswith("data:image/"):
                raise ValueError("Ảnh CCCD không hợp lệ")
            try:
                photo = base64.b64decode(encoded, validate=True)
            except Exception as error:
                raise ValueError("Ảnh CCCD không hợp lệ") from error
            profile = {"idCode": identity, "biometricUserId": identity, "personName": str(data.get("personName", ""))}
            request_id = "enr_" + secrets.token_urlsafe(24)
            enrollment = {"requestId": request_id, "stayId": stay_id, "scanId": scan_id, "identity": identity, "status": "PENDING", "error": None, "profile": profile, "photo": photo}
            # Record exists before any side-effects (AC1)
            self.enrollments[request_id] = enrollment
            self.by_stay[stay_id] = request_id
        # Provision and enqueue are called outside the lock (AC1)
        try:
            self.provision(profile)
            self.push_queue.enqueue(profile, photo)
        except Exception as error:
            with self.lock:
                enrollment["status"] = "FAILED"
                enrollment["error"] = str(error)[:160]
            return self._public_enrollment(enrollment)
        return self._public_enrollment(enrollment)

    def get_enrollment(self, request_id):
        with self.lock:
            enrollment = self.enrollments.get(request_id)
            if not enrollment:
                raise ValueError("Không tìm thấy yêu cầu đồng bộ")
            return self._public_enrollment(enrollment)

    def fail(self, request_id, error):
        with self.lock:
            enrollment = self.enrollments[request_id]
            enrollment.update(status="FAILED", error=str(error)[:160])

    def fail_identity(self, identity, error):
        with self.lock:
            for enrollment in self.enrollments.values():
                if enrollment["identity"] == str(identity) and enrollment["status"] == "PENDING":
                    enrollment.update(status="FAILED", error=str(error)[:160])
                    break

    def synced(self, identity):
        with self.lock:
            for enrollment in self.enrollments.values():
                if enrollment["identity"] == str(identity) and enrollment["status"] == "PENDING":
                    enrollment.update(status="SYNCED", error=None)
                    break

    def retry(self, request_id):
        with self.lock:
            enrollment = self.enrollments.get(request_id)
            if not enrollment:
                raise ValueError("Không tìm thấy yêu cầu đồng bộ")
            if enrollment["status"] != "FAILED":
                return self._public_enrollment(enrollment)
            profile = enrollment["profile"]
            photo = enrollment["photo"]
        # Publish retry state before enqueue so a synchronous ACK can complete it.
        with self.lock:
            enrollment.update(status="PENDING", error=None)
        try:
            self.provision(profile)
            self.push_queue.enqueue(profile, photo)
        except Exception as error:
            with self.lock:
                if enrollment["status"] == "PENDING":
                    enrollment.update(status="FAILED", error=str(error)[:160])
        return self._public_enrollment(enrollment)

    def _scan(self, scan_id):
        if not re.fullmatch(r"scan_[A-Za-z0-9_-]{16,64}", str(scan_id or "")):
            raise ValueError("scanId không hợp lệ")
        scan = self.scans.get(scan_id)
        if not scan:
            raise ValueError("Không tìm thấy lượt quét")
        if self.now() - scan["createdAt"] > self.ttl_seconds:
            self.scans.pop(scan_id, None)
            raise ValueError("Lượt quét đã hết hạn")
        return scan

    @staticmethod
    def _public_scan(scan):
        data = dict(scan["data"])
        return {
            "scanId": scan["scanId"],
            "status": scan["status"],
            "mode": scan.get("mode", "CHECK_IN"),
            "guestDisplayName": data.get("personName"),
            "guestIdentityNumber": data.get("idCode"),
            "portrait": data.get("photo"),
            "chipAuthenticated": data.get("chipAuthenticated"),
            "sodVerified": data.get("sodVerified"),
        }

    @staticmethod
    def _public_enrollment(enrollment):
        return {"requestId": enrollment["requestId"], "stayId": enrollment["stayId"], "status": enrollment["status"], "identity": mask_identity(enrollment["identity"]), "error": enrollment["error"]}


# ---------------------------------------------------------------------------
# Module-level helper (used inside lock – must not acquire additional locks)
# ---------------------------------------------------------------------------

def _discard_scan_locked(scans_dict, scan_id):
    """Remove scan from dict, clearing portrait from memory. Called under lock."""
    scan = scans_dict.pop(scan_id, None)
    if scan:
        # Explicitly clear photo bytes to allow GC immediately.
        scan.get("data", {}).pop("photo", None)
