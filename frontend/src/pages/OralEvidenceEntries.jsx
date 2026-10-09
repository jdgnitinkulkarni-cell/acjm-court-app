import React, { useEffect, useMemo, useState } from "react";
import { useSort, SortTh } from "../lib/sortable";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { TopBar } from "./AdminDashboard";
import { digitallySign } from "../lib/sign";

// Oral Evidence -> View Entries: every deposition and every statement under
// Section 183 BNSS, newest first, with type tabs, search, period filter and
// checkbox selection for opening / editing / downloading.

const LANG_LABELS = { gu: "Gujarati", hi: "Hindi", en: "English" };
const TYPE_TABS = [
  { value: "deposition", label: "Depositions" },
  { value: "s183", label: "183 Statements" },
  { value: "all", label: "All" },
];
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

export default function OralEvidenceEntries() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(() => sessionStorage.getItem("acjm_oe_entries_tab") || "all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api.get("/depositions/entries")
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.response?.data?.detail || "Could not load the entries."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { try { sessionStorage.setItem("acjm_oe_entries_tab", tab); } catch (e) { /* ignore */ } }, [tab]);

  const filtered = useMemo(() => {
    let start = null;
    let end = null;
    if (period === "1m") start = monthsAgo(1);
    if (period === "3m") start = monthsAgo(3);
    if (period === "6m") start = monthsAgo(6);
    if (period === "custom") {
      if (from) { start = new Date(`${from}T00:00:00`); }
      if (to) { end = new Date(`${to}T23:59:59`); }
    }
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== "all" && r.record_type !== tab) return false;
      const d = toDate(r.recorded_at);
      if (start && (!d || d < start)) return false;
      if (end && (!d || d > end)) return false;
      if (!q) return true;
      const hay = [
        r.witness_name, r.case_number, ...(r.case_ids || []), r.police_station, r.fir_number,
        fmtDate(d), fmtDate(d).replace(/\//g, "-"), fmtDate(d).replace(/\//g, "."), ymd(d),
      ].join(" | ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, tab, search, period, from, to]);
  const srt = useSort(filtered, {
    type: (r) => (r.record_type === "s183" ? "183 Statement" : "Deposition"),
    case: (r) => (r.record_type === "s183" ? `${r.police_station} ${r.fir_number}` : r.case_number),
    date: (r) => r.recorded_at,
    language: (r) => LANG_LABELS[r.language] || r.language,
  });

  // Keep the selection limited to what is currently visible.
  const visibleIds = useMemo(() => new Set(filtered.map((r) => r.id)), [filtered]);
  const selectedVisible = [...selected].filter((id) => visibleIds.has(id));
  const allChecked = filtered.length > 0 && selectedVisible.length === filtered.length;

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.id)));
  };
  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((x) => visibleIds.has(x)));
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openEdit = () => {
    if (selectedVisible.length !== 1) return;
    navigate(`/judge-desk/oral-evidence/deposition/type/${selectedVisible[0]}`);
  };

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
    } finally {
      setBusy("");
    }
  };

  const signSelected = () => {
    if (selectedVisible.length === 0) return;
    const docs = selectedVisible.map((id) => {
      const row = filtered.find((r) => r.id === id);
      const name = `${row?.record_type === "s183" ? "183_Statement" : "Deposition"}_${row?.case_number || ""}_${row?.witness_name || "witness"}.pdf`.replace(/[\\/:*?"<>|\s]+/g, "_");
      return {
        getPdf: async () => (await api.get(`/depositions/${id}/print`, { responseType: "blob", timeout: 300000 })).data,
        filename: name, title: `${row?.record_type === "s183" ? "183 Statement" : "Deposition"} — ${row?.witness_name || ""} (${row?.case_number || ""})`, source_id: id,
      };
    });
    const kinds = new Set(selectedVisible.map((id) => filtered.find((r) => r.id === id)?.record_type === "s183" ? "s183" : "deposition"));
    digitallySign({ docs, source_kind: kinds.size === 1 ? [...kinds][0] : "deposition" });
  };

  const downloadPdfs = async () => {
    if (selectedVisible.length === 0) return;
    setBusy("zip");
    setError("");
    try {
      if (selectedVisible.length === 1) {
        const row = filtered.find((r) => r.id === selectedVisible[0]);
        const res = await api.get(`/depositions/${selectedVisible[0]}/print`, { responseType: "blob" });
        const name = `${row?.record_type === "s183" ? "183_Statement" : "Deposition"}_${row?.witness_name || "witness"}.pdf`.replace(/[\\/:*?"<>|]+/g, "_");
        saveBlob(new Blob([res.data], { type: "application/pdf" }), name);
      } else {
        const res = await api.post("/depositions/print-zip", { ids: selectedVisible }, { responseType: "blob", timeout: 600000 });
        saveBlob(new Blob([res.data], { type: "application/zip" }), "Oral_Evidence_Records.zip");
      }
    } catch (e) {
      setError("Could not prepare the download. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const tabCount = (value) => rows.filter((r) => value === "all" || r.record_type === value).length;

  return (
    <div className="app-shell">
      <TopBar title="Oral Evidence — View Entries" />
      <div className="page" data-testid="oe-entries" style={{ width: "92%", maxWidth: 1400, boxSizing: "border-box" }}>
        <h1>View Entries</h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {TYPE_TABS.map((t) => (
            <button
              key={t.value}
              className={`btn ${tab === t.value ? "btn-primary" : "btn-outline"}`}
              onClick={() => { setTab(t.value); setSelected(new Set()); }}
              data-testid={`oe-tab-${t.value}`}
            >
              {t.label} ({tabCount(t.value)})
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by witness name, case number / FIR, or date (dd/mm/yyyy)"
            style={{ flex: "1 1 380px", minWidth: 260, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 15 }}
            data-testid="oe-search"
          />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 15 }} data-testid="oe-period">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {period === "custom" && (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4 }} data-testid="oe-from" />
              To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4 }} data-testid="oe-to" />
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span className="hint" style={{ margin: 0 }}>
            {filtered.length} record(s) shown · {selectedVisible.length} selected
          </span>
          <button className="btn btn-outline" disabled={selectedVisible.length !== 1} onClick={openEdit} title="Select exactly one record to open it for correction" data-testid="oe-edit">Open / Edit</button>
          <button className="btn btn-outline" disabled={selectedVisible.length !== 1 || !!busy} onClick={viewPdf} title="Select exactly one record to view its PDF" data-testid="oe-view">{busy === "pdf" ? "Preparing..." : "View PDF"}</button>
          <button className="btn btn-primary" disabled={selectedVisible.length === 0 || !!busy} onClick={downloadPdfs} title="Download the selected records (several records come as one ZIP file)" data-testid="oe-download">
            {busy === "zip" ? "Preparing download..." : `Download PDF${selectedVisible.length > 1 ? "s (ZIP)" : ""}`}
          </button>
          <button className="btn btn-outline" disabled={selectedVisible.length === 0 || !!busy} onClick={signSelected} title="Select one or more records to sign them digitally (one PIN signs all)" data-testid="oe-sign">{selectedVisible.length > 1 ? `Digitally Sign (${selectedVisible.length})` : "Digitally Sign"}</button>
        </div>

        {error && <p className="error">{error}</p>}

        {loading ? <p>Loading...</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="entries" data-testid="oe-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={filtered.length === 0} title="Select all shown records" data-testid="oe-select-all" />
                  </th>
                  <th>Sr.</th>
                  <SortTh label="Type" k="type" s={srt} />
                  <SortTh label="Case No. / FIR" k="case" s={srt} />
                  <SortTh label="Name of Witness" k="witness_name" s={srt} />
                  <SortTh label="Date Recorded" k="date" s={srt} />
                  <SortTh label="Language" k="language" s={srt} />
                  <SortTh label="Status" k="status_label" s={srt} />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>No records match.</td></tr>
                )}
                {srt.sorted.map((r, i) => {
                  const d = toDate(r.recorded_at);
                  const checked = selected.has(r.id);
                  return (
                    <tr key={r.id} onClick={() => toggleOne(r.id)} style={{ cursor: "pointer", background: checked ? "#eef2ff" : undefined }}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked} onChange={() => toggleOne(r.id)} />
                      </td>
                      <td>{i + 1}</td>
                      <td>{r.record_type === "s183" ? "183 Statement" : "Deposition"}{r.continued ? " (continued)" : ""}</td>
                      <td>
                        {r.record_type === "s183"
                          ? <>{r.police_station} P.S.<br />FIR {r.fir_number}</>
                          : <>{r.case_number}{r.exhibit_number ? <><br /><span className="hint">Exh. {r.exhibit_number}</span></> : null}</>}
                      </td>
                      <td>{r.witness_name}</td>
                      <td>{fmtDate(d)}<br /><span className="hint">{fmtTime(d)}</span></td>
                      <td>{LANG_LABELS[r.language] || r.language}</td>
                      <td>{r.status_label}</td>
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
