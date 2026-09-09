import json
import sys
from pathlib import Path
from open_mrz_engine import ENGINE

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def main():
    img_dir = Path(__file__).resolve().parent / "images"
    images = sorted(list(img_dir.glob("*.jpg")) + list(img_dir.glob("*.png")))

    print("=" * 72)
    print(">> TESTING 100% PERMISSIVE CLEAN-ROOM MRZ OCR")
    print("   (OpenCV Morphology + Tesseract OCR-B, Apache 2.0 / MIT / BSD)")
    print("=" * 72)

    for img in images:
        print(f"\n[IMAGE]: {img.name}")
        res = ENGINE.recognize_image(img)
        d = res.get("data", {})
        print(f"Time: {res.get('duration_ms')}ms | Engine: {res.get('engine')}")
        print(f"  * Loai giay to / Doc Type:      {d.get('document_type')} [{d.get('format')}]")
        print(f"  * Ho va ten / Full Name:         {d.get('full_name')}")
        print(f"  * So giay to / Document No:      {d.get('document_number')}")
        print(f"  * Quoc tich / Nationality:       {d.get('nationality')}")
        print(f"  * Noi cap / Issuing State:       {d.get('issuing_state')}")
        print(f"  * Ngay sinh / Date of Birth:     {d.get('birth_date')}")
        print(f"  * Gioi tinh / Gender:            {d.get('gender')}")
        print(f"  * Ngay het han / Expiry Date:    {d.get('expiry_date')}")
        if d.get("visa_number"):
            print(f"  * So thi thuc / Visa No:         {d.get('visa_number')}")
        status = "Hop le / Valid (100% ICAO Doc 9303)" if d.get("is_valid") else "Can kiem tra / Check required"
        print(f"  * Trang thai / Status:           {status}")
        print(f"  * Ghi chu / Note:                {d.get('format_note')}")
        print(f"  * Chi tiet Checksums:            {json.dumps(d.get('checksums', {}), ensure_ascii=False)}")
        print(f"  * Raw MRZ lines:                 {res.get('raw_lines')}")

if __name__ == "__main__":
    main()
