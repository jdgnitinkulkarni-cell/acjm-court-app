"""ACJM Court App - Backend regression tests.
Covers auth, courts, staff users, excel upload/download, pleas (138 normal/sanjabi, 25),
primary FS, final FS questions/entries, cascade delete.
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pdf-requirements-4.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_PW = "ahmedabad@2026"
STAFF_LOGIN = "Staff"
STAFF_PW = "Staff@123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/admin-login", json={"password": ADMIN_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def staff_token():
    # Try default; if it fails (already changed by prior tests), reset via admin not possible — skip with note
    r = requests.post(f"{API}/auth/staff-login", json={"login_id": STAFF_LOGIN, "password": STAFF_PW}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Default staff login failed: {r.status_code} {r.text}")
    return r.json()["token"]


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Auth ----------
class TestAuth:
    def test_admin_login_success(self):
        r = requests.post(f"{API}/auth/admin-login", json={"password": ADMIN_PW}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and isinstance(d["token"], str) and len(d["token"]) > 10
        assert d["user"]["role"] == "admin"

    def test_admin_login_wrong_password(self):
        r = requests.post(f"{API}/auth/admin-login", json={"password": "wrong"}, timeout=20)
        assert r.status_code == 401

    def test_staff_login_must_change(self):
        r = requests.post(f"{API}/auth/staff-login", json={"login_id": STAFF_LOGIN, "password": STAFF_PW}, timeout=20)
        if r.status_code != 200:
            pytest.skip("Default staff already modified")
        d = r.json()
        assert d["user"]["role"] == "staff"
        assert d["user"]["must_change"] is True

    def test_me(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=auth(admin_token), timeout=20)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me", timeout=20)
        assert r.status_code == 401


# ---------- Courts ----------
class TestCourts:
    def test_list_default_seeded(self):
        r = requests.get(f"{API}/courts", timeout=20)
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list) and len(docs) >= 1
        assert "english" in docs[0] and "gujarati" in docs[0]

    def test_create_and_update_court(self, admin_token):
        payload = {
            "english": {"court_name": "TEST_Court", "place": "TEST", "judge_name": "TJ", "judge_designation": "TD"},
            "gujarati": {"court_name": "ટેસ્ટ", "place": "ટેસ્ટ", "judge_name": "જજ", "judge_designation": "પદ"},
        }
        r = requests.post(f"{API}/courts", json=payload, headers=auth(admin_token), timeout=20)
        assert r.status_code == 200
        cid = r.json()["id"]
        # Update
        payload["english"]["court_name"] = "TEST_Court_Updated"
        r2 = requests.put(f"{API}/courts/{cid}", json=payload, headers=auth(admin_token), timeout=20)
        assert r2.status_code == 200
        # Verify GET
        all_courts = requests.get(f"{API}/courts", timeout=20).json()
        match = [c for c in all_courts if c["id"] == cid]
        assert match and match[0]["english"]["court_name"] == "TEST_Court_Updated"

    def test_create_court_requires_admin(self):
        r = requests.post(f"{API}/courts", json={
            "english": {"court_name": "x", "place": "", "judge_name": "", "judge_designation": ""},
            "gujarati": {"court_name": "x", "place": "", "judge_name": "", "judge_designation": ""},
        }, timeout=20)
        assert r.status_code == 401


# ---------- Staff users ----------
class TestStaffUsers:
    def test_create_and_delete_staff(self, admin_token):
        login_id = f"TEST_staff_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/staff-users", json={"login_id": login_id, "password": "Pass@123"},
                          headers=auth(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        # List should contain
        lst = requests.get(f"{API}/staff-users", headers=auth(admin_token), timeout=20).json()
        assert any(u["id"] == sid for u in lst)
        # Login as new staff
        lr = requests.post(f"{API}/auth/staff-login", json={"login_id": login_id, "password": "Pass@123"}, timeout=20)
        assert lr.status_code == 200
        assert lr.json()["user"]["must_change"] is True
        # Delete
        d = requests.delete(f"{API}/staff-users/{sid}", headers=auth(admin_token), timeout=20)
        assert d.status_code == 200


# ---------- Excel ----------
class TestExcel:
    def test_upload_and_download(self, admin_token):
        # Minimal xlsx-ish bytes (we use plain bytes; backend stores as base64)
        content = b"PK\x03\x04 fake xlsx test bytes"
        files = {"file": ("model.xlsx", io.BytesIO(content),
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        r = requests.post(f"{API}/admin/excel", files=files, headers=auth(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["filename"] == "model.xlsx"
        # Download (unauthenticated by design)
        d = requests.get(f"{API}/admin/excel/download", timeout=20)
        assert d.status_code == 200
        assert d.content == content
        # Info
        info = requests.get(f"{API}/admin/excel/info", timeout=20).json()
        assert info.get("filename") == "model.xlsx"


# ---------- Pleas ----------
def _accused():
    return {
        "case_no": f"TEST_{uuid.uuid4().hex[:6]}",
        "name": "TestName", "father_husband": "F", "religion": "R",
        "age": "30", "occupation": "Occ", "address": "Addr", "contact": "9999999999",
    }


class TestPleas:
    def test_create_138_normal_and_list_newest_first(self):
        payload = {"language": "en", "charge": "138", "accused": _accused(),
                   "q1": "Yes", "q2": "Plead Guilty", "plea_type": "normal"}
        r = requests.post(f"{API}/pleas", json=payload, timeout=20)
        assert r.status_code == 200
        pid = r.json()["id"]
        lst = requests.get(f"{API}/pleas", timeout=20).json()
        assert lst and lst[0]["id"] == pid

    def test_create_25_normal(self):
        payload = {"language": "gu", "charge": "25", "accused": _accused(),
                   "q1": "Yes", "q2": "Not Guilty", "plea_type": "normal"}
        r = requests.post(f"{API}/pleas", json=payload, timeout=20)
        assert r.status_code == 200
        assert r.json()["charge"] == "25"

    def test_create_138_sanjabi_via_put(self):
        base = {"language": "en", "charge": "138", "accused": _accused(),
                "q1": "Yes", "q2": "Plead Guilty", "plea_type": "sanjabi"}
        r = requests.post(f"{API}/pleas", json=base, timeout=20)
        assert r.status_code == 200
        pid = r.json()["id"]
        sanjabi_data = {"q3": "a", "q4": "b", "q5": "c", "q6": "d", "q7": ["x"], "q7_other": "", "q8": "z"}
        upd = {**base, "sanjabi": sanjabi_data}
        r2 = requests.put(f"{API}/pleas/{pid}", json=upd, timeout=20)
        assert r2.status_code == 200
        got = requests.get(f"{API}/pleas/{pid}", timeout=20).json()
        assert got["sanjabi"]["q3"] == "a"


# ---------- Primary FS ----------
class TestPrimaryFS:
    def test_create_and_get_by_plea(self):
        # Create plea first
        plea = {"language": "en", "charge": "138", "accused": _accused(),
                "q1": "Yes", "q2": "Plead Guilty", "plea_type": "normal"}
        pid = requests.post(f"{API}/pleas", json=plea, timeout=20).json()["id"]
        body = {"plea_id": pid, "a1": "ans1", "a2": "ans2", "a3": "ans3", "a4": "ans4"}
        r = requests.post(f"{API}/primary-fs", json=body, timeout=20)
        assert r.status_code == 200
        g = requests.get(f"{API}/primary-fs/by-plea/{pid}", timeout=20).json()
        assert g["a1"] == "ans1" and g["a4"] == "ans4"

    def test_primary_404_for_missing_plea(self):
        r = requests.post(f"{API}/primary-fs",
                          json={"plea_id": "no-such-id", "a1": "", "a2": "", "a3": "", "a4": ""}, timeout=20)
        assert r.status_code == 404


# ---------- Final FS ----------
class TestFinalFS:
    def test_questions_save_and_get(self, staff_token):
        questions = ["Q1?", "Q2?", "Q3?"]
        r = requests.post(f"{API}/final-fs/questions", json={"questions": questions},
                          headers=auth(staff_token), timeout=20)
        assert r.status_code == 200
        g = requests.get(f"{API}/final-fs/questions", timeout=20).json()
        assert g["questions"] == questions

    def test_questions_requires_staff(self):
        r = requests.post(f"{API}/final-fs/questions", json={"questions": ["x"]}, timeout=20)
        assert r.status_code == 401

    def test_final_entry_create_and_get(self):
        plea = {"language": "en", "charge": "138", "accused": _accused(),
                "q1": "Yes", "q2": "Plead Guilty", "plea_type": "normal"}
        pid = requests.post(f"{API}/pleas", json=plea, timeout=20).json()["id"]
        r = requests.post(f"{API}/final-fs/entries",
                          json={"plea_id": pid, "answers": ["a", "b", "c"]}, timeout=20)
        assert r.status_code == 200
        g = requests.get(f"{API}/final-fs/entries/by-plea/{pid}", timeout=20).json()
        assert g["answers"] == ["a", "b", "c"]


# ---------- Cascade delete ----------
class TestCascadeDelete:
    def test_delete_plea_cascades(self, staff_token):
        plea = {"language": "en", "charge": "138", "accused": _accused(),
                "q1": "Yes", "q2": "Plead Guilty", "plea_type": "normal"}
        pid = requests.post(f"{API}/pleas", json=plea, timeout=20).json()["id"]
        requests.post(f"{API}/primary-fs",
                      json={"plea_id": pid, "a1": "1", "a2": "2", "a3": "3", "a4": "4"}, timeout=20)
        requests.post(f"{API}/final-fs/entries",
                      json={"plea_id": pid, "answers": ["a"]}, timeout=20)
        # Delete (staff)
        d = requests.delete(f"{API}/pleas/{pid}", headers=auth(staff_token), timeout=20)
        assert d.status_code == 200
        # Verify cascade
        assert requests.get(f"{API}/pleas/{pid}", timeout=20).status_code == 404
        assert requests.get(f"{API}/primary-fs/by-plea/{pid}", timeout=20).json() == {}
        assert requests.get(f"{API}/final-fs/entries/by-plea/{pid}", timeout=20).json() == {}

    def test_delete_plea_requires_staff(self):
        r = requests.delete(f"{API}/pleas/anything", timeout=20)
        assert r.status_code == 401
