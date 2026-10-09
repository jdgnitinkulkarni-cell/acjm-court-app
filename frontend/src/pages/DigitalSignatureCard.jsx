import React from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../lib/api";

// My Profile → Digital Signature: Sign Bridge downloads (Windows / Ubuntu / Mac).
const OSES = [
  ["windows", "Windows", "Windows 10 / 11 (64-bit). Unzip, then double-click install.bat."],
  ["ubuntu", "Ubuntu / Linux", "Ubuntu 22.04 / 24.04 (64-bit). Extract, then run: bash NyayDwar-Sign-Bridge/install.sh"],
  ["mac", "Mac", "macOS 11 or later (Apple Silicon and Intel). Extract, then right-click install.command → Open."],
];

export default function DigitalSignatureCard() {
  const navigate = useNavigate();
  const mine = (window.NyayDwarSign && window.NyayDwarSign.detectOS && window.NyayDwarSign.detectOS()) || "";
  return (
    <div className="card-block dsc-card" id="digital-signature" data-testid="profile-dsc">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Digital Signature</h3>
        <button className="btn btn-outline" onClick={() => navigate("/signed-documents")} data-testid="profile-open-signed">Open Signed Documents</button>
      </div>
      <div className="dsc-grid" style={{ marginTop: 12 }}>
        <div className="dsc-opt">
          <h4>Sign with DSC token</h4>
          <p>Token signing works on <strong>Windows, Ubuntu and Mac</strong> computers, after the <strong>NyayDwar Sign Bridge</strong> is downloaded and installed on that computer (once). Install your token's driver software (e.g. WD ProxKey / ePass2003) first.</p>
          <div className="dsc-downloads">
            {OSES.map(([k, label, hint]) => (
              <a key={k} className={`btn ${k === mine ? "btn-primary" : "btn-outline"}`} href={`${API}/downloads/sign-bridge?platform=${k}`} title={hint} data-testid={`profile-bridge-${k}`}>
                {label}{k === mine ? " (this computer)" : ""}
              </a>
            ))}
          </div>
          <ol className="dsc-steps">
            <li>Install the bridge: {(OSES.find(([k]) => k === mine) || OSES[0])[2]}</li>
            <li>In NyayDwar, select one or more entries and click <b>Digitally Sign → Sign with DSC Token</b>.</li>
            <li>First time only: when the browser asks “Open NyayDwar Sign Bridge?”, tick <b>Always allow</b> and click Open.</li>
            <li>Choose your certificate, type the token PIN in the bridge window and click Sign — one PIN signs all the selected documents.</li>
          </ol>
        </div>
        <div className="dsc-opt">
          <h4>No token? Sign using Aadhaar</h4>
          <p>Click <b>Digitally Sign → Sign using Aadhaar</b>. The PDF is downloaded and DigiLocker opens, where you sign it with Aadhaar OTP. Upload the signed PDF back in the same window so NyayDwar keeps a copy.</p>
          <h4 style={{ marginTop: 14 }}>Your security</h4>
          <p className="hint" style={{ margin: 0 }}>Your token PIN is typed only in the Sign Bridge window on your own computer. It is never saved, and never sent to the browser or to the NyayDwar server; the private key never leaves the token. The Aadhaar OTP is entered only on DigiLocker.</p>
        </div>
      </div>
    </div>
  );
}
