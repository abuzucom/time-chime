/**
 * Human-friendly offset formatting. Positive = device is behind reference,
 * i.e. we need to add this many ms to Date.now() to get the true time.
 */
export function formatOffset(ms: number): string {
  const abs = Math.abs(ms);
  const sign = ms >= 0 ? "+" : "−";
  if (abs < 1) return `${sign}${(abs * 1000).toFixed(0)} µs`;
  if (abs < 1000) return `${sign}${abs.toFixed(0)} ms`;
  if (abs < 60_000) return `${sign}${(abs / 1000).toFixed(2)} s`;
  return `${sign}${(abs / 60_000).toFixed(2)} min`;
}

/**
 * Bucket a signed clock offset (in milliseconds) into a UI severity label.
 * @param ms Signed offset between device time and authoritative time.
 * @returns `"ok"` for |offset| < 100 ms, `"warn"` for < 2 s, otherwise `"bad"`.
 */
export function driftSeverity(ms: number): "ok" | "warn" | "bad" {
  const abs = Math.abs(ms);
  if (abs < 100) return "ok";
  if (abs < 2000) return "warn";
  return "bad";
}

/**
 * Format a past timestamp as a compact "time since" string.
 * @param ms  Timestamp of the past event (Unix ms).
 * @param now Reference "now" timestamp (Unix ms).
 * @returns e.g. `"just now"`, `"42s ago"`, `"3m ago"`, `"2h ago"`.
 */
export function formatRelative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

/** ISO day-of-year (1–366). */
export function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const now = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((now - start) / 86_400_000);
}

/** ISO 8601 week number (1–53). */
export function isoWeek(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Julian date (astronomical, UT). */
export function julianDate(ms: number): number {
  return ms / 86_400_000 + 2440587.5;
}

/**
 * Render a `Date` as a fixed-width UTC timestamp for display.
 * @param d Date to format (any timezone; only UTC fields are read).
 * @returns `"YYYY-MM-DD HH:MM:SS UTC"`.
 */
export function formatIsoUtc(d: Date): string {
  const zeroPad = (n: number, width = 2) => n.toString().padStart(width, "0");
  return (
    `${d.getUTCFullYear()}-${zeroPad(d.getUTCMonth() + 1)}-${zeroPad(d.getUTCDate())} ` +
    `${zeroPad(d.getUTCHours())}:${zeroPad(d.getUTCMinutes())}:${zeroPad(d.getUTCSeconds())} UTC`
  );
}
