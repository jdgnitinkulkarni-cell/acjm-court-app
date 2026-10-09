import React, { useEffect, useRef, useState } from "react";
import { useSort, SortTh } from "../lib/sortable";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api, { getUser } from "../lib/api";
import { TopBar } from "./AdminDashboard";

// Demand (text from staff) and Live Deposition (advocate view + objections).

const pad = (n) => String(n).padStart(2, "0");
function fmtWhen(iso) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtTime(iso) {
  const d = new Date(iso || "");
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const PARTY = { complainant: "Complainant", accused: "Accused", prosecution: "Prosecution", defence: "Defence", plaintiff: "Plaintiff", defendant: "Defendant" };
const partyLabel = (p) => PARTY[p] || p || "";

// Copy that also works when the app is opened over the office LAN (http://),
// where the modern clipboard API is not available.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fall back */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "-1000px";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.value = 0.08;
    o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 350);
  } catch (e) { /* ignore */ }
}

const Portal = ({ children }) => createPortal(<div style={{ color: "#1f2937" }}>{children}</div>, document.body);

function CopyBox({ text, lang, testid }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  return (
    <div>
      <textarea ref={ref} readOnly value={text} className={`font-${lang || "en"}`}
        style={{ width: "100%", boxSizing: "border-box", minHeight: 120, maxHeight: 320, padding: 10, border: "1px solid #d1d5db", borderRadius: 4, fontSize: 16, lineHeight: 1.5, resize: "vertical" }}
        onFocus={(e) => e.target.select()} data-testid={testid} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
        <button className="btn btn-primary" style={{ padding: "6px 14px" }} onClick={async () => {
          const ok = await copyText(text);
          if (!ok && ref.current) { ref.current.focus(); ref.current.select(); }
          setCopied(ok ? "Copied — now paste it in the deposition (Ctrl+V)." : "Text selected — press Ctrl+C to copy.");
        }} data-testid={testid ? `${testid}-copy` : undefined}>Copy text</button>
        {copied && <span style={{ color: "#16a34a", fontSize: 14 }}>{copied}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Judge: Advocate name field with registered-advocate suggestions.
export function AdvocateNameInput({ value, advocateId, onChange, testid }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const boxRef = useRef(null);
  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const search = (term) => {
    clearTimeout(timer.current);
    if ((term || "").trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      api.get("/advocates/search", { params: { q: term.trim() } }).then(({ data }) => setResults(Array.isArray(data) ? data : [])).catch(() => setResults([]));
    }, 250);
  };
  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input value={value || ""} onChange={(e) => { onChange(e.target.value, ""); search(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder="Type name — registered advocates will be suggested" style={{ width: "100%", boxSizing: "border-box", paddingRight: advocateId ? 110 : undefined }} data-testid={testid} />
      {advocateId && <span title="Registered advocate — can view this deposition live" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, background: "#dcfce7", color: "#166534", borderRadius: 10, padding: "2px 8px" }}>✓ Registered</span>}
      {open && results.length > 0 && (
        <div style={{ position: "absolute", zIndex: 30, left: 0, right: 0, top: "100%", marginTop: 2, background: "#fff", border: "1px solid var(--border)", borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.12)", maxHeight: 260, overflowY: "auto" }} data-testid={testid ? `${testid}-results` : undefined}>
          {results.map((a) => (
            <div key={a.id} onMouseDown={(e) => { e.preventDefault(); onChange(a.name, a.id); setOpen(false); setResults([]); }}
              style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f7ff"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
              <strong>{a.name}</strong> <span style={{ fontSize: 13, color: "#4b5563" }}>· Enrollment No. {a.enrollment_no}{a.hint ? ` · ${a.hint}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Judge: Demand button + pop-ups for the staff's reply and advocates' objections.
export function LiveDeskControls({ depId, language, active = true }) {
  const [events, setEvents] = useState({ demands: [], objections: [] });
  const [showDemand, setShowDemand] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [demandMsg, setDemandMsg] = useState("");
  const [popup, setPopup] = useState(null); // {demands:[], objections:[]} unseen items being shown
  const [showHistory, setShowHistory] = useState(false);
  const shownRef = useRef(new Set());

  const load = () => api.get(`/depositions/${depId}/live-events`).then(({ data }) => {
    setEvents(data || { demands: [], objections: [] });
    const newD = (data?.demands || []).filter((d) => d.status === "answered" && !d.judge_seen && !shownRef.current.has(d.id));
    const newO = (data?.objections || []).filter((o) => !o.judge_seen && !shownRef.current.has(o.id));
    if (newD.length || newO.length) {
      [...newD, ...newO].forEach((x) => shownRef.current.add(x.id));
      setPopup((p) => ({ demands: [...(p?.demands || []), ...newD], objections: [...(p?.objections || []), ...newO] }));
      beep();
    }
  }).catch(() => {});

  useEffect(() => {
    if (!depId) return undefined;
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [depId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendDemand = async () => {
    setSending(true); setDemandMsg("");
    try {
      await api.post(`/depositions/${depId}/demands`, { note });
      setShowDemand(false); setNote("");
      load();
    } catch (e) { setDemandMsg(e.response?.data?.detail || "Could not send the demand."); }
    finally { setSending(false); }
  };

  const closePopup = async () => {
    const ids = { demand_ids: (popup?.demands || []).map((d) => d.id), objection_ids: (popup?.objections || []).map((o) => o.id) };
    setPopup(null);
    try { await api.post(`/depositions/${depId}/live-events/seen`, ids); } catch (e) { /* ignore */ }
    load();
  };

  const pending = events.demands.filter((d) => d.status === "pending").length;
  const total = events.demands.length + events.objections.length;

  return (
    <>
      <button style={{ background: "#f59e0b", opacity: active ? 1 : 0.5, cursor: active ? "pointer" : "not-allowed" }} disabled={!active}
        title={active ? "Ask the court staff for the text of a document" : "Demand is available only while the deposition is being typed"}
        onClick={() => { if (!active) return; setDemandMsg(""); setShowDemand(true); }} data-testid="demand-btn">
        Demand{active && pending ? ` (${pending} awaited)` : ""}
      </button>
      {total > 0 && (
        <button style={{ background: "#374151", color: "#fff" }} onClick={() => setShowHistory(true)} data-testid="received-btn">📥 Received ({events.demands.filter((d) => d.status === "answered").length + events.objections.length})</button>
      )}

      {showDemand && active && (
        <Portal>
          <div className="modal-backdrop" onClick={() => !sending && setShowDemand(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }} data-testid="demand-modal">
              <h3>Demand text from Staff</h3>
              <p className="hint" style={{ marginTop: 0 }}>The court staff will get a notification. The text sent by the staff will pop up here for you to copy.</p>
              <label style={{ fontWeight: 600 }}>Which document / portion is required? (optional)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Police statement of this witness dated ..., Exh. 5, second paragraph"
                style={{ width: "100%", boxSizing: "border-box", minHeight: 90, padding: 10, border: "1px solid #d1d5db", borderRadius: 4, fontSize: 15, marginTop: 6 }} data-testid="demand-note" />
              {demandMsg && <p className="error">{demandMsg}</p>}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowDemand(false)} disabled={sending}>Cancel</button>
                <button className="btn btn-primary" onClick={sendDemand} disabled={sending} data-testid="demand-send">{sending ? "Sending..." : "Send Demand"}</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {popup && (
        <Portal>
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth: 760, maxHeight: "88vh", overflowY: "auto" }} data-testid="live-popup">
              {(popup.objections || []).map((o) => (
                <div key={o.id} style={{ marginBottom: 18, padding: 12, border: "2px solid #dc2626", borderRadius: 6, background: "#fef2f2" }}>
                  <h3 style={{ color: "#b91c1c", margin: "0 0 6px" }}>Objection raised by {o.advocate_name}</h3>
                  <p className="hint" style={{ margin: "0 0 8px" }}>{o.side_label} · {fmtTime(o.created_at)}</p>
                  <CopyBox text={o.text} lang={language} testid="objection-text" />
                </div>
              ))}
              {(popup.demands || []).map((d) => (
                <div key={d.id} style={{ marginBottom: 18, padding: 12, border: "2px solid #f59e0b", borderRadius: 6, background: "#fffbeb" }}>
                  <h3 style={{ color: "#92400e", margin: "0 0 6px" }}>Text received from {d.answered_by?.name || "Staff"}</h3>
                  {d.note && <p className="hint" style={{ margin: "0 0 8px" }}>Demanded: {d.note}</p>}
                  <CopyBox text={d.reply_text} lang={language} testid="demand-reply-text" />
                </div>
              ))}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={closePopup} data-testid="live-popup-close">Close</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {showHistory && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowHistory(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, maxHeight: "88vh", overflowY: "auto" }}>
              <h3>Demands &amp; Objections in this deposition</h3>
              {events.objections.map((o) => (
                <div key={o.id} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #e5e7eb" }}>
                  <strong style={{ color: "#b91c1c" }}>Objection — {o.advocate_name}</strong> <span className="hint">({o.side_label}, {fmtTime(o.created_at)})</span>
                  <CopyBox text={o.text} lang={language} />
                </div>
              ))}
              {events.demands.map((d) => (
                <div key={d.id} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #e5e7eb" }}>
                  <strong style={{ color: "#92400e" }}>Demand</strong> <span className="hint">({fmtTime(d.requested_at)}){d.note ? ` — ${d.note}` : ""}</span>
                  {d.status === "pending" ? <p className="hint">Awaiting the staff's reply...</p>
                    : d.status === "closed" ? <p className="hint">Ended — the deposition was adjourned / completed before the staff replied.</p>
                    : <CopyBox text={d.reply_text} lang={language} />}
                </div>
              ))}
              <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowHistory(false)}>Close</button></div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Staff: notification for new demands on every staff screen of the app.
export function StaffDemandNotifier() {
  const location = useLocation();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [dismissedAt, setDismissedAt] = useState("");
  const lastRef = useRef("");
  useEffect(() => {
    let alive = true;
    const tick = () => {
      const u = getUser();
      if (u?.role !== "staff") { setInfo(null); return; }
      api.get("/demands/pending-count").then(({ data }) => {
        if (!alive) return;
        setInfo(data);
        if (data?.latest && data.latest !== lastRef.current) {
          if (lastRef.current) beep();
          lastRef.current = data.latest;
        }
      }).catch(() => {});
    };
    tick();
    const t = setInterval(tick, 6000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!info?.pending || location.pathname === "/staff/demands" || dismissedAt === info.latest) return null;
  return (
    <div style={{ position: "fixed", right: 18, top: 84, zIndex: 200, background: "#fffbeb", border: "2px solid #f59e0b", borderRadius: 8, padding: "12px 16px", boxShadow: "0 10px 30px rgba(0,0,0,.2)", maxWidth: 340 }} data-testid="demand-notifier">
      <strong style={{ color: "#92400e" }}>🔔 {info.pending} demand{info.pending > 1 ? "s" : ""} from the Court</strong>
      <div style={{ fontSize: 14, margin: "4px 0 10px", color: "#374151" }}>The Judicial Officer needs the text of a document in an ongoing deposition.</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" style={{ padding: "6px 12px" }} onClick={() => navigate("/staff/demands")} data-testid="demand-notifier-open">Open</button>
        <button className="btn btn-outline" style={{ padding: "6px 12px" }} onClick={() => setDismissedAt(info.latest)}>Later</button>
      </div>
    </div>
  );
}

// Staff: list of demands with a paste / type window and Send.
export function StaffDemands() {
  const [rows, setRows] = useState([]);
  const [texts, setTexts] = useState({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => api.get("/demands").then(({ data }) => setRows(Array.isArray(data) ? data : [])).catch((e) => setMsg(e.response?.data?.detail || "Could not load demands.")).finally(() => setLoading(false));
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, []);
  const send = async (d) => {
    const text = (texts[d.id] || "").trim();
    if (!text) { setMsg("Please type or paste the text before sending."); return; }
    setBusy(d.id); setMsg("");
    try {
      await api.post(`/demands/${d.id}/reply`, { text });
      setTexts((t) => ({ ...t, [d.id]: "" }));
      setMsg("Sent. The text has appeared on the Judicial Officer's screen.");
      load();
    } catch (e) { setMsg(e.response?.data?.detail || "Could not send."); }
    finally { setBusy(""); }
  };
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");
  const srt = useSort(done, { requested: (d) => d.requested_at, sent: (d) => d.answered_at });
  return (
    <div className="app-shell">
      <TopBar title="Demands from the Court" />
      <div className="page" style={{ width: "92%", maxWidth: 1100, boxSizing: "border-box" }} data-testid="staff-demands">
        <h1>Demands from the Court</h1>
        <p className="hint">Scan the document, get its text by OCR in any application, then paste it (or type it) below and click Send. It appears instantly on the Judicial Officer's deposition screen.</p>
        {msg && <p className={msg.startsWith("Sent") ? "success" : "error"}>{msg}</p>}
        {loading ? <p>Loading...</p> : pending.length === 0 ? <p className="hint" style={{ fontSize: 16 }}>No pending demand.</p> : pending.map((d) => (
          <div key={d.id} style={{ border: "2px solid #f59e0b", borderRadius: 8, padding: 16, marginBottom: 16, background: "#fffbeb" }} data-testid="demand-card">
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <strong>{d.label}</strong>
              <span className="hint" style={{ margin: 0 }}>Demanded at {fmtWhen(d.requested_at)}{d.judge ? ` by ${d.judge.name}` : ""}</span>
            </div>
            {d.note ? <p style={{ margin: "8px 0", fontSize: 16 }}><strong>Required:</strong> {d.note}</p> : <p className="hint">No details given — please ask the Court if needed.</p>}
            <textarea value={texts[d.id] || ""} onChange={(e) => setTexts((t) => ({ ...t, [d.id]: e.target.value }))} placeholder="Paste the OCR text here (Ctrl+V) or type it"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 200, padding: 10, border: "1px solid #d1d5db", borderRadius: 4, fontSize: 16, lineHeight: 1.5, fontFamily: "'Lohit Gujarati','Tiro Devanagari Hindi','Times New Roman',serif" }} data-testid="demand-reply-input" />
            <div className="form-actions" style={{ justifyContent: "flex-end", marginTop: 10 }}>
              <button className="btn btn-primary" onClick={() => send(d)} disabled={busy === d.id} data-testid="demand-reply-send">{busy === d.id ? "Sending..." : "Send to Court"}</button>
            </div>
          </div>
        ))}
        {done.length > 0 && (
          <>
            <h2 style={{ marginTop: 28 }}>Earlier demands</h2>
            <table className="entries">
              <thead><tr><SortTh label="Deposition" k="label" s={srt} /><SortTh label="Demanded" k="requested" s={srt} /><SortTh label="Sent" k="sent" s={srt} /><th>Text sent</th></tr></thead>
              <tbody>
                {srt.sorted.map((d) => (
                  <tr key={d.id}><td>{d.label}{d.note ? <><br /><span className="hint">{d.note}</span></> : null}</td><td>{fmtWhen(d.requested_at)}</td><td>{d.status === "closed" ? "—" : fmtWhen(d.answered_at)}</td>
                    <td style={{ maxWidth: 380 }}>{d.status === "closed" ? <span className="hint">Ended automatically — the deposition was adjourned / completed.</span> : <div style={{ maxHeight: 80, overflow: "hidden", whiteSpace: "pre-wrap" }}>{d.reply_text}</div>}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advocate: list of live depositions in which the advocate appears.
export function LiveDepositionList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = () => api.get("/live/depositions").then(({ data }) => { setRows(Array.isArray(data) ? data : []); setErr(""); })
      .catch((e) => setErr(e.response?.data?.detail || "Could not load.")).finally(() => setLoading(false));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="app-shell">
      <TopBar title="Live Deposition" />
      <div className="page" style={{ width: "92%", maxWidth: 1000, boxSizing: "border-box" }} data-testid="live-list">
        <h1>Live Depositions</h1>
        <p className="hint">Depositions now being recorded in any court in which the Court has entered your name as the advocate of the producing or defending party. Depositions of vulnerable witnesses (in camera) are not shown.</p>
        {err && <p className="error">{err}</p>}
        {loading ? <p>Loading...</p> : rows.length === 0 ? <p className="hint" style={{ fontSize: 16 }}>No live deposition at present. This list refreshes automatically.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((r) => (
              <div key={r.id} onClick={() => navigate(`/advocate/live/${r.id}`)} style={{ border: "1px solid var(--border)", borderLeft: "5px solid #dc2626", borderRadius: 6, padding: 14, cursor: "pointer", background: "#fff" }} data-testid="live-row">
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <strong>Case {r.case_number} — Witness: {r.witness_name}{r.exhibit_number ? ` (Exh. ${r.exhibit_number})` : ""}</strong>
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>● LIVE</span>
                </div>
                <div className="hint" style={{ margin: "4px 0 0" }}>{r.court_name}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>You appear for the {r.my_side === "producing" ? "producing" : "defending"} party ({partyLabel(r.my_side === "producing" ? r.producing_party : r.defending_party)})</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Advocate: live text of the deposition + Raise Objection.
export function LiveDepositionView() {
  const { depId } = useParams();
  const navigate = useNavigate();
  const [dep, setDep] = useState(null);
  const [err, setErr] = useState("");
  const [showObj, setShowObj] = useState(false);
  const [objText, setObjText] = useState("");
  const [sending, setSending] = useState(false);
  const [objMsg, setObjMsg] = useState("");
  const boxRef = useRef(null);
  const countRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = () => api.get(`/live/depositions/${depId}`).then(({ data }) => {
      if (!alive) return;
      const box = boxRef.current;
      const nearBottom = box ? box.scrollHeight - box.scrollTop - box.clientHeight < 80 : true;
      setDep(data); setErr("");
      const n = (data.paragraphs || []).join("\n").length;
      if (n !== countRef.current) {
        countRef.current = n;
        if (nearBottom) setTimeout(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, 30);
      }
    }).catch((e) => { if (alive) setErr(e.response?.data?.detail || "Could not load the deposition."); });
    load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [depId]);

  const sendObjection = async () => {
    if (!objText.trim()) { setObjMsg("Please type the objection."); return; }
    setSending(true); setObjMsg("");
    try {
      await api.post(`/live/depositions/${depId}/objections`, { text: objText });
      setShowObj(false); setObjText("");
    } catch (e) { setObjMsg(e.response?.data?.detail || "Could not send the objection."); }
    finally { setSending(false); }
  };

  const lang = dep?.language || "en";
  return (
    <div className="app-shell">
      <TopBar title="Live Deposition" onBack={() => navigate("/advocate/live")} />
      <div className="page" style={{ width: "95%", maxWidth: 1100, boxSizing: "border-box" }} data-testid="live-view">
        {err && <p className="error">{err}</p>}
        {!dep ? <p>Loading...</p> : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <div>
                <h1 style={{ margin: 0 }}>Case {dep.case_number} — {dep.witness_name}{dep.exhibit_number ? ` (Exh. ${dep.exhibit_number})` : ""}</h1>
                <div className="hint" style={{ margin: "4px 0 0" }}>{dep.court_name}</div>
              </div>
              {dep.live ? <span style={{ color: "#dc2626", fontWeight: 700 }} data-testid="live-badge">● LIVE</span> : <span className="hint">Not live</span>}
            </div>
            {!dep.live ? <p className="hint" style={{ fontSize: 16, marginTop: 16 }} data-testid="live-reason">{dep.reason}</p> : (
              <div ref={boxRef} className={`font-${lang}`} style={{ marginTop: 14, height: "60vh", overflowY: "auto", background: "#fff", border: "1px solid var(--border)", borderRadius: 6, padding: "20px 26px", fontSize: 17, lineHeight: 1.7, userSelect: "text" }} data-testid="live-text">
                {(dep.paragraphs || []).length === 0 ? <p className="hint">The deposition has not started yet.</p> : dep.paragraphs.map((p, i) => <p key={i} style={{ margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{p}</p>)}
              </div>
            )}
            {dep.live && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
                <button className="btn btn-red" style={{ background: "#dc2626", color: "#fff", padding: "10px 26px", fontSize: 16 }} onClick={() => { setObjMsg(""); setShowObj(true); }} data-testid="raise-objection">Raise Objection</button>
              </div>
            )}
            {(dep.objections || []).length > 0 && (
              <div style={{ marginTop: 18 }}>
                <h3 style={{ marginBottom: 6 }}>Your objections</h3>
                {dep.objections.map((o) => (
                  <div key={o.id} style={{ borderLeft: "4px solid #dc2626", padding: "6px 10px", margin: "6px 0", background: "#fff" }} data-testid="my-objection">
                    <div style={{ whiteSpace: "pre-wrap" }}>{o.text}</div>
                    <div className="hint" style={{ margin: 0 }}>Sent {fmtTime(o.created_at)} · {o.seen ? `Seen by the Court at ${fmtTime(o.seen_at)}` : "Delivered — not yet seen by the Court"}</div>
                  </div>
                ))}
                <p className="hint">The order on an objection is typed by the Court in the deposition and will appear in the text above.</p>
              </div>
            )}
          </>
        )}
      </div>
      {showObj && (
        <div className="modal-backdrop" onClick={() => !sending && setShowObj(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }} data-testid="objection-modal">
            <h3>Raise Objection</h3>
            <p className="hint" style={{ marginTop: 0 }}>Your objection will pop up on the screen of the Court recording this deposition.</p>
            <textarea value={objText} onChange={(e) => setObjText(e.target.value)} className={`font-${lang}`} placeholder="Type your objection"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 150, padding: 10, border: "1px solid #d1d5db", borderRadius: 4, fontSize: 16 }} data-testid="objection-input" />
            {objMsg && <p className="error">{objMsg}</p>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowObj(false)} disabled={sending}>Cancel</button>
              <button className="btn btn-primary" style={{ background: "#dc2626" }} onClick={sendObjection} disabled={sending} data-testid="objection-send">{sending ? "Sending..." : "Send to Court"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
