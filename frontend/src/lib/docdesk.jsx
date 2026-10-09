import React from "react";
import api from "./api";

// Shared helpers for the signed-document pages.
const pad = (n) => String(n).padStart(2, "0");
export const fmtDT = (iso) => { const d = new Date(iso || ""); return Number.isNaN(d.getTime()) ? "" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const DOC_KIND = { deposition: "Deposition", s183: "183 Statement", order: "Order", plea: "Plea", primary_fs: "Primary FS", final_fs: "Final FS",
  application: "Application", pursis: "Pursis", surety: "Surety / Bond", warrant: "Warrant", warrant_conviction: "Conviction Warrant", document: "Document" };
export const kindLabel = (k) => DOC_KIND[k] || (String(k || "").startsWith("warrant") ? "Warrant" : "—");
export const certName = (s) => { const m = /Common Name: ([^,]+)/.exec(s || ""); return m ? m[1].trim() : (s || ""); };
export const signedName = (d) => `${(d.filename || "document.pdf").replace(/\.pdf$/i, "")}_signed.pdf`;
export const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
export const fetchSigned = async (d) => (await api.get(`/signed-documents/${d.id}/file`, { responseType: "blob", timeout: 300000 })).data;
export const openSigned = async (d) => {
  const win = window.open("", "_blank");
  try { const url = URL.createObjectURL(new Blob([await fetchSigned(d)], { type: "application/pdf" })); if (win) win.location.href = url; else window.open(url, "_blank"); }
  catch (e) { if (win) win.close(); throw e; }
};
export const downloadSignedMany = async (list) => {
  if (list.length === 1) { saveBlob(await fetchSigned(list[0]), signedName(list[0])); return; }
  const res = await api.get("/signed-documents/zip", { params: { ids: list.map((d) => d.id).join(",") }, responseType: "blob", timeout: 600000 });
  saveBlob(res.data, "Signed_Documents.zip");
};
// Where the document stands in the court's workflow.
export const docStatus = (d) => {
  if (d.workflow === "awaiting_judge") return { text: "Awaiting Judicial Officer's signature", tone: "wait" };
  if (d.workflow === "judge_signed") return { text: `Signed by Judicial Officer${d.judge_signed_at ? ` on ${fmtDT(d.judge_signed_at)}` : ""}`, tone: "ok" };
  if (d.workflow === "returned") return { text: `Returned by Judicial Officer${d.return_remark ? `: ${d.return_remark}` : ""}`, tone: "bad" };
  if (d.workflow === "final") return { text: d.prepared_by ? `Final copy (prepared by ${d.prepared_by})` : "Final copy", tone: "ok" };
  if (d.submission?.status === "new") return { text: "Submitted to court — awaiting staff", tone: "wait" };
  if (d.submission?.status === "placed") return { text: `Placed on record${d.submission.placed_at ? ` on ${fmtDT(d.submission.placed_at)}` : ""}`, tone: "ok" };
  return null;
};
export const StatusPill = ({ d }) => {
  const st = docStatus(d);
  if (!st) return null;
  return <span className={`doc-status doc-status-${st.tone}`}>{st.text}</span>;
};
