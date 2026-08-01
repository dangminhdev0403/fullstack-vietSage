"""
local_settings.py – non-secret bridge settings with atomic persistence.

Design rules (Slice 2):
  - Atomic write: write to same-dir tempfile, flush+fsync, os.replace.
    A failed os.replace leaves the old config intact.
  - Strict schema validation: only known fields, typed values.
  - Generation counter incremented exactly once after full success.
  - No secrets stored here; communicationKey is handled by local_secrets.py.
"""

import ipaddress
import json
import os
import re
import threading
import uuid

# ---------------------------------------------------------------------------
# Known fields and their validators
# ---------------------------------------------------------------------------

_LOOPBACK_ADDRS = frozenset(("127.0.0.1", "::1", "localhost"))

_ORIGIN_RE = re.compile(
    r"^https?://(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[a-zA-Z0-9.-]+)"
    r"(?::\d{1,5})?$"
)

_PATH_RE = re.compile(r"^[^\x00]+$")  # Non-null, non-empty string


class SettingsValidationError(ValueError):
    """Raised when a settings dict fails schema validation."""


def _validate_ipv4(field, value):
    try:
        addr = ipaddress.ip_address(value)
    except ValueError:
        raise SettingsValidationError(f"{field}: phải là địa chỉ IPv4 hợp lệ")
    if addr.version != 4:
        raise SettingsValidationError(f"{field}: phải là IPv4, không phải IPv6")
    return str(addr)


def _validate_port(field, value):
    if not isinstance(value, int) or isinstance(value, bool):
        raise SettingsValidationError(f"{field}: phải là số nguyên")
    if not 1 <= value <= 65535:
        raise SettingsValidationError(f"{field}: cổng phải từ 1 đến 65535")
    return value


def _validate_origin(field, value):
    if not isinstance(value, str):
        raise SettingsValidationError(f"{field}: phải là chuỗi")
    if not _ORIGIN_RE.fullmatch(value):
        raise SettingsValidationError(
            f"{field}: phải là http:// hoặc https:// origin hợp lệ"
        )
    return value


def _validate_origins_list(field, value):
    if not isinstance(value, list):
        raise SettingsValidationError(f"{field}: phải là danh sách")
    if not value:
        raise SettingsValidationError(f"{field}: danh sách không được rỗng")
    return [_validate_origin(f"{field}[{i}]", v) for i, v in enumerate(value)]


def _validate_path_str(field, value):
    if not isinstance(value, str) or not value.strip():
        raise SettingsValidationError(f"{field}: phải là đường dẫn không rỗng")
    if not _PATH_RE.fullmatch(value):
        raise SettingsValidationError(f"{field}: đường dẫn chứa ký tự không hợp lệ")
    return value


def _validate_loopback_addr(field, value):
    if not isinstance(value, str):
        raise SettingsValidationError(f"{field}: phải là chuỗi")
    if value not in _LOOPBACK_ADDRS:
        raise SettingsValidationError(
            f"{field}: API browser-facing chỉ được bind loopback (127.0.0.1, ::1, localhost)"
        )
    return value


# Mapping: field_name -> (required, validator_fn)
_FIELD_SPECS = {
    "deviceIp":       (False, lambda f, v: _validate_ipv4(f, v)),
    "devicePort":     (False, lambda f, v: _validate_port(f, v)),
    "pushListen":     (False, lambda f, v: _validate_ipv4(f, v)),
    "pushPort":       (False, lambda f, v: _validate_port(f, v)),
    "apiListen":      (False, lambda f, v: _validate_loopback_addr(f, v)),
    "apiPort":        (False, lambda f, v: _validate_port(f, v)),
    "allowedOrigins": (False, lambda f, v: _validate_origins_list(f, v)),
    "apiCert":        (False, lambda f, v: _validate_path_str(f, v)),
    "apiKey":         (False, lambda f, v: _validate_path_str(f, v)),
    "pushCert":       (False, lambda f, v: _validate_path_str(f, v)),
    "pushKey":        (False, lambda f, v: _validate_path_str(f, v)),
    # communicationKey is NOT allowed here – it is a secret (local_secrets.py)
}


def validate_settings(raw: dict) -> dict:
    """
    Validate *raw* against the strict settings schema.

    Returns a new dict with validated (and type-normalised) values.
    Raises SettingsValidationError on any violation, including unknown fields.
    """
    if not isinstance(raw, dict):
        raise SettingsValidationError("Settings phải là JSON object")

    unknown = set(raw.keys()) - set(_FIELD_SPECS.keys())
    if unknown:
        raise SettingsValidationError(
            f"Trường không được phép: {', '.join(sorted(unknown))}"
        )

    out = {}
    for field, (required, validator) in _FIELD_SPECS.items():
        if field in raw:
            out[field] = validator(field, raw[field])
        elif required:
            raise SettingsValidationError(f"{field}: trường bắt buộc")

    return out


# ---------------------------------------------------------------------------
# Atomic persistence
# ---------------------------------------------------------------------------

class LocalSettingsStore:
    """
    Thread-safe store for non-secret local settings.

    Persistence is atomic: a tempfile in the same directory is written,
    flushed, fsynced, then renamed over the target path.  If the rename
    fails (e.g. cross-device move), the original file is untouched.

    generation is incremented exactly once after a full successful
    validate → write → replace cycle.  Any failure preserves both the
    in-memory running config and the generation counter.
    """

    def __init__(self, path: str, _secret_store=None):
        """
        Parameters
        ----------
        path:          absolute path to the JSON settings file.
        _secret_store: optional injectable secret store (for DPAPI adapter);
                       used only by put() when communicationKey is provided.
        """
        self._path = path
        self._lock = threading.RLock()
        self._running: dict = {}
        self._generation: int = 0
        self._secret_store = _secret_store

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    @property
    def generation(self) -> int:
        with self._lock:
            return self._generation

    def get_running(self) -> dict:
        """Return a copy of the current in-memory running settings."""
        with self._lock:
            return dict(self._running)

    def load(self) -> dict:
        """
        Read and validate the settings file.

        If the file does not exist, returns {}.
        Raises SettingsValidationError if the file contains invalid data.
        """
        try:
            with open(self._path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
        except FileNotFoundError:
            return {}
        validated = validate_settings(raw)
        with self._lock:
            self._running = validated
        return validated

    def put(self, raw: dict) -> dict:
        """
        Validate *raw*, persist atomically, update generation.

        If communicationKey is present in raw, it is extracted and
        forwarded to _secret_store.protect() before validation of
        non-secret fields.  The communicationKey is NEVER written to disk.

        Returns the validated non-secret settings that were persisted.
        Raises SettingsValidationError on validation failure.
        Raises any OS error raised by the file system (caller sees it;
        running config and generation are NOT changed on failure).
        """
        # Extract secret before schema validation so it never touches the
        # non-secret validator or disk.
        comm_key = raw.pop("communicationKey", None) if isinstance(raw, dict) else None

        # Validate non-secret fields; raises on error (running config preserved).
        validated = validate_settings(raw)

        # Persist secret first; if it fails we must NOT advance generation.
        if comm_key is not None:
            if self._secret_store is None:
                from local_secrets import SecretStoreUnavailable
                raise SecretStoreUnavailable(
                    "communicationKey provided but no secret store configured"
                )
            # Raises SecretStoreUnavailable / OSError on failure.
            self._secret_store.protect(comm_key)

        # Serialize replace plus publication: Windows rejects concurrent replaces.
        with self._lock:
            self._atomic_write(validated)
            self._running = dict(validated)
            self._generation += 1

        return dict(validated)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _atomic_write(self, data: dict) -> None:
        """Write *data* to a tempfile then atomically rename to self._path."""
        directory = os.path.dirname(os.path.abspath(self._path))
        # Use a UUID so concurrent writes on the same file do not collide.
        tmp_path = os.path.join(directory, f".settings_tmp_{uuid.uuid4().hex}")
        try:
            with open(tmp_path, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp_path, self._path)
        except Exception:
            # Best-effort cleanup of orphaned tempfile.
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
