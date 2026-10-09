import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getUser } from "../lib/api";
import { TopBar } from "./AdminDashboard";

// Statement of a witness under Section 183 BNSS. The police bring the witness
// before the Court; there is no court case yet, so the record is identified by
// Police Station + FIR No. The statement itself is typed on the same typing
// page as depositions (record_type "s183"), without Hostile / Start Cross.

const LANG_OPTIONS = [
  { value: "gu", label: "Gujarati" },
  { value: "hi", label: "Hindi" },
  { value: "en", label: "English" },
];
const STORAGE_KEY = "acjm_s183_wizard_v1";
const SKIP_CONFIRM_KEY = "acjm_s183_skip_confirm";
const PERSONAL_KEYS = ["witness_name", "father_husband_name", "religion", "age", "occupation", "address", "contact_no", "language"];
const POLICE_KEYS = ["police_station", "fir_number", "offence_sections"];

const emptyForm = () => ({
  police_station: "", fir_number: "", offence_sections: "",
  witness_name: "", father_husband_name: "", religion: "", age: "", occupation: "",
  address: "", contact_no: "", sr_no: "", language: "gu",
  av_conferencing: false, vulnerable_witness: false,
});

function loadState() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); } catch (e) { return null; }
}
function saveState(state) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* non-fatal */ }
}
function clearState() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
}

export default function Statement183Wizard() {
  const navigate = useNavigate();
  const user = getUser();
  const courts = user?.courts || [];
  const saved = loadState() || {};
  const [courtId, setCourtId] = useState(saved.courtId || courts[0]?.id || "");
  const [step, setStep] = useState(saved.step || "mode");
  const [mode, setMode] = useState(saved.mode || null);
  const [clientStartTime, setClientStartTime] = useState(saved.clientStartTime || null);
  const [existingList, setExistingList] = useState([]);
  const [existingId, setExistingId] = useState(saved.existingId || "");
  const [original, setOriginal] = useState(saved.original || null);
  const [editDetails, setEditDetails] = useState(!!saved.editDetails);
  const [form, setForm] = useState(saved.form || emptyForm());
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    saveState({ courtId, step, mode, clientStartTime, existingId, original, editDetails, form });
  }, [courtId, step, mode, clientStartTime, existingId, original, editDetails, form]);

  const loadIncomplete = (cid) => {
    if (!cid) return;
    api.get("/depositions/s183-incomplete", { params: { court_id: cid } })
      .then(({ data }) => setExistingList(Array.isArray(data) ? data : []))
      .catch(() => setExistingList([]));
  };

  useEffect(() => {
    if (step === "form" && mode === "existing") loadIncomplete(courtId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const chooseMode = (m) => {
    setMode(m);
    setClientStartTime(new Date().toISOString());
    setExistingId("");
    setOriginal(null);
    setEditDetails(false);
    setForm(emptyForm());
    setMsg("");
    if (m === "existing") loadIncomplete(courtId);
    setStep("form");
  };

  const pickExisting = (id) => {
    setExistingId(id);
    setEditDetails(false);
    const w = existingList.find((x) => x.id === id);
    if (!w) { setOriginal(null); return; }
    const details = {};
    [...PERSONAL_KEYS, ...POLICE_KEYS, "sr_no"].forEach((k) => { details[k] = w[k] || ""; });
    details.language = w.language || "gu";
    setOriginal(details);
    setForm({ ...emptyForm(), ...details, av_conferencing: !!w.av_conferencing, vulnerable_witness: !!w.vulnerable_witness });
    try { localStorage.setItem("acjm_mic_lang", details.language); } catch (e) { /* ignore */ }
  };

  const cancelEdit = () => {
    if (original) setForm((f) => ({ ...f, ...original }));
    setEditDetails(false);
  };

  const goBack = () => {
    setMsg("");
    if (step === "form") { setStep("mode"); return; }
    clearState();
    navigate("/judge-desk/oral-evidence");
  };

  const canProceed = () => {
    if (mode === "existing" && !existingId) return false;
    const required = ["police_station", "fir_number", "offence_sections", "witness_name", "sr_no", "language"];
    return required.every((k) => String(form[k] || "").trim());
  };

  const proceed = () => {
    if (!canProceed()) { setMsg("Please complete all required fields."); return; }
    setMsg("");
    let skip = false;
    try { skip = localStorage.getItem(SKIP_CONFIRM_KEY) === "1"; } catch (e) { /* ignore */ }
    if (skip) { doCreate(); return; }
    setShowConfirm(true);
  };

  const doCreate = async () => {
    setSubmitting(true);
    setMsg("");
    const key = `${form.police_station.trim()} P.S. FIR No. ${form.fir_number.trim()}`;
    try {
      const { data } = await api.post("/depositions", {
        ...form,
        record_type: "s183",
        court_id: courtId,
        case_ids: [key],
        primary_case_number: key,
        mode,
        resume_of: mode === "existing" ? existingId : null,
        client_start_time_iso: clientStartTime,
        stage: "chief",
        producing_party: "",
        defending_party: "",
      });
      clearState();
      navigate(`/judge-desk/oral-evidence/deposition/type/${data.id}`);
    } catch (e) {
      setMsg(e.response?.data?.detail || "Failed to start the statement");
      setSubmitting(false);
      setShowConfirm(false);
    }
  };

  const showInputs = mode === "new" || (existingId && editDetails);
  const langLabel = LANG_OPTIONS.find((o) => o.value === form.language)?.label;

  return (
    <div className="app-shell">
      <TopBar title="BNSS, 183 Statement" onBack={goBack} />
      <div className={`page dep-entry-lang-${form.language || "gu"}`} data-testid="s183-wizard" style={{ width: "80%", maxWidth: 1180, boxSizing: "border-box" }}>
        {courts.length > 1 && (
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <label>Court</label>
            <select value={courtId} onChange={(e) => { setCourtId(e.target.value); setExistingId(""); setOriginal(null); if (mode === "existing") loadIncomplete(e.target.value); }}>
              {courts.map((c) => <option key={c.id} value={c.id}>{c.english?.court_name}</option>)}
            </select>
          </div>
        )}

        {step === "mode" && (
          <>
            <h1>Statement under Section 183 BNSS</h1>
            <p className="hint">Statement of a witness produced by the police before the Court.</p>
            <div className="dashboard-grid" style={{ marginTop: 20 }}>
              <div className="tile purple" data-testid="s183-new" onClick={() => chooseMode("new")}>New Statement</div>
              <div className="tile blue" data-testid="s183-existing" onClick={() => chooseMode("existing")}>Incomplete Statement</div>
            </div>
            <div className="form-actions"><button className="btn btn-secondary" onClick={goBack}>Back</button></div>
          </>
        )}

        {step === "form" && (
          <>
            <h1>{mode === "new" ? "New Statement u/s 183 BNSS" : "Incomplete Statement u/s 183 BNSS"}</h1>

            {mode === "existing" && (
              <div className="form-grid">
                <label>Select Witness</label>
                <select value={existingId} onChange={(e) => pickExisting(e.target.value)} data-testid="s183-select-witness">
                  <option value="">-- select witness --</option>
                  {existingList.map((w) => (
                    <option key={w.id} value={w.id}>{w.witness_name} ({w.police_station} P.S., FIR {w.fir_number}, Sr. {w.sr_no})</option>
                  ))}
                </select>
                {existingList.length === 0 && <span className="hint">No incomplete statements found.</span>}
              </div>
            )}

            {mode === "existing" && existingId && !editDetails && (
              <div style={{ marginTop: 12, padding: 14, border: "1px solid var(--border)", borderRadius: 6, background: "#fafafa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <strong>Details (as recorded earlier)</strong>
                  <button type="button" className="btn btn-outline" style={{ padding: "4px 12px" }} onClick={() => setEditDetails(true)} data-testid="s183-edit-details">Edit Details</button>
                </div>
                <table className="entries" style={{ marginTop: 8 }}>
                  <tbody>
                    <tr><td>Police Station</td><td>{form.police_station}</td></tr>
                    <tr><td>FIR No.</td><td>{form.fir_number}</td></tr>
                    <tr><td>Sections / Offence</td><td>{form.offence_sections}</td></tr>
                    <tr><td>Name of Witness</td><td>{form.witness_name}</td></tr>
                    <tr><td>Father's / Husband's Name</td><td>{form.father_husband_name}</td></tr>
                    <tr><td>Religion</td><td>{form.religion}</td></tr>
                    <tr><td>Age</td><td>{form.age}</td></tr>
                    <tr><td>Occupation</td><td>{form.occupation}</td></tr>
                    <tr><td>Address</td><td>{form.address}</td></tr>
                    <tr><td>Contact No.</td><td>{form.contact_no}</td></tr>
                    <tr><td>Sr. No. of Witness</td><td>{form.sr_no}</td></tr>
                    <tr><td>Language of Statement</td><td>{langLabel}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {mode === "existing" && existingId && editDetails && (
              <p className="hint" style={{ marginTop: 12 }}>
                Correct any detail that was recorded wrongly earlier. A correction note (in the language of the statement) will be
                added at the start of this statement for every witness detail you change.{" "}
                <button type="button" className="btn btn-outline" style={{ padding: "2px 10px", marginLeft: 6 }} onClick={cancelEdit}>Cancel Edit</button>
              </p>
            )}

            {showInputs && (
              <>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <label>Name of Police Station</label>
                  <input value={form.police_station} onChange={(e) => set("police_station", e.target.value)} />
                  <label>FIR No.</label>
                  <input value={form.fir_number} onChange={(e) => set("fir_number", e.target.value)} />
                  <label>Sections / Offence</label>
                  <input value={form.offence_sections} onChange={(e) => set("offence_sections", e.target.value)} />
                </div>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <label>Name of Witness</label>
                  <input value={form.witness_name} onChange={(e) => set("witness_name", e.target.value)} />
                  <label>Father's / Husband's Name</label>
                  <input value={form.father_husband_name} onChange={(e) => set("father_husband_name", e.target.value)} />
                  <label>Religion</label>
                  <input value={form.religion} onChange={(e) => set("religion", e.target.value)} />
                  <label>Age</label>
                  <input value={form.age} onChange={(e) => set("age", e.target.value)} />
                  <label>Occupation</label>
                  <input value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
                  <label>Address</label>
                  <input value={form.address} onChange={(e) => set("address", e.target.value)} />
                  <label>Contact No. (optional)</label>
                  <input value={form.contact_no} onChange={(e) => set("contact_no", e.target.value)} />
                  <label>Sr. No. of Witness</label>
                  <input value={form.sr_no} onChange={(e) => set("sr_no", e.target.value)} />
                  <label>Language of Statement</label>
                  <select
                    value={form.language}
                    onChange={(e) => {
                      set("language", e.target.value);
                      try { localStorage.setItem("acjm_mic_lang", e.target.value); } catch (err) { /* ignore */ }
                    }}
                  >
                    {LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </>
            )}

            {(mode === "new" || existingId) && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
                  <input type="checkbox" checked={form.av_conferencing} onChange={(e) => set("av_conferencing", e.target.checked)} />
                  The statement of the witness is recorded through audio-video conferencing
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <input type="checkbox" checked={form.vulnerable_witness} onChange={(e) => set("vulnerable_witness", e.target.checked)} />
                  Vulnerable Witness
                </label>
              </>
            )}

            {msg && <p className="error">{msg}</p>}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={goBack}>Back</button>
              <button className="btn btn-primary" onClick={proceed} disabled={submitting}>Proceed</button>
            </div>
          </>
        )}

        {showConfirm && (
          <div className="modal-backdrop">
            <div className="modal">
              <h3>Confirm Details</h3>
              <table className="entries">
                <tbody>
                  <tr><td>Police Station</td><td>{form.police_station}</td></tr>
                  <tr><td>FIR No.</td><td>{form.fir_number}</td></tr>
                  <tr><td>Sections / Offence</td><td>{form.offence_sections}</td></tr>
                  <tr><td>Witness</td><td>{form.witness_name}</td></tr>
                  <tr><td>Sr. No.</td><td>{form.sr_no}</td></tr>
                  <tr><td>Language</td><td>{langLabel}</td></tr>
                </tbody>
              </table>
              <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
                <input type="checkbox" id="s183-skip-confirm" />
                Don't show this confirmation again
              </label>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Edit</button>
                <button
                  className="btn btn-primary"
                  disabled={submitting}
                  onClick={() => {
                    try { if (document.getElementById("s183-skip-confirm")?.checked) localStorage.setItem(SKIP_CONFIRM_KEY, "1"); } catch (e) { /* ignore */ }
                    doCreate();
                  }}
                >
                  Proceed
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
