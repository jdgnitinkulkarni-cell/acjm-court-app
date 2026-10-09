import React, { useEffect, useMemo, useState } from "react";
import { useSort, SortTh } from "../lib/sortable";
import { useNavigate } from "react-router-dom";
import api, { getUser } from "../lib/api";
import { TopBar } from "./AdminDashboard";
import { StatCard } from "./SideNav";
import { digitallySign } from "../lib/sign";

// Order tab: Draft Order (from a saved template or a new blank order) and
// View Entries. Orders are typed on the same editor page as depositions
// (record_type "order") and printed in the court's order format.

const LANG_OPTIONS = [
  { value: "en", label: "English" },
  { value: "gu", label: "Gujarati" },
  { value: "hi", label: "Hindi" },
];
const LANG_LABELS = { gu: "Gujarati", hi: "Hindi", en: "English" };
const STORAGE_KEY = "acjm_order_wizard_v1";
const PERIODS = [
  { value: "all", label: "All dates" },
  { value: "1m", label: "Last 1 month" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "custom", label: "Custom range" },
];

const pad = (n) => String(n).padStart(2, "0");
const toDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };
const fmtDate = (d) => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "");
const fmtTime = (d) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "");
const ymd = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "");
const monthsAgo = (m) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - m); return d; };
const inputStyle = { padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 15 };

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Case picker: type to filter, tick as many cases as needed (the ticks are
// inside the drop-down itself). A number not in the list can be added as typed.
export function CaseMultiSelect({ cases, value, onChange, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = value || [];
  const q = query.trim().toLowerCase();
  const matches = cases.filter((c) => !q || String(c.case_number).toLowerCase().includes(q)).slice(0, 200);
  const toggle = (num) => onChange(selected.includes(num) ? selected.filter((c) => c !== num) : [...selected, num]);
  const exact = cases.some((c) => String(c.case_number).toLowerCase() === q);
  return (
    <div style={{ position: "relative" }} data-testid="case-multiselect">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            e.preventDefault();
            const hit = cases.find((c) => String(c.case_number).toLowerCase() === q);
            const num = hit ? hit.case_number : query.trim();
            if (!selected.includes(num)) onChange([...selected, num]);
            setQuery("");
          }
        }}
        placeholder={placeholder || "Type to search case numbers — tick one or more"}
        style={{ width: "100%", boxSizing: "border-box" }}
        data-testid="case-multiselect-input"
      />
      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: "absolute", zIndex: 30, left: 0, right: 0, top: "100%", background: "#fff", border: "1px solid #999", boxShadow: "0 8px 18px rgba(0,0,0,.12)", maxHeight: 280, overflowY: "auto" }}
        >
          {query.trim() && !exact && (
            <div style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #eee", color: "#1e3a8a" }}
              onClick={() => { if (!selected.includes(query.trim())) onChange([...selected, query.trim()]); setQuery(""); }}>
              + Add “{query.trim()}”
            </div>
          )}
          {matches.length === 0 && !query.trim() && <div style={{ padding: "8px 12px", color: "#6b7280" }}>No cases found for this court. Type a case number to add it.</div>}
          {matches.map((c) => (
            <label key={c.case_number} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 12px", cursor: "pointer", borderBottom: "1px solid #f3f3f3", fontWeight: 400 }}>
              <input type="checkbox" checked={selected.includes(c.case_number)} onChange={() => toggle(c.case_number)} style={{ width: "auto" }} />
              <span><strong>{c.case_number}</strong>{c.complainant_name || c.accused_name ? ` — ${[c.complainant_name, c.accused_name].filter(Boolean).join(" v/s ")}` : ""}</span>
            </label>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {selected.map((num) => (
            <span key={num} style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 14, padding: "3px 10px", display: "inline-flex", gap: 6, alignItems: "center" }}>
              {num}
              <button type="button" onClick={() => toggle(num)} style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 700 }} title="Remove">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Exhibit No. for each selected case (the same order can sit at a different
// exhibit number in each case).
function ExhibitPerCase({ cases, value, onChange, optional }) {
  if (cases.length <= 1) {
    return (
      <>
        <label>Exhibit No.{optional ? " (optional)" : ""}</label>
        <input value={value[cases[0] || ""] || ""} onChange={(e) => onChange({ ...value, [cases[0] || ""]: e.target.value })} placeholder="e.g. 01" data-testid="order-exhibit" />
      </>
    );
  }
  return cases.map((num) => (
    <React.Fragment key={num}>
      <label>{num} — Exhibit No.{optional ? " (optional)" : ""}</label>
      <input value={value[num] || ""} onChange={(e) => onChange({ ...value, [num]: e.target.value })} placeholder="e.g. 01" />
    </React.Fragment>
  ));
}

function exhibitPayload(cases, exhibits) {
  const first = cases[0] || "";
  const details = {};
  cases.slice(1).forEach((num) => { if ((exhibits[num] || "").trim()) details[num] = { exhibit_number: exhibits[num].trim() }; });
  return { exhibit_number: (exhibits[first] || "").trim(), case_specific_details: details };
}

function OrderStats() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState(null);
  const [templates, setTemplates] = useState(null);
  useEffect(() => {
    api.get("/orders/entries").then(({ data }) => setOrders(Array.isArray(data) ? data : [])).catch(() => setOrders([]));
    api.get("/order-templates").then(({ data }) => setTemplates(Array.isArray(data) ? data.length : 0)).catch(() => setTemplates(null));
  }, []);
  const today = new Date().toDateString();
  return (
    <div className="stats-row">
      <StatCard label="Orders" value={orders ? orders.length : null} onClick={() => navigate("/judge-desk/order/entries")} />
      <StatCard label="Drafted today" value={orders ? orders.filter((o) => new Date(o.created_at || o.recorded_at || "").toDateString() === today).length : null} tone="gold" onClick={() => navigate("/judge-desk/order/entries")} />
      <StatCard label="Templates" value={templates} tone="plum" onClick={() => navigate("/judge-desk/order/templates")} />
    </div>
  );
}

export function OrderHome() {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <TopBar title="Order" />
      <div className="page" data-testid="order-home">
        <h1>Order</h1>
        <p className="welcome-sub">Draft an order, manage templates, or open earlier orders — choose from the menu on the left.</p>
        <OrderStats />
      </div>
    </div>
  );
}

function loadState() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); } catch (e) { return null; }
}

export function OrderDraftWizard() {
  const navigate = useNavigate();
  const user = getUser();
  const courts = user?.courts || [];
  const saved = loadState() || {};
  const [courtId, setCourtId] = useState(saved.courtId || courts[0]?.id || "");
  const [step, setStep] = useState(saved.step || "case");
  const [caseNumbers, setCaseNumbers] = useState(saved.caseNumbers || []);
  const [exhibits, setExhibits] = useState(saved.exhibits || {});
  const [cases, setCases] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(saved.templateId || "");
  const tsrt = useSort(templates, { language: (t) => LANG_LABELS[t.language] || t.language, date: (t) => t.created_at });
  const [form, setForm] = useState(saved.form || { section_law: "", subject: "", language: "en" });
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ courtId, step, caseNumbers, exhibits, templateId, form })); } catch (e) { /* ignore */ }
  }, [courtId, step, caseNumbers, exhibits, templateId, form]);

  useEffect(() => {
    if (!courtId) return;
    api.get("/local-cases", { params: { court_id: courtId } }).then(({ data }) => setCases(Array.isArray(data) ? data : [])).catch(() => setCases([]));
  }, [courtId]);

  const loadTemplates = () => api.get("/order-templates").then(({ data }) => setTemplates(Array.isArray(data) ? data : [])).catch(() => setTemplates([]));
  useEffect(() => { if (step === "templates") loadTemplates(); }, [step]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const template = templates.find((t) => t.id === templateId);

  const goBack = () => {
    setMsg("");
    if (step === "details") { setStep(templateId ? "templates" : "source"); return; }
    if (step === "templates") { setStep("source"); return; }
    if (step === "source") { setStep("case"); return; }
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    navigate("/judge-desk/order");
  };

  const continueFromCase = () => {
    if (caseNumbers.length === 0) { setMsg("Please select or enter at least one case number."); return; }
    setMsg("");
    setStep("source");
  };

  const chooseNew = () => {
    setTemplateId("");
    setForm((f) => ({ ...f, section_law: "", subject: "" }));
    setStep("details");
  };

  const useTemplate = () => {
    if (!template) { setMsg("Please select a template."); return; }
    setMsg("");
    setForm((f) => ({ ...f, section_law: template.section_law || "", subject: template.subject || template.title || "", language: template.language || "en" }));
    setStep("details");
  };

  const deleteTemplate = async (t) => {
    if (!window.confirm(`Delete the template "${t.title}"? Orders already made from it are not affected.`)) return;
    await api.delete(`/order-templates/${t.id}`).catch(() => {});
    if (templateId === t.id) setTemplateId("");
    loadTemplates();
  };

  const createOrder = async () => {
    if (caseNumbers.length === 0 || caseNumbers.some((num) => !(exhibits[num] || "").trim())) {
      setMsg(caseNumbers.length > 1 ? "Please enter the Exhibit No. for each selected case." : "Please enter the Case Number and Exhibit No.");
      return;
    }
    setSubmitting(true);
    setMsg("");
    try {
      const { data } = await api.post("/depositions", {
        record_type: "order",
        mode: "new",
        court_id: courtId,
        case_ids: caseNumbers,
        primary_case_number: caseNumbers[0],
        ...exhibitPayload(caseNumbers, exhibits),
        section_law: form.section_law.trim(),
        subject: form.subject.trim(),
        language: form.language,
        client_start_time_iso: new Date().toISOString(),
        initial_body_html: template ? template.body_html || "" : "",
        template_id: template ? template.id : null,
      });
      try { sessionStorage.removeItem(STORAGE_KEY); localStorage.setItem("acjm_mic_lang", form.language); } catch (e) { /* ignore */ }
      navigate(`/judge-desk/oral-evidence/deposition/type/${data.id}`);
    } catch (e) {
      setMsg(e.response?.data?.detail || "Could not start the order.");
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <TopBar title="Draft Order" onBack={goBack} />
      <div className={`page dep-entry-lang-${form.language || "en"}`} data-testid="order-wizard" style={{ width: "80%", maxWidth: 1180, boxSizing: "border-box" }}>
        {courts.length > 1 && step === "case" && (
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <label>Court</label>
            <select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
              {courts.map((c) => <option key={c.id} value={c.id}>{c.english?.court_name}</option>)}
            </select>
          </div>
        )}

        {step === "case" && (
          <>
            <h1>Draft Order</h1>
            <p className="hint">Tick one case, or several cases if the same order is to be passed in all of them.</p>
            <div className="form-grid">
              <label>Case Number(s)</label>
              <CaseMultiSelect cases={cases} value={caseNumbers} onChange={setCaseNumbers} />
            </div>
          </>
        )}

        {step === "source" && (
          <>
            <p className="hint" style={{ marginBottom: 2 }}>Case No(s): <strong>{caseNumbers.join(", ")}</strong></p>
            <h1>How do you want to prepare the order?</h1>
            <div className="dashboard-grid" style={{ marginTop: 20 }}>
              <div className="tile purple" data-testid="order-from-template" onClick={() => { setMsg(""); setStep("templates"); }}>From Saved Templates</div>
              <div className="tile blue" data-testid="order-new" onClick={chooseNew}>New Order</div>
            </div>
          </>
        )}

        {step === "templates" && (
          <>
            <p className="hint" style={{ marginBottom: 2 }}>Case No(s): <strong>{caseNumbers.join(", ")}</strong></p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h1>Saved Templates</h1>
              <button className="btn btn-outline" onClick={() => { try { sessionStorage.setItem("acjm_order_template_cases", JSON.stringify(caseNumbers)); } catch (e) { /* ignore */ } navigate("/judge-desk/order/templates/new"); }} data-testid="order-create-template">+ Create New Template</button>
            </div>
            {templates.length === 0 ? (
              <p className="hint">No templates saved yet. Templates are saved from the Print button of an order.</p>
            ) : (
              <table className="entries">
                <thead><tr><th style={{ width: 40 }} /><SortTh label="Template" k="title" s={tsrt} /><SortTh label="Section &amp; Law" k="section_law" s={tsrt} /><SortTh label="Language" k="language" s={tsrt} /><SortTh label="Saved on" k="date" s={tsrt} /><th /></tr></thead>
                <tbody>
                  {tsrt.sorted.map((t) => (
                    <tr key={t.id} onClick={() => setTemplateId(t.id)} style={{ cursor: "pointer", background: templateId === t.id ? "#eef2ff" : undefined }}>
                      <td><input type="radio" name="order-template" checked={templateId === t.id} onChange={() => setTemplateId(t.id)} /></td>
                      <td>{t.title}</td>
                      <td>{t.section_law}</td>
                      <td>{LANG_LABELS[t.language] || t.language}</td>
                      <td>{fmtDate(toDate(t.created_at))}</td>
                      <td onClick={(e) => e.stopPropagation()}><button className="btn btn-outline" style={{ padding: "4px 10px" }} onClick={() => deleteTemplate(t)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {step === "details" && (
          <>
            <h1>{template ? `New Order — from template "${template.title}"` : "New Order"}</h1>
            <div className="form-grid">
              <label>Case Number(s)</label>
              <CaseMultiSelect cases={cases} value={caseNumbers} onChange={setCaseNumbers} />
              <ExhibitPerCase cases={caseNumbers} value={exhibits} onChange={setExhibits} />
              <label>Section &amp; Law (optional)</label>
              <input value={form.section_law} onChange={(e) => set("section_law", e.target.value)} placeholder="e.g. 279 of BNSS, 2023" data-testid="order-section" />
              <label>Subject (for your reference)</label>
              <input value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Optional — not printed" />
              <label>Language of Order</label>
              <select value={form.language} onChange={(e) => { set("language", e.target.value); try { localStorage.setItem("acjm_mic_lang", e.target.value); } catch (err) { /* ignore */ } }}>
                {LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </>
        )}

        {msg && <p className="error">{msg}</p>}
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={goBack}>Back</button>
          {step === "case" && <button className="btn btn-primary" onClick={continueFromCase} data-testid="order-continue">Continue</button>}
          {step === "templates" && <button className="btn btn-primary" onClick={useTemplate} disabled={!templateId} data-testid="order-use-template">Use Template</button>}
          {step === "details" && <button className="btn btn-primary" onClick={createOrder} disabled={submitting} data-testid="order-proceed">Proceed</button>}
        </div>
      </div>
    </div>
  );
}

export function OrderTemplates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = () => api.get("/order-templates").then(({ data }) => setTemplates(Array.isArray(data) ? data : [])).catch(() => setTemplates([])).finally(() => setLoading(false));
  const psrt = useSort(templates, { language: (t) => LANG_LABELS[t.language] || t.language, date: (t) => t.updated_at || t.created_at });
  useEffect(() => { load(); }, []);
  const remove = async (t) => {
    if (!window.confirm(`Delete the template "${t.title}"?`)) return;
    await api.delete(`/order-templates/${t.id}`).catch(() => {});
    load();
  };
  return (
    <div className="app-shell">
      <TopBar title="Order — Templates" />
      <div className="page" style={{ width: "85%", maxWidth: 1300, boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1>Order Templates</h1>
          <button className="btn btn-primary" onClick={() => { try { sessionStorage.removeItem("acjm_order_template_cases"); } catch (e) { /* ignore */ } navigate("/judge-desk/order/templates/new"); }} data-testid="templates-create">+ Create New Template</button>
        </div>
        <p className="hint">To use a template in a case, go to Draft Order → select the case(s) → From Saved Templates.</p>
        {loading ? <p>Loading...</p> : templates.length === 0 ? <p className="hint">No templates saved yet.</p> : (
          <table className="entries">
            <thead><tr><th>Sr.</th><SortTh label="Subject" k="title" s={psrt} /><SortTh label="Section &amp; Law" k="section_law" s={psrt} /><SortTh label="Language" k="language" s={psrt} /><SortTh label="Last saved" k="date" s={psrt} /><th /></tr></thead>
            <tbody>
              {psrt.sorted.map((t, i) => (
                <tr key={t.id}>
                  <td>{i + 1}</td><td>{t.title}</td><td>{t.section_law}</td><td>{LANG_LABELS[t.language] || t.language}</td>
                  <td>{fmtDate(toDate(t.updated_at || t.created_at))}</td>
                  <td><button className="btn btn-outline" style={{ padding: "4px 10px" }} onClick={() => remove(t)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// New template: Subject (required), Section & Law and Language; case number(s)
// and exhibit are optional — fill them only to also print the order in a case.
export function OrderTemplateNew() {
  const navigate = useNavigate();
  const user = getUser();
  const courts = user?.courts || [];
  const [courtId, setCourtId] = useState(courts[0]?.id || "");
  const [cases, setCases] = useState([]);
  const [caseNumbers, setCaseNumbers] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("acjm_order_template_cases") || "[]"); } catch (e) { return []; }
  });
  const [exhibits, setExhibits] = useState({});
  const [form, setForm] = useState({ subject: "", section_law: "", language: "en" });
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!courtId) return;
    api.get("/local-cases", { params: { court_id: courtId } }).then(({ data }) => setCases(Array.isArray(data) ? data : [])).catch(() => setCases([]));
  }, [courtId]);

  const create = async () => {
    if (!form.subject.trim()) { setMsg("Please enter the Subject — it is how the template is identified later."); return; }
    setSubmitting(true);
    setMsg("");
    try {
      const { data } = await api.post("/depositions", {
        record_type: "order",
        template_mode: true,
        mode: "new",
        court_id: courtId,
        case_ids: caseNumbers,
        primary_case_number: caseNumbers[0] || "",
        ...exhibitPayload(caseNumbers, exhibits),
        section_law: form.section_law.trim(),
        subject: form.subject.trim(),
        language: form.language,
        client_start_time_iso: new Date().toISOString(),
      });
      try { sessionStorage.removeItem("acjm_order_template_cases"); localStorage.setItem("acjm_mic_lang", form.language); } catch (e) { /* ignore */ }
      navigate(`/judge-desk/oral-evidence/deposition/type/${data.id}`);
    } catch (e) {
      setMsg(e.response?.data?.detail || "Could not create the template.");
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <TopBar title="Order — New Template" />
      <div className={`page dep-entry-lang-${form.language || "en"}`} style={{ width: "80%", maxWidth: 1180, boxSizing: "border-box" }}>
        <h1>Create New Template</h1>
        <div className="form-grid">
          {courts.length > 1 && (
            <>
              <label>Court</label>
              <select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
                {courts.map((c) => <option key={c.id} value={c.id}>{c.english?.court_name}</option>)}
              </select>
            </>
          )}
          <label>Subject (required)</label>
          <input value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="e.g. Dismissal u/s 279 BNSS" data-testid="template-subject" />
          <label>Section &amp; Law (optional)</label>
          <input value={form.section_law} onChange={(e) => set("section_law", e.target.value)} placeholder="e.g. 279 of BNSS, 2023" />
          <label>Language of Order</label>
          <select value={form.language} onChange={(e) => set("language", e.target.value)}>
            {LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label>Case Number(s) (optional)</label>
          <CaseMultiSelect cases={cases} value={caseNumbers} onChange={setCaseNumbers} placeholder="Only if you also want to print this order in a case" />
          {caseNumbers.length > 0 && <ExhibitPerCase cases={caseNumbers} value={exhibits} onChange={setExhibits} optional />}
        </div>
        {msg && <p className="error">{msg}</p>}
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>Back</button>
          <button className="btn btn-primary" onClick={create} disabled={submitting} data-testid="template-proceed">Proceed</button>
        </div>
      </div>
    </div>
  );
}

export function OrderEntries() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api.get("/orders/entries")
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.response?.data?.detail || "Could not load the orders."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let start = null;
    let end = null;
    if (period === "1m") start = monthsAgo(1);
    if (period === "3m") start = monthsAgo(3);
    if (period === "6m") start = monthsAgo(6);
    if (period === "custom") {
      if (from) start = new Date(`${from}T00:00:00`);
      if (to) end = new Date(`${to}T23:59:59`);
    }
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const d = toDate(r.recorded_at);
      if (start && (!d || d < start)) return false;
      if (end && (!d || d > end)) return false;
      if (!q) return true;
      const hay = [r.case_number, r.exhibit_number, `ex. ${r.exhibit_number}`, r.section_law, r.subject,
        fmtDate(d), fmtDate(d).replace(/\//g, "-"), fmtDate(d).replace(/\//g, "."), ymd(d)].join(" | ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, period, from, to]);
  const srt = useSort(filtered, { date: (r) => r.recorded_at, language: (r) => LANG_LABELS[r.language] || r.language, status: (r) => (r.printed ? "Printed" : "Draft") });

  const visibleIds = useMemo(() => new Set(filtered.map((r) => r.id)), [filtered]);
  const selectedVisible = [...selected].filter((id) => visibleIds.has(id));
  const allChecked = filtered.length > 0 && selectedVisible.length === filtered.length;
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.id)));
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set([...prev].filter((x) => visibleIds.has(x)));
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const viewPdf = async () => {
    if (selectedVisible.length !== 1) return;
    setBusy("pdf");
    const win = window.open("", "_blank");
    try {
      const res = await api.get(`/depositions/${selectedVisible[0]}/print`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      if (win) win.location.href = url; else window.open(url, "_blank");
    } catch (e) {
      if (win) win.close();
      setError("Could not prepare the PDF. Please try again.");
    } finally { setBusy(""); }
  };

  const signSelected = () => {
    if (selectedVisible.length === 0) return;
    const docs = selectedVisible.map((id) => {
      const row = filtered.find((r) => r.id === id);
      const name = `Order_${row?.case_number || "case"}_Ex_${row?.exhibit_number || ""}.pdf`.replace(/[\\/:*?"<>|\s]+/g, "_");
      return {
        getPdf: async () => (await api.get(`/depositions/${id}/print`, { responseType: "blob", timeout: 300000 })).data,
        filename: name, title: `Order — ${row?.case_number || ""}${row?.exhibit_number ? ` (Ex. ${row.exhibit_number})` : ""}`, source_id: id,
      };
    });
    digitallySign({ docs, source_kind: "order" });
  };

  const download = async () => {
    if (selectedVisible.length === 0) return;
    setBusy("zip");
    setError("");
    try {
      if (selectedVisible.length === 1) {
        const row = filtered.find((r) => r.id === selectedVisible[0]);
        const res = await api.get(`/depositions/${selectedVisible[0]}/print`, { responseType: "blob" });
        saveBlob(new Blob([res.data], { type: "application/pdf" }), `Order_${row?.case_number || "case"}_Ex_${row?.exhibit_number || ""}.pdf`.replace(/[\\/:*?"<>|\s]+/g, "_"));
      } else {
        const res = await api.post("/depositions/print-zip", { ids: selectedVisible }, { responseType: "blob", timeout: 600000 });
        saveBlob(new Blob([res.data], { type: "application/zip" }), "Orders.zip");
      }
    } catch (e) {
      setError("Could not prepare the download. Please try again.");
    } finally { setBusy(""); }
  };

  return (
    <div className="app-shell">
      <TopBar title="Order — View Entries" />
      <div className="page" data-testid="order-entries" style={{ width: "92%", maxWidth: 1400, boxSizing: "border-box" }}>
        <h1>Orders</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by case number, exhibit, section, subject or date (dd/mm/yyyy)"
            style={{ ...inputStyle, flex: "1 1 380px", minWidth: 260 }} data-testid="order-search" />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={inputStyle} data-testid="order-period">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {period === "custom" && (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputStyle, padding: "8px 10px" }} />
              To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inputStyle, padding: "8px 10px" }} />
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span className="hint" style={{ margin: 0 }}>{filtered.length} order(s) shown · {selectedVisible.length} selected</span>
          <button className="btn btn-outline" disabled={selectedVisible.length !== 1} onClick={() => navigate(`/judge-desk/oral-evidence/deposition/type/${selectedVisible[0]}`)} data-testid="order-open">Open / Edit</button>
          <button className="btn btn-outline" disabled={selectedVisible.length !== 1 || !!busy} onClick={viewPdf}>{busy === "pdf" ? "Preparing..." : "View PDF"}</button>
          <button className="btn btn-primary" disabled={selectedVisible.length === 0 || !!busy} onClick={download} data-testid="order-download">
            {busy === "zip" ? "Preparing download..." : `Download PDF${selectedVisible.length > 1 ? "s (ZIP)" : ""}`}
          </button>
          <button className="btn btn-outline" disabled={selectedVisible.length === 0 || !!busy} onClick={signSelected} title="Select one or more orders to sign them digitally (one PIN signs all)" data-testid="order-sign">{selectedVisible.length > 1 ? `Digitally Sign (${selectedVisible.length})` : "Digitally Sign"}</button>
        </div>
        {error && <p className="error">{error}</p>}
        {loading ? <p>Loading...</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="entries" data-testid="order-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={filtered.length === 0} title="Select all shown orders" /></th>
                  <th>Sr.</th><SortTh label="Case No." k="case_number" s={srt} /><SortTh label="Exh." k="exhibit_number" s={srt} /><SortTh label="Section &amp; Law" k="section_law" s={srt} /><SortTh label="Subject" k="subject" s={srt} /><SortTh label="Date" k="date" s={srt} /><SortTh label="Language" k="language" s={srt} /><SortTh label="Status" k="status" s={srt} />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)" }}>No orders match.</td></tr>}
                {srt.sorted.map((r, i) => {
                  const d = toDate(r.recorded_at);
                  const checked = selected.has(r.id);
                  return (
                    <tr key={r.id} onClick={() => toggleOne(r.id)} style={{ cursor: "pointer", background: checked ? "#eef2ff" : undefined }}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked} onChange={() => toggleOne(r.id)} /></td>
                      <td>{i + 1}</td>
                      <td>{r.case_number}</td>
                      <td>{r.exhibit_number}</td>
                      <td>{r.section_law}</td>
                      <td>{r.subject}</td>
                      <td>{fmtDate(d)}<br /><span className="hint">{fmtTime(d)}</span></td>
                      <td>{LANG_LABELS[r.language] || r.language}</td>
                      <td>
                        {r.printed ? "Printed" : "Draft"}
                        {r.from_template && r.expires_at && <><br /><span className="hint" title="Orders made from a saved template are kept for 7 days">From template · kept till {fmtDate(toDate(r.expires_at))}</span></>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
