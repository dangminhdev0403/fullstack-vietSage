"""
security_push_protocol.py - Phase 0 Security PUSH protocol emulator contracts.

Uses Python stdlib only.
Implements opaque PIN validation, JPEG validation, PUSH command builders,
ACK parsing, rtlog/transaction parsing, fdata handling, and safe logging.
"""

import base64
import re
from typing import Any, Dict, Optional


def validate_pin(value: Any) -> str:
    """
    Validate opaque numeric PIN without CCCD length semantics.

    Accepts any non-empty numeric string or integer composed only of digits.
    Raises ValueError if value is missing, non-numeric, or empty.
    """
    if value is None:
        raise ValueError("PIN line/value cannot be None")

    pin_str = str(value).strip()
    if not pin_str or not re.fullmatch(r"\d+", pin_str):
        raise ValueError(f"Invalid numeric PIN: {value!r}")
    return pin_str


def sanitize_name(name: Any) -> str:
    """
    Sanitize name field by replacing tabs and newlines with spaces.
    """
    clean_name = str(name or "").replace("\t", " ").replace("\r", " ").replace("\n", " ")
    return clean_name[:24]


def validate_jpeg(photo: bytes, max_size: int = 1024 * 1024) -> bool:
    """
    Validate JPEG bytes with SOI (0xFF 0xD8), EOI (0xFF 0xD9), and bounded size.
    """
    if not isinstance(photo, bytes):
        raise ValueError("Photo data must be bytes")

    photo_len = len(photo)
    if photo_len == 0 or photo_len > max_size:
        raise ValueError(f"Photo size {photo_len} bytes out of bounds (1..{max_size})")

    if not photo.startswith(b"\xff\xd8") or not photo.endswith(b"\xff\xd9"):
        raise ValueError("Photo missing valid JPEG SOI (0xFF 0xD8) or EOI (0xFF 0xD9) markers")

    return True


def build_user_command(cmd_id: int, pin: Any, name: Any) -> str:
    """
    Build PUSH command for user creation/update.

    Enforces non-zero CmdID, numeric PIN, and sanitized name.
    """
    if not isinstance(cmd_id, int) or cmd_id <= 0:
        raise ValueError(f"CmdID must be a positive non-zero integer, got: {cmd_id!r}")

    valid_pin = validate_pin(pin)
    clean_name = sanitize_name(name)

    return (
        f"C:{cmd_id}:DATA UPDATE user "
        f"CardNo=\tPin={valid_pin}\tPassword=\tGroup=0\tStartTime=0\tEndTime=0\t"
        f"Name={clean_name}\tPrivilege=0\tDisable=0"
    )


def build_biophoto_command(cmd_id: int, pin: Any, photo: bytes, max_size: int = 1024 * 1024) -> str:
    """
    Build PUSH command for Type=9 biophoto.

    Enforces non-zero CmdID, numeric PIN, valid JPEG, Type=9, and exact Base64 size.
    """
    if not isinstance(cmd_id, int) or cmd_id <= 0:
        raise ValueError(f"CmdID must be a positive non-zero integer, got: {cmd_id!r}")

    valid_pin = validate_pin(pin)
    validate_jpeg(photo, max_size=max_size)

    encoded_b64 = base64.b64encode(photo).decode("ascii")
    exact_size = len(encoded_b64)

    return (
        f"C:{cmd_id}:DATA UPDATE biophoto "
        f"PIN={valid_pin}\tType=9\tNo=0\tIndex=0\tSize={exact_size}\t"
        f"Content={encoded_b64}\tFormat=0\tPostBackTmpFlag=1"
    )


def parse_ack(body: str) -> Optional[Dict[str, int]]:
    """
    Parse PUSH command ACK response body, preserving raw Return integer code
    and matching command ID.

    Returns dict with 'cmd_id' and 'return_code', or None if unparseable.
    """
    if not body or not isinstance(body, str):
        return None

    id_match = re.search(r"(?:^|[&\s\n])ID=(\d+)(?:[&\s\n]|$)", body, re.IGNORECASE)
    ret_match = re.search(r"(?:^|[&\s\n])(?:Return|return)=(-?\d+)(?:[&\s\n]|$)", body, re.IGNORECASE)

    if not id_match or not ret_match:
        return None

    return {
        "cmd_id": int(id_match.group(1)),
        "return_code": int(ret_match.group(1)),
    }


def parse_rtlog_or_transaction(
    body_line: str, sn: Optional[str] = None, source_table: str = ""
) -> Dict[str, Any]:
    """
    Parse real-time attendance transaction/rtlog line, preserving raw fields and verifytype.

    Supports both tab-separated positional lines and key-value formats.
    """
    line = str(body_line or "").strip()
    fields = line.split("\t")

    raw_fields_map = {}
    is_kv = any("=" in f for f in fields)

    if is_kv:
        for f in fields:
            if "=" in f:
                k, v = f.split("=", 1)
                raw_fields_map[k.strip()] = v.strip()

        pin = raw_fields_map.get("pin") or raw_fields_map.get("PIN") or raw_fields_map.get("user_id") or ""
        timestamp = raw_fields_map.get("time") or raw_fields_map.get("timestamp") or ""
        verifytype_raw = raw_fields_map.get("verifytype") or raw_fields_map.get("verify_type") or ""
        eventcode_raw = raw_fields_map.get("event") or raw_fields_map.get("eventcode") or raw_fields_map.get("status") or ""
        device_index = raw_fields_map.get("index", "")
        in_out_status = raw_fields_map.get("inoutstatus", "")
    else:
        # Standard tab-separated positional fields: [timestamp, pin, verifytype, eventcode, inoutstatus, workcode]
        timestamp = fields[0] if len(fields) > 0 else ""
        pin = fields[1] if len(fields) > 1 else ""
        verifytype_raw = fields[2] if len(fields) > 2 else ""
        eventcode_raw = fields[3] if len(fields) > 3 else ""
        in_out_status = fields[4] if len(fields) > 4 else ""
        device_index = fields[5] if len(fields) > 5 else ""

        for idx, val in enumerate(fields):
            raw_fields_map[f"col_{idx}"] = val

    return {
        "sn": sn or "unknown",
        "pin": pin,
        "timestamp": timestamp,
        "verifytype": str(verifytype_raw),
        "event_code": str(eventcode_raw),
        "device_index": str(device_index),
        "in_out_status": str(in_out_status),
        "source_table": source_table,
        "raw_line": line,
        "raw_fields": raw_fields_map,
    }


def upload_response(path: str, query: Dict[str, Any]) -> str:
    """
    Generate response for PUSH data upload requests.

    /iclock/fdata responds OK without blocking /getrequest.
    """
    if path == "/iclock/fdata":
        return "OK"

    table = query.get("tablename", [""])[0] if isinstance(query, dict) else ""
    count = query.get("count", ["1"])[0] if isinstance(query, dict) else "1"

    return f"{table}={count}" if table else "OK"


def mask_sn(sn: Any) -> str:
    """
    Safe masked logging for Serial Numbers.
    """
    s = str(sn or "").strip()
    return f"***{s[-4:]}" if s else "***"


def mask_pin(pin: Any) -> str:
    """
    Safe masked logging for PINs.
    """
    p = str(pin or "").strip()
    return f"***{p[-4:]}" if p else "***"

