import json
import unittest

from vietsage_adapter import build_vietsage_batch_response


class TestVietSageAdapter(unittest.TestCase):
    def test_preserves_engine_results_redacts_mrz_and_blocks_td1(self):
        response = build_vietsage_batch_response({
            "results": [
                {"index": 1, "filename": "passport.jpg", "success": True, "data": {
                    "document_type": "Passport", "format": "TD3", "is_valid": True,
                    "document_number": "PASS123", "full_name": "PASSPORT HOLDER",
                    "nationality_code": "VNM", "raw_lines": ["SECRET"],
                }},
                {"index": 2, "filename": "visa.jpg", "success": True, "data": {
                    "document_type": "Visa", "format": "MRVA", "is_valid": False,
                    "document_number": "VISA123", "full_name": "VISA HOLDER",
                    "nationality_code": "CHN", "raw_lines": ["SECRET"],
                }},
                {"index": 3, "filename": "id.jpg", "success": True, "data": {
                    "document_type": "ID Card", "format": "TD1",
                }},
                {"index": 4, "filename": "blur.jpg", "success": False,
                 "error": "IMAGE_TOO_BLURRY", "message": "Ảnh bị mờ."},
            ],
        })

        self.assertEqual(response["total"], 4)
        self.assertEqual(response["successful"], 2)
        self.assertEqual(response["failed"], 2)
        self.assertEqual(response["results"][0]["documentKind"], "passport")
        self.assertEqual(response["results"][1]["documentKind"], "visa")
        self.assertEqual(response["results"][1]["mrzValid"], False)
        self.assertEqual(response["results"][2]["code"], "TD1_NOT_SUPPORTED")
        self.assertEqual(response["results"][3]["code"], "IMAGE_TOO_BLURRY")
        self.assertNotIn("raw_lines", json.dumps(response))

if __name__ == "__main__":
    unittest.main()
