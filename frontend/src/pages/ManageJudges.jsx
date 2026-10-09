import React, { useEffect, useState } from "react";
import { useSort, SortTh } from "../lib/sortable";
import api from "../lib/api";
import { TopBar } from "./AdminDashboard";

function CourtMultiSelect({ courts, selected, onChange, idPrefix }) {
  const handleChange = (e) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    onChange(values);
  };
  return (
    <div>
      <select
        multiple
        value={selected}
        onChange={handleChange}
        size={Math.min(Math.max(courts.length, 3), 6)}
        style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "inherit", fontSize: 15 }}
        data-testid={`${idPrefix}-court-select`}
      >
        {courts.map((c) => (
          <option key={c.id} value={c.id}>{c.english?.court_name}</option>
        ))}
      </select>
      <span className="hint" style={{ display: "block", marginTop: 4 }}>
        Hold Ctrl (or Cmd on Mac) and click to select more than one Court.
      </span>
      {courts.length === 0 && <span className="hint">No courts created yet. Add one under Court Details first.</span>}
    </div>
  );
}

export default function ManageJudges() {
  const [judges, setJudges] = useState([]);
  const [courts, setCourts] = useState([]);
  const srt = useSort(judges, { courts: (j) => (j.court_ids || []).map((id) => courts.find((c) => c.id === id)?.english?.court_name || "").join(", ") });
  const [loginId, setLoginId] = useState("");
  const [pwd, setPwd] = useState("");
  const [courtIds, setCourtIds] = useState([]);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editCourtIds, setEditCourtIds] = useState([]);
  const [editPwd, setEditPwd] = useState("");

  const load = async () => {
    const [{ data: j }, { data: c }] = await Promise.all([
      api.get("/judge-users"),
      api.get("/courts"),
    ]);
    setJudges(j);
    setCourts(c);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setMsg("");
    if (!loginId || !pwd) { setMsg("Login ID and password are required"); return; }
    if (courtIds.length === 0) { setMsg("Please assign at least one Court to this Judge user"); return; }
    try {
      await api.post("/judge-users", { login_id: loginId, password: pwd, court_ids: courtIds });
      setLoginId(""); setPwd(""); setCourtIds([]);
      setMsg("Judge user created. All staff users of the assigned Court(s) are now linked to this Judge.");
      load();
    } catch (e) { setMsg(e.response?.data?.detail || "Failed"); }
  };

  const startEdit = (j) => { setEditingId(j.id); setEditCourtIds(j.court_ids || []); setEditPwd(""); };
  const saveEdit = async () => {
    setMsg("");
    if (editCourtIds.length === 0) { setMsg("Please assign at least one Court."); return; }
    try {
      const body = { court_ids: editCourtIds };
      if (editPwd) body.password = editPwd;
      await api.put(`/judge-users/${editingId}`, body);
      setEditingId(null); setEditCourtIds([]); setEditPwd("");
      setMsg("Judge user updated.");
      load();
    } catch (e) { setMsg(e.response?.data?.detail || "Failed"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this Judge user?")) return;
    await api.delete(`/judge-users/${id}`);
    load();
  };

  const courtNames = (ids) => {
    if (!ids || ids.length === 0) return "-";
    return ids.map((id) => courts.find((c) => c.id === id)?.english?.court_name || "?").join(", ");
  };

  return (
    <div className="app-shell">
      <TopBar title="Manage Judge Users" />
      <div className="page" data-testid="manage-judges-page">
        <h1>Judge User Management</h1>
        <p className="hint">
          Assign one or more Courts (from Court Details) to a Judge user. Every Staff user already
          assigned to those Courts is automatically treated as under this Judge for the Oral
          Evidence, Order and Message Center features — no separate staff assignment is needed here.
        </p>
        <p className="hint" style={{ color: "#7c3aed" }}>
          <strong>Security note:</strong> Judge users sign in from a separate, unlisted address, not
          the shared Advocate/Staff link. Share that address with judges directly rather than posting it publicly.
        </p>
        <div className="form-grid">
          <label>Login ID</label>
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} data-testid="new-judge-id" />
          <label>Password</label>
          <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} data-testid="new-judge-pwd" />
          <label>Assign Court(s)</label>
          <CourtMultiSelect courts={courts} selected={courtIds} onChange={setCourtIds} idPrefix="new-judge" />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={create} data-testid="create-judge-btn">Create Judge User</button>
        </div>
        {msg && <p className="success">{msg}</p>}

        <table className="entries" style={{ marginTop: 24 }}>
          <thead><tr><SortTh label="Login ID" k="login_id" s={srt} /><SortTh label="Assigned Court(s)" k="courts" s={srt} /><SortTh label="Created" k="created_at" s={srt} /><th>Action</th></tr></thead>
          <tbody>
            {srt.sorted.map((j) => (
              <tr key={j.id}>
                <td>{j.login_id}</td>
                <td style={{ minWidth: 260 }}>
                  {editingId === j.id ? (
                    <>
                      <CourtMultiSelect courts={courts} selected={editCourtIds} onChange={setEditCourtIds} idPrefix={`edit-judge-${j.id}`} />
                      <div style={{ marginTop: 8 }}>
                        <label style={{ fontSize: 13 }}>New password (optional)</label>
                        <input
                          type="password"
                          placeholder="Leave blank to keep unchanged"
                          value={editPwd}
                          onChange={(e) => setEditPwd(e.target.value)}
                          data-testid={`edit-judge-pwd-${j.id}`}
                        />
                      </div>
                    </>
                  ) : (
                    courtNames(j.court_ids)
                  )}
                </td>
                <td>{j.created_at?.slice(0, 10)}</td>
                <td>
                  {editingId === j.id ? (
                    <>
                      <button className="btn btn-primary" style={{ padding: "6px 10px" }} onClick={saveEdit} data-testid={`save-judge-${j.id}`}>Save</button>{" "}
                      <button className="btn btn-secondary" style={{ padding: "6px 10px" }} onClick={() => setEditingId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-outline" style={{ padding: "6px 10px" }} onClick={() => startEdit(j)} data-testid={`edit-judge-btn-${j.id}`}>Edit</button>{" "}
                      <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => del(j.id)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {judges.length === 0 && <tr><td colSpan="4" style={{ textAlign: "center", color: "#6b7280" }}>No Judge users yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
