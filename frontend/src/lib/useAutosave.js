import { useEffect, useRef, useState } from "react";

/**
 * useAutosave — periodically calls `saveFn` (expected to return a Promise)
 * on a fixed interval, independent of user activity/pauses. This is a
 * safety net against data loss from power cuts or crashes during long,
 * uninterrupted typing/dictation sessions, where a "save 1s after the user
 * stops typing" debounce would otherwise never actually fire.
 *
 * - `saveFn` is called via a ref internally, so the interval always calls
 *   the LATEST version of the function (no stale-closure bugs from
 *   dependencies changing between renders).
 * - `enabled` lets a page skip saving until there's actually something
 *   worth saving (e.g. before a record has been created yet).
 * - Failures are swallowed silently (best-effort); the next tick tries
 *   again automatically.
 *
 * Usage:
 *   useAutosave(() => api.put(`/pleas/${id}`, pleaState), [pleaState], { enabled: !!id });
 */
export function useAutosave(saveFn, deps = [], options = {}) {
  const { intervalMs = 1000, enabled = true } = options;
  const savingRef = useRef(false);
  const fnRef = useRef(saveFn);
  fnRef.current = saveFn;

  const attemptSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try { await fnRef.current(); }
    catch (e) { /* best-effort — next tick will retry with the latest data */ }
    finally { savingRef.current = false; }
  };

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(attemptSave, intervalMs);
    // Browsers throttle setInterval heavily in background/hidden tabs
    // (sometimes to once a minute) — relying on the interval alone means a
    // tab that was switched away from, minimized, or closed shortly after
    // could lose far more than intervalMs worth of typing. Forcing an
    // immediate save on these events closes that gap.
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") attemptSave(); };
    const onPageHide = () => { attemptSave(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);
}

/**
 * useDraftRecovery — crash-recovery for forms that only save to the server
 * on an explicit Submit (Plea, Primary FS, Final FS, etc). This is
 * deliberately NOT the same thing as useAutosave: nothing here ever writes
 * to the server. It only keeps a local draft (browser storage, which
 * survives a crash/power-cut) alongside whatever is officially saved, and
 * surfaces it via an explicit prompt — like Chrome's "Restore pages?" —
 * rather than silently applying it. The official record is only ever
 * changed by the user's own explicit Submit action.
 *
 * Usage:
 *   const { draft, dismissDraft, clearDraft } = useDraftRecovery(`plea_draft_${pleaId||"new"}`, formState, { enabled });
 *   // draft === null once there's nothing to offer, or { data, savedAt } if there is
 *   // show your own "Restore unsaved work from {savedAt}?" prompt using `draft`
 *   // call clearDraft() once the user explicitly Submits/Completes/Adjourns
 */
export function useDraftRecovery(key, currentData, options = {}) {
  const { enabled = true, intervalMs = 1000 } = options;
  const [draft, setDraft] = useState(null);
  const dataRef = useRef(currentData);
  dataRef.current = currentData;
  const checkedRef = useRef(false);

  // On mount, check once for a pre-existing draft (from before a
  // crash/reload) and surface it — but never auto-apply it.
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data) setDraft(parsed);
      }
    } catch (e) { /* ignore corrupt/missing draft */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Continuously persist the current in-progress data as a draft (never as
  // the official record) so it survives a crash before Submit is pressed.
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ data: dataRef.current, savedAt: new Date().toISOString() }));
      } catch (e) { /* storage full/unavailable — non-fatal */ }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [key, enabled, intervalMs]);

  const clearDraft = () => {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    setDraft(null);
  };
  const dismissDraft = () => setDraft(null); // hide the prompt without deleting (in case they change their mind before Submit)

  return { draft, clearDraft, dismissDraft };
}

export default useAutosave;
