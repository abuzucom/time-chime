// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

/**
 * Store an error thrown outside a React boundary so it can be recovered later
 * by {@link consumeLastCapturedError}. Called by the global `error` and
 * `unhandledrejection` listeners installed below.
 */
function captureUncaughtError(error: unknown): void {
  lastCapturedError = { error, at: Date.now() };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) =>
    captureUncaughtError((event as ErrorEvent).error ?? event),
  );
  globalThis.addEventListener("unhandledrejection", (event) =>
    captureUncaughtError((event as PromiseRejectionEvent).reason),
  );
}

/**
 * Return (and clear) the most recently captured uncaught error.
 *
 * Errors are captured by the module's global `error` and `unhandledrejection`
 * listeners so an error boundary rendered *after* the fact can still surface
 * the original cause. Entries older than {@link TTL_MS} are discarded to avoid
 * attaching stale errors to unrelated later boundaries.
 *
 * @returns The stored error value, or `undefined` if none or expired.
 */
export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
