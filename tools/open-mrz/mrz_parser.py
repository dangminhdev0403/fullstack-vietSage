"""
Bo boc tach du lieu MRZ ICAO Doc 9303 (TD1, TD2, TD3, MRVA, Vietnam eVisa)
Dinh dang: Tieng Anh + Tieng Viet khong dau (Bilingual English & Non-accented Vietnamese)
Khong loi font/encoding, tuong thich 100% moi he thong.
"""
from __future__ import annotations
import re
from datetime import datetime

# Mapping tach bach ro rang giua Country Name (cho Issuing State) va Nationality / Demonym (cho Nationality)
COUNTRY_DATA: dict[str, dict[str, str]] = {
    "VNM": {
        "countryName": "Viet Nam",
        "nationalityName": "Vietnamese",
    },
    "CHN": {
        "countryName": "China",
        "nationalityName": "Chinese",
    },
    "RUS": {
        "countryName": "Russia",
        "nationalityName": "Russian",
    },
    "KOR": {
        "countryName": "South Korea",
        "nationalityName": "Korean",
    },
    "USA": {
        "countryName": "United States",
        "nationalityName": "American",
    },
    "GBR": {
        "countryName": "United Kingdom",
        "nationalityName": "British",
    },
    "FRA": {
        "countryName": "France",
        "nationalityName": "French",
    },
    "DEU": {
        "countryName": "Germany",
        "nationalityName": "German",
    },
    "JPN": {
        "countryName": "Japan",
        "nationalityName": "Japanese",
    },
    "AUS": {
        "countryName": "Australia",
        "nationalityName": "Australian",
    },
    "CAN": {
        "countryName": "Canada",
        "nationalityName": "Canadian",
    },
    "SGP": {
        "countryName": "Singapore",
        "nationalityName": "Singaporean",
    },
    "THA": {
        "countryName": "Thailand",
        "nationalityName": "Thai",
    },
    "MYS": {
        "countryName": "Malaysia",
        "nationalityName": "Malaysian",
    },
    "IDN": {
        "countryName": "Indonesia",
        "nationalityName": "Indonesian",
    },
    "PHL": {
        "countryName": "Philippines",
        "nationalityName": "Filipino",
    },
    "TWN": {
        "countryName": "Taiwan",
        "nationalityName": "Taiwanese",
    },
    "HKG": {
        "countryName": "Hong Kong",
        "nationalityName": "Hong Kong",
    },
    "IND": {
        "countryName": "India",
        "nationalityName": "Indian",
    },
    "KHM": {
        "countryName": "Cambodia",
        "nationalityName": "Cambodian",
    },
    "LAO": {
        "countryName": "Laos",
        "nationalityName": "Laotian",
    },
    "MMR": {
        "countryName": "Myanmar",
        "nationalityName": "Burmese",
    },
    "ITA": {
        "countryName": "Italy",
        "nationalityName": "Italian",
    },
    "ESP": {
        "countryName": "Spain",
        "nationalityName": "Spanish",
    },
    "NLD": {
        "countryName": "Netherlands",
        "nationalityName": "Dutch",
    },
    "CHE": {
        "countryName": "Switzerland",
        "nationalityName": "Swiss",
    },
    "SWE": {
        "countryName": "Sweden",
        "nationalityName": "Swedish",
    },
    "NOR": {
        "countryName": "Norway",
        "nationalityName": "Norwegian",
    },
    "DNK": {
        "countryName": "Denmark",
        "nationalityName": "Danish",
    },
    "FIN": {
        "countryName": "Finland",
        "nationalityName": "Finnish",
    },
    "POL": {
        "countryName": "Poland",
        "nationalityName": "Polish",
    },
    "UKR": {
        "countryName": "Ukraine",
        "nationalityName": "Ukrainian",
    },
    "TUR": {
        "countryName": "Turkey",
        "nationalityName": "Turkish",
    },
    "BRA": {
        "countryName": "Brazil",
        "nationalityName": "Brazilian",
    },
    "ARG": {
        "countryName": "Argentina",
        "nationalityName": "Argentine",
    },
    "MEX": {
        "countryName": "Mexico",
        "nationalityName": "Mexican",
    },
    "NZL": {
        "countryName": "New Zealand",
        "nationalityName": "New Zealander",
    },
    "ZAF": {
        "countryName": "South Africa",
        "nationalityName": "South African",
    },
    "EGY": {
        "countryName": "Egypt",
        "nationalityName": "Egyptian",
    },
    "ARE": {
        "countryName": "United Arab Emirates",
        "nationalityName": "Emirati",
    },
    "SAU": {
        "countryName": "Saudi Arabia",
        "nationalityName": "Saudi",
    },
    "ISR": {
        "countryName": "Israel",
        "nationalityName": "Israeli",
    },
    "QAT": {
        "countryName": "Qatar",
        "nationalityName": "Qatari",
    },
    "IRN": {
        "countryName": "Iran",
        "nationalityName": "Iranian",
    },
    "IRQ": {
        "countryName": "Iraq",
        "nationalityName": "Iraqi",
    },
    "PAK": {
        "countryName": "Pakistan",
        "nationalityName": "Pakistani",
    },
    "BGD": {
        "countryName": "Bangladesh",
        "nationalityName": "Bangladeshi",
    },
    "LKA": {
        "countryName": "Sri Lanka",
        "nationalityName": "Sri Lankan",
    },
    "NPL": {
        "countryName": "Nepal",
        "nationalityName": "Nepalese",
    },
    "MNG": {
        "countryName": "Mongolia",
        "nationalityName": "Mongolian",
    },
    "KAZ": {
        "countryName": "Kazakhstan",
        "nationalityName": "Kazakhstani",
    },
    "UZB": {
        "countryName": "Uzbekistan",
        "nationalityName": "Uzbekistani",
    },
    "AUT": {
        "countryName": "Austria",
        "nationalityName": "Austrian",
    },
    "BEL": {
        "countryName": "Belgium",
        "nationalityName": "Belgian",
    },
    "CZE": {
        "countryName": "Czech Republic",
        "nationalityName": "Czech",
    },
    "GRC": {
        "countryName": "Greece",
        "nationalityName": "Greek",
    },
    "HUN": {
        "countryName": "Hungary",
        "nationalityName": "Hungarian",
    },
    "IRL": {
        "countryName": "Ireland",
        "nationalityName": "Irish",
    },
    "PRT": {
        "countryName": "Portugal",
        "nationalityName": "Portuguese",
    },
    "ROU": {
        "countryName": "Romania",
        "nationalityName": "Romanian",
    },
}

def normalize_country_code(code: str) -> str:
    """Chuan hoa ma quoc gia 3 ky tu (vi du K0R -> KOR, VN0 -> VNM)"""
    if not code:
        return ""
    code = code.upper().replace("<", "")
    mapping = {"0": "O", "1": "I", "8": "B"}
    cleaned = "".join(mapping.get(c, c) for c in code)
    return cleaned[:3]

def format_issuing_state(code: str) -> tuple[str, str, str]:
    """
    Format Issuing State theo TÊN QUỐC GIA (Country Name, không dùng demonym):
    Ví dụ:
      VNM -> ('Viet Nam [VNM]', 'Viet Nam', 'VNM')
      CHN -> ('China [CHN]', 'China', 'CHN')
      RUS -> ('Russia [RUS]', 'Russia', 'RUS')
      KOR -> ('South Korea [KOR]', 'South Korea', 'KOR')
    """
    clean_code = normalize_country_code(code)
    info = COUNTRY_DATA.get(clean_code)
    if info and "countryName" in info:
        name = info["countryName"]
        display = f"{name} [{clean_code}]"
    else:
        name = clean_code
        display = clean_code
    return display, name, clean_code

def format_nationality(code: str) -> tuple[str, str, str]:
    """
    Format Nationality theo DEMONYM / QUỐC TỊCH (không dùng tên quốc gia):
    Ví dụ:
      VNM -> ('Vietnamese [VNM]', 'Vietnamese', 'VNM')
      CHN -> ('Chinese [CHN]', 'Chinese', 'CHN')
      RUS -> ('Russian [RUS]', 'Russian', 'RUS')
      KOR -> ('Korean [KOR]', 'Korean', 'KOR')
    """
    clean_code = normalize_country_code(code)
    info = COUNTRY_DATA.get(clean_code)
    if info and "nationalityName" in info:
        name = info["nationalityName"]
        display = f"{name} [{clean_code}]"
    else:
        name = clean_code
        display = clean_code
    return display, name, clean_code

def clean_digits(s: str) -> str:
    """Chuan hoa chuoi so trong truong ngay thang va check digit (O->0, I->1, Z->2, S->5, B->8)."""
    if not s:
        return ""
    mapping = {"O": "0", "D": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8"}
    return "".join(mapping.get(c, c) for c in s.upper())

def compute_check_digit(s: str) -> int:
    weights = [7, 3, 1]
    total = 0
    for i, c in enumerate(s):
        if c == "<":
            v = 0
        elif "0" <= c <= "9":
            v = ord(c) - ord("0")
        elif "A" <= c <= "Z":
            v = ord(c) - ord("A") + 10
        else:
            v = 0
        total += v * weights[i % 3]
    return total % 10

def format_date_fields(yymmdd: str, is_expiry: bool = False) -> tuple[str, str]:
    """
    Tra ve tuple:
    - date_dmy: 'DD/MM/YYYY' (Hien thi chuan giao dien)
    - date_iso: 'YYYY-MM-DD' (Luu Database / Backend)
    """
    if len(yymmdd) != 6 or not yymmdd.isdigit():
        return yymmdd, yymmdd
    yy = int(yymmdd[:2])
    mm = yymmdd[2:4]
    dd = yymmdd[4:6]

    current_yy = datetime.now().year % 100
    if is_expiry:
        century = "20"
    else:
        century = "19" if yy > current_yy else "20"

    date_dmy = f"{dd}/{mm}/{century}{yy:02d}"
    date_iso = f"{century}{yy:02d}-{mm}-{dd}"
    return date_dmy, date_iso

def parse_gender(char: str) -> tuple[str, str, str]:
    """
    Tra ve (display_str, gender_name, code):
    Vi du M -> ('Male [M]', 'Male', 'M')
    """
    c = char.upper()
    if c == "M":
        return "Male [M]", "Male", "M"
    if c == "F":
        return "Female [F]", "Female", "F"
    code = c if c != "<" else "X"
    return f"Other [{code}]", "Other", code

def parse_mrz(lines: list[str]) -> dict:
    cleaned = [re.sub(r"\s+", "", l).upper() for l in lines if l and len(l.strip()) >= 20]
    if not cleaned:
        return {"success": False, "error": "Khong co du lieu dong MRZ / No MRZ lines found"}

    # 1. Dinh dang 2 dong (Ho chieu TD3 hoac Thi thuc MRVA/MRVB)
    if len(cleaned) >= 2 and len(cleaned[0]) >= 30 and len(cleaned[1]) >= 30:
        l1 = cleaned[0].ljust(44, "<")[:44]
        l2 = cleaned[1].ljust(44, "<")[:44]

        is_vn_visa = bool(len(l2) >= 30 and l2[13:21].isdigit() and l2[22] in ("M", "F", "<"))
        is_visa = bool(l1.startswith("V") or is_vn_visa or "VNM" in l1[:6])
        doc_type = "Visa" if is_visa else "Passport"
        format_name = "MRVA" if is_visa else "TD3"
        issuing_code = "VNM" if is_vn_visa else l1[2:5]
        iss_display, iss_name, iss_code = format_issuing_state(issuing_code)

        # Tach Ho va Ten (Dong 1)
        name_part = l1[5:]
        if "<<" in name_part:
            surname, given_names = name_part.split("<<", 1)
        elif "<" in name_part:
            surname, given_names = name_part.split("<", 1)
        else:
            surname, given_names = name_part, ""
        surname = re.sub(r"[^A-Z ]", "", surname.replace("<", " ")).strip()
        given_names = re.sub(r"[^A-Z ]", "", given_names.replace("<", " ")).strip()
        full_name = f"{surname} {given_names}".strip()

        # Dong 2
        doc_num = l2[0:9].replace("<", "")
        doc_num_cd = clean_digits(l2[9])
        doc_num_valid = doc_num_cd.isdigit() and compute_check_digit(l2[0:9]) == int(doc_num_cd)
        # Tu dong sua ky tu nham O va 0 neu checksum khop sau khi sua
        if not doc_num_valid and "O" in doc_num:
            alt_doc = doc_num.replace("O", "0")
            if doc_num_cd.isdigit() and compute_check_digit(alt_doc) == int(doc_num_cd):
                doc_num = alt_doc
                doc_num_valid = True

        nat_display, nat_name, nat_code = format_nationality(l2[10:13])
        visa_number = None

        # Truong hop Visa Viet Nam (ngay sinh DDMMYYYY va vi tri M/F o index 22)
        if is_visa and l2[22] in ("M", "F", "<"):
            dob_raw = clean_digits(l2[13:21])  # DDMMYYYY
            if len(dob_raw) == 8 and dob_raw.isdigit():
                birth_date = f"{dob_raw[0:2]}/{dob_raw[2:4]}/{dob_raw[4:8]}"
                birth_date_iso = f"{dob_raw[4:8]}-{dob_raw[2:4]}-{dob_raw[0:2]}"
            else:
                birth_date, birth_date_iso = dob_raw, dob_raw

            gender_display, gender_name, gender_code = parse_gender(l2[22])

            exp_raw = clean_digits(l2[23:29])  # YYMMDD
            expiry_date, expiry_date_iso = format_date_fields(exp_raw, is_expiry=True)
            exp_cd = clean_digits(l2[29])
            exp_valid = exp_cd.isdigit() and compute_check_digit(exp_raw) == int(exp_cd)

            visa_number = l2[30:39].replace("<", "").strip()
            passport_number = doc_num
            optional_data = l2[30:44].replace("<", " ").strip()

            dob_valid = None
            composite_valid = None
            is_valid = True if doc_num_valid and exp_valid else False
            format_note = "Vietnam eVisa"
        else:
            # Format TD3 tieu chuan quoc te ICAO Doc 9303 Part 4
            dob_raw = clean_digits(l2[13:19])
            dob_cd = clean_digits(l2[19])
            dob_valid = dob_cd.isdigit() and compute_check_digit(dob_raw) == int(dob_cd)
            birth_date, birth_date_iso = format_date_fields(dob_raw, is_expiry=False)

            gender_display, gender_name, gender_code = parse_gender(l2[20])

            exp_raw = clean_digits(l2[21:27])
            exp_cd = clean_digits(l2[27])
            exp_valid = exp_cd.isdigit() and compute_check_digit(exp_raw) == int(exp_cd)
            expiry_date, expiry_date_iso = format_date_fields(exp_raw, is_expiry=True)

            passport_number = doc_num
            optional_data = l2[28:43].replace("<", " ").strip()

            composite_string = l2[0:10] + l2[13:20] + l2[21:43]
            composite_expected = clean_digits(l2[43])
            composite_calc = str(compute_check_digit(composite_string))
            composite_valid = (composite_expected == composite_calc)

            is_valid = bool(doc_num_valid and dob_valid and exp_valid and composite_valid)
            format_note = "ICAO Doc 9303 TD3"

        res = {
            "success": True,
            "document_type": doc_type,
            "format": format_name,
            "format_note": format_note,
            "full_name": full_name,
            "surname": surname,
            "given_names": given_names,
            "document_number": passport_number,
            "nationality": nat_display,
            "nationality_code": nat_code,
            "nationality_name": nat_name,
            "issuing_state": iss_display,
            "issuing_state_code": iss_code,
            "issuing_state_name": iss_name,
            "birth_date": birth_date,
            "birth_date_iso": birth_date_iso,
            "gender": gender_display,
            "gender_code": gender_code,
            "gender_name": gender_name,
            "expiry_date": expiry_date,
            "expiry_date_iso": expiry_date_iso,
            "optional_data": optional_data,
            "is_valid": is_valid,
            "checksums": {
                "document_number": doc_num_valid,
                "birth_date": dob_valid,
                "expiry_date": exp_valid,
                "composite": composite_valid
            },
            "raw_lines": [l1, l2]
        }
        if visa_number:
            res["visa_number"] = visa_number
            res["passport_number"] = passport_number
        return res

    # 2. Dinh dang 3 dong 30 ky tu (The can cuoc TD1 / CCCD)
    if len(cleaned) >= 3 and len(cleaned[0]) >= 28:
        l1 = cleaned[0].ljust(30, "<")[:30]
        l2 = cleaned[1].ljust(30, "<")[:30]
        l3 = cleaned[2].ljust(30, "<")[:30]

        iss_display, iss_name, iss_code = format_issuing_state(l1[2:5])
        doc_num = l1[5:14].replace("<", "")
        doc_num_cd = clean_digits(l1[14])
        doc_num_valid = doc_num_cd.isdigit() and compute_check_digit(l1[5:14]) == int(doc_num_cd)
        if not doc_num_valid and "O" in doc_num:
            alt_doc = doc_num.replace("O", "0")
            if doc_num_cd.isdigit() and compute_check_digit(alt_doc) == int(doc_num_cd):
                doc_num = alt_doc
                doc_num_valid = True

        dob_raw = clean_digits(l2[0:6])
        dob_cd = clean_digits(l2[6])
        dob_valid = dob_cd.isdigit() and compute_check_digit(dob_raw) == int(dob_cd)
        birth_date, birth_date_iso = format_date_fields(dob_raw, is_expiry=False)

        gender_display, gender_name, gender_code = parse_gender(l2[7])

        exp_raw = clean_digits(l2[8:14])
        exp_cd = clean_digits(l2[14])
        exp_valid = exp_cd.isdigit() and compute_check_digit(exp_raw) == int(exp_cd)
        expiry_date, expiry_date_iso = format_date_fields(exp_raw, is_expiry=True)

        nat_display, nat_name, nat_code = format_nationality(l2[15:18])

        name_part = l3
        if "<<" in name_part:
            surname, given_names = name_part.split("<<", 1)
        else:
            surname, given_names = name_part, ""
        surname = surname.replace("<", " ").strip()
        given_names = given_names.replace("<", " ").strip()

        td1_comp_string = l1[5:30] + l2[0:7] + l2[8:15] + l2[18:29]
        td1_comp_expected = clean_digits(l2[29])
        td1_comp_calc = str(compute_check_digit(td1_comp_string))
        td1_comp_valid = (td1_comp_expected == td1_comp_calc)

        is_valid = bool(doc_num_valid and dob_valid and exp_valid and td1_comp_valid)

        return {
            "success": True,
            "document_type": "ID Card",
            "format": "TD1",
            "format_note": "ICAO Doc 9303 TD1",
            "full_name": f"{surname} {given_names}".strip(),
            "surname": surname,
            "given_names": given_names,
            "document_number": doc_num,
            "nationality": nat_display,
            "nationality_code": nat_code,
            "nationality_name": nat_name,
            "issuing_state": iss_display,
            "issuing_state_code": iss_code,
            "issuing_state_name": iss_name,
            "birth_date": birth_date,
            "birth_date_iso": birth_date_iso,
            "gender": gender_display,
            "gender_code": gender_code,
            "gender_name": gender_name,
            "expiry_date": expiry_date,
            "expiry_date_iso": expiry_date_iso,
            "is_valid": is_valid,
            "checksums": {
                "document_number": doc_num_valid,
                "birth_date": dob_valid,
                "expiry_date": exp_valid,
                "composite": td1_comp_valid
            },
            "raw_lines": [l1, l2, l3]
        }

    return {"success": False, "error": "Khong khop dinh dang chuan MRZ (TD1, TD2, TD3, MRVA)"}
