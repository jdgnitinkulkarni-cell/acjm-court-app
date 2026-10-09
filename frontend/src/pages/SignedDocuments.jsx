import React, { useEffect, useMemo, useState } from "react";
import api, { getUser } from "../lib/api";
import { TopBar } from "./AdminDashboard";
import { useSort, SortTh } from "../lib/sortable";
import { StatusPill, kindLabel } from "../lib/docdesk";

// Signed Documents — every digitally signed copy kept in NyayDwar.
// Everyone sees what they signed; the Judicial Officer and Court Staff can also
// see what was signed in their court; the Administrator can see everything.
const pad = (n) => String(n).padStart(2, "0");
const fmt = (iso) => { const d = new Date(iso || ""); return Number.isNaN(d.getTime()) ? "" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const SIGN_METHOD = { dsc_token: "DSC token", aadhaar: "Aadhaar (DigiLocker)", other: "Uploaded" };
const KIND = { deposition: "Deposition", s183: "183 Statement", order: "Order", plea: "Plea", primary_fs: "Primary FS", final_fs: "Final FS",
  application: "Application", pursis: "Pursis", surety: "Surety / Bond", warrant: "Conviction Warrant" };
const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
// "Common Name: X, Serial Number: …" → "X" (the full details are shown on hover).
const certName = (s) => { const m = /Common Name: ([^,]+)/.exec(s || ""); return m ? m[1].trim() : (s || ""); };
const signedName = (d) => `${(d.filename || "document.pdf").replace(/\.pdf$/i, "")}_signed.pdf`;

export default function SignedDocuments() {
  const user = getUser();
  const scopes = user?.role === "admin" ? [["all", "All signed documents"], ["mine", "Signed by me"]]
    : ["judge", "staff"].includes(user?.role) ? [["mine", "Signed by me"], ["court", "Signed in my court"]] : [["mine", "Signed by me"]];
  const [scope, setScope] = useState(scopes[0][0]);
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("all");
  const [sel, setSel] = useState(new Set());
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [verify, setVerify] = useState({});

  useEffect(() => {
    setRows(null); setSel(new Set());
    api.get("/signed-documents", { params: { scope } }).then(({ data }) => setRows(data || [])).catch(() => { setRows([]); setErr("Could not load the signed documents."); });
  }, [scope]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((d) => (method === "all" || d.method === method) &&
      (!t || [d.title, d.filename, d.signed_by, d.cert_subject, kindLabel(d.source_kind), d.court_name, fmt(d.signed_at)].join(" ").toLowerCase().includes(t)));
  }, [rows, q, method]);
  const sort = useSort(filtered, {
    signed_at: (d) => d.signed_at || "", title: (d) => (d.title || d.filename || "").toLowerCase(), kind: (d) => kindLabel(d.source_kind),
    method: (d) => SIGN_METHOD[d.method] || "", signed_by: (d) => (d.signed_by || "").toLowerCase(),
  });
  const visibleSel = filtered.filter((d) => sel.has(d.id)).map((d) => d.id);
  const allChecked = filtered.length > 0 && visibleSel.length === filtered.length;
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(filtered.map((d) => d.id)));
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const fetchFile = async (d) => (await api.get(`/signed-documents/${d.id}/file`, { responseType: "blob", timeout: 300000 })).data;
  const view = async (d) => {
    setErr(""); const win = window.open("", "_blank");
    try { const url = URL.createObjectURL(new Blob([await fetchFile(d)], { type: "application/pdf" })); if (win) win.location.href = url; else window.open(url, "_blank"); }
    catch (e) { if (win) win.close(); setErr("Could not open the signed copy."); }
  };
  const download = async (d) => { setErr(""); try { saveBlob(await fetchFile(d), signedName(d)); } catch (e) { setErr("Could not download the signed copy."); } };
  const downloadSelected = async () => {
    if (!visibleSel.length) return;
    setErr(""); setBusy("zip");
    try {
      if (visibleSel.length === 1) { const d = filtered.find((x) => x.id === visibleSel[0]); saveBlob(await fetchFile(d), signedName(d)); }
      else { const res = await api.get("/signed-documents/zip", { params: { ids: visibleSel.join(",") }, responseType: "blob", timeout: 600000 }); saveBlob(res.data, "Signed_Documents.zip"); }
    } catch (e) { setErr("Could not prepare the download."); }
    finally { setBusy(""); }
  };
  const check = async (d) => {
    setVerify((v) => ({ ...v, [d.id]: { loading: true } }));
    try { const { data } = await api.get(`/signed-documents/${d.id}/verify`); setVerify((v) => ({ ...v, [d.id]: data })); }
    catch (e) { setVerify((v) => ({ ...v, [d.id]: { error: true } })); }
  };
  const verifyText = (r) => {
    if (!r) return null;
    if (r.loading) return <span className="hint">Checking…</span>;
    if (r.error) return <span className="error" style={{ margin: 0 }}>Could not check</span>;
    const sigs = r.signatures || [];
    const sigOk = sigs.length ? sigs.every((s) => s.intact) : r.has_signature;
    const good = r.file_ok && sigOk;
    return (
      <span style={{ fontSize: 12, fontWeight: 700, color: good ? "#1f5a44" : "#8f2f27" }} title={[r.message, ...sigs.map((s) => `${s.signer}${s.intact ? " — signature intact" : " — signature NOT intact"}`), r.note].filter(Boolean).join("\n")}>
        {good ? "✔ Unchanged since signing" : r.file_ok ? "⚠ No valid signature found" : "✖ Changed after signing"}
      </span>
    );
  };

  return (
    <div className="app-shell">
      <TopBar title="Signed Documents" />
      <div className="page" style={{ width: "95%", maxWidth: 1400, boxSizing: "border-box" }} data-testid="signed-documents">
        <h1>Signed Documents</h1>
        <p className="welcome-sub">Every document digitally signed in NyayDwar (DSC token) or uploaded after Aadhaar signing. Open, download (several at once as a ZIP) or check that a copy is unchanged since it was signed.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          {scopes.length > 1 && scopes.map(([k, label]) => (
            <button key={k} className={`btn ${scope === k ? "btn-primary" : "btn-outline"}`} style={{ padding: "7px 14px" }} onClick={() => setScope(k)} data-testid={`sd-scope-${k}`}>{label}</button>
          ))}
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }} data-testid="sd-method">
            <option value="all">All methods</option>
            {Object.entries(SIGN_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by document, case number, signer or date"
            style={{ flex: "1 1 280px", minWidth: 220, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8 }} data-testid="sd-search" />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span className="hint" style={{ margin: 0 }}>{filtered.length} document(s) shown · {visibleSel.length} selected</span>
          <button className="btn btn-primary" disabled={!visibleSel.length || !!busy} onClick={downloadSelected} data-testid="sd-download-selected">
            {busy === "zip" ? "Preparing..." : `Download${visibleSel.length > 1 ? " Selected (ZIP)" : ""}`}
          </button>
        </div>
        {err && <p className="error">{err}</p>}
        {rows === null ? <p>Loading...</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="entries" data-testid="sd-table">
              <thead><tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" /></th>
                <SortTh label="Signed on" k="signed_at" s={sort} />
                <SortTh label="Document" k="title" s={sort} />
                <SortTh label="Type" k="kind" s={sort} />
                <SortTh label="Signed by" k="signed_by" s={sort} />
                <SortTh label="Method / Certificate" k="method" s={sort} />
                <th>Status</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {sort.sorted.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>No signed documents yet. Use “Digitally Sign” on any entry to sign it.</td></tr>}
                {sort.sorted.map((d) => (
                  <tr key={d.id} data-testid="sd-row" className={sel.has(d.id) ? "selected" : ""}>
                    <td><input type="checkbox" checked={sel.has(d.id)} onChange={() => toggle(d.id)} aria-label="Select" /></td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmt(d.signed_at)}</td>
                    <td style={{ minWidth: 200 }}>{d.title || d.filename}{d.court_name && scope !== "mine" ? <><br /><span className="hint">{d.court_name}</span></> : null}</td>
                    <td>{kindLabel(d.source_kind)}</td>
                    <td style={{ minWidth: 150 }}>{d.signed_by}</td>
                    <td style={{ fontSize: 12, maxWidth: 200 }} title={d.cert_subject ? `${d.cert_subject}${d.cert_issuer ? `\nIssued by: ${d.cert_issuer}` : ""}` : ""}><span style={{ fontSize: 14 }}>{SIGN_METHOD[d.method] || d.method}</span><br />{certName(d.cert_subject) || (d.method === "aadhaar" ? (d.has_signature ? "Signed PDF uploaded" : "PDF uploaded (no signature found)") : "")}</td>
                    <td style={{ minWidth: 150, maxWidth: 220 }}><StatusPill d={d} /></td>
                    <td style={{ minWidth: 230 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        <button className="btn btn-outline" style={{ padding: "5px 10px" }} onClick={() => view(d)} data-testid="sd-view">View</button>
                        <button className="btn btn-primary" style={{ padding: "5px 10px" }} onClick={() => download(d)} data-testid="sd-download">Download</button>
                        <button className="btn btn-outline" style={{ padding: "5px 10px" }} onClick={() => check(d)} data-testid="sd-verify" title="Check that this copy is unchanged since it was signed">Verify</button>
                        {verifyText(verify[d.id])}
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
