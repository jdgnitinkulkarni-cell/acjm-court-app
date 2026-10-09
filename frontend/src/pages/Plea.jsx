import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { getUser } from "../lib/api";
import { T } from "../lib/templates";
import { TopBar } from "./AdminDashboard";
import { WelcomePanel, StatCard } from "./SideNav";
import UnfinishedWork from "./Drafts";
import { getSelectedCourt, getSelectedCourtId } from "./SelectCourt";

function PublicStats({ role }) {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(null);
  const [live, setLive] = useState(null);
  useEffect(() => {
    api.get("/messages/me").then(({ data }) => setUnread(data?.unread || 0)).catch(() => {});
    if (role === "advocate") api.get("/live/depositions").then(({ data }) => setLive(Array.isArray(data) ? data.length : 0)).catch(() => {});
  }, [role]);
  return (
    <div className="stats-row">
      {role === "advocate" && <StatCard label="Live depositions for you" value={live} tone="rust" onClick={() => navigate("/advocate/live")} />}
      <StatCard label="Unread messages" value={unread} tone="plum" onClick={() => navigate("/message-center")} />
    </div>
  );
}

export function AdvocateHome() {
  const navigate = useNavigate();
  const court = getSelectedCourt();
  useEffect(() => {
    if (!court) navigate("/advocate", { replace: true });
  }, [court, navigate]);
  if (!court) return null;
  const publicUser = getUser();
  const hasInbox = ["advocate", "litigant"].includes(publicUser?.role);
  const homeTitle = publicUser?.role === "advocate" ? "Advocate" : publicUser?.role === "litigant" ? "Litigant" : (publicUser ? "Advocate / Accused" : "Litigant");
  return (
    <div className="app-shell">
      <TopBar title={homeTitle} />
      <div className="page" data-testid="advocate-home">
        <WelcomePanel subtitle="Plea, Primary FS, Final FS, Application, Pursis, Surety and the Limitation Calculator are in the menu on the left." />
        <div className="info-strip" data-testid="advocate-court-banner">
          <strong>Court:</strong> {court?.english?.court_name}{" "}
          <button className="btn btn-outline" style={{padding:"4px 10px", marginLeft:10}} onClick={() => navigate("/advocate")}>Change Court</button>
        </div>
        {hasInbox && <PublicStats role={publicUser.role} />}
        <UnfinishedWork />
        {!hasInbox && <p className="hint">You are using the services without login. Register as a litigant (optional) to receive orders and processes in the Message Center.</p>}
      </div>
    </div>
  );
}

export function PleaLanguage() {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <TopBar title="Plea — Select Language" />
      <div className="page" style={{textAlign:"center"}} data-testid="plea-lang-page">
        <h1>Select the Language of Plea</h1>
        <div className="row" style={{justifyContent:"center", marginTop:32}}>
          <button className="btn btn-orange role-btn" data-testid="lang-gu-btn" onClick={() => navigate("/advocate/plea/form/gu")}>ગુજરાતી ફોર્મ</button>
          <button className="btn btn-red role-btn" data-testid="lang-en-btn" onClick={() => navigate("/advocate/plea/form/en")}>Get Form In English</button>
        </div>
      </div>
    </div>
  );
}

const initAcc = { case_no:"", name:"", father_husband:"", religion:"", age:"", occupation:"", address:"", contact:"" };
const pleaDraftKey = (lang) => `acjm_plea_draft:${lang || "en"}`;
const sanjabiDraftKey = (pleaId) => `acjm_sanjabi_draft:${pleaId || "new"}`;

const pleaEditDraftKey = (pleaId) => `acjm_plea_edit_draft:${pleaId}`;

export function PleaForm() {
  const { lang, pleaId } = useParams();
  const navigate = useNavigate();
  const t = T[lang === "gu" ? "gu" : "en"];
  const [accused, setAccused] = useState(initAcc);
  const [charge, setCharge] = useState("138");
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [err, setErr] = useState("");
  // Crash-recovery: a found draft is surfaced via prompt, never applied
  // silently — the user explicitly chooses Restore or Discard.
  const [pendingDraft, setPendingDraft] = useState(null); // { data, savedAt } | null

  useEffect(() => {
    if (pleaId) {
      api.get(`/pleas/${pleaId}`).then(({data}) => {
        setAccused(data.accused); setCharge(data.charge); setQ1(data.q1); setQ2(data.q2);
        // Check for unsaved crash-recovery changes made after this record
        // was last officially saved, and offer to restore them.
        try {
          const raw = localStorage.getItem(pleaEditDraftKey(pleaId));
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.data) setPendingDraft(parsed);
          }
        } catch (_) {}
      });
    } else {
      try {
        const raw = localStorage.getItem(pleaDraftKey(lang));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.accused || parsed?.q1 || parsed?.q2) {
            // Legacy drafts (before this prompt existed) were stored as the
            // raw fields directly, not {data, savedAt} — support both shapes.
            setPendingDraft(parsed.data ? parsed : { data: parsed, savedAt: null });
          }
        }
      } catch (_) {}
    }
  }, [pleaId, lang]);

  useEffect(() => {
    if (pleaId) return;
    localStorage.setItem(pleaDraftKey(lang), JSON.stringify({accused, charge, q1, q2}));
  }, [accused, charge, q1, q2, lang, pleaId]);

  // Crash-recovery for EDITING an already-submitted plea: previously there
  // was no protection at all here — a crash mid-edit (before pressing
  // Proceed again) would silently lose the changes. This never touches the
  // official backend record; it only writes a local draft, checked above.
  useEffect(() => {
    if (!pleaId) return undefined;
    const t = setInterval(() => {
      try {
        localStorage.setItem(pleaEditDraftKey(pleaId), JSON.stringify({ data: { accused, charge, q1, q2 }, savedAt: new Date().toISOString() }));
      } catch (_) {}
    }, 1000);
    return () => clearInterval(t);
  }, [pleaId, accused, charge, q1, q2]);

  const restoreDraft = () => {
    const d = pendingDraft?.data;
    if (d) {
      if (d.accused) setAccused({ ...initAcc, ...d.accused });
      if (d.charge) setCharge(d.charge);
      if (d.q1 !== undefined) setQ1(d.q1);
      if (d.q2 !== undefined) setQ2(d.q2);
    }
    setPendingDraft(null);
  };
  const discardDraft = () => {
    try {
      localStorage.removeItem(pleaId ? pleaEditDraftKey(pleaId) : pleaDraftKey(lang));
    } catch (_) {}
    setPendingDraft(null);
  };

  const q2Text = charge === "138" ? t.q2_138 : t.q2_25;

  const validate = () => {
    for (const k of Object.keys(initAcc)) if (!accused[k]) return "All accused details are mandatory.";
    if (!q1) return "Question 1 is required.";
    if (!q2) return "Question 2 is required.";
    return "";
  };

  const proceed = async (pleaType) => {
    const v = validate(); if (v) { setErr(v); return; }
    if (pleaType === "sanjabi" && charge === "25") {
      alert(lang === "gu"
        ? `ચેતાવી : "Plea as per Sanjabi Tari Judgment" "કલમ ૨૫ ધી. પેમેન્ટ અને સેટલમેન્ટ સીસ્ટમ એક્ટ, ૨૦૦૭" માટે ઉપલબ્ધ નથી.`
        : `Error : "Plea as per Sanjabi Tari Judgment" not available when charge is selected as "Sec. 25 of The Payment & Settlement Systems Act, 2007".`);
      return;
    }
    const ok = window.confirm(lang === "gu" ? "આ જણાવેલ વિગતો - શું તમે આગળ વધવા માંગો છો?" : 'I want to - Proceed?');
    if (!ok) return;
    // Save base plea (without sanjabi yet for normal; with empty sanjabi for sanjabi flow's continuation page)
    const courtId = getSelectedCourtId();
    if (!courtId) { setErr("Please select a court first."); return; }
    const body = { language: lang, charge, accused, q1, q2, plea_type: pleaType, sanjabi: null, court_id: courtId };
    let savedId = pleaId;
    try {
      if (pleaId) {
        await api.put(`/pleas/${pleaId}`, body);
        localStorage.removeItem(pleaEditDraftKey(pleaId));
      } else {
        const { data } = await api.post("/pleas", body);
        savedId = data.id;
        localStorage.removeItem(pleaDraftKey(lang));
      }
    } catch (e) { setErr(e.response?.data?.detail || "Save failed"); return; }
    if (pleaType === "sanjabi") navigate(`/advocate/plea/sanjabi/${lang}/${savedId}`);
    else navigate(`/advocate/plea/review/${savedId}`);
  };

  return (
    <div className="app-shell">
      <TopBar title="Plea — Accused Details" />
      <div className="page" data-testid="plea-form">
        {pendingDraft && (
          <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: 14, marginBottom: 16 }} data-testid="plea-draft-prompt">
            <strong>Unsaved work found</strong>
            <p className="hint" style={{ marginTop: 4 }}>
              {pendingDraft.savedAt
                ? `We found unsaved changes from ${new Date(pendingDraft.savedAt).toLocaleString()} — this can happen after a crash or power cut.`
                : "We found unsaved changes from an earlier session."}
              {" "}Would you like to restore them, or discard and continue with the last saved version?
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button className="btn btn-primary" style={{ padding: "6px 14px" }} onClick={restoreDraft}>Restore</button>
              <button className="btn btn-secondary" style={{ padding: "6px 14px" }} onClick={discardDraft}>Discard</button>
            </div>
          </div>
        )}
        <h1>{t.enterAccused}</h1>
        <div className="form-grid">
          {Object.keys(initAcc).filter(k=>k!=="address").map(k => (
            <React.Fragment key={k}>
              <label>{t.fields[k]}</label>
              <input value={accused[k]} onChange={e=>setAccused({...accused, [k]: e.target.value})} data-testid={`acc-${k}`} />
            </React.Fragment>
          ))}
          <label>{t.fields.address}</label>
          <textarea value={accused.address} placeholder={t.addressHint} onChange={e=>setAccused({...accused, address: e.target.value})} data-testid="acc-address" />
        </div>
        <div className="section-title">{t.selectCharge}</div>
        <select value={charge} onChange={e=>setCharge(e.target.value)} data-testid="charge-select" style={{padding:10, width:"100%", border:"1px solid var(--border)", borderRadius:4}}>
          <option value="138">{t.chargeOptions["138"]}</option>
          <option value="25">{t.chargeOptions["25"]}</option>
        </select>
        <div style={{marginTop:16}}>
          <p><strong>{t.q1}</strong></p>
          <select value={q1} onChange={e=>setQ1(e.target.value)} data-testid="q1-select" style={{padding:10, width:200, border:"1px solid var(--border)", borderRadius:4}}>
            <option value="">--</option>
            {t.yesNo.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div style={{marginTop:16}}>
          <p><strong>{lang==="gu" ? "પ્રશ્ન ૨ - " : "Question No. 2 - "}</strong>{q2Text}</p>
          <select value={q2} onChange={e=>setQ2(e.target.value)} data-testid="q2-select" style={{padding:10, width:"100%", border:"1px solid var(--border)", borderRadius:4}}>
            <option value="">--</option>
            {t.q2Options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        {err && <p className="error">{err}</p>}
        <div className="form-actions">
          <button className="btn btn-primary" disabled={charge==="25"} title={charge==="25" ? "Not available for Sec. 25" : ""} onClick={() => proceed("sanjabi")} data-testid="btn-sanjabi">{t.btnPleaSanjabi}</button>
          <button className="btn btn-advocate" onClick={() => proceed("normal")} data-testid="btn-normal">{t.btnPleaNormal}</button>
        </div>
      </div>
    </div>
  );
}

export function PleaSanjabi() {
  const { lang, pleaId } = useParams();
  const navigate = useNavigate();
  const t = T[lang];
  const [s, setS] = useState({ q3:"", q4:"", q5:"", q6:"", q7:[], q7_other:"", q8:"" });
  const [plea, setPlea] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get(`/pleas/${pleaId}`).then(({data}) => {
      setPlea(data);
      if (data.sanjabi) setS({...s, ...data.sanjabi});
      else {
        try {
          const saved = JSON.parse(localStorage.getItem(sanjabiDraftKey(pleaId)) || "{}");
          if (Object.keys(saved).length) setS({...s, ...saved});
        } catch (_) {}
      }
    });
  }, [pleaId]);

  useEffect(() => {
    localStorage.setItem(sanjabiDraftKey(pleaId), JSON.stringify(s));
  }, [s, pleaId]);

  const toggleQ7 = (opt) => {
    const list = s.q7.includes(opt) ? s.q7.filter(x=>x!==opt) : [...s.q7, opt];
    setS({...s, q7: list});
  };
  const submit = async () => {
    if (!s.q3 || !s.q4 || !s.q5 || !s.q6 || !s.q7.length || !s.q8) { setErr("All fields are mandatory."); return; }
    if (s.q7.includes(t.sanjabi.q7opts[3]) && !s.q7_other) { setErr("Please describe 'Other'"); return; }
    await api.put(`/pleas/${pleaId}`, { ...plea, sanjabi: s });
    localStorage.removeItem(sanjabiDraftKey(pleaId));
    navigate(`/advocate/plea/review/${pleaId}`);
  };
  if (!plea) return null;
  const Q = ({label, val, setVal, k}) => (
    <div style={{marginTop:14}}>
      <p><strong>{label}</strong></p>
      <select value={val} onChange={e=>setVal(e.target.value)} data-testid={`san-${k}`} style={{padding:10, width:200, border:"1px solid var(--border)", borderRadius:4}}>
        <option value="">--</option>
        {t.yesNo.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
  return (
    <div className="app-shell">
      <TopBar title="Plea as per Sanjabi Tari Judgment" />
      <div className="page" data-testid="sanjabi-page">
        <h1>{t.btnPleaSanjabi}</h1>
        <Q label={t.sanjabi.q3} val={s.q3} setVal={v=>setS({...s,q3:v})} k="q3" />
        <Q label={t.sanjabi.q4} val={s.q4} setVal={v=>setS({...s,q4:v})} k="q4" />
        <Q label={t.sanjabi.q5} val={s.q5} setVal={v=>setS({...s,q5:v})} k="q5" />
        <Q label={t.sanjabi.q6} val={s.q6} setVal={v=>setS({...s,q6:v})} k="q6" />
        <div style={{marginTop:14}}>
          <p><strong>{t.sanjabi.q7}</strong></p>
          {t.sanjabi.q7opts.map(o => (
            <label key={o} style={{display:"block", marginBottom:6}}>
              <input type="checkbox" checked={s.q7.includes(o)} onChange={()=>toggleQ7(o)} data-testid={`san-q7-${o.slice(0,8)}`} /> {o}
            </label>
          ))}
          {s.q7.includes(t.sanjabi.q7opts[3]) && (
            <textarea value={s.q7_other} onChange={e=>setS({...s, q7_other:e.target.value})} placeholder="Specify..." data-testid="san-q7-other" style={{width:"100%", padding:10, border:"1px solid var(--border)", borderRadius:4, minHeight:60}} />
          )}
        </div>
        <Q label={t.sanjabi.q8} val={s.q8} setVal={v=>setS({...s,q8:v})} k="q8" />
        {err && <p className="error">{err}</p>}
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => navigate(`/advocate/plea/form/${lang}/${pleaId}`)}>{lang === "gu" ? "પાછળ" : "Back"}</button>
          <button className="btn btn-primary" onClick={submit} data-testid="san-submit">{t.submit}</button>
        </div>
      </div>
    </div>
  );
}
