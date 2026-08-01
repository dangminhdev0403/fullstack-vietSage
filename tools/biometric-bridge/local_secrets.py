"""
local_secrets.py – Windows user-scoped DPAPI secret adapter.

Design rules (Slice 2):
  - Windows only, user scope (CRYPTPROTECT_UI_FORBIDDEN).
  - No plaintext fallback under any circumstance.
  - Non-Windows or unavailable ctypes → raise SecretStoreUnavailable.
  - Never log, print, or return the plaintext secret.
  - Public surface: protect(plaintext: str) → None
                    unprotect() → bytes   (consumed immediately, never cached)
  - Injectable boundary: DpapiSecretStore(adapter=None) accepts a test adapter
    that replaces the real ctypes calls.
"""

import os
import sys
import threading


class SecretStoreUnavailable(Exception):
    """Raised when the DPAPI secret store is not available or not on Windows."""


# ---------------------------------------------------------------------------
# Low-level DPAPI shim
# ---------------------------------------------------------------------------

def _dpapi_available() -> bool:
    """Return True only when running on Windows with ctypes access."""
    return sys.platform == "win32"


def _dpapi_protect(plaintext_bytes: bytes) -> bytes:
    """
    Encrypt *plaintext_bytes* with Windows DPAPI (user scope).

    Raises SecretStoreUnavailable if not on Windows.
    Raises OSError if CryptProtectData fails.
    """
    if not _dpapi_available():
        raise SecretStoreUnavailable(
            "DPAPI not available: running on non-Windows platform"
        )
    import ctypes
    import ctypes.wintypes  # only importable on Windows

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", ctypes.wintypes.DWORD),
                    ("pbData", ctypes.POINTER(ctypes.c_char))]

    buf = ctypes.create_string_buffer(plaintext_bytes)
    src = DATA_BLOB(cbData=len(plaintext_bytes), pbData=buf)
    dst = DATA_BLOB()
    # CRYPTPROTECT_UI_FORBIDDEN = 0x1 (no UI prompt)
    ok = ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(src),
        None,   # description
        None,   # optional entropy
        None,   # reserved
        None,   # prompt struct
        0x1,    # CRYPTPROTECT_UI_FORBIDDEN
        ctypes.byref(dst),
    )
    if not ok:
        raise OSError("CryptProtectData failed")
    try:
        return bytes(ctypes.string_at(dst.pbData, dst.cbData))
    finally:
        ctypes.windll.kernel32.LocalFree(dst.pbData)


def _dpapi_unprotect(blob: bytes) -> bytes:
    """
    Decrypt a DPAPI blob back to plaintext bytes.

    Raises SecretStoreUnavailable if not on Windows.
    Raises OSError if CryptUnprotectData fails.
    """
    if not _dpapi_available():
        raise SecretStoreUnavailable(
            "DPAPI not available: running on non-Windows platform"
        )
    import ctypes
    import ctypes.wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", ctypes.wintypes.DWORD),
                    ("pbData", ctypes.POINTER(ctypes.c_char))]

    buf = ctypes.create_string_buffer(blob)
    src = DATA_BLOB(cbData=len(blob), pbData=buf)
    dst = DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(src),
        None,   # description (out)
        None,   # optional entropy
        None,   # reserved
        None,   # prompt struct
        0x1,    # CRYPTPROTECT_UI_FORBIDDEN
        ctypes.byref(dst),
    )
    if not ok:
        raise OSError("CryptUnprotectData failed")
    try:
        return bytes(ctypes.string_at(dst.pbData, dst.cbData))
    finally:
        ctypes.windll.kernel32.LocalFree(dst.pbData)


# ---------------------------------------------------------------------------
# Injectable adapter protocol
# ---------------------------------------------------------------------------

class _RealDpapiAdapter:
    """Wraps the actual ctypes DPAPI calls."""

    def protect(self, plaintext_bytes: bytes) -> bytes:
        return _dpapi_protect(plaintext_bytes)

    def unprotect(self, blob: bytes) -> bytes:
        return _dpapi_unprotect(blob)


# ---------------------------------------------------------------------------
# Public store
# ---------------------------------------------------------------------------

class DpapiSecretStore:
    """
    User-scoped DPAPI secret store for the bridge communicationKey.

    Parameters
    ----------
    adapter:   Injectable in tests.  Must expose protect(bytes)->bytes
               and unprotect(bytes)->bytes.  Defaults to the real DPAPI
               adapter (raises SecretStoreUnavailable on non-Windows).
    """

    def __init__(self, adapter=None):
        if adapter is None:
            if not _dpapi_available():
                raise SecretStoreUnavailable(
                    "DpapiSecretStore requires Windows; "
                    "use a test adapter or run on Windows"
                )
            adapter = _RealDpapiAdapter()
        self._adapter = adapter
        self._lock = threading.Lock()
        self._blob: bytes | None = None  # encrypted ciphertext in memory

    def protect(self, plaintext: str) -> None:
        """
        Encrypt and store *plaintext* using DPAPI.

        The plaintext is encoded as UTF-8, encrypted, and the ciphertext
        is held in memory.  The plaintext is never stored, logged, or returned.

        Raises SecretStoreUnavailable if DPAPI is unavailable.
        Raises TypeError if plaintext is not a str.
        """
        if not isinstance(plaintext, str):
            raise TypeError("communicationKey phải là chuỗi")
        plaintext_bytes = plaintext.encode("utf-8")
        encrypted = self._adapter.protect(plaintext_bytes)
        with self._lock:
            self._blob = encrypted
        # Wipe the local plaintext bytes variable from the reference chain.
        del plaintext_bytes

    def unprotect(self) -> bytes:
        """
        Decrypt and return the protected secret as raw bytes.

        The returned bytes should be consumed immediately and not stored.
        Returns None if no secret has been protected yet.

        Raises SecretStoreUnavailable if DPAPI is unavailable.
        """
        with self._lock:
            blob = self._blob
        if blob is None:
            return None
        return self._adapter.unprotect(blob)

    @property
    def is_configured(self) -> bool:
        """True if a secret has been protected (blob is non-None)."""
        with self._lock:
            return self._blob is not None
