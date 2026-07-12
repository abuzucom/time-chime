/**
 * The single source of truth for "what time is it right now" across the entire app.
 * Every clock face, every chime scheduler, every timestamp UI reads from here so
 * that a device clock skew doesn't propagate into user-visible time.
 */
let currentOffsetMs = 0;

// Hard cap on the applied offset. Network reference skew is normally milliseconds to
// seconds; anything past a day is almost certainly a bad sample and would
// poison every downstream time-to-chime calculation.
const MAX_OFFSET_MS = 24 * 60 * 60 * 1000;

/**
 * Store the network-reference correction. Non-finite or absurd values are
 * rejected so downstream math (chime scheduling, `%`, `setTimeout` delays)
 * never sees NaN or Infinity.
 * @param offsetMs Milliseconds to add to the device clock to obtain true UTC.
 */
export function setAuthoritativeOffset(offsetMs: number): void {
  if (typeof offsetMs !== "number" || !Number.isFinite(offsetMs)) return;
  if (Math.abs(offsetMs) > MAX_OFFSET_MS) return;
  currentOffsetMs = offsetMs;
}

/**
 * Read the currently applied clock correction (for UI/debug).
 * @returns The offset in ms; 0 before the first successful sync.
 */
export function getAuthoritativeOffset(): number {
  return currentOffsetMs;
}

/**
 * Corrected wall-clock time in Unix milliseconds. Always returns a finite
 * number; falls back to raw `Date.now()` if the stored offset was somehow
 * corrupted (shouldn't happen — {@link setAuthoritativeOffset} filters — but
 * this keeps every downstream `% 1000`, division, and `setTimeout` safe).
 */
export function authoritativeNow(): number {
  const raw = Date.now() + currentOffsetMs;
  return Number.isFinite(raw) ? raw : Date.now();
}
