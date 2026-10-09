import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { getUser } from "../lib/api";

// Left vertical menu for every signed-in screen + helpers shared by the
// dashboards (home path per role, display name, welcome panel).

export const ROLE_LABELS = { admin: "Administrator", judge: "Judicial Officer", staff: "Court Staff", advocate: "Advocate", litigant: "Litigant" };

const isGuest = () => { try { return localStorage.getItem("acjm_public_mode") === "litigant-guest"; } catch (e) { return false; } };
const selectedCourt = () => { try { return JSON.parse(localStorage.getItem("selected_court") || "null"); } catch (e) { return null; } };

// The page each user lands on after login.
export function homePathFor(user, pathname = "") {
  const role = user?.role;
  if (role === "judge") return "/judge-desk/dashboard";
  if (role === "admin") return "/admin";
  if (role === "staff") return user?.must_change ? "/staff/change" : "/staff";
  if (role === "advocate" || role === "litigant" || isGuest()) return selectedCourt() ? "/advocate/menu" : "/advocate";
  return "/";
}

export function displayNameFor(user) {
  if (!user) return isGuest() ? "Guest Litigant" : "";
  if (user.role === "admin") return "Administrator";
  if (user.role === "judge") {
    const c = (user.courts || [])[0];
    const n = (user.name || c?.english?.judge_name || user.login_id || "").trim();
    return n && !/^hon/i.test(n) ? `Hon'ble ${n}` : n;
  }
  return (user.name || "").trim() || user.login_id || "";
}

// "31st ACJM" -> "31st Addl. Chief Judicial Magistrate"
export function expandDesignation(text) {
  return String(text || "")
    .replace(/\bA\.?\s?C\.?\s?J\.?\s?M\.?(?=\s|,|$)/gi, "Addl. Chief Judicial Magistrate")
    .replace(/\bC\.?\s?J\.?\s?M\.?(?=\s|,|$)/gi, "Chief Judicial Magistrate")
    .replace(/\bJ\.?\s?M\.?\s?F\.?\s?C\.?(?=\s|,|$)/gi, "Judicial Magistrate First Class")
    .replace(/\s+/g, " ").trim();
}

export function judgeDesignation(user) {
  const c = (user?.courts || [])[0];
  return expandDesignation(user?.designation || c?.english?.judge_designation || "");
}

export function roleLabelFor(user) {
  if (user?.role === "staff" && user?.designation) return user.designation;
  if (user?.role === "judge") return judgeDesignation(user) || ROLE_LABELS.judge;
  return ROLE_LABELS[user?.role] || (isGuest() ? "Litigant (without login)" : "");
}

// Pages with a form or a typing area: the side menu starts collapsed there.
export function isFormPath(path) {
  return [
    /^\/judge-desk\/oral-evidence\/deposition(\/|$)/, /^\/judge-desk\/oral-evidence\/183-statement/,
    /^\/judge-desk\/order\/draft/, /^\/judge-desk\/order\/templates\/new/,
    /^\/advocate\/plea\//, /^\/advocate\/primary-fs\//, /^\/advocate\/final-fs\//, /^\/advocate\/[^/]+\/(form|lang)/,
    /^\/advocate\/live\/./, /^\/staff\/draft-final-fs/, /^\/staff\/change/, /^\/advocate\/(login|register)/, /^\/litigant\/(login|register)/,
  ].some((re) => re.test(path || ""));
}

// The signed-in user's photograph (cached; refreshed when it changes).
let photoCache = { uid: null, url: null, loading: null };
export function notifyPhotoChanged() {
  if (photoCache.url) URL.revokeObjectURL(photoCache.url);
  photoCache = { uid: null, url: null, loading: null };
  window.dispatchEvent(new Event("acjm-photo-changed"));
}
export function useMyPhoto() {
  const user = getUser();
  const uid = user?.id || null;
  const [url, setUrl] = useState(photoCache.uid === uid ? photoCache.url : null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (!uid) { setUrl(null); return; }
      if (photoCache.uid === uid && !photoCache.loading) { setUrl(photoCache.url); return; }
      if (!photoCache.loading || photoCache.uid !== uid) {
        photoCache = { uid, url: null, loading: api.get("/profile/photo", { responseType: "blob" })
          .then((r) => { photoCache.url = URL.createObjectURL(r.data); })
          .catch(() => { photoCache.url = null; })
          .finally(() => { photoCache.loading = null; }) };
      }
      photoCache.loading && photoCache.loading.then(() => { if (alive) setUrl(photoCache.url); });
    };
    load();
    window.addEventListener("acjm-photo-changed", load);
    return () => { alive = false; window.removeEventListener("acjm-photo-changed", load); };
  }, [uid]);
  return url;
}

export function Avatar({ name, size = 36, className = "avatar" }) {
  const url = useMyPhoto();
  if (url) return <img src={url} alt="" className={`${className} avatar-photo`} style={{ width: size, height: size }} />;
  return <span className={className} style={{ width: size, height: size }}>{(name || "?").replace(/^Hon'ble\s+/i, "").charAt(0).toUpperCase()}</span>;
}

function todayLabel() {
  try { return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; }
}

function navFor(user) {
  const role = user?.role;
  const court = selectedCourt();
  const needCourt = (to) => (court ? to : "/advocate");
  if (role === "judge") {
    return [
      { key: "home", label: "Dashboard", icon: "⌂", to: "/judge-desk/dashboard" },
      { group: "Oral Evidence", icon: "🎙", to: "/judge-desk/oral-evidence", items: [
        { label: "Deposition", to: "/judge-desk/oral-evidence/deposition", match: ["/judge-desk/oral-evidence/deposition"] },
        { label: "BNSS, 183 Statement", to: "/judge-desk/oral-evidence/183-statement" },
        { label: "View Entries", to: "/judge-desk/oral-evidence/entries" },
      ] },
      { group: "Order", icon: "📜", to: "/judge-desk/order", items: [
        { label: "Draft Order", to: "/judge-desk/order/draft", before: () => { try { sessionStorage.removeItem("acjm_order_wizard_v1"); } catch (e) { /* ignore */ } } },
        { label: "Templates", to: "/judge-desk/order/templates" },
        { label: "View Entries", to: "/judge-desk/order/entries" },
      ] },
      { group: "Signature", icon: "✍", to: "/judge-desk/for-signature", items: [
        { label: "For Signature", to: "/judge-desk/for-signature", badge: "forsign" },
        { label: "Signed Documents", to: "/signed-documents" },
      ] },
      { label: "Message Center", icon: "✉", to: "/message-center", badge: "unread" },
      { label: "Limitation Calculator", icon: "📅", href: "/limitation-calculator.html?role=judge" },
    ];
  }
  if (role === "staff") {
    return [
      { label: "Dashboard", icon: "⌂", to: "/staff", exact: true },
      { label: "View Entries", icon: "☰", href: "/staff-entry-menu.html" },
      { label: "Draft Final FS", icon: "✎", to: "/staff/draft-final-fs" },
      { label: "Demands from Court", icon: "🔔", to: "/staff/demands", badge: "demands" },
      { label: "Documents Submitted", icon: "📥", to: "/court/submitted-documents", badge: "submitted" },
      { label: "Message Center", icon: "✉", to: "/message-center", badge: "unread" },
      { label: "Litigant Registrations", icon: "👥", to: "/staff/registrations" },
      { label: "Conviction Warrant", icon: "⚖", href: "/staff-warrant.html" },
      { label: "Limitation Calculator", icon: "📅", href: "/limitation-calculator.html?role=staff" },
      { label: "Upload Cases", icon: "⇪", to: "/staff#upload", hash: "#upload" },
      { label: "Change ID & Password", icon: "🔑", to: "/staff/change" },
    ];
  }
  if (role === "admin") {
    return [
      { label: "Dashboard", icon: "⌂", to: "/admin", exact: true },
      { label: "Court Details", icon: "🏛", to: "/admin/courts" },
      { label: "Staff Users", icon: "👤", to: "/admin/staff-users" },
      { label: "Judge Users", icon: "⚖", to: "/admin/judge-users" },
      { label: "Advocate / Litigant Registrations", icon: "👥", to: "/admin/registrations" },
      { label: "Application Law Details", icon: "📘", href: "/admin-laws.html" },
      { label: "Calendar Modification", icon: "📅", href: "/limitation-calculator.html?role=admin" },
      { label: "Upload Excel (Final FS)", icon: "⇪", to: "/admin#upload", hash: "#upload" },
    ];
  }
  if (role === "advocate" || role === "litigant" || isGuest()) {
    const items = [
      { label: "Home", icon: "⌂", to: court ? "/advocate/menu" : "/advocate", match: ["/advocate/menu"], exact: true },
      { label: court ? "Change Court" : "Select Court", icon: "🏛", to: "/advocate", exact: true },
      { label: "Plea", icon: "✎", to: needCourt("/advocate/plea/lang"), match: ["/advocate/plea"] },
      { label: "Primary FS / FS on 1st Appearance", icon: "📄", to: needCourt("/advocate/primary-fs") },
      { label: "Final FS", icon: "📄", to: needCourt("/advocate/final-fs") },
      { label: "Application", icon: "📝", href: court ? "/doc-generator.html?kind=application" : null, to: court ? null : "/advocate" },
      { label: "Pursis", icon: "📝", href: court ? "/doc-generator.html?kind=pursis" : null, to: court ? null : "/advocate" },
      { label: "Surety / Bond", icon: "📝", href: court ? "/doc-generator.html?kind=surety" : null, to: court ? null : "/advocate" },
      { label: "Limitation Calculator", icon: "📅", href: "/limitation-calculator.html?role=advocate" },
    ];
    if (role === "advocate") items.push({ label: "Live Deposition", icon: "●", to: "/advocate/live", live: true });
    if (role === "advocate" || role === "litigant") items.push({ label: "My Entries", icon: "🗂", to: "/advocate/my-entries" });
    if (role === "advocate" || role === "litigant") items.push({ label: "Message Center", icon: "✉", to: "/message-center", badge: "unread" });
    return items;
  }
  return [];
}

function useBadges(user) {
  const [badges, setBadges] = useState({});
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    const load = () => {
      if (["judge", "staff", "advocate", "litigant"].includes(user.role)) {
        api.get("/messages/me").then(({ data }) => { if (alive) setBadges((b) => ({ ...b, unread: data?.unread || 0 })); }).catch(() => {});
      }
      if (user.role === "staff") {
        api.get("/demands/pending-count").then(({ data }) => { if (alive) setBadges((b) => ({ ...b, demands: data?.pending || 0 })); }).catch(() => {});
        api.get("/submitted-documents/count").then(({ data }) => { if (alive) setBadges((b) => ({ ...b, submitted: data?.new || 0 })); }).catch(() => {});
      }
      if (user.role === "judge") {
        api.get("/signature-desk/count").then(({ data }) => { if (alive) setBadges((b) => ({ ...b, forsign: data?.pending || 0 })); }).catch(() => {});
      }
    };
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [user?.id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  return badges;
}

export function sideNavVisible(user, pathname) {
  if (user && ["judge", "staff", "admin", "advocate", "litigant"].includes(user.role)) return true;
  if (!user && isGuest() && pathname.startsWith("/advocate") && !/^\/advocate\/(login|register)/.test(pathname)) return true;
  return false;
}

export function SideNav({ collapsed, onToggle }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  // The Judicial Officer has "Signed Documents" inside the Signature group; everyone else as its own item.
  const signedItem = user?.role === "judge" ? [] : [{ label: "Signed Documents", icon: "✍", to: "/signed-documents" }];
  const items = user ? [...navFor(user), ...signedItem, { label: "My Profile", icon: "👤", to: "/profile" }] : navFor(user);
  const badges = useBadges(user);
  const path = location.pathname;
  const name = displayNameFor(user);
  const home = homePathFor(user, path);

  const isActive = (it) => {
    if (it.hash) return path === it.to.split("#")[0] && location.hash === it.hash;
    const targets = [it.to, ...(it.match || [])].filter(Boolean);
    return targets.some((t) => (it.exact || t === "/advocate" ? path === t && !location.hash : path === t || path.startsWith(`${t}/`)));
  };
  const go = (it) => {
    if (it.before) it.before();
    if (it.href) { window.location.href = it.href; return; }
    if (it.to) navigate(it.to);
  };

  const renderItem = (it, sub = false) => {
    const active = isActive(it);
    const count = it.badge ? badges[it.badge] : 0;
    return (
      <button key={`${it.label}-${it.to || it.href}`} type="button" className={`side-item${sub ? " sub" : ""}${active ? " active" : ""}${it.live ? " live" : ""}`}
        onClick={() => go(it)} title={it.label} data-testid={`nav-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
        {!sub && <span className="side-icon" aria-hidden="true">{it.icon}</span>}
        <span className="side-label">{it.label}</span>
        {count > 0 && <span className="side-badge">{count}</span>}
      </button>
    );
  };

  return (
    <aside className={`side-nav${collapsed ? " collapsed" : ""}`} data-testid="side-nav">
      <div className="side-brand">
        <button type="button" className="side-brand-link" onClick={() => navigate(home)} title="Home">
          <img src="/nyayadwar-logo.svg" alt="NyayDwar" className="brand-logo" />
          <span className="side-brand-text"><strong>NyayDwar</strong><small>न्यायद्वार · Ahmedabad City</small></span>
        </button>
        <button type="button" className="side-toggle" onClick={onToggle} title={collapsed ? "Expand menu" : "Collapse menu"} data-testid="side-toggle">{collapsed ? "»" : "«"}</button>
      </div>
      <nav className="side-menu">
        {items.map((it) => (it.group ? (
          <div key={it.group} className={`side-group${path.startsWith(it.to) || it.items.some(isActive) ? " open" : ""}`}>
            <button type="button" className={`side-item${path === it.to ? " active" : ""}`} onClick={() => navigate(it.to)} title={it.group} data-testid={`nav-${it.group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
              <span className="side-icon" aria-hidden="true">{it.icon}</span>
              <span className="side-label">{it.group}</span>
              {(() => { const n = it.items.reduce((t, s) => t + (s.badge ? badges[s.badge] || 0 : 0), 0); return n > 0 ? <span className="side-badge">{n}</span> : null; })()}
            </button>
            <div className="side-sub">{it.items.map((s) => renderItem(s, true))}</div>
          </div>
        ) : renderItem(it)))}
      </nav>
      {name && (
        <div className="side-user" title={`${name} — ${roleLabelFor(user)}`} onClick={() => user && navigate("/profile")} style={{ cursor: user ? "pointer" : "default" }}>
          <Avatar name={name} />
          <span className="side-user-text"><strong>{name}</strong><small>{roleLabelFor(user)}</small></span>
        </div>
      )}
    </aside>
  );
}

// Greeting at the top of each home screen.
export function WelcomePanel({ subtitle, children }) {
  const navigate = useNavigate();
  const user = getUser();
  const name = displayNameFor(user);
  const desig = user?.role === "judge" ? judgeDesignation(user) : "";
  return (
    <div className="welcome-panel" data-testid="welcome-panel">
      <div className="welcome-head">
        {user && (
          <div className="welcome-photo" onClick={() => navigate("/profile")} title="My Profile — change photograph">
            <Avatar name={name} size={88} className="avatar big" />
          </div>
        )}
        <div>
          <p className="eyebrow">{todayLabel()}</p>
          <h1>{user?.role === "judge" ? `Welcome ${name}${desig ? "," : ""}` : `Welcome${name ? `, ${name}` : ""}`}</h1>
          {desig && <p className="welcome-desig" data-testid="welcome-designation">{desig}</p>}
        </div>
      </div>
      {subtitle && <p className="welcome-sub">{subtitle}</p>}
      {children}
    </div>
  );
}

// Small summary card on the home screens.
export function StatCard({ label, value, note, onClick, tone = "green", testid }) {
  return (
    <div className={`stat-card tone-${tone}${onClick ? " clickable" : ""}`} onClick={onClick} data-testid={testid}>
      <small>{label}</small>
      <b>{value === null || value === undefined ? "—" : value}</b>
      {note && <span>{note}</span>}
    </div>
  );
}
