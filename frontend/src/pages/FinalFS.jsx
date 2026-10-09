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
const finalDraftKey = (pleaId) => `acjm_final_fs_draft:${pleaId}`;

export function FinalFSCaseSelect() {
  const navigate = useNavigate();
  const [pleas, setPleas] = useState([]);
  const [allowedIds, setAllowedIds] = useState([]);
  const [sel, setSel] = useState("");
  useEffect(() => {
    const courtId = getSelectedCourtId();
    if (!courtId) { navigate("/advocate", { replace: true }); return; }
    api.get(`/pleas?court_id=${courtId}`).then(({data}) => setPleas(data));
    api.get(`/final-fs/cases-with-questions?court_id=${courtId}`).then(({data}) => setAllowedIds(data || []));
  }, [navigate]);
  const filtered = pleas.filter(p => allowedIds.includes(p.id));
  const proceed = () => {
    if (!sel) return;
    navigate(`/advocate/final-fs/form/${sel}`);
  };
  return (
    <div className="app-shell">
      <TopBar title="Final FS" />
      <div className="page" data-testid="final-fs-select-page">
        <h1>Select Case Number</h1>
        <p className="hint">Only cases for which Staff has drafted Final FS questions and whose scheduled date/time has arrived appear below.</p>
        <select value={sel} onChange={e=>setSel(e.target.value)} data-testid="ffs-case-select" style={{padding:10, width:"100%", border:"1px solid var(--border)", borderRadius:4}}>
          <option value="">-- select --</option>
          {filtered.map(p => <option key={p.id} value={p.id}>{p.accused.case_no} — {p.accused.name}</option>)}
        </select>
        {filtered.length === 0 && <p className="hint" style={{marginTop:10}}>No Final FS is available at this time.</p>}
        <div className="form-actions"><button className="btn btn-primary" onClick={proceed} disabled={!sel} data-testid="ffs-proceed">Proceed</button></div>
      </div>
    </div>
  );
}

export function FinalFSForm() {
  const navigate = useNavigate();
  const pleaId = window.location.pathname.split("/").pop();
  const [plea, setPlea] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get(`/pleas/${pleaId}`).then(({data}) => setPlea(data));
    api.get(`/final-fs/questions/by-plea/${pleaId}`).then(({data}) => {
      const q = data?.questions || [];
      setQuestions(q);
      api.get(`/final-fs/entries/by-plea/${pleaId}`).then(({data: e}) => {
        if (e?.answers && e.answers.length === q.length) setAnswers(e.answers);
        else {
          try {
            const saved = JSON.parse(localStorage.getItem(finalDraftKey(pleaId)) || "[]");
            setAnswers(saved.length === q.length ? saved : q.map(() => ""));
          } catch (_) {
            setAnswers(q.map(() => ""));
          }
        }
      });
    });
  }, [pleaId]);
  useEffect(() => {
    if (answers.length) localStorage.setItem(finalDraftKey(pleaId), JSON.stringify(answers));
  }, [answers, pleaId]);
  if (!plea) return null;
  const t = T[plea.language];
  const isGu = plea.language === "gu";
  const submit = async () => {
    if (answers.some(a => !a)) { setErr("All answers are mandatory."); return; }
    await api.post("/final-fs/entries", { plea_id: pleaId, answers });
    localStorage.removeItem(finalDraftKey(pleaId));
    navigate(`/advocate/final-fs/review/${pleaId}`);
  };
  return (
    <div className="app-shell">
      <TopBar title="Final FS Questioner" />
      <div className="page" data-testid="final-fs-form-page">
        <p><strong>{isGu? "ફો. કે. ન.":"C.C. No."}:</strong> {plea.accused.case_no}</p>
        <p><strong>{isGu? "આરોપી નું નામ":"Name of The Accused"}:</strong> {plea.accused.name}</p>
        <p><strong>{isGu? "આરોપી નું સરનામું":"Address"}:</strong> {plea.accused.address}</p>
        <h2 style={{marginTop:20}}>{t.fsTitle}</h2>
        {questions.map((q, i) => (
          <div key={i} style={{marginTop:14}}>
            <p><strong>{isGu? "પ્રશ્ન":"Question"} {i+1}:</strong> {q}</p>
            <textarea value={answers[i] || ""} onChange={e => { const n=[...answers]; n[i]=e.target.value; setAnswers(n); }} data-testid={`ffs-a-${i}`} style={{width:"100%", minHeight:80, padding:10, border:"1px solid var(--border)", borderRadius:4}} />
          </div>
        ))}
        {err && <p className="error">{err}</p>}
        <div className="form-actions"><button className="btn btn-primary" onClick={submit} data-testid="ffs-submit">{t.submit}</button></div>
      </div>
    </div>
  );
}

export function FinalFSReview() {
  const navigate = useNavigate();
  const pleaId = window.location.pathname.split("/").pop();
  const [plea, setPlea] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [entry, setEntry] = useState(null);
  const [court, setCourt] = useState(null);
  useEffect(() => {
    api.get(`/pleas/${pleaId}`).then(({data}) => {
      setPlea(data);
      api.get(data?.court_id ? `/courts/${data.court_id}` : "/courts/default").then(({data: courtData}) => setCourt(courtData));
    });
    api.get(`/final-fs/questions/by-plea/${pleaId}`).then(({data}) => setQuestions(data?.questions || []));
    api.get(`/final-fs/entries/by-plea/${pleaId}`).then(({data}) => setEntry(data));
  }, [pleaId]);
  const printRef = React.useRef(null);
  const autoDl = React.useRef(false);
  useEffect(() => {
    if (autoDl.current || !plea || !entry || !court || new URLSearchParams(window.location.search).get("download") !== "1") return;
    autoDl.current = true;
    setTimeout(() => { if (printRef.current) downloadPdf(printRef.current, `FinalFS_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_")); }, 800);
  });
  // Opened from "My Entries → Digitally Sign": open the signing dialog once ready.
  const autoSign = React.useRef(false);
  useEffect(() => {
    if (autoSign.current || !plea || !entry || !court || new URLSearchParams(window.location.search).get("sign") !== "1") return;
    autoSign.current = true;
    setTimeout(() => { if (printRef.current) signElement(printRef.current, `FinalFS_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_"), "final_fs", pleaId, undefined, plea.court_id); }, 800);
  });
  if (!plea || !entry) return null;
  const t = T[plea.language];
  const isGu = plea.language === "gu";
  const c = court ? (isGu ? court.gujarati : court.english) : null;
  const onPrint = () => {
    const fname = `FinalFS_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_");
    downloadPdf(printRef.current, fname);
  };
  return (
    <div className="app-shell">
      <div className="no-print"><TopBar title="Final FS — Review" /></div>
      <div className="page" data-testid="final-fs-review-page">
        <div className="print-doc" ref={printRef}>
          <div className="case-line"><span>{isGu? "ઇ. ફો. કે. ન.":"e. C. C. No."}: {plea.accused.case_no}</span></div>
          <div><strong>{isGu? "આરોપી નું નામ":"Name of Accused"}:</strong> {plea.accused.name}</div>
          <div><strong>{isGu? "આરોપી નું સરનામું":"Address of Accused"}:</strong> {plea.accused.address}</div>
          <h2 style={{textAlign:"center", marginTop:20}}>{t.fsTitle}</h2>
          <table className="qa-table">
            <tbody>
              {questions.map((q, i) => (
                <React.Fragment key={i}>
                  <tr><td>{isGu? "પ્રશ્ન":"Question"}</td><td>- {q}</td></tr>
                  <tr><td>{isGu? "ઉત્તર":"Answer"}</td><td>- {entry.answers?.[i]}</td></tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div style={{marginTop:24}}>{isGu? "તા. ":"Dt. "}{today()}</div>
          <div>{isGu? "સ્થળ ":"Place — "}{c?.place}</div>
          <p style={{marginTop:16, fontStyle:"italic"}}>{t.readOver}</p>
          <div className="signature-row">
            <div>
              <div style={{marginTop:50, borderTop:"1px solid #000", paddingTop:6, width:200}}>{isGu? "આરોપી પક્ષ ની સહી":"(Signature of The Accused)"}</div>
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
          <button className="btn btn-secondary" onClick={() => navigate(`/advocate/final-fs/form/${pleaId}`)} data-testid="ffs-edit">{t.edit}</button>
          <button className="btn btn-primary" onClick={onPrint} data-testid="ffs-print">{t.print}</button>
          <button className="btn btn-outline" onClick={() => signElement(printRef.current, `FinalFS_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_"), "final_fs", pleaId, undefined, plea.court_id)} data-testid="final_fs-sign">Digitally Sign</button>
        </div>
      </div>
    </div>
  );
}
