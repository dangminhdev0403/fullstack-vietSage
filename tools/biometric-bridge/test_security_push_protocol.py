"""
test_security_push_protocol.py - Unit tests for Phase 0 Security PUSH protocol contracts.
"""

import unittest
import base64
from security_push_protocol import (
    validate_pin,
    sanitize_name,
    validate_jpeg,
    build_user_command,
    build_biophoto_command,
    parse_ack,
    parse_rtlog_or_transaction,
    upload_response,
    mask_sn,
    mask_pin,
)


class TestSecurityPushProtocol(unittest.TestCase):
    def test_opaque_numeric_pin_validation(self):
        # Valid numeric PINs of various lengths (without CCCD length restrictions)
        self.assertEqual(validate_pin("1"), "1")
        self.assertEqual(validate_pin("123"), "123")
        self.assertEqual(validate_pin("00123"), "00123")
        self.assertEqual(validate_pin("700000000001"), "700000000001")
        self.assertEqual(validate_pin(12345), "12345")
        self.assertEqual(validate_pin("999999999999999999"), "999999999999999999")

        # Invalid PINs: non-numeric characters, empty strings, None
        with self.assertRaises(ValueError):
            validate_pin("123a")
        with self.assertRaises(ValueError):
            validate_pin("abc")
        with self.assertRaises(ValueError):
            validate_pin("12-34")
        with self.assertRaises(ValueError):
            validate_pin("")
        with self.assertRaises(ValueError):
            validate_pin("   ")
        with self.assertRaises(ValueError):
            validate_pin(None)

    def test_sanitize_name_tabs_and_newlines(self):
        raw_name = "Nguyen\tVan\r\nA"
        sanitized = sanitize_name(raw_name)
        self.assertNotIn("\t", sanitized)
        self.assertNotIn("\r", sanitized)
        self.assertNotIn("\n", sanitized)
        self.assertEqual(sanitized, "Nguyen Van  A")

    def test_jpeg_soi_eoi_and_bounded_size_validation(self):
        valid_jpeg = b"\xff\xd8\x00\x10JFIF\x00\xff\xd9"
        self.assertTrue(validate_jpeg(valid_jpeg))

        # Rejects missing SOI or EOI
        with self.assertRaises(ValueError):
            validate_jpeg(b"\x00\xd8\xff\xd9")
        with self.assertRaises(ValueError):
            validate_jpeg(b"\xff\xd8\xff\x00")
        with self.assertRaises(ValueError):
            validate_jpeg(b"not a jpeg")

        # Rejects empty or non-bytes
        with self.assertRaises(ValueError):
            validate_jpeg(b"")
        with self.assertRaises(ValueError):
            validate_jpeg("string")

        # Bounded size validation
        with self.assertRaises(ValueError):
            validate_jpeg(valid_jpeg, max_size=5)  # len is 10 > 5

    def test_nonzero_cmd_id_required(self):
        valid_jpeg = b"\xff\xd8\xff\xd9"
        with self.assertRaises(ValueError):
            build_user_command(0, "12345", "Test User")
        with self.assertRaises(ValueError):
            build_user_command(-1, "12345", "Test User")
        with self.assertRaises(ValueError):
            build_biophoto_command(0, "12345", valid_jpeg)

    def test_build_user_command_format(self):
        cmd = build_user_command(10, "12345", "Nguyen\tVan\nA")
        self.assertTrue(cmd.startswith("C:10:DATA UPDATE user "))
        self.assertIn("Pin=12345", cmd)
        self.assertIn("Name=Nguyen Van A", cmd)

    def test_build_biophoto_command_format_and_exact_base64_size(self):
        photo = b"\xff\xd8\x00\x00\xff\xd9"
        cmd = build_biophoto_command(11, "12345", photo)
        self.assertTrue(cmd.startswith("C:11:DATA UPDATE biophoto "))
        self.assertIn("PIN=12345", cmd)
        self.assertIn("Type=9", cmd)

        # Verify Base64 Size exact match
        b64_str = base64.b64encode(photo).decode("ascii")
        expected_size = len(b64_str)
        self.assertIn(f"Size={expected_size}", cmd)
        self.assertIn(f"Content={b64_str}", cmd)

    def test_parse_ack_preserving_raw_return_and_cmd_id(self):
        parsed = parse_ack("ID=100&Return=0&CMD=DATA")
        self.assertEqual(parsed, {"cmd_id": 100, "return_code": 0})

        parsed_neg = parse_ack("ID=101&return=-100")
        self.assertEqual(parsed_neg, {"cmd_id": 101, "return_code": -100})

        parsed_space = parse_ack("Return=-1 ID=5")
        self.assertEqual(parsed_space, {"cmd_id": 5, "return_code": -1})

        # Invalid ACK format
        self.assertIsNone(parse_ack("INVALID_ACK_BODY"))

    def test_parse_rtlog_or_transaction_preserving_raw_fields(self):
        # Tab-separated positional line
        line = "2026-08-01 12:30:00\t12345\t15\t1\t0\t0"
        parsed = parse_rtlog_or_transaction(line, sn="TEST-SN", source_table="transaction")
        self.assertEqual(parsed["pin"], "12345")
        self.assertEqual(parsed["timestamp"], "2026-08-01 12:30:00")
        self.assertEqual(parsed["verifytype"], "15")
        self.assertEqual(parsed["event_code"], "1")
        self.assertEqual(parsed["device_index"], "0")
        self.assertEqual(parsed["in_out_status"], "0")
        self.assertEqual(parsed["source_table"], "transaction")
        self.assertEqual(parsed["sn"], "TEST-SN")
        self.assertIn("raw_fields", parsed)

        # Tab-separated key-value line
        kv_line = "time=2026-08-01 12:30:00\tpin=54321\tverifytype=1010000000000000\tevent=0\tindex=77\tinoutstatus=1\textra=val"
        parsed_kv = parse_rtlog_or_transaction(kv_line, sn="TEST-SN", source_table="rtlog")
        self.assertEqual(parsed_kv["pin"], "54321")
        self.assertEqual(parsed_kv["verifytype"], "1010000000000000")
        self.assertEqual(parsed_kv["event_code"], "0")
        self.assertEqual(parsed_kv["device_index"], "77")
        self.assertEqual(parsed_kv["in_out_status"], "1")
        self.assertEqual(parsed_kv["raw_fields"].get("extra"), "val")

    def test_upload_response_fdata_returns_ok(self):
        resp = upload_response("/iclock/fdata", {})
        self.assertEqual(resp, "OK")

    def test_safe_masked_logging(self):
        self.assertEqual(mask_sn("2145254200013"), "***0013")
        self.assertEqual(mask_pin("034205005951"), "***5951")
        self.assertEqual(mask_sn("12"), "***12")
        self.assertEqual(mask_pin(""), "***")


if __name__ == "__main__":
    unittest.main()
