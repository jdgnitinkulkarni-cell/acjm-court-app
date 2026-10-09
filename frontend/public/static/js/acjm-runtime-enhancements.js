(function(){
  const MIC_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z'/%3E%3Cpath d='M19 10v2a7 7 0 0 1-14 0v-2'/%3E%3Cpath d='M12 19v3'/%3E%3Cpath d='M8 22h8'/%3E%3C/svg%3E";
  const MOTHER_TONGUES = [
    {code:"en", name:"English", script:"Roman"},
    {code:"gu", name:"Gujarati", script:"Gujarati Script"},
    {code:"hi", name:"Hindi", script:"Devanagari"},
    {code:"mr", name:"Marathi", script:"Devanagari"},
    {code:"sa", name:"Sanskrit", script:"Devanagari"},
    {code:"pa", name:"Punjabi", script:"Gurmukhi"},
    {code:"bn", name:"Bengali", script:"Bengali Script"},
    {code:"as", name:"Assamese", script:"Assamese Script"},
    {code:"or", name:"Odia", script:"Odia Script"},
    {code:"ta", name:"Tamil", script:"Tamil Script"},
    {code:"te", name:"Telugu", script:"Telugu Script"},
    {code:"kn", name:"Kannada", script:"Kannada Script"},
    {code:"ml", name:"Malayalam", script:"Malayalam Script"},
    {code:"mni", name:"Meitei (Manipuri)", script:"Meitei Mayek"}
  ];
  let activeVoice = null;
  let lastVoiceTarget = null;
  let motherTonguePromptShown = false;
  let motherTonguePromptOpen = false;
  let motherTonguePromptPath = "";

  function installStyles(){
    if(document.getElementById("acjm-runtime-style")) return;
    const style = document.createElement("style");
    style.id = "acjm-runtime-style";
    style.textContent = `
      .acjm-voice-wrap{align-items:center;display:flex;gap:8px;width:100%}
      .acjm-voice-wrap>input,.acjm-voice-wrap>textarea{flex:1;min-width:0}
      .acjm-mic-btn{align-items:center;background:#dc2626;border:0;border-radius:999px;cursor:pointer;display:inline-flex;height:42px;justify-content:center;min-width:42px;padding:0;width:42px}
      .acjm-mic-btn::before{background:#fff;content:"";display:block;height:24px;width:24px;-webkit-mask:url("${MIC_SVG}") center/contain no-repeat;mask:url("${MIC_SVG}") center/contain no-repeat}
      .acjm-mic-btn.listening{background:#16a34a}
      .acjm-voice-status{color:#475569;font-size:13px;min-width:100px}
      .acjm-voice-status.listening{animation:acjmBlink 1s linear infinite;color:#16a34a;font-weight:700}
      .acjm-floating-mic{align-items:center;background:#fff;border:1px solid var(--border,#d4c8b0);border-radius:16px;bottom:86px;box-shadow:0 10px 24px rgba(15,23,42,.18);display:none;flex-direction:column;gap:6px;padding:8px;position:fixed;right:24px;touch-action:none;user-select:none;z-index:200}
      .acjm-floating-mic.visible{display:flex}
      .acjm-floating-mic .acjm-mic-btn{height:64px;min-width:64px;width:64px}
      .acjm-floating-mic .acjm-mic-btn::before{height:37px;width:37px}
      .acjm-mic-lang-select{border:1px solid var(--border,#d4c8b0);border-radius:999px;font-size:12px;padding:3px 8px;width:100%}
      .acjm-floating-mic-btnrow{align-items:center;display:flex;gap:8px}
      .acjm-floating-mic .acjm-voice-status{min-width:auto;white-space:nowrap}
      @keyframes acjmBlink{50%{opacity:.25}}
      .acjm-search-select{position:relative;width:100%}
      .acjm-search-control{align-items:center;background:#fff;border:1px solid var(--border,#d4c8b0);border-radius:4px;cursor:pointer;display:flex;justify-content:space-between;padding:10px 12px;width:100%}
      .acjm-search-panel{background:#fff;border:1px solid #777;box-shadow:0 8px 18px rgba(0,0,0,.12);display:none;left:0;padding:10px;position:absolute;right:0;top:calc(100% + 4px);z-index:60}
      .acjm-search-select.open .acjm-search-panel{display:block}
      .acjm-search-input{border:1px solid var(--border,#d4c8b0);border-radius:4px;box-sizing:border-box;font-family:inherit;margin-bottom:10px;padding:9px 10px;width:100%}
      .acjm-search-options{max-height:220px;overflow:auto}
      .acjm-search-option{cursor:pointer;padding:7px 8px}
      .acjm-search-option:hover,.acjm-search-option.active{background:#eef2ff}
      .acjm-mother-tongue-panel{align-items:center;background:#f8f3ea;border:1px solid var(--border,#d4c8b0);border-radius:6px;display:flex;flex-wrap:wrap;gap:10px;margin:0 0 14px;padding:12px}
      .acjm-mother-tongue-panel label{color:#1f2937;font-weight:700}
      .acjm-mother-tongue-panel select{background:#fff;border:1px solid var(--border,#d4c8b0);border-radius:4px;font-family:inherit;padding:9px 10px;min-width:260px}
      .acjm-mother-tongue-panel .hint{color:#64748b;font-size:13px}
      .acjm-translation-copy{border-top:2px solid #111;margin-top:16mm;min-height:240mm;page-break-before:always;padding-top:10mm}
      .acjm-translation-copy h2{text-align:center}
      .acjm-translation-copy .translation-box{border:1px dashed #777;margin-top:12mm;min-height:120mm;padding:8mm}
      .acjm-translation-copy .translated-line{margin:0 0 8px;text-align:justify}
      .acjm-mother-modal-backdrop{align-items:center;background:rgba(15,23,42,.52);display:flex;inset:0;justify-content:center;position:fixed;z-index:9999}
      .acjm-mother-modal{background:#fff;border-radius:8px;box-shadow:0 24px 60px rgba(15,23,42,.35);max-width:520px;padding:22px;width:calc(100% - 32px)}
      .acjm-mother-modal h2{color:#0f2f7f;font-size:21px;margin:0 0 12px}
      .acjm-mother-modal select{background:#fff;border:1px solid var(--border,#d4c8b0);border-radius:4px;font-family:inherit;margin-top:8px;padding:10px 12px;width:100%}
      .acjm-mother-modal .actions{display:flex;justify-content:flex-end;margin-top:18px}
      .acjm-mother-modal .error{color:#dc2626;font-size:13px;margin-top:8px}
      .print-doc{font-family:"Lohit Gujarati", "Tiro Devanagari Hindi", "Times New Roman", serif!important;font-size:17px!important;line-height:1.72!important;overflow:visible!important}
      .print-doc *{font-family:"Lohit Gujarati", "Tiro Devanagari Hindi", "Times New Roman", serif!important}
      .print-doc h1,.print-doc h2,.print-doc h3,.print-doc .court-head,.print-doc .case-line,.print-doc .signature-row{break-inside:avoid!important;page-break-inside:avoid!important}
      .print-doc table,.print-doc tbody,.print-doc tr,.print-doc td,.print-doc .qa-table,.print-doc .qa-table tr{break-inside:auto!important;page-break-inside:auto!important}
      .print-doc td{padding-bottom:7px!important;padding-top:7px!important}
      .print-doc .signature-row{align-items:flex-start!important;break-before:auto;page-break-before:auto;margin-top:18px!important}
      .print-doc .signature-row [style*="margin-top:60"]{margin-top:24px!important}
      .print-doc .signature-row [style*="margin-top: 60"]{margin-top:24px!important}
      .print-doc .signature-row [style*="margin-top:50"]{margin-top:24px!important}
      .print-doc .signature-row [style*="margin-top: 50"]{margin-top:24px!important}
      .print-doc .signature-row [style*="margin-top:30"]{margin-top:16px!important}
      .print-doc .signature-row [style*="margin-top: 30"]{margin-top:16px!important}
      .print-doc .signature-row [style*="margin-top:24"]{margin-top:14px!important}
      .print-doc .signature-row [style*="margin-top: 24"]{margin-top:14px!important}
      @media print{
        @page{size:A4;margin:14mm 14mm 16mm}
        body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .print-doc,.print-doc *{font-family:"Lohit Gujarati", "Tiro Devanagari Hindi", "Times New Roman", serif!important}
        .print-doc{border:0!important;box-shadow:none!important;margin:0!important;max-width:none!important;overflow:visible!important;padding:0!important;width:auto!important;font-size:17px!important;line-height:1.68!important;orphans:3;widows:3}
        .print-doc h1,.print-doc h2,.print-doc h3,.print-doc .court-head,.print-doc .case-line,.print-doc .signature-row{break-inside:avoid;page-break-inside:avoid}
        .print-doc table,.print-doc tbody,.print-doc tr,.print-doc td,.print-doc .qa-table,.print-doc .qa-table tr{break-inside:auto;page-break-inside:auto}
        .acjm-translation-copy{break-before:page;page-break-before:always}
        .acjm-translation-copy,.acjm-translation-copy *{font-family:"Tiro Devanagari Hindi", "Lohit Gujarati", "Times New Roman", serif!important}
        .acjm-floating-mic,.acjm-mic-btn,.mic-btn,#global-mic{display:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function pageLang(){
    const text = document.body.innerText || "";
    return /[\u0A80-\u0AFF]/.test(text) ? "gu" : "en";
  }

  function currentDocumentLang(){
    const queryLang = new URLSearchParams(location.search).get("lang");
    if(queryLang === "gu" || queryLang === "en") return queryLang;
    const pathLang = location.pathname.match(/\/(gu|en)(?:\/|$)/)?.[1];
    if(pathLang === "gu" || pathLang === "en") return pathLang;
    const scope = document.querySelector(".print-doc,.doc-card,.page") || document.body;
    const text = scope.innerText || "";
    if(/\b(Question|Answer|Accused Name|Case Number|Nature of Document|Complainant Name|Address of Accused)\b/i.test(text)) return "en";
    if(/પ્રશ્ન|ઉત્તર|આરોપી|દસ્તાવેજ|ફરિયાદી|કેસ નંબર/.test(text)) return "gu";
    return pageLang();
  }

  // Explicit mic-language override (set via the floating mic's own language
  // dropdown). Persisted so the user's choice carries across the session,
  // matching how other mic-related preferences (e.g. highlight colour) are
  // remembered. Falls back to page-based auto-detection (gu/en only) when
  // no override has been chosen yet.
  function getMicLangOverride(){
    const stored = localStorage.getItem("acjm_mic_lang");
    return ["gu","hi","en"].includes(stored) ? stored : null;
  }
  function setMicLangOverride(code){
    localStorage.setItem("acjm_mic_lang", code);
  }

  function speechRecognitionLang(){
    const override = getMicLangOverride();
    const lang = override || currentDocumentLang();
    return lang === "gu" ? "gu-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  }

  // Punctuation is dictated by saying the ENGLISH name of the mark (full stop,
  // comma, question mark, exclamation mark) in any mic language. The listed
  // Gujarati/Hindi spellings are only how the recognizer writes those English
  // words; native words (e.g. પૂર્ણ વિરામ) are intentionally not used.
  const SPOKEN_PUNCTUATION = [
    { mark: ".", phrases: ["full stop", "fullstop", "full-stop", "ફુલ સ્ટોપ", "ફુલસ્ટોપ", "ફુલ સ્ટૉપ", "ફુલસ્ટૉપ", "ફુલ સ્ટોપ્પ", "ફુલસ્ટોપ્પ", "ફુલ સટોપ", "ફુલસટોપ", "ફૂલ સ્ટોપ", "ફૂલસ્ટોપ", "ફૂલ સ્ટૉપ", "ફૂલસ્ટૉપ", "ફૂલ સ્ટોપ્પ", "ફૂલસ્ટોપ્પ", "ફૂલ સટોપ", "ફૂલસટોપ", "ફૂલ્લ સ્ટોપ", "ફૂલ્લસ્ટોપ", "ફૂલ્લ સ્ટૉપ", "ફૂલ્લસ્ટૉપ", "ફૂલ્લ સ્ટોપ્પ", "ફૂલ્લસ્ટોપ્પ", "ફૂલ્લ સટોપ", "ફૂલ્લસટોપ", "ફુલ્લ સ્ટોપ", "ફુલ્લસ્ટોપ", "ફુલ્લ સ્ટૉપ", "ફુલ્લસ્ટૉપ", "ફુલ્લ સ્ટોપ્પ", "ફુલ્લસ્ટોપ્પ", "ફુલ્લ સટોપ", "ફુલ્લસટોપ", "फुल स्टॉप", "फुलस्टॉप", "फुल स्टोप", "फुलस्टोप", "फुल स्टाप", "फुलस्टाप", "फ़ुल स्टॉप", "फ़ुलस्टॉप", "फ़ुल स्टोप", "फ़ुलस्टोप", "फ़ुल स्टाप", "फ़ुलस्टाप", "फूल स्टॉप", "फूलस्टॉप", "फूल स्टोप", "फूलस्टोप", "फूल स्टाप", "फूलस्टाप", "फ़ूल स्टॉप", "फ़ूलस्टॉप", "फ़ूल स्टोप", "फ़ूलस्टोप", "फ़ूल स्टाप", "फ़ूलस्टाप", "પીરિયડ", "पीरियड"] },
    { mark: ",", phrases: ["comma", "કોમા", "કૉમા", "કોમ્મા", "કામા", "कौमा", "कॉमा", "कोमा", "कोम्मा"] },
    { mark: "?", phrases: ["question mark", "questionmark", "ક્વેશ્ચન માર્ક", "ક્વેશ્ચનમાર્ક", "ક્વેશ્ચન માર્ક્સ", "ક્વેશ્ચનમાર્ક્સ", "ક્વેશ્ચન માક", "ક્વેશ્ચનમાક", "ક્વેશચન માર્ક", "ક્વેશચનમાર્ક", "ક્વેશચન માર્ક્સ", "ક્વેશચનમાર્ક્સ", "ક્વેશચન માક", "ક્વેશચનમાક", "ક્વેસ્ચન માર્ક", "ક્વેસ્ચનમાર્ક", "ક્વેસ્ચન માર્ક્સ", "ક્વેસ્ચનમાર્ક્સ", "ક્વેસ્ચન માક", "ક્વેસ્ચનમાક", "ક્વેશ્ચ્યન માર્ક", "ક્વેશ્ચ્યનમાર્ક", "ક્વેશ્ચ્યન માર્ક્સ", "ક્વેશ્ચ્યનમાર્ક્સ", "ક્વેશ્ચ્યન માક", "ક્વેશ્ચ્યનમાક", "ક્વેસચન માર્ક", "ક્વેસચનમાર્ક", "ક્વેસચન માર્ક્સ", "ક્વેસચનમાર્ક્સ", "ક્વેસચન માક", "ક્વેસચનમાક", "કવેશ્ચન માર્ક", "કવેશ્ચનમાર્ક", "કવેશ્ચન માર્ક્સ", "કવેશ્ચનમાર્ક્સ", "કવેશ્ચન માક", "કવેશ્ચનમાક", "क्वेश्चन मार्क", "क्वेश्चनमार्क", "क्वेश्चन मार्क्स", "क्वेश्चनमार्क्स", "क्वेशचन मार्क", "क्वेशचनमार्क", "क्वेशचन मार्क्स", "क्वेशचनमार्क्स", "क्वेस्चन मार्क", "क्वेस्चनमार्क", "क्वेस्चन मार्क्स", "क्वेस्चनमार्क्स", "क्वेस्चन् मार्क", "क्वेस्चन्मार्क", "क्वेस्चन् मार्क्स", "क्वेस्चन्मार्क्स", "कवेश्चन मार्क", "कवेश्चनमार्क", "कवेश्चन मार्क्स", "कवेश्चनमार्क्स"] },
    { mark: "!", phrases: ["exclamation mark", "exclamation point", "exclamationmark", "exclamationpoint", "એક્સક્લેમેશન માર્ક", "એક્સક્લેમેશનમાર્ક", "એક્સક્લેમેશન પોઇન્ટ", "એક્સક્લેમેશનપોઇન્ટ", "એક્સક્લેમેશન પોઈન્ટ", "એક્સક્લેમેશનપોઈન્ટ", "એક્સક્લેમેસન માર્ક", "એક્સક્લેમેસનમાર્ક", "એક્સક્લેમેસન પોઇન્ટ", "એક્સક્લેમેસનપોઇન્ટ", "એક્સક્લેમેસન પોઈન્ટ", "એક્સક્લેમેસનપોઈન્ટ", "એક્સપ્લેમેશન માર્ક", "એક્સપ્લેમેશનમાર્ક", "એક્સપ્લેમેશન પોઇન્ટ", "એક્સપ્લેમેશનપોઇન્ટ", "એક્સપ્લેમેશન પોઈન્ટ", "એક્સપ્લેમેશનપોઈન્ટ", "એક્સપ્લેમેસન માર્ક", "એક્સપ્લેમેસનમાર્ક", "એક્સપ્લેમેસન પોઇન્ટ", "એક્સપ્લેમેસનપોઇન્ટ", "એક્સપ્લેમેસન પોઈન્ટ", "એક્સપ્લેમેસનપોઈન્ટ", "એક્સકલેમેશન માર્ક", "એક્સકલેમેશનમાર્ક", "એક્સકલેમેશન પોઇન્ટ", "એક્સકલેમેશનપોઇન્ટ", "એક્સકલેમેશન પોઈન્ટ", "એક્સકલેમેશનપોઈન્ટ", "એક્સક્લમેશન માર્ક", "એક્સક્લમેશનમાર્ક", "એક્સક્લમેશન પોઇન્ટ", "એક્સક્લમેશનપોઇન્ટ", "એક્સક્લમેશન પોઈન્ટ", "એક્સક્લમેશનપોઈન્ટ", "एक्सक्लेमेशन मार्क", "एक्सक्लेमेशनमार्क", "एक्सक्लेमेशन पॉइंट", "एक्सक्लेमेशनपॉइंट", "एक्सक्लेमेशन पोइंट", "एक्सक्लेमेशनपोइंट", "एक्सक्लेमेसन मार्क", "एक्सक्लेमेसनमार्क", "एक्सक्लेमेसन पॉइंट", "एक्सक्लेमेसनपॉइंट", "एक्सक्लेमेसन पोइंट", "एक्सक्लेमेसनपोइंट", "एक्सप्लेमेशन मार्क", "एक्सप्लेमेशनमार्क", "एक्सप्लेमेशन पॉइंट", "एक्सप्लेमेशनपॉइंट", "एक्सप्लेमेशन पोइंट", "एक्सप्लेमेशनपोइंट", "एक्सकलेमेशन मार्क", "एक्सकलेमेशनमार्क", "एक्सकलेमेशन पॉइंट", "एक्सकलेमेशनपॉइंट", "एक्सकलेमेशन पोइंट", "एक्सकलेमेशनपोइंट"] }
  ];
  const SPOKEN_PARAGRAPH_COMMANDS = [
    "next paragraph",
    "new paragraph",
    "new para",
    "next para",
    "નેક્સ્ટ પેરાગ્રાફ",
    "નેક્સ્ટ પેરા",
    "નવો પેરાગ્રાફ",
    "નવા પેરાગ્રાફ",
    "નવો paragraph",
    "નવો para",
    "નવો ફકરો",
    "નવા ફકરો",
    "આગળનો ફકરો",
    "अगलानो फकरो",
    "अगला पैराग्राफ",
    "नया पैराग्राफ",
    "नया अनुच्छेद",
    "नवो paragraph",
    "नवो para",
    "नवो पैराग्राफ",
    "नवो फकरो",
  ];

  function escapeRegExp(value){
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function spokenPhrasePattern(phrase){
    return String(phrase || "").trim().split(/[\s\u00a0]+/).map(escapeRegExp).join("[\\s\\u00a0]*");
  }

  function normalizeSpokenPunctuationText(text){
    let normalized = String(text || "");
    SPOKEN_PUNCTUATION.forEach(({ mark, phrases }) => {
      phrases.forEach((phrase) => {
        normalized = normalized.replace(new RegExp(`(^|[\\s\\u00a0])${spokenPhrasePattern(phrase)}(?=$|[\\s\\u00a0.,!?])`, "giu"), `$1${mark}`);
      });
    });
    return normalized
      .replace(/\s+([,.?!])/g, "$1")
      .replace(/([,.?!])(?=\S)/g, "$1 ");
  }

  function normalizeSpokenEditorCommands(text){
    let normalized = normalizeSpokenPunctuationText(text);
    SPOKEN_PARAGRAPH_COMMANDS.forEach((phrase) => {
      normalized = normalized.replace(new RegExp(`(^|[\\s\\u00a0])${spokenPhrasePattern(phrase)}(?=$|[\\s\\u00a0.,!?])`, "giu"), "$1\n\n");
    });
    return normalized
      .replace(/[ \t\u00a0]*\n[ \t\u00a0]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  function escapeHtml(value){
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  function textToInsertionHtml(text){
    return String(text || "")
      .split(/\n{2,}/)
      .map((part) => escapeHtml(part).replace(/\n/g, "<br>"))
      .join("<div><br></div>");
  }

  function textBeforeCursor(el){
    if(el.isContentEditable){
      const sel = window.getSelection();
      if(!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return el.innerText || "";
      const range = sel.getRangeAt(0).cloneRange();
      const before = document.createRange();
      before.selectNodeContents(el);
      before.setEnd(range.startContainer, range.startOffset);
      return before.toString();
    }
    return String(el.value || "").slice(0, el.selectionStart ?? el.value.length);
  }

  function capitalizeEnglishSentenceStarts(text, previousText){
    let shouldCapitalizeFirst = /(?:^|[.!?])[\s\u00a0]*$/.test(String(previousText || ""));
    return String(text || "").replace(/(^[\s\u00a0]*|[.!?][\s\u00a0]+)([a-z])/g, (match, lead, letter, offset) => {
      if(offset === 0 && !shouldCapitalizeFirst && /^[\s\u00a0]*$/.test(lead)) return match;
      return lead + letter.toUpperCase();
    });
  }

  function emitVoiceEngine(engine, status, message){
    window.dispatchEvent(new CustomEvent("acjm-voice-engine", { detail: { engine, status, message } }));
  }

  function stopActiveVoice(){
    if(!activeVoice) return;
    try { activeVoice.recognition.stop(); } catch {}
    activeVoice = null;
    document.querySelectorAll(".acjm-mic-btn.listening").forEach(btn => btn.classList.remove("listening"));
    document.querySelectorAll(".acjm-voice-status.listening").forEach(status => status.classList.remove("listening"));
    emitVoiceEngine("idle", "stopped", voiceMessage("stopped"));
  }

  function voiceMessage(key){
    const override = getMicLangOverride();
    const lang = override || currentDocumentLang();
    const map = {
      unsupported: {
        gu: "આ બ્રાઉઝરમાં વોઇસ ટાઇપિંગ સપોર્ટેડ નથી. કૃપા કરીને Google Chrome અથવા Microsoft Edge નો ઉપયોગ કરો.",
        hi: "इस ब्राउज़र में वॉइस टाइपिंग समर्थित नहीं है। कृपया Google Chrome या Microsoft Edge का उपयोग करें।",
        en: "Voice typing is not supported in this browser. Please use Google Chrome or Microsoft Edge.",
      },
      listening: { gu: "સાંભળે છે...", hi: "सुन रहा है...", en: "Listening..." },
      stopped: { gu: "બંધ થયું", hi: "रुक गया", en: "Stopped" },
      denied: { gu: "માઇક્રોફોન પરવાનગી નકારી.", hi: "माइक्रोफोन अनुमति अस्वीकृत।", en: "Microphone permission denied" },
    };
    return map[key][lang] || map[key].en;
  }

  function setNativeValue(el, value){
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter ? setter.call(el, value) : (el.value = value);
    el.dispatchEvent(new Event("input", {bubbles:true}));
    el.dispatchEvent(new Event("change", {bubbles:true}));
  }

  function placeCaretAtEnd(el){
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ---------------- Spoken numbers -> digits (voice typing) ----------------
  // Voice recognition writes Gujarati/Hindi numbers as words ("પિસ્તાલીસ",
  // "બસો છાસઠ"). This layer turns them into digits (45, 266) before the text
  // is inserted. In the deposition body only real figures are converted
  // (11 and above, anything with સો/હજાર/લાખ, or 3+ digits spoken one by one)
  // so ordinary words like "એક માણસ" stay as they are; in short form fields
  // (Age, Address, Contact No.) every spoken number is converted.
  const SPOKEN_NUMBER_WORDS = (() => {
    const gu = [
      "શૂન્ય","એક","બે","ત્રણ","ચાર","પાંચ","છ","સાત","આઠ","નવ",
      "દસ","અગિયાર","બાર","તેર","ચૌદ","પંદર","સોળ","સત્તર","અઢાર","ઓગણીસ",
      "વીસ","એકવીસ","બાવીસ","ત્રેવીસ","ચોવીસ","પચ્ચીસ","છવ્વીસ","સત્તાવીસ","અઠ્ઠાવીસ","ઓગણત્રીસ",
      "ત્રીસ","એકત્રીસ","બત્રીસ","તેત્રીસ","ચોત્રીસ","પાંત્રીસ","છત્રીસ","સાડત્રીસ","આડત્રીસ","ઓગણચાલીસ",
      "ચાલીસ","એકતાલીસ","બેતાલીસ","તેતાલીસ","ચુમ્માલીસ","પિસ્તાલીસ","છેતાલીસ","સુડતાલીસ","અડતાલીસ","ઓગણપચાસ",
      "પચાસ","એકાવન","બાવન","ત્રેપન","ચોપન","પંચાવન","છપ્પન","સત્તાવન","અઠ્ઠાવન","ઓગણસાઠ",
      "સાઠ","એકસઠ","બાસઠ","ત્રેસઠ","ચોસઠ","પાંસઠ","છાસઠ","સડસઠ","અડસઠ","અગણોસિત્તેર",
      "સિત્તેર","એકોતેર","બોતેર","તોતેર","ચુમોતેર","પંચોતેર","છોતેર","સિત્યોતેર","ઇઠ્યોતેર","ઓગણાએંસી",
      "એંસી","એક્યાસી","બ્યાસી","ત્યાસી","ચોર્યાસી","પંચાસી","છ્યાસી","સિત્યાસી","ઇઠ્યાસી","નેવ્યાસી",
      "નેવું","એકાણું","બાણું","ત્રાણું","ચોરાણું","પંચાણું","છન્નું","સત્તાણું","અઠ્ઠાણું","નવ્વાણું"
    ];
    const hi = [
      "शून्य","एक","दो","तीन","चार","पांच","छह","सात","आठ","नौ",
      "दस","ग्यारह","बारह","तेरह","चौदह","पंद्रह","सोलह","सत्रह","अठारह","उन्नीस",
      "बीस","इक्कीस","बाईस","तेईस","चौबीस","पच्चीस","छब्बीस","सत्ताईस","अट्ठाईस","उनतीस",
      "तीस","इकतीस","बत्तीस","तैंतीस","चौंतीस","पैंतीस","छत्तीस","सैंतीस","अड़तीस","उनतालीस",
      "चालीस","इकतालीस","बयालीस","तैंतालीस","चवालीस","पैंतालीस","छियालीस","सैंतालीस","अड़तालीस","उनचास",
      "पचास","इक्यावन","बावन","तिरपन","चौवन","पचपन","छप्पन","सत्तावन","अट्ठावन","उनसठ",
      "साठ","इकसठ","बासठ","तिरसठ","चौंसठ","पैंसठ","छियासठ","सड़सठ","अड़सठ","उनहत्तर",
      "सत्तर","इकहत्तर","बहत्तर","तिहत्तर","चौहत्तर","पचहत्तर","छिहत्तर","सतहत्तर","अठहत्तर","उन्यासी",
      "अस्सी","इक्यासी","बयासी","तिरासी","चौरासी","पचासी","छियासी","सत्तासी","अट्ठासी","नवासी",
      "नब्बे","इक्यानवे","बानवे","तिरानवे","चौरानवे","पचानवे","छियानवे","सत्तानवे","अट्ठानवे","निन्यानवे"
    ];
    const extra = {
      // common alternative spellings / recognition variants
      "પચીસ":25,"છવીસ":26,"સત્યાવીસ":27,"અઠાવીસ":28,"ઓગણત્રિસ":29,"ત્રિસ":30,"ચુંમાલીસ":44,"ચુમાલીસ":44,
      "પિસ્તાલ":45,"પિસ્તાળ":45,"છેંતાલીસ":46,"છત્તાલીસ":46,"સુડતાલ":47,"ઓગણપચ્ચાસ":49,"એકાવણ":51,"બાવણ":52,
      "ઓગણસિત્તેર":69,"અગણોસિત્તેર":69,"સિત્તોતેર":77,"અઠ્યોતેર":78,"ઓગણએંસી":79,"ઓગણ્યાએંસી":79,"એંશી":80,
      "નેવુ":90,"છન્નુ":96,"નવ્વાણુ":99,"બેઉ":2,
      "पाँच":5,"छः":6,"छे":6,"नो":9,"चवालिस":44,"पैतालीस":45,"छयालीस":46,"सैतालीस":47,"अडतालीस":48,"अडतीस":38,
      "सडसठ":67,"अडसठ":68,"अट्ठाइस":28,"छियानबे":96,"नब्बें":90
    };
    const words = new Map();
    const put = (w, v) => { if(w) words.set(normalizeNumberToken(w), v); };
    gu.forEach((w, i) => put(w, i));
    hi.forEach((w, i) => put(w, i));
    Object.entries(extra).forEach(([w, v]) => put(w, v));
    return words;
  })();
  const SPOKEN_MULTIPLIERS = new Map([
    ["સો",100],["સૌ",100],["सौ",100],["सो",100],
    ["હજાર",1000],["हज़ार",1000],["हजार",1000],
    ["લાખ",100000],["लाख",100000],
    ["કરોડ",10000000],["करोड़",10000000],["करोड",10000000]
  ].map(([w, v]) => [normalizeNumberToken(w), v]));
  const SPOKEN_FRACTION_PREFIX = new Map([["દોઢ",1.5],["અઢી",2.5],["डेढ़",1.5],["ढाई",2.5],["डेढ",1.5]].map(([w,v]) => [normalizeNumberToken(w), v]));

  function normalizeNumberToken(word){
    return String(word || "")
      .normalize("NFC")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/ળ/g, "લ")
      .replace(/\u093c/g, "")
      .toLowerCase();
  }

  function lookupSpokenNumber(token){
    const key = normalizeNumberToken(token);
    if(!key) return null;
    if(/^[0-9૦-૯०-९]+$/.test(key)){
      const ascii = key.replace(/[૦-૯]/g, d => String(d.charCodeAt(0) - 0x0AE6)).replace(/[०-९]/g, d => String(d.charCodeAt(0) - 0x0966));
      return { kind: "num", value: parseInt(ascii, 10), digits: ascii.length, literal: true };
    }
    if(SPOKEN_NUMBER_WORDS.has(key)) return { kind: "num", value: SPOKEN_NUMBER_WORDS.get(key) };
    if(SPOKEN_MULTIPLIERS.has(key)) return { kind: "mult", value: SPOKEN_MULTIPLIERS.get(key) };
    // Fused hundreds/thousands: "બસો" (2x100), "ત્રણસો", "દોઢસો", "બેહજાર"
    for(const [mw, mv] of SPOKEN_MULTIPLIERS){
      if(key.length > mw.length && key.endsWith(mw)){
        const head = key.slice(0, -mw.length);
        const headAlt = head === "બ" ? "બે" : head === "छ" ? "छह" : head;
        let hv = SPOKEN_NUMBER_WORDS.has(headAlt) ? SPOKEN_NUMBER_WORDS.get(headAlt) : null;
        if(hv == null && SPOKEN_FRACTION_PREFIX.has(head)) hv = SPOKEN_FRACTION_PREFIX.get(head);
        if(hv != null && hv > 0) return { kind: "fused", value: Math.round(hv * mv), mult: mv };
      }
    }
    // Recognition sometimes cuts the end of a long number word ("પિસ્તાલ").
    if(key.length >= 5){
      let found = null, count = 0;
      for(const [w, v] of SPOKEN_NUMBER_WORDS){
        if(w.length > key.length && w.length - key.length <= 3 && w.startsWith(key)){ found = v; count++; }
      }
      if(count === 1 && found >= 11) return { kind: "num", value: found };
    }
    return null;
  }

  function convertSpokenNumbers(text, el){
    if(!text || !/[઀-૿ऀ-ॿ]/.test(text)) return text;
    const convertAll = !!el && !el.isContentEditable && (el.tagName === "INPUT" || (el.tagName === "TEXTAREA" && (el.rows || 2) <= 2));
    const parts = String(text).split(/(\s+)/);
    const out = [];
    let run = null; // {items:[{value,...}], total, current, smallSet, hadMult, tokens:[], trail}

    const finishNumber = (r) => {
      const value = r.total + r.current;
      return { value, hadMult: r.hadMult, singleDigit: !r.hadMult && value < 10 && r.words === 1, words: r.words, literal: r.literal };
    };
    const flushRun = () => {
      if(!run) return;
      const nums = run.numbers.concat(run.words ? [finishNumber(run)] : []);
      const allSingle = nums.length >= 3 && nums.every(n => n.singleDigit || (n.literal && String(n.value).length === 1));
      const important = convertAll || allSingle || nums.some(n => n.hadMult || n.value >= 11);
      if(!important){
        out.push(run.raw.join(""));
      }else if(allSingle){
        out.push(nums.map(n => n.value).join("") + run.trail);
      }else{
        out.push(nums.map(n => String(n.value)).join(" ") + run.trail);
      }
      run = null;
    };
    const newRun = () => ({ numbers: [], total: 0, current: 0, smallSet: false, hadMult: false, words: 0, literal: false, raw: [], trail: "" });

    for(let i = 0; i < parts.length; i++){
      const part = parts[i];
      if(/^\s+$/.test(part) || part === ""){
        if(run) run.raw.push(part); else out.push(part);
        continue;
      }
      const m = part.match(/^(.*?)([,.;:?!।॥)\]"'”’]*)$/u);
      const core = m ? m[1] : part;
      const trail = m ? m[2] : "";
      const info = lookupSpokenNumber(core);
      if(!info){
        if(run){
          // drop the whitespace captured after the number back into the output
          const trailingSpace = [];
          while(run.raw.length && /^\s+$/.test(run.raw[run.raw.length - 1])) trailingSpace.unshift(run.raw.pop());
          flushRun();
          out.push(...trailingSpace);
        }
        out.push(part);
        continue;
      }
      if(!run) run = newRun();
      run.raw.push(part);
      if(info.kind === "num"){
        if(info.literal) run.literal = true;
        if(run.words && (run.smallSet || (info.value >= 100 && !run.hadMult))){
          run.numbers.push(finishNumber(run));
          Object.assign(run, { total: 0, current: 0, smallSet: false, hadMult: false, words: 0, literal: !!info.literal });
        }
        run.current += info.value;
        run.smallSet = true;
        run.words++;
      }else if(info.kind === "fused"){
        if(run.words && (run.smallSet || run.current)){
          run.numbers.push(finishNumber(run));
          Object.assign(run, { total: 0, current: 0, smallSet: false, hadMult: false, words: 0, literal: false });
        }
        if(info.mult >= 1000) run.total += info.value; else run.current += info.value;
        run.hadMult = true; run.smallSet = false; run.words++;
      }else{ // multiplier word
        if(!run.words){ // bare "સો"/"હજાર" with nothing before it: keep as a word
          run.raw.pop();
          if(!run.raw.length) run = null;
          else flushRun();
          out.push(part);
          continue;
        }
        if(info.value === 100){ run.current = (run.current || 1) * 100; }
        else { run.total += (run.current || 1) * info.value; run.current = 0; }
        run.hadMult = true; run.smallSet = false; run.words++;
      }
      if(trail){ run.trail = trail; flushRun(); }
    }
    flushRun();
    return out.join("");
  }

  function insertAtCursor(el, text){
    const previousText = textBeforeCursor(el);
    text = normalizeSpokenEditorCommands(text);
    try { text = convertSpokenNumbers(text, el); } catch {}
    text = capitalizeEnglishSentenceStarts(text, previousText);
    if(el.isContentEditable){
      el.focus();
      const sel = window.getSelection();
      if(!sel.rangeCount || !el.contains(sel.getRangeAt(0).commonAncestorContainer)) placeCaretAtEnd(el);
      if(/\n{2,}/.test(text)){
        document.execCommand("insertHTML", false, textToInsertionHtml(text));
      }else{
        document.execCommand("insertText", false, text);
      }
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const nextValue = el.value.slice(0, start) + text + el.value.slice(end);
    setNativeValue(el, nextValue);
    const next = start + text.length;
    try { el.selectionStart = el.selectionEnd = next; } catch {}
    el.focus();
  }

  function targetTrailingSpaceNeeded(el){
    const current = el.isContentEditable ? (el.innerText || "") : (el.value || "");
    return current && !/\s$/.test(current);
  }

  function voiceShortcutHint(){
    return "Ctrl + Shift + M";
  }

  function updateMicButtonHint(btn, status){
    const listening = status === "listening";
    const hint = listening
      ? `Voice typing is on. Press Esc to stop.`
      : `Click to start voice typing. Shortcut: ${voiceShortcutHint()}.`;
    btn.title = hint;
    btn.setAttribute("aria-label", hint);
  }

  function setVoiceStatus(btn, status, text){
    const wrap = btn.closest(".acjm-voice-wrap") || btn.closest(".acjm-floating-mic");
    const statusEl = wrap?.querySelector(".acjm-voice-status");
    if(statusEl) statusEl.textContent = text || "";
    btn.classList.toggle("listening", status === "listening");
    if(statusEl) statusEl.classList.toggle("listening", status === "listening");
    updateMicButtonHint(btn, status);
    emitVoiceEngine(status === "listening" ? (activeVoice && activeVoice.ai ? "ai" : "browser") : "idle", status, text || "");
  }

  let voiceStartToken = null;
  function toggleVoice(el, btn){
    if(activeVoice && activeVoice.el === el){ stopActiveVoice(); return; }
    if(voiceStartToken){ voiceStartToken = null; setVoiceStatus(btn, "stopped", voiceMessage("stopped")); return; }
    if(activeVoice) stopActiveVoice();
    try { el.focus(); } catch {}
    const lang = currentMicLang();
    if(!["gu","hi"].includes(lang)){ startBrowserVoice(el, btn); return; }
    const token = {};
    voiceStartToken = token;
    aiAsrAvailable(lang).then(ok => {
      if(voiceStartToken !== token) return;
      voiceStartToken = null;
      if(activeVoice) return;
      if(ok) startAiVoice(el, btn, lang); else startBrowserVoice(el, btn);
    });
  }

  function startBrowserVoice(el, btn){
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!Speech){
      setVoiceStatus(btn, "stopped", voiceMessage("unsupported"));
      emitVoiceEngine("unavailable", "unsupported", voiceMessage("unsupported"));
      return;
    }
    const recognition = new Speech();
    recognition.lang = speechRecognitionLang();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onstart = () => setVoiceStatus(btn, "listening", voiceMessage("listening"));
    recognition.onend = () => { setVoiceStatus(btn, "stopped", voiceMessage("stopped")); activeVoice = null; };
    recognition.onerror = (event) => setVoiceStatus(btn, "stopped", event.error === "not-allowed" ? voiceMessage("denied") : voiceMessage("stopped"));
    recognition.onresult = (event) => {
      let text = "";
      for(let i = event.resultIndex; i < event.results.length; i++) text += event.results[i][0].transcript;
      const target = currentVoiceTarget() || (activeVoice?.el && document.body.contains(activeVoice.el) ? activeVoice.el : el);
      if(text) insertAtCursor(target, (targetTrailingSpaceNeeded(target) ? " " : "") + text);
    };
    activeVoice = {el, recognition};
    recognition.start();
  }

  function shouldAddMic(el){
    if(el.closest(".acjm-voice-wrap")) return false;
    if(el.closest(".acjm-floating-mic")) return false;
    if(el.closest(".acjm-search-select")) return false;
    if(el.closest(".topbar") || el.closest(".landing-header")) return false;
    const identity = `${el.getAttribute("data-testid") || ""} ${el.id || ""} ${el.name || ""} ${el.getAttribute("placeholder") || ""} ${el.getAttribute("aria-label") || ""}`;
    if(/case|કેસ|date|તારીખ|DD\/MM\/YYYY|login|password|pwd|admin-password|staff-password|new-id|conf-id|ex-id/i.test(identity)) return false;
    // contentEditable regions (e.g. the Deposition Typing Page's main body)
    if(el.isContentEditable) return true;
    if(el.tagName === "TEXTAREA") return true;
    if(el.tagName !== "INPUT") return false;
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return !["password","hidden","checkbox","radio","file","date","datetime-local","number","color"].includes(type);
  }

  function currentVoiceTarget(){
    const el = document.activeElement;
    if(el && shouldAddMic(el)) return el;
    return lastVoiceTarget && document.body.contains(lastVoiceTarget) && shouldAddMic(lastVoiceTarget) ? lastVoiceTarget : null;
  }

  function updateFloatingMicVisibility(){
    const bar = document.getElementById("acjm-floating-mic");
    if(!bar) return;
    const hasTarget = currentVoiceTarget();
    bar.classList.toggle("visible", Boolean(hasTarget));
    if(hasTarget) ensureFloatingMicSafePosition(bar);
  }

  function floatingMicBlockedSelector(){
    return "button,a,input,textarea,select,[role='button'],[contenteditable='true']";
  }

  function rectsOverlap(a, b, pad = 8){
    return !(a.right + pad <= b.left || a.left - pad >= b.right || a.bottom + pad <= b.top || a.top - pad >= b.bottom);
  }

  function visibleBlockedRects(exclude){
    return Array.from(document.querySelectorAll(floatingMicBlockedSelector()))
      .filter((el) => el !== exclude && !exclude.contains(el) && !el.closest(".acjm-floating-mic"))
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth);
  }

  function clampFloatingMicPosition(left, top, bar){
    const margin = 8;
    const rect = bar.getBoundingClientRect();
    const width = rect.width || 96;
    const height = rect.height || 112;
    return {
      left: Math.max(margin, Math.min(left, innerWidth - width - margin)),
      top: Math.max(margin, Math.min(top, innerHeight - height - margin)),
    };
  }

  function applyFloatingMicPosition(bar, left, top, persist = true){
    const pos = clampFloatingMicPosition(left, top, bar);
    bar.style.left = `${Math.round(pos.left)}px`;
    bar.style.top = `${Math.round(pos.top)}px`;
    bar.style.right = "auto";
    bar.style.bottom = "auto";
    if(persist) localStorage.setItem("acjm_floating_mic_position", JSON.stringify(pos));
  }

  function candidateFloatingMicPositions(bar){
    const rect = bar.getBoundingClientRect();
    const width = rect.width || 96;
    const height = rect.height || 112;
    const margin = 16;
    return [
      { left: innerWidth - width - 24, top: innerHeight - height - 86 },
      { left: innerWidth - width - 24, top: 96 },
      { left: 24, top: innerHeight - height - 86 },
      { left: 24, top: 96 },
      { left: innerWidth - width - 24, top: Math.max(96, innerHeight / 2 - height / 2) },
      { left: Math.max(margin, innerWidth / 2 - width / 2), top: innerHeight - height - 86 },
    ];
  }

  function floatingMicOverlapsBlockedArea(bar, left = null, top = null){
    const current = bar.getBoundingClientRect();
    const rect = left === null || top === null
      ? current
      : { left, top, right: left + current.width, bottom: top + current.height, width: current.width, height: current.height };
    return visibleBlockedRects(bar).some((blocked) => rectsOverlap(rect, blocked));
  }

  function ensureFloatingMicSafePosition(bar){
    if(!bar.classList.contains("visible")) return;
    if(!bar.style.left || !bar.style.top){
      const stored = localStorage.getItem("acjm_floating_mic_position");
      if(stored){
        try {
          const pos = JSON.parse(stored);
          if(Number.isFinite(pos.left) && Number.isFinite(pos.top)) applyFloatingMicPosition(bar, pos.left, pos.top, false);
        } catch {}
      }
    }
    const rect = bar.getBoundingClientRect();
    const clamped = clampFloatingMicPosition(rect.left, rect.top, bar);
    if(Math.abs(clamped.left - rect.left) > 1 || Math.abs(clamped.top - rect.top) > 1) {
      applyFloatingMicPosition(bar, clamped.left, clamped.top);
    }
    if(!floatingMicOverlapsBlockedArea(bar)) return;
    const current = bar.getBoundingClientRect();
    const best = candidateFloatingMicPositions(bar)
      .map((candidate) => clampFloatingMicPosition(candidate.left, candidate.top, bar))
      .filter((candidate) => !floatingMicOverlapsBlockedArea(bar, candidate.left, candidate.top))
      .sort((a, b) => ((a.left - current.left) ** 2 + (a.top - current.top) ** 2) - ((b.left - current.left) ** 2 + (b.top - current.top) ** 2))[0];
    if(best) applyFloatingMicPosition(bar, best.left, best.top);
  }

  function enableFloatingMicDrag(bar){
    let drag = null;
    bar.addEventListener("pointerdown", (event) => {
      if(event.target.closest("select,.acjm-mic-btn,.acjm-floating-mic-btnrow")) return;
      const rect = bar.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top,
        moved: false,
      };
      bar.setPointerCapture?.(event.pointerId);
    });
    bar.addEventListener("pointermove", (event) => {
      if(!drag || event.pointerId !== drag.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if(!drag.moved && distance < 7) return;
      drag.moved = true;
      event.preventDefault();
      applyFloatingMicPosition(bar, event.clientX - drag.dx, event.clientY - drag.dy, false);
    });
    const finish = (event) => {
      if(!drag || event.pointerId !== drag.pointerId) return;
      if(drag.moved){
        const rect = bar.getBoundingClientRect();
        applyFloatingMicPosition(bar, rect.left, rect.top);
        ensureFloatingMicSafePosition(bar);
      }
      bar.releasePointerCapture?.(event.pointerId);
      if(drag.moved){
        bar.dataset.acjmSuppressClick = "1";
        setTimeout(() => { delete bar.dataset.acjmSuppressClick; }, 250);
      }
      setTimeout(() => { drag = null; }, 0);
    };
    bar.addEventListener("pointerup", finish);
    bar.addEventListener("pointercancel", finish);
  }

  // ---------------- AI voice typing (AI4Bharat IndicConformer) ----------------
  // For Gujarati/Hindi, when the local AI voice service is running, the mic
  // records audio, cuts it at natural pauses and sends each phrase to
  // /api/asr/transcribe. English (not supported by IndicConformer) and any
  // failure fall back to the browser Speech API exactly as before.
  let aiAsrStatusCache = null;
  let aiAsrDisabledUntil = 0;

  function aiApiBase(){
    return (window.ACJM_API_BASE || (window.location.origin + "/api")).replace(/\/$/, "");
  }
  function aiAuthHeaders(){
    const token = localStorage.getItem("token");
    return token ? { Authorization: "Bearer " + token } : {};
  }
  function currentMicLang(){
    return getMicLangOverride() || currentDocumentLang() || "gu";
  }

  async function aiAsrAvailable(lang){
    if(!["gu","hi"].includes(lang)) return false;
    if(Date.now() < aiAsrDisabledUntil) return false;
    if(!navigator.mediaDevices?.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) return false;
    const now = Date.now();
    if(!aiAsrStatusCache || now - aiAsrStatusCache.ts > 30000){
      let data = null;
      try {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
        const res = await fetch(aiApiBase() + "/asr/status", { headers: aiAuthHeaders(), signal: ctrl?.signal });
        if(timer) clearTimeout(timer);
        data = res.ok ? await res.json() : null;
      } catch { data = null; }
      aiAsrStatusCache = { ts: now, data };
    }
    const data = aiAsrStatusCache.data;
    return Boolean(data && data.ready && Array.isArray(data.languages) && data.languages.includes(lang));
  }

  function aiDownsample(buffer, fromRate, toRate){
    if(fromRate === toRate) return buffer;
    const ratio = fromRate / toRate;
    const outLength = Math.floor(buffer.length / ratio);
    const out = new Float32Array(outLength);
    let pos = 0;
    for(let i = 0; i < outLength; i++){
      const start = Math.floor(i * ratio);
      const end = Math.min(buffer.length, Math.floor((i + 1) * ratio));
      let sum = 0, count = 0;
      for(let j = start; j < end; j++){ sum += buffer[j]; count++; }
      out[pos++] = count ? sum / count : 0;
    }
    return out;
  }

  function aiEncodeWav(samples, rate){
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => { for(let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeStr(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); writeStr(8, "WAVE");
    writeStr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeStr(36, "data"); view.setUint32(40, samples.length * 2, true);
    for(let i = 0; i < samples.length; i++){
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([view], { type: "audio/wav" });
  }

  async function aiTranscribe(blob, lang){
    const form = new FormData();
    form.append("audio", blob, "speech.wav");
    form.append("language", lang);
    const res = await fetch(aiApiBase() + "/asr/transcribe", { method: "POST", headers: aiAuthHeaders(), body: form });
    if(!res.ok){
      let detail = "";
      try { detail = (await res.json())?.detail || ""; } catch {}
      const err = new Error(detail || ("HTTP " + res.status));
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return String(data?.text || "").trim();
  }

  async function startAiVoice(el, btn, lang){
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      setVoiceStatus(btn, "stopped", voiceMessage("denied"));
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const source = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    try { ctx.resume(); } catch {}
    const rate = ctx.sampleRate;
    const MIN_SPEECH = rate * 0.35;      // ignore clicks shorter than this
    const END_SILENCE = rate * 0.75;     // a pause this long ends a phrase
    const MAX_PHRASE = rate * 15;        // never send more than 15 s at once
    let chunks = [], chunkSamples = 0, speaking = false, silence = 0, voiced = 0;
    let preroll = [];
    let noiseFloor = 0.004;
    let stopped = false;
    let pending = 0;
    let failures = 0;
    let chain = Promise.resolve();
    const listeningText = voiceMessage("listening") + " (AI)";

    const session = { el, ai: true, recognition: { stop: () => stop() } };

    function refreshStatus(){
      if(stopped) return;
      setVoiceStatus(btn, "listening", pending ? listeningText + " …" : listeningText);
      emitVoiceEngine("ai", "listening", listeningText);
    }

    function flush(){
      const parts = chunks, total = chunkSamples, hadVoice = voiced;
      chunks = []; chunkSamples = 0; voiced = 0;
      if(!total || hadVoice < MIN_SPEECH) return;
      const pcm = new Float32Array(total);
      let offset = 0;
      parts.forEach(p => { pcm.set(p, offset); offset += p.length; });
      const blob = aiEncodeWav(aiDownsample(pcm, rate, 16000), 16000);
      pending++;
      refreshStatus();
      const request = aiTranscribe(blob, lang);
      // Chain keeps phrases in spoken order even if replies arrive out of order.
      chain = chain.then(() => request).then(text => {
        failures = 0;
        if(!text) return;
        const target = currentVoiceTarget() || (document.body.contains(el) ? el : null);
        if(target) insertAtCursor(target, (targetTrailingSpaceNeeded(target) ? " " : "") + text);
      }).catch(err => {
        failures++;
        if(failures >= 2 && !stopped){
          aiAsrDisabledUntil = Date.now() + 5 * 60 * 1000;
          aiAsrStatusCache = null;
          stop(true);
          setVoiceStatus(btn, "stopped", "AI voice unavailable (" + (err?.message || "error") + "). Using browser voice.");
          startBrowserVoice(el, btn);
        }
      }).finally(() => { pending = Math.max(0, pending - 1); refreshStatus(); });
    }

    proc.onaudioprocess = (event) => {
      if(stopped) return;
      try { event.outputBuffer.getChannelData(0).fill(0); } catch {}
      const input = event.inputBuffer.getChannelData(0);
      const data = new Float32Array(input);
      let sum = 0;
      for(let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      const threshold = Math.max(0.012, noiseFloor * 3);
      const loud = rms > threshold;
      if(!speaking && !loud){
        noiseFloor = noiseFloor * 0.95 + rms * 0.05;
        preroll.push(data);
        if(preroll.length > 3) preroll.shift();
        return;
      }
      if(!speaking){
        speaking = true;
        chunks = preroll.slice();
        chunkSamples = chunks.reduce((n, c) => n + c.length, 0);
        preroll = [];
        silence = 0;
      }
      chunks.push(data);
      chunkSamples += data.length;
      if(loud){ voiced += data.length; silence = 0; } else { silence += data.length; }
      if(silence >= END_SILENCE || chunkSamples >= MAX_PHRASE){
        speaking = false;
        silence = 0;
        flush();
      }
    };

    function stop(silent){
      if(stopped) return;
      stopped = true;
      try { if(speaking) flush(); } catch {}
      try { proc.disconnect(); source.disconnect(); } catch {}
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
      try { ctx.close(); } catch {}
      if(activeVoice === session) activeVoice = null;
      if(!silent) setVoiceStatus(btn, "stopped", voiceMessage("stopped"));
    }

    source.connect(proc);
    proc.connect(ctx.destination);
    activeVoice = session;
    refreshStatus();
  }

  function enhanceVoice(){
    if(document.getElementById("acjm-floating-mic")) { updateFloatingMicVisibility(); return; }
    const bar = document.createElement("div");
    bar.className = "acjm-floating-mic";
    bar.id = "acjm-floating-mic";
    enableFloatingMicDrag(bar);

    const langRow = document.createElement("select");
    langRow.className = "acjm-mic-lang-select";
    langRow.title = "Mic language";
    [["gu","ગુજરાતી"],["hi","हिंदी"],["en","English"]].forEach(([code, label]) => {
      const opt = document.createElement("option");
      opt.value = code; opt.textContent = label;
      langRow.appendChild(opt);
    });
    langRow.value = getMicLangOverride() || currentDocumentLang() || "gu";
    langRow.addEventListener("mousedown", e => e.stopPropagation());
    langRow.addEventListener("change", () => setMicLangOverride(langRow.value));

    const btnRow = document.createElement("div");
    btnRow.className = "acjm-floating-mic-btnrow";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "acjm-mic-btn";
    updateMicButtonHint(btn, "stopped");
    btn.addEventListener("pointerdown", e => e.stopPropagation());
    btn.addEventListener("mousedown", e => e.preventDefault());
    const status = document.createElement("span");
    status.className = "acjm-voice-status";
    btn.addEventListener("click", () => {
      if(bar.dataset.acjmSuppressClick === "1") return;
      const el = currentVoiceTarget();
      if(!el){
        setVoiceStatus(btn, "stopped", currentDocumentLang() === "gu" ? "ટેક્સ્ટ ફીલ્ડમાં કર્સર મૂકો." : "Place cursor in a text field.");
        return;
      }
      toggleVoice(el, btn);
    });
    btnRow.append(btn, status);
    bar.append(langRow, btnRow);
    document.body.appendChild(bar);
    updateFloatingMicVisibility();
  }

  function toggleFloatingVoiceFromShortcut(){
    const bar = document.getElementById("acjm-floating-mic");
    const btn = bar?.querySelector(".acjm-mic-btn");
    const el = currentVoiceTarget();
    if(!bar || !btn || !el) return false;
    toggleVoice(el, btn);
    updateFloatingMicVisibility();
    return true;
  }

  function selectLabel(select){
    return select.selectedOptions?.[0]?.textContent || select.options?.[select.selectedIndex]?.textContent || "-- select --";
  }

  function shouldEnhanceSelect(select){
    if(select.dataset.acjmSearch === "1") return false;
    if(select.closest(".acjm-search-select")) return false;
    const id = select.getAttribute("data-testid") || select.id || "";
    return /case-select|case|draft-case-select|ffs-case-select/i.test(id) || select.options.length > 8;
  }

  function setSelectValue(select, value){
    select.value = value;
    select.dispatchEvent(new Event("input", {bubbles:true}));
    select.dispatchEvent(new Event("change", {bubbles:true}));
  }

  function enhanceSelects(){
    document.querySelectorAll("select").forEach(select => {
      if(!shouldEnhanceSelect(select)) return;
      select.dataset.acjmSearch = "1";
      const box = document.createElement("div");
      box.className = "acjm-search-select";
      const control = document.createElement("div");
      control.className = "acjm-search-control";
      const value = document.createElement("span");
      const arrow = document.createElement("span");
      arrow.className = "acjm-search-arrow";
      arrow.setAttribute("aria-hidden", "true");
      control.append(value, arrow);
      const panel = document.createElement("div");
      panel.className = "acjm-search-panel";
      const search = document.createElement("input");
      search.className = "acjm-search-input";
      search.placeholder = currentDocumentLang() === "gu" ? "શોધો..." : "Type to search...";
      const list = document.createElement("div");
      list.className = "acjm-search-options";
      panel.append(search, list);
      select.parentNode.insertBefore(box, select);
      box.append(control, panel, select);
      select.style.display = "none";

      const renderOptions = () => {
        value.textContent = selectLabel(select);
        const term = search.value.toLowerCase();
        list.innerHTML = "";
        Array.from(select.options).forEach(opt => {
          if(!opt.value) return;
          const label = opt.textContent || "";
          if(term && !label.toLowerCase().includes(term)) return;
          const item = document.createElement("div");
          item.className = "acjm-search-option";
          item.textContent = label;
          item.addEventListener("mousedown", e => e.preventDefault());
          item.addEventListener("click", () => {
            setSelectValue(select, opt.value);
            value.textContent = label;
            box.classList.remove("open");
          });
          list.appendChild(item);
        });
      };
      control.addEventListener("click", () => {
        document.querySelectorAll(".acjm-search-select.open").forEach(other => { if(other !== box) other.classList.remove("open"); });
        box.classList.toggle("open");
        search.value = "";
        renderOptions();
        setTimeout(() => search.focus(), 0);
      });
      search.addEventListener("input", renderOptions);
      search.addEventListener("keydown", e => {
        const items = Array.from(list.querySelectorAll(".acjm-search-option"));
        const current = items.findIndex(i => i.classList.contains("active"));
        if(e.key === "ArrowDown"){ e.preventDefault(); items.forEach(i => i.classList.remove("active")); (items[current+1] || items[0])?.classList.add("active"); }
        if(e.key === "ArrowUp"){ e.preventDefault(); items.forEach(i => i.classList.remove("active")); (items[current-1] || items[items.length-1])?.classList.add("active"); }
        if(e.key === "Enter"){ e.preventDefault(); (items[current] || items[0])?.click(); }
        if(e.key === "Escape") box.classList.remove("open");
      });
      select.addEventListener("change", () => { value.textContent = selectLabel(select); });
      renderOptions();
    });
  }

  function selectedMotherTongue(){
    const stored = localStorage.getItem(`acjm_mother_tongue:${location.pathname}`) || "";
    return MOTHER_TONGUES.some(l => l.code === stored) ? stored : "";
  }

  function motherTongueMeta(code){
    return MOTHER_TONGUES.find(l => l.code === code) || null;
  }

  function translationRequired(code){
    return Boolean(code && !["en", "gu"].includes(code));
  }

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }

  function guToDevanagari(text){
    return String(text || "").replace(/[\u0A81-\u0AFF]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x180));
  }

  function applyMarathiLegalPhrases(text){
    const replacements = [
      ["आ जणावेल आरोपी नुं फो. का. संहिता, १९७३ नी कलम ३१३ / बी. एन. एस. एस. २०२३ कलम ३५१ हेठळ नुं विशेष निवेदन (प्रश्न-उत्तर स्वरूप मां).", "वरील आरोपीचे फौजदारी प्रक्रिया संहिता, १९७३ चे कलम ३१३ / बी. एन. एस. एस., २०२३ चे कलम ३५१ अंतर्गत विशेष निवेदन (प्रश्न-उत्तर स्वरूपात)."],
      ["आ जणावेल आरोपी नुं", "वरील आरोपीचे"],
      ["फो. का. संहिता", "फौजदारी प्रक्रिया संहिता"],
      ["नी कलम", "चे कलम"],
      ["हेठळ नुं विशेष निवेदन", "अंतर्गत विशेष निवेदन"],
      ["प्रश्न-उत्तर स्वरूप मां", "प्रश्न-उत्तर स्वरूपात"],
      ["आरोपी नुं नाम", "आरोपीचे नाव"],
      ["आरोपी नुं सरनामुं", "आरोपीचा पत्ता"],
      ["आरोपी नुं सरनामु", "आरोपीचा पत्ता"],
      ["प्रश्न", "प्रश्न"],
      ["उत्तर", "उत्तर"],
      ["ता.", "दिनांक"],
      ["स्थळ", "ठिकाण"],
      ["अमदावाद शहर", "अहमदाबाद शहर"],
      ["अमदावाद", "अहमदाबाद"],
      ["वांचि संभळावी समझाव्यु", "वाचून दाखवून समजावले"],
      ["मारी रूबरू", "माझ्या समक्ष"],
      ["आरोपी पक्ष नी सही", "आरोपीची सही"],
      ["ओळख आपनार नी सही", "ओळख देणाऱ्याची सही"],
      ["शुं तमे ने फरीयाद अने बचाव माटे जरूरी दस्तावेजी नकलो मळी गयेल छे?", "तक्रार व बचावासाठी आवश्यक कागदपत्रांच्या प्रती तुम्हाला मिळाल्या आहेत का?"],
      ["तमे शुं कहेवा मांगो छो?", "तुम्हाला काय सांगायचे आहे?"],
      ["तमारो जवाब शुं छे?", "तुमचे उत्तर काय आहे?"],
      ["फरीयाद पक्ष तरफे", "तक्रारदार पक्षाकडून"],
      ["तमारा उपर आवो आरोप छे के", "तुमच्यावर असा आरोप आहे की"],
      ["हालना कामना", "सदर प्रकरणातील"],
      ["फरीयादी", "तक्रारदार"],
      ["फरीयाद", "तक्रार"],
      ["बचाव माटे", "बचावासाठी"],
      ["जरूरी दस्तावेजी नकलो", "आवश्यक कागदपत्रांच्या प्रती"],
      ["मळी गयेल छे", "मिळाल्या आहेत"],
      ["तमारा", "तुमच्या"],
      ["तमे", "तुम्ही"],
      ["शुं", "काय"],
      ["छे", "आहे"],
      ["नुं", "चे"],
      ["नी", "ची"],
      ["ना", "चे"],
      ["मां", "मध्ये"],
      ["माटे", "साठी"],
      ["तरफे", "कडून"],
      ["रूबरू", "समक्ष"]
    ];
    let next = String(text || "");
    replacements.forEach(([from, to]) => { next = next.split(from).join(to); });
    const regexReplacements = [
      [/इ\.\s*फो\.\s*के\.\s*न\.?/g, "ई.सी.सी. क्र."],
      [/आ\s+जणावेल\s+आरोपी\s+नुं\s+फो\.?\s*का\.?\s*संहिता,\s*१९७३\s+नी\s+कलम\s+३१३\s*\/\s*बी\.\s*एन\.\s*एस\.\s*एस\.?\s*२०२३\s+कलम\s+३५१\s+हेठळ\s+नुं\s+विशेष\s+निवेदन\s*\(प्रश्न-उत्तर\s+स्वरूप\s+मां\)\.?/g, "वरील आरोपीचे फौजदारी प्रक्रिया संहिता, १९७३ चे कलम ३१३ / बी. एन. एस. एस., २०२३ चे कलम ३५१ अंतर्गत विशेष निवेदन (प्रश्न-उत्तर स्वरूपात)."],
      [/आरोपी\s+नुं\s+नाव/g, "आरोपीचे नाव"],
      [/आरोपी\s+नु\s+सरना[^:ï¼š]*/g, "आरोपीचा पत्ता"],
      [/शुं\s+तमने\s+तमाम\s+प्रकरण\s+कागळो\s+प्राप्त\s+थई\s+गयेला\s+छे\?/g, "तुम्हाला सर्व प्रकरणातील कागदपत्रे प्राप्त झाली आहेत का?"],
      [/हालना\s+कामना\s+फरियाद\s+पक्ष\s+ना\s+साक्षी\s+ए\s+पोतानी\s+सोगंद\s+उपर\s+नी\s+सर\s+तपास\s+मां\s+एम\s+जणावेल\s+छे\s+के/g, "सदर प्रकरणात तक्रारदार पक्षाच्या साक्षीदाराने स्वतःच्या शपथेवरील मुख्य तपासात असे नमूद केले आहे की"],
      [/तमो\s+आरोपी\s+सामे\s+तेमनुं\s+कायदेसर\s+नुं\s+लेणुं\s*\/\s*दे\s+आवेल\s+होय/g, "तुमच्याकडून त्यांची कायदेशीर देणी येणे बाकी होती"],
      [/तमो\s+आरोपी\s+पक्ष\s+तरफ\s+थी\s+प्राप्त\s+थयेल\s+तकरारी\s+चेक\s*\/\s*ऑ/g, "तुमच्याकडून मिळालेला वादग्रस्त चेक"],
      [/ज्यारे\s+तेमणे\s+रक्कम\s+नी\s+वसूलात\s+माटे\s+रजू\s+करेल/g, "रकमेच्या वसुलीसाठी सादर केला असता"],
      [/त्यारे\s+आ\s+तकरारी\s+चेक\s*\/\s*ऑ\s+तमारा\s+बेन्क\s+द्वारा\s+सोगंदनावां\s+अने\s+रीटर्न\s+मेमो\s+मां\s+दर्शावेल\s+कारणोसर\s+परत\s+करवा\s+मां\s+आवेल/g, "तो चेक तुमच्या बँकेने शपथपत्र व रिटर्न मेमोमध्ये नमूद कारणास्तव परत केला"],
      [/जेथी\s+आवा\s+चेक\s+नी\s+रक्कम\s+नी\s+मांगणी\s+करती\s+कायदेसर\s+नी\s+नोटीस\s+फरियाद\s+पक्ष\s+ए\s+तमो\s+उपर\s+नियत\s+समय\s+मां\s+मोकली\s+आपवेल\s+होवा\s+छतां/g, "त्यानंतर चेकची रक्कम मागणी करणारी कायदेशीर नोटीस तक्रारदार पक्षाने तुम्हाला नियत वेळेत पाठवली असूनही"],
      [/तमो\s+आरोपी\s+नियत\s+समय\s+मर्यादामां\s+चेक\s+मां\s+दर्शवल\s+कूल\s+रक्कम\s+नी\s+फरियाद\s+पक्ष\s+ने\s+चुकवणी\s+करवा\s+मां\s+कसूर\s+करेल\s+छे/g, "तुम्ही नियत मुदतीत चेकमध्ये नमूद संपूर्ण रक्कम तक्रारदार पक्षास अदा करण्यात कसूर केली आहे"],
      [/ते\s+बाबते\s+तमारे\s+शुं\s+कहे\s+छे\?/g, "त्या बाबत तुम्हाला काय सांगायचे आहे?"],
      [/सोगंदनावां\s+जणावेल\s+तमाम\s+हकीकतो\s+खोटी\s+छे\.?/g, "शपथपत्रात नमूद सर्व हकीकती खोट्या आहेत."],
      [/नाव\.\s+सर्वोच्च\s+न्यायालय\s+ना/g, "मा. सर्वोच्च न्यायालयाच्या"],
      [/चुकादा\s+मुजब/g, "निर्णयानुसार"],
      [/तमो\s+हालना\s+कामे\s+तमारू\s+विशिष्ट\s+प्रकार\s+नं\s+बचाव\s+रजू\s+करवा\s+बंधायेल\s+होय/g, "सदर प्रकरणात तुम्ही तुमचा विशिष्ट बचाव मांडणे आवश्यक आहे"],
      [/तमारू\s+हालना\s+कामे\s+विशिष्ट\s+प्रकार\s+नुं\s+बचाव\s+शुं\s+रहेल\s+छे\?/g, "सदर प्रकरणात तुमचा विशिष्ट बचाव काय आहे?"],
      [/अमारा\s+द्वारा\s+आपवामां\s+आवेल\s+सिक्युरिटी\s+पेटे\s+ना\s+चेक\s+नुं\s+दुरुपयोग\s+करवामां\s+आवेल\s+छे\.?/g, "आमच्याकडून सुरक्षा म्हणून दिलेल्या चेकचा गैरवापर करण्यात आला आहे."],
      [/तमो\s+आरोपी\s+ने\s+पोताना\s+बचाव\s+मां\s+विशेष\s+मां\s+कांइ\s+कहे\s+छे\?/g, "तुम्हाला तुमच्या बचावाबाबत आणखी काही सांगायचे आहे का?"],
      [/अमे\s+वधाराना\s+साक्षी\s+तपासशुं\s+अने\s+आ\s+अंगे\s+उत्तर\s+आपशु\.?/g, "आम्ही अतिरिक्त साक्षीदार तपासू आणि याबाबत उत्तर देऊ."],
      [/वांची\s+संभळावता\s+ते\s+बराबर\s+अने\s+साचं\s+तथा\s+खरू\s+होवानुं\s+कबूले\s+छे\.?/g, "वाचून दाखविल्यावर ते बरोबर, सत्य व खरे असल्याचे मान्य केले."],
      [/आरोपी\s+पक्ष\s+नी\s+सही/g, "आरोपीची सही"],
      [/ओळख\s+आपनार\s+नी\s+सही/g, "ओळख देणाऱ्याची सही"],
      [/मारी\s+समक्ष/g, "माझ्या समक्ष"],
      [/प्रश्न\s*-\s*/g, "प्रश्न - "],
      [/उत्तर\s*-\s*/g, "उत्तर - "]
    ];
    regexReplacements.forEach(([from, to]) => { next = next.replace(from, to); });
    return next;
  }

  function applyMarathiTerms(text){
    const pairs = [
      ["ફરીયાદી", "तक्रारदार"], ["ફરિયાદી", "तक्रारदार"], ["આરોપી", "आरोपी"],
      ["નામ", "नाव"], ["ઉમર", "वय"], ["જાતિ", "जात"], ["ધંધો", "व्यवसाय"],
      ["સરનામું", "पत्ता"], ["સરનામુ", "पत्ता"], ["તારીખ", "दिनांक"],
      ["પ્રશ્ન", "प्रश्न"], ["જવાબ", "उत्तर"], ["અદાલત", "न्यायालय"],
      ["કોર્ટ", "न्यायालय"], ["હાજર", "हजर"], ["જામીન", "जामीन"],
      ["સહી", "सही"], ["રકમ", "रक्कम"], ["કેસ", "प्रकरण"], ["કલમ", "कलम"]
    ];
    let next = String(text || "");
    pairs.forEach(([from, to]) => { next = next.split(from).join(to); });
    next = guToDevanagari(next);
    next = applyMarathiLegalPhrases(next);
    const englishPairs = [
      [/\bCourt\b/g, "न्यायालय"], [/\bCase\b/g, "प्रकरण"], [/\bComplainant\b/g, "तक्रारदार"],
      [/\bAccused\b/g, "आरोपी"], [/\bQuestion\b/g, "प्रश्न"], [/\bAnswer\b/g, "उत्तर"],
      [/\bDate\b/g, "दिनांक"], [/\bName\b/g, "नाव"], [/\bSignature\b/g, "सही"],
      [/\bFurther Statement\b/g, "पुढील निवेदन"], [/\bPlea\b/g, "कबुलीजबाब"]
    ];
    englishPairs.forEach(([from, to]) => { next = next.replace(from, to); });
    return next;
  }

  function translateText(text, code){
    if(window.ACJM_TRANSLATION_ENGINE?.translateText && window.ACJM_TRANSLATION_ENGINE.isSupported(code)) {
      return window.ACJM_TRANSLATION_ENGINE.translateText(text, code, {formType:"review", fieldType:"line"});
    }
    if(code === "mr") return applyMarathiTerms(text);
    return text;
  }

  function hasAutomaticLegalTranslation(code){
    return Boolean(window.ACJM_TRANSLATION_ENGINE?.isSupported?.(code)) || code === "mr";
  }

  function printableLines(doc, code){
    const clone = doc.cloneNode(true);
    clone.querySelectorAll("[data-mother-tongue-copy='1'],.no-print,button").forEach(node => node.remove());
    const lines = [];
    clone.querySelectorAll("tr").forEach(row => {
      const rowText = Array.from(row.cells || []).map(cell => cell.innerText.trim()).filter(Boolean).join(" ");
      if(rowText) lines.push(rowText);
      row.remove();
    });
    clone.querySelectorAll(".case-line,.court-head,h1,h2,h3,p,li,.signature-row div,div").forEach(node => {
      if(node.querySelector("table,tr")) return;
      const text = (node.innerText || "").trim();
      if(text && !lines.includes(text)) lines.push(text);
    });
    if(!lines.length) lines.push(...(clone.innerText || "").split(/\n+/));
    return lines
      .map(line => translateText(line.trim(), code))
      .filter(Boolean);
  }

  function legalReviewAnnexHtml(code, meta, sourceLanguage){
    return "";
  }

  function translationAnnexHtml(doc, code){
    const meta = motherTongueMeta(code);
    if(!meta || !translationRequired(code)) return "";
    const sourceLanguage = pageLang() === "gu" ? "Gujarati" : "English";
    if(window.ACJM_TRANSLATION_ENGINE?.annexHtml && window.ACJM_TRANSLATION_ENGINE.isSupported(code)){
      return window.ACJM_TRANSLATION_ENGINE.annexHtml(doc, code, {sourceLanguage, className:"acjm-translation-copy", formType:location.pathname});
    }
    if(!hasAutomaticLegalTranslation(code)) return "";
    const title = code === "mr" ? "मराठी अनुवादित प्रत" : `Additional Translated Copy - ${escapeHtml(meta.name)}`;
    const lines = printableLines(doc, code);
    const motherLabel = code === "mr" ? "निवडलेली मातृभाषा" : "Mother tongue selected";
    const scriptLabel = code === "mr" ? "लिपी" : "Script";
    const sourceLabel = code === "mr" ? "मूळ न्यायालयीन प्रतीची भाषा" : "Original court copy language";
    const sourceName = code === "mr" && sourceLanguage === "Gujarati" ? "गुजराती" : sourceLanguage;
    return `
      <div class="acjm-translation-copy" data-mother-tongue-copy="1">
        <h2>${title}</h2>
        <p><strong>${motherLabel}:</strong> ${escapeHtml(meta.name)}</p>
        <p><strong>${scriptLabel}:</strong> ${escapeHtml(meta.script)}</p>
        <p><strong>${sourceLabel}:</strong> ${escapeHtml(sourceName)}</p>
        <div class="translation-box">
          ${lines.map(line => `<p class="translated-line">${escapeHtml(line)}</p>`).join("")}
        </div>
      </div>`;
  }

  function motherTongueOptionsHtml(){
    return `<option value="">Select mother tongue</option>${MOTHER_TONGUES.map(l => `<option value="${l.code}">${l.name} - ${l.script}</option>`).join("")}`;
  }

  function updateTranslationAnnex(doc, code){
    const nextKey = translationRequired(code) ? code : "none";
    if(doc.getAttribute("data-acjm-mother-tongue-annex") === nextKey) return;
    doc.querySelectorAll("[data-mother-tongue-copy='1']").forEach(node => node.remove());
    if(translationRequired(code)) doc.insertAdjacentHTML("beforeend", translationAnnexHtml(doc, code));
    doc.setAttribute("data-acjm-mother-tongue-annex", nextKey);
  }

  function isSignatureOrOfficerText(text){
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if(!value) return true;
      return /^(Place|Date|Dt\.?|સ્થળ|સ્થાન|તારીખ|તા\.?)\b/i.test(value) || /Signature|Advocate|Judicial Officer|Before Me|with Designation|ACJM|A\.?\s*C\.?\s*J\.?\s*M|N\.?\s*A\.?\s*Kulkarni|સહી|હસ્તાક્ષર|મારી રૂબરૂ|વકીલ|કુલકર્ણી|એ\.?\s*સી\.?\s*જે\.?\s*એમ/i.test(value);
  }

  function documentTranslationLines(root){
    const clone = root.cloneNode(true);
    clone.querySelectorAll("[data-mother-tongue-copy='1'],[data-translation-annex='1'],.no-print,button,.signature-row,.signature-line").forEach(node => node.remove());
    const lines = [];
    const addLine = text => {
      const value = String(text || "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
      if(value && !isSignatureOrOfficerText(value) && !lines.includes(value)) lines.push(value);
    };
    const blockSelector = "h1,h2,h3,p,li,tr,div,.case-row,.case-line,.court-head,.court-title,.question,.answer";
    clone.querySelectorAll(blockSelector).forEach(node => {
      if(node.matches?.("[data-mother-tongue-copy='1'],[data-translation-annex='1'],.no-print,button,.signature-row,.signature-line")) return;
      if(node.tagName !== "TR" && Array.from(node.children || []).some(child => child.matches?.(blockSelector) && (child.innerText || child.textContent || "").trim())) return;
      if(node.tagName === "TR"){
        addLine(Array.from(node.cells || []).map(cell => cell.innerText || "").join(" "));
      } else {
        addLine(node.innerText || node.textContent || "");
      }
    });
    if(lines.length) return lines;
    return (clone.innerText || "").split(/\n+/).map(line => line.trim()).filter(line => line && !isSignatureOrOfficerText(line));
  }

  function finalCourtCopyText(doc){
    return documentTranslationLines(doc).join("\n\n");
  }

  function protectedRuntimeValues(doc){
    const values = [];
    const add = value => {
      const text = String(value || "").trim();
      if(text && text.length > 1 && !values.includes(text)) values.push(text);
    };
    doc.querySelectorAll(".case-line,.court-head,.court-title").forEach(node => add(node.innerText));
    const text = doc.innerText || "";
    (text.match(/\beCC\/No\.\/[^\s,;]+/gi) || []).forEach(add);
    (text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/g) || []).forEach(add);
    (text.match(/\b(?:Section|Sec\.?|કલમ|ધારા)\s*[\dA-Za-z()./-]+/gi) || []).forEach(add);
    return values.sort((a,b) => b.length - a.length);
  }

  function protectWholeDocument(text, doc){
    const values = [];
    let out = String(text || "");
    const addToken = match => {
      const token = `__ACJM_PROTECTED_${values.length}__`;
      values.push(match);
      return token;
    };
    protectedRuntimeValues(doc).forEach(value => { out = out.split(value).join(addToken(value)); });
    [
      /\beCC\/No\.\/[^\s,;]+/gi,
      /\b[A-Z]{1,6}[A-Z./-]*\s*\d+\/\d{4}\b/g,
      /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/g,
      /\b(?:Section|Sec\.?|કલમ|ધારા)\s*[\dA-Za-z()./-]+/gi,
      /\b(?:Rs\.?|રૂ\.?)\s*[\d,]+(?:\/-)?/gi,
      /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g,
      /\bAIJEL-?SC\s*\d+\b/gi
    ].forEach(pattern => { out = out.replace(pattern, addToken); });
    return {text:out, values};
  }

  function restoreWholeDocument(text, values){
    return stripProtectionArtifacts(String(text || "")
      .replace(/_*\s*(?:ACJM|एसीजेएम|ए\.?\s*सी\.?\s*जे\.?\s*एम\.?)[\s_]*(?:PROTECTED|TECTED|संरक्षित|सुरक्षित|સંરક્ષિત|ਸੁਰੱਖਿਅਤ|সুরক্ষিত|সুরক্ষিত|ସୁରକ୍ଷିତ|பாதுகாக்கப்பட்டது|సంరక్షిత|ಸಂರಕ್ಷಿತ|സംരക്ഷിത)[\s_]*(\d+)\s*_*/giu, (_, i) => values[Number(i)] || "\n\n")
      .replace(/_+\s*ACJM\s*_+\s*PROTECTED\s*_+\s*(\d+)\s*_*/gi, (_, i) => values[Number(i)] || "")
      .replace(/\bACJM\s*PROTECTED\s*(\d+)\b/gi, (_, i) => values[Number(i)] || "")
      .replace(/_*\s*(?:ACJM\s*_*)?(?:PROTECTED|TECTED)\s*_*(\d+)\s*_*/gi, (_, i) => values[Number(i)] || "\n\n"));
  }

  function stripProtectionArtifacts(text){
    return String(text || "")
      .replace(/_*\s*(?:ACJM|एसीजेएम|ए\.?\s*सी\.?\s*जे\.?\s*एम\.?)[\s_]*(?:PROTECTED|TECTED|संरक्षित|सुरक्षित|સંરક્ષિત|ਸੁਰੱਖਿਅਤ|সুরক্ষিত|সুরক্ষিত|ସୁରକ୍ଷିତ|பாதுகாக்கப்பட்டது|సంరక్షిత|ಸಂರಕ್ಷಿತ|സംരക്ഷിത)[\s_]*\d+\s*_*/giu, "\n\n")
      .replace(/_*\s*(?:ACJM\s*_*)?(?:PROTECTED|TECTED)\s*_*\d+\s*_*/gi, "\n\n")
      .replace(/_+\s*(?:વર|वर|वर्|ू|U\.?V\.?A\.?\s*[:-]?)\s*_+/giu, "\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function translationCacheKey(source, target){
    let hash = 0;
    const key = `${location.pathname}\n${target}\n${source}`;
    for(let i=0;i<key.length;i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    return `acjm_final_review_translation_v4:${target}:${Math.abs(hash)}`;
  }

  async function translateFinalCourtCopy(doc, target){
    const source = finalCourtCopyText(doc);
    const cacheKey = translationCacheKey(source, target);
    const cached = localStorage.getItem(cacheKey);
    if(cached) return cached;
    const protectedText = protectWholeDocument(source, doc);
    const apiTarget = target === "mni" ? "mni-Mtei" : target;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(pageLang())}&tl=${encodeURIComponent(apiTarget)}&dt=t&q=${encodeURIComponent(protectedText.text)}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error("Translation service is not reachable.");
    const data = await res.json();
    const translated = restoreWholeDocument((data?.[0] || []).map(part => part?.[0] || "").join(""), protectedText.values);
    localStorage.setItem(cacheKey, translated);
    return translated;
  }

  function containsGujarati(text){ return /[\u0A80-\u0AFF]/.test(text || ""); }
  function stripAllowedGujarati(text, doc){
    let out = String(text || "");
    ["અમદાવાદ","અમદાવાદ શહેર","ગુજરાત","વડોદરા"].forEach(value => { out = out.split(value).join(""); });
    return out;
  }

  function wholeDocumentAnnexHtml(meta, translated, warning){
    const lines = String(translated || "").split(/\n+/).map(line => line.trim()).filter(Boolean);
    return `<div class="acjm-translation-copy" data-mother-tongue-copy="1" data-translation-annex="1">
      <h2>${escapeHtml(meta.name)} Translated Copy</h2>
      <p><strong>Disclaimer:</strong> This translated copy is generated for convenience only. In case of any inconsistency, the original Court Copy shall prevail.</p>
      ${warning ? `<p class="error"><strong>Warning:</strong> ${escapeHtml(warning)}</p>` : ""}
      <div class="translation-box">${lines.map(line => `<p class="translated-line">${escapeHtml(line)}</p>`).join("")}</div>
    </div>`;
  }

  function showMotherTonguePopup(doc){
    if(motherTonguePromptOpen || doc.getAttribute("data-acjm-mother-tongue-prompted") === "1" || document.getElementById("acjm-mother-modal-backdrop")) return;
    motherTonguePromptOpen = true;
    doc.setAttribute("data-acjm-mother-tongue-prompted", "1");
    const backdrop = document.createElement("div");
    backdrop.className = "acjm-mother-modal-backdrop";
    backdrop.id = "acjm-mother-modal-backdrop";
    backdrop.innerHTML = `
      <div class="acjm-mother-modal" role="dialog" aria-modal="true" aria-labelledby="acjm-mother-title">
        <h2 id="acjm-mother-title">Select Mother Tongue</h2>
        <p class="hint">Please select the mother tongue language. If English or Gujarati is selected, no additional translated copy will be annexed.</p>
        <select id="acjm-mother-modal-select">${motherTongueOptionsHtml()}</select>
        <div class="error" id="acjm-mother-modal-error"></div>
        <div class="actions"><button type="button" class="btn btn-primary" id="acjm-mother-modal-continue">Continue</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    const select = backdrop.querySelector("#acjm-mother-modal-select");
    select.value = selectedMotherTongue();
    select.focus();
    backdrop.querySelector("#acjm-mother-modal-continue").addEventListener("click", () => {
      if(!select.value){
        backdrop.querySelector("#acjm-mother-modal-error").textContent = "Please select mother tongue language.";
        return;
      }
      localStorage.setItem(`acjm_mother_tongue:${location.pathname}`, select.value);
      motherTonguePromptOpen = false;
      updateTranslationAnnex(doc, select.value);
      backdrop.remove();
    });
  }

  function enhanceMotherTongueSelection(){
    if(!/^\/advocate\/(plea|primary-fs|final-fs)\/review\//.test(location.pathname)) return;
    if(motherTonguePromptPath !== location.pathname){
      motherTonguePromptPath = location.pathname;
      motherTonguePromptOpen = false;
    }
    const doc = document.querySelector(".print-doc");
    if(!doc) return;
    if(document.getElementById("acjm-translate-panel")) return;
    const panel = document.createElement("div");
    panel.id = "acjm-translate-panel";
    panel.className = "acjm-mother-tongue-panel no-print";
    panel.innerHTML = `<button type="button" class="btn btn-outline" id="acjm-generate-translated-copy">Generate Translated Copy</button><span class="hint" id="acjm-translation-status">First verify the Court Copy. Translation is appended only after this button is used.</span>`;
    doc.parentNode.insertBefore(panel, doc);
    panel.querySelector("#acjm-generate-translated-copy").addEventListener("click", () => showTranslationTargetPopup(doc));
  }

  function showTranslationTargetPopup(doc, onDone){
    document.querySelectorAll(".acjm-mother-modal-backdrop").forEach(n => n.remove());
    const backdrop = document.createElement("div");
    backdrop.className = "acjm-mother-modal-backdrop";
    backdrop.innerHTML = `<div class="acjm-mother-modal" role="dialog" aria-modal="true">
      <h2>Generate Translated Copy</h2>
      <p class="hint">Select the target language. The finalized Court Copy preview will be translated as one document and appended after the Court Copy.</p>
      <select id="acjm-translation-target"><option value="">Select target language</option>${MOTHER_TONGUES.filter(l => !["gu","en"].includes(l.code)).map(l => `<option value="${l.code}">${l.name} - ${l.script}</option>`).join("")}</select>
      <div class="error" id="acjm-translation-target-error"></div>
      <div class="actions"><button type="button" class="btn btn-secondary" id="acjm-translation-cancel">Cancel</button><button type="button" class="btn btn-primary" id="acjm-translation-continue">Translate</button></div>
    </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector("#acjm-translation-cancel").addEventListener("click", () => backdrop.remove());
    backdrop.querySelector("#acjm-translation-continue").addEventListener("click", async () => {
      const code = backdrop.querySelector("#acjm-translation-target").value;
      if(!code){ backdrop.querySelector("#acjm-translation-target-error").textContent = "Please select target language."; return; }
      const meta = motherTongueMeta(code);
      backdrop.remove();
      await generateReviewTranslatedCopy(doc, meta);
      if(typeof onDone === "function" && doc.querySelector("[data-translation-annex='1']")) onDone();
    });
  }

  async function generateReviewTranslatedCopy(doc, meta){
    const status = document.getElementById("acjm-translation-status");
    if(status) status.textContent = "Translating finalized Court Copy...";
    doc.querySelectorAll("[data-mother-tongue-copy='1'],[data-translation-annex='1']").forEach(node => node.remove());
    try {
      const translated = await translateFinalCourtCopy(doc, meta.code);
      const warning = meta.code !== "gu" && containsGujarati(stripAllowedGujarati(translated, doc)) ? "Gujarati script remains in the translated copy. Please review and manually correct before using the PDF." : "";
      doc.insertAdjacentHTML("beforeend", wholeDocumentAnnexHtml(meta, translated, warning));
      if(status) status.textContent = warning || "Translated copy appended below the Court Copy.";
    } catch (err) {
      if(status) status.textContent = err.message || "Unable to generate translated copy.";
    }
  }

  const translationPrintAllowed = new WeakSet();

  function showPrintTranslationChoice(doc, button){
    document.querySelectorAll(".acjm-mother-modal-backdrop").forEach(n => n.remove());
    const backdrop = document.createElement("div");
    backdrop.className = "acjm-mother-modal-backdrop";
    backdrop.innerHTML = `<div class="acjm-mother-modal" role="dialog" aria-modal="true">
      <h2>Translation Option</h2>
      <p class="hint">If required, you can generate a translated copy of these details in your mother tongue or a language known to you before printing.</p>
      <div class="actions"><button type="button" class="btn btn-secondary" id="acjm-print-without-translation">Proceed Without Translation</button><button type="button" class="btn btn-primary" id="acjm-print-select-translation">Select Translation</button></div>
    </div>`;
    document.body.appendChild(backdrop);
    const continuePrint = () => {
      translationPrintAllowed.add(button);
      button.click();
    };
    backdrop.querySelector("#acjm-print-without-translation").addEventListener("click", () => {
      backdrop.remove();
      continuePrint();
    });
    backdrop.querySelector("#acjm-print-select-translation").addEventListener("click", () => {
      backdrop.remove();
      showTranslationTargetPopup(doc, continuePrint);
    });
  }

  function enhanceAdminTranslationTile(){
    document.querySelector("[data-testid='tile-translation-management']")?.remove();
  }

  function run(){
    installStyles();
    enhanceVoice();
    enhanceSelects();
    enhanceMotherTongueSelection();
    enhanceAdminTranslationTile();
  }

  document.addEventListener("focusin", e => {
    if(shouldAddMic(e.target)){
      lastVoiceTarget = e.target;
      if(activeVoice?.el) activeVoice.el = e.target;
    }
    updateFloatingMicVisibility();
  });
  document.addEventListener("pointerdown", e => {
    if(shouldAddMic(e.target)){
      lastVoiceTarget = e.target;
      if(activeVoice?.el) activeVoice.el = e.target;
    }
  }, true);
  document.addEventListener("focusout", () => setTimeout(updateFloatingMicVisibility, 0));
  document.addEventListener("click", e => {
    if(!e.target.closest(".acjm-search-select")) document.querySelectorAll(".acjm-search-select.open").forEach(box => box.classList.remove("open"));
  });
  document.addEventListener("click", e => {
    const backButton = e.target.closest("[data-testid='back-btn']");
    const sanjabiMatch = location.pathname.match(/^\/advocate\/plea\/sanjabi\/(gu|en)\/([^/]+)/);
    if(backButton && sanjabiMatch){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      location.href = `/advocate/plea/form/${sanjabiMatch[1]}/${sanjabiMatch[2]}`;
      return;
    }
    const nav = e.target.closest("a,button");
    if(!nav) return;
    if(nav.closest(".acjm-floating-mic") || nav.classList.contains("acjm-mic-btn")) return;
    stopActiveVoice();
  }, true);
  document.addEventListener("keydown", e => {
    if(e.key === "Escape" && activeVoice){
      stopActiveVoice();
      return;
    }
    if(e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m"){
      if(toggleFloatingVoiceFromShortcut()){
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);
  window.addEventListener("pagehide", stopActiveVoice);
  window.addEventListener("beforeunload", stopActiveVoice);
  window.addEventListener("popstate", stopActiveVoice);
  window.addEventListener("hashchange", stopActiveVoice);
  document.addEventListener("visibilitychange", () => { if(document.hidden) stopActiveVoice(); });
  document.addEventListener("click", e => {
    const button = e.target.closest("[data-testid='plea-print-btn'],[data-testid='pfs-print'],[data-testid='ffs-print']");
    if(!button) return;
    const doc = document.querySelector(".print-doc");
    if(!doc || doc.querySelector("[data-translation-annex='1']")) return;
    if(translationPrintAllowed.has(button)){
      translationPrintAllowed.delete(button);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    showPrintTranslationChoice(doc, button);
  }, true);
  const observer = new MutationObserver(() => run());
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { run(); observer.observe(document.body, {childList:true, subtree:true}); });
  else { run(); observer.observe(document.body, {childList:true, subtree:true}); }
})();
