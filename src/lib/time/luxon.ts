/**
 * Centralized Luxon entry point.
 *
 * Rest of the codebase should format dates through these helpers so we
 * keep formatting consistent and can adjust the underlying library in
 * one place.
 */
import { DateTime } from "luxon";

export { DateTime };

/**
 * Format a millisecond timestamp as an ISO-8601-style local timestamp:
 *   `YYYY-MM-DD HH:MM:SS UTC±HH:MM`
 * Uses `UTC` (not `GMT`) as the offset prefix to match the rest of the app.
 */
export function formatIsoLocal(ms: number, zone: string): string {
  return DateTime.fromMillis(ms, { zone }).toFormat("yyyy-LL-dd HH:mm:ss 'UTC'ZZ");
}

/**
 * Format a millisecond timestamp as an ISO-8601 UTC timestamp:
 *   `YYYY-MM-DD HH:MM:SS UTC`
 */
export function formatIsoUtcLuxon(ms: number): string {
  return DateTime.fromMillis(ms, { zone: "utc" }).toFormat("yyyy-LL-dd HH:mm:ss 'UTC'");
}

/**
 * Format a millisecond timestamp as a natural language date in the user's
 * locale and the supplied IANA zone, e.g. `Wednesday, July 1, 2026`.
 */
export function formatNaturalLocalDate(ms: number, zone: string, locale?: string): string {
  const resolved =
    locale ??
    (typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US");
  return DateTime.fromMillis(ms, { zone }).setLocale(resolved).toLocaleString({
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
