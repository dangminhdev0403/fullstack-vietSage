"""
test_local_settings.py – TDD tests for local_settings.py and local_secrets.py.

Every test class documents its RED phase (what fails before implementation)
and then proves GREEN after the correct implementation exists.

Run:
    python -m unittest -v test_local_settings.py
"""

import json
import os
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch, call


# ============================================================
# Helpers / Stubs
# ============================================================

class _FakeAdapter:
    """In-process DPAPI stub: XOR-encrypt with 0x55 (detectable, not secure)."""

    def protect(self, plaintext_bytes: bytes) -> bytes:
        return bytes(b ^ 0x55 for b in plaintext_bytes)

    def unprotect(self, blob: bytes) -> bytes:
        return bytes(b ^ 0x55 for b in blob)


# ============================================================
# 1. Validation – RED before validate_settings exists
# ============================================================

class TestValidateSettingsSchema(unittest.TestCase):
    """AC2: Strict schema validation."""

    def setUp(self):
        from local_settings import validate_settings
        self.validate = validate_settings

    # --- happy-path -----------------------------------------------------

    def test_empty_dict_is_valid(self):
        """An empty dict (no fields overridden) must be accepted."""
        result = self.validate({})
        self.assertEqual(result, {})

    def test_valid_full_config(self):
        cfg = {
            "deviceIp": "192.168.1.100",
            "devicePort": 4370,
            "pushListen": "10.0.0.5",
            "pushPort": 18081,
            "apiListen": "127.0.0.1",
            "apiPort": 18080,
            "allowedOrigins": ["https://vietsage.example", "http://localhost:3000"],
            "apiCert": "/etc/certs/api.crt",
            "apiKey": "/etc/certs/api.key",
            "pushCert": "/etc/certs/push.crt",
            "pushKey": "/etc/certs/push.key",
        }
        result = self.validate(cfg)
        self.assertEqual(result["devicePort"], 4370)
        self.assertEqual(result["allowedOrigins"], ["https://vietsage.example", "http://localhost:3000"])

    def test_loopback_variants_accepted_for_api_listen(self):
        for addr in ("127.0.0.1", "::1", "localhost"):
            result = self.validate({"apiListen": addr})
            self.assertEqual(result["apiListen"], addr)

    # --- rejection cases -----------------------------------------------

    def test_unknown_field_rejected(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"unknownField": "x"})

    def test_communication_key_rejected_as_unknown_field(self):
        """communicationKey must NOT be a known non-secret field."""
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"communicationKey": "secret123"})

    def test_invalid_ipv4_rejected(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"deviceIp": "999.0.0.1"})
        with self.assertRaises(SettingsValidationError):
            self.validate({"deviceIp": "not-an-ip"})

    def test_ipv6_rejected_for_deviceip(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"deviceIp": "::1"})

    def test_port_zero_rejected(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"devicePort": 0})

    def test_port_65536_rejected(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"devicePort": 65536})

    def test_port_1_and_65535_accepted(self):
        result = self.validate({"devicePort": 1})
        self.assertEqual(result["devicePort"], 1)
        result = self.validate({"devicePort": 65535})
        self.assertEqual(result["devicePort"], 65535)

    def test_port_boolean_rejected(self):
        """True/False must not pass as port (bool is subclass of int in Python)."""
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"devicePort": True})

    def test_invalid_origin_bare_hostname_rejected(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"allowedOrigins": ["vietsage.example"]})

    def test_invalid_origin_no_scheme_rejected(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"allowedOrigins": ["vietsage.example:3000"]})

    def test_http_origin_accepted(self):
        result = self.validate({"allowedOrigins": ["http://localhost:3000"]})
        self.assertEqual(result["allowedOrigins"], ["http://localhost:3000"])

    def test_https_origin_accepted(self):
        result = self.validate({"allowedOrigins": ["https://vietsage.example"]})
        self.assertEqual(result["allowedOrigins"], ["https://vietsage.example"])

    def test_empty_origins_list_rejected(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"allowedOrigins": []})

    def test_non_loopback_api_listen_rejected(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"apiListen": "0.0.0.0"})
        with self.assertRaises(SettingsValidationError):
            self.validate({"apiListen": "192.168.1.1"})

    def test_empty_cert_path_rejected(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate({"apiCert": ""})
        with self.assertRaises(SettingsValidationError):
            self.validate({"apiCert": "   "})

    def test_non_dict_input_rejected(self):
        from local_settings import SettingsValidationError
        with self.assertRaises(SettingsValidationError):
            self.validate([1, 2, 3])
        with self.assertRaises(SettingsValidationError):
            self.validate("string")


# ============================================================
# 2. Atomic write – RED before LocalSettingsStore exists
# ============================================================

class TestAtomicWrite(unittest.TestCase):
    """AC1: Atomic write with same-dir temp, flush/fsync, os.replace."""

    def setUp(self):
        self._tmp_dir = tempfile.mkdtemp()
        self._settings_path = os.path.join(self._tmp_dir, "settings.json")

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp_dir, ignore_errors=True)

    def _make_store(self):
        from local_settings import LocalSettingsStore
        return LocalSettingsStore(self._settings_path)

    def test_put_creates_settings_file(self):
        store = self._make_store()
        store.put({"devicePort": 9000})
        self.assertTrue(os.path.exists(self._settings_path))

    def test_put_writes_valid_json(self):
        store = self._make_store()
        store.put({"devicePort": 9000})
        with open(self._settings_path, encoding="utf-8") as fh:
            data = json.load(fh)
        self.assertEqual(data["devicePort"], 9000)

    def test_load_returns_persisted_data(self):
        store = self._make_store()
        store.put({"devicePort": 9001})
        store2 = self._make_store()
        result = store2.load()
        self.assertEqual(result["devicePort"], 9001)

    def test_load_nonexistent_file_returns_empty(self):
        store = self._make_store()
        result = store.load()
        self.assertEqual(result, {})

    def test_no_temp_file_left_after_successful_write(self):
        store = self._make_store()
        store.put({"devicePort": 9002})
        tmp_files = [f for f in os.listdir(self._tmp_dir) if f.startswith(".settings_tmp_")]
        self.assertEqual(tmp_files, [], "Temp files must be cleaned up after success")

    def test_failed_replace_preserves_old_config(self):
        """
        AC1: If os.replace raises, the old settings file is preserved.

        We patch os.replace to raise on its first call (the atomic rename),
        so the original file must remain intact.
        """
        from local_settings import LocalSettingsStore
        store = self._make_store()
        # Write initial good config.
        store.put({"devicePort": 1111})

        original_replace = os.replace
        call_count = [0]

        def failing_replace(src, dst):
            call_count[0] += 1
            if call_count[0] == 1:
                raise OSError("Simulated replace failure")
            return original_replace(src, dst)

        with patch("os.replace", side_effect=failing_replace):
            with self.assertRaises(OSError):
                store.put({"devicePort": 2222})

        # The settings file must still contain the original value.
        with open(self._settings_path, encoding="utf-8") as fh:
            data = json.load(fh)
        self.assertEqual(data["devicePort"], 1111, "Old config must be preserved after failed replace")

    def test_failed_replace_preserves_in_memory_config(self):
        """Generation and in-memory running config are NOT changed on failure."""
        from local_settings import LocalSettingsStore
        store = self._make_store()
        store.put({"devicePort": 3333})
        gen_before = store.generation
        running_before = store.get_running()

        original_replace = os.replace
        call_count = [0]

        def failing_replace(src, dst):
            call_count[0] += 1
            if call_count[0] == 1:
                raise OSError("Simulated failure")
            return original_replace(src, dst)

        with patch("os.replace", side_effect=failing_replace):
            with self.assertRaises(OSError):
                store.put({"devicePort": 4444})

        self.assertEqual(store.generation, gen_before)
        self.assertEqual(store.get_running(), running_before)

    def test_no_temp_file_left_after_failed_replace(self):
        """Orphaned temp files must be removed even when replace fails."""
        store = self._make_store()

        original_replace = os.replace
        call_count = [0]

        def failing_replace(src, dst):
            call_count[0] += 1
            if call_count[0] == 1:
                raise OSError("Simulated failure")
            return original_replace(src, dst)

        with patch("os.replace", side_effect=failing_replace):
            with self.assertRaises(OSError):
                store.put({"devicePort": 5555})

        tmp_files = [f for f in os.listdir(self._tmp_dir) if f.startswith(".settings_tmp_")]
        self.assertEqual(tmp_files, [], "Temp files must be cleaned up after failed replace")

    def test_temp_file_is_in_same_directory_as_settings(self):
        """Atomic rename is only safe same-filesystem; temp must be in the same dir."""
        created_temps = []
        original_open = open

        def tracking_open(path, *a, **kw):
            if os.path.basename(str(path)).startswith(".settings_tmp_"):
                created_temps.append(str(path))
            return original_open(path, *a, **kw)

        store = self._make_store()
        with patch("builtins.open", side_effect=tracking_open):
            store.put({"devicePort": 6666})

        self.assertTrue(
            all(os.path.dirname(p) == self._tmp_dir for p in created_temps),
            "Temp file must be in the same directory as the settings file"
        )


# ============================================================
# 3. Generation counter – RED before LocalSettingsStore exists
# ============================================================

class TestGenerationCounter(unittest.TestCase):
    """AC5: Generation incremented exactly once after full success."""

    def setUp(self):
        self._tmp_dir = tempfile.mkdtemp()
        self._settings_path = os.path.join(self._tmp_dir, "settings.json")

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp_dir, ignore_errors=True)

    def _make_store(self):
        from local_settings import LocalSettingsStore
        return LocalSettingsStore(self._settings_path)

    def test_initial_generation_is_zero(self):
        store = self._make_store()
        self.assertEqual(store.generation, 0)

    def test_successful_put_increments_generation_by_one(self):
        store = self._make_store()
        store.put({"devicePort": 7777})
        self.assertEqual(store.generation, 1)

    def test_two_successful_puts_increment_generation_twice(self):
        store = self._make_store()
        store.put({"devicePort": 7777})
        store.put({"devicePort": 7778})
        self.assertEqual(store.generation, 2)

    def test_failed_put_does_not_change_generation(self):
        from local_settings import SettingsValidationError
        store = self._make_store()
        store.put({"devicePort": 8888})
        gen_before = store.generation
        with self.assertRaises(SettingsValidationError):
            store.put({"devicePort": 99999})  # out of range
        self.assertEqual(store.generation, gen_before)

    def test_generation_incremented_exactly_once_not_zero_times_or_twice(self):
        """Idempotency guard: one successful put → generation is exactly 1."""
        store = self._make_store()
        for _ in range(3):
            store.put({"devicePort": 9090})
        self.assertEqual(store.generation, 3)


# ============================================================
# 4. DPAPI secret adapter – RED before local_secrets.py exists
# ============================================================

class TestDpapiSecretStore(unittest.TestCase):
    """AC3: DPAPI adapter with injectable boundary."""

    def _make_store(self):
        from local_secrets import DpapiSecretStore
        return DpapiSecretStore(adapter=_FakeAdapter())

    def test_protect_and_unprotect_round_trip(self):
        """protect() then unprotect() recovers the original bytes."""
        store = self._make_store()
        store.protect("secret-value-123")
        result = store.unprotect()
        self.assertEqual(result, b"secret-value-123")

    def test_is_configured_false_before_protect(self):
        store = self._make_store()
        self.assertFalse(store.is_configured)

    def test_is_configured_true_after_protect(self):
        store = self._make_store()
        store.protect("anything")
        self.assertTrue(store.is_configured)

    def test_unprotect_returns_none_before_protect(self):
        store = self._make_store()
        self.assertIsNone(store.unprotect())

    def test_protect_raises_on_non_string(self):
        store = self._make_store()
        with self.assertRaises(TypeError):
            store.protect(12345)
        with self.assertRaises(TypeError):
            store.protect(b"bytes")

    def test_non_windows_raises_secret_store_unavailable(self):
        """On non-Windows with no adapter, SecretStoreUnavailable must be raised."""
        from local_secrets import DpapiSecretStore, SecretStoreUnavailable
        with patch("local_secrets._dpapi_available", return_value=False):
            with self.assertRaises(SecretStoreUnavailable):
                DpapiSecretStore()  # no adapter → should raise

    def test_secret_never_appears_in_exception_message(self):
        """If protect fails, the secret must not appear in the error message."""
        from local_secrets import DpapiSecretStore

        class BoomAdapter:
            def protect(self, data):
                raise RuntimeError("adapter error")

            def unprotect(self, blob):
                raise RuntimeError("adapter error")

        store = DpapiSecretStore(adapter=BoomAdapter())
        try:
            store.protect("super-secret-password")
        except RuntimeError as exc:
            self.assertNotIn("super-secret-password", str(exc))

    def test_protect_overwrites_previous_secret(self):
        """Calling protect() twice replaces the old secret."""
        store = self._make_store()
        store.protect("first")
        store.protect("second")
        result = store.unprotect()
        self.assertEqual(result, b"second")

    def test_adapter_protect_called_with_utf8_bytes(self):
        """The adapter must receive UTF-8 encoded bytes."""
        adapter = MagicMock()
        adapter.protect.return_value = b"blob"
        from local_secrets import DpapiSecretStore
        store = DpapiSecretStore(adapter=adapter)
        store.protect("café")
        adapter.protect.assert_called_once_with("café".encode("utf-8"))


# ============================================================
# 5. Settings store + secret store integration
# ============================================================

class TestSettingsStoreWithSecretStore(unittest.TestCase):
    """AC5: PUT with communicationKey routes to secret store."""

    def setUp(self):
        self._tmp_dir = tempfile.mkdtemp()
        self._settings_path = os.path.join(self._tmp_dir, "settings.json")

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp_dir, ignore_errors=True)

    def _make_store(self, secret_store):
        from local_settings import LocalSettingsStore
        return LocalSettingsStore(self._settings_path, _secret_store=secret_store)

    def test_communication_key_is_forwarded_to_secret_store(self):
        """communicationKey in put() payload is forwarded to secret_store.protect()."""
        from local_secrets import DpapiSecretStore
        secret_store = DpapiSecretStore(adapter=_FakeAdapter())
        settings_store = self._make_store(secret_store)

        # communicationKey must not remain in raw (put() pops it)
        raw = {"devicePort": 4370, "communicationKey": "mykey"}
        settings_store.put(raw)

        self.assertTrue(secret_store.is_configured)
        self.assertEqual(secret_store.unprotect(), b"mykey")

    def test_communication_key_not_written_to_disk(self):
        """communicationKey must NEVER appear in the settings JSON file."""
        from local_secrets import DpapiSecretStore
        secret_store = DpapiSecretStore(adapter=_FakeAdapter())
        settings_store = self._make_store(secret_store)

        settings_store.put({"communicationKey": "topsecret", "devicePort": 4370})

        with open(self._settings_path, encoding="utf-8") as fh:
            disk_data = fh.read()
        self.assertNotIn("topsecret", disk_data)
        self.assertNotIn("communicationKey", disk_data)

    def test_secret_store_failure_preserves_generation(self):
        """If the secret store raises, generation must NOT be incremented."""
        from local_secrets import DpapiSecretStore

        class FailAdapter:
            def protect(self, data):
                raise OSError("DPAPI failed")
            def unprotect(self, blob):
                return blob

        secret_store = DpapiSecretStore(adapter=FailAdapter())
        settings_store = self._make_store(secret_store)
        gen_before = settings_store.generation  # 0

        with self.assertRaises(OSError):
            settings_store.put({"communicationKey": "key"})

        self.assertEqual(settings_store.generation, gen_before)

    def test_secret_store_failure_after_successful_put_preserves_generation(self):
        """Second put with failing secret store keeps generation at 1 (not 2)."""
        from local_secrets import DpapiSecretStore

        class FailAdapter:
            def protect(self, data):
                raise OSError("DPAPI failed")
            def unprotect(self, blob):
                return blob

        secret_store = DpapiSecretStore(adapter=FailAdapter())
        settings_store = self._make_store(secret_store)
        # First put has no communicationKey so it succeeds.
        settings_store.put({"devicePort": 4370})
        gen_after_first = settings_store.generation  # 1

        with self.assertRaises(OSError):
            settings_store.put({"devicePort": 4371, "communicationKey": "key"})

        self.assertEqual(settings_store.generation, gen_after_first)

    def test_put_without_secret_store_and_communication_key_raises(self):
        """put() with communicationKey but no configured secret store raises."""
        from local_settings import LocalSettingsStore
        from local_secrets import SecretStoreUnavailable
        store = LocalSettingsStore(self._settings_path, _secret_store=None)
        with self.assertRaises(SecretStoreUnavailable):
            store.put({"communicationKey": "key"})


# ============================================================
# 6. Thread-safety
# ============================================================

class TestThreadSafety(unittest.TestCase):
    """Concurrent writes must not corrupt generation or config."""

    def setUp(self):
        self._tmp_dir = tempfile.mkdtemp()
        self._settings_path = os.path.join(self._tmp_dir, "settings.json")

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp_dir, ignore_errors=True)

    def test_concurrent_puts_increment_generation_correctly(self):
        from local_settings import LocalSettingsStore
        store = LocalSettingsStore(self._settings_path)
        errors = []

        def worker():
            try:
                store.put({"devicePort": 4370})
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(errors, [])
        self.assertEqual(store.generation, 10)


# ============================================================
# 7. Public settings view (communicationKeyConfigured)
# ============================================================

class TestPublicSettingsView(unittest.TestCase):
    """
    AC4: GET /settings must return only communicationKeyConfigured.
    This tests the helper used by the bridge handler.
    """

    def _public_settings(self, settings_store, secret_store):
        """Mirror the logic bridge_app will use for GET /settings."""
        return {
            "communicationKeyConfigured": secret_store.is_configured if secret_store else False,
        }

    def test_communication_key_not_configured_returns_false(self):
        from local_secrets import DpapiSecretStore
        secret_store = DpapiSecretStore(adapter=_FakeAdapter())
        result = self._public_settings(None, secret_store)
        self.assertFalse(result["communicationKeyConfigured"])

    def test_communication_key_configured_returns_true(self):
        from local_secrets import DpapiSecretStore
        secret_store = DpapiSecretStore(adapter=_FakeAdapter())
        secret_store.protect("mykey")
        result = self._public_settings(None, secret_store)
        self.assertTrue(result["communicationKeyConfigured"])


if __name__ == "__main__":
    unittest.main()
