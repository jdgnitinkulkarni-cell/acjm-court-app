import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getUser, clearAuth } from "../lib/api";
import { TopBar } from "./AdminDashboard";
import { Avatar, displayNameFor, roleLabelFor, notifyPhotoChanged, ROLE_LABELS } from "./SideNav";
import DigitalSignatureCard from "./DigitalSignatureCard";

// My Profile — photograph (shown before the welcome message) and details.
export default function Profile() {
  const user = getUser();
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const navigate = useNavigate();
  const name = displayNameFor(user);
  const [form, setForm] = useState({ name: "", mobile: "", email: "", current_password: "" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [fmsg, setFmsg] = useState({ ok: "", err: "" });
  const [pmsg, setPmsg] = useState({ ok: "", err: "" });
  const isPublic = ["advocate", "litigant"].includes(user?.role);

  const load = () => api.get("/profile").then(({ data }) => {
    setInfo(data);
    setForm({ name: data.name || "", mobile: data.mobile || "", email: data.email || "", current_password: "" });
  }).catch(() => setInfo({}));
  useEffect(() => { load(); }, []);

  const idChanged = isPublic && info && ((form.mobile || "").trim() !== (info.mobile || "") || (form.email || "").trim().toLowerCase() !== (info.email || "").toLowerCase());

  const relogin = (text) => {
    try { sessionStorage.setItem("acjm_relogin_msg", text); } catch (e) { /* ignore */ }
    clearAuth();
    try { localStorage.removeItem("acjm_public_mode"); } catch (e) { /* ignore */ }
    navigate("/");
  };

  const saveDetails = async (e) => {
    e.preventDefault();
    setFmsg({ ok: "", err: "" });
    if (idChanged && !form.current_password) { setFmsg({ ok: "", err: "Your mobile number / email address is your User ID. Enter your current password to change it." }); return; }
    try {
      const { data } = await api.put("/profile", form);
      if (data.relogin) { relogin("Your User ID was changed. Please sign in again with the new mobile number / email address."); return; }
      const u = getUser() || {};
      localStorage.setItem("user", JSON.stringify({ ...u, name: data.name, mobile: data.mobile, email: data.email }));
      setFmsg({ ok: "Details saved.", err: "" });
      load();
    } catch (er) { setFmsg({ ok: "", err: er.response?.data?.detail || "Could not save the details." }); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPmsg({ ok: "", err: "" });
    if (!pw.current || !pw.next) { setPmsg({ ok: "", err: "Please fill in all the password fields." }); return; }
    if (pw.next.length < 6) { setPmsg({ ok: "", err: "The new password must be at least 6 characters." }); return; }
    if (pw.next !== pw.confirm) { setPmsg({ ok: "", err: "New password and Confirm password do not match." }); return; }
    try {
      await api.post("/profile/password", { current_password: pw.current, new_password: pw.next });
      relogin("Your password was changed. Please sign in again with the new password.");
    } catch (er) { setPmsg({ ok: "", err: er.response?.data?.detail || "Could not change the password." }); }
  };

  const upload = async (file) => {
    if (!file) return;
    setErr(""); setMsg("");
    if (!/^image\//.test(file.type)) { setErr("Please choose a photograph (JPG or PNG)."); return; }
    if (file.size > 5 * 1024 * 1024) { setErr("The photograph must be smaller than 5 MB."); return; }
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    try {
      await api.post("/profile/photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      notifyPhotoChanged();
      setMsg("Photograph saved. It now appears on your home screen.");
      load();
    } catch (e) { setErr(e.response?.data?.detail || "Could not save the photograph."); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm("Remove your photograph?")) return;
    setErr(""); setMsg("");
    try { await api.delete("/profile/photo"); notifyPhotoChanged(); setMsg("Photograph removed."); load(); }
    catch (e) { setErr("Could not remove the photograph."); }
  };

  const rows = [
    ["Name", name],
    ["Role", ROLE_LABELS[user?.role] || ""],
    ["Designation", roleLabelFor(user)],
    ["Login ID", info?.login_id],
    ["Mobile", info?.mobile],
    ["Email", info?.email],
  ].filter(([, v]) => v);

  return (
    <div className="app-shell">
      <TopBar title="My Profile" />
      <div className="page" style={{ width: "92%", maxWidth: 900, boxSizing: "border-box" }} data-testid="profile-page">
        <h1>My Profile</h1>
        <div className="profile-card">
          <div className="profile-photo-col">
            <Avatar name={name} size={150} className="avatar big" />
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} data-testid="profile-photo-input" />
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="profile-photo-upload">
              {busy ? "Saving..." : info?.has_photo ? "Change Photograph" : "Upload Photograph"}
            </button>
            {info?.has_photo && <button className="btn btn-secondary" onClick={remove} disabled={busy}>Remove</button>}
            <p className="hint" style={{ textAlign: "center", margin: 0 }}>JPG or PNG, up to 5 MB. It is cropped to a square.</p>
          </div>
          <div className="profile-details">
            {rows.map(([k, v]) => (
              <div key={k} className="profile-row"><span>{k}</span><strong>{v}</strong></div>
            ))}
          </div>
        </div>
        {msg && <p className="success">{msg}</p>}
        {err && <p className="error">{err}</p>}

        <div className="profile-forms">
          <form className="card-block" onSubmit={saveDetails} data-testid="profile-details-form">
            <h3>Edit Details</h3>
            <div className="form-grid" style={{ gridTemplateColumns: "150px minmax(0, 1fr)" }}>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="profile-name" />
              <label>Mobile Number</label>
              <input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="10-digit mobile number" data-testid="profile-mobile" />
              <label>Email Address</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="profile-email" />
              {idChanged && (<>
                <label>Current Password</label>
                <input type="password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} placeholder="Needed to change your User ID" data-testid="profile-current-password" />
              </>)}
            </div>
            {isPublic && <p className="hint">Your mobile number and email address are your User ID for signing in. If you change them you will be asked to sign in again.</p>}
            {fmsg.err && <p className="error">{fmsg.err}</p>}
            {fmsg.ok && <p className="success">{fmsg.ok}</p>}
            <div className="form-actions" style={{ justifyContent: "flex-end" }}><button className="btn btn-primary" type="submit" data-testid="profile-save">Save Details</button></div>
          </form>

          <form className="card-block" onSubmit={changePassword} data-testid="profile-password-form">
            <h3>Change Password</h3>
            <div className="form-grid" style={{ gridTemplateColumns: "150px minmax(0, 1fr)" }}>
              <label>Current Password</label>
              <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" data-testid="pw-current" />
              <label>New Password</label>
              <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" placeholder="At least 6 characters" data-testid="pw-new" />
              <label>Confirm Password</label>
              <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" data-testid="pw-confirm" />
            </div>
            <p className="hint">After the password is changed you will be asked to sign in again.</p>
            {pmsg.err && <p className="error">{pmsg.err}</p>}
            <div className="form-actions" style={{ justifyContent: "flex-end" }}><button className="btn btn-primary" type="submit" data-testid="pw-save">Change Password</button></div>
          </form>
        </div>

        <DigitalSignatureCard />
      </div>
    </div>
  );
}
