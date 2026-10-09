/* NyayDwar — "Digitally Sign" dialog (used by the React pages and the static pages).
 *
 *   window.NyayDwarSign.open({
 *     docs: [{ getPdf: async () => Blob|ArrayBuffer, filename, title, source_id }, ...],   // one or many
 *     // (or, for one document: getPdf, filename, title, source_id at the top level)
 *     source_kind: "order", keywords: [...]   // keywords default to the signer's role keywords
 *   })
 *
 * Sign with DSC token (Windows / Ubuntu / Mac): the PDFs are handed to the server as one
 * short-lived signing request and the NyayDwar Sign Bridge (installed from My Profile) is
 * opened through the nyaydwar-sign:// link. The bridge opens the token ONCE (one PIN) and
 * signs every document on this computer, then sends the signed PDFs back; NyayDwar keeps
 * them (Signed Documents) and downloads them here (several documents come as one ZIP).
 *
 * Sign using Aadhaar: downloads the PDF(s) and opens DigiLocker; the Aadhaar-signed
 * copies can then be uploaded here so NyayDwar keeps them too.
 */
(function () {
  if (window.NyayDwarSign && window.NyayDwarSign.v >= 2) return;
  var API = location.origin + "/api";
  var DIGILOCKER_URL = "https://accounts.digilocker.gov.in/v3/49610f44a14a48369bbd18eaa13d07099a1e4a7d9ee289a0ae9a99ed3fdbeb7a--en";
  var ROLE_KEYWORDS = {
    judge: ["Locate the Judicial Officer Signature Here"],
    staff: ["Locate the Staff Signature Here"],
    advocate: ["Locate the Advocate Signature Here"],
    litigant: ["Locate the Complainant Signature Here", "Locate the Applicant Signature Here", "Locate the Accused Signature Here"]
  };
  var OS_LABEL = { windows: "Windows", ubuntu: "Ubuntu / Linux", mac: "Mac" };

  function detectOS() {
    var ua = (navigator.userAgent || "") + " " + (navigator.platform || "");
    if (/Windows|Win32|Win64/i.test(ua)) return "windows";
    if (/Mac|iPhone|iPad/i.test(ua)) return /iPhone|iPad/i.test(ua) ? "" : "mac";
    if (/Linux|X11|Ubuntu/i.test(ua) && !/Android/i.test(ua)) return "ubuntu";
    return "";
  }
  function bridgeUrl(os) { return API + "/downloads/sign-bridge?platform=" + (os || "windows"); }
  function user() { try { return JSON.parse(localStorage.getItem("user") || "null") || {}; } catch (e) { return {}; } }
  function authHeader() { var t = localStorage.getItem("token") || ""; return t ? { Authorization: "Bearer " + t } : {}; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function saveBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name || "document.pdf";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function signedName(name) { name = name || "document.pdf"; return name.replace(/\.pdf$/i, "") + "_signed.pdf"; }
  function toBlob(x) {
    if (!x) throw new Error("The PDF could not be prepared.");
    if (x instanceof Blob) return x.type === "application/pdf" ? x : new Blob([x], { type: "application/pdf" });
    return new Blob([x], { type: "application/pdf" });
  }
  async function readError(res, fallback) {
    try { var j = await res.json(); return (j && j.detail) || fallback; } catch (e) { return fallback; }
  }

  function injectStyle() {
    if (document.getElementById("nd-sign-style")) return;
    var st = document.createElement("style");
    st.id = "nd-sign-style";
    st.textContent = [
      ".nd-sign-back{position:fixed;inset:0;background:rgba(10,30,24,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}",
      ".nd-sign-box{background:#fffdf8;border-radius:14px;max-width:640px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;color:#1d2a25;max-height:92vh;overflow-y:auto}",
      ".nd-sign-head{background:linear-gradient(135deg,#173f35,#246452);color:#fff;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:10px}",
      ".nd-sign-head h3{margin:0;font-size:18px;color:#fff}.nd-sign-head small{display:block;color:#e8d9a8;font-size:12px;margin-top:2px}",
      ".nd-sign-x{background:transparent;border:0;color:#fff;font-size:24px;cursor:pointer;line-height:1}",
      ".nd-sign-body{padding:16px 18px}",
      ".nd-sign-list{margin:0 0 12px;padding:8px 12px 8px 28px;background:#f4f1e8;border-radius:10px;font-size:13px;max-height:120px;overflow:auto}",
      ".nd-sign-opt{border:1px solid #e3dccb;border-radius:12px;padding:14px;margin-bottom:12px;background:#fff}",
      ".nd-sign-opt h4{margin:0 0 4px;font-size:15px;color:#173f35}.nd-sign-opt p{margin:4px 0 10px;font-size:13px;color:#5d6a64;line-height:1.45}",
      ".nd-sign-btn{border:0;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;font-size:14px}",
      ".nd-sign-btn.primary{background:#173f35;color:#fff}.nd-sign-btn.gold{background:#c9a646;color:#1d2a25}.nd-sign-btn.plain{background:#eef2ef;color:#173f35}",
      ".nd-sign-btn[disabled]{opacity:.55;cursor:not-allowed}",
      ".nd-sign-status{margin-top:10px;font-size:13px;line-height:1.5;padding:10px 12px;border-radius:8px;background:#f4f1e8;display:none}",
      ".nd-sign-status.ok{background:#e6f3ec;color:#1f5a44}.nd-sign-status.err{background:#fbeceb;color:#8f2f27}",
      ".nd-sign-status ul{margin:6px 0 0;padding-left:18px}",
      ".nd-sign-link{color:#246452;font-weight:600}",
      ".nd-sign-note{font-size:12px;color:#6d7772;margin:8px 0 0}",
      ".nd-sign-spin{display:inline-block;width:12px;height:12px;border:2px solid #c9a646;border-top-color:transparent;border-radius:50%;animation:ndspin 1s linear infinite;margin-right:6px;vertical-align:-2px}",
      "@keyframes ndspin{to{transform:rotate(360deg)}}"
    ].join("\n");
    document.head.appendChild(st);
  }

  function open(opts) {
    opts = opts || {};
    injectStyle();
    var u = user();
    var keywords = opts.keywords || ROLE_KEYWORDS[u.role] || [];
    var docs = (opts.docs && opts.docs.length ? opts.docs : [{ getPdf: opts.getPdf, filename: opts.filename, title: opts.title, source_id: opts.source_id, court_id: opts.court_id }])
      .map(function (d, i) { return { getPdf: d.getPdf, filename: d.filename || ("document_" + (i + 1) + ".pdf"), title: d.title || d.filename || ("Document " + (i + 1)),
        source_id: d.source_id || "", source_kind: d.source_kind || opts.source_kind || "", court_id: d.court_id || opts.court_id || "", blob: null }; });
    var oneCourt = docs.every(function (d) { return d.court_id === docs[0].court_id; }) ? docs[0].court_id : "";
    var many = docs.length > 1;
    var os = detectOS();
    var pollTimer = null, closed = false, job = null;

    var back = document.createElement("div");
    back.className = "nd-sign-back no-print";
    back.setAttribute("data-testid", "nd-sign-dialog");
    var heading = many ? docs.length + " documents selected" : (opts.title || docs[0].title);
    back.innerHTML =
      '<div class="nd-sign-box" role="dialog" aria-modal="true">' +
      '<div class="nd-sign-head"><div><h3>Digitally Sign</h3><small>' + esc(heading) + '</small></div>' +
      '<button class="nd-sign-x" title="Close" data-x>&times;</button></div>' +
      '<div class="nd-sign-body">' +
      (many ? '<ol class="nd-sign-list">' + docs.map(function (d) { return "<li>" + esc(d.title) + "</li>"; }).join("") + "</ol>" : "") +
      '<div class="nd-sign-opt"><h4>Sign with DSC token</h4>' +
      '<p>Insert your DSC USB token. The NyayDwar Sign Bridge opens on your computer; choose the certificate, type the token PIN there and click Sign' +
      (many ? " — <strong>one PIN signs all " + docs.length + " documents</strong>" : "") +
      '. The signed ' + (many ? "copies are" : "copy is") + ' kept in NyayDwar (Signed Documents) and downloaded here' + (many ? " as one ZIP file" : "") + '.</p>' +
      '<button class="nd-sign-btn primary" data-token data-testid="nd-sign-token">' + (many ? "Sign all " + docs.length + " with DSC Token" : "Sign with DSC Token") + '</button> ' +
      '<button class="nd-sign-btn plain" data-reopen style="display:none">Open the Sign Bridge again</button>' +
      '<p class="nd-sign-note">Works on Windows, Ubuntu and Mac after installing the NyayDwar Sign Bridge once: ' +
      (os ? '<a class="nd-sign-link" href="' + bridgeUrl(os) + '" data-testid="nd-sign-bridge-link">Download for ' + OS_LABEL[os] + '</a> · ' : "") +
      '<a class="nd-sign-link" href="/profile#digital-signature">other systems</a> (also in My Profile).' +
      (os ? "" : ' <strong>Token signing needs a Windows, Ubuntu or Mac computer — on this device please use Aadhaar signing.</strong>') + '</p>' +
      '<div class="nd-sign-status" data-tstatus></div></div>' +
      '<div class="nd-sign-opt"><h4>Sign using Aadhaar (no token)</h4>' +
      '<p>The document' + (many ? "s are" : " is") + ' downloaded and DigiLocker opens in a new tab. Sign ' + (many ? "each PDF" : "the downloaded PDF") +
      ' there with Aadhaar OTP, then upload the signed ' + (many ? "copies" : "copy") + ' below so NyayDwar keeps ' + (many ? "them" : "it") + '.</p>' +
      '<button class="nd-sign-btn gold" data-aadhaar data-testid="nd-sign-aadhaar">Sign using Aadhaar</button>' +
      '<div data-upwrap style="display:none;margin-top:10px"><label style="font-size:13px;font-weight:600">Upload the Aadhaar-signed PDF' + (many ? "s" : "") + ' (optional): </label>' +
      '<input type="file" accept="application/pdf,.pdf" ' + (many ? "multiple " : "") + 'data-up data-testid="nd-sign-upload"></div>' +
      '<div class="nd-sign-status" data-astatus></div></div>' +
      '</div></div>';
    document.body.appendChild(back);

    var $ = function (sel) { return back.querySelector(sel); };
    var tStatus = $("[data-tstatus]"), aStatus = $("[data-astatus]");
    function show(el, cls, html) { el.style.display = "block"; el.className = "nd-sign-status " + (cls || ""); el.innerHTML = html; }
    function close() { closed = true; if (pollTimer) clearTimeout(pollTimer); back.remove(); }
    $("[data-x]").onclick = close;
    back.addEventListener("click", function (e) { if (e.target === back && !job) close(); });

    async function prepare(el) {
      for (var i = 0; i < docs.length; i++) {
        if (docs[i].blob) continue;
        if (many) show(el, "", '<span class="nd-sign-spin"></span>Preparing document ' + (i + 1) + " of " + docs.length + "…");
        try { docs[i].blob = toBlob(await docs[i].getPdf()); }
        catch (e) { throw new Error((many ? "“" + docs[i].title + "”: " : "") + (e.message || "The PDF could not be prepared.")); }
      }
    }

    function launchBridge() {
      if (!job) return;
      var link = "nyaydwar-sign://sign?server=" + encodeURIComponent(location.origin) + "&job=" + encodeURIComponent(job.id) + "&token=" + encodeURIComponent(job.token);
      var a = document.createElement("a");
      a.href = link; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
    }

    function resetToken() { job = null; $("[data-token]").disabled = false; $("[data-reopen]").style.display = "none"; }

    async function downloadSigned(st) {
      var ids = st.items.filter(function (it) { return it.status === "done"; }).map(function (it) { return it.signed_doc_id; });
      if (!ids.length) return;
      var f = ids.length === 1
        ? await fetch(API + "/signed-documents/" + encodeURIComponent(ids[0]) + "/file", { headers: authHeader() })
        : await fetch(API + "/signed-documents/zip?ids=" + ids.map(encodeURIComponent).join(","), { headers: authHeader() });
      if (!f.ok) throw new Error(await readError(f, "The signed copies could not be downloaded."));
      var doneDoc = docs[st.items.findIndex(function (it) { return it.status === "done"; })] || docs[0];
      saveBlob(await f.blob(), ids.length === 1 ? signedName(doneDoc.filename) : "Signed_Documents.zip");
    }

    async function poll() {
      if (closed || !job) return;
      try {
        var res = await fetch(API + "/sign-jobs/" + encodeURIComponent(job.id), { headers: authHeader() });
        if (res.ok) {
          var st = await res.json();
          if (st.status === "pending" && many && st.done + st.failed > 0) {
            show(tStatus, "", '<span class="nd-sign-spin"></span>Signing… ' + st.done + " of " + st.total + " signed" + (st.failed ? ", " + st.failed + " failed" : "") + ".");
          }
          if (st.status === "done" || st.status === "error" || st.status === "expired") {
            resetToken();
            var failedItems = st.items.filter(function (it) { return it.status === "error"; });
            var failList = failedItems.length && many ? "<ul>" + failedItems.map(function (it) { return "<li>" + esc(it.title) + (it.message ? " — " + esc(it.message) : "") + "</li>"; }).join("") + "</ul>" : "";
            if (st.done > 0) {
              await downloadSigned(st);
              show(tStatus, failedItems.length ? "err" : "ok",
                "<strong>" + (many ? st.done + " of " + st.total + " documents signed." : "Signed.") + "</strong> " +
                "The signed " + (st.done > 1 ? "copies are" : "copy is") + " saved in NyayDwar (menu → Signed Documents) and " +
                (st.done > 1 ? "downloaded as one ZIP file." : "downloaded to this computer.") +
                (st.note ? "<br><strong>" + esc(st.note) + "</strong>" : "") +
                (failedItems.length ? "<br>Not signed:" + failList : ""));
              if (typeof opts.onSigned === "function") try { opts.onSigned(st); } catch (e) { /* ignore */ }
            } else {
              show(tStatus, "err", esc(st.status === "expired" ? "The signing request expired. Please click the Sign button again." : (st.message || "Signing was not completed.")) + failList);
            }
            return;
          }
        }
      } catch (e) {
        show(tStatus, "err", esc(e.message || "Could not check the signing status."));
      }
      pollTimer = setTimeout(poll, 2000);
    }

    $("[data-token]").onclick = async function () {
      var btn = this;
      btn.disabled = true;
      show(tStatus, "", '<span class="nd-sign-spin"></span>Preparing the document' + (many ? "s" : "") + "…");
      try {
        await prepare(tStatus);
        show(tStatus, "", '<span class="nd-sign-spin"></span>Sending for signing…');
        var fd = new FormData();
        docs.forEach(function (d) { fd.append("files", d.blob, d.filename); });
        fd.append("titles", JSON.stringify(docs.map(function (d) { return d.title; })));
        fd.append("filenames", JSON.stringify(docs.map(function (d) { return d.filename; })));
        fd.append("source_ids", JSON.stringify(docs.map(function (d) { return d.source_id; })));
        fd.append("source_kinds", JSON.stringify(docs.map(function (d) { return d.source_kind; })));
        fd.append("court_ids", JSON.stringify(docs.map(function (d) { return d.court_id; })));
        fd.append("source_kind", opts.source_kind || "");
        fd.append("keywords", JSON.stringify(keywords));
        var res = await fetch(API + "/sign-jobs", { method: "POST", headers: authHeader(), body: fd });
        if (!res.ok) throw new Error(await readError(res, "The document could not be sent for signing."));
        job = await res.json();
        launchBridge();
        $("[data-reopen]").style.display = "inline-block";
        show(tStatus, "", '<span class="nd-sign-spin"></span>Waiting for the NyayDwar Sign Bridge… Sign in the bridge window that opened on your computer. ' +
          'If the browser asks <em>“Open NyayDwar Sign Bridge?”</em>, tick “Always allow” and click Open. ' +
          'If nothing opens, the bridge is not installed yet — ' + (os ? '<a class="nd-sign-link" href="' + bridgeUrl(os) + '">download it</a>' : "download it from My Profile") +
          ', install it, then click “Open the Sign Bridge again”.');
        pollTimer = setTimeout(poll, 2000);
      } catch (e) {
        btn.disabled = false;
        show(tStatus, "err", esc(e.message || "Could not start signing."));
      }
    };
    $("[data-reopen]").onclick = launchBridge;

    $("[data-aadhaar]").onclick = async function () {
      var win = window.open(DIGILOCKER_URL, "_blank");
      try { if (win) win.opener = null; } catch (e) { /* ignore */ }
      show(aStatus, "", '<span class="nd-sign-spin"></span>Preparing the document' + (many ? "s" : "") + "…");
      try {
        await prepare(aStatus);
        for (var i = 0; i < docs.length; i++) { saveBlob(docs[i].blob, docs[i].filename); if (many) await wait(400); }
        $("[data-upwrap]").style.display = "block";
        show(aStatus, "ok", (many ? docs.length + " PDFs have been downloaded (if the browser asks, allow multiple downloads). " : "The PDF “" + esc(docs[0].filename) + "” has been downloaded. ") +
          (win === null ? 'Your browser blocked the new tab — <a class="nd-sign-link" href="' + DIGILOCKER_URL + '" target="_blank" rel="noopener">open DigiLocker</a>. ' : "DigiLocker is open in a new tab. ") +
          "Sign " + (many ? "them" : "it") + " there with Aadhaar, download the signed PDF" + (many ? "s" : "") + " and upload " + (many ? "them" : "it") + " below.");
      } catch (e) {
        show(aStatus, "err", esc(e.message || "The PDF could not be prepared."));
      }
    };
    $("[data-up]").onchange = async function () {
      var files = Array.prototype.slice.call(this.files || []);
      if (!files.length) return;
      show(aStatus, "", '<span class="nd-sign-spin"></span>Saving the signed ' + (files.length > 1 ? "copies" : "copy") + "…");
      try {
        var fd = new FormData();
        files.forEach(function (f) { fd.append("files", f, f.name); });
        if (!many) { fd.append("title", docs[0].title); fd.append("source_id", docs[0].source_id); }
        fd.append("source_kind", opts.source_kind || "");
        fd.append("method", "aadhaar");
        if (oneCourt) fd.append("court_id", oneCourt);
        var res = await fetch(API + "/signed-documents/upload", { method: "POST", headers: authHeader(), body: fd });
        if (!res.ok) throw new Error(await readError(res, "The signed copy could not be saved."));
        show(aStatus, "ok", "<strong>Saved.</strong> " + files.length + " Aadhaar-signed " + (files.length > 1 ? "copies are" : "copy is") + " kept in NyayDwar (menu → Signed Documents)." +
          (oneCourt && (u.role === "advocate" || u.role === "litigant") ? " <strong>It has been submitted to the court (Documents Submitted).</strong>" : ""));
      } catch (e) {
        show(aStatus, "err", esc(e.message || "The signed copy could not be saved."));
      }
      this.value = "";
    };
  }

  window.NyayDwarSign = { v: 2, open: open, keywordsFor: function (role) { return ROLE_KEYWORDS[role] || []; }, detectOS: detectOS, bridgeUrl: bridgeUrl, OS_LABEL: OS_LABEL };
})();
