/**
 * Optional telemetry forwarder for React error boundaries and top-level
 * catches. Portable by design: if the host page (or a self-hosted analytics
 * snippet) exposes `window.__errorReporter.captureException`, we forward
 * the event. Otherwise we log to the console and move on.
 *
 * This module has no dependency on any specific vendor. Wire up whatever
 * error tracker you prefer (Sentry, GlitchTip, self-hosted, etc.) by
 * assigning to `window.__errorReporter` before the app hydrates.
 */

type ErrorReporterOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type ErrorReporter = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: ErrorReporterOptions,
  ) => void;
};

declare global {
  interface Window {
    __errorReporter?: ErrorReporter;
  }
}

/**
 * Forward an error to the host page's telemetry hook, if present. No-op
 * during SSR and when no reporter has been installed.
 *
 * @param error   The thrown value (Error, string, or anything).
 * @param context Extra key/value metadata merged into the event payload.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const reporter = window.__errorReporter;
  if (reporter?.captureException) {
    reporter.captureException(
      error,
      {
        source: "react_error_boundary",
        route: window.location.pathname,
        ...context,
      },
      {
        mechanism: "react_error_boundary",
        handled: false,
        severity: "error",
      },
    );
    return;
  }
  console.error("[error-boundary]", context, error);
}
