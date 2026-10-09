/* Left side menu for the separate (non-React) pages of the ACJM Court App,
   matching the menu of the main application. Look & navigation only. */
(function () {
  "use strict";
  if (window.__acjmSideNav) return;
  window.__acjmSideNav = true;

  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  var user = readJSON("user");
  var guest = false;
  try { guest = localStorage.getItem("acjm_public_mode") === "litigant-guest"; } catch (e) { /* ignore */ }
  var role = user && user.role;
  if (!role && !guest) return;
  var court = readJSON("selected_court");
  var path = location.pathname;

  var FORM_PAGES = ["/doc-generator.html", "/limitation-calculator.html", "/staff-warrant.html"];
  var collapsed = FORM_PAGES.indexOf(path) >= 0;

  var CSS = [
    ":root{--acjm-side-w:256px;--acjm-side-wc:68px}",
    "body.acjm-side{padding-left:var(--acjm-side-w)!important;transition:padding-left .18s}",
    "body.acjm-side.acjm-side-c{padding-left:var(--acjm-side-wc)!important}",
    ".acjm-sn{position:fixed;left:0;top:0;bottom:0;width:var(--acjm-side-w);z-index:900;background:linear-gradient(180deg,#123a30,#173f35 45%,#1b4a3e);color:#fff;display:flex;flex-direction:column;padding:18px 12px 14px;box-shadow:4px 0 24px rgba(16,46,39,.18);font-family:'Segoe UI','Lohit Gujarati',Arial,sans-serif;box-sizing:border-box;transition:width .18s;overflow:hidden}",
    ".acjm-sn *{box-sizing:border-box}",
    ".acjm-side-c .acjm-sn{width:var(--acjm-side-wc);padding-left:10px;padding-right:10px}",
    ".acjm-sn-brand{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 4px 18px;border-bottom:1px solid rgba(255,255,255,.12)}",
    ".acjm-sn-home{display:flex;align-items:center;gap:11px;background:none;border:0;color:#fff;cursor:pointer;padding:0;text-align:left;font:inherit}",
    ".acjm-sn-logo{width:40px;height:40px;flex:0 0 auto;display:block}",
    ".acjm-sn-seal{display:grid;place-items:center;width:38px;height:38px;border:1px solid rgba(255,255,255,.45);border-radius:50%;font-family:Georgia,'Tiro Devanagari Hindi',serif;font-size:12px;flex:0 0 auto}",
    ".acjm-sn-bt strong,.acjm-sn-bt small{display:block;white-space:nowrap}.acjm-sn-bt strong{font-size:15px}.acjm-sn-bt small{font-size:11.5px;color:rgba(255,255,255,.58);margin-top:2px}",
    ".acjm-sn-tg{background:rgba(255,255,255,.08);border:0;color:rgba(255,255,255,.85);width:26px;height:26px;border-radius:6px;cursor:pointer;flex:0 0 auto}",
    ".acjm-sn-menu{flex:1;overflow-y:auto;overflow-x:hidden;margin-top:14px;display:flex;flex-direction:column;gap:3px}",
    ".acjm-sn-it{display:flex;align-items:center;gap:11px;width:100%;border:0;background:transparent;color:rgba(255,255,255,.8);padding:10px 12px;border-radius:9px;cursor:pointer;text-align:left;font:600 14.5px 'Segoe UI','Lohit Gujarati',Arial,sans-serif;text-decoration:none}",
    ".acjm-sn-it:hover{background:rgba(255,255,255,.09);color:#fff}.acjm-sn-it.on{background:rgba(255,255,255,.14);color:#fff;box-shadow:inset 3px 0 0 #c9a35e}",
    ".acjm-sn-it.sub{font-size:13.5px;font-weight:500;padding:8px 10px;margin-left:22px;width:calc(100% - 22px)}",
    ".acjm-sn-ic{width:22px;text-align:center;font-size:16px;flex:0 0 22px}.acjm-sn-lb{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".acjm-side-c .acjm-sn-bt,.acjm-side-c .acjm-sn-lb,.acjm-side-c .acjm-sn-it.sub,.acjm-side-c .acjm-sn-ut{display:none}",
    ".acjm-side-c .acjm-sn-brand{flex-direction:column;gap:10px;padding-left:0;padding-right:0}.acjm-side-c .acjm-sn-it{justify-content:center;padding:11px 0}",
    ".acjm-sn-user{display:flex;align-items:center;gap:10px;border-top:1px solid rgba(255,255,255,.12);padding:14px 4px 2px;margin-top:10px;cursor:pointer}",
    ".acjm-sn-av{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#c9a35e;color:#10302a;font-weight:800;flex:0 0 auto;object-fit:cover}",
    ".acjm-sn-ut strong,.acjm-sn-ut small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px}.acjm-sn-ut strong{font-size:13.5px}.acjm-sn-ut small{font-size:11.5px;color:rgba(255,255,255,.58)}",
    "@media (max-width:850px){body.acjm-side,body.acjm-side.acjm-side-c{padding-left:0!important}.acjm-sn,.acjm-side-c .acjm-sn{position:static;width:100%;padding:10px 12px}.acjm-sn-tg{display:none}.acjm-sn-menu{flex-direction:row;overflow-x:auto;margin-top:8px}.acjm-sn-it,.acjm-side-c .acjm-sn-it{width:auto;flex:0 0 auto;justify-content:flex-start;padding:8px 12px}.acjm-sn-it.sub{margin-left:0}.acjm-side-c .acjm-sn-lb,.acjm-side-c .acjm-sn-it.sub,.acjm-side-c .acjm-sn-bt{display:inline}.acjm-sn-user{display:none}}",
    "@media print{.acjm-sn{display:none!important}body.acjm-side,body.acjm-side.acjm-side-c{padding-left:0!important}}"
  ].join("\n");

  function homePath() {
    if (role === "judge") return "/judge-desk/dashboard";
    if (role === "admin") return "/admin";
    if (role === "staff") return user.must_change ? "/staff/change" : "/staff";
    return court ? "/advocate/menu" : "/advocate";
  }

  function items() {
    var need = function (to) { return court ? to : "/advocate"; };
    if (role === "judge") return [
      { l: "Dashboard", i: "⌂", to: "/judge-desk/dashboard" },
      { l: "Oral Evidence", i: "🎙", to: "/judge-desk/oral-evidence" },
      { l: "Deposition", sub: 1, to: "/judge-desk/oral-evidence/deposition" },
      { l: "BNSS, 183 Statement", sub: 1, to: "/judge-desk/oral-evidence/183-statement" },
      { l: "View Entries", sub: 1, to: "/judge-desk/oral-evidence/entries" },
      { l: "Order", i: "📜", to: "/judge-desk/order" },
      { l: "Draft Order", sub: 1, to: "/judge-desk/order/draft", clear: "acjm_order_wizard_v1" },
      { l: "Templates", sub: 1, to: "/judge-desk/order/templates" },
      { l: "View Entries", sub: 1, to: "/judge-desk/order/entries" },
      { l: "Signature", i: "✍", to: "/judge-desk/for-signature", page: "/judge-desk/for-signature" },
      { l: "For Signature", sub: 1, to: "/judge-desk/for-signature" },
      { l: "Signed Documents", sub: 1, to: "/signed-documents" },
      { l: "Message Center", i: "✉", to: "/message-center" },
      { l: "Limitation Calculator", i: "📅", to: "/limitation-calculator.html?role=judge", page: "/limitation-calculator.html" }
    ];
    if (role === "staff") return [
      { l: "Dashboard", i: "⌂", to: "/staff" },
      { l: "View Entries", i: "☰", to: "/staff-entry-menu.html", page: ["/staff-entry-menu.html", "/staff-documents.html"] },
      { l: "Draft Final FS", i: "✎", to: "/staff/draft-final-fs" },
      { l: "Demands from Court", i: "🔔", to: "/staff/demands" },
      { l: "Documents Submitted", i: "📥", to: "/court/submitted-documents" },
      { l: "Message Center", i: "✉", to: "/message-center" },
      { l: "Litigant Registrations", i: "👥", to: "/staff/registrations" },
      { l: "Conviction Warrant", i: "⚖", to: "/staff-warrant.html", page: "/staff-warrant.html" },
      { l: "Limitation Calculator", i: "📅", to: "/limitation-calculator.html?role=staff", page: "/limitation-calculator.html" },
      { l: "Upload Cases", i: "⇪", to: "/staff#upload" },
      { l: "Change ID & Password", i: "🔑", to: "/staff/change" }
    ];
    if (role === "admin") return [
      { l: "Dashboard", i: "⌂", to: "/admin" },
      { l: "Court Details", i: "🏛", to: "/admin/courts" },
      { l: "Staff Users", i: "👤", to: "/admin/staff-users" },
      { l: "Judge Users", i: "⚖", to: "/admin/judge-users" },
      { l: "Advocate / Litigant Registrations", i: "👥", to: "/admin/registrations" },
      { l: "Application Law Details", i: "📘", to: "/admin-laws.html", page: "/admin-laws.html" },
      { l: "Calendar Modification", i: "📅", to: "/limitation-calculator.html?role=admin", page: "/limitation-calculator.html" },
      { l: "Upload Excel (Final FS)", i: "⇪", to: "/admin#upload" }
    ];
    var kind = new URLSearchParams(location.search).get("kind");
    var list = [
      { l: "Home", i: "⌂", to: court ? "/advocate/menu" : "/advocate" },
      { l: court ? "Change Court" : "Select Court", i: "🏛", to: "/advocate" },
      { l: "Plea", i: "✎", to: need("/advocate/plea/lang") },
      { l: "Primary FS / FS on 1st Appearance", i: "📄", to: need("/advocate/primary-fs") },
      { l: "Final FS", i: "📄", to: need("/advocate/final-fs") },
      { l: "Application", i: "📝", to: need("/doc-generator.html?kind=application"), on: path === "/doc-generator.html" && kind === "application" },
      { l: "Pursis", i: "📝", to: need("/doc-generator.html?kind=pursis"), on: path === "/doc-generator.html" && kind === "pursis" },
      { l: "Surety / Bond", i: "📝", to: need("/doc-generator.html?kind=surety"), on: path === "/doc-generator.html" && kind === "surety" },
      { l: "Limitation Calculator", i: "📅", to: "/limitation-calculator.html?role=advocate", page: "/limitation-calculator.html" }
    ];
    if (role === "advocate") list.push({ l: "Live Deposition", i: "●", to: "/advocate/live" });
    if (role === "advocate" || role === "litigant") list.push({ l: "My Entries", i: "🗂", to: "/advocate/my-entries" });
    if (role === "advocate" || role === "litigant") list.push({ l: "Message Center", i: "✉", to: "/message-center" });
    return list;
  }

  function displayName() {
    if (!user) return "Guest Litigant";
    if (role === "admin") return "Administrator";
    if (role === "judge") {
      var c = (user.courts || [])[0];
      var n = (user.name || (c && c.english && c.english.judge_name) || user.login_id || "").trim();
      return n && !/^hon/i.test(n) ? "Hon'ble " + n : n;
    }
    return (user.name || "").trim() || user.login_id || "";
  }
  function roleLabel() {
    if (!user) return "Litigant (without login)";
    if (role === "staff" && user.designation) return user.designation;
    if (role === "judge") {
      var c = (user.courts || [])[0];
      var d = (c && c.english && c.english.judge_designation) || "";
      return d.replace(/\bA\.?\s?C\.?\s?J\.?\s?M\.?(?=\s|,|$)/gi, "Addl. Chief Judicial Magistrate") || "Judicial Officer";
    }
    return { admin: "Administrator", staff: "Court Staff", advocate: "Advocate", litigant: "Litigant" }[role] || "";
  }

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }

  function build() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    var list = items();
    if (user && role !== "judge") list.push({ l: "Signed Documents", i: "✍", to: "/signed-documents" });
    if (user) list.push({ l: "My Profile", i: "👤", to: "/profile" });
    var nav = document.createElement("aside");
    nav.className = "acjm-sn";
    var name = displayName();
    var html = '<div class="acjm-sn-brand"><button type="button" class="acjm-sn-home" title="Home"><img src="/nyayadwar-logo.svg" alt="NyayDwar" class="acjm-sn-logo"><span class="acjm-sn-bt"><strong>NyayDwar</strong><small>न्यायद्वार · Ahmedabad City</small></span></button>' +
      '<button type="button" class="acjm-sn-tg" title="Collapse / expand menu"></button></div><nav class="acjm-sn-menu">';
    list.forEach(function (it, idx) {
      var pages = [].concat(it.page || []);
      var on = it.on || pages.indexOf(path) >= 0 || (!it.page && it.to && it.to.split("?")[0] === path);
      if (path === "/doc-generator.html" && !it.on) on = false;
      html += '<button type="button" class="acjm-sn-it' + (it.sub ? " sub" : "") + (on ? " on" : "") + '" data-i="' + idx + '" title="' + esc(it.l) + '">' +
        (it.sub ? "" : '<span class="acjm-sn-ic">' + it.i + "</span>") + '<span class="acjm-sn-lb">' + esc(it.l) + "</span></button>";
    });
    html += "</nav>";
    if (name) html += '<div class="acjm-sn-user" title="My Profile"><span class="acjm-sn-av">' + esc(name.replace(/^Hon'ble\s+/i, "").charAt(0).toUpperCase()) + '</span><span class="acjm-sn-ut"><strong>' + esc(name) + "</strong><small>" + esc(roleLabel()) + "</small></span></div>";
    nav.innerHTML = html;
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.classList.add("acjm-side");
    var apply = function () {
      document.body.classList.toggle("acjm-side-c", collapsed);
      nav.querySelector(".acjm-sn-tg").textContent = collapsed ? "»" : "«";
    };
    apply();
    nav.querySelector(".acjm-sn-tg").onclick = function () { collapsed = !collapsed; apply(); };
    nav.querySelector(".acjm-sn-home").onclick = function () { location.href = homePath(); };
    var u = nav.querySelector(".acjm-sn-user");
    if (u && user) u.onclick = function () { location.href = "/profile"; };
    nav.querySelectorAll(".acjm-sn-it").forEach(function (b) {
      b.onclick = function () {
        var it = list[+b.getAttribute("data-i")];
        if (it.clear) { try { sessionStorage.removeItem(it.clear); } catch (e) { /* ignore */ } }
        location.href = it.to;
      };
    });
    // Profile photograph in the menu.
    var token = localStorage.getItem("token");
    if (token && user) {
      fetch("/api/profile/photo", { headers: { Authorization: "Bearer " + token } }).then(function (r) {
        if (!r.ok) return null;
        return r.blob();
      }).then(function (b) {
        if (!b) return;
        var img = document.createElement("img");
        img.className = "acjm-sn-av";
        img.alt = "";
        img.src = URL.createObjectURL(b);
        var av = nav.querySelector("span.acjm-sn-av");
        if (av) av.replaceWith(img);
      }).catch(function () { /* ignore */ });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
