import React, { useCallback, useEffect, useMemo, useState } from "react";
import api, { getUser } from "../lib/api";
import { TopBar } from "./AdminDashboard";
import { useSort, SortTh } from "../lib/sortable";
import { fmtDT, kindLabel, certName, openSigned, downloadSignedMany, StatusPill } from "../lib/docdesk";
import { SIGN_METHOD } from "./SignedDocuments";

// Court's "Documents Submitted" desk: applications, pursis, sureties, pleas etc.
// that Advocates / Litigants have digitally signed for this court. The staff
// download them, place them on the case record and mark them "Placed on record".
export default function SubmittedDocuments() {
  const user = getUser();
  const isStaff = user?.role === "staff";
  const [status, setStatus] = useState(isStaff ? "new" : "all");
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api.get("/submitted-documents", { params: { status } }).then(({ data }) => setRows(data || [])).catch(() => { setRows([]); setErr("Could not load the documents."); });
  }, [status]);
  useEffect(() => { setRows(null); setSel(new Set()); load(); }, [load]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((d) => !t || [d.title, d.filename, d.signed_by, kindLabel(d.source_kind), fmtDT(d.signed_at)].join(" ").toLowerCase().includes(t));
  }, [rows, q]);
  const sort = useSort(filtered, { signed_at: (d) => d.signed_at || "", title: (d) => (d.title || "").toLowerCase(), signed_by: (d) => (d.signed_by || "").toLowerCase(), kind: (d) => kindLabel(d.source_kind) });
  const picked = filtered.filter((d) => sel.has(d.id));
  const allChecked = filtered.length > 0 && picked.length === filtered.length;
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const download = async (list) => {
    if (!list.length) return;
    setErr(""); setBusy("dl");
    try { await downloadSignedMany(list); } catch (e) { setErr("Could not prepare the download."); } finally { setBusy(""); }
  };
  const mark = async (st) => {
    if (!picked.length) return;
    setErr(""); setBusy("mark");
    try { await api.post("/submitted-documents/mark", { ids: picked.map((d) => d.id), status: st }); setSel(new Set()); load(); }
    catch (e) { setErr(e.response?.data?.detail || "Could not update."); } finally { setBusy(""); }
  };
  const tabs = [["new", "New"], ["placed", "Placed on record"], ["all", "All"]];

  return (
    <div className="app-shell">
      <TopBar title="Documents Submitted" />
      <div className="page" style={{ width: "95%", maxWidth: 1400, boxSizing: "border-box" }} data-testid="submitted-documents">
        <h1>Documents Submitted</h1>
        <p className="welcome-sub">Documents digitally signed by Advocates and Litigants for this court. Download them, place them on the case record, then mark them “Placed on record”.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          {tabs.map(([k, label]) => (
            <button key={k} className={`btn ${status === k ? "btn-primary" : "btn-outline"}`} style={{ padding: "7px 14px" }} onClick={() => setStatus(k)} data-testid={`sub-tab-${k}`}>{label}</button>
          ))}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by document, case number, advocate / litigant or date"
            style={{ flex: "1 1 280px", minWidth: 220, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8 }} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span className="hint" style={{ margin: 0 }}>{filtered.length} document(s) · {picked.length} selected</span>
          <button className="btn btn-primary" disabled={!picked.length || !!busy} onClick={() => download(picked)} data-testid="sub-download">
            {busy === "dl" ? "Preparing..." : picked.length > 1 ? "Download Selected (ZIP)" : "Download"}
          </button>
          {isStaff && <button className="btn btn-outline" disabled={!picked.length || !!busy} onClick={() => mark("placed")} data-testid="sub-placed">Mark “Placed on record”</button>}
          {isStaff && status !== "new" && <button className="btn btn-outline" disabled={!picked.length || !!busy} onClick={() => mark("new")}>Mark as New</button>}
        </div>
        {err && <p className="error">{err}</p>}
        {rows === null ? <p>Loading...</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="entries" data-testid="sub-table">
              <thead><tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allChecked} onChange={() => setSel(allChecked ? new Set() : new Set(filtered.map((d) => d.id)))} aria-label="Select all" /></th>
                <SortTh label="Received on" k="signed_at" s={sort} />
                <SortTh label="Document" k="title" s={sort} />
                <SortTh label="Type" k="kind" s={sort} />
                <SortTh label="Submitted by" k="signed_by" s={sort} />
                <th>Signed with</th>
                <th>Status</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {sort.sorted.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>No documents here.</td></tr>}
                {sort.sorted.map((d) => (
                  <tr key={d.id} data-testid="sub-row" className={sel.has(d.id) ? "selected" : ""}>
                    <td><input type="checkbox" checked={sel.has(d.id)} onChange={() => toggle(d.id)} aria-label="Select" /></td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDT(d.signed_at)}</td>
                    <td style={{ minWidth: 200 }}>{d.title || d.filename}</td>
                    <td>{kindLabel(d.source_kind)}</td>
                    <td style={{ minWidth: 150 }}>{d.signed_by}</td>
                    <td style={{ fontSize: 12 }} title={d.cert_subject || ""}>{SIGN_METHOD[d.method] || d.method}{d.cert_subject ? <><br />{certName(d.cert_subject)}</> : null}</td>
                    <td><StatusPill d={d} /></td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="btn btn-outline" style={{ padding: "5px 10px" }} onClick={() => openSigned(d).catch(() => setErr("Could not open the document."))}>View</button>
                        <button className="btn btn-primary" style={{ padding: "5px 10px" }} onClick={() => download([d])}>Download</button>
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
