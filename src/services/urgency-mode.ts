/**
 * Urgency mode — sets `body.urgency-mode` when alerts spike or a hotspot
 * crosses a critical escalation threshold.  Auto-clears after DURATION_MS.
 */

const DURATION_MS = 5 * 60 * 1000; // 5 minutes
let clearTimeout_: ReturnType<typeof setTimeout> | null = null;
let activeReasons: Set<string> = new Set();

export function triggerUrgencyMode(reason: string): void {
  activeReasons.add(reason);
  document.body.classList.add('urgency-mode');

  if (clearTimeout_ !== null) clearTimeout(clearTimeout_);
  clearTimeout_ = setTimeout(() => {
    activeReasons.delete(reason);
    if (activeReasons.size === 0) document.body.classList.remove('urgency-mode');
    clearTimeout_ = null;
  }, DURATION_MS);
}

export function clearUrgencyMode(): void {
  activeReasons.clear();
  if (clearTimeout_ !== null) { clearTimeout(clearTimeout_); clearTimeout_ = null; }
  document.body.classList.remove('urgency-mode');
}
