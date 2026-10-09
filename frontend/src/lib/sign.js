import { pdfBlob } from "./pdf";

// "Digitally Sign" — opens the NyayDwar signing dialog
// (public/static/js/acjm-sign.js: DSC token through the Sign Bridge, or Aadhaar).
export const digitallySign = (opts) => {
  if (window.NyayDwarSign) window.NyayDwarSign.open(opts);
  else window.alert("The signing tool is still loading. Please try again in a moment.");
};

// Sign a document shown on the page (Plea / FS review pages).
export const signElement = (el, filename, sourceKind, sourceId, title, courtId) =>
  digitallySign({ getPdf: () => pdfBlob(el), filename, title: title || filename, source_kind: sourceKind, source_id: sourceId, court_id: courtId || "" });
