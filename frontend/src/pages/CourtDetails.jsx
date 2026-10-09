import React, { useEffect, useState } from "react";
import { useSort, SortTh } from "../lib/sortable";
import api from "../lib/api";
import { TopBar } from "./AdminDashboard";

const blank = { court_name: "", place: "", judge_name: "", judge_designation: "" };

export default function CourtDetails() {
  const [courts, setCourts] = useState([]);
  const srt = useSort(courts, { en: (c) => c.english?.court_name, gu: (c) => c.gujarati?.court_name, def: (c) => (c.is_default ? 0 : 1) });
  const [editId, setEditId] = useState(null);
  const [english, setEnglish] = useState({ ...blank });
  const [gujarati, setGujarati] = useState({ ...blank });
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data } = await api.get("/courts");
    setCourts(data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setMsg("");
    try {
      if (editId) {
        await api.put(`/courts/${editId}`, { english, gujarati });
        setMsg("Court details updated successfully.");
      } else {
        await api.post("/courts", { english, gujarati });
        setMsg("Details submitted successfully.");
      }
      setEditId(null); setEnglish({...blank}); setGujarati({...blank});
      load();
    } catch (e) { setMsg(e.response?.data?.detail || "Failed"); }
  };

  const editCourt = (c) => {
    setEditId(c.id); setEnglish(c.english); setGujarati(c.gujarati);
    window.scrollTo({top:0, behavior:"smooth"});
  };
  const setDefault = async (id) => {
    await api.post(`/courts/${id}/set-default`);
    load();
  };
  const deleteCourt = async (c) => {
    if (!window.confirm(`Delete "${c.english?.court_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/courts/${c.id}`);
      load();
    } catch (e) {
      const detail = e.response?.data?.detail || "Failed to delete";
      if (detail.includes("still linked to")) {
        if (window.confirm(detail + "\n\nForce-delete anyway? Staff/Judge users linked to this Court will be unassigned (their other data stays intact).")) {
          try {
            await api.delete(`/courts/${c.id}?force=true`);
            load();
          } catch (e2) {
            alert(e2.response?.data?.detail || "Failed to delete");
          }
        }
      } else {
        alert(detail);
      }
    }
  };

  return (
    <div className="app-shell">
      <TopBar title="Court Details" />
      <div className="page" data-testid="court-details-page">
        <h1>Enter Court Details</h1>
        <div className="section-title">English Detail Entry Section (Enter all details in English Only)</div>
        <div className="form-grid">
          <label>Court Name with Place</label>
          <input value={english.court_name} onChange={(e) => setEnglish({ ...english, court_name: e.target.value })} data-testid="court-court_name" />
          <label>Place of Court</label>
          <input value={english.place} onChange={(e) => setEnglish({ ...english, place: e.target.value })} data-testid="court-place" />
          <label>Name of Hon'ble Judicial Officer</label>
          <input value={english.judge_name} onChange={(e) => setEnglish({ ...english, judge_name: e.target.value })} data-testid="court-judge_name" />
          <label>Designation of Hon'ble Judicial Officer</label>
          <input value={english.judge_designation} onChange={(e) => setEnglish({ ...english, judge_designation: e.target.value })} data-testid="court-judge_designation" />
        </div>
        <div className="section-title">ગુજરાતી Detail Entry Section (Enter all details in ગુજરાતી Only)</div>
        <div className="form-grid">
          <label>કોર્ટ નું નામ જગ્યા સાથે</label>
          <input value={gujarati.court_name} onChange={(e) => setGujarati({...gujarati, court_name: e.target.value})} data-testid="court-gu-name" />
          <label>જગ્યા નું નામ</label>
          <input value={gujarati.place} onChange={(e) => setGujarati({...gujarati, place: e.target.value})} data-testid="court-gu-place" />
          <label>મહે. જજ શ્રી નું નામ</label>
          <input value={gujarati.judge_name} onChange={(e) => setGujarati({...gujarati, judge_name: e.target.value})} data-testid="court-gu-judge" />
          <label>મહે. જજ શ્રી નો હોદ્દો</label>
          <input value={gujarati.judge_designation} onChange={(e) => setGujarati({...gujarati, judge_designation: e.target.value})} data-testid="court-gu-designation" />
        </div>
        <div className="form-actions">
          <button className="btn btn-blue" onClick={submit} data-testid="court-submit-btn">{editId ? "Update" : "Submit"}</button>
          {editId && <button className="btn btn-secondary" onClick={() => { setEditId(null); setEnglish({...blank}); setGujarati({...blank}); }}>Cancel Edit</button>}
        </div>
        {msg && <p className="success">{msg}</p>}

        <h2 style={{marginTop:32}}>Existing Courts</h2>
        <table className="entries">
          <thead><tr><SortTh label="Court (English)" k="en" s={srt} /><SortTh label="Court (Gujarati)" k="gu" s={srt} /><SortTh label="Default" k="def" s={srt} /><th>Actions</th></tr></thead>
          <tbody>
            {srt.sorted.map(c => (
              <tr key={c.id}>
                <td>{c.english?.court_name}</td>
                <td>{c.gujarati?.court_name}</td>
                <td>{c.is_default ? "✓" : ""}</td>
                <td>
                  <button className="btn btn-outline" style={{padding:"6px 10px"}} onClick={() => editCourt(c)}>Edit</button>{" "}
                  {!c.is_default && <button className="btn btn-secondary" style={{padding:"6px 10px"}} onClick={() => setDefault(c.id)}>Set Default</button>}{" "}
                  <button className="btn btn-danger" style={{padding:"6px 10px"}} onClick={() => deleteCourt(c)} data-testid={`delete-court-${c.id}`}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
