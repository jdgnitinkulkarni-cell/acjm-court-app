"""NyayDwar Sign Bridge — signs NyayDwar PDFs with the user's DSC token.

How it works
------------
1. In NyayDwar the user clicks "Digitally Sign". The server keeps the PDF as a
   short-lived signing job and the browser opens
       nyaydwar-sign://sign?server=<NyayDwar address>&job=<id>&token=<one-time token>
2. Windows starts this bridge (the link type is registered by install.bat).
3. The bridge downloads the PDF from the NyayDwar server, shows the
   certificates on the token, asks for the token PIN in its OWN window
   (the PIN never goes to the browser or the server), signs the PDF on this
   computer and sends the signed PDF back to the server.
4. NyayDwar keeps the signed copy and downloads one to the user.

The token is used through its PKCS#11 driver (installed with the token's
software, e.g. WatchData ProxKey "wdpkcs.dll", ePass2003 "eps2003csp11.dll").
The same code runs on Ubuntu / macOS with the Linux / macOS driver.

Administrator: settings are in bridge-config.json (next to this file); the
per-user copy (trusted servers, last certificate used) is kept in
%APPDATA%\\NyayDwarSignBridge\\settings.json.
"""
from __future__ import annotations

import glob
import hashlib
import http.client
import json
import os
import socket
import ssl
import sys
import traceback
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

VERSION = "1.2.0"
APP_TITLE = "NyayDwar Sign Bridge"

# ------------------------------------------------------------------ settings
DEFAULT_CONFIG = {
    "trusted_servers": [],
    # HTTPS servers with a self-signed certificate: "https://host": "SHA-256 fingerprint".
    # The bridge then talks ONLY to a server presenting exactly that certificate.
    "pinned_certificates": {},
    "ask_before_trusting_new_server": True,
    "pkcs11_libraries": [],
    "reason": "Digitally signed on NyayDwar",
    "location": "",
}

WINDOWS_PKCS11 = [
    "wdpkcs.dll",                 # WatchData ProxKey
    "SignatureP11.dll",           # WatchData / older tokens
    "eps2003csp11.dll",           # ePass2003
    "eps2003csp11v2.dll",
    "CryptoIDA_pkcs11.dll",       # mToken / Longmai
    "eTPKCS11.dll",               # SafeNet eToken
    "IDPrimePKCS11.dll",          # Gemalto IDPrime
    "gclib.dll",                  # Gemalto Classic
    "ShuttleCsp11_3003.dll",      # Feitian
    "TrustKeyP11.dll",
    "opensc-pkcs11.dll",
]
LINUX_PKCS11 = [
    "/usr/lib/WatchData/ProxKey/lib/libwdpkcs_SignatureP11.so",
    "/usr/lib/WatchData/ProxKey/lib/libwdpkcs.so",
    "/usr/lib/libwdpkcs.so",
    "/usr/local/lib/libcastle_v2.so.1.0.0",
    "/usr/lib/ePass2003-Linux-x64/x86_64/redist/libcastle.so.1.0.0",
    "/usr/lib/libeTPkcs11.so",
    "/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so",
    "/usr/lib/x86_64-linux-gnu/pkcs11/opensc-pkcs11.so",
]
MAC_PKCS11 = [
    "/usr/local/lib/libwdpkcs.dylib",
    "/usr/local/lib/libwdpkcs_SignatureP11.dylib",
    "/usr/local/lib/libcastle.1.0.0.dylib",
    "/usr/local/lib/libcastle_v2.1.0.0.dylib",
    "/usr/local/lib/libeTPkcs11.dylib",
    "/Library/Frameworks/eToken.framework/Versions/Current/libeToken.dylib",
    "/usr/local/lib/libIDPrimePKCS11.dylib",
    "/Library/OpenSC/lib/opensc-pkcs11.so",
]
# Other driver files are also looked for with these patterns.
LINUX_PKCS11_GLOBS = [
    "/usr/lib/WatchData/*/lib/*.so", "/opt/WatchData/*/lib/*.so", "/usr/lib/*pkcs11*.so*", "/usr/lib/libcastle*.so*",
    "/usr/local/lib/*pkcs11*.so*", "/usr/local/lib/libcastle*.so*", "/usr/lib/x86_64-linux-gnu/*pkcs11*.so",
    "/usr/lib/libeTPkcs11.so", "/usr/lib/libIDPrimePKCS11.so", "/usr/lib/libcryptoid_pkcs11.so",
]
MAC_PKCS11_GLOBS = ["/usr/local/lib/*pkcs11*.dylib", "/usr/local/lib/libwd*.dylib", "/usr/local/lib/libcastle*.dylib",
                    "/Library/Application Support/*/lib*pkcs11*.dylib"]
# never offered as a token driver
SKIP_LIBS = ("p11-kit-proxy", "p11-kit-trust", "libnssckbi", "libsofthsm")


def user_settings_path() -> Path:
    base = os.environ.get("APPDATA") or os.path.join(Path.home(), ".config")
    p = Path(base) / "NyayDwarSignBridge"
    p.mkdir(parents=True, exist_ok=True)
    return p / "settings.json"


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    for path in (HERE / "bridge-config.json", user_settings_path()):
        try:
            cfg.update(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            pass
    return cfg


def save_user_settings(changes: dict):
    p = user_settings_path()
    try:
        cur = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        cur = {}
    cur.update(changes)
    p.write_text(json.dumps(cur, indent=2), encoding="utf-8")


def candidate_libraries(cfg: dict) -> list[str]:
    found = []
    for p in cfg.get("pkcs11_libraries") or []:
        if p and os.path.isfile(p):
            found.append(p)
    if sys.platform.startswith("win"):
        sysroot = os.environ.get("SystemRoot", r"C:\Windows")
        for name in WINDOWS_PKCS11:
            p = os.path.join(sysroot, "System32", name)
            if os.path.isfile(p):
                found.append(p)
    elif sys.platform == "darwin":
        found += [p for p in MAC_PKCS11 if os.path.isfile(p)]
        for g in MAC_PKCS11_GLOBS:
            found += sorted(glob.glob(g))
    else:
        found += [p for p in LINUX_PKCS11 if os.path.isfile(p)]
        for g in LINUX_PKCS11_GLOBS:
            found += sorted(glob.glob(g))
    found = [p for p in found if p in (cfg.get("pkcs11_libraries") or []) or not any(x in os.path.basename(p) for x in SKIP_LIBS)]
    seen, out = set(), []
    for p in found:
        k = os.path.normcase(os.path.abspath(p))
        if k not in seen:
            seen.add(k)
            out.append(p)
    return out


# ------------------------------------------------------------------ token
def list_certificates(libs: list[str], pin: str | None = None):
    """[(lib_path, slot_index, token_label, cert_id(bytes), cert_label, asn1 cert)]"""
    import pkcs11
    from pkcs11 import Attribute, ObjectClass
    from asn1crypto import x509 as asn1x509

    out, errors = [], []
    for path in libs:
        try:
            lib = pkcs11.lib(path)
            for si, slot in enumerate(lib.get_slots(token_present=True)):
                token = slot.get_token()
                try:
                    sess = token.open(user_pin=pin) if pin else token.open()
                except Exception as e:  # some tokens need the PIN before showing certificates
                    if (token.label or "").strip():
                        errors.append(f"{token.label.strip()}: {e}")
                    continue
                with sess:
                    for obj in sess.get_objects({Attribute.CLASS: ObjectClass.CERTIFICATE}):
                        try:
                            der = obj[Attribute.VALUE]
                            cert = asn1x509.Certificate.load(der)
                            try:
                                cid = obj[Attribute.ID]
                            except Exception:
                                cid = b""
                            try:
                                clabel = obj[Attribute.LABEL]
                            except Exception:
                                clabel = ""
                            out.append((path, si, token.label.strip(), cid, clabel, cert))
                        except Exception as e:
                            errors.append(str(e))
        except Exception as e:
            errors.append(f"{os.path.basename(path)}: {e}")
    return out, errors


def cert_is_for_signing(cert) -> bool:
    try:
        ku = cert.key_usage_value
        if ku is None:
            return True
        names = set(ku.native)
        return bool(names & {"digital_signature", "non_repudiation"})
    except Exception:
        return True


def cert_text(cert) -> str:
    try:
        cn = cert.subject.native.get("common_name", "") or cert.subject.human_friendly
    except Exception:
        cn = "Certificate"
    try:
        issuer = cert.issuer.native.get("common_name", "") or cert.issuer.native.get("organization_name", "")
    except Exception:
        issuer = ""
    try:
        till = cert["tbs_certificate"]["validity"]["not_after"].native.strftime("%d-%m-%Y")
    except Exception:
        till = ""
    return f"{cn}  —  {issuer}  (valid till {till})"


def sign_many_with_token(entry, pin: str, docs, keywords, reason, location, signer_name, progress=None, label=""):
    """Opens the token ONCE (one PIN entry) and signs every document.
    docs: list of (get_pdf(), put_signed(bytes, placed), put_failed(message)).
    Returns (signed_count, failed_count). A wrong PIN raises before anything is signed."""
    import pkcs11
    from pyhanko.sign.pkcs11 import PKCS11Signer
    import signcore

    path, si, _tlabel, cid, clabel, _cert = entry
    lib = pkcs11.lib(path)
    slot = lib.get_slots(token_present=True)[si]
    ok = failed = 0
    with slot.get_token().open(user_pin=pin) as sess:
        kwargs = {"cert_id": cid, "key_id": cid} if cid else {"cert_label": clabel, "key_label": clabel}
        signer = PKCS11Signer(sess, **kwargs)
        for n, (get_pdf, put_signed, put_failed) in enumerate(docs, start=1):
            if progress:
                progress(n, len(docs))
            try:
                signed, placed = signcore.sign_pdf(get_pdf(), signer, keywords, reason=reason, location=location,
                                                   signer_name=signer_name, label=label)
                put_signed(signed, placed)
                ok += 1
            except Exception as e:  # one bad document does not stop the others
                failed += 1
                try:
                    put_failed(str(e) or e.__class__.__name__)
                except Exception:
                    pass
    return ok, failed


def sign_with_token(pdf: bytes, entry, pin: str, keywords, reason, location, signer_name):
    """Signs one PDF and returns (signed bytes, placement)."""
    out = {}
    def _put(b, placed):
        out["r"] = (b, placed)
    def _fail(msg):
        raise RuntimeError(msg)
    sign_many_with_token(entry, pin, [(lambda: pdf, _put, _fail)], keywords, reason, location, signer_name)
    if "r" not in out:
        raise RuntimeError("The document could not be signed.")
    return out["r"]


# ------------------------------------------------------------------ server
# Every request goes only to the NyayDwar server named in the signing link.
# HTTPS is verified either by the normal certificate authorities or, for the
# court's own (self-signed) certificate, by its pinned SHA-256 fingerprint.
class CertificateNotTrusted(Exception):
    def __init__(self, origin, fingerprint):
        super().__init__(f"The certificate of {origin} is not trusted.")
        self.origin, self.fingerprint = origin, fingerprint


def _origin(url: str) -> str:
    u = urllib.parse.urlparse(url)
    return f"{u.scheme}://{u.netloc}".lower()


def peer_fingerprint(url: str) -> str:
    u = urllib.parse.urlparse(url)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with socket.create_connection((u.hostname, u.port or 443), timeout=20) as raw:
        with ctx.wrap_socket(raw, server_hostname=u.hostname) as tls:
            return hashlib.sha256(tls.getpeercert(binary_form=True)).hexdigest().upper()


def _request(method: str, url: str, body: bytes | None = None, headers: dict | None = None, timeout=120) -> bytes:
    u = urllib.parse.urlparse(url)
    path = u.path + ("?" + u.query if u.query else "")
    if u.scheme == "http":
        conn = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=timeout)
    else:
        pinned = {k.rstrip("/").lower(): v.replace(":", "").upper() for k, v in (load_config().get("pinned_certificates") or {}).items()}
        pin = pinned.get(_origin(url))
        if pin:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE   # verified below by the exact fingerprint instead
        else:
            ctx = ssl.create_default_context()
        conn = http.client.HTTPSConnection(u.hostname, u.port or 443, timeout=timeout, context=ctx)
        try:
            conn.connect()
        except ssl.SSLCertVerificationError:
            raise CertificateNotTrusted(_origin(url), peer_fingerprint(url))
        if pin:
            got = hashlib.sha256(conn.sock.getpeercert(binary_form=True)).hexdigest().upper()
            if got != pin:
                conn.close()
                raise ValueError("SECURITY WARNING: the NyayDwar server's certificate has changed. Signing was stopped. "
                                 "Please contact the Administrator before signing again.")
    conn.request(method, path, body=body, headers=headers or {})
    r = conn.getresponse()
    data = r.read()
    conn.close()
    if r.status >= 400:
        try:
            detail = json.loads(data.decode("utf-8")).get("detail")
        except Exception:
            detail = None
        raise ValueError(detail or f"The server answered {r.status}.")
    return data


def http_get(url: str) -> bytes:
    return _request("GET", url, timeout=60)


def http_post_multipart(url: str, fields: dict, file_field: str, filename: str, data: bytes) -> bytes:
    boundary = "----NyayDwar" + uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode("utf-8"))
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\n"
                 f"Content-Type: application/pdf\r\n\r\n".encode("utf-8") + data + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(parts)
    return _request("POST", url, body, {"Content-Type": f"multipart/form-data; boundary={boundary}"})


def http_post_json(url: str, payload: dict):
    try:
        return _request("POST", url, json.dumps(payload).encode("utf-8"), {"Content-Type": "application/json"}, timeout=30)
    except Exception:
        return b""


def parse_link(link: str):
    u = urllib.parse.urlparse(link.strip().strip('"'))
    q = urllib.parse.parse_qs(u.query)
    server = (q.get("server") or [""])[0].rstrip("/")
    job = (q.get("job") or [""])[0]
    token = (q.get("token") or [""])[0]
    if not (server.startswith("http://") or server.startswith("https://")) or not job or not token:
        raise ValueError("This signing link is incomplete. Please click Digitally Sign again in NyayDwar.")
    return server, job, token


# ------------------------------------------------------------------ UI
def set_icon(root):
    try:
        if sys.platform.startswith("win"):
            root.iconbitmap(default=str(HERE / "nyaydwar.ico"))
        else:
            import tkinter as tk
            root._nd_icon = tk.PhotoImage(file=str(HERE / "nyaydwar.png"))
            root.iconphoto(True, root._nd_icon)
    except Exception:
        pass


def run_signing(link: str):
    import tkinter as tk
    from tkinter import messagebox, ttk

    cfg = load_config()
    root = tk.Tk()
    root.title(APP_TITLE)
    root.attributes("-topmost", True)
    root.resizable(False, False)
    set_icon(root)

    GREEN, CREAM = "#173f35", "#fffdf8"
    UI_FONT = "Segoe UI" if sys.platform.startswith("win") else ("Helvetica Neue" if sys.platform == "darwin" else "DejaVu Sans")
    root.configure(bg=CREAM)
    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except Exception:
        pass
    style.configure("TLabel", background=CREAM)
    style.configure("Head.TLabel", background=GREEN, foreground="white", font=(UI_FONT, 13, "bold"), padding=10)
    style.configure("Primary.TButton", font=(UI_FONT, 10, "bold"))

    def fail(msg, server=None, job=None, token=None):
        if server and job:
            http_post_json(f"{server}/api/sign-jobs/{job}/fail?token={urllib.parse.quote(token)}", {"message": msg[:500]})
        root.attributes("-topmost", True)
        messagebox.showerror(APP_TITLE, msg, parent=root)
        root.destroy()

    try:
        server, job, token = parse_link(link)
    except Exception as e:
        fail(str(e))
        return

    # Only sign for NyayDwar servers the user trusts.
    trusted = [s.rstrip("/") for s in cfg.get("trusted_servers") or []]
    if server not in trusted:
        if not cfg.get("ask_before_trusting_new_server", True):
            fail(f"The server {server} is not in the trusted list of the NyayDwar Sign Bridge.", server, job, token)
            return
        root.withdraw()
        ok = messagebox.askyesno(APP_TITLE, f"Allow the NyayDwar server\n\n{server}\n\nto send documents to this computer for your digital signature?\n\n"
                                            "Choose Yes only if this is your court's NyayDwar address.", parent=root)
        root.deiconify()
        if not ok:
            fail("Signing was cancelled.", server, job, token)
            return
        save_user_settings({"trusted_servers": trusted + [server]})

    q = f"?token={urllib.parse.quote(token)}"
    try:
        try:
            http_get(f"{server}/api/courts")
        except CertificateNotTrusted as ce:
            fp = ":".join(ce.fingerprint[i:i + 2] for i in range(0, len(ce.fingerprint), 2))
            ok = messagebox.askyesno(APP_TITLE, f"{server} uses its own (self-signed) security certificate.\n\nCertificate fingerprint (SHA-256):\n{fp}\n\n"
                                                "Trust it ONLY if the Administrator has confirmed this fingerprint. From now on the bridge will "
                                                "refuse any other certificate for this address.", parent=root)
            if not ok:
                fail("Signing was cancelled: the server certificate was not trusted.", server, job, token)
                return
            pins = dict(load_config().get("pinned_certificates") or {})
            pins[ce.origin] = ce.fingerprint
            save_user_settings({"pinned_certificates": pins})
        except Exception:
            pass
        info = json.loads(http_get(f"{server}/api/sign-jobs/{job}/info{q}").decode("utf-8"))
        items = info.get("items") or [{"id": "", "title": info.get("title"), "filename": info.get("filename")}]
    except Exception as e:
        fail(f"Could not get the document from NyayDwar ({server}).\n\n{e}")
        return

    libs = candidate_libraries(cfg)

    ttk.Label(root, text="NyayDwar — Digital Signature", style="Head.TLabel").grid(row=0, column=0, columnspan=2, sticky="ew")
    frm = ttk.Frame(root, padding=16)
    frm.grid(row=1, column=0, columnspan=2, sticky="nsew")
    frm.configure(style="TFrame")
    style.configure("TFrame", background=CREAM)

    many = len(items) > 1
    ttk.Label(frm, text="Documents:" if many else "Document:", font=(UI_FONT, 10, "bold")).grid(row=0, column=0, sticky="nw", pady=3)
    names = [it.get("title") or it.get("filename") or "PDF" for it in items]
    doc_text = (f"{len(items)} documents — one PIN signs all of them:\n" + "\n".join(" • " + n for n in names[:8])
                + (f"\n … and {len(names) - 8} more" if len(names) > 8 else "")) if many else names[0]
    ttk.Label(frm, text=doc_text, wraplength=420, justify="left").grid(row=0, column=1, sticky="w", pady=3)
    ttk.Label(frm, text="Signer:", font=(UI_FONT, 10, "bold")).grid(row=1, column=0, sticky="w", pady=3)
    ttk.Label(frm, text=info.get("signer_name") or "", wraplength=420).grid(row=1, column=1, sticky="w", pady=3)

    ttk.Label(frm, text="Certificate:", font=(UI_FONT, 10, "bold")).grid(row=2, column=0, sticky="w", pady=(10, 3))
    cert_var = tk.StringVar()
    cert_box = ttk.Combobox(frm, textvariable=cert_var, state="readonly", width=64)
    cert_box.grid(row=2, column=1, sticky="w", pady=(10, 3))
    ttk.Label(frm, text="Token PIN:", font=(UI_FONT, 10, "bold")).grid(row=3, column=0, sticky="w", pady=3)
    pin_var = tk.StringVar()
    pin_entry = ttk.Entry(frm, textvariable=pin_var, show="•", width=24)
    pin_entry.grid(row=3, column=1, sticky="w", pady=3)
    status = ttk.Label(frm, text="", foreground="#6d7772", wraplength=480)
    status.grid(row=4, column=0, columnspan=2, sticky="w", pady=(8, 0))
    ttk.Label(frm, text="Your PIN is used only on this computer to open the token. It is never sent to NyayDwar.",
              foreground="#6d7772", wraplength=480, font=(UI_FONT, 8)).grid(row=5, column=0, columnspan=2, sticky="w", pady=(6, 0))

    entries = []

    def refresh(pin=None):
        nonlocal entries
        if not libs:
            status.configure(text="No DSC token driver was found on this computer. Please install the software of your "
                                  "token (for example WD ProxKey / ePass2003) and insert the token.", foreground="#a34037")
            return
        status.configure(text="Reading the certificates on the token…")
        root.update()
        found, errs = list_certificates(libs, pin)
        entries = [e for e in found if cert_is_for_signing(e[5])] or found
        cert_box["values"] = [cert_text(e[5]) for e in entries]
        if entries:
            last = (load_config().get("last_certificate") or "")
            pick = next((i for i, e in enumerate(entries) if e[3].hex() == last), 0)
            cert_box.current(pick)
            status.configure(text=f"{len(entries)} certificate(s) found. Enter the token PIN and click Sign.", foreground="#246452")
        else:
            msg = "No certificate is visible yet. Insert the token, enter the PIN and click Sign (some tokens show certificates only after the PIN)."
            if errs:
                msg += "\n" + "; ".join(errs[:2])
            status.configure(text=msg, foreground="#a34037")

    def do_sign():
        pin = pin_var.get()
        if not pin:
            status.configure(text="Please enter the token PIN.", foreground="#a34037")
            return
        nonlocal entries
        if not entries:
            refresh(pin)
            if not entries:
                return
        entry = entries[cert_box.current() if cert_box.current() >= 0 else 0]
        sign_btn.configure(state="disabled")
        status.configure(text="Opening the token… please wait.", foreground="#6d7772")
        root.update()
        cert = entry[5]
        cert_fields = {"cert_subject": cert.subject.human_friendly, "cert_issuer": cert.issuer.human_friendly,
                       "cert_serial": str(cert.serial_number), "bridge_version": VERSION}

        def make_doc(it):
            iq = q + (f"&item={urllib.parse.quote(it['id'])}" if it.get("id") else "")
            def get_pdf():
                return http_get(f"{server}/api/sign-jobs/{job}/pdf{iq}")
            def put_signed(signed, placed):
                http_post_multipart(f"{server}/api/sign-jobs/{job}/complete{iq}", dict(cert_fields, placed_at=placed.get("placed_at", "")),
                                    "file", it.get("filename") or "signed.pdf", signed)
            def put_failed(msg):
                http_post_json(f"{server}/api/sign-jobs/{job}/fail{iq}", {"message": f"Could not sign: {msg}"[:500]})
            return get_pdf, put_signed, put_failed

        def progress(n, total):
            status.configure(text=f"Signing document {n} of {total}… please wait." if total > 1 else "Signing… please wait.")
            root.update()

        try:
            ok, bad = sign_many_with_token(entry, pin, [make_doc(it) for it in items], info.get("keywords") or [],
                                           info.get("reason") or cfg.get("reason"), info.get("location") or cfg.get("location") or "",
                                           info.get("signer_name") or "", progress, info.get("stamp_label") or "")
        except Exception as e:
            pin_var.set("")   # the PIN is never kept, logged or sent anywhere
            pin = None
            sign_btn.configure(state="normal")
            text = str(e) or e.__class__.__name__
            if "PinIncorrect" in e.__class__.__name__ or "PIN" in text.upper():
                text = "The token PIN is not correct. Please try again (the token may lock after several wrong PINs)."
            status.configure(text=f"Could not sign: {text}", foreground="#a34037")
            return
        pin_var.set("")
        pin = None
        save_user_settings({"last_certificate": entry[3].hex()})
        if bad and not ok:
            status.configure(text="The documents could not be signed. See NyayDwar for the reason.", foreground="#a34037")
            root.after(4000, root.destroy)
            return
        done = f"{ok} document(s) signed" + (f", {bad} could not be signed" if bad else "") if many else "Signed successfully"
        status.configure(text=f"{done}. You can return to NyayDwar — the signed copies are saved there and downloaded.",
                         foreground="#246452")
        root.after(2500, root.destroy)

    def cancel():
        http_post_json(f"{server}/api/sign-jobs/{job}/fail{q}", {"message": "Signing was cancelled by the user."})
        root.destroy()

    btns = ttk.Frame(frm)
    btns.grid(row=6, column=0, columnspan=2, sticky="e", pady=(14, 0))
    ttk.Button(btns, text="Cancel", command=cancel).pack(side="right", padx=(8, 0))
    sign_btn = ttk.Button(btns, text="Sign", style="Primary.TButton", command=do_sign)
    sign_btn.pack(side="right")
    pin_entry.bind("<Return>", lambda _e: do_sign())
    root.protocol("WM_DELETE_WINDOW", cancel)

    root.after(150, lambda: (refresh(), pin_entry.focus_force()))
    root.mainloop()


def run_status_window():
    """Started without a signing link: show what the bridge can see."""
    import tkinter as tk
    from tkinter import ttk

    cfg = load_config()
    libs = candidate_libraries(cfg)
    root = tk.Tk()
    root.title(APP_TITLE)
    set_icon(root)
    root.configure(bg="#fffdf8")
    text = (f"{APP_TITLE} {VERSION} is installed.\n\n"
            "Use it from NyayDwar: open a PDF and click \"Digitally Sign\".\n\n"
            "Token drivers found on this computer:\n" +
            ("\n".join(" • " + p for p in libs) if libs else " (none found — install your DSC token software)"))
    ttk.Label(root, text=text, padding=18, justify="left", background="#fffdf8").pack()
    out = tk.Text(root, height=8, width=80)
    out.pack(padx=18)

    def test():
        out.delete("1.0", "end")
        found, errs = list_certificates(libs)
        for e in found:
            out.insert("end", f"{os.path.basename(e[0])} / {e[2]}: {cert_text(e[5])}\n")
        for er in errs:
            out.insert("end", f"Note: {er}\n")
        if not found and not errs:
            out.insert("end", "No token / certificate found. Insert the token and try again.\n")

    ttk.Button(root, text="Check token", command=test).pack(pady=10)
    root.mainloop()


def main():
    link = next((a for a in sys.argv[1:] if a.lower().strip('"').startswith("nyaydwar-sign:")), "")
    try:
        if link:
            run_signing(link)
        else:
            run_status_window()
    except Exception:
        log = user_settings_path().with_name("bridge-error.log")
        log.write_text(traceback.format_exc(), encoding="utf-8")
        raise


if __name__ == "__main__":
    main()
