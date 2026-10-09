import React, { useState, useEffect } from "react";
import { useSort, SortTh } from "../lib/sortable";
import { useNavigate } from "react-router-dom";
import api, { setAuth, getUser, clearAuth } from "../lib/api";
import { TopBar } from "./AdminDashboard";
import { WelcomePanel, StatCard } from "./SideNav";

function deleteDepositionLocalCache(depId) {
  try {
    localStorage.removeItem(`dep_draft_${depId}`);
    if (!window.indexedDB) return;
    const req = window.indexedDB.open("acjm-deposition-editor-v1", 1);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("documents")) {
        db.close();
        return;
      }
      const tx = db.transaction("documents", "readwrite");
      tx.objectStore("documents").delete(depId);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    };
  } catch (e) {
    // Best-effort cleanup only. The server-side DISMISSED state is authoritative.
  }
}

export function JudgeLogin() {
  const navigate = useNavigate();
  const existingUser = getUser();
  const [loginId, setLoginId] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState(() => {
    try {
      if (sessionStorage.getItem("acjm_session_expired") === "1") {
        sessionStorage.removeItem("acjm_session_expired");
        return "Your login session has expired. Please log in again.";
      }
    } catch {}
    return "";
  });
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (existingUser?.role === "judge") navigate("/judge-desk/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async () => {
    setErr(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/judge-login", { login_id: loginId, password: pwd });
      setAuth(data.token, data.user);
      if (data.user.must_change) navigate("/staff/change");
      else navigate("/judge-desk/dashboard");
    } catch (e) {
      setErr(e.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="landing app-shell" data-testid="judge-login-page">
      <div className="landing-header">
        <div className="landing-title">Judge Desk</div>
        {existingUser && (
          <button className="btn btn-secondary" onClick={() => { clearAuth(); window.location.reload(); }} style={{ padding: "8px 14px" }}>
            Logout ({existingUser.role})
          </button>
        )}
      </div>
      <div className="landing-center">
        <div className="crest">⚖</div>
        <h1 className="landing-name">Judge Desk</h1>
        <p className="landing-sub">Authorized access only</p>
        <div className="modal" style={{ position: "static", boxShadow: "none", border: "1px solid var(--border)" }}>
          <label>Login ID</label>
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} data-testid="judge-loginid-input" />
          <label>Password</label>
          <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") login(); }} data-testid="judge-password-input" />
          {err && <div className="error">{err}</div>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={loading} onClick={login} data-testid="judge-login-submit">Login</button>
          </div>
        </div>
      </div>
      <div className="credit-line">Developed by N. A. Kulkarni, ACJM, Ahmedabad City</div>
    </div>
  );
}

function UnfinishedDepositionsBanner() {
  const navigate = useNavigate();
  const [unfinished, setUnfinished] = useState([]);
  const [handled, setHandled] = useState(() => sessionStorage.getItem("draftPromptHandled:deposition") === "true");

  useEffect(() => {
    if (handled) return;
    api.get("/depositions/my-unfinished").then(({ data }) => {
      const active = (data || []).filter((d) => d.draft_status === "ACTIVE");
      setUnfinished(active);
      if (active.length > 0) sessionStorage.setItem("draftPromptHandled:deposition", "true");
    }).catch(() => {});
  }, [handled]);

  const dismissAll = async () => {
    const items = [...unfinished];
    setUnfinished([]);
    setHandled(true);
    sessionStorage.setItem("draftPromptHandled:deposition", "true");
    await Promise.allSettled(items.map((d) => api.post(`/depositions/${d.id}/dismiss`)));
    items.forEach((d) => deleteDepositionLocalCache(d.id));
  };

  const resume = (id) => {
    setHandled(true);
    sessionStorage.setItem("draftPromptHandled:deposition", "true");
    navigate(`/judge-desk/oral-evidence/deposition/type/${id}`);
  };

  if (unfinished.length === 0 || handled) return null;

  return (
    <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: 16, marginBottom: 20 }} data-testid="unfinished-deposition-banner">
      <strong>Unfinished work found</strong>
      <p className="hint" style={{ marginTop: 4 }}>
        The following deposition(s) were left without pressing Complete or Adjourn — this can happen after
        a crash or power cut. Nothing has been lost; the text was saved continuously. Choose one to resume,
        or dismiss this if you've already handled it elsewhere.
      </p>
      {unfinished.map((d) => (
        <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}>
          <span>
            <strong>{d.witness_name || "(unnamed witness)"}</strong> — Case {d.primary_case_number || "-"}
            {d.start_time_display && <span className="hint"> — started {d.start_time_display}</span>}
          </span>
          <button className="btn btn-primary" style={{ padding: "6px 14px" }} onClick={() => resume(d.id)}>
            Resume
          </button>
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-outline" style={{ padding: "4px 10px" }} onClick={dismissAll}>Dismiss</button>
      </div>
    </div>
  );
}

function fmtDay(iso) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function useOralEntries() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/depositions/entries").then(({ data }) => setRows(Array.isArray(data) ? data : [])).catch(() => setRows([])); }, []);
  return rows;
}

function JudgeOverview() {
  const navigate = useNavigate();
  const rows = useOralEntries();
  const [orders, setOrders] = useState(null);
  const [unread, setUnread] = useState(null);
  const [forSign, setForSign] = useState(null);
  useEffect(() => {
    api.get("/signature-desk/count").then(({ data }) => setForSign(data?.pending || 0)).catch(() => setForSign(null));
    api.get("/orders/entries").then(({ data }) => setOrders(Array.isArray(data) ? data.length : 0)).catch(() => setOrders(null));
    api.get("/messages/me").then(({ data }) => setUnread(data?.unread || 0)).catch(() => setUnread(null));
  }, []);
  const today = fmtDay(new Date().toISOString());
  const r = rows || [];
  const open = r.filter((x) => x.status === "in_progress" || x.status === "adjourned");
  const srt = useSort(r.slice(0, 6), { date: (x) => x.recorded_at, type: (x) => (x.record_type === "s183" ? "183 Statement" : "Deposition"), case: (x) => (x.record_type === "s183" ? `${x.police_station} ${x.fir_number}` : x.case_number) });
  return (
    <>
      <div className="stats-row">
        <StatCard label="Recorded today" value={rows ? r.filter((x) => fmtDay(x.recorded_at) === today).length : null} onClick={() => navigate("/judge-desk/oral-evidence/entries")} testid="stat-today" />
        <StatCard label="In progress / adjourned" value={rows ? open.length : null} tone="gold" onClick={() => navigate("/judge-desk/oral-evidence/entries")} />
        <StatCard label="Orders" value={orders} tone="plum" onClick={() => navigate("/judge-desk/order/entries")} />
        <StatCard label="Unread messages" value={unread} tone="rust" onClick={() => navigate("/message-center")} />
        <StatCard label="Waiting for your signature" value={forSign} tone="gold" onClick={() => navigate("/judge-desk/for-signature")} testid="stat-forsign" />
      </div>
      <div className="card-block">
        <div className="card-head"><h3>Recent oral evidence</h3><button className="btn btn-outline" style={{ padding: "6px 12px" }} onClick={() => navigate("/judge-desk/oral-evidence/entries")}>View all</button></div>
        {!rows ? <p className="hint">Loading...</p> : r.length === 0 ? <p className="hint">No depositions or statements recorded yet.</p> : (
          <table className="entries">
            <thead><tr><SortTh label="Date" k="date" s={srt} /><SortTh label="Type" k="type" s={srt} /><SortTh label="Case / FIR" k="case" s={srt} /><SortTh label="Witness" k="witness_name" s={srt} /><SortTh label="Status" k="status_label" s={srt} /></tr></thead>
            <tbody>
              {srt.sorted.map((x) => (
                <tr key={x.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/judge-desk/oral-evidence/deposition/type/${x.id}`)} title="Open">
                  <td>{fmtDay(x.recorded_at)}</td>
                  <td>{x.record_type === "s183" ? "183 Statement" : "Deposition"}</td>
                  <td>{x.record_type === "s183" ? `${x.police_station} P.S., FIR ${x.fir_number}` : x.case_number}</td>
                  <td>{x.witness_name}</td>
                  <td><span className={`pill st-${x.status}`}>{x.status_label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function JudgeDashboard() {
  const navigate = useNavigate();
  const user = getUser();
  const courts = user?.courts || [];

  return (
    <div className="app-shell">
      <TopBar title="Judge Desk" />
      <div className="page" data-testid="judge-dashboard">
        <WelcomePanel subtitle="Judge Desk — Oral Evidence, Orders, Message Center and the Limitation Calculator are in the menu on the left." />
        <div className="info-strip" data-testid="judge-courts-banner">
          <strong>Assigned Court(s):</strong>{" "}
          {courts.length > 0
            ? courts.map((c) => c.english?.court_name).join(" | ")
            : <span style={{ color: "#a34037" }}>Not assigned. Please contact Admin.</span>}
        </div>
        <JudgeOverview />
      </div>
    </div>
  );
}

function ComingSoon({ title }) {
  return (
    <div className="app-shell">
      <TopBar title={title} />
      <div className="page">
        <h1>{title}</h1>
        <p className="hint">This feature is under active development and will be enabled here shortly.</p>
      </div>
    </div>
  );
}

function OralEvidenceStats() {
  const navigate = useNavigate();
  const rows = useOralEntries();
  const r = rows || [];
  const n = (f) => (rows ? r.filter(f).length : null);
  return (
    <div className="stats-row">
      <StatCard label="Depositions" value={n((x) => x.record_type !== "s183")} onClick={() => navigate("/judge-desk/oral-evidence/entries")} />
      <StatCard label="183 Statements" value={n((x) => x.record_type === "s183")} tone="plum" onClick={() => navigate("/judge-desk/oral-evidence/entries")} />
      <StatCard label="In progress" value={n((x) => x.status === "in_progress")} tone="gold" onClick={() => navigate("/judge-desk/oral-evidence/entries")} />
      <StatCard label="Adjourned" value={n((x) => x.status === "adjourned")} tone="rust" onClick={() => navigate("/judge-desk/oral-evidence/entries")} />
    </div>
  );
}

export function OralEvidenceHome() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <TopBar title="Oral Evidence" />
      <div className="page" data-testid="oral-evidence-home">
        <UnfinishedDepositionsBanner />
        <h1>Oral Evidence</h1>
        <p className="welcome-sub">Record a Deposition or a Statement under Section 183 BNSS, or open earlier records — choose from the menu on the left.</p>
        <OralEvidenceStats />
      </div>
    </div>
  );
}

export function Statement183ComingSoon() { return <ComingSoon title="BNSS, 183 Statement" />; }
export function OralEvidenceEntriesComingSoon() { return <ComingSoon title="Oral Evidence — Entries" />; }
export function OrderComingSoon() { return <ComingSoon title="Order" />; }
