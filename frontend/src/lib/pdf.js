import html2pdf from "html2pdf.js";

// Generate and download a PDF from a DOM element.
// Strips <script> tags from the cloned document so 3rd-party analytics
// (PostHog session-recorder, etc.) don't attach to the throwaway iframe
// html2canvas creates and crash during DocumentCloner.destroy.
export const downloadPdf = async (element, filename = "document.pdf") => {
  if (!element) return;
  const stripPdfOnlyUi = (doc) => {
    try {
      doc
        .querySelectorAll(
          "script, iframe, noscript, .no-print, [data-no-print], #acjm-translate-panel, #acjm-translation-status"
        )
        .forEach((n) => n.remove());
      doc.querySelectorAll("button").forEach((n) => n.remove());
      doc.querySelectorAll("*").forEach((node) => {
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        if (
          text === "Generate Translated Copy" ||
          text === "Translated copy appended below the Court Copy." ||
          text === "First verify the Court Copy. Translation is appended only after this button is used."
        ) {
          node.remove();
        }
      });
    } catch (_) {}
  };
  const opt = {
    margin: [12, 12, 12, 12], // mm
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      letterRendering: true,
      logging: false,
      onclone: (clonedDoc) => {
        stripPdfOnlyUi(clonedDoc);
      },
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: {
      mode: ["css", "legacy"],
      avoid: [".signature-row", ".court-head", ".case-line"],
    },
  };
  try {
    return await html2pdf().set(opt).from(element).save();
  } catch (err) {
    // Some 3rd-party page listeners (PostHog) may throw during the iframe
    // destroy phase AFTER the PDF has been generated. Swallow that here so the
    // user still gets the file without seeing a runtime error overlay.
    // eslint-disable-next-line no-console
    console.warn("PDF post-process warning (safe to ignore):", err);
  }
};

// Same PDF as downloadPdf(), returned as a Blob (used for digital signing).
export const pdfBlob = async (element) => {
  if (!element) throw new Error("The document is not ready yet.");
  const opt = {
    margin: [12, 12, 12, 12],
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2, useCORS: true, backgroundColor: "#ffffff", letterRendering: true, logging: false,
      onclone: (doc) => {
        try {
          doc.querySelectorAll("script, iframe, noscript, .no-print, [data-no-print], #acjm-translate-panel, #acjm-translation-status, button").forEach((n) => n.remove());
        } catch (_) {}
      },
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: [".signature-row", ".court-head", ".case-line"] },
  };
  return html2pdf().set(opt).from(element).outputPdf("blob");
};
