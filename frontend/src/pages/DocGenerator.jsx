import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { TopBar } from "./AdminDashboard";
import { getSelectedCourt, getSelectedCourtId } from "./SelectCourt";
import { downloadPdf } from "../lib/pdf";

const KIND_LABELS = {
  application: { en: "Application", gu: "અરજી" },
  pursis: { en: "Pursis", gu: "પુરસીસ" },
  surety: { en: "Surety / Bond", gu: "જામીન / બોન્ડ" },
};

const UI = {
  en: {
    selectLanguage: "Select Language",
    english: "English",
    gujarati: "Gujarati",
    back: "Back",
    next: "Next",
    preview: "Preview",
    edit: "Edit",
    savePrint: "Save & Generate PDF",
    reset: "Reset / Start New",
    useCustomDate: "Use custom date",
    selectExisting: "Select existing case",
    enterNew: "Enter case details",
    caseNumber: "Case Number",
    complainant: "Complainant Name",
    accused: "Accused Name",
    documentType: "Document Type",
    producingParty: "Producing Party",
    applicantName: "Applicant Name",
    applicantRole: "Applicant Role",
    advocateName: "Advocate Name",
    exhibit: "Exhibit Number",
    caseStage: "Case Stage",
    reason: "Reason",
    body: "Body / Additional Details",
    depositAmount: "Deposit Amount",
    bondAmount: "Bond Amount",
    suretyAmount: "Surety Amount",
    mobile: "Mobile Number",
    address: "Address",
    policeStation: "Police Station",
    conditions: "Conditions",
    addCondition: "Additional Conditions Imposed by Court",
    validation: "Please fill case number, complainant name, accused name and document type.",
  },
  gu: {
    selectLanguage: "ભાષા પસંદ કરો",
    english: "English",
    gujarati: "ગુજરાતી",
    back: "પાછળ",
    next: "આગળ",
    preview: "પૂર્વાવલોકન",
    edit: "સુધારો",
    savePrint: "સેવ કરી PDF બનાવો",
    reset: "રીસેટ / નવી શરૂઆત",
    useCustomDate: "કસ્ટમ તારીખ વાપરો",
    selectExisting: "હાલનો કેસ પસંદ કરો",
    enterNew: "કેસની વિગતો દાખલ કરો",
    caseNumber: "કેસ નંબર",
    complainant: "ફરિયાદીનું નામ",
    accused: "આરોપીનું નામ",
    documentType: "દસ્તાવેજનો પ્રકાર",
    producingParty: "રજૂ કરનાર પક્ષ",
    applicantName: "અરજદારનું નામ",
    applicantRole: "અરજદારની ભૂમિકા",
    advocateName: "વકીલનું નામ",
    exhibit: "આંક નંબર",
    caseStage: "કેસનો તબક્કો",
    reason: "કારણ",
    body: "મુખ્ય લખાણ / વધારાની વિગતો",
    depositAmount: "જમા રકમ",
    bondAmount: "બોન્ડ રકમ",
    suretyAmount: "જામીન રકમ",
    mobile: "મોબાઇલ નંબર",
    address: "સરનામું",
    policeStation: "પોલીસ સ્ટેશન",
    conditions: "શરતો",
    addCondition: "અદાલત દ્વારા લાદવામાં આવેલી વધારાની શરતો",
    validation: "કૃપા કરી કેસ નંબર, ફરિયાદીનું નામ, આરોપીનું નામ અને દસ્તાવેજનો પ્રકાર ભરો.",
  },
};

const DOC_OPTIONS = {
  application: {
    en: [
      "Adjournment Application",
      "Exemption Application",
      "Application to Deposit Penalty / Fine",
      "Application to Deposit Cost before DLSA",
      "Application to Deposit Other Amount",
      "Application to Deposit Surety Amount",
      "Custom Application",
    ],
    gu: [
      "મુલતવી અરજી",
      "હાજરીમાંથી મુક્તિ અરજી",
      "દંડ / ફાઇનની રકમ જમા કરાવવા અંગેની અરજી",
      "ડી.એલ.એસ.એ. સમક્ષ ખર્ચની રકમ જમા કરાવવા અંગેની અરજી",
      "અન્ય રકમ જમા કરાવવા અંગેની અરજી",
      "જામીનગીરીની રકમ જમા કરાવવા અંગેની અરજી",
      "કસ્ટમ અરજી",
    ],
  },
  pursis: {
    en: [
      "Withdrawal Pursis",
      "Advance Withdrawal Pursis - Lok Adalat",
      "Bail & Bond at Police Station Pursis",
      "Accused Declaration regarding Order, Case Papers and Surety",
      "Declaration regarding Payment of Amount",
      "Custom Pursis",
    ],
    gu: [
      "ફરિયાદ પાછી ખેંચવાની પુરસીસ",
      "લોક અદાલત માટે એડવાન્સ વિડ્રોઅલ પુરસીસ",
      "પોલીસ સ્ટેશન ખાતે જામીન આપેલ હોવા અંગેની પુરસીસ",
      "હુકમ, કેસ પેપર્સ અને જામીન અંગે આરોપીની જાહેરાત પુરસીસ",
      "રકમની ચુકવણી અંગેની જાહેરાત પુરસીસ",
      "કસ્ટમ પુરસીસ",
    ],
  },
  surety: {
    en: ["Surety Verification", "Bond of Accused / Convict", "Bond of Surety"],
    gu: ["જામીનદાર ચકાસણી", "આરોપી / દોષિતનો બોન્ડ", "જામીનદારનો બોન્ડ"],
  },
};

const CONDITION_OPTIONS = {
  en: [
    "The accused shall regularly remain present before the Court in compliance with the conditions mentioned in the bond executed before the Court.",
    "The accused shall not commit any similar offence or involve himself/herself in any similar offence.",
    "The accused shall not directly or indirectly induce, threaten or influence any person acquainted with the facts of the case / witness.",
    "The accused shall cooperate with the investigation and shall remain present before the Investigating Officer as and when called.",
    "If the regular mobile number is changed, prior written intimation shall be given to this Court.",
    "The accused shall not leave the territory of India without prior permission of the Court.",
  ],
  gu: [
    "આરોપીએ અદાલત સમક્ષ અમલ કરેલ બોન્ડમાં જણાવેલ શરતોનું પાલન કરતા અદાલત સમક્ષ નિયમિત હાજર થવું.",
    "આરોપીએ આવા પ્રકારનો ગુનો કરવો નહીં અથવા આવા પ્રકારના ગુનામાં સંડોવાવું નહીં.",
    "આરોપીએ સાક્ષીઓને પ્રત્યક્ષ અથવા પરોક્ષ રીતે પ્રલોભન, ધમકી કે દબાણ કરવું નહીં.",
    "તપાસમાં સાથ સહકાર આપવો અને તપાસ કરનાર અધિકારી બોલાવે ત્યારે હાજર થવું.",
    "મોબાઇલ નંબર બદલાય તો તેની પૂર્વ જાણ અદાલતને લેખિત સ્વરૂપે કરવી.",
    "અદાલતની પૂર્વ મંજૂરી વિના ભારત દેશની હદ છોડવી નહીં.",
  ],
};

const emptyForm = {
  case_number: "",
  complainant_name: "",
  accused_name: "",
  document_type: "",
  producing_party: "",
  applicant_name: "",
  applicant_role: "",
  advocate_name: "",
  exhibit_number: "",
  case_stage: "",
  reason: "",
  body: "",
  deposit_amount: "",
  bond_amount: "",
  surety_amount: "",
  mobile_number: "",
  address: "",
  police_station_name: "",
  custom_date_enabled: false,
  custom_date: "",
  selected_conditions: [],
  additional_conditions: [],
};

const today = () => new Date().toLocaleDateString("en-GB");
const draftKey = (kind, lang) => `doc_draft_${kind}_${lang}`;

function getDateText(form) {
  return form.custom_date_enabled && form.custom_date ? form.custom_date : today();
}

function textForKind(lang, kind, form) {
  const isGu = lang === "gu";
  if (kind === "application") {
    if (form.document_type.includes(isGu ? "હાજરી" : "Exemption")) {
      return isGu
        ? `આથી નમ્રતાપૂર્વક જણાવવાનું કે ઉપરોક્ત કામ ${form.case_stage || "નિયત તબક્કે"} મુકાયેલ છે. પરંતુ ${form.reason || "કારણસર"} હાજરી આપી શકાય તેમ નથી. તેથી આજ રોજ હાજરીમાંથી મુક્તિ આપવા વિનંતી છે.`
        : `It is humbly submitted that the matter is placed at the stage of ${form.case_stage || "the listed stage"}. Since ${form.reason || "the stated reason"}, presence cannot be marked today. Hence exemption for today is humbly requested.`;
    }
    return isGu
      ? `આથી નમ્રતાપૂર્વક જણાવવાનું કે ઉપરોક્ત કામ આજ રોજ ${form.case_stage || "નિયત તબક્કે"} મુકાયેલ છે. પરંતુ ${form.reason || "કારણસર"} આજ રોજ કાર્યવાહી કરી શકાય તેમ નથી. તેથી મુલતવી આપવા વિનંતી છે. ${form.body || ""}`
      : `It is humbly submitted that the matter is placed today at the stage of ${form.case_stage || "the listed stage"}. Since ${form.reason || "the stated reason"}, the matter cannot proceed today. Hence adjournment is humbly requested. ${form.body || ""}`;
  }
  if (kind === "pursis") {
    return isGu
      ? `${form.body || "હાલના કામમાં પક્ષકારો વચ્ચે સમાધાન થયેલ છે / જરૂરી જાહેરાત સ્વેચ્છાએ કરવામાં આવે છે. આ પુરસીસ કોઈ દબાણ વિના રજૂ કરવામાં આવે છે."}`
      : `${form.body || "The parties have settled the matter / the required declaration is made voluntarily. This pursis is presented without coercion or undue influence."}`;
  }
  return isGu
    ? `${form.body || "આ બોન્ડ / જામીનદારી અદાલત સમક્ષ સ્વેચ્છાએ અમલ કરવામાં આવે છે."}`
    : `${form.body || "This bond / surety undertaking is executed voluntarily before this Hon'ble Court."}`;
}

function DocumentPreview({ kind, lang, form, court }) {
  const isGu = lang === "gu";
  const c = court ? (isGu ? court.gujarati : court.english) : null;
  const conditions = [...form.selected_conditions, ...form.additional_conditions.filter(Boolean)];
  return (
    <div className={`print-doc legal-doc ${isGu ? "gu" : ""}`} data-testid="generated-doc-preview">
      <div className="court-head">{isGu ? `મહે. ${c?.court_name || ""}` : `IN THE COURT OF ${c?.court_name || ""}`}</div>
      <div className="case-line"><span>{isGu ? "ઇ. / સી. સી. નં." : "e. / C. C. No."} {form.case_number}</span><span>{isGu ? "આંક" : "Ex."} - {form.exhibit_number || "____"}</span></div>
      <div style={{textAlign:"center", margin:"10px 0"}}>
        <div>{isGu ? "ફરિયાદી" : "Complainant"} - {form.complainant_name}</div>
        <div>{isGu ? "વિરૂદ્ધ" : "::Versus::"}</div>
        <div>{isGu ? "આરોપી" : "Accused"} - {form.accused_name}</div>
      </div>
      <p><strong>{isGu ? "વિષય" : "Subject"} - {form.document_type}</strong></p>
      <p>{isGu ? "મહે. સાહેબ શ્રી," : "Hon'ble Sir / Madam,"}</p>
      <p>{textForKind(lang, kind, form)}</p>
      {kind === "application" && form.deposit_amount && <p>{isGu ? "જમા રકમ" : "Deposit Amount"}: {form.deposit_amount}</p>}
      {kind === "surety" && (
        <>
          <p>{isGu ? "બોન્ડ રકમ" : "Bond Amount"}: {form.bond_amount || "________"} | {isGu ? "જામીન રકમ" : "Surety Amount"}: {form.surety_amount || "________"}</p>
          {conditions.length > 0 && (
            <>
              <p><strong>{isGu ? "શરતો" : "Conditions"}</strong></p>
              <ol>{conditions.map((cnd, i) => <li key={i}>{cnd}</li>)}</ol>
            </>
          )}
        </>
      )}
      <p style={{marginTop:28}}>{isGu ? "આભાર સહ...." : "With esteem respect...."}</p>
      <div className="signature-row">
        <div>
          <div style={{marginTop:50, borderTop:"1px solid #000", paddingTop:6, width:260}}>
            {isGu ? "અરજદાર / રજૂ કરનારની સહી" : "Signature of Applicant / Producing Party"}
          </div>
          {form.advocate_name && <div style={{marginTop:20}}>{isGu ? "વકીલ" : "Advocate"}: {form.advocate_name}</div>}
        </div>
        <div>
          <div>{isGu ? "તા." : "Dt."} - {getDateText(form)}</div>
          <div style={{marginTop:50, borderTop:"1px solid #000", paddingTop:6, width:220}}>({c?.judge_name || ""})</div>
          <div>{c?.judge_designation}</div>
          <div>{c?.place}</div>
        </div>
      </div>
    </div>
  );
}

export function DocLanguage() {
  const { kind } = useParams();
  const navigate = useNavigate();
  const label = KIND_LABELS[kind]?.en || "Document";
  return (
    <div className="app-shell">
      <TopBar title={`${label} - Select Language`} />
      <div className="page" style={{textAlign:"center"}}>
        <h1>Select Language</h1>
        <div className="row" style={{justifyContent:"center", marginTop:32}}>
          <button className="btn btn-orange role-btn" onClick={() => navigate(`/advocate/${kind}/form/gu`)}>ગુજરાતી</button>
          <button className="btn btn-red role-btn" onClick={() => navigate(`/advocate/${kind}/form/en`)}>English</button>
        </div>
        <div className="form-actions"><button className="btn btn-secondary" onClick={() => navigate("/advocate/menu")}>Back</button></div>
      </div>
    </div>
  );
}

export function DocForm() {
  const { kind, lang } = useParams();
  const navigate = useNavigate();
  const labels = UI[lang] || UI.en;
  const court = getSelectedCourt();
  const courtId = getSelectedCourtId();
  const [form, setForm] = useState(emptyForm);
  const [cases, setCases] = useState([]);
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState("");
  const printRef = React.useRef(null);

  useEffect(() => {
    if (!courtId) { navigate("/advocate", { replace: true }); return; }
    const saved = localStorage.getItem(draftKey(kind, lang));
    if (saved) {
      try { setForm({ ...emptyForm, ...JSON.parse(saved) }); } catch (_) {}
    }
    api.get(`/local-cases?court_id=${courtId}`).then(({data}) => setCases(data || []));
  }, [kind, lang, courtId, navigate]);

  useEffect(() => {
    localStorage.setItem(draftKey(kind, lang), JSON.stringify(form));
  }, [form, kind, lang]);

  const options = DOC_OPTIONS[kind]?.[lang] || [];
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const chooseCase = (caseNumber) => {
    const item = cases.find((c) => c.case_number === caseNumber);
    if (!item) return;
    setForm({ ...form, case_number: item.case_number || "", complainant_name: item.complainant_name || "", accused_name: item.accused_name || "" });
  };
  const addCondition = () => set("additional_conditions", [...form.additional_conditions, ""]);
  const updateAdditional = (i, value) => {
    const next = [...form.additional_conditions];
    next[i] = value;
    set("additional_conditions", next);
  };
  const deleteAdditional = (i) => set("additional_conditions", form.additional_conditions.filter((_, idx) => idx !== i));
  const toggleCondition = (text) => {
    const next = form.selected_conditions.includes(text)
      ? form.selected_conditions.filter((x) => x !== text)
      : [...form.selected_conditions, text];
    set("selected_conditions", next);
  };
  const validate = () => {
    if (!form.case_number || !form.complainant_name || !form.accused_name || !form.document_type) return labels.validation;
    return "";
  };
  const doPreview = () => {
    const err = validate();
    if (err) { setMsg(err); return; }
    setMsg("");
    setPreview(true);
  };
  const reset = () => {
    if (!window.confirm("Clear this draft and start new?")) return;
    localStorage.removeItem(draftKey(kind, lang));
    setForm(emptyForm);
    setPreview(false);
  };
  const savePrint = async () => {
    const payload = {
      document_kind: kind,
      language: lang,
      court_id: courtId,
      case_number: form.case_number,
      complainant_name: form.complainant_name,
      accused_name: form.accused_name,
      document_type: form.document_type,
      producing_party: form.producing_party,
      applicant_name: form.applicant_name,
      applicant_role: form.applicant_role,
      advocate_name: form.advocate_name,
      date: getDateText(form),
      fields: form,
      html: printRef.current?.innerHTML || "",
    };
    await api.post("/generated-documents", payload);
    await downloadPdf(printRef.current, `${kind}_${form.case_number || "document"}.pdf`.replace(/[^\w.\-]/g, "_"));
  };

  return (
    <div className="app-shell">
      <TopBar title={`${KIND_LABELS[kind]?.[lang] || "Document"}`} />
      <div className="page">
        {!preview ? (
          <>
            <div className="row" style={{justifyContent:"space-between"}}>
              <h1>{KIND_LABELS[kind]?.[lang]}</h1>
              <button className="btn btn-secondary" onClick={() => navigate(`/advocate/${kind}/lang`)}>{labels.back}</button>
            </div>
            <p className="hint"><strong>Court:</strong> {court?.[lang === "gu" ? "gujarati" : "english"]?.court_name}</p>
            <div className="form-grid">
              <label>{labels.selectExisting}</label>
              <select value="" onChange={(e) => chooseCase(e.target.value)}>
                <option value="">--</option>
                {cases.map((c) => <option key={`${c.court_id}-${c.case_number}`} value={c.case_number}>{c.case_number} - {c.accused_name}</option>)}
              </select>
              <label>{labels.caseNumber}</label><input value={form.case_number} onChange={(e) => set("case_number", e.target.value)} />
              <label>{labels.complainant}</label><input value={form.complainant_name} onChange={(e) => set("complainant_name", e.target.value)} />
              <label>{labels.accused}</label><input value={form.accused_name} onChange={(e) => set("accused_name", e.target.value)} />
              <label>{labels.documentType}</label>
              <select value={form.document_type} onChange={(e) => set("document_type", e.target.value)}>
                <option value="">--</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <label>{labels.exhibit}</label><input value={form.exhibit_number} onChange={(e) => set("exhibit_number", e.target.value)} />
              <label>{labels.producingParty}</label><input value={form.producing_party} onChange={(e) => set("producing_party", e.target.value)} />
              <label>{labels.applicantName}</label><input value={form.applicant_name} onChange={(e) => set("applicant_name", e.target.value)} />
              <label>{labels.applicantRole}</label><input value={form.applicant_role} onChange={(e) => set("applicant_role", e.target.value)} />
              <label>{labels.advocateName}</label><input value={form.advocate_name} onChange={(e) => set("advocate_name", e.target.value)} />
              <label>{labels.caseStage}</label><input value={form.case_stage} onChange={(e) => set("case_stage", e.target.value)} />
              <label>{labels.reason}</label><textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} />
              <label>{labels.body}</label><textarea value={form.body} onChange={(e) => set("body", e.target.value)} />
              <label>{labels.depositAmount}</label><input value={form.deposit_amount} onChange={(e) => set("deposit_amount", e.target.value)} />
              {kind === "surety" && (
                <>
                  <label>{labels.bondAmount}</label><input value={form.bond_amount} onChange={(e) => set("bond_amount", e.target.value)} />
                  <label>{labels.suretyAmount}</label><input value={form.surety_amount} onChange={(e) => set("surety_amount", e.target.value)} />
                  <label>{labels.mobile}</label><input value={form.mobile_number} onChange={(e) => set("mobile_number", e.target.value)} />
                  <label>{labels.address}</label><textarea value={form.address} onChange={(e) => set("address", e.target.value)} />
                </>
              )}
              <label>{labels.useCustomDate}</label>
              <span><input type="checkbox" checked={form.custom_date_enabled} onChange={(e) => set("custom_date_enabled", e.target.checked)} /> {today()}</span>
              {form.custom_date_enabled && <><label>Custom Date</label><input value={form.custom_date} onChange={(e) => set("custom_date", e.target.value)} /></>}
            </div>
            {kind === "surety" && (
              <div style={{marginTop:18}}>
                <h2>{labels.conditions}</h2>
                {CONDITION_OPTIONS[lang].map((c) => (
                  <label key={c} style={{display:"block", marginBottom:8}}>
                    <input type="checkbox" checked={form.selected_conditions.includes(c)} onChange={() => toggleCondition(c)} /> {c}
                  </label>
                ))}
                <h3>{labels.addCondition}</h3>
                {form.additional_conditions.map((c, i) => (
                  <div className="row" key={i} style={{marginBottom:8}}>
                    <textarea value={c} onChange={(e) => updateAdditional(i, e.target.value)} style={{flex:1}} />
                    <button className="btn btn-danger" onClick={() => deleteAdditional(i)}>Delete</button>
                  </div>
                ))}
                <button className="btn btn-outline" onClick={addCondition}>Add Condition</button>
              </div>
            )}
            {msg && <p className="error">{msg}</p>}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => navigate("/advocate/menu")}>{labels.back}</button>
              <button className="btn btn-danger" onClick={reset}>{labels.reset}</button>
              <button className="btn btn-primary" onClick={doPreview}>{labels.preview}</button>
            </div>
          </>
        ) : (
          <>
            <div ref={printRef}><DocumentPreview kind={kind} lang={lang} form={form} court={court} /></div>
            <div className="form-actions no-print">
              <button className="btn btn-secondary" onClick={() => setPreview(false)}>{labels.edit}</button>
              <button className="btn btn-primary" onClick={savePrint}>{labels.savePrint}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
