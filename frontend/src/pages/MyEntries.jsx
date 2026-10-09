import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getUser } from "../lib/api";
import { TopBar } from "./AdminDashboard";
import { setSelectedCourt } from "./SelectCourt";
import { useSort, SortTh } from "../lib/sortable";
import { digitallySign } from "../lib/sign";

// My Entries — everything the signed-in Advocate / Litigant has prepared.

const KIND_LABEL = { plea: "Plea", primary_fs: "Primary FS", final_fs: "Final FS", application: "Application", pursis: "Pursis", surety: "Surety / Bond" };
const LANG = { gu: "Gujarati", en: "English", hi: "Hindi" };
const pad = (n) => String(n).padStart(2, "0");
const fmt = (iso) => { const d = new Date(iso || ""); return Number.isNaN(d.getTime()) ? "" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const stem = (v) => String(v || "").replace(/^eCC\/No\.\//i, "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "document";

async function applyCourt(courtId) {
  if (!courtId) return;
  try {
    const { data } = await api.get(`/courts/${courtId}`);
    if (data?.id) setSelectedCourt(data);
  } catch (e) { /* keep the current court */ }
}

export default function MyEntries() {
  const navigate = useNavigate();
  const user = getUser();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [busy, setBusy] = useState("");
  const [picked, setPicked] = useState(() => new Set());

  useEffect(() => {
    api.get("/my/entries").then(({ data }) => setRows(Array.isArray(data) ? data : [])).catch((e) => { setErr(e.response?.data?.detail || "Could not load your entries."); setRows([]); });
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows || []).filter((r) => (kind === "all" || r.kind === kind) &&
      (!s || [r.case_number, r.party, r.document_type, KIND_LABEL[r.kind], r.court_name, fmt(r.created_at)].join(" ").toLowerCase().includes(s)));
  }, [rows, q, kind]);
  const sort = useSort(filtered, {
    type: (r) => KIND_LABEL[r.kind] || r.kind,
    date: (r) => r.created_at,
    language: (r) => LANG[r.language] || r.language,
  });

  const isDoc = (r) => ["application", "pursis", "surety"].includes(r.kind);

  const openEdit = async (r) => {
    await applyCourt(r.court_id);
    if (r.kind === "plea") navigate(r.plea_type === "sanjabi" ? `/advocate/plea/sanjabi/${r.language}/${r.id}` : `/advocate/plea/form/${r.language}/${r.id}`);
    else if (r.kind === "primary_fs") navigate(`/advocate/primary-fs/form/${r.plea_id}`);
    else if (r.kind === "final_fs") navigate(`/advocate/final-fs/form/${r.plea_id}`);
    else {
      const uid = user?.id || "guest";
      const key = `doc_draft_${uid}_${r.kind}_${r.language}`;
      try {
        if (localStorage.getItem(key) && !localStorage.getItem(`${key}__done`) &&
          !window.confirm("You have an unfinished draft of this document. Replace it with this entry to edit?")) return;
        localStorage.setItem(key, JSON.stringify(r.fields || {}));
        localStorage.setItem(`${key}__at`, String(Date.now()));
        localStorage.removeItem(`${key}__done`);
      } catch (e) { /* ignore */ }
      window.location.href = `/doc-generator.html?kind=${r.kind}&lang=${r.language}`;
    }
  };

  const reviewPath = (r) => (r.kind === "plea" ? `/advocate/plea/review/${r.id}` : r.kind === "primary_fs" ? `/advocate/primary-fs/review/${r.plea_id}` : `/advocate/final-fs/review/${r.plea_id}`);

  const docPdf = async (r, download) => {
    setBusy(`${r.id}-${download ? "d" : "v"}`);
    const win = download ? null : window.open("", "_blank");
    try {
      const filename = `${stem(r.case_number)}_${stem(r.document_type) !== "document" ? stem(r.document_type) : stem(KIND_LABEL[r.kind])}.pdf`;
      const res = await api.post("/pdf", { filename, title: r.document_type || KIND_LABEL[r.kind], html: r.html || "" }, { responseType: "blob", timeout: 300000 });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      if (download) {
        const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      } else if (win) win.location.href = url; else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) { if (win) win.close(); setErr("Could not prepare the PDF. Please try again."); }
    finally { setBusy(""); }
  };

  const view = async (r) => { if (isDoc(r)) return docPdf(r, false); await applyCourt(r.court_id); navigate(reviewPath(r)); };
  const download = async (r) => { if (isDoc(r)) return docPdf(r, true); await applyCourt(r.court_id); navigate(`${reviewPath(r)}?download=1`); };

  const docItem = (r) => {
    const filename = `${stem(r.case_number)}_${stem(r.document_type) !== "document" ? stem(r.document_type) : stem(KIND_LABEL[r.kind])}.pdf`;
    return {
      getPdf: async () => (await api.post("/pdf", { filename, title: r.document_type || KIND_LABEL[r.kind], html: r.html || "" }, { responseType: "blob", timeout: 300000 })).data,
      filename, title: `${r.document_type || KIND_LABEL[r.kind]} — ${r.case_number || ""}`, source_id: r.id, source_kind: r.kind, court_id: r.court_id || "",
    };
  };
  const pickKey = (r) => `${r.kind}-${r.id}`;
  const togglePick = (r) => setPicked((s0) => { const n = new Set(s0); const k = pickKey(r); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const signPicked = () => {
    const list = (rows || []).filter((r) => isDoc(r) && picked.has(pickKey(r)));
    if (!list.length) return;
    const kinds = new Set(list.map((r) => r.kind));
    digitallySign({ docs: list.map(docItem), source_kind: kinds.size === 1 ? list[0].kind : "document" });
  };

  const sign = async (r) => {
    if (isDoc(r)) {
      digitallySign({ docs: [docItem(r)], source_kind: r.kind });
      return;
    }
    await applyCourt(r.court_id);
    navigate(`${reviewPath(r)}?sign=1`);
  };

  const kinds = ["all", ...Object.keys(KIND_LABEL).filter((k) => (rows || []).some((r) => r.kind === k))];
  return (
    <div className="app-shell">
      <TopBar title="My Entries" />
      <div className="page" style={{ width: "95%", maxWidth: 1400, boxSizing: "border-box" }} data-testid="my-entries">
        <h1>My Entries</h1>
        <p className="welcome-sub">Every Plea, FS, Application, Pursis and Surety / Bond you have prepared while signed in. Open to edit, view the PDF or download it.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {kinds.map((k) => (
            <button key={k} className={`btn ${kind === k ? "btn-primary" : "btn-outline"}`} style={{ padding: "7px 14px" }} onClick={() => setKind(k)}>
              {k === "all" ? "All" : KIND_LABEL[k]} ({(rows || []).filter((r) => k === "all" || r.kind === k).length})
            </button>
          ))}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by case number, party, document or date"
            style={{ flex: "1 1 300px", minWidth: 220, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8 }} data-testid="my-entries-search" />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span className="hint" style={{ margin: 0 }}>{(rows || []).filter((r) => isDoc(r) && picked.has(pickKey(r))).length} selected</span>
          <button className="btn btn-primary" disabled={!(rows || []).filter((r) => isDoc(r) && picked.has(pickKey(r))).length} onClick={signPicked} data-testid="my-entries-sign-selected"
            title="Select Applications / Pursis / Sureties with the tick boxes and sign them together (one PIN signs all)">Digitally Sign Selected</button>
        </div>
        {err && <p className="error">{err}</p>}
        {rows === null ? <p>Loading...</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="entries" data-testid="my-entries-table">
              <thead><tr>
                <th style={{ width: 36 }} title="Select Applications / Pursis / Sureties to sign several together"><input type="checkbox" aria-label="Select all"
                  checked={sort.sorted.some(isDoc) && sort.sorted.filter(isDoc).every((r) => picked.has(pickKey(r)))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(sort.sorted.filter(isDoc).map(pickKey)) : new Set())} data-testid="my-entries-pick-all" /></th>
                <th style={{ width: 50 }}>Sr.</th>
                <SortTh label="Type" k="type" s={sort} />
                <SortTh label="Case No." k="case_number" s={sort} />
                <SortTh label="Party / Applicant" k="party" s={sort} />
                <SortTh label="Language" k="language" s={sort} />
                <SortTh label="Court" k="court_name" s={sort} />
                <SortTh label="Date" k="date" s={sort} />
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {sort.sorted.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)" }}>No entries yet. Documents you prepare after signing in will appear here.</td></tr>}
                {sort.sorted.map((r, i) => (
                  <tr key={`${r.kind}-${r.id}`} data-testid="my-entry-row">
                    <td>{isDoc(r)
                      ? <input type="checkbox" checked={picked.has(pickKey(r))} onChange={() => togglePick(r)} aria-label="Select" data-testid="my-entry-pick" />
                      : <input type="checkbox" disabled title="Plea / FS: use its own Digitally Sign button" aria-label="Not selectable" />}</td>
                    <td>{i + 1}</td>
                    <td><span className="pill">{KIND_LABEL[r.kind]}</span>{r.document_type && isDoc(r) ? <><br /><span className="hint">{r.document_type}</span></> : null}</td>
                    <td>{r.case_number}</td>
                    <td>{r.party}</td>
                    <td>{LANG[r.language] || r.language}</td>
                    <td style={{ minWidth: 170, maxWidth: 240, fontSize: 13, lineHeight: 1.35 }}>{r.court_name}</td>
                    <td>{fmt(r.created_at)}</td>
                    <td style={{ minWidth: 200 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <button className="btn btn-outline" style={{ padding: "5px 10px" }} onClick={() => openEdit(r)} data-testid="my-entry-edit">Open / Edit</button>
                        <button className="btn btn-outline" style={{ padding: "5px 10px" }} disabled={!!busy} onClick={() => view(r)} data-testid="my-entry-view">{busy === `${r.id}-v` ? "Preparing..." : "View PDF"}</button>
                        <button className="btn btn-primary" style={{ padding: "5px 10px" }} disabled={!!busy} onClick={() => download(r)} data-testid="my-entry-download">{busy === `${r.id}-d` ? "Preparing..." : "Download PDF"}</button>
                        <button className="btn btn-outline" style={{ padding: "5px 10px" }} disabled={!!busy} onClick={() => sign(r)} data-testid="my-entry-sign">Digitally Sign</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ marginTop: 12 }}>Entries made before this feature was added, or made without signing in, are not listed here.</p>
      </div>
    </div>
  );
}
