import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { T } from "../lib/templates";
import { TopBar } from "./AdminDashboard";
import { downloadPdf } from "../lib/pdf";
import { signElement } from "../lib/sign";

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
};

export function PleaPrint({ plea, court }) {
  const t = T[plea.language];
  const isGu = plea.language === "gu";
  const c = court ? (isGu ? court.gujarati : court.english) : null;
  const a = plea.accused;
  const q2Text = plea.charge === "138" ? t.q2_138 : t.q2_25;
  return (
    <div className="print-doc" data-testid="plea-print-doc">
      <div className="court-head">{c?.court_name}</div>
      <div className="case-line">
        <span>{isGu ? "ક્રિ. કે. નં." : "Cri. Case No."}: {a.case_no}</span>
        <span>{isGu ? "આંક." : "Exb."}: ____</span>
      </div>
      <h2 style={{textAlign:"center"}}>{t.pleaTitle}</h2>
      <table>
        <tbody>
          <tr><td style={{width:280}}>{isGu? "આરોપી નું નામ": "Accused Name"}</td><td>:- {a.name}</td></tr>
          <tr><td>{isGu? "આરોપી ના પિતા / પતિનું નામ":"Accused Father / Husband Name"}</td><td>:- {a.father_husband}</td></tr>
          <tr><td>{isGu? "જાતી":"Religion"}</td><td>:- {a.religion}</td></tr>
          <tr><td>{isGu? "ઉ.વ.અ.":"Aged"}</td><td>:- {a.age} {isGu? "વર્ષ":"Yrs"}. {isGu? "વ્યવસાય":"Occupation"} - {a.occupation}</td></tr>
          <tr><td>{isGu? "રહેવાસી":"Address"}</td><td>:- {a.address}</td></tr>
          <tr><td>{isGu? "સંપર્ક સંખ્યા":"Contact No."}</td><td>:- {a.contact}</td></tr>
        </tbody>
      </table>
      <table className="qa-table">
        <tbody>
          <tr><td>{isGu? "સવાલ":"Question"}</td><td>:- {isGu? "શું તમો ને ફરિયાદ અને બચાવ માટે જરૂરી દસ્તાવેજી નકલો મળી ગયેલ છે?" : "Have you received the copy of complaint and other case papers?"}</td></tr>
          <tr><td>{isGu? "જવાબ":"Ans."}</td><td>:- {plea.q1}</td></tr>
          <tr><td>{isGu? "સવાલ":"Question"}</td><td>:- {q2Text}</td></tr>
          <tr><td>{isGu? "જવાબ":"Ans."}</td><td>:- {plea.q2}</td></tr>
          {plea.plea_type === "sanjabi" && plea.sanjabi && (
            <>
              <tr><td>{isGu? "સવાલ":"Question"}</td><td>:- {t.sanjabi.q3.replace(/^.+? - /, "")}</td></tr>
              <tr><td>{isGu? "જવાબ":"Ans."}</td><td>:- {plea.sanjabi.q3}</td></tr>
              <tr><td>{isGu? "સવાલ":"Question"}</td><td>:- {t.sanjabi.q4.replace(/^.+? - /, "")}</td></tr>
              <tr><td>{isGu? "જવાબ":"Ans."}</td><td>:- {plea.sanjabi.q4}</td></tr>
              <tr><td>{isGu? "સવાલ":"Question"}</td><td>:- {t.sanjabi.q5.replace(/^.+? - /, "")}</td></tr>
              <tr><td>{isGu? "જવાબ":"Ans."}</td><td>:- {plea.sanjabi.q5}</td></tr>
              <tr><td>{isGu? "સવાલ":"Question"}</td><td>:- {t.sanjabi.q6.replace(/^.+? - /, "")}</td></tr>
              <tr><td>{isGu? "જવાબ":"Ans."}</td><td>:- {plea.sanjabi.q6}</td></tr>
              <tr><td>{isGu? "સવાલ":"Question"}</td><td>:- {t.sanjabi.q7.replace(/^.+? - /, "")}</td></tr>
              <tr><td>{isGu? "જવાબ":"Ans."}</td><td>:- {plea.sanjabi.q7?.join("; ")}{plea.sanjabi.q7_other ? ` — ${plea.sanjabi.q7_other}` : ""}</td></tr>
              <tr><td>{isGu? "સવાલ":"Question"}</td><td>:- {t.sanjabi.q8.replace(/^.+? - /, "")}</td></tr>
              <tr><td>{isGu? "જવાબ":"Ans."}</td><td>:- {plea.sanjabi.q8}</td></tr>
            </>
          )}
        </tbody>
      </table>
      <div style={{marginTop:30}}>{isGu? "તા.":"Dt."} {today()}</div>
      <div>{isGu? "અમદાવાદ":"Ahmedabad City"}.</div>
      <div className="signature-row">
        <div>
          <div style={{marginTop:60, borderTop:"1px solid #000", paddingTop:6, width:200}}>{isGu? "(આરોપી ની સહી)":"(Signature of Accused)"}</div>
          <div style={{marginTop:30, borderTop:"1px solid #000", paddingTop:6, width:240}}>{isGu? "(આરોપી ની ઓળખ આપનારની સહી)":"(Signature of the person identifying Accused)"}</div>
        </div>
        <div>
          <div>{t.beforeMe}</div>
          <div style={{marginTop:60, borderTop:"1px solid #000", paddingTop:6, width:200}}>({c?.judge_name})</div>
          <div>{c?.judge_designation}</div>
          <div>{c?.place}</div>
        </div>
      </div>
    </div>
  );
}

export function PleaReview() {
  const { pleaId } = useParams();
  const navigate = useNavigate();
  const [plea, setPlea] = useState(null);
  const [court, setCourt] = useState(null);
  const printRef = React.useRef(null);
  useEffect(() => {
    api.get(`/pleas/${pleaId}`).then(({data}) => {
      setPlea(data);
      api.get(data?.court_id ? `/courts/${data.court_id}` : "/courts/default").then(({data: courtData}) => setCourt(courtData));
    });
  }, [pleaId]);
  // Opened from "My Entries → Download PDF": download once the page is ready.
  const autoDl = React.useRef(false);
  useEffect(() => {
    if (autoDl.current || !plea || !court || new URLSearchParams(window.location.search).get("download") !== "1") return;
    autoDl.current = true;
    setTimeout(() => { if (printRef.current) downloadPdf(printRef.current, `Plea_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_")); }, 800);
  });
  // Opened from "My Entries → Digitally Sign": open the signing dialog once ready.
  const autoSign = React.useRef(false);
  useEffect(() => {
    if (autoSign.current || !plea || !court || new URLSearchParams(window.location.search).get("sign") !== "1") return;
    autoSign.current = true;
    setTimeout(() => { if (printRef.current) signElement(printRef.current, `Plea_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_"), "plea", pleaId, undefined, plea.court_id); }, 800);
  });
  if (!plea) return null;
  const onPrint = () => {
    const fname = `Plea_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_");
    downloadPdf(printRef.current, fname);
  };
  return (
    <div className="app-shell">
      <div className="no-print"><TopBar title="Plea — Review" /></div>
      <div className="page" data-testid="plea-review-page">
        <div ref={printRef}>
          <PleaPrint plea={plea} court={court} />
        </div>
        <div className="form-actions no-print">
          <button className="btn btn-secondary" onClick={() => navigate(plea.plea_type === "sanjabi" ? `/advocate/plea/sanjabi/${plea.language}/${pleaId}` : `/advocate/plea/form/${plea.language}/${pleaId}`)} data-testid="plea-edit-btn">{T[plea.language].edit}</button>
          <button className="btn btn-primary" onClick={onPrint} data-testid="plea-print-btn">{T[plea.language].print}</button>
          <button className="btn btn-outline" onClick={() => signElement(printRef.current, `Plea_${plea.accused?.case_no || pleaId}.pdf`.replace(/[^\w.\-]/g, "_"), "plea", pleaId, undefined, plea.court_id)} data-testid="plea-sign">Digitally Sign</button>
        </div>
      </div>
    </div>
  );
}
