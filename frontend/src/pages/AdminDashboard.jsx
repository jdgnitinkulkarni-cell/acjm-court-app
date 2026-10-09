import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import api, { clearAuth, getUser } from "../lib/api";
import { SideNav, sideNavVisible, homePathFor, roleLabelFor, WelcomePanel, StatCard, isFormPath } from "./SideNav";

export function TopBar({ title, onBack }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();

  // Don't show Back on the role dashboards / landing — there's nowhere meaningful to go back to.
  // Also hidden on the Deposition typing page specifically: that page has its
  // own Back button (bottom bar) that deliberately goes to Edit Witness
  // Details. This generic button uses plain browser-history navigate(-1),
  // which doesn't understand the Deposition wizard's internal steps (they
  // don't create separate history entries) and was landing back on the
  // case-selection screen instead — appearing to "lose" the witness details.
  const isRoot = ["/", "/admin", "/staff", "/advocate", "/judge-desk", "/judge-desk/dashboard"].includes(location.pathname)
    || /^\/judge-desk\/oral-evidence\/deposition\/type\//.test(location.pathname);
  // Home (and the brand seal) always goes to the page the user lands on
  // after login: Judge Desk dashboard, Admin dashboard, Staff dashboard, or
  // the Advocate / Litigant home.
  const homePath = homePathFor(user, location.pathname);
  const showSide = sideNavVisible(user, location.pathname);
  // The menu starts collapsed on forms and typing screens (more room to
  // work) and open everywhere else; the « / » button toggles it.
  const [collapsed, setCollapsed] = useState(() => isFormPath(location.pathname));
  const toggleSide = () => setCollapsed((c) => !c);
  useEffect(() => {
    const b = document.body.classList;
    b.toggle("has-side", showSide);
    b.toggle("side-collapsed", showSide && collapsed);
    return () => { b.remove("has-side"); b.remove("side-collapsed"); };
  }, [showSide, collapsed]);
  const goBack = () => {
    if (location.pathname === "/judge-desk/oral-evidence") {
      const destination = sessionStorage.getItem("oralEvidenceBackDestination") || "/judge-desk/dashboard";
      sessionStorage.removeItem("oralEvidenceBackDestination");
      navigate(destination, { replace: true });
      return;
    }
    if (onBack) {
      onBack();
      return;
    }
    navigate(-1);
  };

  const roleLabel = roleLabelFor(user) || (location.pathname.startsWith("/advocate") || location.pathname.startsWith("/litigant") ? "Advocate / Litigant services" : "");
  return (
    <>
      {showSide && <SideNav collapsed={collapsed} onToggle={toggleSide} />}
      <div className={`topbar${showSide ? " with-side" : ""}`}>
        <div className="row">
          {!showSide && (
            <Link to={homePath} className="tb-brand" title="Home">
              <img src="/nyayadwar-logo.svg" alt="NyayDwar" className="brand-logo" />
              <div><strong>NyayDwar</strong><small>न्यायद्वार · Ahmedabad City</small></div>
            </Link>
          )}
          {!isRoot && (
            <button
              className="btn btn-outline"
              style={{ padding: "8px 14px" }}
              onClick={goBack}
              data-testid="back-btn"
            >
              ← Back
            </button>
          )}
          <div style={{ marginLeft: isRoot ? 0 : 8 }}>
            {roleLabel && <p className="tb-eyebrow">{roleLabel}</p>}
            <h2>{title}</h2>
          </div>
        </div>
        <div className="row">
          <Link to={homePath} className="btn btn-outline" style={{ padding: "8px 14px" }} data-testid="home-btn">
            Home
          </Link>
          {user && (
            <button
              className="btn btn-secondary"
              style={{ padding: "8px 14px" }}
              onClick={() => { clearAuth(); try { localStorage.removeItem("acjm_public_mode"); } catch (e) { /* ignore */ } navigate("/"); }}
              data-testid="logout-btn"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function AdminStats() {
  const navigate = useNavigate();
  const [s, setS] = useState({});
  useEffect(() => {
    api.get("/courts").then(({ data }) => setS((x) => ({ ...x, courts: (data || []).length }))).catch(() => {});
    api.get("/staff-users").then(({ data }) => setS((x) => ({ ...x, staff: (data || []).length }))).catch(() => {});
    api.get("/judge-users").then(({ data }) => setS((x) => ({ ...x, judges: (data || []).length }))).catch(() => {});
    api.get("/registrations").then(({ data }) => setS((x) => ({ ...x, pending: (data || []).filter((r) => r.status === "pending").length }))).catch(() => {});
  }, []);
  return (
    <div className="stats-row">
      <StatCard label="Courts" value={s.courts} onClick={() => navigate("/admin/courts")} />
      <StatCard label="Staff users" value={s.staff} tone="gold" onClick={() => navigate("/admin/staff-users")} />
      <StatCard label="Judge users" value={s.judges} tone="plum" onClick={() => navigate("/admin/judge-users")} />
      <StatCard label="Registrations awaiting approval" value={s.pending} tone="rust" onClick={() => navigate("/admin/registrations")} />
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [excelInfo, setExcelInfo] = useState({});
  const [msg, setMsg] = useState("");
  const fetchInfo = async () => {
    const { data } = await api.get("/admin/excel/info");
    setExcelInfo(data || {});
  };
  useEffect(() => { fetchInfo(); }, []);
  useEffect(() => {
    if (window.location.hash === "#upload") setTimeout(() => document.getElementById("upload")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  });

  const onUpload = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try {
      await api.post("/admin/excel", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMsg(`Uploaded: ${f.name}`); fetchInfo();
    } catch (er) { setMsg("Upload failed"); }
  };

  return (
    <div className="app-shell">
      <TopBar title="Admin Dashboard" />
      <div className="page" data-testid="admin-dashboard">
        <WelcomePanel subtitle="Administration of courts, users, registrations and the Final FS models. Use the menu on the left." />
        <AdminStats />
        <div className="info-card" id="upload" data-testid="admin-upload-card">
          <div>
            <h3>Final FS models (Excel)</h3>
            <p className="hint" style={{ margin: 0 }}>{excelInfo?.filename ? <>Currently uploaded: <strong>{excelInfo.filename}</strong></> : "No Excel uploaded yet."}</p>
          </div>
          <button className="btn btn-primary" data-testid="tile-excel" onClick={() => document.getElementById("xlsx-input").click()}>Upload Excel (Final FS Models)</button>
        </div>
        <input id="xlsx-input" type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={onUpload} data-testid="excel-upload-input" />
        {msg && <p className="success">{msg}</p>}
      </div>
    </div>
  );
}
