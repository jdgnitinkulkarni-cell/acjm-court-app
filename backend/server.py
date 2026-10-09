from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import asyncio
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from html import escape as html_escape
from html.parser import HTMLParser

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT_DIR = Path(__file__).parent
FRONTEND_BUILD = ROOT_DIR.parent / "frontend" / "build"
DATA_FILE = ROOT_DIR / "local_data.json"
DRAFT_DIR = ROOT_DIR / "deposition_drafts"
VERSION_DIR = ROOT_DIR / "deposition_versions"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "ahmedabad@2026")
STAFF_DEFAULT_LOGIN = os.environ.get("STAFF_DEFAULT_LOGIN", "Staff")
STAFF_DEFAULT_PASSWORD = os.environ.get("STAFF_DEFAULT_PASSWORD", "Staff@123")
JWT_SECRET = os.environ.get("JWT_SECRET", "local-acjm-court-secret-change-me")
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "168"))
ASR_MAX_AUDIO_MB = int(os.environ.get("ASR_MAX_AUDIO_MB", "25"))

app = FastAPI(title="ACJM Court App")
api = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


def _asr_multipart_body(fields: Dict[str, str], file_field: str, filename: str, content_type: str, data: bytes):
    boundary = f"----acjm-asr-{uuid.uuid4().hex}"
    chunks = []
    for key, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
        chunks.append(str(value).encode("utf-8"))
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}\r\n".encode("utf-8"))
    chunks.append(
        (
            f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'
            f"Content-Type: {content_type or 'application/octet-stream'}\r\n\r\n"
        ).encode("utf-8")
    )
    chunks.append(data)
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), boundary


def _extract_asr_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload.strip()
    if isinstance(payload, list):
        for item in payload:
            found = _extract_asr_text(item)
            if found:
                return found
        return ""
    if not isinstance(payload, dict):
        return ""
    for key in ("text", "transcript", "transcription", "recognized_text", "recognizedText", "output"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            found = _extract_asr_text(value)
            if found:
                return found
        if isinstance(value, list):
            for item in value:
                found = _extract_asr_text(item)
                if found:
                    return found
    for value in payload.values():
        if isinstance(value, (dict, list)):
            found = _extract_asr_text(value)
            if found:
                return found
    return ""


def _call_configured_asr_service(
    audio_bytes: bytes,
    filename: str,
    content_type: str,
    language: str,
) -> Dict[str, Any]:
    provider = os.environ.get("ASR_PROVIDER", "disabled").strip().lower()
    service_url = os.environ.get("ASR_SERVICE_URL", "").strip()
    if not service_url or provider in ("", "disabled", "none", "browser"):
        raise HTTPException(
            503,
            "AI voice typing is not configured. Set ASR_PROVIDER=ai4bharat_http and ASR_SERVICE_URL to enable it.",
        )

    api_key = os.environ.get("ASR_API_KEY", "").strip()
    timeout = float(os.environ.get("ASR_TIMEOUT_SECONDS", "45"))
    fields = {
        "language": language,
        "source_language": language,
        "input_language": language,
    }
    body, boundary = _asr_multipart_body(fields, "audio", filename, content_type, audio_bytes)
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept": "application/json",
        "X-ASR-Provider": provider,
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    request = urllib.request.Request(service_url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            response_type = response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise HTTPException(exc.code, f"ASR service rejected the audio: {detail}") from exc
    except urllib.error.URLError as exc:
        raise HTTPException(503, f"ASR service is unavailable: {exc.reason}") from exc

    if "application/json" in response_type.lower():
        payload = json.loads(raw.decode("utf-8"))
    else:
        payload = raw.decode("utf-8", "replace")
    text = _extract_asr_text(payload)
    # An empty transcript is normal for a silent/noise-only chunk.
    return {"text": text or "", "provider": provider, "language": language}


def hash_pw(password: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return f"{salt}${base64.b64encode(digest).decode('ascii')}"


def verify_pw(password: str, stored: str) -> bool:
    try:
      salt, _ = stored.split("$", 1)
      return hmac.compare_digest(hash_pw(password, salt), stored)
    except Exception:
      return False


def sign_token(payload: dict) -> str:
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(JWT_SECRET.encode(), raw.encode(), hashlib.sha256).digest()
    return f"{raw}.{base64.urlsafe_b64encode(sig).decode().rstrip('=')}"


def read_token(token: str) -> dict:
    try:
        raw, sig = token.split(".", 1)
        expected = hmac.new(JWT_SECRET.encode(), raw.encode(), hashlib.sha256).digest()
        given = base64.urlsafe_b64decode(sig + "=" * (-len(sig) % 4))
        if not hmac.compare_digest(expected, given):
            raise ValueError("bad signature")
        payload = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode())
        if payload.get("exp", 0) < datetime.now(timezone.utc).timestamp():
            raise HTTPException(401, "Token expired")
        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid token")


def make_token(sub: str, role: str, login_id: str) -> str:
    # "sv" (session version) lets a password / User ID change end older sign-ins.
    sv = 0
    try:
        u = next((x for x in load_store().get("users", []) if x.get("id") == sub), None)
        sv = int((u or {}).get("session_version") or 0)
    except Exception:
        sv = 0
    return sign_token({
        "sub": sub,
        "role": role,
        "login_id": login_id,
        "sv": sv,
        "exp": (datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)).timestamp(),
    })


def blank_store():
    return {
        "users": [],
        "courts": [],
        "admin_excel": None,
        "pleas": [],
        "primary_fs": [],
        "final_fs_questions": [],
        "final_fs_entries": [],
        "applications": [],
        "pursis": [],
        "surety_bonds": [],
        "case_log": [],
        "laws": [],
        "complainants": [],
        "limitation_calendar": {},
        "depositions": [],
        "orders": [],
        "statements_183": [],
    }


def load_store():
    if not DATA_FILE.exists():
        return blank_store()
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        merged = blank_store()
        merged.update(data)
        return merged
    except Exception:
        return blank_store()


def save_store(data: dict):
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def safe_draft_part(value: str, fallback: str) -> str:
    text = (value or fallback or "").strip()
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", text)
    text = re.sub(r"\s+", " ", text).strip(" ._")
    return (text or fallback or "draft")[:80]


def html_has_meaningful_content(html: str) -> bool:
    if not html:
        return False
    if re.search(r"<\s*(img|table)\b", html, flags=re.IGNORECASE):
        return True
    text = re.sub(r"<[^>]+>", " ", html)
    text = text.replace("&nbsp;", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return bool(text)


def parse_iso(value: str) -> datetime:
    try:
        return datetime.fromisoformat((value or "").replace("Z", "+00:00"))
    except Exception:
        return datetime.fromtimestamp(0, timezone.utc)


def ensure_deposition_draft_file(dep: dict) -> Path:
    DRAFT_DIR.mkdir(parents=True, exist_ok=True)
    existing = dep.get("draft_file")
    if existing:
        name = Path(existing).name
    else:
        start = parse_iso(dep.get("start_time_iso") or dep.get("created_at") or now_iso())
        stamp = start.strftime("%Y%m%d_%H%M%S")
        case_part = safe_draft_part(dep.get("primary_case_number"), "case")
        witness_part = safe_draft_part(dep.get("witness_name"), "witness")
        name = f"{case_part}_{witness_part}_{stamp}_{dep.get('id', new_id())[:8]}.html"
        dep["draft_file"] = name
    return DRAFT_DIR / name


def read_deposition_draft(dep: dict) -> str:
    name = dep.get("draft_file")
    if not name:
        return ""
    path = DRAFT_DIR / Path(name).name
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def write_deposition_draft(dep: dict, html: str) -> str:
    path = ensure_deposition_draft_file(dep)
    path.write_text(html or "", encoding="utf-8")
    return path.name


def append_deposition_version(dep: dict, html: str):
    VERSION_DIR.mkdir(parents=True, exist_ok=True)
    dep_id = dep.get("id") or new_id()
    version = int(dep.get("version") or 0)
    payload = {
        "deposition_id": dep_id,
        "deposition_code": dep.get("deposition_code") or "",
        "version": version,
        "case_number": dep.get("primary_case_number") or "",
        "witness_name": dep.get("witness_name") or "",
        "updated_at": dep.get("updated_at") or now_iso(),
        "html": html or "",
    }
    version_file = VERSION_DIR / f"{safe_draft_part(dep_id, 'dep')}.jsonl"
    with version_file.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def deposition_effective_body(dep: dict) -> str:
    draft = read_deposition_draft(dep)
    if html_has_meaningful_content(draft):
        return draft
    return dep.get("body_html") or ""


def latest_matching_deposition_body(data: dict, dep: dict) -> str:
    case_no = (dep.get("primary_case_number") or "").strip().lower()
    witness = (dep.get("witness_name") or "").strip().lower()
    if not case_no or not witness:
        return ""
    matches = []
    for item in data.get("depositions", []):
        if item.get("id") == dep.get("id"):
            continue
        if item.get("judge_user_id") != dep.get("judge_user_id"):
            continue
        if item.get("court_id") != dep.get("court_id"):
            continue
        if (item.get("primary_case_number") or "").strip().lower() != case_no:
            continue
        if (item.get("witness_name") or "").strip().lower() != witness:
            continue
        body = deposition_effective_body(item)
        if html_has_meaningful_content(body):
            matches.append((parse_iso(item.get("updated_at") or item.get("created_at")), body))
    if not matches:
        return ""
    matches.sort(key=lambda row: row[0], reverse=True)
    return matches[0][1]


def without_password(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}


def seed_store():
    data = load_store()
    admin = next((u for u in data["users"] if u.get("role") == "admin"), None)
    if not admin:
        data["users"].append({
            "id": new_id(),
            "role": "admin",
            "login_id": "admin",
            "password_hash": hash_pw(ADMIN_PASSWORD),
            "must_change": False,
            "created_at": now_iso(),
        })
    elif not admin.get("password_changed") and not verify_pw(ADMIN_PASSWORD, admin["password_hash"]):
        # Keeps the configured password unless the Administrator changed it from My Profile.
        admin["password_hash"] = hash_pw(ADMIN_PASSWORD)

    if not any(u.get("role") == "staff" for u in data["users"]):
        data["users"].append({
            "id": new_id(),
            "role": "staff",
            "login_id": STAFF_DEFAULT_LOGIN,
            "password_hash": hash_pw(STAFF_DEFAULT_PASSWORD),
            "must_change": True,
            "created_at": now_iso(),
        })

    if not data["courts"]:
        data["courts"].append({
            "id": new_id(),
            "english": {
                "court_name": "Hon'ble SARAS N. I. Court No. 2, CJM Courts, Ahmedabad City (Hon'ble Shri. V. P. Kohli Sir).",
                "place": "Ahmedabad City.",
                "judge_name": "V. P. Kohli",
                "judge_designation": "42nd ACJM",
            },
            "gujarati": {
                "court_name": "મહે. સરસ એન. આઈ. કોર્ટ ન. ૦૨, સી. જે. એમ. કોર્ટ, અમદાવાદ શહેર (શ્રી. વી. પી. કોહલી સાહેબ).",
                "place": "અમદાવાદ શહેર.",
                "judge_name": "વી. પી. કોહલી",
                "judge_designation": "૪૨ માં એ.સી.જે.એમ.",
            },
            "is_default": True,
            "created_at": now_iso(),
        })
    default_court = next((c for c in data["courts"] if c.get("is_default")), data["courts"][0] if data["courts"] else None)
    if default_court:
        staff_user = next((u for u in data["users"] if u.get("role") == "staff"), None)
        if staff_user and not staff_user.get("court_id"):
            staff_user["court_id"] = default_court["id"]

        if not any(u.get("role") == "judge" for u in data["users"]):
            data["users"].append({
                "id": new_id(),
                "role": "judge",
                "login_id": "Judge1",
                "password_hash": hash_pw("Judge@123"),
                "must_change": True,
                "court_ids": [default_court["id"]],
                "created_at": now_iso(),
            })
    if not data.get("laws"):
        data["laws"] = [
            {
                "id": new_id(),
                "english": "Sec. 138 of The Negotiable Instruments Act, 1881",
                "gujarati": "કલમ. ૧૩૮ ધી. નેગોશેબલ ઇન્સ્ટ્રુમેન્ટ અધિનિયમ, ૧૮૮૧",
                "applies_to": ["plea", "application", "pursis", "surety"],
                "created_at": now_iso(),
            },
            {
                "id": new_id(),
                "english": "Sec. 25 of The Payment & Settlement Systems Act, 2007",
                "gujarati": "કલમ ૨૫ ધી પેમેન્ટ અને સેટલમેન્ટ સીસ્ટમ અધિનિયમ, ૨૦૦૭",
                "applies_to": ["plea", "application", "pursis", "surety"],
                "created_at": now_iso(),
            },
        ]
    if not data.get("complainants"):
        names = [
            "A U Small Finance", "Aditya Birla", "Amar Micro Credit", "Aris Capital Pvt Ltd", "Arka Fincap Ltd",
            "Avanse Financial Services Ltd", "Axis Bank Ltd", "Bajaj Finance Ltd", "Bajaj Housing Finance Ltd",
            "C.J.Finance", "Chinmay Finlease Ltd", "Cholamandalam", "DCB Bank Ltd", "Electronica Finance Ltd",
            "Equitas Small FinanceBank Ltd", "FedBank Ltd", "Fintree Finance Pvt Ltd", "HDB Fianancial Services Ltd",
            "Indusind Bank Ltd", "J.M.Fianncial Home Loans Ltd", "Khushboo Auto Finance", "Kotak Mahindra Bank Ltd",
            "Madhur Installments Pvt Ltd", "Mahindra and Mahindra Finance Ltd", "Mannapuram Finance Ltd",
            "Mass Rural Housing", "Motilal Oswal Home Finance Ltd", "Muthoot Homefin India Ltd", "P J Credit Capital Pvt Ltd",
            "Ranip Nagrik Sahkari Sharafi Mandali Ltd", "RBL Bank Ltd", "SARVP Financial Services Ltd",
            "Shriram Fiannce Ltd", "SI CREVA CAPITAL SERVICES", "SMGF India Credit Co Ltd", "SARVAGRAM FInance",
            "Sundaram Fianance", "Tata Capital Housing Finance Ltd", "Tata Capital Ltd", "Tata Motors",
            "Tyger Capital Pvt Ltd", "Ujjaivan Small Fianance Ltd", "Yes Bank Ltd",
        ]
        data["complainants"] = [
            {"id": new_id(), "name": name, "created_at": now_iso()}
            for name in sorted(dict.fromkeys(names), key=lambda n: n.lower())
        ]

    # Demo/test records for exercising deposition entry and print flows in all
    # supported languages. Stable IDs make this block safe to run repeatedly.
    if default_court:
        judge_user = next((u for u in data["users"] if u.get("role") == "judge"), None)
        if judge_user:
            court_id = default_court["id"]
            judge_id = judge_user["id"]

            def ensure_test_case(case_number: str, complainant: str, accused: str):
                existing = next(
                    (c for c in data["case_log"] if case_matches(c, court_id, case_number)),
                    None,
                )
                payload = {
                    "court_id": court_id,
                    "case_number": case_number,
                    "complainant_name": complainant,
                    "accused_name": accused,
                    "updated_at": now_iso(),
                }
                if existing:
                    existing.update(payload)
                else:
                    payload["id"] = f"test-case-{safe_draft_part(case_number, 'case').lower()}"
                    payload["created_at"] = now_iso()
                    data["case_log"].append(payload)

            def add_test_deposition(doc: dict, html: str):
                if any(d.get("id") == doc["id"] for d in data.get("depositions", [])):
                    return
                now_value = now_iso()
                dep = {
                    "court_id": court_id,
                    "judge_user_id": judge_id,
                    "mode": "new",
                    "resume_of": None,
                    "client_start_time_iso": doc.get("start_time_iso", ""),
                    "status": "in_progress",
                    "draft_status": "ACTIVE",
                    "body_html": html,
                    "document_json": {"type": "html", "html": html},
                    "version": 1,
                    "hostile_declared": False,
                    "cross_started": False,
                    "adjourn_reason": "",
                    "adjourn_next_date": "",
                    "adjourn_for": "",
                    "complete_time_display": "",
                    "date_display": "",
                    "created_at": now_value,
                    "updated_at": now_value,
                    "av_conferencing": False,
                    "vulnerable_witness": False,
                    "case_specific_details": {},
                    **doc,
                }
                dep["draft_file"] = write_deposition_draft(dep, html)
                append_deposition_version(dep, html)
                data.setdefault("depositions", []).append(dep)

            ensure_test_case("TEST-GUJ-101/2026", "Axis Bank Ltd.", "રમેશભાઈ મહેશભાઈ પટેલ")
            ensure_test_case("TEST-GUJ-102/2026", "Shriram Finance Ltd.", "સુરેશભાઈ મહેશભાઈ પટેલ")
            ensure_test_case("TEST-HIN-201/2026", "Bajaj Finance Ltd.", "मोहनलाल शर्मा")
            ensure_test_case("TEST-HIN-202/2026", "HDB Financial Services Ltd.", "सीमा वर्मा")
            ensure_test_case("TEST-ENG-301/2026", "Tata Capital Ltd.", "Ramesh Patel")
            ensure_test_case("TEST-ENG-302/2026", "Kotak Mahindra Bank Ltd.", "Meena Shah")
            ensure_test_case("TEST-MULTI-401/2026", "Demo Finance Ltd.", "Paresh Desai")
            ensure_test_case("TEST-MULTI-402/2026", "Demo Finance Ltd.", "Paresh Desai")

            add_test_deposition(
                {
                    "id": "test-dep-gujarati-completed",
                    "case_ids": ["TEST-GUJ-101/2026"],
                    "primary_case_number": "TEST-GUJ-101/2026",
                    "exhibit_number": "11",
                    "sr_no": "1",
                    "witness_name": "રમેશભાઈ મહેશભાઈ પટેલ",
                    "father_husband_name": "મહેશભાઈ ગોરધનભાઈ પટેલ",
                    "religion": "હિન્દુ",
                    "age": "૪૫",
                    "occupation": "નોકરી",
                    "address": "શિવ નંદન સોસાયટી, સુરત",
                    "contact_no": "9898198981",
                    "language": "gu",
                    "stage": "cross",
                    "producing_party": "complainant",
                    "defending_party": "accused",
                    "advocate_producing": "એ. જે. સૈયદ",
                    "advocate_defending": "એસ. પી. શાહ",
                    "av_conferencing": True,
                    "status": "completed",
                    "draft_status": "COMPLETED",
                    "hostile_declared": True,
                    "cross_started": True,
                    "start_time_iso": "2026-09-14T05:00:00+00:00",
                    "start_time_display": "10:30:00, 14/09/2026",
                    "complete_time_display": "10:42:15, 14/09/2026",
                    "date_display": "14/09/2026",
                    "deposition_code": "TEST-GUJ-101_રમેશભાઈ_20260914_103000",
                },
                "<p>આજરોજ સાક્ષી કોર્ટ સમક્ષ હાજર છે. સાક્ષી ફરિયાદી બેંકમાં કામ કરેલ દસ્તાવેજો ઓળખે છે.</p>"
                "<p>સાક્ષી દ્વારા રજૂ થયેલ દસ્તાવેજો વાંચી અને સમજાવી જણાવવામાં આવ્યા.</p>"
                f'<p data-dep-block="hostile">{DEP_HOSTILE_TEXT["gu"]}</p>'
                '<p data-dep-block="start-cross">ઉલટ તપાસ આરોપી તરફે વિ. વ. શ્રી./શ્રીમતી એસ. પી. શાહ.</p>'
                "<p>સાક્ષી જણાવે છે કે દસ્તાવેજો બેંકના રેકોર્ડ મુજબ તૈયાર કરવામાં આવ્યા હતા.</p>",
            )

            add_test_deposition(
                {
                    "id": "test-dep-gujarati-adjourned",
                    "case_ids": ["TEST-GUJ-102/2026"],
                    "primary_case_number": "TEST-GUJ-102/2026",
                    "exhibit_number": "12",
                    "sr_no": "2",
                    "witness_name": "સુરેશભાઈ મહેશભાઈ પટેલ",
                    "father_husband_name": "મહેશભાઈ ગોરધનભાઈ પટેલ",
                    "religion": "હિન્દુ",
                    "age": "૪૦",
                    "occupation": "વ્યવસાય",
                    "address": "નવરંગપુરા, અમદાવાદ",
                    "contact_no": "9876543210",
                    "language": "gu",
                    "stage": "chief",
                    "producing_party": "complainant",
                    "defending_party": "accused",
                    "advocate_producing": "પી. એમ. પટેલ",
                    "advocate_defending": "એમ. આર. દેસાઇ",
                    "status": "adjourned",
                    "draft_status": "ACTIVE",
                    "adjourn_reason": "સમયના અભાવે",
                    "adjourn_next_date": "2026-09-21T11:30",
                    "adjourn_for": "cross",
                    "start_time_iso": "2026-09-14T06:00:00+00:00",
                    "start_time_display": "11:30:00, 14/09/2026",
                    "complete_time_display": "11:45:30, 14/09/2026",
                    "date_display": "14/09/2026",
                    "deposition_code": "TEST-GUJ-102_સુરેશભાઈ_20260914_113000",
                },
                "<p>સાક્ષી જણાવે છે કે ફરિયાદી સંસ્થાના ખાતા સંબંધિત નોંધો તેના સમક્ષ તૈયાર થઈ હતી.</p>"
                "<p>આ તબક્કે વધુ પૂછપરછ માટે સમય જરૂરી હોવાનું જણાવવામાં આવે છે.</p>",
            )

            add_test_deposition(
                {
                    "id": "test-dep-hindi-inprogress",
                    "case_ids": ["TEST-HIN-201/2026"],
                    "primary_case_number": "TEST-HIN-201/2026",
                    "exhibit_number": "21",
                    "sr_no": "1",
                    "witness_name": "मोहनलाल शर्मा",
                    "father_husband_name": "रामलाल शर्मा",
                    "religion": "हिन्दू",
                    "age": "५०",
                    "occupation": "बैंक अधिकारी",
                    "address": "नवरंगपुरा, अहमदाबाद",
                    "contact_no": "9123456780",
                    "language": "hi",
                    "stage": "chief",
                    "producing_party": "complainant",
                    "defending_party": "accused",
                    "advocate_producing": "आर. के. त्रिवेदी",
                    "advocate_defending": "एस. एम. खान",
                    "vulnerable_witness": True,
                    "start_time_iso": "2026-09-14T07:00:00+00:00",
                    "start_time_display": "12:30:00, 14/09/2026",
                    "deposition_code": "TEST-HIN-201_मोहनलाल_20260914_123000",
                },
                "<p>आज साक्षी न्यायालय के समक्ष उपस्थित है। साक्षी ने खाते की प्रविष्टियों को पहचाना।</p>"
                "<p>साक्षी ने बताया कि दस्तावेज बैंक के नियमित अभिलेख में रखे जाते हैं।</p>",
            )

            add_test_deposition(
                {
                    "id": "test-dep-hindi-completed",
                    "case_ids": ["TEST-HIN-202/2026"],
                    "primary_case_number": "TEST-HIN-202/2026",
                    "exhibit_number": "22",
                    "sr_no": "2",
                    "witness_name": "सीमा वर्मा",
                    "father_husband_name": "राकेश वर्मा",
                    "religion": "हिन्दू",
                    "age": "३८",
                    "occupation": "लेखा अधिकारी",
                    "address": "पालडी, अहमदाबाद",
                    "contact_no": "9234567890",
                    "language": "hi",
                    "stage": "cross",
                    "producing_party": "complainant",
                    "defending_party": "accused",
                    "advocate_producing": "के. पी. जोशी",
                    "advocate_defending": "अमित शाह",
                    "status": "completed",
                    "draft_status": "COMPLETED",
                    "cross_started": True,
                    "start_time_iso": "2026-09-14T07:45:00+00:00",
                    "start_time_display": "13:15:00, 14/09/2026",
                    "complete_time_display": "13:28:20, 14/09/2026",
                    "date_display": "14/09/2026",
                    "deposition_code": "TEST-HIN-202_सीमा_20260914_131500",
                },
                "<p>साक्षी ने कहा कि आरोपी को मांग सूचना भेजी गई थी।</p>"
                '<p data-dep-block="start-cross">प्रतिपरीक्षण आरोपी की ओर से विद्वान अधिवक्ता श्री/श्रीमती अमित शाह द्वारा।</p>'
                "<p>साक्षी ने प्रतिपरीक्षण में बताया कि नोटिस की प्रति रिकार्ड में उपलब्ध है।</p>",
            )

            add_test_deposition(
                {
                    "id": "test-dep-english-completed",
                    "case_ids": ["TEST-ENG-301/2026"],
                    "primary_case_number": "TEST-ENG-301/2026",
                    "exhibit_number": "31",
                    "sr_no": "1",
                    "witness_name": "Ramesh Patel",
                    "father_husband_name": "Mahesh Patel",
                    "religion": "Hindu",
                    "age": "46",
                    "occupation": "Recovery Officer",
                    "address": "Ellisbridge, Ahmedabad",
                    "contact_no": "9345678901",
                    "language": "en",
                    "stage": "cross",
                    "producing_party": "complainant",
                    "defending_party": "accused",
                    "advocate_producing": "A. J. Saiyed",
                    "advocate_defending": "S. P. Shah",
                    "status": "completed",
                    "draft_status": "COMPLETED",
                    "hostile_declared": True,
                    "cross_started": True,
                    "start_time_iso": "2026-09-14T08:00:00+00:00",
                    "start_time_display": "13:30:00, 14/09/2026",
                    "complete_time_display": "13:44:05, 14/09/2026",
                    "date_display": "14/09/2026",
                    "deposition_code": "TEST-ENG-301_Ramesh_20260914_133000",
                },
                "<p>The witness is present before the Court today and identifies the account documents.</p>"
                "<p>The witness states that the demand notice was issued according to the bank record.</p>"
                f'<p data-dep-block="hostile">{DEP_HOSTILE_TEXT["en"]}</p>'
                '<p data-dep-block="start-cross">Cross-examination on behalf of the Accused by Ld. Advocate Mr./Ms. S. P. Shah.</p>'
                "<p>In cross-examination, the witness states that the ledger entries were generated from the computerized system.</p>",
            )

            add_test_deposition(
                {
                    "id": "test-dep-english-inprogress",
                    "case_ids": ["TEST-ENG-302/2026"],
                    "primary_case_number": "TEST-ENG-302/2026",
                    "exhibit_number": "32",
                    "sr_no": "2",
                    "witness_name": "Meena Shah",
                    "father_husband_name": "Dilip Shah",
                    "religion": "Hindu",
                    "age": "41",
                    "occupation": "Branch Manager",
                    "address": "Satellite, Ahmedabad",
                    "contact_no": "9456789012",
                    "language": "en",
                    "stage": "chief",
                    "producing_party": "complainant",
                    "defending_party": "accused",
                    "advocate_producing": "M. R. Desai",
                    "advocate_defending": "P. N. Mehta",
                    "start_time_iso": "2026-09-14T08:30:00+00:00",
                    "start_time_display": "14:00:00, 14/09/2026",
                    "deposition_code": "TEST-ENG-302_Meena_20260914_140000",
                },
                "<p>The witness states that the accused had applied for a loan facility.</p>"
                "<p>The documents are produced from the ordinary course of business.</p>",
            )

            add_test_deposition(
                {
                    "id": "test-dep-multicase-gujarati",
                    "case_ids": ["TEST-MULTI-401/2026", "TEST-MULTI-402/2026"],
                    "primary_case_number": "TEST-MULTI-401/2026",
                    "exhibit_number": "41",
                    "sr_no": "5",
                    "witness_name": "પરેશભાઈ દેસાઇ",
                    "father_husband_name": "ભરતભાઈ દેસાઇ",
                    "religion": "હિન્દુ",
                    "age": "૪૮",
                    "occupation": "અધિકૃત પ્રતિનિધિ",
                    "address": "વડોદરા",
                    "contact_no": "9567890123",
                    "language": "gu",
                    "stage": "chief",
                    "producing_party": "complainant",
                    "defending_party": "accused",
                    "advocate_producing": "જે. આર. વકીલ",
                    "advocate_defending": "એચ. કે. રાવલ",
                    "case_specific_details": {
                        "TEST-MULTI-401/2026": {"exhibit_number": "41", "sr_no": "5"},
                        "TEST-MULTI-402/2026": {"exhibit_number": "42", "sr_no": "6"},
                    },
                    "start_time_iso": "2026-09-14T09:00:00+00:00",
                    "start_time_display": "14:30:00, 14/09/2026",
                    "deposition_code": "TEST-MULTI_પરેશભાઈ_20260914_143000",
                },
                "<p>આ જુબાની બે જોડાયેલા ટેસ્ટ કેસ માટે લેવામાં આવે છે. બંને કેસમાં સાક્ષીની વિગતો સમાન છે.</p>"
                "<p>દરેક કેસ માટે અલગ આંક અને સાહેદ નંબર દાખલ કરેલ છે જેથી બહુવિધ પસંદગીની ચકાસણી કરી શકાય.</p>",
            )
    save_store(data)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    payload = read_token(auth[7:])
    data = load_store()
    user = next((u for u in data["users"] if u["id"] == payload["sub"]), None)
    if not user:
        raise HTTPException(401, "User not found")
    if int(payload.get("sv") or 0) != int(user.get("session_version") or 0):
        raise HTTPException(401, "Please sign in again")
    return without_password(user)


def require_role(role: str):
    async def _dep(user: dict = Depends(get_current_user)):
        if user.get("role") != role:
            raise HTTPException(403, "Forbidden")
        return user
    return _dep


class AdminLogin(BaseModel):
    password: str


class StaffLogin(BaseModel):
    login_id: str
    password: str


class JudgeLogin(BaseModel):
    login_id: str
    password: str


class JudgeUserIn(BaseModel):
    login_id: str
    password: str
    court_ids: List[str] = Field(default_factory=list)


class JudgeUserUpdate(BaseModel):
    court_ids: Optional[List[str]] = None
    password: Optional[str] = None


class DepositionCreateIn(BaseModel):
    court_id: str
    case_ids: List[str] = Field(default_factory=list)
    primary_case_number: str
    mode: str
    resume_of: Optional[str] = None
    client_start_time_iso: Optional[str] = None
    exhibit_number: str = ""
    sr_no: str = ""
    witness_name: str = ""
    father_husband_name: str = ""
    religion: str = ""
    age: str = ""
    occupation: str = ""
    address: str = ""
    contact_no: str = ""
    language: str = "gu"
    stage: str = "chief"
    producing_party: str = ""
    defending_party: str = ""
    advocate_producing: str = ""
    advocate_defending: str = ""
    advocate_producing_id: str = ""
    advocate_defending_id: str = ""
    av_conferencing: bool = False
    vulnerable_witness: bool = False
    case_specific_details: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    affidavit_chief: bool = False
    # "deposition" (oral evidence) or "s183" (statement under Section 183 BNSS)
    record_type: str = "deposition"
    police_station: str = ""
    fir_number: str = ""
    offence_sections: str = ""
    # Orders (record_type "order")
    section_law: str = ""
    subject: str = ""
    initial_body_html: str = ""
    template_id: Optional[str] = None
    template_mode: bool = False


class DepositionUpdateIn(BaseModel):
    body_html: Optional[str] = None
    allow_body_shrink: bool = False
    client_revision: Optional[int] = None
    exhibit_number: Optional[str] = None
    sr_no: Optional[str] = None
    witness_name: Optional[str] = None
    father_husband_name: Optional[str] = None
    religion: Optional[str] = None
    age: Optional[str] = None
    occupation: Optional[str] = None
    address: Optional[str] = None
    contact_no: Optional[str] = None
    producing_party: Optional[str] = None
    defending_party: Optional[str] = None
    advocate_producing: Optional[str] = None
    advocate_defending: Optional[str] = None
    advocate_producing_id: Optional[str] = None
    advocate_defending_id: Optional[str] = None
    av_conferencing: Optional[bool] = None
    vulnerable_witness: Optional[bool] = None
    language: Optional[str] = None
    case_specific_details: Optional[Dict[str, Dict[str, str]]] = None
    police_station: Optional[str] = None
    fir_number: Optional[str] = None
    offence_sections: Optional[str] = None
    section_law: Optional[str] = None
    subject: Optional[str] = None
    primary_case_number: Optional[str] = None
    case_ids: Optional[List[str]] = None


class DepositionAdjournIn(BaseModel):
    reason: str
    next_date_time: str
    adjourn_for: str


class JudgeSettingsIn(BaseModel):
    language: str  # gu | hi | en
    hostile_text: str = ""
    start_cross_text: str = ""


class CourtLang(BaseModel):
    court_name: str = ""
    place: str = ""
    judge_name: str = ""
    judge_designation: str = ""


class CourtIn(BaseModel):
    english: CourtLang
    gujarati: CourtLang


class LawIn(BaseModel):
    english: str
    gujarati: str
    applies_to: List[str] = Field(default_factory=list)


class ComplainantIn(BaseModel):
    name: str


class StaffUserIn(BaseModel):
    login_id: str
    password: str
    court_id: Optional[str] = None
    name: str = ""
    designation: str = ""


class StaffUserUpdate(BaseModel):
    court_id: Optional[str] = None
    password: Optional[str] = None
    name: Optional[str] = None
    designation: Optional[str] = None


class ChangeCredsIn(BaseModel):
    field: str
    existing_id: Optional[str] = None
    new_id: Optional[str] = None
    existing_password: Optional[str] = None
    new_password: Optional[str] = None


class AccusedDetails(BaseModel):
    case_no: str
    name: str
    father_husband: str
    religion: str
    age: str
    occupation: str
    address: str
    contact: str


class PleaIn(BaseModel):
    language: str
    charge: str
    accused: AccusedDetails
    q1: str
    q2: str
    plea_type: str
    sanjabi: Optional[Dict[str, Any]] = None
    court_id: Optional[str] = None


class PrimaryFSIn(BaseModel):
    plea_id: str
    a1: str
    a2: str
    a3: str
    a4: str


class FinalFSQuestionsIn(BaseModel):
    plea_id: str
    questions: List[str]
    available_at: Optional[str] = None


class FinalFSEntryIn(BaseModel):
    plea_id: str
    answers: List[str]


class GeneratedDocumentIn(BaseModel):
    document_kind: str
    language: str
    court_id: str
    case_number: str
    complainant_name: str = ""
    accused_name: str = ""
    document_type: str
    producing_party: str = ""
    applicant_name: str = ""
    applicant_role: str = ""
    advocate_name: str = ""
    date: str = ""
    fields: Dict[str, Any] = Field(default_factory=dict)
    html: str = ""


class BulkPdfDocumentIn(BaseModel):
    filename: str
    title: str = ""
    html: str


class BulkPdfZipIn(BaseModel):
    documents: List[BulkPdfDocumentIn]


class PdfDocumentIn(BaseModel):
    filename: str = "document.pdf"
    title: str = ""
    html: str


class LimitationCalendarIn(BaseModel):
    overrides: Dict[str, Any] = Field(default_factory=dict)


DOC_ARRAYS = {
    "application": "applications",
    "pursis": "pursis",
    "surety": "surety_bonds",
}


def case_matches(case: dict, court_id: Optional[str], case_number: str) -> bool:
    return (
        case.get("court_id") == court_id
        and case.get("case_number", "").strip().lower() == case_number.strip().lower()
    )


def upsert_case_log(data: dict, doc: dict):
    if not doc.get("case_number"):
        return
    existing = next((c for c in data["case_log"] if case_matches(c, doc.get("court_id"), doc["case_number"])), None)
    payload = {
        "court_id": doc.get("court_id"),
        "case_number": doc.get("case_number", ""),
        "complainant_name": doc.get("complainant_name", ""),
        "accused_name": doc.get("accused_name", ""),
        "updated_at": now_iso(),
    }
    if existing:
        existing.update({k: v for k, v in payload.items() if v})
    else:
        payload["id"] = new_id()
        payload["created_at"] = now_iso()
        data["case_log"].append(payload)


class _BlockHtmlParser(HTMLParser):
    block_tags = {"p", "div", "tr", "li", "h1", "h2", "h3", "section", "article"}

    def __init__(self):
        super().__init__()
        self.blocks: List[Dict[str, str]] = []
        self.stack: List[Dict[str, str]] = []
        self.current: List[str] = []
        self.last_text = ""

    def handle_starttag(self, tag, attrs):
        attrs_dict = {key: value for key, value in attrs}
        if tag == "br":
            self.current.append("\n")
            return
        if tag in self.block_tags:
            self.flush()
        self.stack.append({"tag": tag, "class": attrs_dict.get("class", "")})

    def handle_endtag(self, tag):
        if tag in self.block_tags:
            self.flush()
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]["tag"] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        if data:
            self.current.append(data)

    def flush(self):
        raw = "".join(self.current)
        self.current = []
        lines = [re.sub(r"[ \t\r\f\v]+", " ", line).strip() for line in raw.splitlines()]
        text = "\n".join(line for line in lines if line).strip()
        if not text or text == self.last_text:
            return
        active = self.stack[-1] if self.stack else {"tag": "p", "class": ""}
        classes = " ".join(item.get("class", "") for item in self.stack if item.get("class", ""))
        self.blocks.append({"tag": active.get("tag", "p"), "class": classes, "text": text})
        self.last_text = text

    def close(self):
        self.flush()
        super().close()


def html_to_blocks(html: str) -> List[Dict[str, str]]:
    parser = _BlockHtmlParser()
    parser.feed(html or "")
    parser.close()
    return parser.blocks


def register_pdf_font() -> str:
    font_candidates = [
        os.environ.get("ACJM_PDF_FONT", ""),
        str(ROOT_DIR / "fonts" / "LohitGujarati.ttf"),
        str(ROOT_DIR / "fonts" / "Lohit-Gujarati.ttf"),
        str(ROOT_DIR / "fonts" / "lohit_gujarati.ttf"),
        str(ROOT_DIR / "fonts" / "Lohit-Gujarati-Regular.ttf"),
        "/usr/share/fonts/truetype/lohit-gujarati/Lohit-Gujarati.ttf",
        "/usr/share/fonts/truetype/lohit-gujarati/lohit_gujarati.ttf",
        "/usr/share/fonts/truetype/lohit-gujarati/LohitGujarati.ttf",
        r"C:\Windows\Fonts\LohitGujarati.ttf",
        r"C:\Windows\Fonts\Lohit-Gujarati.ttf",
        r"C:\Windows\Fonts\lohit_gujarati.ttf",
    ]
    for font_path in font_candidates:
        if font_path and os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont("ACJMDocumentFont", font_path))
                return "ACJMDocumentFont"
            except Exception:
                continue
    return "Times-Roman"


def build_simple_pdf(title: str, html: str) -> bytes:
    font_name = register_pdf_font()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    styles = getSampleStyleSheet()
    normal = ParagraphStyle(
        "ACJMNormal",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=13,
        leading=20,
        alignment=TA_JUSTIFY,
        textColor=colors.black,
        spaceAfter=6,
    )
    heading = ParagraphStyle(
        "ACJMHeading",
        parent=normal,
        fontSize=16,
        leading=21,
        alignment=TA_CENTER,
        spaceAfter=10,
    )
    centered = ParagraphStyle(
        "ACJMCentered",
        parent=normal,
        alignment=TA_CENTER,
        spaceAfter=6,
    )
    right = ParagraphStyle(
        "ACJMRight",
        parent=normal,
        alignment=TA_RIGHT,
        spaceAfter=6,
    )
    story = []
    for block in html_to_blocks(html):
        text = block.get("text", "")
        if not text:
            continue
        safe = "<br/>".join(html_escape(line) for line in text.splitlines() if line.strip())
        tag = block.get("tag", "").lower()
        classes = block.get("class", "")
        style = normal
        if tag in {"h1", "h2", "h3"} or "court-head" in classes or "court-title" in classes or "party-center" in classes:
            style = heading if tag in {"h1", "h2", "h3"} else centered
        elif "case-no-right" in classes or "signature-line" in classes or "esign-keywords" in classes or "esign-keyword" in classes:
            style = right
        story.append(Paragraph(safe, style))
        if "esign-keyword" in classes and "Advocate" in text:
            story.append(Spacer(1, 18 * mm))
        else:
            story.append(Spacer(1, 1.4 * mm))
    if not story:
        story.append(Paragraph("No content", normal))
    doc.build(story)
    return buffer.getvalue()


def find_browser_executable() -> Optional[str]:
    env_browser = os.environ.get("ACJM_BROWSER_PATH", "").strip()
    candidates = [
        env_browser,
        shutil.which("chrome"),
        shutil.which("chrome.exe"),
        shutil.which("google-chrome"),
        shutil.which("google-chrome-stable"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
        shutil.which("msedge"),
        shutil.which("msedge.exe"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        str(Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "Application" / "chrome.exe"),
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def browser_pdf_shell(title: str, body_html: str) -> str:
    font_path = ROOT_DIR / "fonts" / "Lohit-Gujarati.ttf"
    font_src = font_path.resolve().as_uri() if font_path.exists() else "/fonts/Lohit-Gujarati.ttf"
    hindi_font_path = ROOT_DIR / "fonts" / "TiroDevanagariHindi-Regular.ttf"
    hindi_font_src = hindi_font_path.resolve().as_uri() if hindi_font_path.exists() else "/fonts/TiroDevanagariHindi-Regular.ttf"
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>{html_escape(title or "Document")}</title>
  <style>
    @font-face {{ font-family:"Lohit Gujarati"; src:url("{font_src}") format("truetype"); font-weight:400; font-style:normal; font-display:swap; }}
    @font-face {{ font-family:"Tiro Devanagari Hindi"; src:url("{hindi_font_src}") format("truetype"); font-weight:400; font-style:normal; font-display:swap; }}
    @page {{
      size:A4;
      margin:19mm 18mm 14mm;
      @top-center {{ content:"Page " counter(page) " of " counter(pages); font-size:10px; }}
    }}
    @page english-deposition {{
      size:A4;
      margin:20mm 25mm;
      @top-center {{ content:"Page " counter(page) " of " counter(pages); font-size:10px; }}
    }}
    html, body {{ background:#fff; color:#000; margin:0; padding:0; }}
    body {{ font-family:"Lohit Gujarati", "Tiro Devanagari Hindi", "Times New Roman", serif; font-size:15.5px; line-height:1.45; }}
    .print-wrap {{ margin:0 auto; max-width:174mm; }}
    .legal-doc, .legal-doc * {{ font-family:"Lohit Gujarati", "Tiro Devanagari Hindi", "Times New Roman", serif !important; }}
    .legal-doc {{ background:#fff; box-sizing:border-box; color:#111; font-size:15.5px; line-height:1.45; margin:0 auto 16px; min-height:auto; overflow:visible; padding:0; text-align:justify; text-justify:inter-word; width:auto; }}
    .legal-doc.lang-hi, .legal-doc.lang-hi * {{ font-family:"Tiro Devanagari Hindi", "Lohit Gujarati", "Times New Roman", serif !important; }}
    .legal-doc.lang-hi .court-head, .legal-doc.lang-hi .court-head *, .legal-doc.lang-hi .signature-block, .legal-doc.lang-hi .signature-block *, .legal-doc.lang-hi .timing-block, .legal-doc.lang-hi .timing-block * {{ font-family:"Lohit Gujarati", "Tiro Devanagari Hindi", "Times New Roman", serif !important; }}
    .legal-doc.lang-en {{ font-family:"Times New Roman", "Lohit Gujarati", "Tiro Devanagari Hindi", serif !important; font-size:14pt; line-height:1.5; page:english-deposition; }}
    .legal-doc.lang-en * {{ font-family:"Times New Roman", "Lohit Gujarati", "Tiro Devanagari Hindi", serif !important; font-size:14pt; line-height:1.5; }}
    .legal-doc.lang-en .closing-block {{ break-inside:auto; page-break-inside:auto; }}
    .legal-doc h1 {{ font-size:18px; margin:0 0 5px; text-align:center; }}
    .legal-doc h2 {{ font-size:16px; margin:9px 0; text-align:center; text-decoration:underline; }}
    .legal-doc h3, .court-head, .court-title {{ text-align:center; }}
    .legal-doc p {{ margin:5px 0; }}
    .court-head {{ font-weight:700; line-height:1.3; margin:0 auto 6px; max-width:145mm; text-align:center; text-decoration:underline; }}
    .case-line {{ display:flex; justify-content:flex-end; margin:6px 0 14px; }}
    .case-right {{ min-width:40mm; text-align:right; white-space:nowrap; }}
    .case-right div {{ margin:0 0 3px; text-align:right; }}
    .oath-line {{ margin:18px 0 14px; text-align:left !important; }}
    .witness-title {{ font-weight:700; margin:4px 0 16px; text-align:center !important; text-decoration:underline; }}
    .witness-grid {{ display:grid; grid-template-columns:38mm 5mm 1fr 24mm 5mm 22mm; column-gap:3mm; row-gap:2px; margin:0 auto 14px; max-width:138mm; }}
    .witness-grid .label {{ text-align:left; }}
    .witness-grid .colon {{ text-align:center; }}
    .witness-grid .value {{ text-align:left; }}
    .witness-grid .wide {{ grid-column:3 / 7; }}
    .exam-heading {{ font-weight:700; margin:12px auto 8px; max-width:150mm; text-align:center !important; }}
    .conditional-note {{ font-weight:700; margin:5px 0; }}
    .body-block {{ margin:8px 0 8px; text-align:justify; text-justify:inter-word; }}
    .body-block p:not([style*="text-align"]),
    .body-block div:not([style*="text-align"]),
    .body-block li:not([style*="text-align"]),
    .body-block td:not([style*="text-align"]),
    .body-block th:not([style*="text-align"]) {{ text-align:justify; text-justify:inter-word; }}
    .body-block p[style*="text-align"],
    .body-block div[style*="text-align"],
    .body-block li[style*="text-align"],
    .body-block td[style*="text-align"],
    .body-block th[style*="text-align"] {{ text-justify:inter-word; }}
    .body-block p[data-dep-block="start-cross"] {{ font-weight:700; margin-top:10px; }}
    .body-block p, .body-block li, .body-block table, .body-block img, .conditional-note {{ break-inside:avoid; page-break-inside:avoid; orphans:3; widows:3; }}
    .closing-block {{ break-inside:auto; margin-top:6px; page-break-inside:auto; }}
    .order-doc .order-case-line {{ text-align:right; margin:0 0 10px; }}
    .order-doc p.order-center {{ text-align:center !important; margin:2px 0; }}
    .order-doc .body-block {{ margin-top:14px; }}
    .order-doc .order-closing {{ margin-top:18px; }}
    .order-doc .order-closing p.order-date {{ text-align:left !important; margin:0 0 10mm; }}
    .order-doc .order-signature {{ margin-left:auto; width:75mm; text-align:center; break-inside:avoid; page-break-inside:avoid; }}
    .order-doc .order-signature p {{ text-align:center !important; margin:0; }}
    .closing-block > p.witness-sign-line {{ margin:12mm 0 6px; text-align:left; break-before:avoid; page-break-before:avoid; }}
    .closing-block > p {{ break-inside:avoid; margin:4px 0; orphans:3; page-break-inside:avoid; widows:3; }}
    .signature-block {{ display:grid; grid-template-columns:1fr 58mm; gap:12mm; margin-top:10px; break-inside:avoid; page-break-inside:avoid; }}
    .signature-block .date-place {{ text-align:left; }}
    .signature-block .date-place p {{ text-align:left; }}
    .signature-block .before-me {{ font-weight:700; margin-bottom:14mm; text-align:center; }}
    .signature-block .signature-text {{ text-align:center; }}
    .signature-block .signature-text p {{ text-align:center; }}
    .timing-block {{ break-inside:avoid; margin-top:8px; page-break-inside:avoid; }}
    .timing-block p {{ margin:3px 0; }}
    .case-row, .signature-row {{ display:flex; justify-content:space-between; gap:20px; }}
    .case-no-right {{ margin:8px 0; text-align:right; }}
    .party-center {{ margin:12px 0; text-align:center; }}
    .signature-line {{ border-top:1px solid #000; min-width:210px; padding-top:5px; text-align:center; }}
    .esign-keywords {{ min-width:250px; text-align:center; }}
    .esign-keyword {{ font-weight:700; white-space:nowrap; }}
    .esign-gap {{ height:24mm; }}
    .details-grid {{ display:grid; grid-template-columns:42mm 1fr; gap:4px 8px; margin:10px 0; }}
    .bond-page, .translation-annex {{ break-before:page; page-break-before:always; }}
    .legal-doc:first-child, .bond-page:first-child, .translation-annex:first-child {{ break-before:auto; page-break-before:auto; }}
    .legal-doc table {{ border-collapse:collapse; margin:8px 0; max-width:100%; width:100%; }}
    .legal-doc td, .legal-doc th {{ border:1px solid #111; padding:4px 6px; vertical-align:top; }}
    .legal-doc img {{ max-width:100%; height:auto; }}
    .legal-doc h1, .legal-doc h2, .legal-doc h3, .legal-doc .court-head, .legal-doc .case-line, .legal-doc .case-row, .legal-doc .case-no-right, .legal-doc .party-center, .legal-doc .signature-row, .legal-doc .exam-heading {{ break-inside:avoid; page-break-inside:avoid; }}
    .no-print {{ display:none !important; }}
  </style>
</head>
<body><div class="print-wrap">{body_html or ""}</div></body>
</html>"""


def _chrome_print_html(browser: str, full_html: str) -> Optional[bytes]:
    with tempfile.TemporaryDirectory(prefix="acjm-pdf-") as tmp:
        tmp_path = Path(tmp)
        html_path = tmp_path / "document.html"
        pdf_path = tmp_path / "document.pdf"
        html_path.write_text(full_html, encoding="utf-8")
        for headless_flag in ("--headless=new", "--headless"):
            cmd = [
                browser, headless_flag, "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
                "--allow-file-access-from-files", "--no-pdf-header-footer", "--print-to-pdf-no-header",
                f"--print-to-pdf={pdf_path}", html_path.as_uri(),
            ]
            try:
                subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45)
                if pdf_path.exists() and pdf_path.stat().st_size > 0:
                    return pdf_path.read_bytes()
            except Exception:
                continue
    return None


def _witness_margin_strip_html(label: str) -> str:
    # One A4 page that only carries the vertical "witness signature" strip in
    # the right-hand margin; it is laid over each page of the deposition.
    font_path = ROOT_DIR / "fonts" / "Lohit-Gujarati.ttf"
    font_src = font_path.resolve().as_uri() if font_path.exists() else "/fonts/Lohit-Gujarati.ttf"
    hindi_font_path = ROOT_DIR / "fonts" / "TiroDevanagariHindi-Regular.ttf"
    hindi_font_src = hindi_font_path.resolve().as_uri() if hindi_font_path.exists() else "/fonts/TiroDevanagariHindi-Regular.ttf"
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face {{ font-family:"Lohit Gujarati"; src:url("{font_src}") format("truetype"); }}
    @font-face {{ font-family:"Tiro Devanagari Hindi"; src:url("{hindi_font_src}") format("truetype"); }}
    @page {{ size:A4; margin:0; }}
    html, body {{ margin:0; padding:0; background:transparent; }}
    .strip {{ position:fixed; right:3mm; top:0; height:297mm; width:12mm; display:flex; align-items:center; justify-content:center; }}
    .strip span {{ writing-mode:vertical-rl; transform:rotate(180deg); white-space:nowrap; font-size:12px; color:#000;
                   font-family:"Lohit Gujarati", "Tiro Devanagari Hindi", "Times New Roman", serif; }}
    </style></head><body><div class="strip"><span>{html_escape(label)} : ____________________</span></div></body></html>"""


def _stamp_witness_margin_sign(pdf_bytes: bytes, browser: str, label: str) -> bytes:
    """Put the vertical witness-signature strip on every page except the last
    (the last page already carries the full witness signature line)."""
    try:
        from pypdf import PdfReader, PdfWriter
    except Exception:
        return pdf_bytes
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        total = len(reader.pages)
        if total < 2:
            return pdf_bytes
        strip_pdf = _chrome_print_html(browser, _witness_margin_strip_html(label))
        if not strip_pdf:
            return pdf_bytes
        strip_page = PdfReader(io.BytesIO(strip_pdf)).pages[0]
        writer = PdfWriter()
        for index, page in enumerate(reader.pages):
            if index < total - 1:
                page.merge_page(strip_page)
            writer.add_page(page)
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception:
        return pdf_bytes


def build_browser_pdf(title: str, html: str, witness_sign_label: Optional[str] = None) -> bytes:
    browser = find_browser_executable()
    if not browser:
        return build_simple_pdf(title, html)
    with tempfile.TemporaryDirectory(prefix="acjm-pdf-") as tmp:
        tmp_path = Path(tmp)
        html_path = tmp_path / "document.html"
        pdf_path = tmp_path / "document.pdf"
        html_path.write_text(browser_pdf_shell(title, html), encoding="utf-8")
        for headless_flag in ("--headless=new", "--headless"):
            cmd = [
                browser,
                headless_flag,
                "--disable-gpu",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--allow-file-access-from-files",
                "--no-pdf-header-footer",
                "--print-to-pdf-no-header",
                f"--print-to-pdf={pdf_path}",
                html_path.as_uri(),
            ]
            try:
                subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45)
                if pdf_path.exists() and pdf_path.stat().st_size > 0:
                    pdf_bytes = pdf_path.read_bytes()
                    if witness_sign_label:
                        pdf_bytes = _stamp_witness_margin_sign(pdf_bytes, browser, witness_sign_label)
                    return pdf_bytes
            except Exception:
                continue
    return build_simple_pdf(title, html)


def safe_pdf_name(name: str, index: int) -> str:
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", (name or f"document_{index}")).strip("._")
    if not stem:
        stem = f"document_{index}"
    if stem.lower().endswith(".html"):
        stem = stem[:-5]
    if not stem.lower().endswith(".pdf"):
        stem += ".pdf"
    return stem


DEP_PARTY_LABELS = {
    "complainant": {"gu": "ફરિયાદી", "hi": "शिकायतकर्ता", "en": "Complainant"},
    "applicant": {"gu": "અરજદાર", "hi": "आवेदक", "en": "Applicant"},
    "accused": {"gu": "આરોપી", "hi": "अभियुक्त", "en": "Accused"},
    "opponent": {"gu": "સામાવાળા", "hi": "प्रतिपक्ष", "en": "Opponent"},
}
DEP_PARTY_AUTO_OPPOSITE = {
    "complainant": "accused",
    "applicant": "opponent",
    "accused": "complainant",
    "opponent": "applicant",
}
DEP_STAGE_LABELS = {
    "chief": {"gu": "સરતપાસ", "hi": "मुख्य परीक्षण", "en": "Examination-in-Chief"},
    "cross": {"gu": "ઉલટ તપાસ", "hi": "प्रतिपरीक्षण", "en": "Cross-Examination"},
    "re-exam": {"gu": "ફેર-તપાસ", "hi": "पुनः परीक्षण", "en": "Re-Examination"},
}
DEP_LANG_NAMES = {"gu": "Gujarati", "hi": "Hindi", "en": "English"}

DEP_HOSTILE_TEXT = {
    "gu": "સદર સાક્ષી તેઓના અગાઉ ના દસ્તાવેજ માં / અન્ય રીતે રહેલ કથન ને સમર્થ ન આપતા હોઇ સાક્ષી રજૂ કરનાર પક્ષ એ સદર સાક્ષી ને હોસ્ટાઇલ જાહેર કરી તેમના દસ્તાવેજ માં / અન્ય રીતે રહેલ કથન મુજબ ની હકીકતો રજુ કરવા માટે, ઉલટ તપાસ માં પુછી શકાય તેવા પ્રશ્નો પુછવાની પરવાનગી માગેલ છે. જેથી સદર સાક્ષી ને ઉપરોક્ત હકીકત મુજબ નો પુરાવો આપવા કોઇ પણ લાગ ભાગ કે ધાક ધમકી આપવામા આવેલ છે કે કેમ? તે અંગે વિગત વાર ખાતરી તપાસ કરતા સદર સાહેદ ને કોઇ તેવી ધમકી કે લોભ આપવામા આવેલ ન હોઇ, તેમજ ભારતીય પુરાવા અધીનીયમ ની કલમ ૧૫૪ / ભારતીય સાક્ષીય અધિનિયમ ની કલમ ૧૫૭ વંચાણે લેતા, સદર સાક્ષી ને હોસ્ટાઇલ જાહેર કરવાની પરવાનગી આપવામાં આવે છે.",
    "en": "The present witness has not supported the statements made by him/her in the earlier documents and/or otherwise. Therefore, the party examining the witness has requested permission to declare the witness hostile and to put questions in cross-examination with a view to proving the facts stated in the earlier documents and/or previous statements. Accordingly, a detailed inquiry was made to ascertain whether the witness had been subjected to any inducement, threat, coercion, or undue influence to depose contrary to the earlier version. Upon such inquiry, the witness has stated that no threat, inducement, or promise of any nature has been extended to him/her. Therefore, upon considering the provisions of Section 154 of the Indian Evidence Act, 1872 / Section 157 of the Bharatiya Sakshya Adhiniyam, 2023, permission is hereby granted to declare the witness hostile.",
    "hi": "वर्तमान साक्षी ने अपने पूर्व में दिए गए दस्तावेज़ों तथा/अथवा अन्य पूर्व कथनों का समर्थन नहीं किया है। अतः साक्षी प्रस्तुत करने वाले पक्षकार द्वारा साक्षी को शत्रुतापूर्ण (Hostile) घोषित किए जाने तथा उसके पूर्व दस्तावेज़ों एवं/अथवा अन्य पूर्व कथनों के अनुसार तथ्यों को अभिलेख पर लाने हेतु प्रतिपरीक्षण (Cross-Examination) में प्रश्न पूछने की अनुमति प्रदान किए जाने का निवेदन किया गया है। इस संबंध में यह सुनिश्चित करने हेतु विस्तृत पूछताछ की गई कि क्या उक्त साक्षी को पूर्व कथन के अनुरूप साक्ष्य न देने अथवा विपरीत बयान देने के लिए किसी प्रकार का प्रलोभन, भय, धमकी अथवा अनुचित प्रभाव डाला गया है। पूछताछ के दौरान साक्षी ने स्पष्ट रूप से बताया कि उसे किसी भी प्रकार का प्रलोभन, भय, धमकी अथवा आश्वासन नहीं दिया गया है। अतः, भारतीय साक्ष्य अधिनियम, 1872 की धारा 154 / भारतीय साक्ष्य अधिनियम, 2023 (Bharatiya Sakshya Adhiniyam, 2023) की धारा 157 के प्रावधानों पर विचार करते हुए, उक्त साक्षी को शत्रुतापूर्ण (Hostile) घोषित करने की अनुमति प्रदान की जाती है.",
}


def dep_start_cross_text(lang: str, defending_party_label: str, defending_advocate: str) -> str:
    da = html_escape(defending_advocate or "")
    dp = html_escape(defending_party_label or "")
    if lang == "gu":
        return f"ઉલટ તપાસ {dp} તરફે વિ. વ. શ્રી./શ્રીમતી {da}."
    if lang == "hi":
        return f"प्रतिपरीक्षण {dp} की ओर से विद्वान अधिवक्ता श्री/श्रीमती {da} द्वारा।"
    return f"Cross-examination on behalf of the {dp} by Ld. Advocate Mr./Ms. {da}."


def dep_without_system_block(body_html: str, block_name: str) -> str:
    pattern = rf'<p[^>]*data-dep-block=["\']{re.escape(block_name)}["\'][^>]*>.*?</p>'
    return re.sub(pattern, "", body_html or "", flags=re.IGNORECASE | re.DOTALL)


ADJOURNED_FOR_LABELS = {
    "further_chief": {"gu": "વધુ સરતપાસ", "hi": "आगे मुख्य परीक्षण", "en": "Further Examination-in-Chief"},
    "cross": {"gu": "ઉલટ તપાસ", "hi": "प्रतिपरीक्षण", "en": "Cross-Examination"},
}


DEP_LABELS = {
    "case_no": {"gu": "ફો. કે. નં.", "hi": "फौजदारी केस नं.", "en": "Criminal Case No."},
    "exhibit": {"gu": "આંક.", "hi": "प्रदर्श", "en": "Ex."},
    "oath": {"gu": "સોગંદ આપ્યા....", "hi": "शपथ ग्रहण करवाने में आता है...", "en": "Oath affirmed..."},
    "witness_no": {"gu": "સાહેદ નં.", "hi": "साक्षी क्रमांक", "en": "Witness No."},
    "name": {"gu": "નામ", "hi": "नाम", "en": "Name"},
    "father": {"gu": "પિતાજી / પતિનું નામ", "hi": "पिता / पति का नाम", "en": "Father's / Husband's Name"},
    "religion": {"gu": "જાતે", "hi": "धर्म", "en": "Religion"},
    "age": {"gu": "ઉ.વ.અ.", "hi": "उमर", "en": "Age (approx.)"},
    "occupation": {"gu": "વ્યવસાય", "hi": "व्यवसाय", "en": "Occupation"},
    "address": {"gu": "રહે.", "hi": "पता", "en": "Address"},
    "contact": {"gu": "મો. નં.", "hi": "संपर्क क्रमांक", "en": "Contact No."},
    "date": {"gu": "તા.", "hi": "ता.", "en": "Dt."},
    "place": {"gu": "સ્થળ", "hi": "स्थळ", "en": "Place"},
}


WITNESS_SIGN_LABELS = {"gu": "સાક્ષીની સહી", "hi": "साक्षी के हस्ताक्षर", "en": "Signature of the Witness"}


def witness_sign_line_html(lang: str) -> str:
    label = WITNESS_SIGN_LABELS.get(lang, WITNESS_SIGN_LABELS["gu"])
    return f'<p class="witness-sign-line">{label} : ______________________________</p>'


def dep_label(key: str, lang: str) -> str:
    return DEP_LABELS.get(key, {}).get(lang, DEP_LABELS.get(key, {}).get("en", key))


def dep_party_label(dep: dict, key: str, lang: str) -> str:
    return DEP_PARTY_LABELS.get(dep.get(key, ""), {}).get(lang, dep.get(key, ""))


def dep_date_time_parts(value: str) -> tuple[str, str]:
    raw = (value or "").strip()
    if not raw:
        return "", ""
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y"), dt.strftime("%H:%M")
    except Exception:
        pass
    if "T" in raw:
        date_part, time_part = raw.split("T", 1)
        try:
            dt = datetime.fromisoformat(f"{date_part}T{(time_part or '00:00')[:5]}")
            return dt.strftime("%d/%m/%Y"), dt.strftime("%H:%M")
        except Exception:
            return date_part, time_part[:5]
    return raw, ""


def dep_parse_print_datetime(dep: dict, display_key: str, iso_key: str = "") -> Optional[datetime]:
    if iso_key and dep.get(iso_key):
        try:
            return datetime.fromisoformat(str(dep.get(iso_key)).replace("Z", "+00:00"))
        except Exception:
            pass
    raw = str(dep.get(display_key) or "").strip()
    for fmt in ("%H:%M:%S, %d/%m/%Y", "%d/%m/%Y, %H:%M:%S", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except Exception:
            continue
    return None


def dep_print_datetime_text(dep: dict, display_key: str, iso_key: str = "") -> str:
    dt = dep_parse_print_datetime(dep, display_key, iso_key)
    if dt:
        return dt.strftime("%d/%m/%Y, %H:%M:%S")
    raw = str(dep.get(display_key) or "").strip()
    if "," in raw:
        left, right = [part.strip() for part in raw.split(",", 1)]
        if re.match(r"^\d{1,2}:\d{2}", left) and re.match(r"^\d{1,2}/\d{1,2}/\d{4}", right):
            return f"{right}, {left}"
    return raw


def dep_print_end_datetime(dep: dict) -> Optional[datetime]:
    dt = dep_parse_print_datetime(dep, "complete_time_display")
    if dt:
        return dt
    for key in ("updated_at", "created_at", "start_time_iso"):
        raw = dep.get(key)
        if raw:
            parsed = parse_iso(str(raw))
            if parsed.timestamp() > 0:
                return parsed
    return None


def dep_print_end_datetime_text(dep: dict) -> str:
    dt = dep_print_end_datetime(dep)
    if dt:
        return dt.strftime("%d/%m/%Y, %H:%M:%S")
    return ""


def dep_print_date_text(dep: dict) -> str:
    raw = str(dep.get("date_display") or "").strip()
    if raw:
        return raw
    end = dep_print_end_datetime(dep)
    if end:
        return end.strftime("%d/%m/%Y")
    return datetime.now(timezone.utc).strftime("%d/%m/%Y")


def dep_duration_text(dep: dict) -> str:
    start = dep_parse_print_datetime(dep, "start_time_display", "start_time_iso")
    end = dep_print_end_datetime(dep)
    if not start or not end:
        return ""
    seconds = max(0, int((end - start).total_seconds()))
    hours, rem = divmod(seconds, 3600)
    mins, secs = divmod(rem, 60)
    return f"{hours:02d}:{mins:02d}:{secs:02d}"


def dep_has_block(body_html: str, block_name: str) -> bool:
    pattern = rf'data-dep-block=["\']{re.escape(block_name)}["\']'
    return bool(re.search(pattern, body_html or "", flags=re.IGNORECASE))


def dep_court_name(court: dict, lang: str) -> str:
    if not court:
        return ""
    if lang == "en":
        return (court.get("english") or {}).get("court_name", "")
    return (court.get("gujarati") or court.get("english") or {}).get("court_name", "")


def dep_signature_details(court: dict, lang: str) -> tuple[str, str, str]:
    eng = (court or {}).get("english", {})
    place = eng.get("place", "")
    judge_name = eng.get("judge_name", "")
    judge_designation = eng.get("judge_designation", "")
    if lang != "en" and court:
        guj = court.get("gujarati", {})
        place = guj.get("place", place)
        judge_name = guj.get("judge_name", judge_name)
        judge_designation = guj.get("judge_designation", judge_designation)
    return html_escape(place), html_escape(judge_name), html_escape(judge_designation)


def dep_optional_notes(dep: dict, lang: str) -> str:
    notes = []
    if dep.get("av_conferencing"):
        if lang == "gu":
            notes.append("નોંધ : સાક્ષીની જુબાની ઓડિયો-વિડિયો માધ્યમથી નોંધવામાં આવેલ છે.")
        elif lang == "hi":
            notes.append("नोट : साक्षी की गवाही ऑडियो-वीडियो माध्यम से दर्ज की गई है।")
        else:
            notes.append("Note : The deposition is recorded through audio-video means.")
    if dep.get("vulnerable_witness"):
        if lang == "gu":
            notes.append("નોંધ : નબળા સાક્ષીની જુબાની ઇન-કેમેરા નોંધવામાં આવેલ છે.")
        elif lang == "hi":
            notes.append("नोट : संवेदनशील साक्षी की गवाही इन-कैमरा दर्ज की गई है।")
        else:
            notes.append("Note : Deposition is recorded in camera for vulnerable witness.")
    return "\n".join(f'<p class="conditional-note">{html_escape(note)}</p>' for note in notes)


def dep_continuation_kind(dep: dict, data: Optional[dict]) -> Optional[str]:
    if dep.get("mode") != "existing":
        return None
    if dep.get("stage") == "re-exam":
        return "re_exam"
    if dep.get("adjourned_for") == "further_chief":
        return "further_chief"
    if dep.get("adjourned_for") == "cross":
        prev = None
        if data and dep.get("resume_of"):
            prev = next((d for d in data.get("depositions", []) if d.get("id") == dep.get("resume_of")), None)
        prev_body = deposition_effective_body(prev) if prev else ""
        if prev and (prev.get("stage") == "cross" or dep_has_block(prev_body, "start-cross")):
            return "further_cross"
        return "cross"
    return None


def dep_examination_heading(dep: dict, lang: str, continuation_kind: Optional[str]) -> str:
    producing_label = dep_party_label(dep, "producing_party", lang)
    defending_label = dep_party_label(dep, "defending_party", lang)
    witness_no = html_escape(dep.get("sr_no", ""))
    witness_name = html_escape(dep.get("witness_name", ""))
    adv_producing = html_escape(dep.get("advocate_producing", ""))
    adv_defending = html_escape(dep.get("advocate_defending", ""))

    if continuation_kind == "further_chief":
        if lang == "gu":
            return f"{producing_label} પક્ષ દ્વારા સાહેદ નં. {witness_no} {witness_name} ની વધુ સરતપાસ {producing_label} તરફે વિ. વ. શ્રી./શ્રીમતી {adv_producing}."
        if lang == "hi":
            return f"{producing_label} पक्ष के साक्षी क्रमांक {witness_no} {witness_name} की अतिरिक्त मुख्य साक्ष्य {producing_label} पक्ष के विद्वान अधिवक्ता श्री/श्रीमती {adv_producing} द्वारा।"
        return f"Additional Examination-in-Chief of the {producing_label} Witness No. {witness_no}, namely Mr./Ms. {witness_name}, by Ld. Advocate Mr./Ms. {adv_producing}, appearing on behalf of the {producing_label}."
    if continuation_kind == "cross":
        if lang == "gu":
            return f"ઉલટ તપાસ {defending_label} તરફે વિ. વ. શ્રી./શ્રીમતી {adv_defending} દ્વારા સાહેદ નં. {witness_no} {witness_name} ની."
        if lang == "hi":
            return f"{defending_label} पक्ष की ओर से विद्वान अधिवक्ता श्री/श्रीमती {adv_defending} द्वारा साक्षी क्रमांक {witness_no} {witness_name} का प्रतिपरीक्षण।"
        return f"Cross-Examination of the {producing_label} Witness No. {witness_no}, namely Mr./Ms. {witness_name}, by Ld. Advocate Mr./Ms. {adv_defending}, appearing on behalf of the {defending_label}."
    if continuation_kind == "further_cross":
        if lang == "gu":
            return f"વધુ ઉલટ તપાસ {defending_label} તરફે વિ. વ. શ્રી./શ્રીમતી {adv_defending} દ્વારા સાહેદ નં. {witness_no} {witness_name} ની."
        if lang == "hi":
            return f"{defending_label} पक्ष की ओर से विद्वान अधिवक्ता श्री/श्रीमती {adv_defending} द्वारा साक्षी क्रमांक {witness_no} {witness_name} का आगे प्रतिपरीक्षण।"
        return f"Further Cross-Examination of the {producing_label} Witness No. {witness_no}, namely Mr./Ms. {witness_name}, by Ld. Advocate Mr./Ms. {adv_defending}, appearing on behalf of the {defending_label}."
    if continuation_kind == "re_exam":
        if lang == "gu":
            return f"ફેર-તપાસ સાહેદ નં. {witness_no} {witness_name} ની {producing_label} તરફે વિ. વ. શ્રી./શ્રીમતી {adv_producing} દ્વારા."
        if lang == "hi":
            return f"{producing_label} पक्ष की ओर से विद्वान अधिवक्ता श्री/श्रीमती {adv_producing} द्वारा साक्षी क्रमांक {witness_no} {witness_name} का पुनः परीक्षण।"
        return f"Re-examination of the {producing_label} Witness No. {witness_no}, namely Mr./Ms. {witness_name}, by Ld. Advocate Mr./Ms. {adv_producing}."

    if lang == "gu":
        return f"{producing_label} પક્ષ દ્વારા સાહેદ નં. {witness_no} ની સરતપાસ {producing_label} તરફે વિ. વ. શ્રી./શ્રીમતી {adv_producing}."
    if lang == "hi":
        return f"{producing_label} पक्ष के साक्षी क्रमांक {witness_no} की मुख्य साक्ष्य {producing_label} पक्ष के विद्वान अधिवक्ता श्री/श्रीमती {adv_producing} द्वारा।"
    return f"Examination in chief of the {producing_label} Witness No. {witness_no} by Ld. Advocate Mr./Ms. {adv_producing} appearing on behalf of {producing_label}."


S183_LABELS = {
    "title": {"gu": "ભારતીય નાગરિક સુરક્ષા સંહિતા, ૨૦૨૩ ની કલમ ૧૮૩ મુજબ નિવેદન",
              "hi": "भारतीय नागरिक सुरक्षा संहिता, 2023 की धारा 183 के अंतर्गत कथन",
              "en": "Statement under Section 183 of the Bharatiya Nagarik Suraksha Sanhita, 2023"},
    "police_station": {"gu": "પોલીસ સ્ટેશન", "hi": "पुलिस थाना", "en": "Police Station"},
    "fir": {"gu": "ગુ.ર.નં.", "hi": "प्रथम सूचना रिपोर्ट क्र.", "en": "FIR No."},
    "sections": {"gu": "કલમ / ગુનો", "hi": "धारा / अपराध", "en": "Sections / Offence"},
}


def is_order(dep: dict) -> bool:
    return (dep or {}).get("record_type") == "order"


ORDER_LABELS = {
    "below": {"gu": "::આંક {x} લગત હુકમ::", "hi": "::प्रदर्श {x} के संबंध मे आदेश::", "en": "::Order Below Ex. {x}::"},
    "read": {"gu": "(વાંચો કલમ {x}).", "hi": "(पढ़ें धारा {x}).", "en": "(Read Sec. {x})."},
    "date": {"gu": "તારીખ", "hi": "दिनांक", "en": "Date"},
    "place": {"gu": "સ્થળ", "hi": "स्थान", "en": "Place"},
}


def order_case_list(dep: dict) -> list:
    cases = [str(c).strip() for c in (dep.get("case_ids") or []) if str(c).strip()]
    if not cases and (dep.get("primary_case_number") or "").strip():
        cases = [dep["primary_case_number"].strip()]
    return cases


def order_case_exhibit(dep: dict, case_no: str) -> str:
    per_case = ((dep.get("case_specific_details") or {}).get(case_no) or {}).get("exhibit_number", "")
    return (per_case or dep.get("exhibit_number") or "").strip()


def _order_digits(text: str, lang: str) -> str:
    if lang == "gu":
        return text.translate(str.maketrans("0123456789", "૦૧૨૩૪૫૬૭૮૯"))
    if lang == "hi":
        return text.translate(str.maketrans("0123456789", "०१२३४५६७८९"))
    return text


def order_upper_region_html(dep: dict, lang: str, only_case: Optional[str] = None) -> str:
    L = lang if lang in ("gu", "hi", "en") else "en"
    cases = [only_case] if only_case else order_case_list(dep)
    case_lines = "".join(f'<div>{html_escape(c.rstrip("."))}.</div>' for c in cases)
    lines = [f'<div class="order-case-line">{case_lines}</div>']
    exhibits = []
    for c in cases or [""]:
        e = order_case_exhibit(dep, c) if c else (dep.get("exhibit_number") or "").strip()
        if e and e not in exhibits:
            exhibits.append(e)
    if exhibits:
        # Exhibit number in the script of the order: ૦૧ (Gujarati), ०१ (Hindi), 01 (English).
        exh_text = html_escape(_order_digits(", ".join(exhibits), L))
        lines.append(f'<p class="order-center">{ORDER_LABELS["below"][L].format(x=exh_text)}</p>')
    sec = html_escape((dep.get("section_law") or "").strip().rstrip("."))
    if sec:
        lines.append(f'<p class="order-center">{ORDER_LABELS["read"][L].format(x=sec)}</p>')
    return "\n".join(lines)


# Invisible marker: the NyayDwar Sign Bridge places the Judicial Officer's
# digital signature here (just above the name).
JO_SIGN_MARKER = '<p class="jo-sign-marker" style="font-size:1px;line-height:1px;height:1px;margin:0;padding:0;color:#fff;overflow:hidden">Locate the Judicial Officer Signature Here</p>'


def order_lower_region_html(dep: dict, court: dict, lang: str) -> str:
    L = lang if lang in ("gu", "hi", "en") else "en"
    sig_lang = "en" if L == "en" else "gu"
    place, judge_name, judge_designation = dep_signature_details(court, sig_lang)
    date_text = html_escape(dep_print_date_text(dep).replace("/", "-"))
    return (
        '<div class="closing-block order-closing">'
        f'<p class="order-date">{ORDER_LABELS["date"][L]} – {date_text}.<br>{ORDER_LABELS["place"][L]} – {place}.</p>'
        f'<div class="order-signature">{JO_SIGN_MARKER}<p>({judge_name})</p><p>{judge_designation}</p><p>{place}</p></div>'
        '</div>'
    )


def is_s183(dep: dict) -> bool:
    return (dep or {}).get("record_type") == "s183"


def s183_upper_region_html(dep: dict, court: dict, lang: str) -> str:
    L = lang if lang in ("gu", "hi", "en") else "gu"
    lab = lambda k: S183_LABELS[k][L]
    e = lambda k: html_escape(dep.get(k, "") or "")
    sr, name = e("sr_no"), e("witness_name")
    continued = dep.get("mode") == "existing"
    if continued:
        title = {"gu": f"સાક્ષી ક્રમ નં. {sr} {name} નું વધુ નિવેદન.",
                 "hi": f"साक्षी क्रमांक {sr} {name} का आगे का कथन.",
                 "en": f"Further Statement of Witness Sr. No. {sr}, {name}"}[L]
    else:
        title = {"gu": f"સાક્ષી ક્રમ નં. {sr} નું નિવેદન.",
                 "hi": f"साक्षी क्रमांक {sr} का कथन.",
                 "en": f"Statement of Witness Sr. No. {sr}"}[L]
    lines = [
        f'<div class="court-head">{html_escape(dep_court_name(court, L))}</div>',
        f'<p class="witness-title">{lab("title")}</p>',
        f'<div class="case-line"><div class="case-right">'
        f'<div>{lab("police_station")} : {e("police_station")}</div>'
        f'<div>{lab("fir")} : {e("fir_number")}</div>'
        f'<div>{lab("sections")} : {e("offence_sections")}</div></div></div>',
        f'<p class="oath-line">{dep_label("oath", L)}</p>',
        f'<p class="witness-title">{title}</p>',
    ]
    if continued:
        lines.append(f'<p>{dep_label("name", L)} : {name}</p>')
    else:
        contact = e("contact_no")
        lines.append(
            '<div class="witness-grid">'
            f'<span class="label">{dep_label("name", L)}</span><span class="colon">:</span><span class="value wide">{name}</span>'
            f'<span class="label">{dep_label("father", L)}</span><span class="colon">:</span><span class="value wide">{e("father_husband_name")}</span>'
            f'<span class="label">{dep_label("religion", L)}</span><span class="colon">:</span><span class="value">{e("religion")}</span>'
            f'<span class="label">{dep_label("age", L)}</span><span class="colon">:</span><span class="value">{e("age")}</span>'
            f'<span class="label">{dep_label("occupation", L)}</span><span class="colon">:</span><span class="value wide">{e("occupation")}</span>'
            f'<span class="label">{dep_label("address", L)}</span><span class="colon">:</span><span class="value wide">{e("address")}</span>'
            + (f'<span class="label">{dep_label("contact", L)}</span><span class="colon">:</span><span class="value wide">+91-{contact}</span>' if contact else "")
            + '</div>'
        )
    notes = []
    if dep.get("av_conferencing"):
        notes.append({"gu": "નોંધ : સાક્ષીનું નિવેદન ઓડિયો-વિડિયો માધ્યમથી નોંધવામાં આવેલ છે.",
                      "hi": "नोट : साक्षी का कथन ऑडियो-वीडियो माध्यम से दर्ज किया गया है।",
                      "en": "Note : The statement is recorded through audio-video means."}[L])
    if dep.get("vulnerable_witness"):
        notes.append({"gu": "નોંધ : નબળા સાક્ષીનું નિવેદન ઇન-કેમેરા નોંધવામાં આવેલ છે.",
                      "hi": "नोट : संवेदनशील साक्षी का कथन इन-कैमरा दर्ज किया गया है।",
                      "en": "Note : The statement of the vulnerable witness is recorded in camera."}[L])
    lines.extend(f'<p class="conditional-note">{html_escape(n)}</p>' for n in notes)
    return "\n".join(lines)


def s183_lower_region_html(dep: dict, court: dict, lang: str) -> str:
    L = lang if lang in ("gu", "hi", "en") else "gu"
    footer_lang = "gu" if L == "hi" else L
    place, judge_name, judge_designation = dep_signature_details(court, footer_lang)
    lines = ['<div class="closing-block">']
    if dep.get("status") == "adjourned":
        r = html_escape(dep.get("adjourn_reason", "") or "")
        d, t = (html_escape(x) for x in dep_date_time_parts(dep.get("adjourn_next_date", "")))
        lines.append("<p>" + {
            "gu": f"{r} ની હકીકત ધ્યાને લઈ, નિવેદનની કાર્યવાહી તા. {d} સમય : {t} સુધી મુલતવી રાખવામાં આવે છે. સાક્ષી તથા સંબંધિત પોલીસ અધિકારીને જણાવેલ તારીખ અને સમયે અચૂક હાજર રહેવા હુકમ કરવામાં આવે છે. વધુ નિવેદન માટે મુલતવી.",
            "hi": f"{r} को ध्यान में रखते हुए, कथन की कार्यवाही दिनांक : {d} समय : {t} बजे तक के लिए स्थगित की जाती है। साक्षी तथा संबंधित पुलिस अधिकारी को निर्देशित किया जाता है कि वे उक्त दिनांक एवं समय पर अनिवार्य रूप से उपस्थित रहें। आगे के कथन हेतु स्थगित।",
            "en": f"Considering the reason of {r}, the recording of the statement is adjourned until Dt. : {d}, Time : {t}. The witness and the concerned police officer are directed to remain present without fail on the aforesaid date and time. Adjourned for further statement.",
        }[L] + "</p>")
    lines.append("<p>" + {
        "gu": "સાક્ષીને નિવેદન વાંચી સંભળાવતા તે ખરું અને સત્ય હોવાનું સ્વીકારે છે.",
        "hi": "साक्षी को कथन पढ़कर सुनाया व समझाया गया, वह इसे सत्य मानते हैं और इसका स्वीकार करते हैं।",
        "en": "The statement has been read over and explained to the witness, who admits it to be true and correct.",
    }[L] + "</p>")
    lines.append(witness_sign_line_html(L))
    date_display = html_escape(dep_print_date_text(dep))
    before_me = "Before Me" if L == "en" else "મારી રૂબરૂ"
    lines.append(
        '<div class="signature-block">'
        f'<div class="date-place"><p>{dep_label("date", footer_lang)} : {date_display}</p><p>{dep_label("place", footer_lang)} : {place}</p></div>'
        f'<div class="signature-text"><p class="before-me">{before_me}</p>{JO_SIGN_MARKER}<p>({judge_name})</p><p>{judge_designation}</p><p>{place}</p></div>'
        '</div>'
    )
    start_t = html_escape(dep_print_datetime_text(dep, "start_time_display", "start_time_iso"))
    complete_t = html_escape(dep_print_end_datetime_text(dep))
    duration = html_escape(dep_duration_text(dep))
    labels = {"gu": ("નિવેદન શરૂ કરવાનો સમય", "નિવેદન પૂર્ણ થવાનો સમય", "કુલ સમય"),
              "en": ("Statement Start Time", "Statement End Time", "Total Duration Consumed")}[footer_lang]
    rows = [f"<p>{labels[0]} - {start_t}</p>"]
    if complete_t:
        rows.append(f"<p>{labels[1]} - {complete_t}</p>")
    if duration:
        rows.append(f"<p>{labels[2]} - {duration}</p>")
    lines.append('<div class="timing-block">' + "".join(rows) + "</div>")
    lines.append("</div>")
    return "\n".join(lines)


def dep_upper_region_html(dep: dict, court: dict, lang: str, data: Optional[dict] = None) -> str:
    if is_s183(dep):
        return s183_upper_region_html(dep, court, lang)
    L = lang
    court_name = dep_court_name(court, L)
    case_no = html_escape(dep.get("primary_case_number", ""))
    exh = html_escape(dep.get("exhibit_number", ""))
    sr = html_escape(dep.get("sr_no", ""))
    name = html_escape(dep.get("witness_name", ""))
    father = html_escape(dep.get("father_husband_name", ""))
    religion = html_escape(dep.get("religion", ""))
    age = html_escape(dep.get("age", ""))
    occ = html_escape(dep.get("occupation", ""))
    addr = html_escape(dep.get("address", ""))
    contact = html_escape(dep.get("contact_no", ""))
    continuation_kind = dep_continuation_kind(dep, data)
    witness_title = f'{dep_label("witness_no", L)} {sr}'
    if not continuation_kind and L == "gu":
        witness_title = f"સાહેદ નં. {sr} નું નિવેદન."
    elif not continuation_kind and L == "hi":
        witness_title = f"साक्षी क्रमांक {sr} की साक्ष्य."
    elif not continuation_kind and L == "en":
        witness_title = f"{dep_party_label(dep, 'producing_party', L)} Witness No. {sr}"

    lines = [
        f'<div class="court-head">{html_escape(court_name)}</div>',
        f'<div class="case-line"><div class="case-right"><div>{dep_label("case_no", L)} : {case_no}</div><div>{dep_label("exhibit", L)} : {exh}</div></div></div>',
        f'<p class="oath-line">{dep_label("oath", L)}</p>',
        f'<p class="witness-title">{witness_title}</p>',
    ]

    if continuation_kind:
        lines.append(f'<p>{dep_label("name", L)} : {name}</p>')
    else:
        lines.append(
            '<div class="witness-grid">'
            f'<span class="label">{dep_label("name", L)}</span><span class="colon">:</span><span class="value wide">{name}</span>'
            f'<span class="label">{dep_label("father", L)}</span><span class="colon">:</span><span class="value wide">{father}</span>'
            f'<span class="label">{dep_label("religion", L)}</span><span class="colon">:</span><span class="value">{religion}</span>'
            f'<span class="label">{dep_label("age", L)}</span><span class="colon">:</span><span class="value">{age}</span>'
            f'<span class="label">{dep_label("occupation", L)}</span><span class="colon">:</span><span class="value wide">{occ}</span>'
            f'<span class="label">{dep_label("address", L)}</span><span class="colon">:</span><span class="value wide">{addr}</span>'
            f'<span class="label">{dep_label("contact", L)}</span><span class="colon">:</span><span class="value wide">+91-{contact}</span>'
            '</div>'
        )
    lines.append(f'<p class="exam-heading">{dep_examination_heading(dep, L, continuation_kind)}</p>')
    notes = dep_optional_notes(dep, L)
    if notes:
        lines.append(notes)
    return "\n".join(lines)


def dep_adjourn_text(lang: str, reason: str, next_date_time: str, adjourned_for_label: str) -> str:
    r = html_escape(reason or "")
    date_part, time_part = dep_date_time_parts(next_date_time)
    d = html_escape(date_part)
    t = html_escape(time_part)
    a = html_escape(adjourned_for_label or "")
    if lang == "gu":
        return f"{r} ની હકીકત ધ્યાને લઈ, કામ તા. {d} સમય : {t} સુધી મુલતવી રાખવામાં આવે છે. સાક્ષી, સંબંધિત પક્ષકાર/પક્ષકારો તથા વિદ્વાન વકીલોને જણાવેલ તારીખ અને સમયે અચૂક હાજર રહેવા હુકમ કરવામાં આવે છે. વધુ {a} માટે મુલતવી."
    if lang == "hi":
        return f"{r} को ध्यान में रखते हुए, प्रकरण की कार्यवाही दिनांक : {d} समय : {t} बजे तक के लिए स्थगित की जाती है। साक्षी, संबंधित पक्षकार/पक्षकारों तथा विद्वान अधिवक्ताओं को निर्देशित किया जाता है कि वे उक्त दिनांक एवं समय पर अनिवार्य रूप से उपस्थित रहें। आगे की {a} हेतु स्थगित।"
    return f"Considering the reason of {r}, the matter is adjourned until Dt. : {d}, Time : {t}. The witness, the concerned party/parties, and the learned advocates are directed to remain present without fail on the aforesaid date and time. Adjourned for {a}."


def dep_completion_lines(dep: dict, lang: str, body_html: str) -> list[str]:
    if dep.get("status") != "completed":
        return []
    cross_recorded = bool(dep.get("cross_started")) or dep.get("stage") == "cross" or dep_has_block(body_html, "start-cross")
    if lang == "gu":
        if cross_recorded:
            return ["ઉલટ-તપાસ પૂર્ણ. ફેર-તપાસ નથી."]
        return ["ફેર-તપાસ નથી."]
    if lang == "hi":
        if cross_recorded:
            return ["प्रतिपरीक्षा पूर्ण। पुनः परीक्षण नहीं।"]
        return ["पुनः परीक्षण नहीं।"]
    if cross_recorded:
        return ["Cross Examination Complete. No further examination."]
    return ["No further examination."]


def dep_correctness_text(lang: str) -> str:
    if lang == "gu":
        return "સાક્ષી ને વિ. વ. શ્રીની હાજરીમાં જવાબ વાંચી સંભળાવતા તે ખરું અને સત્ય હોવાનું સ્વીકારે છે."
    if lang == "hi":
        return "साक्षी को उपस्थित अधिवक्ता/ओं की उपस्थिति में साक्ष्य पढ़कर समझाया गया, वह इसे सत्य मानते हैं और इसका स्वीकार करते हैं।"
    return "The deposition has came to be read and explained in the presence of both the parties and the appearing Ld. Pleaders, who admit its truthfulness and agree to the fact contained therein."


def dep_timing_html(dep: dict, lang: str) -> str:
    start_t = html_escape(dep_print_datetime_text(dep, "start_time_display", "start_time_iso"))
    complete_t = html_escape(dep_print_end_datetime_text(dep))
    duration = html_escape(dep_duration_text(dep))
    if lang == "gu":
        labels = ("જુબાની શરૂ કરવાનો સમય", "જુબાની પૂર્ણ થવાનો સમય", "કુલ સમય")
    elif lang == "hi":
        labels = ("गवाही प्रारंभ समय", "गवाही पूर्ण होने का समय", "कुल समय")
    else:
        labels = ("Deposition Start Time", "Deposition End Time", "Total Duration Consumed")
    rows = [f"<p>{labels[0]} - {start_t}</p>"]
    if complete_t:
        rows.append(f"<p>{labels[1]} - {complete_t}</p>")
    if duration:
        rows.append(f"<p>{labels[2]} - {duration}</p>")
    return '<div class="timing-block">' + "".join(rows) + "</div>"


def dep_lower_region_html(dep: dict, court: dict, lang: str, body_html: str = "") -> str:
    if is_s183(dep):
        return s183_lower_region_html(dep, court, lang)
    L = lang
    render_lang = L
    footer_lang = "gu" if L == "hi" else L
    place, judge_name, judge_designation = dep_signature_details(court, footer_lang)
    lines = ['<div class="closing-block">']
    if dep.get("status") == "adjourned":
        stage_label = ADJOURNED_FOR_LABELS.get(dep.get("adjourn_for", ""), {}).get(render_lang, "")
        lines.append(f"<p>{dep_adjourn_text(render_lang, dep.get('adjourn_reason', ''), dep.get('adjourn_next_date', ''), stage_label)}</p>")
    else:
        for text in dep_completion_lines(dep, render_lang, body_html):
            lines.append(f"<p>{html_escape(text)}</p>")
    lines.append(f"<p>{dep_correctness_text(render_lang)}</p>")
    date_display = html_escape(dep_print_date_text(dep))
    if render_lang == "en":
        lines.append(
            '<div class="signature-block">'
            f'<div class="date-place"><p>{dep_label("date", render_lang)} : {date_display}</p><p>{dep_label("place", render_lang)} : {place}</p></div>'
            f'<div class="signature-text"><p class="before-me">Before Me</p>{JO_SIGN_MARKER}<p>({judge_name})</p><p>{judge_designation}</p><p>{place}</p></div>'
            '</div>'
        )
    else:
        lines.append(
            '<div class="signature-block">'
            f'<div class="date-place"><p>{dep_label("date", footer_lang)} : {date_display}</p><p>{dep_label("place", footer_lang)} : {place}</p></div>'
            f'<div class="signature-text"><p class="before-me">મારી રૂબરૂ</p>{JO_SIGN_MARKER}<p>({judge_name})</p><p>{judge_designation}</p><p>{place}</p></div>'
            '</div>'
        )
    lines.append(dep_timing_html(dep, footer_lang))
    lines.append("</div>")
    return "\n".join(lines)


@app.on_event("startup")
async def startup():
    seed_store()
    try:
        data = load_store()
        if seed_public_test_users(data):
            save_store(data)
        seed_test_photos()
    except Exception:
        pass
    try:
        data = load_store()
        if purge_expired_template_orders(data):
            save_store(data)
    except Exception:
        pass


@api.get("/")
async def root():
    return {"message": "ACJM Court App API"}


@api.post("/auth/admin-login")
async def admin_login(body: AdminLogin):
    data = load_store()
    admin = next((u for u in data["users"] if u.get("role") == "admin"), None)
    if not admin or not verify_pw(body.password, admin["password_hash"]):
        raise HTTPException(401, "Incorrect password")
    token = make_token(admin["id"], "admin", admin["login_id"])
    return {"token": token, "user": {"id": admin["id"], "role": "admin", "login_id": admin["login_id"]}}


@api.post("/auth/staff-login")
async def staff_login(body: StaffLogin):
    data = load_store()
    staff = next((u for u in data["users"] if u.get("role") == "staff" and u.get("login_id") == body.login_id), None)
    if not staff or not verify_pw(body.password, staff["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(staff["id"], "staff", staff["login_id"])
    court = None
    if staff.get("court_id"):
        court = next((c for c in data["courts"] if c["id"] == staff["court_id"]), None)
    return {
        "token": token,
        "user": {
            "id": staff["id"],
            "role": "staff",
            "login_id": staff["login_id"],
            "must_change": staff.get("must_change", False),
            "name": staff.get("name", ""),
            "designation": staff.get("designation", ""),
            "court_id": staff.get("court_id"),
            "court": court,
        },
    }


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/judge-login")
async def judge_login(body: JudgeLogin):
    data = load_store()
    judge = next((u for u in data["users"] if u.get("role") == "judge" and u.get("login_id") == body.login_id), None)
    if not judge or not verify_pw(body.password, judge["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(judge["id"], "judge", judge["login_id"])
    court_ids = judge.get("court_ids") or []
    courts = [c for c in data["courts"] if c["id"] in court_ids]
    return {
        "token": token,
        "user": {
            "id": judge["id"],
            "role": "judge",
            "login_id": judge["login_id"],
            "must_change": judge.get("must_change", False),
            "name": judge.get("name", ""),
            "court_ids": court_ids,
            "courts": courts,
        },
    }


@api.post("/auth/change-credentials")
async def change_creds(body: ChangeCredsIn, user: dict = Depends(get_current_user)):
    if user["role"] not in ("staff", "judge"):
        raise HTTPException(403, "Only staff or judge users can change credentials here")
    data = load_store()
    db_user = next((u for u in data["users"] if u["id"] == user["id"]), None)
    if not db_user:
        raise HTTPException(404, "User not found")
    if body.field == "id":
        if not body.existing_id or not body.new_id:
            raise HTTPException(400, "Missing fields")
        if body.existing_id != db_user["login_id"]:
            raise HTTPException(400, "Existing ID incorrect")
        if any(u["login_id"] == body.new_id and u["id"] != user["id"] for u in data["users"]):
            raise HTTPException(400, "Login ID already taken")
        db_user["login_id"] = body.new_id
        db_user["must_change"] = False
    elif body.field == "password":
        if not body.existing_password or not body.new_password:
            raise HTTPException(400, "Missing fields")
        if not verify_pw(body.existing_password, db_user["password_hash"]):
            raise HTTPException(400, "Existing password incorrect")
        db_user["password_hash"] = hash_pw(body.new_password)
        db_user["must_change"] = False
    else:
        raise HTTPException(400, "Invalid field")
    save_store(data)
    return {"ok": True}


@api.get("/courts")
async def list_courts():
    return load_store()["courts"]


@api.get("/courts/default")
async def default_court():
    courts = load_store()["courts"]
    return next((c for c in courts if c.get("is_default")), courts[0] if courts else {})


@api.get("/courts/{court_id}")
async def get_court(court_id: str):
    court = next((c for c in load_store()["courts"] if c["id"] == court_id), None)
    if not court:
        raise HTTPException(404, "Court not found")
    return court


@api.get("/laws")
async def list_laws(applies_to: Optional[str] = None):
    laws = load_store().get("laws", [])
    if applies_to:
        laws = [law for law in laws if not law.get("applies_to") or applies_to in law.get("applies_to", [])]
    return laws


@api.post("/laws")
async def create_law(body: LawIn, _: dict = Depends(require_role("admin"))):
    data = load_store()
    law = {
        "id": new_id(),
        "english": body.english,
        "gujarati": body.gujarati,
        "applies_to": body.applies_to,
        "created_at": now_iso(),
    }
    data.setdefault("laws", []).append(law)
    save_store(data)
    return law


@api.delete("/laws/{law_id}")
async def delete_law(law_id: str, _: dict = Depends(require_role("admin"))):
    data = load_store()
    before = len(data.get("laws", []))
    data["laws"] = [law for law in data.get("laws", []) if law.get("id") != law_id]
    if len(data["laws"]) == before:
        raise HTTPException(404, "Law not found")
    save_store(data)
    return {"ok": True}


@api.get("/complainants")
async def list_complainants():
    return sorted(load_store().get("complainants", []), key=lambda c: c.get("name", "").lower())


@api.post("/complainants")
async def create_complainant(body: ComplainantIn, _: dict = Depends(require_role("admin"))):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    data = load_store()
    if any(c.get("name", "").strip().lower() == name.lower() for c in data.get("complainants", [])):
        raise HTTPException(400, "Complainant already exists")
    doc = {"id": new_id(), "name": name, "created_at": now_iso()}
    data.setdefault("complainants", []).append(doc)
    save_store(data)
    return doc


@api.post("/complainants/bulk")
async def bulk_complainants(items: List[ComplainantIn], _: dict = Depends(require_role("admin"))):
    data = load_store()
    existing = {c.get("name", "").strip().lower() for c in data.get("complainants", [])}
    added = 0
    for item in items:
        name = item.name.strip()
        if name and name.lower() not in existing:
            data.setdefault("complainants", []).append({"id": new_id(), "name": name, "created_at": now_iso()})
            existing.add(name.lower())
            added += 1
    save_store(data)
    return {"added": added}


@api.delete("/complainants/{complainant_id}")
async def delete_complainant(complainant_id: str, _: dict = Depends(require_role("admin"))):
    data = load_store()
    before = len(data.get("complainants", []))
    data["complainants"] = [c for c in data.get("complainants", []) if c.get("id") != complainant_id]
    if len(data["complainants"]) == before:
        raise HTTPException(404, "Complainant not found")
    save_store(data)
    return {"ok": True}


@api.post("/courts")
async def create_court(body: CourtIn, _: dict = Depends(require_role("admin"))):
    data = load_store()
    doc = {
        "id": new_id(),
        "english": body.english.model_dump(),
        "gujarati": body.gujarati.model_dump(),
        "is_default": False,
        "created_at": now_iso(),
    }
    data["courts"].append(doc)
    save_store(data)
    return doc


@api.put("/courts/{court_id}")
async def update_court(court_id: str, body: CourtIn, _: dict = Depends(require_role("admin"))):
    data = load_store()
    court = next((c for c in data["courts"] if c["id"] == court_id), None)
    if not court:
        raise HTTPException(404, "Not found")
    court["english"] = body.english.model_dump()
    court["gujarati"] = body.gujarati.model_dump()
    save_store(data)
    return {"ok": True}


@api.post("/courts/{court_id}/set-default")
async def set_default_court(court_id: str, _: dict = Depends(require_role("admin"))):
    data = load_store()
    if not any(c["id"] == court_id for c in data["courts"]):
        raise HTTPException(404, "Not found")
    for court in data["courts"]:
        court["is_default"] = court["id"] == court_id
    save_store(data)
    return {"ok": True}


@api.delete("/courts/{court_id}")
async def delete_court(court_id: str, force: bool = False, _: dict = Depends(require_role("admin"))):
    data = load_store()
    court = next((c for c in data["courts"] if c["id"] == court_id), None)
    if not court:
        raise HTTPException(404, "Not found")

    staff_count = sum(1 for u in data["users"] if u.get("role") == "staff" and u.get("court_id") == court_id)
    judge_count = sum(1 for u in data["users"] if u.get("role") == "judge" and court_id in (u.get("court_ids") or []))
    case_count = sum(1 for c in data["case_log"] if c.get("court_id") == court_id)
    plea_count = sum(1 for p in data["pleas"] if p.get("court_id") == court_id)
    dep_count = sum(1 for d in data.get("depositions", []) if d.get("court_id") == court_id)

    blockers = []
    if staff_count:
        blockers.append(f"{staff_count} Staff user(s)")
    if judge_count:
        blockers.append(f"{judge_count} Judge user(s)")
    if case_count:
        blockers.append(f"{case_count} case record(s)")
    if plea_count:
        blockers.append(f"{plea_count} Plea entry(ies)")
    if dep_count:
        blockers.append(f"{dep_count} deposition record(s)")

    if blockers and not force:
        raise HTTPException(
            400,
            "This Court is still linked to " + ", ".join(blockers) +
            ". Please reassign or remove those first, or confirm force-delete.",
        )

    if court.get("is_default"):
        raise HTTPException(400, "Cannot delete the default Court. Set another Court as default first.")

    data["courts"] = [c for c in data["courts"] if c["id"] != court_id]
    if force:
        for u in data["users"]:
            if u.get("role") == "staff" and u.get("court_id") == court_id:
                u["court_id"] = None
            if u.get("role") == "judge" and court_id in (u.get("court_ids") or []):
                u["court_ids"] = [cid for cid in u["court_ids"] if cid != court_id]
    save_store(data)
    return {"ok": True}


@api.get("/staff-users")
async def list_staff(_: dict = Depends(require_role("admin"))):
    return [without_password(u) for u in load_store()["users"] if u.get("role") == "staff"]


@api.post("/staff-users")
async def create_staff(body: StaffUserIn, _: dict = Depends(require_role("admin"))):
    data = load_store()
    if any(u["login_id"] == body.login_id for u in data["users"]):
        raise HTTPException(400, "Login ID already exists")
    if body.court_id and not any(c["id"] == body.court_id for c in data["courts"]):
        raise HTTPException(400, "Selected court does not exist")
    doc = {
        "id": new_id(),
        "role": "staff",
        "login_id": body.login_id,
        "password_hash": hash_pw(body.password),
        "must_change": True,
        "court_id": body.court_id,
        "name": (body.name or "").strip(),
        "designation": (body.designation or "").strip(),
        "created_at": now_iso(),
    }
    data["users"].append(doc)
    save_store(data)
    return {"id": doc["id"], "login_id": doc["login_id"], "role": "staff", "court_id": doc["court_id"]}


@api.put("/staff-users/{user_id}")
async def update_staff(user_id: str, body: StaffUserUpdate, _: dict = Depends(require_role("admin"))):
    data = load_store()
    user = next((u for u in data["users"] if u["id"] == user_id and u["role"] == "staff"), None)
    if not user:
        raise HTTPException(404, "Not found")
    changed = False
    if body.court_id is not None:
        if body.court_id and not any(c["id"] == body.court_id for c in data["courts"]):
            raise HTTPException(400, "Selected court does not exist")
        user["court_id"] = body.court_id or None
        changed = True
    if body.name is not None:
        user["name"] = body.name.strip()
        changed = True
    if body.designation is not None:
        user["designation"] = body.designation.strip()
        changed = True
    if body.password:
        user["password_hash"] = hash_pw(body.password)
        user["must_change"] = True
        changed = True
    if not changed:
        raise HTTPException(400, "Nothing to update")
    save_store(data)
    return {"ok": True}


@api.delete("/staff-users/{user_id}")
async def delete_staff(user_id: str, _: dict = Depends(require_role("admin"))):
    data = load_store()
    before = len(data["users"])
    data["users"] = [u for u in data["users"] if not (u["id"] == user_id and u["role"] == "staff")]
    if len(data["users"]) == before:
        raise HTTPException(404, "Not found")
    save_store(data)
    return {"ok": True}


@api.get("/judge-users")
async def list_judges(_: dict = Depends(require_role("admin"))):
    return [without_password(u) for u in load_store()["users"] if u.get("role") == "judge"]


@api.post("/judge-users")
async def create_judge(body: JudgeUserIn, _: dict = Depends(require_role("admin"))):
    data = load_store()
    if any(u["login_id"] == body.login_id for u in data["users"]):
        raise HTTPException(400, "Login ID already exists")
    valid_court_ids = {c["id"] for c in data["courts"]}
    bad = [cid for cid in body.court_ids if cid not in valid_court_ids]
    if bad:
        raise HTTPException(400, "One or more selected courts do not exist")
    doc = {
        "id": new_id(),
        "role": "judge",
        "login_id": body.login_id,
        "password_hash": hash_pw(body.password),
        "must_change": True,
        "court_ids": body.court_ids,
        "created_at": now_iso(),
    }
    data["users"].append(doc)
    save_store(data)
    return {"id": doc["id"], "login_id": doc["login_id"], "role": "judge", "court_ids": doc["court_ids"]}


@api.put("/judge-users/{user_id}")
async def update_judge(user_id: str, body: JudgeUserUpdate, _: dict = Depends(require_role("admin"))):
    data = load_store()
    user = next((u for u in data["users"] if u["id"] == user_id and u["role"] == "judge"), None)
    if not user:
        raise HTTPException(404, "Not found")
    changed = False
    if body.court_ids is not None:
        valid_court_ids = {c["id"] for c in data["courts"]}
        bad = [cid for cid in body.court_ids if cid not in valid_court_ids]
        if bad:
            raise HTTPException(400, "One or more selected courts do not exist")
        user["court_ids"] = body.court_ids
        changed = True
    if body.password:
        user["password_hash"] = hash_pw(body.password)
        user["must_change"] = True
        changed = True
    if not changed:
        raise HTTPException(400, "Nothing to update")
    save_store(data)
    return {"ok": True}


@api.delete("/judge-users/{user_id}")
async def delete_judge(user_id: str, _: dict = Depends(require_role("admin"))):
    data = load_store()
    before = len(data["users"])
    data["users"] = [u for u in data["users"] if not (u["id"] == user_id and u["role"] == "judge")]
    if len(data["users"]) == before:
        raise HTTPException(404, "Not found")
    save_store(data)
    return {"ok": True}


@api.get("/judge-users/me/settings")
async def get_my_judge_settings(user: dict = Depends(require_role("judge"))):
    data = load_store()
    judge = next((u for u in data["users"] if u["id"] == user["id"]), None)
    if not judge:
        raise HTTPException(404, "Not found")
    return judge.get("settings", {"hostile_text": {}, "start_cross_text": {}})


@api.put("/judge-users/me/settings")
async def update_my_judge_settings(body: JudgeSettingsIn, user: dict = Depends(require_role("judge"))):
    # Deliberately scoped to the CALLING judge only (user["id"] from their own
    # auth token) — there is no way for a judge to affect another judge's
    # settings through this endpoint, by design (per-judge, never global).
    data = load_store()
    judge = next((u for u in data["users"] if u["id"] == user["id"]), None)
    if not judge:
        raise HTTPException(404, "Not found")
    settings = judge.setdefault("settings", {"hostile_text": {}, "start_cross_text": {}})
    settings.setdefault("hostile_text", {})[body.language] = body.hostile_text
    settings.setdefault("start_cross_text", {})[body.language] = body.start_cross_text
    save_store(data)
    return {"ok": True, "settings": settings}


@api.post("/admin/excel")
async def upload_excel(file: UploadFile = File(...), _: dict = Depends(require_role("admin"))):
    data = load_store()
    content = await file.read()
    data["admin_excel"] = {
        "id": new_id(),
        "filename": file.filename,
        "content_b64": base64.b64encode(content).decode(),
        "uploaded_at": now_iso(),
    }
    save_store(data)
    return {"ok": True, "filename": file.filename}


@api.get("/admin/excel/info")
async def excel_info():
    doc = load_store().get("admin_excel")
    if not doc:
        return {}
    return {k: v for k, v in doc.items() if k != "content_b64"}


@api.get("/admin/excel/download")
async def download_excel():
    doc = load_store().get("admin_excel")
    if not doc:
        raise HTTPException(404, "No file uploaded")
    return StreamingResponse(
        io.BytesIO(base64.b64decode(doc["content_b64"])),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'},
    )


async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except Exception:
        return None


# ---------------- Advocate & Litigant accounts (registration + approval) ----------------
# Advocates must register (approved by the Administrator) and log in.
# Litigants may use the services without logging in; registering is optional
# and is approved by the staff of the court chosen by the litigant (the
# Administrator can also approve). Approved users get the Message Center.
PUBLIC_ROLES = ("advocate", "litigant")
_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _norm_mobile(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits


def _public_user_view(u: dict, data: dict) -> dict:
    court = next((c for c in data.get("courts", []) if c["id"] == u.get("court_id")), None)
    return {
        "id": u["id"], "role": u["role"], "name": u.get("name", ""), "enrollment_no": u.get("enrollment_no", ""),
        "mobile": u.get("mobile", ""), "email": u.get("email", ""), "status": u.get("status", "pending"),
        "court_id": u.get("court_id", ""), "court_name": ((court or {}).get("english") or {}).get("court_name", ""),
        "created_at": u.get("created_at", ""), "decided_at": u.get("decided_at", ""), "decided_by": u.get("decided_by", ""),
        "reject_reason": u.get("reject_reason", ""),
    }


def _find_public_user(data: dict, login: str) -> Optional[dict]:
    login = (login or "").strip()
    mobile = _norm_mobile(login)
    for u in data.get("users", []):
        if u.get("role") not in PUBLIC_ROLES:
            continue
        if login and "@" in login and (u.get("email") or "").lower() == login.lower():
            return u
        if mobile and len(mobile) == 10 and u.get("mobile") == mobile:
            return u
    return None


class AdvocateRegisterIn(BaseModel):
    name: str
    enrollment_no: str
    mobile: str
    email: str
    password: str


class LitigantRegisterIn(BaseModel):
    name: str
    mobile: str = ""
    email: str = ""
    password: str
    court_id: str


class PublicLoginIn(BaseModel):
    login: str
    password: str
    role: str = "advocate"


def _check_new_public_user(data: dict, mobile: str, email: str, password: str):
    if mobile and not _MOBILE_RE.match(mobile):
        raise HTTPException(400, "Please enter a valid 10-digit mobile number")
    if email and not _EMAIL_RE.match(email):
        raise HTTPException(400, "Please enter a valid email address")
    if len(password or "") < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    for u in data.get("users", []):
        if u.get("role") not in PUBLIC_ROLES or u.get("status") == "rejected":
            continue
        if mobile and u.get("mobile") == mobile:
            raise HTTPException(400, "This mobile number is already registered")
        if email and (u.get("email") or "").lower() == email.lower():
            raise HTTPException(400, "This email address is already registered")


@api.post("/auth/advocate-register")
async def advocate_register(body: AdvocateRegisterIn):
    data = load_store()
    name, enrol = body.name.strip(), body.enrollment_no.strip()
    mobile, email = _norm_mobile(body.mobile), body.email.strip()
    if not name or not enrol or not mobile or not email:
        raise HTTPException(400, "Name, Enrollment Number, Mobile Number and Email are all required")
    _check_new_public_user(data, mobile, email, body.password)
    if any(u.get("role") == "advocate" and u.get("status") != "rejected" and (u.get("enrollment_no") or "").strip().lower() == enrol.lower() for u in data["users"]):
        raise HTTPException(400, "This Enrollment Number is already registered")
    data["users"].append({
        "id": new_id(), "role": "advocate", "name": name, "enrollment_no": enrol, "mobile": mobile, "email": email,
        "login_id": email, "password_hash": hash_pw(body.password), "status": "pending", "created_at": now_iso(),
    })
    save_store(data)
    return {"ok": True, "message": "Registration submitted. You can log in after the Administrator approves it."}


@api.post("/auth/litigant-register")
async def litigant_register(body: LitigantRegisterIn):
    data = load_store()
    name = body.name.strip()
    mobile, email = _norm_mobile(body.mobile), body.email.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    if not mobile and not email:
        raise HTTPException(400, "Please enter your mobile number or email address (it will be your User ID)")
    if not any(c["id"] == body.court_id for c in data["courts"]):
        raise HTTPException(400, "Please select the court in which your case is filed")
    _check_new_public_user(data, mobile, email, body.password)
    data["users"].append({
        "id": new_id(), "role": "litigant", "name": name, "mobile": mobile, "email": email, "court_id": body.court_id,
        "login_id": email or mobile, "password_hash": hash_pw(body.password), "status": "pending", "created_at": now_iso(),
    })
    save_store(data)
    return {"ok": True, "message": "Registration submitted. You can log in after the staff of the selected court approves it."}


@api.post("/auth/public-login")
async def public_login(body: PublicLoginIn):
    data = load_store()
    user = _find_public_user(data, body.login)
    if not user or user.get("role") != body.role or not verify_pw(body.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid User ID or password")
    if user.get("status") == "pending":
        raise HTTPException(403, "Your registration is awaiting approval.")
    if user.get("status") != "approved":
        raise HTTPException(403, "Your registration was not approved. Please contact the court.")
    token = make_token(user["id"], user["role"], user.get("login_id", ""))
    return {"token": token, "user": _public_user_view(user, data)}


def _can_decide(actor: dict, target: dict) -> bool:
    if actor.get("role") == "admin":
        return True
    if actor.get("role") == "staff" and target.get("role") == "litigant":
        return bool(actor.get("court_id")) and actor.get("court_id") == target.get("court_id")
    return False


@api.get("/registrations")
async def list_registrations(user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "staff"):
        raise HTTPException(403, "Forbidden")
    data = load_store()
    out = [_public_user_view(u, data) for u in data.get("users", []) if u.get("role") in PUBLIC_ROLES and _can_decide(user, u)]
    order = {"pending": 0, "approved": 1, "rejected": 2}
    out.sort(key=lambda x: (order.get(x["status"], 3), x.get("created_at", "")), reverse=False)
    return out


class RegistrationDecisionIn(BaseModel):
    reason: str = ""


@api.post("/registrations/{user_id}/{decision}")
async def decide_registration(user_id: str, decision: str, body: RegistrationDecisionIn, user: dict = Depends(get_current_user)):
    if decision not in ("approve", "reject"):
        raise HTTPException(400, "Unknown decision")
    data = load_store()
    target = next((u for u in data.get("users", []) if u["id"] == user_id and u.get("role") in PUBLIC_ROLES), None)
    if not target:
        raise HTTPException(404, "Registration not found")
    if not _can_decide(user, target):
        raise HTTPException(403, "You cannot decide this registration")
    target["status"] = "approved" if decision == "approve" else "rejected"
    target["reject_reason"] = body.reason.strip() if decision == "reject" else ""
    target["decided_at"] = now_iso()
    target["decided_by"] = f"{user.get('role')}:{user.get('login_id', '')}"
    save_store(data)
    return {"ok": True, "registration": _public_user_view(target, data)}


@api.get("/public/me")
async def public_me(user: dict = Depends(get_current_user)):
    if user.get("role") not in PUBLIC_ROLES:
        raise HTTPException(403, "Forbidden")
    return _public_user_view(user, load_store())


# ---------------- Message Center ----------------
# An email-like message system between the Judicial Officers, the court staff
# and the registered (approved) Advocates and Litigants. Folders: Inbox, Sent,
# Drafts. Attachments are stored on disk under backend/message_files/<msg id>/.
MESSAGE_FILES_DIR = ROOT_DIR / "message_files"
MSG_MAX_FILE_BYTES = 25 * 1024 * 1024
MSG_MAX_TOTAL_BYTES = 50 * 1024 * 1024
MSG_ROLES = ("judge", "staff", "advocate", "litigant")
MSG_ROLE_LABELS = {"judge": "Judicial Officer", "staff": "Court Staff", "advocate": "Advocate", "litigant": "Litigant"}


def _court_by_id(data: dict, court_id: str) -> Optional[dict]:
    return next((c for c in data.get("courts", []) if c.get("id") == court_id), None)


def _msg_can_use(u: Optional[dict]) -> bool:
    if not u or u.get("role") not in MSG_ROLES:
        return False
    if u.get("role") in PUBLIC_ROLES and u.get("status") != "approved":
        return False
    return True


def _mask_mobile(m: str) -> str:
    m = m or ""
    return (m[:2] + "xxxxxx" + m[-2:]) if len(m) == 10 else ""


def _mask_email(e: str) -> str:
    e = e or ""
    if "@" not in e:
        return ""
    name, dom = e.split("@", 1)
    return (name[:2] + "***@" + dom) if name else ""


def _msg_identity(u: dict, data: dict) -> dict:
    """Name + designation lines shown in lists and under every message."""
    role = u.get("role")
    name, lines = "", []
    if role == "judge":
        court = None
        for cid in (u.get("court_ids") or []):
            court = _court_by_id(data, cid)
            if court:
                break
        eng = (court or {}).get("english") or {}
        name = (u.get("name") or eng.get("judge_name") or u.get("login_id") or "Judicial Officer").strip()
        desig = ", ".join(x for x in [(u.get("designation") or eng.get("judge_designation") or "").strip(), (eng.get("place") or "").strip()] if x)
        lines = [desig] if desig else ["Judicial Officer"]
    elif role == "staff":
        court = _court_by_id(data, u.get("court_id") or "")
        eng = (court or {}).get("english") or {}
        name = (u.get("name") or "").strip() or f"{u.get('login_id', '')} (Staff)"
        lines = [(u.get("designation") or "").strip() or "Court Staff"]
        if eng.get("court_name"):
            lines.append(eng["court_name"])
    elif role == "advocate":
        name = (u.get("name") or "").strip()
        lines = ["Advocate" + (f" (Enrollment No. {u['enrollment_no']})" if u.get("enrollment_no") else "")]
    elif role == "litigant":
        court = _court_by_id(data, u.get("court_id") or "")
        name = (u.get("name") or "").strip()
        lines = ["Litigant"]
        cname = ((court or {}).get("english") or {}).get("court_name", "")
        if cname:
            lines.append(cname)
    return {"id": u["id"], "role": role, "role_label": MSG_ROLE_LABELS.get(role, role), "name": name,
            "designation": lines[0] if lines else "", "lines": lines}


def _msg_user(data: dict, user_id: str) -> Optional[dict]:
    return next((u for u in data.get("users", []) if u.get("id") == user_id), None)


def _msg_require(user: dict) -> dict:
    data = load_store()
    me = _msg_user(data, user["id"])
    if not _msg_can_use(me):
        raise HTTPException(403, "Message Center is available to Judicial Officers, Court Staff and registered (approved) Advocates / Litigants")
    return data, me


def _msg_view(m: dict, me_id: str, data: dict, full: bool = False) -> dict:
    def who(uid):
        u = _msg_user(data, uid)
        return _msg_identity(u, data) if u else {"id": uid, "name": "(user removed)", "designation": "", "lines": [], "role": "", "role_label": ""}
    out = {
        "id": m["id"], "status": m.get("status"), "subject": m.get("subject", ""),
        "from": m.get("from_identity") or who(m.get("from_user_id")),
        "to": [who(x) for x in m.get("to", [])], "cc": [who(x) for x in m.get("cc", [])],
        "attachments": [{k: a.get(k) for k in ("id", "filename", "size", "content_type")} for a in m.get("attachments", [])],
        "created_at": m.get("created_at"), "updated_at": m.get("updated_at"), "sent_at": m.get("sent_at"),
        "read": me_id in (m.get("read_by") or []) or m.get("from_user_id") == me_id,
        "snippet": (m.get("body") or "").replace("\n", " ")[:140],
    }
    if full:
        out["body"] = m.get("body", "")
        out["signature"] = m.get("signature") or (m.get("from_identity") or who(m.get("from_user_id")))
    return out


@api.get("/messages/me")
async def messages_me(user: dict = Depends(get_current_user)):
    data, me = _msg_require(user)
    unread = sum(1 for m in data.get("messages", []) if m.get("status") == "sent"
                 and me["id"] in (m.get("to", []) + m.get("cc", [])) and me["id"] not in (m.get("read_by") or [])
                 and me["id"] not in (m.get("hidden_for") or []))
    return {"identity": _msg_identity(me, data), "unread": unread}


@api.get("/messages/directory")
async def messages_directory(q: str = "", user: dict = Depends(get_current_user)):
    data, me = _msg_require(user)
    q = (q or "").strip().lower()
    if len(q) < 2:
        return []
    qm = _norm_mobile(q) if re.search(r"\d", q) else ""
    out = []
    for u in data.get("users", []):
        if u["id"] == me["id"] or not _msg_can_use(u):
            continue
        ident = _msg_identity(u, data)
        hay_name = " ".join([ident["name"], ident["designation"], u.get("login_id", "") if u.get("role") in ("judge", "staff") else ""]).lower()
        hit = q in hay_name
        if not hit and u.get("email") and q in u["email"].lower() and ("@" in q or len(q) >= 4):
            hit = True
        if not hit and qm and len(qm) >= 4 and qm in (u.get("mobile") or ""):
            hit = True
        if hit:
            ident["hint"] = " · ".join(x for x in [_mask_mobile(u.get("mobile", "")), _mask_email(u.get("email", ""))] if x)
            out.append(ident)
    order = {"judge": 0, "staff": 1, "advocate": 2, "litigant": 3}
    out.sort(key=lambda x: (order.get(x["role"], 9), x["name"].lower()))
    return out[:25]


@api.get("/messages")
async def messages_list(folder: str = "inbox", user: dict = Depends(get_current_user)):
    data, me = _msg_require(user)
    uid = me["id"]
    items = []
    for m in data.get("messages", []):
        if uid in (m.get("hidden_for") or []):
            continue
        if folder == "inbox" and m.get("status") == "sent" and uid in (m.get("to", []) + m.get("cc", [])):
            items.append(m)
        elif folder == "sent" and m.get("status") == "sent" and m.get("from_user_id") == uid:
            items.append(m)
        elif folder == "drafts" and m.get("status") == "draft" and m.get("from_user_id") == uid:
            items.append(m)
    items.sort(key=lambda m: m.get("sent_at") or m.get("updated_at") or m.get("created_at") or "", reverse=True)
    return [_msg_view(m, uid, data) for m in items]


def _msg_visible(m: dict, uid: str) -> bool:
    if m.get("from_user_id") == uid:
        return True
    return m.get("status") == "sent" and uid in (m.get("to", []) + m.get("cc", []))


@api.get("/messages/{msg_id}")
async def messages_get(msg_id: str, user: dict = Depends(get_current_user)):
    data, me = _msg_require(user)
    m = next((x for x in data.get("messages", []) if x["id"] == msg_id), None)
    if not m or not _msg_visible(m, me["id"]):
        raise HTTPException(404, "Message not found")
    if m.get("status") == "sent" and me["id"] != m.get("from_user_id") and me["id"] not in (m.get("read_by") or []):
        m.setdefault("read_by", []).append(me["id"])
        save_store(data)
    return _msg_view(m, me["id"], data, full=True)


def _safe_filename(name: str) -> str:
    name = os.path.basename((name or "file").replace("\\", "/")).strip() or "file"
    name = re.sub(r"[\x00-\x1f<>:\"/\\|?*]+", "_", name)
    return name[:150]


@api.post("/messages/save")
async def messages_save(
    request: Request,
    action: str = Form("draft"),
    draft_id: str = Form(""),
    to: str = Form("[]"),
    cc: str = Form("[]"),
    subject: str = Form(""),
    body: str = Form(""),
    keep_attachments: str = Form("[]"),
    user: dict = Depends(get_current_user),
):
    if action not in ("draft", "send"):
        raise HTTPException(400, "Unknown action")
    data, me = _msg_require(user)
    try:
        to_ids = [str(x) for x in json.loads(to or "[]")]
        cc_ids = [str(x) for x in json.loads(cc or "[]")]
        keep_ids = [str(x) for x in json.loads(keep_attachments or "[]")]
    except Exception:
        raise HTTPException(400, "Invalid recipients")
    # de-duplicate, keep order; CC never repeats a To recipient
    to_ids = list(dict.fromkeys(x for x in to_ids if x and x != me["id"]))
    cc_ids = list(dict.fromkeys(x for x in cc_ids if x and x != me["id"] and x not in to_ids))
    for rid in to_ids + cc_ids:
        if not _msg_can_use(_msg_user(data, rid)):
            raise HTTPException(400, "One of the recipients is not available in the Message Center")
    subject = (subject or "").strip()[:300]
    if action == "send":
        if not to_ids:
            raise HTTPException(400, "Please add at least one recipient in 'To'")
        if not subject:
            raise HTTPException(400, "Please enter the Subject")

    form = await request.form()
    uploads = [f for f in form.getlist("files") if hasattr(f, "filename") and f.filename]

    msgs = data.setdefault("messages", [])
    m = None
    if draft_id:
        m = next((x for x in msgs if x["id"] == draft_id), None)
        if not m or m.get("from_user_id") != me["id"] or m.get("status") != "draft":
            raise HTTPException(404, "Draft not found")
    if m is None:
        m = {"id": new_id(), "from_user_id": me["id"], "created_at": now_iso(), "attachments": []}
        msgs.append(m)

    folder = MESSAGE_FILES_DIR / m["id"]
    kept = [a for a in m.get("attachments", []) if a["id"] in keep_ids]
    for a in m.get("attachments", []):
        if a["id"] not in keep_ids:
            try:
                (folder / a["stored"]).unlink()
            except Exception:
                pass
    total = sum(a.get("size", 0) for a in kept)
    new_atts = []
    for f in uploads:
        content = await f.read()
        if len(content) > MSG_MAX_FILE_BYTES:
            raise HTTPException(400, f"'{f.filename}' is larger than 25 MB")
        total += len(content)
        if total > MSG_MAX_TOTAL_BYTES:
            raise HTTPException(400, "Attachments together cannot exceed 50 MB")
        att_id = new_id()
        fname = _safe_filename(f.filename)
        folder.mkdir(parents=True, exist_ok=True)
        stored = f"{att_id}_{fname}"
        (folder / stored).write_bytes(content)
        new_atts.append({"id": att_id, "filename": fname, "stored": stored, "size": len(content),
                         "content_type": f.content_type or "application/octet-stream"})

    m.update({"to": to_ids, "cc": cc_ids, "subject": subject, "body": body or "",
              "attachments": kept + new_atts, "updated_at": now_iso()})
    if action == "send":
        ident = _msg_identity(me, data)
        m.update({"status": "sent", "sent_at": now_iso(), "from_identity": ident, "signature": ident, "read_by": []})
    else:
        m["status"] = "draft"
    save_store(data)
    return _msg_view(m, me["id"], data, full=True)


@api.delete("/messages/{msg_id}")
async def messages_delete_draft(msg_id: str, user: dict = Depends(get_current_user)):
    data, me = _msg_require(user)
    m = next((x for x in data.get("messages", []) if x["id"] == msg_id), None)
    if not m or m.get("from_user_id") != me["id"] or m.get("status") != "draft":
        raise HTTPException(404, "Draft not found")
    data["messages"] = [x for x in data["messages"] if x["id"] != msg_id]
    shutil.rmtree(MESSAGE_FILES_DIR / msg_id, ignore_errors=True)
    save_store(data)
    return {"ok": True}


@api.get("/messages/{msg_id}/attachments/{att_id}")
async def messages_attachment(msg_id: str, att_id: str, user: dict = Depends(get_current_user)):
    data, me = _msg_require(user)
    m = next((x for x in data.get("messages", []) if x["id"] == msg_id), None)
    if not m or not _msg_visible(m, me["id"]):
        raise HTTPException(404, "Message not found")
    a = next((x for x in m.get("attachments", []) if x["id"] == att_id), None)
    path = (MESSAGE_FILES_DIR / msg_id / a["stored"]) if a else None
    if not a or not path.exists():
        raise HTTPException(404, "Attachment not found")
    return FileResponse(str(path), filename=a["filename"], media_type=a.get("content_type") or "application/octet-stream")


# ---------------- Demand (text from staff) + Live Deposition for Advocates ----------------
# Demand: during a deposition / 183 statement the Judicial Officer asks the
# court staff for the text of an earlier document. The staff pastes the text
# (typed, or obtained by OCR in any other application) and sends it; it pops
# up on the Judicial Officer's typing screen to copy.
# Live Deposition: a registered advocate who was selected as the advocate of
# the producing / defending party when the deposition was started can watch the
# text being typed (never for a vulnerable witness — recorded in camera) and
# raise an objection, which pops up on the Judicial Officer's typing screen.


def _dep_find(data: dict, dep_id: str) -> Optional[dict]:
    return next((d for d in data.get("depositions", []) if d.get("id") == dep_id), None)


def _dep_label(dep: dict) -> str:
    if is_s183(dep):
        return f"183 Statement — {dep.get('police_station', '')} P.S., FIR {dep.get('fir_number', '')} — {dep.get('witness_name', '')}"
    return f"Case {dep.get('primary_case_number', '')} — Witness: {dep.get('witness_name', '')}" + (f" (Exh. {dep['exhibit_number']})" if dep.get("exhibit_number") else "")


def _court_label(data: dict, court_id: str) -> str:
    c = _court_by_id(data, court_id or "")
    return ((c or {}).get("english") or {}).get("court_name", "")


class DemandIn(BaseModel):
    note: str = ""


class DemandReplyIn(BaseModel):
    text: str


class SeenIn(BaseModel):
    demand_ids: List[str] = Field(default_factory=list)
    objection_ids: List[str] = Field(default_factory=list)


class ObjectionIn(BaseModel):
    text: str


def _demand_view(d: dict, data: dict) -> dict:
    dep = _dep_find(data, d.get("dep_id")) or {}
    judge = _msg_user(data, d.get("judge_user_id") or "")
    staff = _msg_user(data, d.get("answered_by") or "") if d.get("answered_by") else None
    return {
        "id": d["id"], "dep_id": d.get("dep_id"), "status": d.get("status"), "note": d.get("note", ""),
        "reply_text": d.get("reply_text", ""), "requested_at": d.get("requested_at"), "answered_at": d.get("answered_at"),
        "judge_seen": bool(d.get("judge_seen")), "label": _dep_label(dep) if dep else "",
        "closed_at": d.get("closed_at"), "closed_reason": d.get("closed_reason", ""),
        "court_name": _court_label(data, d.get("court_id")),
        "judge": _msg_identity(judge, data) if judge else None,
        "answered_by": _msg_identity(staff, data) if staff else None,
    }


@api.post("/depositions/{dep_id}/demands")
async def create_demand(dep_id: str, body: DemandIn, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = _dep_find(data, dep_id)
    if not dep or is_order(dep):
        raise HTTPException(404, "Deposition not found")
    if dep.get("status") != "in_progress":
        raise HTTPException(400, "Demand is available only while the deposition is being typed (not after it is adjourned or completed).")
    if not any(u.get("role") == "staff" and u.get("court_id") == dep.get("court_id") for u in data["users"]):
        raise HTTPException(400, "No staff user is assigned to this court. Please ask the Administrator to assign one.")
    d = {"id": new_id(), "dep_id": dep_id, "court_id": dep.get("court_id"), "judge_user_id": user["id"],
         "note": (body.note or "").strip()[:2000], "status": "pending", "reply_text": "",
         "requested_at": now_iso(), "judge_seen": False}
    data.setdefault("demands", []).append(d)
    save_store(data)
    return _demand_view(d, data)


@api.get("/depositions/{dep_id}/live-events")
async def dep_live_events(dep_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    if not _dep_find(data, dep_id):
        raise HTTPException(404, "Deposition not found")
    if _close_ended_demands(data):
        save_store(data)
    demands = [_demand_view(d, data) for d in data.get("demands", []) if d.get("dep_id") == dep_id]
    objections = [o for o in data.get("objections", []) if o.get("dep_id") == dep_id]
    demands.sort(key=lambda x: x.get("requested_at") or "")
    objections.sort(key=lambda x: x.get("created_at") or "")
    return {"demands": demands, "objections": objections}


@api.post("/depositions/{dep_id}/live-events/seen")
async def dep_live_events_seen(dep_id: str, body: SeenIn, user: dict = Depends(require_role("judge"))):
    data = load_store()
    changed = False
    for d in data.get("demands", []):
        if d.get("dep_id") == dep_id and d["id"] in body.demand_ids and not d.get("judge_seen"):
            d["judge_seen"] = True; d["judge_seen_at"] = now_iso(); changed = True
    for o in data.get("objections", []):
        if o.get("dep_id") == dep_id and o["id"] in body.objection_ids and not o.get("judge_seen"):
            o["judge_seen"] = True; o["seen_at"] = now_iso(); changed = True
    if changed:
        save_store(data)
    return {"ok": True}


def _close_ended_demands(data: dict) -> bool:
    """A demand ends automatically once its deposition is adjourned / completed."""
    changed = False
    for d in data.get("demands", []):
        if d.get("status") != "pending":
            continue
        dep = _dep_find(data, d.get("dep_id"))
        if not dep or dep.get("status") != "in_progress":
            d["status"] = "closed"
            d["closed_at"] = now_iso()
            d["closed_reason"] = f"Deposition {(dep or {}).get('status') or 'closed'}"
            changed = True
    return changed


def _staff_court(user: dict, data: dict) -> str:
    me = _msg_user(data, user["id"]) or {}
    return me.get("court_id") or ""


@api.get("/demands")
async def staff_demands(status: str = "all", user: dict = Depends(require_role("staff"))):
    data = load_store()
    if _close_ended_demands(data):
        save_store(data)
    court_id = _staff_court(user, data)
    items = [d for d in data.get("demands", []) if court_id and d.get("court_id") == court_id and (status == "all" or d.get("status") == status)]
    items.sort(key=lambda d: (0 if d.get("status") == "pending" else 1, d.get("requested_at") or ""), reverse=False)
    pend = [d for d in items if d.get("status") == "pending"]
    done = sorted([d for d in items if d.get("status") != "pending"], key=lambda d: d.get("answered_at") or "", reverse=True)
    return [_demand_view(d, data) for d in pend + done[:100]]


@api.get("/demands/pending-count")
async def staff_demands_count(user: dict = Depends(require_role("staff"))):
    data = load_store()
    if _close_ended_demands(data):
        save_store(data)
    court_id = _staff_court(user, data)
    pend = [d for d in data.get("demands", []) if court_id and d.get("court_id") == court_id and d.get("status") == "pending"]
    latest = max((d.get("requested_at") or "" for d in pend), default="")
    return {"pending": len(pend), "latest": latest}


@api.post("/demands/{demand_id}/reply")
async def staff_demand_reply(demand_id: str, body: DemandReplyIn, user: dict = Depends(require_role("staff"))):
    data = load_store()
    court_id = _staff_court(user, data)
    d = next((x for x in data.get("demands", []) if x["id"] == demand_id), None)
    if not d or d.get("court_id") != court_id:
        raise HTTPException(404, "Demand not found")
    if _close_ended_demands(data):
        save_store(data)
    if d.get("status") != "pending":
        raise HTTPException(400, "This demand has ended because the deposition has been adjourned / completed.")
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Please type or paste the text before sending")
    d.update({"status": "answered", "reply_text": text[:200000], "answered_at": now_iso(), "answered_by": user["id"], "judge_seen": False})
    save_store(data)
    return _demand_view(d, data)


# --- Advocate selection while starting a deposition ---
@api.get("/advocates/search")
async def advocates_search(q: str = "", user: dict = Depends(require_role("judge"))):
    data = load_store()
    q = (q or "").strip().lower()
    if len(q) < 2:
        return []
    qm = _norm_mobile(q) if re.search(r"\d", q) else ""
    out = []
    for u in data.get("users", []):
        if u.get("role") != "advocate" or u.get("status") != "approved":
            continue
        hit = q in (u.get("name") or "").lower() or q in (u.get("enrollment_no") or "").lower() \
            or (("@" in q or len(q) >= 4) and q in (u.get("email") or "").lower()) \
            or (qm and len(qm) >= 4 and qm in (u.get("mobile") or ""))
        if hit:
            out.append({"id": u["id"], "name": u.get("name", ""), "enrollment_no": u.get("enrollment_no", ""),
                        "hint": " · ".join(x for x in [_mask_mobile(u.get("mobile", "")), _mask_email(u.get("email", ""))] if x)})
    out.sort(key=lambda x: x["name"].lower())
    return out[:20]


# --- Live deposition view for advocates ---
def _advocate_side(dep: dict, adv: dict, data: dict) -> str:
    if dep.get("advocate_producing_id") == adv["id"]:
        return "producing"
    if dep.get("advocate_defending_id") == adv["id"]:
        return "defending"
    # Fallback: the name typed by the court exactly matches one registered advocate.
    name = (adv.get("name") or "").strip().lower()
    if not name:
        return ""
    same = [u for u in data.get("users", []) if u.get("role") == "advocate" and u.get("status") == "approved"
            and (u.get("name") or "").strip().lower() == name]
    if len(same) != 1:
        return ""
    if not dep.get("advocate_producing_id") and (dep.get("advocate_producing") or "").strip().lower() == name:
        return "producing"
    if not dep.get("advocate_defending_id") and (dep.get("advocate_defending") or "").strip().lower() == name:
        return "defending"
    return ""


def _live_allowed(dep: dict) -> bool:
    return (not is_s183(dep) and not is_order(dep) and dep.get("status") == "in_progress"
            and not dep.get("vulnerable_witness"))


def _require_advocate(user: dict, data: dict) -> dict:
    me = _msg_user(data, user["id"])
    if not me or me.get("role") != "advocate" or me.get("status") != "approved":
        raise HTTPException(403, "Live deposition is available only to registered (approved) advocates")
    return me


def _live_header(dep: dict, data: dict, side: str) -> dict:
    return {
        "id": dep["id"], "case_number": dep.get("primary_case_number", ""), "case_ids": dep.get("case_ids", []),
        "court_name": _court_label(data, dep.get("court_id")), "witness_name": dep.get("witness_name", ""),
        "exhibit_number": dep.get("exhibit_number", ""), "stage": dep.get("stage", ""), "language": dep.get("language", "gu"),
        "producing_party": dep.get("producing_party", ""), "defending_party": dep.get("defending_party", ""),
        "advocate_producing": dep.get("advocate_producing", ""), "advocate_defending": dep.get("advocate_defending", ""),
        "my_side": side, "updated_at": dep.get("updated_at"), "created_at": dep.get("created_at"),
    }


@api.get("/live/depositions")
async def live_list(user: dict = Depends(get_current_user)):
    data = load_store()
    me = _require_advocate(user, data)
    out = []
    for dep in data.get("depositions", []):
        if not _live_allowed(dep):
            continue
        side = _advocate_side(dep, me, data)
        if side:
            out.append(_live_header(dep, data, side))
    out.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
    return out


@api.get("/live/depositions/{dep_id}")
async def live_view(dep_id: str, user: dict = Depends(get_current_user)):
    data = load_store()
    me = _require_advocate(user, data)
    dep = _dep_find(data, dep_id)
    side = _advocate_side(dep, me, data) if dep else ""
    if not dep or not side:
        raise HTTPException(404, "Deposition not found")
    header = _live_header(dep, data, side)
    mine = [{"id": o["id"], "text": o.get("text", ""), "created_at": o.get("created_at"), "seen": bool(o.get("judge_seen")),
             "seen_at": o.get("seen_at")} for o in data.get("objections", []) if o.get("dep_id") == dep_id and o.get("advocate_id") == me["id"]]
    if dep.get("status") != "in_progress" or dep.get("vulnerable_witness"):
        reason = ("This deposition is being recorded in camera (vulnerable witness); it cannot be viewed."
                  if dep.get("vulnerable_witness") else
                  "This deposition is no longer live (it has been completed or adjourned).")
        return {**header, "live": False, "reason": reason, "paragraphs": [], "objections": mine}
    blocks = html_to_blocks(deposition_effective_body(dep))
    return {**header, "live": True, "paragraphs": [b["text"] for b in blocks], "objections": mine}


@api.post("/live/depositions/{dep_id}/objections")
async def live_objection(dep_id: str, body: ObjectionIn, user: dict = Depends(get_current_user)):
    data = load_store()
    me = _require_advocate(user, data)
    dep = _dep_find(data, dep_id)
    side = _advocate_side(dep, me, data) if dep else ""
    if not dep or not side:
        raise HTTPException(404, "Deposition not found")
    if not _live_allowed(dep):
        raise HTTPException(400, "This deposition is not live now; the objection cannot be sent.")
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Please type the objection")
    o = {"id": new_id(), "dep_id": dep_id, "advocate_id": me["id"], "advocate_name": me.get("name", ""),
         "enrollment_no": me.get("enrollment_no", ""), "side": side,
         "side_label": f"Advocate for the {'producing' if side == 'producing' else 'defending'} party ({dep.get('producing_party' if side == 'producing' else 'defending_party', '')})",
         "text": text[:5000], "created_at": now_iso(), "judge_seen": False}
    data.setdefault("objections", []).append(o)
    save_store(data)
    return {"ok": True, "id": o["id"]}


# ---------------- Single login (role found from User ID) + profile photograph ----------------
class UnifiedLoginIn(BaseModel):
    login: str
    password: str


@api.post("/auth/login")
async def unified_login(body: UnifiedLoginIn):
    """One login box for everybody. The role is found from the User ID:
    Admin / Staff / Judge by their Login ID, Advocate / Litigant by mobile
    number or email address."""
    data = load_store()
    login = (body.login or "").strip()
    if not login or not body.password:
        raise HTTPException(400, "Please enter your User ID and password")
    court_user = next((u for u in data["users"] if u.get("role") in ("admin", "staff", "judge") and (u.get("login_id") or "") == login), None)
    if court_user:
        role = court_user["role"]
        try:
            if role == "admin":
                return await admin_login(AdminLogin(password=body.password))
            if role == "staff":
                return await staff_login(StaffLogin(login_id=login, password=body.password))
            return await judge_login(JudgeLogin(login_id=login, password=body.password))
        except HTTPException as e:
            if e.status_code == 401:
                raise HTTPException(401, "Invalid User ID or password")
            raise
    pub = _find_public_user(data, login)
    if pub:
        return await public_login(PublicLoginIn(login=login, password=body.password, role=pub["role"]))
    raise HTTPException(401, "Invalid User ID or password")


PROFILE_PHOTO_DIR = ROOT_DIR / "profile_photos"
PROFILE_PHOTO_MAX = 5 * 1024 * 1024


def _photo_path(user_id: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", user_id or "")
    return PROFILE_PHOTO_DIR / f"{safe}.jpg"


@api.get("/profile")
async def profile_get(user: dict = Depends(get_current_user)):
    data = load_store()
    me = _msg_user(data, user["id"]) or user
    ident = _msg_identity(me, data) if me.get("role") in MSG_ROLES else {"name": "Administrator", "lines": ["Administrator"]}
    return {"id": me["id"], "role": me.get("role"), "login_id": me.get("login_id", ""), "name": me.get("name", ""),
            "designation": me.get("designation", ""), "mobile": me.get("mobile", ""), "email": me.get("email", ""),
            "identity": ident, "has_photo": _photo_path(me["id"]).exists(), "photo_version": me.get("photo_version", 0)}


@api.post("/profile/photo")
async def profile_photo_upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    if not content:
        raise HTTPException(400, "Please choose a photograph")
    if len(content) > PROFILE_PHOTO_MAX:
        raise HTTPException(400, "The photograph must be smaller than 5 MB")
    try:
        from PIL import Image, ImageOps
        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img).convert("RGB")
        w, h = img.size
        side = min(w, h)
        img = img.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side)).resize((400, 400))
        out = io.BytesIO()
        img.save(out, "JPEG", quality=88)
        content = out.getvalue()
    except ImportError:
        pass
    except Exception:
        raise HTTPException(400, "This file is not a photograph (use JPG or PNG)")
    PROFILE_PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    _photo_path(user["id"]).write_bytes(content)
    data = load_store()
    me = _msg_user(data, user["id"])
    if me is not None:
        me["photo_version"] = int(me.get("photo_version") or 0) + 1
        save_store(data)
    return {"ok": True, "photo_version": (me or {}).get("photo_version", 1)}


@api.delete("/profile/photo")
async def profile_photo_delete(user: dict = Depends(get_current_user)):
    p = _photo_path(user["id"])
    if p.exists():
        p.unlink()
    data = load_store()
    me = _msg_user(data, user["id"])
    if me is not None:
        me["photo_version"] = int(me.get("photo_version") or 0) + 1
        save_store(data)
    return {"ok": True}


@api.get("/profile/photo")
async def profile_photo_get(user: dict = Depends(get_current_user)):
    p = _photo_path(user["id"])
    if not p.exists():
        raise HTTPException(404, "No photograph")
    return FileResponse(str(p), media_type="image/jpeg", headers={"Cache-Control": "no-store"})


class ProfileUpdateIn(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    current_password: str = ""


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


@api.put("/profile")
async def profile_update(body: ProfileUpdateIn, user: dict = Depends(get_current_user)):
    """Every user can correct his own name, mobile number and email address."""
    data = load_store()
    me = _msg_user(data, user["id"])
    if not me:
        raise HTTPException(404, "User not found")
    relogin = False
    name = (body.name if body.name is not None else me.get("name", "")).strip()
    mobile = _norm_mobile(body.mobile) if body.mobile is not None else (me.get("mobile") or "")
    email = (body.email if body.email is not None else me.get("email", "")).strip()
    if mobile and not _MOBILE_RE.match(mobile):
        raise HTTPException(400, "Please enter a valid 10-digit mobile number")
    if email and not _EMAIL_RE.match(email):
        raise HTTPException(400, "Please enter a valid email address")
    role = me.get("role")
    if role in PUBLIC_ROLES:
        if not name:
            raise HTTPException(400, "Name is required")
        if role == "advocate" and (not mobile or not email):
            raise HTTPException(400, "Mobile number and email address are both required for an advocate")
        if role == "litigant" and not mobile and not email:
            raise HTTPException(400, "Please keep at least a mobile number or an email address (it is your User ID)")
        for u in data.get("users", []):
            if u["id"] == me["id"] or u.get("role") not in PUBLIC_ROLES or u.get("status") == "rejected":
                continue
            if mobile and u.get("mobile") == mobile:
                raise HTTPException(400, "This mobile number is already registered by another user")
            if email and (u.get("email") or "").lower() == email.lower():
                raise HTTPException(400, "This email address is already registered by another user")
        # Mobile number / email address are the sign-in User ID: changing them
        # needs the current password.
        if (mobile != (me.get("mobile") or "") or email.lower() != (me.get("email") or "").lower()) and \
                not verify_pw(body.current_password or "", me.get("password_hash", "")):
            raise HTTPException(400, "Please enter your current password to change the mobile number or email address (your User ID)")
        if (me.get("login_id") or "") != (email or mobile):
            me["session_version"] = int(me.get("session_version") or 0) + 1
            relogin = True
        me["login_id"] = email or mobile
    me["name"] = name
    me["mobile"] = mobile
    me["email"] = email
    me["updated_at"] = now_iso()
    save_store(data)
    return {"ok": True, "name": name, "mobile": mobile, "email": email, "login_id": me.get("login_id", ""), "relogin": relogin}


@api.post("/profile/password")
async def profile_password(body: PasswordChangeIn, user: dict = Depends(get_current_user)):
    data = load_store()
    me = _msg_user(data, user["id"])
    if not me:
        raise HTTPException(404, "User not found")
    if not verify_pw(body.current_password or "", me.get("password_hash", "")):
        raise HTTPException(400, "The current password is not correct")
    if len(body.new_password or "") < 6:
        raise HTTPException(400, "The new password must be at least 6 characters")
    if body.current_password == body.new_password:
        raise HTTPException(400, "The new password must be different from the current password")
    me["password_hash"] = hash_pw(body.new_password)
    me["must_change"] = False
    if me.get("role") == "admin":
        me["password_changed"] = True
    me["password_changed_at"] = now_iso()
    me["session_version"] = int(me.get("session_version") or 0) + 1
    save_store(data)
    return {"ok": True, "relogin": True}


def seed_test_photos():
    """Sample photographs (illustrations, not real people) for the test accounts."""
    try:
        src = ROOT_DIR / "test_photos"
        if not src.exists():
            return
        PROFILE_PHOTO_DIR.mkdir(parents=True, exist_ok=True)
        for f in src.glob("*.jpg"):
            dest = _photo_path(f.stem)
            if not dest.exists():
                dest.write_bytes(f.read_bytes())
    except Exception:
        pass


def seed_public_test_users(data: dict) -> bool:
    """A few ready-to-use test accounts (stable ids; created once)."""
    court = next((c for c in data.get("courts", []) if c.get("is_default")), (data.get("courts") or [None])[0])
    samples = [
        {"id": "test-advocate-1", "role": "advocate", "name": "Test Advocate One", "enrollment_no": "G/1001/2010",
         "mobile": "9000000001", "email": "advocate1@test.in", "password": "Adv@1234", "status": "approved"},
        {"id": "test-advocate-2", "role": "advocate", "name": "Test Advocate Two", "enrollment_no": "G/1002/2012",
         "mobile": "9000000002", "email": "advocate2@test.in", "password": "Adv@1234", "status": "approved"},
        {"id": "test-advocate-3", "role": "advocate", "name": "Test Advocate Pending", "enrollment_no": "G/1003/2015",
         "mobile": "9000000003", "email": "advocate3@test.in", "password": "Adv@1234", "status": "pending"},
        {"id": "test-litigant-1", "role": "litigant", "name": "Test Litigant One",
         "mobile": "9000000011", "email": "litigant1@test.in", "password": "Lit@1234", "status": "approved"},
        {"id": "test-litigant-2", "role": "litigant", "name": "Test Litigant Pending",
         "mobile": "9000000012", "email": "litigant2@test.in", "password": "Lit@1234", "status": "pending"},
    ]
    changed = False
    for sample in samples:
        if any(u.get("id") == sample["id"] for u in data["users"]):
            continue
        entry = {k: v for k, v in sample.items() if k != "password"}
        entry.update({"login_id": sample["email"], "password_hash": hash_pw(sample["password"]), "created_at": now_iso(), "is_test_account": True})
        if sample["role"] == "litigant":
            entry["court_id"] = (court or {}).get("id", "")
        data["users"].append(entry)
        changed = True
    return changed


async def _creator_id(request) -> str:
    """Id of the signed-in Advocate / Litigant (for "My Entries"), else ""."""
    try:
        u = await get_optional_user(request) if request else None
    except Exception:
        u = None
    return u["id"] if u and u.get("role") in ("advocate", "litigant") else ""


@api.post("/pleas")
async def create_plea(body: PleaIn, request: Request = None):
    data = load_store()
    if not body.court_id:
        raise HTTPException(400, "court_id is required")
    if not any(c["id"] == body.court_id for c in data["courts"]):
        raise HTTPException(400, "Selected court does not exist")
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    doc["created_by"] = await _creator_id(request)
    data["pleas"].append(doc)
    save_store(data)
    return doc


@api.get("/pleas")
async def list_pleas(court_id: Optional[str] = None, request: Request = None):
    data = load_store()
    user = await get_optional_user(request) if request else None
    if user and user.get("role") == "staff":
        court_id = user.get("court_id") or "__none__"
    pleas = data["pleas"]
    if court_id:
        pleas = [p for p in pleas if p.get("court_id") == court_id]
    return sorted(pleas, key=lambda p: p.get("created_at", ""), reverse=True)


@api.get("/pleas/{plea_id}")
async def get_plea(plea_id: str):
    plea = next((p for p in load_store()["pleas"] if p["id"] == plea_id), None)
    if not plea:
        raise HTTPException(404, "Not found")
    return plea


def _split_party_name(party_name: str) -> tuple:
    for sep in (" Vs ", " vs ", " VS ", " V/S ", " v/s "):
        if sep in party_name:
            a, b = party_name.split(sep, 1)
            return a.strip(), b.strip()
    return party_name.strip(), ""


def _find_col(header: List[str], candidates: List[str]) -> Optional[int]:
    norm = [h.strip().lower() for h in header]
    for cand in candidates:
        if cand in norm:
            return norm.index(cand)
    return None


def parse_case_rows(filename: str, content: bytes) -> List[Dict[str, str]]:
    rows: List[List[str]] = []
    lower = filename.lower()
    if lower.endswith(".csv"):
        text = content.decode("utf-8-sig", errors="replace")
        for r in csv.reader(text.splitlines()):
            rows.append(r)
    elif lower.endswith(".xlsx") or lower.endswith(".xls"):
        try:
            from python_calamine import CalamineWorkbook
        except ImportError:
            raise HTTPException(500, "Server is missing the python-calamine package required to read Excel files.")
        try:
            wb = CalamineWorkbook.from_filelike(io.BytesIO(content))
            sheet = wb.get_sheet_by_index(0)
            rows = [[("" if c is None else str(c)) for c in r] for r in sheet.to_python()]
        except Exception as e:
            raise HTTPException(400, f"Could not read this Excel file ({e}). Try saving/exporting it as .csv instead.")
    else:
        raise HTTPException(400, "Please upload a .csv or .xlsx file.")

    header_idx = None
    case_col = party_col = next_date_col = None
    for i, r in enumerate(rows[:15]):
        norm = [str(c).strip().lower() for c in r]
        c_idx = _find_col(norm, ["cases", "case number", "case no.", "case no"])
        p_idx = _find_col(norm, ["party name", "party"])
        if c_idx is not None and p_idx is not None:
            header_idx, case_col, party_col = i, c_idx, p_idx
            next_date_col = _find_col(norm, ["next date"])
            break
    if header_idx is None:
        raise HTTPException(
            400,
            "Could not find a header row with 'Cases'/'Case Number' and 'Party Name' columns. "
            "Please use the same column layout as the court's pending-cases sheet.",
        )

    out = []
    for r in rows[header_idx + 1:]:
        if case_col >= len(r) or party_col >= len(r):
            continue
        case_number = str(r[case_col]).strip()
        party_name = str(r[party_col]).strip()
        if not case_number or not party_name:
            continue
        complainant, accused = _split_party_name(party_name)
        entry = {"case_number": case_number, "complainant_name": complainant, "accused_name": accused}
        if next_date_col is not None and next_date_col < len(r):
            entry["next_date"] = str(r[next_date_col]).strip()
        out.append(entry)
    return out


@api.post("/local-cases/bulk-upload")
async def bulk_upload_cases(file: UploadFile = File(...), court_id: Optional[str] = None,
                             user: dict = Depends(get_current_user)):
    if user["role"] not in ("admin", "staff"):
        raise HTTPException(403, "Only Staff or Admin can bulk-upload cases")
    data = load_store()
    if user["role"] == "staff":
        court_id = user.get("court_id")
    if not court_id:
        raise HTTPException(400, "court_id is required")
    if not any(c["id"] == court_id for c in data["courts"]):
        raise HTTPException(400, "Selected court does not exist")

    content = await file.read()
    rows = parse_case_rows(file.filename or "upload.csv", content)
    if not rows:
        raise HTTPException(400, "No usable rows found in the file.")

    added, updated = 0, 0
    for row in rows:
        existing = next((c for c in data["case_log"] if case_matches(c, court_id, row["case_number"])), None)
        upsert_case_log(data, {**row, "court_id": court_id})
        if existing:
            updated += 1
        else:
            added += 1
    save_store(data)
    return {"ok": True, "added": added, "updated": updated, "total_rows": len(rows)}


@api.get("/local-cases")
async def list_local_cases(court_id: Optional[str] = None, request: Request = None):
    data = load_store()
    user = await get_optional_user(request) if request else None
    judge_court_ids = None
    if user and user.get("role") == "staff":
        court_id = user.get("court_id") or "__none__"
    if user and user.get("role") == "judge":
        judge_court_ids = set(user.get("court_ids") or [])
        if not court_id:
            court_id = None
    cases = list(data["case_log"])
    for p in data["pleas"]:
        acc = p.get("accused", {})
        if acc.get("case_no"):
            cases.append({
                "id": p.get("id"),
                "court_id": p.get("court_id"),
                "case_number": acc.get("case_no", ""),
                "complainant_name": p.get("complainant_name", ""),
                "accused_name": acc.get("name", ""),
                "source": "plea",
            })
    if court_id:
        cases = [c for c in cases if c.get("court_id") == court_id]
    elif judge_court_ids is not None:
        cases = [c for c in cases if c.get("court_id") in judge_court_ids]
    deduped = {}
    for c in cases:
        key = (c.get("court_id"), c.get("case_number", "").strip().lower())
        if key[1] and key not in deduped:
            deduped[key] = c
    return sorted(deduped.values(), key=lambda c: c.get("case_number", ""))


@api.post("/generated-documents")
async def create_generated_document(body: GeneratedDocumentIn, request: Request = None):
    data = load_store()
    array_name = DOC_ARRAYS.get(body.document_kind)
    if not array_name:
        raise HTTPException(400, "Invalid document_kind")
    if not any(c["id"] == body.court_id for c in data["courts"]):
        raise HTTPException(404, "Court not found")
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    doc["created_by"] = await _creator_id(request)
    data[array_name].append(doc)
    upsert_case_log(data, doc)
    save_store(data)
    return doc


@api.get("/my/entries")
async def my_entries(user: dict = Depends(get_current_user)):
    """Everything the signed-in Advocate / Litigant has prepared."""
    if user.get("role") not in ("advocate", "litigant"):
        raise HTTPException(403, "Available to registered Advocates and Litigants")
    data = load_store()
    uid = user["id"]
    courts = {c["id"]: ((c.get("english") or {}).get("court_name", "")) for c in data.get("courts", [])}
    pleas = {p["id"]: p for p in data.get("pleas", [])}
    out = []
    for p in data.get("pleas", []):
        if p.get("created_by") == uid:
            acc = p.get("accused") or {}
            out.append({"kind": "plea", "id": p["id"], "plea_id": p["id"], "case_number": acc.get("case_no", ""),
                        "party": acc.get("name", ""), "language": p.get("language", ""), "plea_type": p.get("plea_type", ""),
                        "court_id": p.get("court_id", ""), "court_name": courts.get(p.get("court_id"), ""), "created_at": p.get("created_at", "")})
    for arr, kind in (("primary_fs", "primary_fs"), ("final_fs_entries", "final_fs")):
        for e in data.get(arr, []):
            if e.get("created_by") != uid:
                continue
            p = pleas.get(e.get("plea_id")) or {}
            acc = p.get("accused") or {}
            out.append({"kind": kind, "id": e["id"], "plea_id": e.get("plea_id"), "case_number": acc.get("case_no", ""),
                        "party": acc.get("name", ""), "language": p.get("language", ""), "court_id": p.get("court_id", ""),
                        "court_name": courts.get(p.get("court_id"), ""), "created_at": e.get("created_at", "")})
    for kind, arr in DOC_ARRAYS.items():
        for d in data.get(arr, []):
            if d.get("created_by") != uid:
                continue
            out.append({"kind": kind, "id": d["id"], "case_number": d.get("case_number", ""),
                        "party": d.get("applicant_name") or d.get("accused_name", ""), "document_type": d.get("document_type", ""),
                        "language": d.get("language", ""), "court_id": d.get("court_id", ""), "court_name": courts.get(d.get("court_id"), ""),
                        "created_at": d.get("created_at", ""), "fields": d.get("fields") or {}, "html": d.get("html", "")})
    out.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return out


@api.post("/bulk-pdf-zip")
async def create_bulk_pdf_zip(body: BulkPdfZipIn):
    if not body.documents:
        raise HTTPException(400, "No documents supplied")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        used_names = set()
        for index, document in enumerate(body.documents, start=1):
            name = safe_pdf_name(document.filename, index)
            if name in used_names:
                stem, ext = os.path.splitext(name)
                name = f"{stem}_{index}{ext or '.pdf'}"
            used_names.add(name)
            archive.writestr(name, build_browser_pdf(document.title, document.html))
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="bulk-generated-documents.zip"'},
    )


@api.post("/pdf")
async def create_pdf(body: PdfDocumentIn):
    filename = safe_pdf_name(body.filename, 1)
    return StreamingResponse(
        io.BytesIO(build_browser_pdf(body.title, body.html)),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api.get("/limitation-calendar")
async def get_limitation_calendar():
    return load_store().get("limitation_calendar", {})


@api.put("/limitation-calendar")
async def update_limitation_calendar(body: LimitationCalendarIn):
    data = load_store()
    data["limitation_calendar"] = body.overrides or {}
    save_store(data)
    return data["limitation_calendar"]


@api.get("/generated-documents")
async def list_generated_documents(court_id: Optional[str] = None, request: Request = None):
    data = load_store()
    user = await get_optional_user(request) if request else None
    if user and user.get("role") == "staff":
        court_id = user.get("court_id") or "__none__"
    docs = []
    for kind, array_name in DOC_ARRAYS.items():
        for doc in data[array_name]:
            item = dict(doc)
            item["document_kind"] = kind
            docs.append(item)
    if court_id:
        docs = [d for d in docs if d.get("court_id") == court_id]
    return sorted(docs, key=lambda d: d.get("created_at", ""), reverse=True)


@api.put("/pleas/{plea_id}")
async def update_plea(plea_id: str, body: PleaIn):
    data = load_store()
    plea = next((p for p in data["pleas"] if p["id"] == plea_id), None)
    if not plea:
        raise HTTPException(404, "Not found")
    plea.update(body.model_dump())
    save_store(data)
    return {"ok": True}


@api.delete("/pleas/{plea_id}")
async def delete_plea(plea_id: str, _: dict = Depends(require_role("staff"))):
    data = load_store()
    before = len(data["pleas"])
    data["pleas"] = [p for p in data["pleas"] if p["id"] != plea_id]
    if len(data["pleas"]) == before:
        raise HTTPException(404, "Not found")
    data["primary_fs"] = [p for p in data["primary_fs"] if p["plea_id"] != plea_id]
    data["final_fs_entries"] = [p for p in data["final_fs_entries"] if p["plea_id"] != plea_id]
    data["final_fs_questions"] = [p for p in data["final_fs_questions"] if p["plea_id"] != plea_id]
    save_store(data)
    return {"ok": True}


@api.post("/primary-fs")
async def create_primary(body: PrimaryFSIn, request: Request = None):
    data = load_store()
    if not any(p["id"] == body.plea_id for p in data["pleas"]):
        raise HTTPException(404, "Plea not found")
    data["primary_fs"] = [p for p in data["primary_fs"] if p["plea_id"] != body.plea_id]
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    doc["created_by"] = await _creator_id(request)
    data["primary_fs"].append(doc)
    save_store(data)
    return doc


@api.get("/primary-fs/by-plea/{plea_id}")
async def get_primary_by_plea(plea_id: str):
    return next((p for p in load_store()["primary_fs"] if p["plea_id"] == plea_id), {})


@api.get("/final-fs/questions/by-plea/{plea_id}")
async def get_final_questions_by_plea(plea_id: str):
    return next((p for p in load_store()["final_fs_questions"] if p["plea_id"] == plea_id), {"questions": []})


@api.get("/final-fs/cases-with-questions")
async def cases_with_questions(court_id: Optional[str] = None, request: Request = None):
    data = load_store()
    user = await get_optional_user(request) if request else None
    if user and user.get("role") == "staff":
        court_id = user.get("court_id") or "__none__"
    plea_ids = {p["id"] for p in data["pleas"] if not court_id or p.get("court_id") == court_id}
    if not plea_ids:
        return []
    now = datetime.now(timezone.utc)
    available = []
    for q in data["final_fs_questions"]:
        if not q.get("plea_id"):
            continue
        if q["plea_id"] not in plea_ids:
            continue
        available_at = q.get("available_at")
        if available_at:
            try:
                scheduled = datetime.fromisoformat(available_at.replace("Z", "+00:00"))
                if scheduled.tzinfo is None:
                    scheduled = scheduled.replace(tzinfo=timezone.utc)
                if scheduled > now:
                    continue
            except Exception:
                continue
        available.append(q["plea_id"])
    return available


@api.post("/final-fs/questions")
async def save_final_questions(body: FinalFSQuestionsIn, _: dict = Depends(require_role("staff"))):
    data = load_store()
    if not any(p["id"] == body.plea_id for p in data["pleas"]):
        raise HTTPException(404, "Plea not found")
    data["final_fs_questions"] = [q for q in data["final_fs_questions"] if q["plea_id"] != body.plea_id]
    data["final_fs_entries"] = [entry for entry in data["final_fs_entries"] if entry["plea_id"] != body.plea_id]
    doc = {
        "id": new_id(),
        "plea_id": body.plea_id,
        "questions": body.questions,
        "available_at": body.available_at,
        "created_at": now_iso(),
    }
    data["final_fs_questions"].append(doc)
    save_store(data)
    return doc


@api.delete("/final-fs/questions/by-plea/{plea_id}")
async def delete_final_questions(plea_id: str, _: dict = Depends(require_role("staff"))):
    data = load_store()
    before = len(data["final_fs_questions"])
    data["final_fs_questions"] = [q for q in data["final_fs_questions"] if q["plea_id"] != plea_id]
    data["final_fs_entries"] = [entry for entry in data["final_fs_entries"] if entry["plea_id"] != plea_id]
    if len(data["final_fs_questions"]) == before:
        raise HTTPException(404, "Final FS entry not found")
    save_store(data)
    return {"ok": True}


@api.post("/final-fs/entries")
async def create_final_entry(body: FinalFSEntryIn, request: Request = None):
    data = load_store()
    if not any(p["id"] == body.plea_id for p in data["pleas"]):
        raise HTTPException(404, "Plea not found")
    data["final_fs_entries"] = [p for p in data["final_fs_entries"] if p["plea_id"] != body.plea_id]
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    doc["created_by"] = await _creator_id(request)
    data["final_fs_entries"].append(doc)
    save_store(data)
    return doc


@api.get("/final-fs/entries/by-plea/{plea_id}")
async def get_final_entry(plea_id: str):
    return next((p for p in load_store()["final_fs_entries"] if p["plea_id"] == plea_id), {})


# ------------------------- Deposition (Oral Evidence) -----------------------

def _asr_service_status() -> Dict[str, Any]:
    provider = os.environ.get("ASR_PROVIDER", "disabled").strip().lower()
    service_url = os.environ.get("ASR_SERVICE_URL", "").strip()
    languages = [x.strip() for x in os.environ.get("ASR_LANGUAGES", "gu,hi").split(",") if x.strip()]
    if not service_url or provider in ("", "disabled", "none", "browser"):
        return {"enabled": False, "ready": False, "languages": [], "message": "AI voice typing is not configured"}
    health_url = os.environ.get("ASR_HEALTH_URL", "").strip() or service_url.rsplit("/", 1)[0] + "/health"
    try:
        with urllib.request.urlopen(health_url, timeout=2) as response:
            info = json.loads(response.read().decode("utf-8") or "{}")
        ready = bool(info.get("loaded", True))
        message = "ready" if ready else (info.get("message") or "AI speech model is still loading")
        return {"enabled": True, "ready": ready, "languages": languages if ready else [], "message": message}
    except Exception:
        return {"enabled": True, "ready": False, "languages": [], "message": "AI voice service is not running"}


@api.get("/asr/status")
async def asr_status(user: dict = Depends(require_role("judge"))):
    return await asyncio.to_thread(_asr_service_status)


@api.post("/asr/transcribe")
async def asr_transcribe(
    audio: UploadFile = File(...),
    language: str = Form("gu"),
    user: dict = Depends(require_role("judge")),
):
    lang = (language or "gu").strip().lower()
    if lang not in ("gu", "hi", "en"):
        raise HTTPException(400, "Unsupported voice language")
    audio_bytes = await audio.read()
    max_bytes = ASR_MAX_AUDIO_MB * 1024 * 1024
    if not audio_bytes:
        raise HTTPException(400, "No audio received")
    if len(audio_bytes) > max_bytes:
        raise HTTPException(413, f"Audio chunk exceeds {ASR_MAX_AUDIO_MB} MB")
    result = await asyncio.to_thread(
        _call_configured_asr_service,
        audio_bytes,
        audio.filename or "speech.webm",
        audio.content_type or "application/octet-stream",
        lang,
    )
    return {"ok": True, **result}


# ------------------------- AI Legal Proofread (Google Gemini) ----------------
# Only GEMINI_* and ASR_* keys are read from backend/.env so that no other
# existing setting (passwords, secrets) changes behaviour because of this.
def _load_gemini_env_from_file():
    env_path = ROOT_DIR / ".env"
    try:
        lines = env_path.read_text(encoding="utf-8-sig").splitlines()
    except Exception:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key.startswith(("GEMINI_", "ASR_")) or os.environ.get(key):
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


_load_gemini_env_from_file()

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_FALLBACK_MODEL = "gemini-flash-latest"
# Tried in order when a model is busy (503), rate-limited (429) or missing (404).
GEMINI_BACKUP_MODELS = ["gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-flash-lite-latest"]
PROOFREAD_MAX_SEGMENTS = 400
PROOFREAD_CHUNK_CHARS = 12000

GEMINI_PROOFREAD_INSTRUCTION = (
    "You are a careful legal proofreader for an Indian criminal court (ACJM court, Gujarat). "
    "You receive a JSON array of sentences taken from a witness deposition (oral evidence) typed by the court. "
    "The text may be in English, Gujarati or Hindi, or a mix. For EACH item, return a corrected version that fixes only: "
    "spelling mistakes, typing errors, grammar, capitalization, punctuation and spacing, and clearly wrong legal terms "
    "(use standard Indian court usage, e.g. 'cross-examination', 'examination-in-chief', 'Hon'ble', 'the accused', 'F.I.R.', 'panchnama'). "
    "STRICT RULES: never translate; keep the same language and script as the input; never add, remove or change facts, "
    "names, places, dates, times, amounts, section numbers or case numbers; never summarise or rephrase the witness's statement "
    "beyond what grammar requires; keep the first-person voice of the witness; if nothing needs correction return the text unchanged. "
    "Return one output item for every input item, with the same id."
)


def _gemini_generate(model: str, api_key: str, payload: Dict[str, Any], timeout: float) -> Dict[str, Any]:
    url = f"{GEMINI_API_BASE}/{model}:generateContent"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _call_gemini_proofread(items: List[Dict[str, str]]) -> List[Dict[str, str]]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            503,
            "AI proofread is not configured. Add GEMINI_API_KEY=<your key from Google AI Studio> to backend/.env and restart the app.",
        )
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    timeout = float(os.environ.get("GEMINI_TIMEOUT_SECONDS", "90"))
    payload = {
        "systemInstruction": {"parts": [{"text": GEMINI_PROOFREAD_INSTRUCTION}]},
        "contents": [{"role": "user", "parts": [{"text": json.dumps(items, ensure_ascii=False)}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {"id": {"type": "STRING"}, "suggested": {"type": "STRING"}},
                    "required": ["id", "suggested"],
                },
            },
        },
    }
    models_to_try = [model] + [m for m in GEMINI_BACKUP_MODELS if m != model]
    data = None
    last_error = ""
    busy_or_limited = False
    for candidate in models_to_try:
        for attempt in range(2):
            try:
                data = _gemini_generate(candidate, api_key, payload, timeout)
                break
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", "replace")[:400]
                if exc.code == 404:
                    last_error = f"Model '{candidate}' not found"
                    break
                if exc.code in (429, 500, 503, 504):
                    # Busy / rate-limited: wait briefly, retry once, then try the next model.
                    busy_or_limited = True
                    last_error = f"'{candidate}' busy ({exc.code})"
                    if attempt == 0:
                        time.sleep(2)
                        continue
                    break
                if exc.code in (400, 401, 403):
                    raise HTTPException(502, f"Gemini rejected the request (check GEMINI_API_KEY): {detail}") from exc
                raise HTTPException(502, f"Gemini error {exc.code}: {detail}") from exc
            except urllib.error.URLError as exc:
                raise HTTPException(503, f"Gemini is unreachable (check internet connection): {exc.reason}") from exc
        if data is not None:
            break
    if data is None:
        if busy_or_limited:
            raise HTTPException(503, "Google's Gemini servers are busy or the free-tier limit was reached. Please try again in a minute")
        raise HTTPException(502, f"{last_error}. Set GEMINI_MODEL in backend/.env to a current Gemini model name.")

    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(part.get("text", "") for part in parts if not part.get("thought"))
        parsed = json.loads(text)
    except Exception as exc:
        raise HTTPException(502, "Gemini returned an unreadable response. Please try again.") from exc
    results = []
    for entry in parsed if isinstance(parsed, list) else []:
        if isinstance(entry, dict) and "id" in entry and isinstance(entry.get("suggested"), str):
            results.append({"id": str(entry["id"]), "suggested": entry["suggested"]})
    return results


class ProofreadSegmentIn(BaseModel):
    id: str
    text: str


class AiProofreadIn(BaseModel):
    segments: List[ProofreadSegmentIn]


def _run_ai_proofread(segments: List[Dict[str, str]]) -> List[Dict[str, str]]:
    results: List[Dict[str, str]] = []
    chunk: List[Dict[str, str]] = []
    size = 0
    for seg in segments:
        if chunk and size + len(seg["text"]) > PROOFREAD_CHUNK_CHARS:
            results.extend(_call_gemini_proofread(chunk))
            chunk, size = [], 0
        chunk.append(seg)
        size += len(seg["text"])
    if chunk:
        results.extend(_call_gemini_proofread(chunk))
    return results


@api.post("/proofread/ai")
async def proofread_ai(body: AiProofreadIn, user: dict = Depends(require_role("judge"))):
    segments = [
        {"id": seg.id, "text": seg.text}
        for seg in body.segments[:PROOFREAD_MAX_SEGMENTS]
        if seg.text and seg.text.strip()
    ]
    if not segments:
        return {"ok": True, "provider": "gemini", "results": []}
    results = await asyncio.to_thread(_run_ai_proofread, segments)
    return {"ok": True, "provider": "gemini", "results": results}


def _fmt_dt(dt: datetime) -> str:
    return dt.strftime("%H:%M:%S, %d/%m/%Y")


@api.get("/depositions/existing-witnesses")
async def deposition_existing_witnesses(case_number: str, court_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    out = []
    for d in data.get("depositions", []):
        if d.get("court_id") != court_id or d.get("status") != "adjourned":
            continue
        if is_s183(d) or is_order(d):
            continue
        if case_number.strip().lower() not in [c.strip().lower() for c in d.get("case_ids", [])]:
            continue
        out.append({
            "id": d["id"],
            "witness_name": d.get("witness_name", ""),
            "father_husband_name": d.get("father_husband_name", ""),
            "religion": d.get("religion", ""),
            "age": d.get("age", ""),
            "occupation": d.get("occupation", ""),
            "address": d.get("address", ""),
            "contact_no": d.get("contact_no", ""),
            "exhibit_number": d.get("exhibit_number", ""),
            "sr_no": d.get("sr_no", ""),
            "language": d.get("language", "gu"),
            "stage": d.get("stage", "chief"),
            "producing_party": d.get("producing_party", ""),
            "defending_party": d.get("defending_party", ""),
            "advocate_producing": d.get("advocate_producing", ""),
            "advocate_defending": d.get("advocate_defending", ""),
            "advocate_producing_id": d.get("advocate_producing_id", ""),
            "advocate_defending_id": d.get("advocate_defending_id", ""),
            "av_conferencing": bool(d.get("av_conferencing", False)),
            "vulnerable_witness": bool(d.get("vulnerable_witness", False)),
            "case_specific_details": d.get("case_specific_details", {}),
            "adjourn_for": d.get("adjourn_for", ""),
            "adjourn_next_date": d.get("adjourn_next_date", ""),
        })
    return out


@api.get("/depositions/s183-incomplete")
async def s183_incomplete(court_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    keys = ["witness_name", "father_husband_name", "religion", "age", "occupation", "address", "contact_no",
            "sr_no", "language", "police_station", "fir_number", "offence_sections"]
    out = []
    for d in data.get("depositions", []):
        if not is_s183(d) or d.get("court_id") != court_id or d.get("status") != "adjourned":
            continue
        item = {"id": d["id"], "av_conferencing": bool(d.get("av_conferencing")), "vulnerable_witness": bool(d.get("vulnerable_witness")),
                "adjourn_next_date": d.get("adjourn_next_date", "")}
        item.update({k: d.get(k, "") for k in keys})
        out.append(item)
    out.sort(key=lambda d: d.get("adjourn_next_date", ""))
    return out


# ---------------- Oral Evidence: View Entries ----------------
DEP_ENTRY_STATUS = {"completed": "Completed", "adjourned": "Adjourned", "superseded": "Adjourned (continued later)", "in_progress": "In progress"}


@api.get("/depositions/entries")
async def deposition_entries(user: dict = Depends(require_role("judge"))):
    data = load_store()
    court_ids = set(user.get("court_ids") or [])
    out = []
    for d in data.get("depositions", []):
        if court_ids and d.get("court_id") not in court_ids:
            continue
        if d.get("draft_status") == "DISMISSED" or is_order(d):
            continue
        s183 = is_s183(d)
        out.append({
            "id": d["id"],
            "record_type": "s183" if s183 else "deposition",
            "case_number": d.get("primary_case_number", ""),
            "case_ids": d.get("case_ids", []),
            "witness_name": d.get("witness_name", ""),
            "language": d.get("language", "gu"),
            "status": d.get("status", ""),
            "status_label": DEP_ENTRY_STATUS.get(d.get("status", ""), d.get("status", "")),
            "recorded_at": d.get("start_time_iso") or d.get("created_at", ""),
            "exhibit_number": d.get("exhibit_number", ""),
            "sr_no": d.get("sr_no", ""),
            "police_station": d.get("police_station", ""),
            "fir_number": d.get("fir_number", ""),
            "continued": d.get("mode") == "existing",
        })
    out.sort(key=lambda x: x.get("recorded_at", ""), reverse=True)
    return out


class DepositionZipIn(BaseModel):
    ids: List[str]


@api.post("/depositions/print-zip")
async def deposition_print_zip(body: DepositionZipIn, user: dict = Depends(require_role("judge"))):
    data = load_store()
    court_ids = set(user.get("court_ids") or [])
    deps = [d for d in data.get("depositions", []) if d["id"] in set(body.ids) and (not court_ids or d.get("court_id") in court_ids)]
    if not deps:
        raise HTTPException(404, "No matching depositions")
    buffer = io.BytesIO()
    used = set()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, dep in enumerate(deps, start=1):
            kind = "183_Statement" if is_s183(dep) else ("Order" if is_order(dep) else "Deposition")
            date_part = (dep.get("start_time_iso") or "")[:10]
            raw_name = (f"{kind}_{date_part}_{dep.get('primary_case_number','case')}_Ex_{dep.get('exhibit_number','')}" if is_order(dep)
                        else f"{kind}_{date_part}_{dep.get('primary_case_number','case')}_{dep.get('witness_name','witness')}")
            # keep Gujarati/Hindi letters; drop only characters Windows forbids in file names
            name = re.sub(r'[\\/:*?"<>|\s]+', "_", raw_name).strip("._")[:150] + ".pdf"
            if name in used:
                name = name[:-4] + f"_{index}.pdf"
            used.add(name)
            pdf = await asyncio.to_thread(deposition_pdf_bytes, dep, data)
            archive.writestr(name, pdf)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/zip",
                             headers={"Content-Disposition": 'attachment; filename="Oral_Evidence_Records.zip"'})


# ---------------- Orders ----------------
@api.get("/orders/entries")
async def order_entries(user: dict = Depends(require_role("judge"))):
    data = load_store()
    if purge_expired_template_orders(data):
        save_store(data)
    court_ids = set(user.get("court_ids") or [])
    out = []
    for d in data.get("depositions", []):
        if not is_order(d) or (court_ids and d.get("court_id") not in court_ids) or d.get("draft_status") == "DISMISSED":
            continue
        if d.get("template_mode") and not order_case_list(d):
            continue
        expires_at = ""
        if d.get("from_template"):
            try:
                expires_at = (datetime.fromisoformat(str(d.get("created_at")).replace("Z", "+00:00")) + timedelta(days=ORDER_TEMPLATE_KEEP_DAYS)).isoformat()
            except Exception:
                expires_at = ""
        out.append({
            "id": d["id"], "case_number": ", ".join(order_case_list(d)), "case_ids": order_case_list(d),
            "from_template": bool(d.get("from_template")), "expires_at": expires_at, "exhibit_number": d.get("exhibit_number", ""),
            "section_law": d.get("section_law", ""), "subject": d.get("subject", ""), "language": d.get("language", "en"),
            "status": d.get("status", ""), "printed": bool(d.get("printed_at")),
            "recorded_at": d.get("start_time_iso") or d.get("created_at", ""), "printed_at": d.get("printed_at", ""),
        })
    out.sort(key=lambda x: x.get("recorded_at", ""), reverse=True)
    return out


class OrderPrintIn(BaseModel):
    save_template: bool = False
    template_title: str = ""
    print_mode: str = "consolidated"  # consolidated | separate


ORDER_TEMPLATE_KEEP_DAYS = 7


def _upsert_order_template(data: dict, dep: dict, title: str, user: dict) -> dict:
    title = (title or "").strip()
    if not title:
        raise HTTPException(400, "Subject is required to save a template")
    templates = data.setdefault("order_templates", [])
    existing = next((t for t in templates if t["id"] == dep.get("saved_template_id") and t.get("judge_user_id") == user["id"]), None)
    fields = {
        "title": title, "subject": title, "language": dep.get("language", "en"),
        "section_law": dep.get("section_law", ""), "body_html": deposition_effective_body(dep),
        "court_id": dep.get("court_id", ""), "source_order_id": dep["id"], "updated_at": now_iso(),
    }
    if existing:
        existing.update(fields)
        return existing
    template = {"id": new_id(), "judge_user_id": user["id"], "created_at": now_iso(), **fields}
    templates.append(template)
    dep["saved_template_id"] = template["id"]
    return template


def purge_expired_template_orders(data: dict) -> bool:
    """Orders made from a saved template (and template drafts that were never
    placed in a case) are removed 7 days after they were created."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=ORDER_TEMPLATE_KEEP_DAYS)
    keep, removed = [], []
    for d in data.get("depositions", []):
        expired = False
        if is_order(d) and (d.get("from_template") or (d.get("template_mode") and not order_case_list(d))):
            try:
                created = datetime.fromisoformat(str(d.get("created_at") or "").replace("Z", "+00:00"))
                expired = created < cutoff
            except Exception:
                expired = False
        (removed if expired else keep).append(d)
    if not removed:
        return False
    data["depositions"] = keep
    for d in removed:
        for path in (DRAFT_DIR / str(d.get("draft_file") or ""), VERSION_DIR / f"{safe_draft_part(d.get('id', ''), 'dep')}.jsonl"):
            try:
                if path.is_file():
                    path.unlink()
            except Exception:
                pass
    return True


@api.post("/orders/{dep_id}/print")
async def order_mark_printed(dep_id: str, body: OrderPrintIn, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id and is_order(d)), None)
    if not dep:
        raise HTTPException(404, "Order not found")
    now = datetime.now(timezone.utc)
    dep["status"] = "completed"
    dep["draft_status"] = "COMPLETED"
    dep["printed_at"] = now_iso()
    dep["date_display"] = datetime.now().strftime("%d/%m/%Y")
    dep["complete_time_display"] = _fmt_dt(now)
    dep["updated_at"] = now_iso()
    dep["print_mode"] = "separate" if body.print_mode == "separate" else "consolidated"
    template = None
    if body.save_template or dep.get("template_mode"):
        template = _upsert_order_template(data, dep, body.template_title or dep.get("subject", ""), user)
    save_store(data)
    return {"ok": True, "status": dep["status"], "template": {k: template[k] for k in ("id", "title")} if template else None}


class OrderTemplateSaveIn(BaseModel):
    title: str = ""


@api.post("/orders/{dep_id}/save-template")
async def order_save_template(dep_id: str, body: OrderTemplateSaveIn, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id and is_order(d)), None)
    if not dep:
        raise HTTPException(404, "Order not found")
    template = _upsert_order_template(data, dep, body.title or dep.get("subject", ""), user)
    dep["updated_at"] = now_iso()
    save_store(data)
    return {"ok": True, "template": {"id": template["id"], "title": template["title"]}}


@api.get("/orders/{dep_id}/print-separate")
async def order_print_separate(dep_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id and is_order(d)), None)
    if not dep:
        raise HTTPException(404, "Order not found")
    cases = order_case_list(dep)
    if not cases:
        raise HTTPException(400, "No case number entered for this order")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, case_no in enumerate(cases, start=1):
            pdf = await asyncio.to_thread(order_pdf_bytes, dep, data, case_no)
            name = re.sub(r'[\\/:*?"<>|\s]+', "_", f"Order_{case_no}_Ex_{order_case_exhibit(dep, case_no)}").strip("._")[:150]
            archive.writestr(f"{index:02d}_{name}.pdf", pdf)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/zip",
                             headers={"Content-Disposition": 'attachment; filename="Separate_Orders.zip"'})


@api.get("/order-templates")
async def list_order_templates(user: dict = Depends(require_role("judge"))):
    data = load_store()
    items = [t for t in data.get("order_templates", []) if t.get("judge_user_id") == user["id"]]
    items.sort(key=lambda t: t.get("updated_at", ""), reverse=True)
    return items


@api.delete("/order-templates/{template_id}")
async def delete_order_template(template_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    before = len(data.get("order_templates", []))
    data["order_templates"] = [t for t in data.get("order_templates", []) if not (t["id"] == template_id and t.get("judge_user_id") == user["id"])]
    if len(data["order_templates"]) == before:
        raise HTTPException(404, "Template not found")
    save_store(data)
    return {"ok": True}


@api.get("/depositions/my-unfinished")
async def deposition_my_unfinished(user: dict = Depends(require_role("judge"))):
    # Crash-recovery support: any deposition this judge started but never
    # explicitly finished with Complete or Adjourn (e.g. the app/PC crashed
    # or lost power mid-recording) is surfaced here, so the Oral Evidence
    # screen can prompt to resume it — this is what actually protects the
    # deposition text itself, since it's continuously autosaved to this
    # same record every second regardless of whether Complete/Adjourn was
    # ever pressed.
    data = load_store()
    out = []
    for d in data.get("depositions", []):
        draft_status = d.get("draft_status") or ("COMPLETED" if d.get("status") in ("completed", "adjourned") else "ACTIVE")
        if draft_status != "ACTIVE":
            continue
        if d.get("status") != "in_progress" or d.get("judge_user_id") != user["id"]:
            continue
        if is_order(d):
            continue
        out.append({
            "id": d["id"],
            "deposition_id": d["id"],
            "draft_status": draft_status,
            "witness_name": d.get("witness_name", ""),
            "primary_case_number": d.get("primary_case_number", ""),
            "court_id": d.get("court_id", ""),
            "start_time_display": d.get("start_time_display", ""),
            "updated_at": d.get("updated_at", ""),
        })
    out.sort(key=lambda d: d.get("updated_at", ""), reverse=True)
    return out


# Witness-detail corrections made while resuming an Incomplete Deposition are
# recorded as a note at the start of the continuation, in the deposition's
# own language.
WITNESS_CORRECTION_FIELDS = [
    ("witness_name", {"gu": "સાક્ષીનું નામ", "hi": "साक्षी का नाम", "en": "the name of the witness"}),
    ("father_husband_name", {"gu": "સાક્ષીના પિતા / પતિનું નામ", "hi": "साक्षी के पिता / पति का नाम", "en": "the father's / husband's name of the witness"}),
    ("religion", {"gu": "સાક્ષીનો ધર્મ", "hi": "साक्षी का धर्म", "en": "the religion of the witness"}),
    ("age", {"gu": "સાક્ષીની ઉંમર", "hi": "साक्षी की आयु", "en": "the age of the witness"}),
    ("occupation", {"gu": "સાક્ષીનો વ્યવસાય", "hi": "साक्षी का व्यवसाय", "en": "the occupation of the witness"}),
    ("address", {"gu": "સાક્ષીનું સરનામું", "hi": "साक्षी का पता", "en": "the address of the witness"}),
    ("contact_no", {"gu": "સાક્ષીનો સંપર્ક નંબર", "hi": "साक्षी का संपर्क नंबर", "en": "the contact number of the witness"}),
]


def _witness_correction_note(prev: dict, doc: dict) -> str:
    lang = doc.get("language") if doc.get("language") in ("gu", "hi", "en") else "gu"
    sentences = []
    for field, labels in WITNESS_CORRECTION_FIELDS:
        old = str(prev.get(field) or "").strip()
        new = str(doc.get(field) or "").strip()
        if old == new or not new:
            continue
        label = labels[lang]
        o, n = html_escape(old), html_escape(new)
        if lang == "gu":
            sentences.append(f"{label} અગાઉની જુબાનીમાં ભૂલથી “{o}” તરીકે નોંધાયેલ છે, જેને બદલે “{n}” તરીકે વાંચવું." if old
                             else f"{label} “{n}” છે, જે અગાઉની જુબાનીમાં નોંધાયેલ ન હતું.")
        elif lang == "hi":
            sentences.append(f"{label} पूर्व बयान में त्रुटिवश “{o}” अंकित हुआ है, उसके स्थान पर “{n}” पढ़ा जाए।" if old
                             else f"{label} “{n}” है, जो पूर्व बयान में अंकित नहीं था।")
        else:
            sentences.append(f"In the earlier deposition, {label} was incorrectly recorded as “{o}”; the same be read as “{n}”." if old
                             else f"{label[0].upper() + label[1:]} is “{n}”, which was not recorded in the earlier deposition.")
    if not sentences:
        return ""
    if is_s183(doc):
        # 183 statements: say "earlier statement" instead of "earlier deposition".
        sentences = [x.replace("અગાઉની જુબાનીમાં", "અગાઉના નિવેદનમાં").replace("पूर्व बयान में", "पूर्व कथन में")
                     .replace("In the earlier deposition", "In the earlier statement").replace("the earlier deposition", "the earlier statement")
                     for x in sentences]
    head = {"gu": "નોંધ (સુધારો):", "hi": "टिप्पणी (सुधार):", "en": "Note (Correction):"}[lang]
    return f'<p class="dep-correction-note"><strong>{head}</strong> ' + " ".join(sentences) + "</p><p><br></p>"


@api.post("/depositions")
async def create_deposition(body: DepositionCreateIn, user: dict = Depends(require_role("judge"))):
    data = load_store()
    if body.court_id not in (user.get("court_ids") or []):
        raise HTTPException(403, "This Court is not assigned to you")
    if not any(c["id"] == body.court_id for c in data["courts"]):
        raise HTTPException(400, "Selected court does not exist")

    now = datetime.now(timezone.utc)
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["judge_user_id"] = user["id"]
    doc["status"] = "in_progress"
    doc["draft_status"] = "ACTIVE"
    doc["body_html"] = ""
    doc["document_json"] = {"type": "html", "html": ""}
    doc["version"] = 1
    doc["hostile_declared"] = False
    doc["cross_started"] = False
    if body.client_start_time_iso:
        try:
            start_dt = datetime.fromisoformat(body.client_start_time_iso.replace("Z", "+00:00"))
        except Exception:
            start_dt = now
    else:
        start_dt = now
    doc["start_time_iso"] = start_dt.isoformat()
    doc["start_time_display"] = _fmt_dt(start_dt)
    doc["complete_time_display"] = ""
    doc["adjourn_reason"] = ""
    doc["adjourn_next_date"] = ""
    doc["adjourn_for"] = ""
    doc["created_at"] = now_iso()
    doc["updated_at"] = now_iso()
    stamp = start_dt.strftime("%Y%m%d_%H%M%S")
    doc["deposition_code"] = f"{safe_draft_part(body.primary_case_number, 'case')}_{safe_draft_part(body.witness_name, 'witness')}_{stamp}"

    if body.mode == "existing" and body.resume_of:
        prev = next((d for d in data["depositions"] if d["id"] == body.resume_of), None)
        if not prev:
            raise HTTPException(404, "Original deposition not found")
        if not doc.get("stage"):
            doc["stage"] = "chief" if prev.get("adjourn_for") == "further_chief" else "cross"
        # A resumed incomplete deposition is a fresh continuation document.
        # Witness details come from the editable form payload, but the earlier
        # adjourned body must not be loaded into the new typing page again.
        # If any witness detail was corrected, the continuation starts with a
        # correction note in the deposition's language.
        doc["body_html"] = _witness_correction_note(prev, doc)
        doc["witness_detail_corrections"] = [
            {"field": f, "earlier": prev.get(f, ""), "corrected": doc.get(f, "")}
            for f, _ in WITNESS_CORRECTION_FIELDS
            if str(prev.get(f) or "").strip() != str(doc.get(f) or "").strip() and str(doc.get(f) or "").strip()
        ]
        doc["adjourned_for"] = prev.get("adjourn_for", "")
        doc["previous_deposition_id"] = prev.get("id", "")
        prev_body = deposition_effective_body(prev)
        doc["cross_started"] = bool(prev.get("cross_started")) or prev.get("stage") == "cross" or dep_has_block(prev_body, "start-cross")
        prev["status"] = "superseded"

    if is_order(doc):
        doc["stage"] = "chief"
        doc["cross_started"] = False
        doc["producing_party"] = ""
        doc["defending_party"] = ""
        doc["witness_name"] = (body.subject or "").strip() or f"Order below Ex. {body.exhibit_number}".strip()
        doc["body_html"] = body.initial_body_html or ""
        doc["case_ids"] = [c.strip() for c in (doc.get("case_ids") or []) if str(c).strip()]
        if not doc.get("primary_case_number") and doc["case_ids"]:
            doc["primary_case_number"] = doc["case_ids"][0]
        # Orders made from a saved template are kept for 7 days only.
        doc["from_template"] = bool(body.template_id) and not body.template_mode
        if body.template_mode and not (body.subject or "").strip():
            raise HTTPException(400, "Subject is required for a template")
    doc.pop("initial_body_html", None)

    if is_s183(doc):
        doc["stage"] = "chief"
        doc["cross_started"] = False
        doc["producing_party"] = ""
        doc["defending_party"] = ""
        doc["exhibit_number"] = ""

    if body.mode == "existing" and not body.resume_of and body.affidavit_chief:
        # Examination-in-Chief filed on affidavit: no earlier deposition exists
        # in the system; this record starts at the chosen stage (normally Cross).
        doc["stage"] = doc.get("stage") or "cross"
        doc["cross_started"] = doc["stage"] == "cross"

    doc["document_json"] = {"type": "html", "html": doc.get("body_html", "")}
    doc["draft_file"] = write_deposition_draft(doc, doc.get("body_html", ""))
    append_deposition_version(doc, doc.get("body_html", ""))

    data.setdefault("depositions", []).append(doc)
    save_store(data)
    return doc


@api.post("/depositions/{dep_id}/dismiss")
async def deposition_dismiss(dep_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id), None)
    if not dep:
        raise HTTPException(404, "Not found")
    if dep.get("judge_user_id") != user["id"]:
        raise HTTPException(403, "Forbidden")
    if dep.get("status") in ("completed", "adjourned") or dep.get("draft_status") == "COMPLETED":
        return {"ok": True, "draft_status": "COMPLETED"}
    dep["draft_status"] = "DISMISSED"
    dep["dismissed_at"] = now_iso()
    dep["updated_at"] = now_iso()
    save_store(data)
    return {"ok": True, "draft_status": "DISMISSED"}


@api.get("/depositions/{dep_id}")
async def get_deposition(dep_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id), None)
    if not dep:
        raise HTTPException(404, "Not found")
    if not dep.get("draft_file"):
        dep["draft_file"] = write_deposition_draft(dep, dep.get("body_html", ""))
        save_store(data)
    out = dict(dep)
    out["body_html"] = deposition_effective_body(dep)
    return out


def _dep_content_weight(html: str) -> int:
    raw = str(html or "")
    media = len(re.findall(r"<(?:img|table)\b", raw, flags=re.I))
    text = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", raw, flags=re.I)
    text = re.sub(r"<[^>]*>", " ", text)
    text = re.sub(r"&nbsp;|&#160;|\u00a0|\u200b", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return len(text) + media * 40


@api.put("/depositions/{dep_id}")
async def update_deposition(dep_id: str, body: DepositionUpdateIn, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id), None)
    if not dep:
        raise HTTPException(404, "Not found")
    fields = body.model_dump(exclude_unset=True)
    if "body_html" in fields and body.client_revision is not None:
        last_client_revision = int(dep.get("last_client_revision") or 0)
        if last_client_revision and body.client_revision < last_client_revision:
            return {
                "ok": True,
                "ignored_stale_revision": True,
                "accepted_revision": body.client_revision,
                "server_version": dep.get("version"),
            }
    # Defense in depth: the recorded deposition text is the single most
    # critical piece of data here. Even though the frontend now guards
    # against sending an empty save, this refuses at the backend too — an
    # update that would replace substantial existing text with
    # empty/near-empty content is rejected rather than silently applied,
    # in case of any future bug, retry, or race on the client side.
    if "body_html" in fields:
        existing_body = deposition_effective_body(dep)
        # Compare visible text (plus a fixed weight per image/table), not raw
        # HTML length: an embedded image is tens of thousands of characters of
        # base64, so deleting one image must not look like the text vanishing.
        existing_len = _dep_content_weight(existing_body)
        new_len = _dep_content_weight(fields["body_html"])
        # Never allow a substantial deposition to be overwritten by a
        # near-empty editor snapshot. This remains true even if an older
        # frontend sends allow_body_shrink=True; that flag is not trusted for
        # blank/near-blank evidence text.
        if existing_len > 40 and new_len < existing_len * 0.2:
            raise HTTPException(
                409,
                "Refusing to save: this update would replace substantial existing deposition text with "
                "much shorter/empty content. If this is intentional, please contact support.",
            )
        dep["version"] = int(dep.get("version") or 0) + 1
        if body.client_revision is not None:
            dep["last_client_revision"] = max(int(dep.get("last_client_revision") or 0), body.client_revision)
        dep["document_json"] = {"type": "html", "html": fields["body_html"]}
        dep["draft_file"] = write_deposition_draft(dep, fields["body_html"])
    for key, value in fields.items():
        if key in ("allow_body_shrink", "client_revision"):
            continue
        dep[key] = value
    dep["updated_at"] = now_iso()
    if "body_html" in fields:
        append_deposition_version(dep, dep.get("body_html") or "")
    save_store(data)
    return {"ok": True, "deposition": dep, "accepted_revision": body.client_revision, "server_version": dep.get("version")}


@api.post("/depositions/{dep_id}/hostile")
async def deposition_mark_hostile(dep_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id), None)
    if not dep:
        raise HTTPException(404, "Not found")
    lang = dep.get("language", "gu")
    judge = next((u for u in data["users"] if u["id"] == user["id"]), None)
    custom = (judge or {}).get("settings", {}).get("hostile_text", {}).get(lang, "")
    text = custom.strip() or DEP_HOSTILE_TEXT.get(lang, DEP_HOSTILE_TEXT["gu"])
    base_html = dep_without_system_block(deposition_effective_body(dep), "hostile")
    dep["body_html"] = base_html + f'<p data-dep-block="hostile"><strong>{html_escape(text)}</strong></p>'
    dep["version"] = int(dep.get("version") or 0) + 1
    dep["document_json"] = {"type": "html", "html": dep["body_html"]}
    dep["draft_file"] = write_deposition_draft(dep, dep["body_html"])
    dep["hostile_declared"] = True
    dep["updated_at"] = now_iso()
    append_deposition_version(dep, dep["body_html"])
    save_store(data)
    return {"ok": True, "body_html": dep["body_html"]}


@api.get("/depositions/{dep_id}/standard-text/{action}")
async def deposition_standard_text(dep_id: str, action: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id), None)
    if not dep:
        raise HTTPException(404, "Not found")
    if dep.get("judge_user_id") != user["id"]:
        raise HTTPException(403, "Forbidden")
    lang = dep.get("language", "gu")
    judge = next((u for u in data["users"] if u["id"] == user["id"]), None)
    if action == "hostile":
        custom = (judge or {}).get("settings", {}).get("hostile_text", {}).get(lang, "")
        text = custom.strip() or DEP_HOSTILE_TEXT.get(lang, DEP_HOSTILE_TEXT["gu"])
        return {
            "ok": True,
            "action": action,
            "language": lang,
            "statement_type": "html",
            "statement_html": f'<p data-dep-block="hostile"><strong>{html_escape(text)}</strong></p>',
        }
    if action == "start-cross":
        defending_label = DEP_PARTY_LABELS.get(dep.get("defending_party", ""), {}).get(lang, "")
        custom = (judge or {}).get("settings", {}).get("start_cross_text", {}).get(lang, "")
        if custom.strip():
            text = (custom.replace("{defending_party}", defending_label)
                          .replace("{advocate_defending}", dep.get("advocate_defending", "")))
        else:
            text = dep_start_cross_text(lang, defending_label, dep.get("advocate_defending", ""))
        return {
            "ok": True,
            "action": action,
            "language": lang,
            "statement_type": "html",
            "statement_html": f'<p data-dep-block="start-cross"><strong>{text}</strong></p>',
        }
    raise HTTPException(400, "Unknown standard text action")


@api.post("/depositions/{dep_id}/start-cross")
async def deposition_start_cross(dep_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id), None)
    if not dep:
        raise HTTPException(404, "Not found")
    lang = dep.get("language", "gu")
    defending_label = DEP_PARTY_LABELS.get(dep.get("defending_party", ""), {}).get(lang, "")
    judge = next((u for u in data["users"] if u["id"] == user["id"]), None)
    custom = (judge or {}).get("settings", {}).get("start_cross_text", {}).get(lang, "")
    if custom.strip():
        text = (custom.replace("{defending_party}", defending_label)
                      .replace("{advocate_defending}", dep.get("advocate_defending", "")))
    else:
        text = dep_start_cross_text(lang, defending_label, dep.get("advocate_defending", ""))
    base_html = dep_without_system_block(deposition_effective_body(dep), "start-cross")
    dep["body_html"] = base_html + f'<p data-dep-block="start-cross"><strong>{text}</strong></p>'
    dep["version"] = int(dep.get("version") or 0) + 1
    dep["document_json"] = {"type": "html", "html": dep["body_html"]}
    dep["draft_file"] = write_deposition_draft(dep, dep["body_html"])
    dep["cross_started"] = True
    dep["updated_at"] = now_iso()
    append_deposition_version(dep, dep["body_html"])
    save_store(data)
    return {"ok": True, "body_html": dep["body_html"]}


@api.post("/depositions/{dep_id}/adjourn")
async def deposition_adjourn(dep_id: str, body: DepositionAdjournIn, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id), None)
    if not dep:
        raise HTTPException(404, "Not found")
    if body.adjourn_for not in ("further_chief", "cross"):
        raise HTTPException(400, "adjourn_for must be 'further_chief' or 'cross'")
    now = datetime.now(timezone.utc)
    dep["body_html"] = deposition_effective_body(dep)
    dep["draft_file"] = write_deposition_draft(dep, dep["body_html"])
    dep["status"] = "adjourned"
    dep["draft_status"] = "COMPLETED"
    dep["adjourn_reason"] = body.reason
    dep["adjourn_next_date"] = body.next_date_time
    dep["adjourn_for"] = body.adjourn_for
    dep["complete_time_display"] = _fmt_dt(now)
    dep["date_display"] = now.strftime("%d/%m/%Y")
    dep["updated_at"] = now_iso()
    save_store(data)
    out = dict(dep)
    out["ok"] = True
    return out


@api.post("/depositions/{dep_id}/complete")
async def deposition_complete(dep_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id), None)
    if not dep:
        raise HTTPException(404, "Not found")
    now = datetime.now(timezone.utc)
    dep["body_html"] = deposition_effective_body(dep)
    dep["draft_file"] = write_deposition_draft(dep, dep["body_html"])
    dep["status"] = "completed"
    dep["draft_status"] = "COMPLETED"
    dep["complete_time_display"] = _fmt_dt(now)
    dep["date_display"] = now.strftime("%d/%m/%Y")
    dep["updated_at"] = now_iso()
    save_store(data)
    out = dict(dep)
    out["ok"] = True
    return out


def order_pdf_bytes(dep: dict, data: dict, only_case: Optional[str] = None) -> bytes:
    court = next((c for c in data["courts"] if c["id"] == dep.get("court_id")), None)
    lang = dep.get("language", "en")
    body_html = deposition_effective_body(dep)
    lang_class = " lang-en" if lang == "en" else (" lang-hi" if lang == "hi" else "")
    full_html = (f'<div class="legal-doc order-doc{lang_class}">{order_upper_region_html(dep, lang, only_case)}'
                 f'<div class="body-block">{body_html}</div>{order_lower_region_html(dep, court, lang)}</div>')
    return build_browser_pdf(f"Order {dep.get('primary_case_number','')}", full_html)


def deposition_pdf_bytes(dep: dict, data: dict) -> bytes:
    if is_order(dep):
        return order_pdf_bytes(dep, data)
    court = next((c for c in data["courts"] if c["id"] == dep.get("court_id")), None)
    lang = dep.get("language", "gu")
    body_html = deposition_effective_body(dep)
    continuation_kind = dep_continuation_kind(dep, data)
    if continuation_kind in ("cross", "further_cross"):
        body_html = dep_without_system_block(body_html, "start-cross")
    upper = dep_upper_region_html(dep, court, lang, data)
    lower = dep_lower_region_html(dep, court, lang, body_html)
    lang_class = " lang-en" if lang == "en" else (" lang-hi" if lang == "hi" else "")
    full_html = f'<div class="legal-doc{lang_class}">{upper}<div class="body-block">{body_html}</div>{lower}</div>'
    pdf_title = f"Statement u/s 183 BNSS {dep.get('sr_no','')}" if is_s183(dep) else f"Deposition {dep.get('exhibit_number','')}"
    # Only a statement u/s 183 BNSS is signed by the witness (final line + each page).
    sign_label = WITNESS_SIGN_LABELS.get(lang, WITNESS_SIGN_LABELS["gu"]) if is_s183(dep) else None
    return build_browser_pdf(pdf_title, full_html, witness_sign_label=sign_label)


@api.get("/depositions/{dep_id}/print")
async def deposition_print(dep_id: str, user: dict = Depends(require_role("judge"))):
    data = load_store()
    dep = next((d for d in data.get("depositions", []) if d["id"] == dep_id), None)
    if not dep:
        raise HTTPException(404, "Not found")
    pdf_bytes = deposition_pdf_bytes(dep, data)
    filename = safe_pdf_name(f"{dep.get('primary_case_number','case')}_{dep.get('witness_name','witness')}", 1)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ---------------- Digital signature: DSC token (via NyayDwar Sign Bridge) and Aadhaar copies ----------------
# One "signing job" holds one or more PDFs (several entries can be signed together
# with a single PIN entry). The browser opens nyaydwar-sign://sign?server=..&job=..&token=..;
# the Sign Bridge on the user's computer (Windows / Ubuntu / macOS) fetches each PDF
# with the one-time token, signs it with the DSC token (PIN typed only in the bridge
# window) and uploads the signed PDF. The server accepts a signed PDF only if it is the
# very document it handed out plus an added signature (incremental update).
#
# Routing after signing:
#  * a warrant (any source_kind starting with "warrant") signed by Court Staff is
#    stamped "Prepared by" and goes to the Judicial Officer's "For Signature" desk;
#    when the Judicial Officer signs it, the staff copy is marked done and the final
#    copy (both signatures) is available to the court;
#  * a document signed by an Advocate / Litigant goes to the court's
#    "Documents Submitted" desk (staff), and is visible to the Judicial Officer.
SIGN_JOB_DIR = ROOT_DIR / "sign_jobs"
SIGNED_DOC_DIR = ROOT_DIR / "signed_documents"
DOWNLOADS_DIR = ROOT_DIR / "downloads"
SIGN_JOB_TTL_MIN = 30
SIGN_MAX_BYTES = 40 * 1024 * 1024
SIGN_MAX_ITEMS = 50
SIGN_BRIDGE_PACKAGES = {
    "windows": "NyayDwar-Sign-Bridge-Windows.zip",
    "ubuntu": "NyayDwar-Sign-Bridge-Ubuntu.tar.gz",
    "mac": "NyayDwar-Sign-Bridge-Mac.tar.gz",
}


def _is_warrant(kind: str) -> bool:
    return (kind or "").lower().startswith("warrant")


def _job_expired(job: dict) -> bool:
    try:
        return datetime.fromisoformat(job["created_at"]) < datetime.now(timezone.utc) - timedelta(minutes=SIGN_JOB_TTL_MIN)
    except Exception:
        return True


def _job_item_path(job_id: str, item_id: str) -> Path:
    return SIGN_JOB_DIR / f"{job_id}_{item_id}.pdf"


def _purge_sign_jobs(data: dict) -> None:
    keep = []
    for j in data.get("sign_jobs", []):
        if _job_expired(j):
            for it in j.get("items", []):
                try:
                    _job_item_path(j["id"], it["id"]).unlink()
                except Exception:
                    pass
            continue
        keep.append(j)
    data["sign_jobs"] = keep


def _job_by_token(data: dict, job_id: str, token: str) -> dict:
    j = next((x for x in data.get("sign_jobs", []) if x["id"] == job_id), None)
    if not j or not token or not hmac.compare_digest(j.get("token", ""), token) or _job_expired(j):
        raise HTTPException(404, "This signing request has expired. Please click Digitally Sign again in NyayDwar.")
    if j.get("status") != "pending":
        raise HTTPException(409, "This signing request is already finished.")
    return j


def _job_item(j: dict, item_id: str) -> dict:
    items = j.get("items", [])
    it = next((x for x in items if x["id"] == item_id), None) if item_id else (items[0] if len(items) == 1 else None)
    if not it:
        raise HTTPException(404, "Document not found in this signing request")
    return it


def _signer_label(u: dict, data: dict) -> str:
    try:
        ident = _msg_identity(u, data)
        return ", ".join(x for x in [ident.get("name", ""), ident.get("designation", "")] if x)
    except Exception:
        return u.get("name") or u.get("login_id", "")


def _user_court_ids(u: dict) -> List[str]:
    if not u:
        return []
    if u.get("role") == "judge":
        return [c for c in (u.get("court_ids") or []) if c]
    return [u["court_id"]] if u.get("court_id") else []


def _finish_job_if_done(j: dict) -> None:
    items = j.get("items", [])
    if items and all(it.get("status") in ("done", "error") for it in items):
        j["status"] = "done" if any(it.get("status") == "done" for it in items) else "error"
        j["finished_at"] = now_iso()


@api.post("/sign-jobs")
async def sign_job_create(files: List[UploadFile] = File(...), titles: str = Form("[]"), filenames: str = Form("[]"),
                          source_ids: str = Form("[]"), source_kind: str = Form(""), keywords: str = Form("[]"),
                          court_ids: str = Form("[]"), source_kinds: str = Form("[]"),
                          user: dict = Depends(get_current_user)):
    if not files or len(files) > SIGN_MAX_ITEMS:
        raise HTTPException(400, f"Select between 1 and {SIGN_MAX_ITEMS} documents to sign")

    def _list(v):
        try:
            x = json.loads(v or "[]")
            return x if isinstance(x, list) else []
        except Exception:
            return []
    tl, fl, sl, kw = _list(titles), _list(filenames), _list(source_ids), [str(k)[:120] for k in _list(keywords)][:10]
    cl, kl = _list(court_ids), _list(source_kinds)
    contents = []
    for f in files:
        c = await f.read()
        if not c.startswith(b"%PDF"):
            raise HTTPException(400, "Only PDF documents can be signed")
        if len(c) > SIGN_MAX_BYTES:
            raise HTTPException(400, "A PDF is too large to sign here (limit 40 MB)")
        contents.append((f, c))
    data = load_store()
    _purge_sign_jobs(data)
    me = _msg_user(data, user["id"]) or user
    courts = _user_court_ids(me)
    court = _court_by_id(data, courts[0]) if courts else None
    valid_courts = {c.get("id") for c in data.get("courts", [])}
    kinds_all = [str(kl[i] if i < len(kl) and kl[i] else source_kind)[:40] for i in range(len(contents))]
    job = {"id": new_id(), "token": secrets.token_urlsafe(32), "user_id": user["id"], "status": "pending",
           "keywords": kw, "source_kind": source_kind[:40], "signer_name": _signer_label(me, data),
           # the staff member who prepares a warrant signs "Prepared by"
           "stamp_label": "Prepared by" if me.get("role") == "staff" and kinds_all and all(_is_warrant(k) for k in kinds_all) else "",
           "location": ((court or {}).get("english") or {}).get("place", ""), "court_id": courts[0] if courts else "",
           "created_at": now_iso(), "items": []}
    SIGN_JOB_DIR.mkdir(parents=True, exist_ok=True)
    for i, (f, c) in enumerate(contents):
        name = _safe_filename(str(fl[i]) if i < len(fl) and fl[i] else (f.filename or "document.pdf"))
        it = {"id": new_id(), "title": (str(tl[i]) if i < len(tl) and tl[i] else name)[:200], "filename": name,
              "source_id": str(sl[i])[:80] if i < len(sl) else "", "status": "pending", "message": "",
              "source_kind": kinds_all[i], "court_id": str(cl[i]) if i < len(cl) and str(cl[i]) in valid_courts else "",
              "signed_doc_id": "", "sha256": hashlib.sha256(c).hexdigest(), "size": len(c)}
        _job_item_path(job["id"], it["id"]).write_bytes(c)
        job["items"].append(it)
    data.setdefault("sign_jobs", []).append(job)
    save_store(data)
    return {"id": job["id"], "token": job["token"], "count": len(job["items"]), "expires_in_minutes": SIGN_JOB_TTL_MIN}


@api.get("/sign-jobs/{job_id}/info")
async def sign_job_info(job_id: str, token: str = ""):
    data = load_store()
    j = _job_by_token(data, job_id, token)
    items = [{"id": it["id"], "title": it["title"], "filename": it["filename"]} for it in j["items"] if it.get("status") == "pending"]
    one = items[0] if len(items) == 1 else {}
    return {"items": items, "keywords": j.get("keywords", []), "signer_name": j.get("signer_name", ""),
            "location": j.get("location", ""), "reason": "Digitally signed on NyayDwar", "stamp_label": j.get("stamp_label", ""),
            # single-document fields kept for the first bridge version
            "title": one.get("title") or f"{len(items)} documents", "filename": one.get("filename") or "documents.pdf"}


@api.get("/sign-jobs/{job_id}/pdf")
async def sign_job_pdf(job_id: str, token: str = "", item: str = ""):
    data = load_store()
    j = _job_by_token(data, job_id, token)
    it = _job_item(j, item)
    p = _job_item_path(j["id"], it["id"])
    if it.get("status") != "pending" or not p.exists():
        raise HTTPException(409, "This document has already been signed.")
    return FileResponse(str(p), media_type="application/pdf", filename=it["filename"])


def _store_signed_pdf(data: dict, u: dict, content: bytes, meta: dict, court_id: str = "") -> dict:
    SIGNED_DOC_DIR.mkdir(parents=True, exist_ok=True)
    courts = _user_court_ids(u)
    doc = {"id": new_id(), "user_id": u["id"], "signer_role": u.get("role", ""), "court_id": court_id or (courts[0] if courts else ""),
           "signed_at": now_iso(), "size": len(content), "sha256": hashlib.sha256(content).hexdigest(), **meta}
    (SIGNED_DOC_DIR / f"{doc['id']}.pdf").write_bytes(content)
    data.setdefault("signed_documents", []).append(doc)
    _route_signed_doc(data, doc)
    return doc


def _route_signed_doc(data: dict, doc: dict) -> None:
    role, kind = doc.get("signer_role"), doc.get("source_kind", "")
    if _is_warrant(kind):
        if role == "staff":
            doc["workflow"] = "awaiting_judge"
            doc["prepared_by"] = doc.get("signer_name", "")
        elif role == "judge":
            parent = next((x for x in data.get("signed_documents", []) if x["id"] == doc.get("source_id")
                           and x.get("workflow") in ("awaiting_judge", "returned")), None)
            doc["workflow"] = "final"
            if parent:
                parent.update({"workflow": "judge_signed", "final_doc_id": doc["id"], "judge_signed_at": doc["signed_at"],
                               "judge_name": doc.get("signer_name", "")})
                doc.update({"parent_id": parent["id"], "prepared_by": parent.get("prepared_by") or parent.get("signer_name", ""),
                            "court_id": parent.get("court_id") or doc.get("court_id", "")})
    if role in PUBLIC_ROLES and doc.get("court_id"):
        doc["submission"] = {"status": "new", "submitted_at": doc["signed_at"]}


@api.post("/sign-jobs/{job_id}/complete")
async def sign_job_complete(job_id: str, token: str = "", item: str = "", file: UploadFile = File(...), cert_subject: str = Form(""),
                            cert_issuer: str = Form(""), cert_serial: str = Form(""), placed_at: str = Form(""),
                            bridge_version: str = Form("")):
    content = await file.read()
    if len(content) > SIGN_MAX_BYTES + 5 * 1024 * 1024:
        raise HTTPException(400, "The signed PDF is too large")
    data = load_store()
    j = _job_by_token(data, job_id, token)
    it = _job_item(j, item)
    if it.get("status") != "pending":
        raise HTTPException(409, "This document has already been signed.")
    p = _job_item_path(j["id"], it["id"])
    original = p.read_bytes() if p.exists() else b""
    # Accept only the same document with a signature added to it.
    if (not original or not content.startswith(original) or len(content) <= len(original)
            or b"/ByteRange" not in content[len(original):]):
        raise HTTPException(400, "The file sent back is not the signed copy of this document")
    owner = _msg_user(data, j["user_id"]) or {"id": j["user_id"]}
    doc = _store_signed_pdf(data, owner, content, {
        "method": "dsc_token", "title": it.get("title", ""), "filename": it.get("filename", "signed.pdf"),
        "source_kind": it.get("source_kind") or j.get("source_kind", ""), "source_id": it.get("source_id", ""), "signer_name": j.get("signer_name", ""),
        "original_sha256": it.get("sha256", ""), "cert_subject": cert_subject[:300], "cert_issuer": cert_issuer[:300],
        "cert_serial": cert_serial[:80], "placed_at": placed_at[:120], "bridge_version": bridge_version[:20],
    }, court_id=it.get("court_id", ""))
    it.update({"status": "done", "signed_doc_id": doc["id"]})
    try:
        p.unlink()
    except Exception:
        pass
    _finish_job_if_done(j)
    save_store(data)
    return {"ok": True}


class SignJobFailIn(BaseModel):
    message: str = ""


@api.post("/sign-jobs/{job_id}/fail")
async def sign_job_fail(job_id: str, body: SignJobFailIn, token: str = "", item: str = ""):
    data = load_store()
    j = _job_by_token(data, job_id, token)
    msg = (body.message or "Signing was not completed.")[:500]
    targets = [_job_item(j, item)] if item else [it for it in j["items"] if it.get("status") == "pending"]
    for it in targets:
        if it.get("status") == "pending":
            it.update({"status": "error", "message": msg})
    if not item:
        j["message"] = msg
    _finish_job_if_done(j)
    save_store(data)
    return {"ok": True}


@api.get("/sign-jobs/{job_id}")
async def sign_job_status(job_id: str, user: dict = Depends(get_current_user)):
    data = load_store()
    j = next((x for x in data.get("sign_jobs", []) if x["id"] == job_id and x.get("user_id") == user["id"]), None)
    if not j:
        raise HTTPException(404, "Signing request not found")
    status = j.get("status")
    if status == "pending" and _job_expired(j):
        status = "expired"
    items = [{"id": it["id"], "title": it["title"], "status": it.get("status"), "message": it.get("message", ""),
              "signed_doc_id": it.get("signed_doc_id", "")} for it in j.get("items", [])]
    msgs = [it["message"] for it in items if it["status"] == "error" and it["message"]]
    done_ids = {it["signed_doc_id"] for it in items if it["signed_doc_id"]}
    done_docs = [d for d in data.get("signed_documents", []) if d["id"] in done_ids]
    notes = []
    if any(d.get("workflow") == "awaiting_judge" for d in done_docs):
        notes.append("It has been sent to the Judicial Officer's “For Signature” desk.")
    if any(d.get("workflow") == "final" and d.get("parent_id") for d in done_docs):
        notes.append("The fully signed copy is now available to the court staff.")
    if any(d.get("submission") for d in done_docs):
        notes.append("It has been submitted to the court (Documents Submitted).")
    return {"status": status, "total": len(items), "done": sum(1 for it in items if it["status"] == "done"),
            "failed": sum(1 for it in items if it["status"] == "error"), "items": items,
            "message": j.get("message") or (msgs[0] if msgs else ""),
            "signed_doc_id": items[0]["signed_doc_id"] if len(items) == 1 else "", "note": " ".join(notes)}


@api.post("/signed-documents/upload")
async def signed_doc_upload(files: List[UploadFile] = File(...), title: str = Form(""), source_kind: str = Form(""),
                            source_id: str = Form(""), method: str = Form("aadhaar"), court_id: str = Form(""),
                            user: dict = Depends(get_current_user)):
    """Copies signed outside NyayDwar (e.g. Aadhaar eSign through DigiLocker)."""
    if not files or len(files) > SIGN_MAX_ITEMS:
        raise HTTPException(400, f"Choose between 1 and {SIGN_MAX_ITEMS} signed PDF files")
    data = load_store()
    me = _msg_user(data, user["id"]) or user
    if court_id and not _court_by_id(data, court_id):
        court_id = ""
    ids = []
    for f in files:
        content = await f.read()
        if not content.startswith(b"%PDF"):
            raise HTTPException(400, f"{f.filename}: please choose the signed PDF file")
        if len(content) > SIGN_MAX_BYTES:
            raise HTTPException(400, f"{f.filename}: the PDF is too large (limit 40 MB)")
        name = _safe_filename(f.filename or "signed.pdf")
        doc = _store_signed_pdf(data, me, content, {
            "method": "aadhaar" if method == "aadhaar" else "other",
            "title": (title if len(files) == 1 and title else re.sub(r"\.pdf$", "", name, flags=re.I))[:200],
            "filename": name, "source_kind": source_kind[:40], "source_id": source_id[:80] if len(files) == 1 else "",
            "signer_name": _signer_label(me, data), "has_signature": b"/ByteRange" in content,
        }, court_id=court_id)
        ids.append(doc["id"])
    save_store(data)
    return {"ok": True, "ids": ids, "id": ids[0]}


def _signed_doc_visible(d: dict, u: dict) -> bool:
    if not u:
        return False
    if d.get("user_id") == u.get("id") or u.get("role") == "admin":
        return True
    # Judicial Officer and Court Staff also see what is signed in their own court.
    return u.get("role") in ("judge", "staff") and d.get("court_id") and d.get("court_id") in _user_court_ids(u)


@api.get("/signed-documents")
async def signed_doc_list(scope: str = "mine", user: dict = Depends(get_current_user)):
    data = load_store()
    me = _msg_user(data, user["id"]) or user
    docs = data.get("signed_documents", [])
    if scope == "mine" or me.get("role") in PUBLIC_ROLES:
        rows = [d for d in docs if d.get("user_id") == me["id"]]
    else:
        rows = [d for d in docs if _signed_doc_visible(d, me)]
    return _signed_rows(data, rows, me)


def _signed_rows(data: dict, rows: list, me: dict) -> list:
    users = {u["id"]: u for u in data.get("users", [])}
    out = []
    for d in rows:
        r = {k: v for k, v in d.items() if k != "user_id"}
        r["mine"] = d.get("user_id") == me["id"]
        r["signed_by"] = d.get("signer_name") or (_signer_label(users[d["user_id"]], data) if d.get("user_id") in users else "")
        c = _court_by_id(data, d.get("court_id") or "")
        r["court_name"] = ((c or {}).get("english") or {}).get("court_name", "")
        out.append(r)
    out.sort(key=lambda d: d.get("signed_at", ""), reverse=True)
    return out


def _visible_signed_doc(data: dict, doc_id: str, user: dict) -> dict:
    me = _msg_user(data, user["id"]) or user
    d = next((x for x in data.get("signed_documents", []) if x["id"] == doc_id), None)
    if not d or not _signed_doc_visible(d, me):
        raise HTTPException(404, "Signed document not found")
    return d


def _signed_download_name(d: dict) -> str:
    name = d.get("filename") or "signed.pdf"
    stem = name[:-4] if name.lower().endswith(".pdf") else name
    return f"{stem}_signed.pdf"


@api.get("/signed-documents/zip")
async def signed_doc_zip(ids: str = "", user: dict = Depends(get_current_user)):
    data = load_store()
    wanted = [x for x in ids.split(",") if x][:200]
    if not wanted:
        raise HTTPException(400, "No documents selected")
    buf = io.BytesIO()
    used = set()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for i, doc_id in enumerate(wanted, start=1):
            d = _visible_signed_doc(data, doc_id, user)
            p = SIGNED_DOC_DIR / f"{doc_id}.pdf"
            if not p.exists():
                continue
            name = _signed_download_name(d)
            if name in used:
                name = f"{i:02d}_{name}"
            used.add(name)
            z.write(str(p), name)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": 'attachment; filename="Signed_Documents.zip"'})


@api.get("/signed-documents/{doc_id}/file")
async def signed_doc_file(doc_id: str, inline: int = 0, user: dict = Depends(get_current_user)):
    data = load_store()
    d = _visible_signed_doc(data, doc_id, user)
    p = SIGNED_DOC_DIR / f"{doc_id}.pdf"
    if not p.exists():
        raise HTTPException(404, "Signed document file is missing")
    return FileResponse(str(p), media_type="application/pdf", filename=_signed_download_name(d),
                        content_disposition_type="inline" if inline else "attachment")


@api.get("/signed-documents/{doc_id}/verify")
async def signed_doc_verify(doc_id: str, user: dict = Depends(get_current_user)):
    """Checks that the stored copy is unchanged since it was signed (and, when the
    server has the PDF-signature library, that the digital signature is intact)."""
    data = load_store()
    d = _visible_signed_doc(data, doc_id, user)
    p = SIGNED_DOC_DIR / f"{doc_id}.pdf"
    if not p.exists():
        return {"file_ok": False, "message": "The stored file is missing."}
    content = p.read_bytes()
    file_ok = hashlib.sha256(content).hexdigest() == d.get("sha256")
    result = {"file_ok": file_ok, "has_signature": b"/ByteRange" in content, "signatures": []}
    import logging
    logging.getLogger("pyhanko").setLevel(logging.CRITICAL)
    logging.getLogger("pyhanko_certvalidator").setLevel(logging.CRITICAL)
    try:
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import async_validate_pdf_signature
        from pyhanko_certvalidator import ValidationContext
        r = PdfFileReader(io.BytesIO(content), strict=False)
        for s in r.embedded_signatures:
            try:
                st = await async_validate_pdf_signature(s, ValidationContext(allow_fetching=False))
                result["signatures"].append({"signer": st.signing_cert.subject.human_friendly, "intact": bool(st.intact),
                                             "covers_whole_document": getattr(getattr(st, "coverage", None), "name", "") in ("ENTIRE_FILE", "ENTIRE_REVISION"),
                                             "signed_at": str(st.signer_reported_dt or "")})
            except Exception as e:
                result["signatures"].append({"signer": "", "intact": False, "error": str(e)[:200]})
    except ImportError:
        result["note"] = "Detailed signature check is available when the server has the pyhanko library."
    except Exception as e:
        result["note"] = f"Signature could not be read: {str(e)[:200]}"
    result["message"] = ("The stored copy is unchanged since it was signed." if file_ok
                         else "WARNING: the stored copy does not match the copy that was signed.")
    return result


# ---- Judicial Officer's "For Signature" desk (warrants prepared and signed by staff)
def _desk_user(user: dict, roles) -> tuple:
    data = load_store()
    me = _msg_user(data, user["id"]) or user
    if me.get("role") not in roles:
        raise HTTPException(403, "Not available for this user")
    return data, me


@api.get("/signature-desk")
async def signature_desk(user: dict = Depends(get_current_user)):
    data, me = _desk_user(user, ("judge",))
    courts = set(_user_court_ids(me))
    rows = [d for d in data.get("signed_documents", []) if d.get("workflow") == "awaiting_judge" and d.get("court_id") in courts]
    return _signed_rows(data, rows, me)


@api.get("/signature-desk/count")
async def signature_desk_count(user: dict = Depends(get_current_user)):
    data = load_store()
    me = _msg_user(data, user["id"]) or user
    if me.get("role") != "judge":
        return {"pending": 0}
    courts = set(_user_court_ids(me))
    return {"pending": sum(1 for d in data.get("signed_documents", []) if d.get("workflow") == "awaiting_judge" and d.get("court_id") in courts)}


class DeskReturnIn(BaseModel):
    remark: str = ""


@api.post("/signature-desk/{doc_id}/return")
async def signature_desk_return(doc_id: str, body: DeskReturnIn, user: dict = Depends(get_current_user)):
    """The Judicial Officer sends a warrant back to the staff without signing it."""
    data, me = _desk_user(user, ("judge",))
    d = next((x for x in data.get("signed_documents", []) if x["id"] == doc_id and x.get("workflow") == "awaiting_judge"
              and x.get("court_id") in _user_court_ids(me)), None)
    if not d:
        raise HTTPException(404, "Document not found on your desk")
    d.update({"workflow": "returned", "return_remark": (body.remark or "").strip()[:500], "returned_at": now_iso(),
              "returned_by": _signer_label(me, data)})
    save_store(data)
    return {"ok": True}


# ---- Court's "Documents Submitted" desk (signed by Advocates / Litigants)
@api.get("/submitted-documents")
async def submitted_documents(status: str = "all", user: dict = Depends(get_current_user)):
    data, me = _desk_user(user, ("staff", "judge", "admin"))
    courts = set(_user_court_ids(me))
    rows = [d for d in data.get("signed_documents", []) if d.get("submission")
            and (me.get("role") == "admin" or d.get("court_id") in courts)
            and (status == "all" or d["submission"].get("status") == status)]
    return _signed_rows(data, rows, me)


@api.get("/submitted-documents/count")
async def submitted_documents_count(user: dict = Depends(get_current_user)):
    data = load_store()
    me = _msg_user(data, user["id"]) or user
    if me.get("role") != "staff":
        return {"new": 0}
    courts = set(_user_court_ids(me))
    return {"new": sum(1 for d in data.get("signed_documents", []) if (d.get("submission") or {}).get("status") == "new"
                       and d.get("court_id") in courts)}


class SubmittedMarkIn(BaseModel):
    ids: List[str] = []
    status: str = "placed"


@api.post("/submitted-documents/mark")
async def submitted_documents_mark(body: SubmittedMarkIn, user: dict = Depends(get_current_user)):
    """Staff mark submitted documents as placed on the case record (or back to new)."""
    data, me = _desk_user(user, ("staff",))
    courts = set(_user_court_ids(me))
    n = 0
    for d in data.get("signed_documents", []):
        if d["id"] in body.ids and d.get("submission") and d.get("court_id") in courts:
            if body.status == "placed":
                d["submission"].update({"status": "placed", "placed_at": now_iso(), "placed_by": _signer_label(me, data)})
            else:
                d["submission"] = {"status": "new", "submitted_at": d["submission"].get("submitted_at", d.get("signed_at"))}
            n += 1
    save_store(data)
    return {"ok": True, "updated": n}


@api.get("/downloads/sign-bridge")
async def download_sign_bridge(platform: str = "windows"):
    name = SIGN_BRIDGE_PACKAGES.get((platform or "windows").lower())
    if not name:
        raise HTTPException(404, "Unknown operating system")
    p = DOWNLOADS_DIR / name
    if not p.exists():
        raise HTTPException(404, "The Sign Bridge package for this operating system is not available on this server yet. Please contact the Administrator.")
    return FileResponse(str(p), media_type="application/zip" if name.endswith(".zip") else "application/gzip", filename=name)


@api.get("/downloads/sign-bridge/available")
async def sign_bridge_available():
    return {k: (DOWNLOADS_DIR / v).exists() for k, v in SIGN_BRIDGE_PACKAGES.items()}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

if FRONTEND_BUILD.exists():
    static_dir = FRONTEND_BUILD / "static"

    def no_cache_file(path: Path):
        return FileResponse(
            path,
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )

    @app.get("/static/{file_path:path}")
    async def serve_static(file_path: str):
        target = (static_dir / file_path).resolve()
        static_root = static_dir.resolve()
        if not static_dir.exists() or not str(target).startswith(str(static_root)) or not target.is_file():
            raise HTTPException(status_code=404, detail="Static file not found")
        return no_cache_file(target)

    @app.get("/")
    async def serve_index():
        return no_cache_file(FRONTEND_BUILD / "index.html")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = FRONTEND_BUILD / full_path
        if candidate.exists() and candidate.is_file():
            return no_cache_file(candidate)
        return no_cache_file(FRONTEND_BUILD / "index.html")
