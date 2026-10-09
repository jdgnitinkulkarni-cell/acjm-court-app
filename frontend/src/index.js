import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Suppress benign 3rd-party analytics errors fired from the throwaway
// iframe html2canvas creates during PDF generation (PostHog session-
// recorder calls pageHideListener on the cloned-iframe destroy and
// crashes inside its own bundle). The PDF itself is already saved by
// then, so we silence both the runtime overlay and the console error.
const isBenignPdfClonerError = (msg) =>
  typeof msg === "string" &&
  (msg.includes("bufferBelongsToIframe") ||
    msg.includes("posthog-recorder") ||
    msg.includes("DocumentCloner"));

window.addEventListener("error", (e) => {
  const msg = (e && (e.message || (e.error && e.error.message))) || "";
  const stack = (e && e.error && e.error.stack) || "";
  if (isBenignPdfClonerError(msg) || isBenignPdfClonerError(stack)) {
    e.preventDefault();
    e.stopImmediatePropagation && e.stopImmediatePropagation();
    return false;
  }
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = (e && e.reason && (e.reason.message || String(e.reason))) || "";
  const stack = (e && e.reason && e.reason.stack) || "";
  if (isBenignPdfClonerError(msg) || isBenignPdfClonerError(stack)) {
    e.preventDefault();
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
