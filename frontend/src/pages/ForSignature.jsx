import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { TopBar } from "./AdminDashboard";
import { useSort, SortTh } from "../lib/sortable";
import { digitallySign } from "../lib/sign";
import { fmtDT, kindLabel, certName, openSigned } from "../lib/docdesk";

// Judicial Officer's "For Signature" desk: warrants prepared and digitally signed
// ("Prepared by") by the Court Staff wait here for the Judicial Officer's signature.
export default function ForSignature() {
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    api.get("/signature-desk").then(({ data }) => { setRows(data || []); setSel((s) => new Set([...s].filter((id) => (data || []).some((d) => d.id === id)))); })
      .catch(() => { setRows([]); setErr("Could not load the documents."); });
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const list = useMemo(() => rows || [], [rows]);
  const sort = useSort(list, { signed_at: (d) => d.signed_at || "", title: (d) => (d.title || "").toLowerCase(), prepared_by: (d) => (d.prepared_by || d.signed_by || "").toLowerCase() });
  const picked = list.filter((d) => sel.has(d.id));
  const allChecked = list.length > 0 && picked.length === list.length;
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const signPicked = () => {
    if (!picked.length) return;
    setMsg(""); setErr("");
    digitallySign({
      docs: picked.map((d) => ({
        getPdf: async () => (await api.get(`/signed-documents/${d.id}/file`, { responseType: "blob", timeout: 300000 })).data,
        filename: d.filename || "warrant.pdf", title: d.title || d.filename, source_id: d.id, source_kind: d.source_kind || "warrant", court_id: d.court_id,
      })),
      source_kind: "warrant",
      onSigned: () => { setSel(new Set()); load(); },
    });
  };
  const sendBack = async (d) => {
    const remark = window.prompt(`Return "${d.title || d.filename}" to the staff without signing?\n\nReason / instruction for the staff (optional):`, "");
    if (remark === null) return;
    try { await api.post(`/signature-desk/${d.id}/return`, { remark }); setMsg("Returned to the staff."); load(); }
    catch (e) { setErr(e.response?.data?.detail || "Could not return the document."); }
  };
  const view = async (d) => { setErr(""); try { await openSigned(d); } catch (e) { setErr("Could not open the document."); } };

  return (
    <div className="app-shell">
      <TopBar title="For Signature" />
      <div className="page" style={{ width: "95%", maxWidth: 1300, boxSizing: "border-box" }} data-testid="for-signature">
        <h1>For Signature</h1>
        <p className="welcome-sub">Warrants prepared by the court staff and digitally signed by them as “Prepared by”. Check each one, then select and sign them with your DSC token — one PIN signs all the selected warrants. The signed copies go back to the staff automatically.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span className="hint" style={{ margin: 0 }}>{list.length} waiting · {picked.length} selected</span>
          <button className="btn btn-primary" disabled={!picked.length} onClick={signPicked} data-testid="fs-sign">
            {picked.length > 1 ? `Digitally Sign (${picked.length})` : "Digitally Sign"}
          </button>
        </div>
        {err && <p className="error">{err}</p>}
        {msg && <p className="success">{msg}</p>}
        {rows === null ? <p>Loading...</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="entries" data-testid="fs-table">
              <thead><tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allChecked} onChange={() => setSel(allChecked ? new Set() : new Set(list.map((d) => d.id)))} aria-label="Select all" /></th>
                <SortTh label="Prepared on" k="signed_at" s={sort} />
                <SortTh label="Document" k="title" s={sort} />
                <th>Type</th>
                <SortTh label="Prepared by" k="prepared_by" s={sort} />
                <th>Staff certificate</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {sort.sorted.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)" }}>Nothing is waiting for your signature.</td></tr>}
                {sort.sorted.map((d) => (
                  <tr key={d.id} data-testid="fs-row" className={sel.has(d.id) ? "selected" : ""}>
                    <td><input type="checkbox" checked={sel.has(d.id)} onChange={() => toggle(d.id)} aria-label="Select" /></td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDT(d.signed_at)}</td>
                    <td style={{ minWidth: 200 }}>{d.title || d.filename}</td>
                    <td>{kindLabel(d.source_kind)}</td>
                    <td>{d.prepared_by || d.signed_by}</td>
                    <td style={{ fontSize: 12 }} title={d.cert_subject || ""}>{certName(d.cert_subject)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="btn btn-outline" style={{ padding: "5px 10px" }} onClick={() => view(d)} data-testid="fs-view">View</button>
                        <button className="btn btn-outline" style={{ padding: "5px 10px" }} onClick={() => sendBack(d)} data-testid="fs-return">Return to Staff</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
