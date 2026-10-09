import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getUser } from "../lib/api";
import { TopBar } from "./AdminDashboard";

// Message Center — email-like messaging between Judicial Officers, Court Staff
// and registered (approved) Advocates / Litigants. Folders: Inbox, Sent, Drafts.

const FOLDERS = [
  { value: "inbox", label: "Inbox" },
  { value: "sent", label: "Sent" },
  { value: "drafts", label: "Drafts" },
];
const MSG_ROLES = ["judge", "staff", "advocate", "litigant"];

const pad = (n) => String(n).padStart(2, "0");
function fmtWhen(iso) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtSize(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 15 };

function Signature({ who }) {
  if (!who) return null;
  return (
    <div className="msg-signature" style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--border)", lineHeight: 1.5 }} data-testid="msg-signature">
      <strong>{who.name}</strong>
      {(who.lines || []).map((l, i) => <div key={i} style={{ color: "#4b5563" }}>{l}</div>)}
    </div>
  );
}

function RecipientField({ label, value, onChange, testid }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(() => {
      api.get("/messages/directory", { params: { q: term } })
        .then(({ data }) => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const add = (p) => {
    if (!value.some((v) => v.id === p.id)) onChange([...value, p]);
    setQ(""); setResults([]); setOpen(false);
  };
  const remove = (id) => onChange(value.filter((v) => v.id !== id));

  return (
    <>
      <label>{label}</label>
      <div ref={boxRef} style={{ position: "relative" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", border: "1px solid var(--border)", borderRadius: 4, padding: "5px 6px", background: "#fff" }}>
          {value.map((p) => (
            <span key={p.id} title={(p.lines || []).join(", ")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#eef2ff", color: "#1e3a8a", borderRadius: 14, padding: "3px 10px", fontSize: 14 }}>
              {p.name} <span style={{ color: "#6b7280" }}>· {p.designation || p.role_label}</span>
              <button type="button" onClick={() => remove(p.id)} style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 15, color: "#6b7280", padding: 0 }} aria-label={`Remove ${p.name}`}>×</button>
            </span>
          ))}
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { e.preventDefault(); add(results[0]); } if (e.key === "Backspace" && !q && value.length) remove(value[value.length - 1].id); }}
            placeholder={value.length ? "" : "Type name, mobile number or email"}
            style={{ flex: "1 1 200px", minWidth: 160, border: 0, outline: "none", padding: "5px 4px", fontSize: 15 }}
            data-testid={testid}
          />
        </div>
        {open && q.trim().length >= 2 && (
          <div style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", marginTop: 2, background: "#fff", border: "1px solid var(--border)", borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.12)", maxHeight: 300, overflowY: "auto" }} data-testid={`${testid}-results`}>
            {searching && results.length === 0 ? <div style={{ padding: 10, color: "#6b7280" }}>Searching...</div>
              : results.length === 0 ? <div style={{ padding: 10, color: "#6b7280" }}>No matching person found.</div>
              : results.map((p) => (
                <div key={p.id} onMouseDown={(e) => { e.preventDefault(); add(p); }} style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f7ff"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>
                  <div><strong>{p.name}</strong> <span style={{ fontSize: 12, background: "#f3f4f6", borderRadius: 10, padding: "1px 8px", marginLeft: 4 }}>{p.role_label}</span></div>
                  <div style={{ fontSize: 13, color: "#4b5563" }}>{(p.lines || []).join(" · ")}{p.hint ? ` · ${p.hint}` : ""}</div>
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}

function Composer({ me, draft, onDone, onCancel }) {
  const [to, setTo] = useState(draft?.to || []);
  const [cc, setCc] = useState(draft?.cc || []);
  const [subject, setSubject] = useState(draft?.subject || "");
  const [body, setBody] = useState(draft?.body || "");
  const [kept, setKept] = useState(draft?.attachments || []);
  const [files, setFiles] = useState([]);
  const [draftId, setDraftId] = useState(draft?.id || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);

  const addFiles = (list) => {
    const arr = Array.from(list || []);
    const big = arr.find((f) => f.size > 25 * 1024 * 1024);
    if (big) { setErr(`'${big.name}' is larger than 25 MB.`); return; }
    setErr("");
    setFiles((prev) => [...prev, ...arr]);
  };

  const save = async (action) => {
    setErr("");
    if (action === "send") {
      if (to.length === 0) { setErr("Please add at least one recipient in 'To'."); return; }
      if (!subject.trim()) { setErr("Please enter the Subject."); return; }
    }
    const fd = new FormData();
    fd.append("action", action);
    fd.append("draft_id", draftId);
    fd.append("to", JSON.stringify(to.map((p) => p.id)));
    fd.append("cc", JSON.stringify(cc.map((p) => p.id)));
    fd.append("subject", subject);
    fd.append("body", body);
    fd.append("keep_attachments", JSON.stringify(kept.map((a) => a.id)));
    files.forEach((f) => fd.append("files", f, f.name));
    setBusy(action);
    try {
      const { data } = await api.post("/messages/save", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 600000 });
      if (action === "send") { onDone("sent", "Message sent."); return; }
      setDraftId(data.id); setKept(data.attachments || []); setFiles([]);
      onDone("drafts", "Saved to Drafts.");
    } catch (e) {
      setErr(e.response?.data?.detail || (action === "send" ? "Could not send the message." : "Could not save the draft."));
    } finally { setBusy(""); }
  };

  const discard = async () => {
    if ((subject || body || to.length || files.length) && !window.confirm("Discard this message?")) return;
    if (draftId) await api.delete(`/messages/${draftId}`).catch(() => {});
    onCancel(draftId ? "drafts" : null);
  };

  return (
    <div data-testid="msg-composer">
      <h2 style={{ marginTop: 0 }}>{draftId ? "Edit Draft" : "New Message"}</h2>
      <div className="form-grid" style={{ gridTemplateColumns: "90px minmax(0, 1fr)", gap: "12px 14px" }}>
        <RecipientField label="To" value={to} onChange={setTo} testid="msg-to" />
        <RecipientField label="CC" value={cc} onChange={setCc} testid="msg-cc" />
        <label>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} data-testid="msg-subject" />
        <label>Attachments</label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          style={{ border: "1px dashed var(--border)", borderRadius: 4, padding: 10, background: "#fafafa" }}
        >
          <button type="button" className="btn btn-outline" style={{ padding: "5px 12px" }} onClick={() => fileRef.current?.click()} data-testid="msg-attach-btn">+ Attach files</button>
          <span className="hint" style={{ marginLeft: 10 }}>or drop files here · up to 25 MB each</span>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} data-testid="msg-file-input" />
          {(kept.length > 0 || files.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {kept.map((a) => (
                <span key={a.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px", fontSize: 14 }}>
                  📎 {a.filename} <span className="hint">({fmtSize(a.size)})</span>
                  <button type="button" onClick={() => setKept(kept.filter((x) => x.id !== a.id))} style={{ border: 0, background: "transparent", cursor: "pointer", marginLeft: 4 }} aria-label="Remove">×</button>
                </span>
              ))}
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px", fontSize: 14 }}>
                  📎 {f.name} <span className="hint">({fmtSize(f.size)})</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} style={{ border: 0, background: "transparent", cursor: "pointer", marginLeft: 4 }} aria-label="Remove">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type your message here"
        style={{ ...inputStyle, marginTop: 14, minHeight: 220, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
        data-testid="msg-body"
      />
      <Signature who={me} />
      {err && <p className="error">{err}</p>}
      <div className="form-actions" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-secondary" onClick={discard} disabled={!!busy} data-testid="msg-discard">Discard</button>
        <button className="btn btn-outline" onClick={() => save("draft")} disabled={!!busy} data-testid="msg-save-draft">{busy === "draft" ? "Saving..." : "Save Draft"}</button>
        <button className="btn btn-primary" onClick={() => save("send")} disabled={!!busy} data-testid="msg-send">{busy === "send" ? "Sending..." : "Send"}</button>
      </div>
    </div>
  );
}

function MessageView({ msg, onBack }) {
  const download = async (a) => {
    try {
      const res = await api.get(`/messages/${msg.id}/attachments/${a.id}`, { responseType: "blob", timeout: 600000 });
      const url = URL.createObjectURL(new Blob([res.data], { type: a.content_type || "application/octet-stream" }));
      const link = document.createElement("a");
      link.href = url; link.download = a.filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { alert("Could not download the attachment."); }
  };
  const openFile = async (a) => {
    const win = window.open("", "_blank");
    try {
      const res = await api.get(`/messages/${msg.id}/attachments/${a.id}`, { responseType: "blob", timeout: 600000 });
      const url = URL.createObjectURL(new Blob([res.data], { type: a.content_type || "application/octet-stream" }));
      if (win) win.location.href = url; else window.open(url, "_blank");
    } catch (e) { if (win) win.close(); alert("Could not open the attachment."); }
  };
  const names = (list) => list.map((p) => `${p.name} (${p.designation || p.role_label})`).join("; ");
  const viewable = (a) => /^(application\/pdf|image\/|text\/plain)/.test(a.content_type || "");
  return (
    <div data-testid="msg-view">
      <button className="btn btn-outline" style={{ padding: "5px 12px", marginBottom: 12 }} onClick={onBack}>← Back to list</button>
      <h2 style={{ marginTop: 0, wordBreak: "break-word" }}>{msg.subject || "(no subject)"}</h2>
      <div style={{ lineHeight: 1.7, fontSize: 15, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        <div><strong>From:</strong> {msg.from?.name} <span className="hint">({msg.from?.designation || msg.from?.role_label})</span></div>
        <div><strong>To:</strong> {names(msg.to || [])}</div>
        {(msg.cc || []).length > 0 && <div><strong>CC:</strong> {names(msg.cc)}</div>}
        <div><strong>Date:</strong> {fmtWhen(msg.sent_at || msg.updated_at)}</div>
      </div>
      {(msg.attachments || []).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0" }} data-testid="msg-attachments">
          {msg.attachments.map((a) => (
            <span key={a.id} style={{ border: "1px solid var(--border)", borderRadius: 4, padding: "5px 10px", background: "#fafafa", fontSize: 14 }}>
              📎 {a.filename} <span className="hint">({fmtSize(a.size)})</span>{" "}
              {viewable(a) && <button className="btn btn-outline" style={{ padding: "2px 8px", marginLeft: 6 }} onClick={() => openFile(a)}>Open</button>}
              <button className="btn btn-outline" style={{ padding: "2px 8px", marginLeft: 6 }} onClick={() => download(a)}>Download</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ whiteSpace: "pre-wrap", fontSize: 16, lineHeight: 1.6, padding: "12px 0", wordBreak: "break-word" }} data-testid="msg-body-view">{msg.body}</div>
      <Signature who={msg.signature} />
    </div>
  );
}

export default function MessageCenter() {
  const navigate = useNavigate();
  const user = getUser();
  const allowed = MSG_ROLES.includes(user?.role);
  const [me, setMe] = useState(null);
  const [unread, setUnread] = useState(0);
  const [folder, setFolder] = useState("inbox");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState("list"); // list | view | compose
  const [current, setCurrent] = useState(null);

  const refreshMe = () => api.get("/messages/me").then(({ data }) => { setMe(data.identity); setUnread(data.unread || 0); }).catch((e) => setErr(e.response?.data?.detail || "Message Center is not available."));
  const loadFolder = (f) => {
    setLoading(true);
    return api.get("/messages", { params: { folder: f } })
      .then(({ data }) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setErr(e.response?.data?.detail || "Could not load messages."))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    refreshMe();
    loadFolder("inbox");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goFolder = (f) => { setFolder(f); setMode("list"); setCurrent(null); setNote(""); loadFolder(f); refreshMe(); };

  const openItem = async (m) => {
    setNote("");
    try {
      const { data } = await api.get(`/messages/${m.id}`);
      if (folder === "drafts") { setCurrent(data); setMode("compose"); return; }
      setCurrent(data); setMode("view");
      if (!m.read) { setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x))); refreshMe(); }
    } catch (e) { setErr(e.response?.data?.detail || "Could not open the message."); }
  };

  if (!allowed) {
    return (
      <div className="app-shell">
        <TopBar title="Message Center" />
        <div className="page" style={{ width: "92%", maxWidth: 900, boxSizing: "border-box" }} data-testid="message-center">
          <h1>Message Center</h1>
          <p className="hint">The Message Center is available to Judicial Officers, Court Staff and registered (approved) Advocates and Litigants.</p>
          <div className="form-actions"><button className="btn btn-primary" onClick={() => navigate("/litigant")}>Login / Register</button></div>
        </div>
      </div>
    );
  }

  const listDate = (m) => fmtWhen(folder === "drafts" ? m.updated_at : m.sent_at);
  const counterpart = (m) => (folder === "inbox" ? `${m.from?.name || ""}` : (m.to || []).map((p) => p.name).join(", ") || "(no recipient)");

  return (
    <div className="app-shell">
      <TopBar title="Message Center" />
      <div className="page" style={{ width: "95%", maxWidth: 1400, boxSizing: "border-box" }} data-testid="message-center">
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "0 0 200px", display: "flex", flexDirection: "column", gap: 8, minWidth: 180 }}>
            <button className="btn btn-primary" onClick={() => { setCurrent(null); setMode("compose"); setNote(""); }} data-testid="msg-compose">✎ Compose</button>
            {FOLDERS.map((f) => (
              <button key={f.value} className={`btn ${folder === f.value && mode !== "compose" ? "btn-primary" : "btn-outline"}`} style={{ textAlign: "left", display: "flex", justifyContent: "space-between" }} onClick={() => goFolder(f.value)} data-testid={`msg-folder-${f.value}`}>
                <span>{f.label}</span>
                {f.value === "inbox" && unread > 0 && <span style={{ background: "#dc2626", color: "#fff", borderRadius: 10, padding: "0 8px", fontSize: 13 }} data-testid="msg-unread">{unread}</span>}
              </button>
            ))}
            {me && (
              <div className="hint" style={{ marginTop: 10, lineHeight: 1.5 }}>
                Signed in as<br /><strong>{me.name}</strong><br />{me.designation}
              </div>
            )}
          </div>
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>
            {err && <p className="error">{err}</p>}
            {note && <p className="success">{note}</p>}
            {mode === "compose" ? (
              <Composer
                key={current?.id || "new"}
                me={me}
                draft={current}
                onDone={(f, text) => { setNote(text); setFolder(f); setMode("list"); setCurrent(null); loadFolder(f); refreshMe(); }}
                onCancel={(f) => { setMode("list"); setCurrent(null); if (f) { setFolder(f); loadFolder(f); } }}
              />
            ) : mode === "view" && current ? (
              <MessageView msg={current} onBack={() => { setMode("list"); setCurrent(null); }} />
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>{FOLDERS.find((f) => f.value === folder)?.label}</h2>
                {loading ? <p>Loading...</p> : items.length === 0 ? (
                  <p className="hint">{folder === "inbox" ? "No messages yet." : folder === "sent" ? "You have not sent any message yet." : "No drafts."}</p>
                ) : (
                  <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "#fff" }} data-testid="msg-list">
                    {items.map((m) => (
                      <div key={m.id} onClick={() => openItem(m)} style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", background: folder === "inbox" && !m.read ? "#eef2ff" : "#fff", fontWeight: folder === "inbox" && !m.read ? 700 : 400 }}
                        data-testid="msg-row">
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <span>{folder === "inbox" ? "" : "To: "}{counterpart(m)}{folder === "inbox" && m.from?.designation ? <span className="hint" style={{ fontWeight: 400 }}> · {m.from.designation}</span> : null}</span>
                          <span className="hint" style={{ fontWeight: 400, margin: 0 }}>{(m.attachments || []).length > 0 ? "📎 " : ""}{listDate(m)}</span>
                        </div>
                        <div style={{ wordBreak: "break-word" }}>{m.subject || "(no subject)"}</div>
                        <div className="hint" style={{ fontWeight: 400, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.snippet}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
