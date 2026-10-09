import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { TopBar } from "./AdminDashboard";

const COURT_KEY = "selected_court_id";
const COURT_OBJ_KEY = "selected_court";

export const getSelectedCourt = () => {
  try { return JSON.parse(localStorage.getItem(COURT_OBJ_KEY) || "null"); } catch { return null; }
};

export const getSelectedCourtId = () => localStorage.getItem(COURT_KEY) || "";

export const setSelectedCourt = (court) => {
  if (!court) {
    localStorage.removeItem(COURT_KEY);
    localStorage.removeItem(COURT_OBJ_KEY);
    return;
  }
  localStorage.setItem(COURT_KEY, court.id);
  localStorage.setItem(COURT_OBJ_KEY, JSON.stringify(court));
};

export default function SelectCourt() {
  const navigate = useNavigate();
  const [courts, setCourts] = useState([]);
  const [sel, setSel] = useState(getSelectedCourtId());

  useEffect(() => { api.get("/courts").then(({data}) => setCourts(data)); }, []);

  const proceed = () => {
    const court = courts.find((c) => c.id === sel);
    if (!court) return;
    setSelectedCourt(court);
    navigate("/advocate/menu");
  };

  return (
    <div className="app-shell">
      <TopBar title={`${(() => { try { const u = JSON.parse(localStorage.getItem("user") || "null"); return u?.role === "advocate" ? "Advocate" : u?.role === "litigant" ? "Litigant" : u ? "Advocate / Accused" : "Litigant"; } catch (e) { return "Advocate / Accused"; } })()} - Select Court`} />
      <div className="page" data-testid="select-court-page">
        <h1>Select the Court</h1>
        <p className="hint">Please select the Court before which the matter is pending. All details you submit will be associated with this Court and will be visible only to the staff of this Court.</p>
        <select value={sel} onChange={e => setSel(e.target.value)} data-testid="advocate-court-select" style={{padding:10, width:"100%", border:"1px solid var(--border)", borderRadius:4, fontFamily:"inherit"}}>
          <option value="">-- select a court --</option>
          {courts.map(c => (
            <option key={c.id} value={c.id}>{c.english?.court_name}</option>
          ))}
        </select>
        <div className="form-actions">
          <button className="btn btn-advocate" onClick={proceed} disabled={!sel} data-testid="advocate-court-proceed">Proceed</button>
        </div>
      </div>
    </div>
  );
}
