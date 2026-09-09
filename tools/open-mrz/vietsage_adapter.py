from __future__ import annotations


def _success(item: dict, data: dict) -> dict:
    gender = {"M": "Nam", "F": "Nữ"}.get(data.get("gender_code"))
    return {
        "index": item.get("index"),
        "filename": item.get("filename"),
        "success": True,
        "documentKind": "visa" if data.get("document_type") == "Visa" or data.get("format") in ("MRVA", "MRVB") else "passport",
        "format": data.get("format"),
        "mrzValid": data.get("is_valid") is True,
        "identityNumber": data.get("document_number", ""),
        "fullName": data.get("full_name", ""),
        "dateOfBirth": data.get("birth_date_iso"),
        "gender": gender,
        "nationality": data.get("nationality_code") or data.get("nationality"),
        "expiryDate": data.get("expiry_date_iso"),
    }


def _qr_cccd_success(item: dict, data: dict) -> dict:
    """Map QR CCCD result to VietSage format."""
    gender = {"M": "Nam", "F": "Nữ"}.get(data.get("gender_code"))
    return {
        "index": item.get("index"),
        "filename": item.get("filename"),
        "success": True,
        "documentKind": "passport",  # CCCD maps to the same guest structure
        "format": "QR_CCCD",
        "mrzValid": True,
        "identityNumber": data.get("document_number", ""),
        "fullName": data.get("full_name", ""),
        "dateOfBirth": data.get("birth_date_iso"),
        "gender": gender,
        "nationality": data.get("nationality") or "Việt Nam",
        "residencePlace": data.get("residence_place", ""),
        "guestDisplayName": data.get("full_name", ""),
        "guestIdentityNumber": data.get("document_number", ""),
        "guestDateOfBirth": data.get("birth_date_iso"),
        "guestGender": gender,
        "guestNationality": data.get("nationality") or "Việt Nam",
        "guestResidencePlace": data.get("residence_place", ""),
    }


def build_vietsage_batch_response(batch: dict) -> dict:
    results = []
    for item in batch.get("results", []):
        data = item.get("data") or {}
        if not item.get("success"):
            results.append({
                "index": item.get("index"),
                "filename": item.get("filename"),
                "success": False,
                "code": item.get("error") or "MRZ_FORMAT_INVALID",
                "error": item.get("message") or "Không nhận diện được tài liệu MRZ",
            })
        elif data.get("format") == "QR_CCCD":
            # QR CCCD — tra ket qua thanh cong voi cac truong CCCD
            results.append(_qr_cccd_success(item, data))
        elif data.get("format") == "TD1" or data.get("document_type") == "ID Card":
            results.append({
                "index": item.get("index"),
                "filename": item.get("filename"),
                "success": False,
                "code": "TD1_NOT_SUPPORTED",
                "error": "OCR CCCD không được hỗ trợ",
            })
        else:
            results.append(_success(item, data))
    successful = sum(item["success"] for item in results)
    return {
        "total": len(results),
        "successful": successful,
        "failed": len(results) - successful,
        "results": results,
    }
