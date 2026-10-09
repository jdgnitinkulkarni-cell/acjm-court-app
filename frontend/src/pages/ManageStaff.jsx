import React, { useEffect, useState } from "react";
import { useSort, SortTh } from "../lib/sortable";
import api from "../lib/api";
import { TopBar } from "./AdminDashboard";

export default function ManageStaff() {
  const [users, setUsers] = useState([]);
  const [courts, setCourts] = useState([]);
  const srt = useSort(users, { court: (u) => (courts.find((c) => c.id === u.court_id)?.english?.court_name || "") });
  const [loginId, setLoginId] = useState("");
  const [pwd, setPwd] = useState("");
  const [courtId, setCourtId] = useState("");
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editCourtId, setEditCourtId] = useState("");
  const load = async () => {
    const [{ data: u }, { data: c }] = await Promise.all([
      api.get("/staff-users"),
      api.get("/courts"),
    ]);
    setUsers(u);
    setCourts(c);
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    setMsg("");
    if (!loginId || !pwd) { setMsg("Login ID and password are required"); return; }
    if (!courtId) { setMsg("Please assign a court to this staff user"); return; }
    try {
      await api.post("/staff-users", { login_id: loginId, password: pwd, court_id: courtId, name: name.trim(), designation: designation.trim() });
      setLoginId(""); setPwd(""); setCourtId(""); setName(""); setDesignation(""); setMsg("Staff user created and assigned to court.");
      load();
    } catch (e) { setMsg(e.response?.data?.detail || "Failed"); }
  };
  const startEdit = (u) => { setEditingId(u.id); setEditCourtId(u.court_id || ""); setEditName(u.name || ""); setEditDesignation(u.designation || ""); };
  const saveEdit = async () => {
    setMsg("");
    if (!editCourtId) { setMsg("Please choose a court."); return; }
    try {
      await api.put(`/staff-users/${editingId}`, { court_id: editCourtId, name: editName.trim(), designation: editDesignation.trim() });
      setEditingId(null); setEditCourtId(""); setMsg("Staff details updated.");
      load();
    } catch (e) { setMsg(e.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this user?")) return;
    await api.delete(`/staff-users/${id}`);
    load();
  };
  const courtName = (id) => {
    const c = courts.find(c => c.id === id);
    return c?.english?.court_name || "-";
  };
  return (
    <div className="app-shell">
      <TopBar title="Manage Staff Users" />
      <div className="page" data-testid="manage-staff-page">
        <h1>Staff User Management</h1>
        <p className="hint">Each staff user must be assigned to a Court from the existing Courts list. The assigned Court becomes the default Court visible to that staff after login.</p>
        <div className="form-grid">
          <label>Name of Staff</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. R. K. Patel" data-testid="new-staff-name" />
          <label>Designation</label>
          <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Bench Clerk / Senior Clerk" data-testid="new-staff-designation" />
          <label>Login ID</label>
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} data-testid="new-staff-id" />
          <label>Password</label>
          <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} data-testid="new-staff-pwd" />
          <label>Assign Court</label>
          <select value={courtId} onChange={(e) => setCourtId(e.target.value)} data-testid="new-staff-court">
            <option value="">-- select a court --</option>
            {courts.map(c => <option key={c.id} value={c.id}>{c.english?.court_name}</option>)}
          </select>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={create} data-testid="create-staff-btn">Create Staff User</button>
        </div>
        {msg && <p className="success">{msg}</p>}
        <table className="entries">
          <thead><tr><SortTh label="Name &amp; Designation" k="name" s={srt} /><SortTh label="Login ID" k="login_id" s={srt} /><SortTh label="Assigned Court" k="court" s={srt} /><SortTh label="Created" k="created_at" s={srt} /><th>Action</th></tr></thead>
          <tbody>
            {srt.sorted.map(u => (
              <tr key={u.id}>
                <td>
                  {editingId === u.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" data-testid={`edit-name-${u.id}`} />
                      <input value={editDesignation} onChange={(e) => setEditDesignation(e.target.value)} placeholder="Designation" data-testid={`edit-designation-${u.id}`} />
                    </div>
                  ) : (
                    <>{u.name || <span className="hint">(name not set)</span>}{u.designation ? <><br /><span className="hint">{u.designation}</span></> : null}</>
                  )}
                </td>
                <td>{u.login_id}</td>
                <td>
                  {editingId === u.id ? (
                    <select value={editCourtId} onChange={(e) => setEditCourtId(e.target.value)} data-testid={`edit-court-${u.id}`}>
                      <option value="">-- select --</option>
                      {courts.map(c => <option key={c.id} value={c.id}>{c.english?.court_name}</option>)}
                    </select>
                  ) : (
                    courtName(u.court_id)
                  )}
                </td>
                <td>{u.created_at?.slice(0,10)}</td>
                <td>
                  {editingId === u.id ? (
                    <>
                      <button className="btn btn-primary" style={{padding:"6px 10px"}} onClick={saveEdit} data-testid={`save-court-${u.id}`}>Save</button>{" "}
                      <button className="btn btn-secondary" style={{padding:"6px 10px"}} onClick={() => setEditingId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-outline" style={{padding:"6px 10px"}} onClick={() => startEdit(u)} data-testid={`edit-court-btn-${u.id}`}>Edit</button>{" "}
                      <button className="btn btn-danger" style={{padding:"6px 10px"}} onClick={() => del(u.id)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
