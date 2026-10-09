import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { T } from "../lib/templates";
import { TopBar } from "./AdminDashboard";
import { downloadPdf } from "../lib/pdf";
import { signElement } from "../lib/sign";
import { getSelectedCourtId } from "./SelectCourt";

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
};
const primaryDraftKey = (pleaId) => `acjm_primary_fs_draft:${pleaId}`;

export function PrimaryFSCaseSelect() {
  const navigate = useNavigate();
  const [pleas, setPleas] = useState([]);
  const [sel, setSel] = useState("");
  useEffect(() => {
    const courtId = getSelectedCourtId();
    if (!courtId) { navigate("/advocate", { replace: true }); return; }
    api.get(`/pleas?court_id=${courtId}`).then(({data}) => setPleas(data));
  }, [navigate]);
  const proceed = () => {
    if (!sel) return;
    const p = pleas.find(p=>p.id===sel);
    const ok = window.confirm(`Accused: ${p.accused.name}\n\nProceed?`);
    if (ok) navigate(`/advocate/primary-fs/form/${sel}`);
  };
  return (
    <div className="app-shell">
      <TopBar title="Primary FS / FS on 1st Appearance" />
      <div className="page" data-testid="primary-fs-select-page">
        <h1>Select Case Number</h1>
        <select value={sel} onChange={e=>setSel(e.target.value)} data-testid="case-select" style={{padding:10, width:"100%", border:"1px solid var(--border)", borderRadius:4}}>
          <option value="">-- select --</option>
          {pleas.map(p => <option key={p.id} value={p.id}>{p.accused.case_no} — {p.accused.name} ({p.language === "gu" ? "ગુજરાતી" : "English"})</option>)}
        </select>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={proceed} disabled={!sel} data-testid="proceed-btn">Proceed</button>
        </div>
      </div>
    </div>
  );
}

export function PrimaryFSForm() {
  const navigate = useNavigate();
  const pleaId = window.location.pathname.split("/").pop();
  const [plea, setPlea] = useState(null);
  const [a, setA] = useState({ a1:"", a2:"", a3:"", a4:"" });
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get(`/pleas/${pleaId}`).then(({data}) => setPlea(data));
    api.get(`/primary-fs/by-plea/${pleaId}`).then(({data}) => {
      if (data?.a1) setA(data);
      else {
        try {
          const saved = JSON.parse(localStorage.getItem(primaryDraftKey(pleaId)) || "{}");
          if (Object.keys(saved).length) setA((old) => ({...old, ...saved}));
        } catch (_) {}
      }
    });
  }, [pleaId]);
  useEffect(() => {
    localStorage.setItem(primaryDraftKey(pleaId), JSON.stringify(a));
  }, [a, pleaId]);
  if (!plea) return null;
  const t = T[plea.language];
  const isGu = plea.language === "gu";
  const q2 = plea.charge === "138" ? t.primaryQ2_138 : t.primaryQ2_25;
  const submit = async () => {
    if (!a.a1 || !a.a2 || !a.a3 || !a.a4) { setErr("All fields are mandatory."); return; }
    await api.post("/primary-fs", { plea_id: pleaId, ...a });
    localStorage.removeItem(primaryDraftKey(pleaId));
    navigate(`/advocate/primary-fs/review/${pleaId}`);
  };
  return (
    <div className="app-shell">
      <TopBar title="Primary FS Questioner" />
      <div className="page" data-testid="primary-fs-form-page">
        <p><strong>{isGu ? "ફો. કે. ન." : "C.C. No."}:</strong> {plea.accused.case_no}</p>
        <p><strong>{isGu ? "આરોપી નું નામ" : "Name of The Accused"}:</strong> {plea.accused.name}</p>
        <p><strong>{isGu ? "આરોપી નું સરનામું" : "Address"}:</strong> {plea.accused.address}</p>
        <h2 style={{marginTop:20}}>{t.fsTitle}</h2>
        <div style={{marginTop:14}}>
          <p><strong>{isGu? "પ્રશ્ન":"Question"}:</strong> {t.primaryQ1}</p>
          <select value={a.a1} onChange={e=>setA({...a, a1:e.target.value})} data-testid="pa1" style={{padding:10, border:"1px solid var(--border)", borderRadius:4}}>
            <option value="">--</option>
            {t.yesNo.map(o=> <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div style={{marginTop:14}}>
          <p><strong>{isGu? "પ્રશ્ન":"Question"}:</strong> {q2}</p>
          <textarea value={a.a2} onChange={e=>setA({...a, a2:e.target.value})} data-testid="pa2" style={{width:"100%", padding:10, minHeight:90, border:"1px solid var(--border)", borderRadius:4}} />
        </div>
        <div style={{marginTop:14}}>
          <p><strong>{isGu? "પ્રશ્ન":"Question"}:</strong> {t.primaryQ3}</p>
          <textarea value={a.a3} onChange={e=>setA({...a, a3:e.target.value})} data-testid="pa3" style={{width:"100%", padding:10, minHeight:90, border:"1px solid var(--border)", borderRadius:4}} />
        </div>
        <div style={{marginTop:14}}>
          <p><strong>{isGu? "પ્રશ્ન":"Question"}:</strong> {t.primaryQ4}</p>
          <textarea value={a.a4} onChange={e=>setA({...a, a4:e.target.value})} data-testid="pa4" style={{width:"100%", padding:10, minHeight:90, border:"1px solid var(--border)", borderRadius:4}} />
        </div>
        {err && <p className="error">{err}</p>}
        <div className="form-actions"><button className="btn btn-primary" onClick={submit} data-testid="primary-submit">{t.submit}</button></div>
      </div>
    </div>
  );
}

export function PrimaryFSReview() {
  const navigate = useNavigate();
  const pleaId = window.location.pathname.split("/").pop();
  const [plea, setPlea] = useState(null);
  const [ans, setAns] = useState(null);
  const [court, setCourt] = useState(null);
  useEffect(() => {
    api.get(`/pleas/${pleaId}`).then(({data}) => {
      setPlea(data);
      api.get(data?.court_id ? `/courts/${data.court_id}` : "/courts/default").then(({data: courtData}) => setCourt(courtData));
    });
    api.get(`/primary-fs/by-plea/${pleaId}`).then(({data}) => setAns(data));
  }, [pleaId]);
  const printRef = React.useRef(null);
  const autoDl = React.useRef(false);
  useEffect(() => {
    if (autoDl.current || !plea || !ans || !court || new URLSearchParams(window.location.search).get("download") !== "1") return;
    autoDl.current = true;
    setTimeout(() => { if (printRef.current) downloadPdf(printRef.current, `PrimaryFS_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_")); }, 800);
  });
  // Opened from "My Entries → Digitally Sign": open the signing dialog once ready.
  const autoSign = React.useRef(false);
  useEffect(() => {
    if (autoSign.current || !plea || !ans || !court || new URLSearchParams(window.location.search).get("sign") !== "1") return;
    autoSign.current = true;
    setTimeout(() => { if (printRef.current) signElement(printRef.current, `PrimaryFS_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_"), "primary_fs", pleaId, undefined, plea.court_id); }, 800);
  });
  if (!plea || !ans) return null;
  const t = T[plea.language];
  const isGu = plea.language === "gu";
  const c = court ? (isGu ? court.gujarati : court.english) : null;
  const q2 = plea.charge === "138" ? t.primaryQ2_138 : t.primaryQ2_25;
  const onPrint = () => {
    const fname = `PrimaryFS_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_");
    downloadPdf(printRef.current, fname);
  };
  return (
    <div className="app-shell">
      <div className="no-print"><TopBar title="Primary FS — Review" /></div>
      <div className="page" data-testid="primary-fs-review-page">
        <div className="print-doc" ref={printRef}>
          <div className="case-line"><span>{isGu? "ઇ. ફો. કે. ન.":"e. C. C. No."}: {plea.accused.case_no}</span></div>
          <div><strong>{isGu? "આરોપી નું નામ":"Name of Accused"}:</strong> {plea.accused.name}</div>
          <div><strong>{isGu? "આરોપી નું સરનામું":"Address of Accused"}:</strong> {plea.accused.address}</div>
          <h2 style={{textAlign:"center", marginTop:20}}>{t.fsTitle}</h2>
          <table className="qa-table">
            <tbody>
              <tr><td>{isGu? "પ્રશ્ન":"Question"}</td><td>- {t.primaryQ1}</td></tr>
              <tr><td>{isGu? "ઉત્તર":"Answer"}</td><td>- {ans.a1}</td></tr>
              <tr><td>{isGu? "પ્રશ્ન":"Question"}</td><td>- {q2}</td></tr>
              <tr><td>{isGu? "ઉત્તર":"Answer"}</td><td>- {ans.a2}</td></tr>
              <tr><td>{isGu? "પ્રશ્ન":"Question"}</td><td>- {t.primaryQ3}</td></tr>
              <tr><td>{isGu? "ઉત્તર":"Answer"}</td><td>- {ans.a3}</td></tr>
              <tr><td>{isGu? "પ્રશ્ન":"Question"}</td><td>- {t.primaryQ4}</td></tr>
              <tr><td>{isGu? "ઉત્તર":"Answer"}</td><td>- {ans.a4}</td></tr>
            </tbody>
          </table>
          <div style={{marginTop:24}}>{isGu? "તા. ":"Dt. "}{today()}</div>
          <div>{isGu? "સ્થળ ":"Place — "}{c?.place}</div>
          <p style={{marginTop:16, fontStyle:"italic"}}>{t.readOver}</p>
          <div className="signature-row">
            <div>
              <div style={{marginTop:50, borderTop:"1px solid #000", paddingTop:6, width:200}}>{isGu? "આરોપી પક્ષ ની સહી":"(Signature of The Accused)"}</div>
              <div style={{marginTop:24, borderTop:"1px solid #000", paddingTop:6, width:200}}>{isGu? "ઓળખ આપનાર ની સહી":"(Signature of Identifier)"}</div>
            </div>
            <div>
              <div>{t.beforeMe}</div>
              <div style={{marginTop:50, borderTop:"1px solid #000", paddingTop:6, width:200}}>({c?.judge_name})</div>
              <div>{c?.judge_designation}</div>
              <div>{c?.place}</div>
            </div>
          </div>
        </div>
        <div className="form-actions no-print">
          <button className="btn btn-secondary" onClick={() => navigate(`/advocate/primary-fs/form/${pleaId}`)} data-testid="pfs-edit">{t.edit}</button>
          <button className="btn btn-primary" onClick={onPrint} data-testid="pfs-print">{t.print}</button>
          <button className="btn btn-outline" onClick={() => signElement(printRef.current, `PrimaryFS_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_"), "primary_fs", pleaId, undefined, plea.court_id)} data-testid="primary_fs-sign">Digitally Sign</button>
        </div>
      </div>
    </div>
  );
}
