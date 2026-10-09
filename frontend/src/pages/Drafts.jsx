import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getUser } from "../lib/api";

// "Resume unfinished work" on the Advocate / Litigant home screen. Every form
// already live-saves what is typed in this browser; this lists those drafts.

const KIND_LABEL = { application: "Application", pursis: "Pursis", surety: "Surety / Bond" };
const LANG_LABEL = { gu: "Gujarati", en: "English", hi: "Hindi" };

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; }
}
const filled = (v) => (typeof v === "string" ? v.trim() !== "" : Array.isArray(v) ? v.some(filled) : v && typeof v === "object" ? Object.values(v).some(filled) : !!v);

function collectDrafts() {
  const user = getUser();
  const uid = user?.id || "guest";
  const out = [];
  let keys = [];
  try { keys = Object.keys(localStorage); } catch (e) { return out; }
  keys.forEach((k) => {
    let m = k.match(/^doc_draft_(.+)_(application|pursis|surety)_(gu|en|hi)$/);
    if (m && m[1] === uid) {
      if (localStorage.getItem(`${k}__done`)) return;
      const f = readJSON(k) || {};
      out.push({
        key: k, extraKeys: [`${k}__at`, `${k}__done`], at: Number(localStorage.getItem(`${k}__at`) || 0),
        title: `${KIND_LABEL[m[2]]} (${LANG_LABEL[m[3]]})`,
        detail: [f.case_number && `Case ${f.case_number}`, f.applicant_name || f.accused_name].filter(Boolean).join(" · "),
        href: `/doc-generator.html?kind=${m[2]}&lang=${m[3]}`,
      });
      return;
    }
    m = k.match(/^acjm_plea_draft:(gu|en|hi)$/);
    if (m) {
      const d = readJSON(k);
      const data = d?.data || d;
      if (data && (filled(data.accused) || filled(data.q1) || filled(data.q2))) {
        out.push({ key: k, at: Date.parse(d?.savedAt || "") || 0, title: `Plea (${LANG_LABEL[m[1]]})`, detail: data.accused ? `Accused: ${data.accused}` : "", to: `/advocate/plea/form/${m[1]}` });
      }
      return;
    }
    m = k.match(/^acjm_primary_fs_draft:(.+)$/);
    if (m) {
      const d = readJSON(k);
      if (filled(d)) out.push({ key: k, pleaId: m[1], title: "Primary FS", to: `/advocate/primary-fs/form/${m[1]}` });
      return;
    }
    m = k.match(/^acjm_final_fs_draft:(.+)$/);
    if (m) {
      const d = readJSON(k);
      if (filled(d)) out.push({ key: k, pleaId: m[1], title: "Final FS", to: `/advocate/final-fs/form/${m[1]}` });
    }
  });
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}

export default function UnfinishedWork() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => collectDrafts());
  const [cases, setCases] = useState({});

  useEffect(() => {
    items.filter((d) => d.pleaId && !cases[d.pleaId]).forEach((d) => {
      api.get(`/pleas/${d.pleaId}`).then(({ data }) => setCases((c) => ({ ...c, [d.pleaId]: data?.case_number || "" }))).catch(() => {});
    });
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const discard = (d) => {
    if (!window.confirm(`Discard the unfinished ${d.title}? What was typed will be deleted.`)) return;
    try { localStorage.removeItem(d.key); (d.extraKeys || []).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    setItems(collectDrafts());
  };

  if (!items.length) return null;
  return (
    <div className="card-block" data-testid="unfinished-work">
      <div className="card-head"><h3>Resume unfinished work</h3></div>
      <p className="hint" style={{ marginTop: 0 }}>Whatever you type in a form is saved automatically on this computer. Continue from where you stopped:</p>
      <div className="resume-list">
        {items.map((d) => (
          <div key={d.key} className="resume-item" data-testid="resume-item">
            <div>
              <strong>{d.title}</strong>
              <small>{d.detail || (d.pleaId && cases[d.pleaId] ? `Case ${cases[d.pleaId]}` : "")}{d.at ? `${d.detail || cases[d.pleaId] ? " · " : ""}saved ${new Date(d.at).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}</small>
            </div>
            <div className="row">
              <button className="btn btn-primary" style={{ padding: "7px 14px" }} onClick={() => { if (d.href) window.location.href = d.href; else navigate(d.to); }} data-testid="resume-btn">Resume</button>
              <button className="btn btn-secondary" style={{ padding: "7px 12px" }} onClick={() => discard(d)}>Discard</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
