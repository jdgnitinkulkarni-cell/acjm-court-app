import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { setAuth, getUser, clearAuth } from "../lib/api";
import { homePathFor, displayNameFor } from "./SideNav";

// Home page after login, decided by the role the server returns.
function landingFor(user) {
  if (!user) return "/";
  if (user.role === "judge") return user.must_change ? "/staff/change" : "/judge-desk/dashboard";
  if (user.role === "staff") return user.must_change ? "/staff/change" : "/staff";
  if (user.role === "admin") return "/admin";
  return "/advocate";
}

function BrandPanel({ courtName }) {
  return (
    <section className="brand-panel">
      <img src="/nyayadwar-logo.svg" alt="NyayDwar logo" className="brand-logo landing-logo" />
      <p className="eyebrow">Court Services Portal · Ahmedabad City</p>
      <h1 className="landing-name">NyayDwar</h1>
      <p className="landing-dev">न्यायद्वार — one gateway for the Court, Staff, Advocates and Litigants</p>
      <p className="subtle landing-sub">Plea, Primary FS &amp; Final FS — Sec. 138 NI Act / Sec. 25 PSS Act</p>
      <div className="court-name landing-title" data-testid="landing-court-title">SARAS N. I. Courts, CJM Courts, Ahmedabad City</div>
      <div className="local-badge"><span></span> Running on the court's own computer</div>
      <div className="credit-line" data-testid="credit-line">
        Developed by N. A. Kulkarni, ACJM, Ahmedabad City
      </div>
    </section>
  );
}

function useCourtName() {
  const [courtName, setCourtName] = useState("");
  useEffect(() => {
    api.get("/courts/default").then(({ data }) => {
      const name = data?.english?.court_name?.trim();
      if (name) setCourtName(name);
    }).catch(() => {});
  }, []);
  return courtName;
}

export default function Landing() {
  const navigate = useNavigate();
  const courtName = useCourtName();
  const existingUser = getUser();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice] = useState(() => { try { const m = sessionStorage.getItem("acjm_relogin_msg"); sessionStorage.removeItem("acjm_relogin_msg"); return m || ""; } catch (e) { return ""; } });

  const signIn = async (e) => {
    e?.preventDefault();
    setErr("");
    if (!login.trim() || !password) { setErr("Please enter your User ID and password."); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { login: login.trim(), password });
      setAuth(data.token, data.user);
      try { localStorage.removeItem("acjm_public_mode"); } catch (x) { /* ignore */ }
      navigate(landingFor(data.user));
    } catch (e2) {
      setErr(e2.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="landing landing-split app-shell" data-testid="landing-page">
      <BrandPanel courtName={courtName} />
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Welcome</p>
          <h2>Sign in</h2>
          {existingUser && (
            <div className="signed-in-box" data-testid="signed-in-box">
              <span>Signed in as <strong>{displayNameFor(existingUser)}</strong></span>
              <div className="login-foot">
                <button className="btn btn-primary" onClick={() => navigate(homePathFor(existingUser))} data-testid="landing-continue-btn">Continue</button>
                <button className="btn btn-secondary" data-testid="landing-logout-btn" onClick={() => { clearAuth(); window.location.reload(); }}>Logout</button>
              </div>
            </div>
          )}
          {notice && <div className="signed-in-box" data-testid="relogin-notice">{notice}</div>}
          <form onSubmit={signIn} className="login-form" data-testid="login-form">
            <label>User ID
              <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="Login ID, mobile number or email" data-testid="login-id" />
            </label>
            <label>Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="login-password" />
            </label>
            {err && <div className="error" data-testid="login-error">{err}</div>}
            <button className="btn btn-primary wide" type="submit" disabled={loading} data-testid="login-submit">{loading ? "Signing in..." : "Sign in"}</button>
          </form>
          <p className="register-line">
            New advocate or litigant? <button type="button" className="link-btn" onClick={() => navigate("/register")} data-testid="register-link">Register here</button>
          </p>
        </div>
      </section>
    </div>
  );
}

// Registration choice — only Advocates and Litigants register themselves.
export function RegisterChoice() {
  const navigate = useNavigate();
  const courtName = useCourtName();
  const guest = () => {
    try { localStorage.setItem("acjm_public_mode", "litigant-guest"); } catch (e) { /* ignore */ }
    navigate("/advocate");
  };
  return (
    <div className="landing landing-split app-shell" data-testid="register-page">
      <BrandPanel courtName={courtName} />
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">New user</p>
          <h2>Register</h2>
          <p className="hint" style={{ textAlign: "left", marginTop: -12 }}>Judge and Staff accounts are created by the Administrator. Advocates and Litigants register here.</p>
          <div className="role-list">
            <button className="role-card advocate" onClick={() => navigate("/advocate/register")} data-testid="register-advocate">
              <span className="role-icon">⚖</span>
              <span><strong>Advocate</strong><small>Approved by the Administrator</small></span>
              <span className="role-go">→</span>
            </button>
            <button className="role-card litigant" onClick={() => navigate("/litigant/register")} data-testid="register-litigant">
              <span className="role-icon">👤</span>
              <span><strong>Litigant</strong><small>Approved by the staff of your court</small></span>
              <span className="role-go">→</span>
            </button>
          </div>
          <div className="login-divider">or</div>
          <button className="btn btn-secondary wide" onClick={guest} data-testid="litigant-guest">Litigant — use the services without registering</button>
          <p className="register-line">
            Already registered? <button type="button" className="link-btn" onClick={() => navigate("/")} data-testid="back-to-login">Sign in</button>
          </p>
        </div>
      </section>
    </div>
  );
}
