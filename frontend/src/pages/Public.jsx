import React, { useEffect, useState } from "react";
import { useSort, SortTh } from "../lib/sortable";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import api, { getUser, setAuth, clearAuth } from "../lib/api";
import { TopBar } from "./AdminDashboard";

// Advocate & Litigant access.
// - Advocates must register (approved by the Administrator) and log in with
//   their mobile number or email address + password.
// - Litigants may continue without logging in; registering is optional and is
//   approved by the staff of the court the litigant selects. Registered and
//   approved advocates / litigants get the Message Center.

export const LITIGANT_GUEST_KEY = "acjm_public_mode";

export function isLitigantGuest() {
  try { return localStorage.getItem(LITIGANT_GUEST_KEY) === "litigant-guest"; } catch (e) { return false; }
}
function setLitigantGuest(on) {
  try {
    if (on) localStorage.setItem(LITIGANT_GUEST_KEY, "litigant-guest");
    else localStorage.removeItem(LITIGANT_GUEST_KEY);
  } catch (e) { /* ignore */ }
}

// Guards the existing Advocate / Litigant service pages. Court staff, judges
// and the admin keep their existing access to these pages.
export function PublicGate({ children }) {
  const location = useLocation();
  const user = getUser();
  const allowed = ["advocate", "litigant", "staff", "admin", "judge"].includes(user?.role) || isLitigantGuest();
  if (!allowed) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return children;
}

const box = { width: "92%", maxWidth: 640, boxSizing: "border-box" };

function PublicLogin({ role }) {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const label = role === "advocate" ? "Advocate" : "Litigant";

  const submit = async () => {
    setErr("");
    if (!login.trim() || !password) { setErr("Please enter your User ID (mobile number or email) and password."); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/public-login", { login: login.trim(), password, role });
      setAuth(data.token, data.user);
      setLitigantGuest(false);
      navigate("/advocate");
    } catch (e) {
      setErr(e.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="app-shell">
      <TopBar title={`${label} Login`} />
      <div className="page" style={box} data-testid={`${role}-login-page`}>
        <h1>{label} Login</h1>
        <div className="form-grid" style={{ gridTemplateColumns: "170px minmax(0, 1fr)" }}>
          <label>User ID</label>
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Mobile number or email address" data-testid={`${role}-login-id`} />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} data-testid={`${role}-login-password`} />
        </div>
        {err && <p className="error">{err}</p>}
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => navigate(role === "advocate" ? "/" : "/litigant")}>Back</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading} data-testid={`${role}-login-submit`}>Login</button>
        </div>
        <p className="hint" style={{ marginTop: 18 }}>
          Not registered yet?{" "}
          <button className="btn btn-outline" style={{ padding: "4px 12px" }} onClick={() => navigate(role === "advocate" ? "/advocate/register" : "/litigant/register")} data-testid={`${role}-go-register`}>
            Register as {label}
          </button>
        </p>
        <p className="hint">Password reset through a link on your mobile / email will be available once the application goes live. Until then, please contact the court.</p>
      </div>
    </div>
  );
}

export function AdvocateLogin() { return <PublicLogin role="advocate" />; }
export function LitigantLogin() { return <PublicLogin role="litigant" />; }

export function AdvocateRegister() {
  const navigate = useNavigate();
  const [f, setF] = useState({ name: "", enrollment_no: "", mobile: "", email: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setErr("");
    if (!f.name.trim() || !f.enrollment_no.trim() || !f.mobile.trim() || !f.email.trim() || !f.password) { setErr("All fields are required."); return; }
    if (f.password !== f.confirm) { setErr("Password and Confirm Password do not match."); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/advocate-register", { name: f.name, enrollment_no: f.enrollment_no, mobile: f.mobile, email: f.email, password: f.password });
      setDone(data.message);
    } catch (e) {
      setErr(e.response?.data?.detail || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="app-shell">
      <TopBar title="Advocate Registration" />
      <div className="page" style={box} data-testid="advocate-register-page">
        <h1>Advocate Registration</h1>
        {done ? (
          <>
            <p style={{ background: "#dcfce7", border: "1px solid #86efac", padding: 12, borderRadius: 6 }}>{done}</p>
            <p className="hint">After approval, log in with your mobile number or email address as User ID and the password you chose.</p>
            <div className="form-actions"><button className="btn btn-primary" onClick={() => navigate("/advocate/login")}>Go to Login</button></div>
          </>
        ) : (
          <>
            <div className="form-grid" style={{ gridTemplateColumns: "210px minmax(0, 1fr)" }}>
              <label>Name (as per Enrollment)</label>
              <input value={f.name} onChange={(e) => set("name", e.target.value)} data-testid="adv-reg-name" />
              <label>Enrollment Number</label>
              <input value={f.enrollment_no} onChange={(e) => set("enrollment_no", e.target.value)} placeholder="e.g. G/1234/2015" data-testid="adv-reg-enrollment" />
              <label>Mobile Number</label>
              <input value={f.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="10-digit mobile number" data-testid="adv-reg-mobile" />
              <label>Email Address</label>
              <input value={f.email} onChange={(e) => set("email", e.target.value)} data-testid="adv-reg-email" />
              <label>Password</label>
              <input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 6 characters" data-testid="adv-reg-password" />
              <label>Confirm Password</label>
              <input type="password" value={f.confirm} onChange={(e) => set("confirm", e.target.value)} data-testid="adv-reg-confirm" />
            </div>
            <p className="hint">Your request will be sent to the Administrator. You can log in after it is approved, using your mobile number or email address as User ID.</p>
            {err && <p className="error">{err}</p>}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => navigate("/advocate/login")}>Back</button>
              <button className="btn btn-primary" onClick={submit} disabled={loading} data-testid="adv-reg-submit">Submit</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function LitigantRegister() {
  const navigate = useNavigate();
  const [courts, setCourts] = useState([]);
  const [f, setF] = useState({ name: "", mobile: "", email: "", password: "", confirm: "", court_id: "" });
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => { api.get("/courts").then(({ data }) => setCourts(Array.isArray(data) ? data : [])).catch(() => setCourts([])); }, []);

  const submit = async () => {
    setErr("");
    if (!f.name.trim() || !f.password || !f.court_id) { setErr("Name, Court and Password are required."); return; }
    if (!f.mobile.trim() && !f.email.trim()) { setErr("Please enter your mobile number or email address — it will be your User ID."); return; }
    if (f.password !== f.confirm) { setErr("Password and Confirm Password do not match."); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/litigant-register", { name: f.name, mobile: f.mobile, email: f.email, password: f.password, court_id: f.court_id });
      setDone(data.message);
    } catch (e) {
      setErr(e.response?.data?.detail || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="app-shell">
      <TopBar title="Litigant Registration" />
      <div className="page" style={box} data-testid="litigant-register-page">
        <h1>Litigant Registration</h1>
        {done ? (
          <>
            <p style={{ background: "#dcfce7", border: "1px solid #86efac", padding: 12, borderRadius: 6 }}>{done}</p>
            <div className="form-actions"><button className="btn btn-primary" onClick={() => navigate("/litigant/login")}>Go to Login</button></div>
          </>
        ) : (
          <>
            <div className="form-grid" style={{ gridTemplateColumns: "210px minmax(0, 1fr)" }}>
              <label>Name</label>
              <input value={f.name} onChange={(e) => set("name", e.target.value)} data-testid="lit-reg-name" />
              <label>Court of your case</label>
              <select value={f.court_id} onChange={(e) => set("court_id", e.target.value)} data-testid="lit-reg-court">
                <option value="">-- select the court --</option>
                {courts.map((c) => <option key={c.id} value={c.id}>{c.english?.court_name}</option>)}
              </select>
              <label>Mobile Number</label>
              <input value={f.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="10-digit mobile number" data-testid="lit-reg-mobile" />
              <label>Email Address</label>
              <input value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="Mobile or email — at least one" data-testid="lit-reg-email" />
              <label>Password</label>
              <input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 6 characters" data-testid="lit-reg-password" />
              <label>Confirm Password</label>
              <input type="password" value={f.confirm} onChange={(e) => set("confirm", e.target.value)} data-testid="lit-reg-confirm" />
            </div>
            <p className="hint">Your request will be sent to the staff of the selected court. After approval you can log in and use the Message Center.</p>
            {err && <p className="error">{err}</p>}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => navigate("/litigant")}>Back</button>
              <button className="btn btn-primary" onClick={submit} disabled={loading} data-testid="lit-reg-submit">Submit</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function LitigantEntry() {
  const navigate = useNavigate();
  const user = getUser();
  return (
    <div className="app-shell">
      <TopBar title="Litigant" />
      <div className="page" style={{ width: "92%", maxWidth: 900, boxSizing: "border-box" }} data-testid="litigant-entry">
        <h1>Litigant</h1>
        <p className="hint">You can use the services directly. Registering (optional) gives you the Message Center, through which the court can send you orders and processes.</p>
        <div className="dashboard-grid" style={{ marginTop: 16 }}>
          <div className="tile green" data-testid="litigant-continue" onClick={() => {
            if (user?.role === "litigant") { navigate("/advocate"); return; }
            if (user && ["advocate"].includes(user.role)) clearAuth();
            setLitigantGuest(true);
            navigate("/advocate");
          }}>Continue without Login</div>
          <div className="tile blue" data-testid="litigant-login" onClick={() => navigate("/litigant/login")}>Login (Registered Litigant)</div>
          <div className="tile orange" data-testid="litigant-register" onClick={() => navigate("/litigant/register")}>Register (Optional)</div>
        </div>
      </div>
    </div>
  );
}

export function MessageCenter() {
  const navigate = useNavigate();
  const user = getUser();
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!["advocate", "litigant"].includes(user?.role)) { setLoading(false); return; }
    api.get("/messages/inbox").then(({ data }) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setErr(e.response?.data?.detail || "Could not load messages."))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-shell">
      <TopBar title="Message Center" />
      <div className="page" style={{ width: "92%", maxWidth: 1100, boxSizing: "border-box" }} data-testid="message-center">
        <h1>Message Center</h1>
        {!["advocate", "litigant"].includes(user?.role) ? (
          <>
            <p className="hint">The Message Center is available to registered and approved Advocates and Litigants.</p>
            <div className="form-actions"><button className="btn btn-primary" onClick={() => navigate("/litigant")}>Login / Register</button></div>
          </>
        ) : loading ? <p>Loading...</p> : err ? <p className="error">{err}</p> : items.length === 0 ? (
          <p className="hint">No messages yet. Orders and processes sent to you by the court will appear here.</p>
        ) : (
          <table className="entries">
            <thead><tr><th>Date</th><th>From</th><th>Subject</th><th>Message</th></tr></thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}><td>{(m.created_at || "").slice(0, 10)}</td><td>{m.from_label || "Court"}</td><td>{m.subject}</td><td>{m.body}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Approval list — Admin sees advocates and litigants; court staff see the
// litigants who selected their court.
export function Registrations() {
  const user = getUser();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [roleFilter, setRoleFilter] = useState("all");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => api.get("/registrations").then(({ data }) => setRows(Array.isArray(data) ? data : []))
    .catch((e) => setMsg(e.response?.data?.detail || "Could not load registrations.")).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const decide = async (r, decision) => {
    let reason = "";
    if (decision === "reject") {
      reason = window.prompt(`Reason for not approving ${r.name} (optional):`, "") ?? null;
      if (reason === null) return;
    }
    try {
      await api.post(`/registrations/${r.id}/${decision}`, { reason });
      setMsg(`${r.name} ${decision === "approve" ? "approved" : "not approved"}.`);
      load();
    } catch (e) {
      setMsg(e.response?.data?.detail || "Could not save the decision.");
    }
  };

  const shown = rows.filter((r) => (filter === "all" || r.status === filter) && (roleFilter === "all" || r.role === roleFilter));
  const srt = useSort(shown, { date: (r) => r.created_at });
  const isAdmin = user?.role === "admin";
  return (
    <div className="app-shell">
      <TopBar title={isAdmin ? "Advocate / Litigant Registrations" : "Litigant Registrations"} />
      <div className="page" style={{ width: "92%", maxWidth: 1400, boxSizing: "border-box" }} data-testid="registrations-page">
        <h1>{isAdmin ? "Advocate / Litigant Registrations" : "Litigant Registrations"}</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {["pending", "approved", "rejected", "all"].map((s) => (
            <button key={s} className={`btn ${filter === s ? "btn-primary" : "btn-outline"}`} onClick={() => setFilter(s)}>
              {s === "rejected" ? "Not approved" : s[0].toUpperCase() + s.slice(1)} ({rows.filter((r) => s === "all" || r.status === s).length})
            </button>
          ))}
          {isAdmin && (
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4 }}>
              <option value="all">Advocates &amp; Litigants</option>
              <option value="advocate">Advocates</option>
              <option value="litigant">Litigants</option>
            </select>
          )}
        </div>
        {msg && <p className="hint">{msg}</p>}
        {loading ? <p>Loading...</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="entries">
              <thead><tr><SortTh label="Type" k="role" s={srt} /><SortTh label="Name" k="name" s={srt} /><SortTh label="Enrollment No." k="enrollment_no" s={srt} /><SortTh label="Mobile" k="mobile" s={srt} /><SortTh label="Email" k="email" s={srt} /><SortTh label="Court" k="court_name" s={srt} /><SortTh label="Requested on" k="date" s={srt} /><SortTh label="Status" k="status" s={srt} /><th /></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)" }}>No registrations here.</td></tr>}
                {srt.sorted.map((r) => (
                  <tr key={r.id}>
                    <td>{r.role === "advocate" ? "Advocate" : "Litigant"}</td>
                    <td>{r.name}</td><td>{r.enrollment_no}</td><td>{r.mobile}</td><td>{r.email}</td>
                    <td>{r.role === "litigant" ? r.court_name : ""}</td>
                    <td>{(r.created_at || "").slice(0, 10)}</td>
                    <td>{r.status === "rejected" ? "Not approved" : r.status[0].toUpperCase() + r.status.slice(1)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.status !== "approved" && <button className="btn btn-primary" style={{ padding: "4px 10px", marginRight: 6 }} onClick={() => decide(r, "approve")}>Approve</button>}
                      {r.status !== "rejected" && <button className="btn btn-outline" style={{ padding: "4px 10px" }} onClick={() => decide(r, "reject")}>{r.status === "approved" ? "Revoke" : "Reject"}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
