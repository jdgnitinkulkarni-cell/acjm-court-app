import React, { useEffect, useState } from "react";
import { useSort, SortTh } from "../lib/sortable";
import { useNavigate } from "react-router-dom";
import api, { clearAuth, getUser } from "../lib/api";
import { TopBar } from "./AdminDashboard";
import { WelcomePanel, StatCard } from "./SideNav";

function StaffStats() {
  const navigate = useNavigate();
  const [s, setS] = useState({});
  useEffect(() => {
    api.get("/demands/pending-count").then(({ data }) => setS((x) => ({ ...x, demands: data?.pending || 0 }))).catch(() => {});
    api.get("/registrations").then(({ data }) => setS((x) => ({ ...x, regs: (data || []).filter((r) => r.status === "pending").length }))).catch(() => {});
    api.get("/messages/me").then(({ data }) => setS((x) => ({ ...x, unread: data?.unread || 0 }))).catch(() => {});
    api.get("/submitted-documents/count").then(({ data }) => setS((x) => ({ ...x, submitted: data?.new || 0 }))).catch(() => {});
  }, []);
  return (
    <div className="stats-row">
      <StatCard label="Pending demands from Court" value={s.demands} tone="rust" onClick={() => navigate("/staff/demands")} />
      <StatCard label="Litigant registrations awaiting approval" value={s.regs} tone="gold" onClick={() => navigate("/staff/registrations")} />
      <StatCard label="Unread messages" value={s.unread} tone="plum" onClick={() => navigate("/message-center")} />
      <StatCard label="New documents submitted" value={s.submitted} tone="green" onClick={() => navigate("/court/submitted-documents")} testid="stat-submitted" />
    </div>
  );
}

export function StaffDashboard() {
  const navigate = useNavigate();
  const user = getUser();
  const court = user?.court;
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (window.location.hash === "#upload") setTimeout(() => document.getElementById("upload")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  });

  const onUploadCases = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/local-cases/bulk-upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setUploadMsg(`Done: ${data.added} case(s) added, ${data.updated} updated (of ${data.total_rows} rows read).`);
    } catch (err) {
      setUploadMsg(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="app-shell">
      <TopBar title="Staff Workspace" />
      <div className="page" data-testid="staff-dashboard">
        <WelcomePanel subtitle="Staff Workspace — all staff options are in the menu on the left." />
        <div className="info-strip" data-testid="staff-court-banner">
          <strong>Assigned Court:</strong>{" "}
          {court?.english?.court_name || (
            <span style={{color:"#a34037"}}>Not assigned. Please contact Admin to assign a court.</span>
          )}
        </div>
        <StaffStats />
        <div className="info-card" id="upload">
          <div>
            <h3>Upload Cases</h3>
            <p className="hint" style={{ margin: 0 }}>Add or update the court's pending cases from an Excel / CSV file.</p>
          </div>
          <label className="btn btn-primary" style={{ cursor: uploading ? "wait" : "pointer" }} data-testid="tile-upload-cases">
            {uploading ? "Uploading…" : "Upload Cases (Excel/CSV)"}
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={onUploadCases} disabled={uploading} data-testid="upload-cases-input" />
          </label>
        </div>
        {uploadMsg && <p className="hint" style={{ marginTop: 14 }}>{uploadMsg}</p>}
        <p className="hint" style={{ marginTop: 6 }}>
          Expects the same column layout as the court's pending-cases sheet: a "Cases" (or "Case Number") column
          and a "Party Name" column formatted as "Complainant Vs Accused".
        </p>
      </div>
    </div>
  );
}

export function ViewEntries() {
  const [pleas, setPleas] = useState([]);
  const [docs, setDocs] = useState([]);
  const [sel, setSel] = useState({});
  const load = async () => {
    const [{ data: pleaData }, { data: docData }] = await Promise.all([
      api.get("/pleas"),
      api.get("/generated-documents"),
    ]);
    setPleas(pleaData);
    setDocs(docData);
  };
  useEffect(() => { load(); }, []);
  const psrt = useSort(pleas, { case: (p) => p.accused?.case_no, name: (p) => p.accused?.name, type: (p) => (p.plea_type === "sanjabi" ? "Sanjabi Tari" : "Normal"), language: (p) => p.language });
  const dsrt = useSort(docs, { date: (d) => d.date || d.created_at, user: (d) => d.advocate_name || d.applicant_name });
  const delSelected = async () => {
    const ids = Object.entries(sel).filter(([_,v]) => v).map(([k]) => k);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} entries?`)) return;
    for (const id of ids) await api.delete(`/pleas/${id}`);
    setSel({}); load();
  };
  return (
    <div className="app-shell">
      <TopBar title="View Entries" />
      <div className="page" data-testid="view-entries-page">
        <div className="row" style={{justifyContent:"space-between"}}>
          <h1>Plea Entries</h1>
          <button className="btn btn-danger" onClick={delSelected} data-testid="delete-entries-btn">Delete</button>
        </div>
        <table className="entries">
          <thead><tr><th></th><SortTh label="C. C. No." k="case" s={psrt} /><SortTh label="Accused Name" k="name" s={psrt} /><SortTh label="Normal / Sanjabi Tari" k="type" s={psrt} /><SortTh label="Language" k="language" s={psrt} /></tr></thead>
          <tbody>
            {psrt.sorted.map(p => (
              <tr key={p.id}>
                <td><input type="checkbox" checked={!!sel[p.id]} onChange={(e) => setSel({...sel, [p.id]: e.target.checked})} data-testid={`row-check-${p.id}`} /></td>
                <td>{p.accused?.case_no}</td>
                <td>{p.accused?.name}</td>
                <td>{p.plea_type === "sanjabi" ? "Sanjabi Tari" : "Normal"}</td>
                <td>{p.language === "gu" ? "Gujarati" : "English"}</td>
              </tr>
            ))}
            {pleas.length === 0 && <tr><td colSpan="5" style={{textAlign:"center", color:"#6b7280"}}>No entries yet.</td></tr>}
          </tbody>
        </table>
        <h1 style={{marginTop:28}}>Application / Pursis / Surety Entries</h1>
        <table className="entries">
          <thead>
            <tr>
              <SortTh label="C. C. No." k="case_number" s={dsrt} />
              <SortTh label="Complainant" k="complainant_name" s={dsrt} />
              <SortTh label="Accused" k="accused_name" s={dsrt} />
              <SortTh label="Document Type" k="document_type" s={dsrt} />
              <SortTh label="Producing Party" k="producing_party" s={dsrt} />
              <SortTh label="Language" k="language" s={dsrt} />
              <SortTh label="Generated Date" k="date" s={dsrt} />
              <SortTh label="Advocate / User" k="user" s={dsrt} />
            </tr>
          </thead>
          <tbody>
            {dsrt.sorted.map(d => (
              <tr key={d.id}>
                <td>{d.case_number}</td>
                <td>{d.complainant_name}</td>
                <td>{d.accused_name}</td>
                <td>{d.document_type}</td>
                <td>{d.producing_party}</td>
                <td>{d.language === "gu" ? "Gujarati" : "English"}</td>
                <td>{d.date || d.created_at?.slice(0, 10)}</td>
                <td>{d.advocate_name || d.applicant_name || "-"}</td>
              </tr>
            ))}
            {docs.length === 0 && <tr><td colSpan="8" style={{textAlign:"center", color:"#6b7280"}}>No generated document entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ChangeCreds() {
  const navigate = useNavigate();
  const [existingId, setExId] = useState("");
  const [newId, setNewId] = useState("");
  const [confirmId, setConfId] = useState("");
  const [existingPwd, setExPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfPwd] = useState("");
  const [msg, setMsg] = useState("");
  const postChangeRedirect = () => {
    clearAuth();
    navigate("/");
  };
  const submitId = async () => {
    setMsg("");
    if (newId !== confirmId) { setMsg("New ID and Confirm ID do not match"); return; }
    try {
      await api.post("/auth/change-credentials", { field: "id", existing_id: existingId, new_id: newId });
      alert("ID changed. Please re-login.");
      postChangeRedirect();
    } catch (e) { setMsg(e.response?.data?.detail || "Failed"); }
  };
  const submitPwd = async () => {
    setMsg("");
    if (newPwd !== confirmPwd) { setMsg("New Password and Confirm Password do not match"); return; }
    try {
      await api.post("/auth/change-credentials", { field: "password", existing_password: existingPwd, new_password: newPwd });
      alert("Password changed. Please re-login.");
      postChangeRedirect();
    } catch (e) { setMsg(e.response?.data?.detail || "Failed"); }
  };
  return (
    <div className="app-shell">
      <TopBar title="Change ID & Password" />
      <div className="page" data-testid="change-creds-page" style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:24}}>
        <div>
          <h2>Change ID</h2>
          <div className="form-grid">
            <label>Enter Existing ID</label><input value={existingId} onChange={e=>setExId(e.target.value)} data-testid="ex-id" />
            <label>Enter New ID</label><input value={newId} onChange={e=>setNewId(e.target.value)} data-testid="new-id" />
            <label>Confirm New ID</label><input value={confirmId} onChange={e=>setConfId(e.target.value)} data-testid="conf-id" />
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={submitId} data-testid="submit-id">Submit</button></div>
        </div>
        <div>
          <h2>Change Password</h2>
          <div className="form-grid">
            <label>Enter Existing Password</label><input type="password" value={existingPwd} onChange={e=>setExPwd(e.target.value)} data-testid="ex-pwd" />
            <label>Enter New Password</label><input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} data-testid="new-pwd" />
            <label>Confirm New Password</label><input type="password" value={confirmPwd} onChange={e=>setConfPwd(e.target.value)} data-testid="conf-pwd" />
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={submitPwd} data-testid="submit-pwd">Submit</button></div>
        </div>
        {msg && <p className="error" style={{gridColumn:"1 / -1"}}>{msg}</p>}
      </div>
    </div>
  );
}

export function DraftFinalFS() {
  const [pleas, setPleas] = useState([]);
  const [pleaId, setPleaId] = useState("");
  const [questions, setQuestions] = useState([]);
  const [show, setShow] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editIdx, setEditIdx] = useState(-1);
  const [text, setText] = useState("");
  const [availableAt, setAvailableAt] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api.get("/pleas").then(({data}) => setPleas(data));
  }, []);
  useEffect(() => {
    if (!pleaId) { setQuestions([]); return; }
    api.get(`/final-fs/questions/by-plea/${pleaId}`).then(({data}) => {
      setQuestions(data?.questions || []);
      setAvailableAt(data?.available_at ? data.available_at.slice(0, 16) : "");
    });
  }, [pleaId]);
  const openAdd = () => { setEditIdx(-1); setText(""); setShow(true); };
  const openEdit = (i) => { setEditIdx(i); setText(questions[i]); setShow(true); };
  const selectedPlea = pleas.find((p) => p.id === pleaId);
  const deleteQuestion = (i) => {
    if (!window.confirm("Delete this question?")) return;
    setQuestions(questions.filter((_, idx) => idx !== i));
  };
  const submitDlg = () => {
    if (!text.trim()) return;
    const next = [...questions];
    if (editIdx === -1) next.push(text.trim()); else next[editIdx] = text.trim();
    setQuestions(next); setShow(false);
  };
  const requestSchedule = () => {
    setMsg("");
    if (!pleaId) { setMsg("Please select a case number first."); return; }
    if (!questions.length) { setMsg("Please add at least one question."); return; }
    setShowSchedule(true);
  };
  const submitAll = async () => {
    setMsg("");
    if (!availableAt) { setMsg("Please select the date and time for Advocate / Accused visibility."); return; }
    try {
      await api.post("/final-fs/questions", { plea_id: pleaId, questions, available_at: new Date(availableAt).toISOString() });
      setShowSchedule(false);
      setMsg("Questions submitted for this case. They will appear under Final FS only after the selected date and time.");
    } catch (e) { setMsg(e.response?.data?.detail || "Failed"); }
  };
  const downloadXlsx = () => {
    window.open(`${process.env.REACT_APP_BACKEND_URL || window.location.origin}/api/admin/excel/download`, "_blank");
  };
  const requestDeleteFinalFs = () => {
    setMsg("");
    if (!pleaId) { setMsg("Please select a case number first."); return; }
    setShowDelete(true);
  };
  const deleteFinalFs = async () => {
    setMsg("");
    try {
      await api.delete(`/final-fs/questions/by-plea/${pleaId}`);
      setQuestions([]);
      setAvailableAt("");
      setShowDelete(false);
      setMsg("Entire Final FS entry deleted for the selected case.");
    } catch (e) { setMsg(e.response?.data?.detail || "Failed"); }
  };
  return (
    <div className="app-shell">
      <TopBar title="Draft Final FS" />
      <div className="page" data-testid="draft-final-fs-page">
        <h1>Draft Final FS Questions</h1>
        <p className="hint">Select a case number from the entries below, then add the questions specific to that case. The model questions can be downloaded from the Excel file.</p>
        <div className="form-grid" style={{gridTemplateColumns:"180px 1fr"}}>
          <label>Select Case Number</label>
          <select value={pleaId} onChange={e=>setPleaId(e.target.value)} data-testid="draft-case-select">
            <option value="">-- select a case --</option>
            {pleas.map(p => (
              <option key={p.id} value={p.id}>
                {p.accused.case_no} — {p.accused.name} ({p.language === "gu" ? "Gujarati" : "English"})
              </option>
            ))}
          </select>
        </div>
        {pleaId && (
          <ul className="q-list" style={{marginTop:18}}>
            {questions.map((q, i) => (
              <li key={i}>
                <span>{i+1}. {q}</span>
                <span className="row" style={{gap:8}}>
                  <button className="btn btn-outline" style={{padding:"4px 10px"}} onClick={() => openEdit(i)}>Edit</button>
                  <button className="btn btn-danger" style={{padding:"4px 10px"}} onClick={() => deleteQuestion(i)} data-testid={`delete-question-${i}`}>Delete</button>
                </span>
              </li>
            ))}
            {questions.length === 0 && <li style={{color:"#6b7280"}}>No questions added yet for this case.</li>}
          </ul>
        )}
        <div className="row" style={{marginTop:14}}>
          <button className="btn btn-primary" onClick={openAdd} disabled={!pleaId} data-testid="add-question-btn">+ Add Ques.</button>
          <button className="btn btn-orange" onClick={downloadXlsx} data-testid="download-xlsx-btn">Xlsx file</button>
          <button className="btn btn-danger" onClick={requestDeleteFinalFs} disabled={!pleaId} data-testid="delete-final-fs-btn">Delete</button>
          <button className="btn btn-advocate" onClick={requestSchedule} disabled={!pleaId} data-testid="submit-all-btn">Submit</button>
        </div>
        {msg && <p className="success">{msg}</p>}
      </div>
      {show && (
        <div className="modal-backdrop" onClick={() => setShow(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>Describe the question below</h3>
            <textarea style={{width:"100%", minHeight:80, padding:10, border:"1px solid var(--border)", borderRadius:4}} value={text} onChange={e=>setText(e.target.value)} data-testid="q-text-input" />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShow(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitDlg} data-testid="q-text-submit">Submit</button>
            </div>
          </div>
        </div>
      )}
      {showSchedule && (
        <div className="modal-backdrop" onClick={() => setShowSchedule(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>Select date and time</h3>
            <p className="hint">The drafted Final FS will appear to Advocate / Accused only after this date and time.</p>
            <input
              type="datetime-local"
              value={availableAt}
              onChange={e=>setAvailableAt(e.target.value)}
              data-testid="ffs-available-at"
            />
            {msg && <p className="error">{msg}</p>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSchedule(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitAll} data-testid="ffs-schedule-submit">Submit</button>
            </div>
          </div>
        </div>
      )}
      {showDelete && (
        <div className="modal-backdrop" onClick={() => setShowDelete(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>Delete Final FS</h3>
            <p>Do you want to delete entire Final FS entry for Case No. - {selectedPlea?.accused?.case_no || ""}?</p>
            {msg && <p className="error">{msg}</p>}
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={deleteFinalFs} data-testid="confirm-delete-final-fs">Confirm</button>
              <button className="btn btn-secondary" onClick={() => setShowDelete(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
