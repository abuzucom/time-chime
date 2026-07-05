/**
 * Background-chime consent state machine.
 *
 * Purpose: this app fires audible Westminster chimes on quarter-hour
 * boundaries even when the app is backgrounded or the screen is off. That
 * requires the user's *informed* consent — not just an OS permission blip
 * — because:
 *
 *   1. The OS notification prompt is one-shot on iOS. If we ask before the
 *      user knows what we're asking for, and they tap Don't Allow, we lose
 *      background chimes forever unless the user manually flips it in
 *      Settings.app. Apple's HIG explicitly recommends a soft pre-prompt.
 *   2. Android 12+ splits notification permission from the
 *      `SCHEDULE_EXACT_ALARM` capability, which is granted on a separate
 *      settings screen. Users need a mental model of "why is this app
 *      asking for two things?" before we send them there.
 *   3. Users may revoke permission at the OS level *after* granting it
 *      inside the app. On resume we re-check and, if state has drifted,
 *      transition to `revoked` (distinct from `denied_by_os` so the UI
 *      copy can say "you previously allowed this" instead of pretending
 *      we never asked).
 *
 * This module is deliberately **pure**: it accepts a
 * {@link NotificationAdapter} via {@link createConsentController} and
 * persists state through a {@link ConsentStorage} interface. No React, no
 * Capacitor. That makes every transition trivially testable with `node
 * --test` — see `consent.test.ts`.
 *
 * State machine
 *
 * ```text
 *                                       ┌── user taps "Just foreground" ──► declined_by_user
 * not_asked ── openSheet() ──► asking ──┤
 *                                       └── requestPermissions() ─┬─► granted
 *                                                                 └─► denied_by_os
 *
 * granted ─── OS revocation detected on resume ──► revoked
 * denied_by_os / revoked ─── user reopens sheet in Settings ──► asking
 * ```
 */
import type { NotificationAdapter, PermissionOutcome } from "./notifications";

export type ConsentState =
  /** Fresh install, sheet has never been shown. */
  | "not_asked"
  /** Sheet is open; we're waiting on the user's tap. */
  | "asking"
  /** User dismissed the sheet without granting — we won't nag on next launch. */
  | "declined_by_user"
  /** User tapped Allow AND the OS prompt returned granted. Background chimes are on. */
  | "granted"
  /** User tapped Allow but the OS prompt returned denied (or "not asked" on iOS 2nd attempt). */
  | "denied_by_os"
  /** We had `granted` on last check, but a re-check found the OS no longer allows it. */
  | "revoked"
  /** The platform has no notifications API at all (server-render, opted-out browsers). */
  | "unavailable";

export type ConsentSnapshot = {
  state: ConsentState;
  /** Unix ms of the last state transition — useful for "asked 3 days ago" copy. */
  updatedAt: number;
  /** Last raw OS answer, kept for debugging surface in the Settings drawer. */
  lastOsPermission: PermissionOutcome | null;
};

/**
 * Storage seam. Production wires this to `window.localStorage`; tests wire
 * it to an in-memory Map. Keeping this abstract means the state machine
 * never has to know about SSR gates or JSON parse failures.
 */
export type ConsentStorage = {
  read(): ConsentSnapshot | null;
  write(snapshot: ConsentSnapshot): void;
  clear(): void;
};

export const CONSENT_STORAGE_KEY = "westminster.consent.v1";

/** localStorage-backed storage. Returns null on SSR or corrupt payload. */
export function browserConsentStorage(): ConsentStorage {
  return {
    read() {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<ConsentSnapshot>;
        if (typeof parsed?.state !== "string") return null;
        return {
          state: parsed.state as ConsentState,
          updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
          lastOsPermission: (parsed.lastOsPermission as PermissionOutcome) ?? null,
        };
      } catch (err) {
        console.warn("[consent] persisted snapshot unreadable", err);
        return null;
      }
    },
    write(snapshot) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(snapshot));
      } catch (err) {
        console.warn("[consent] persist failed (quota / private mode)", err);
      }
    },
    clear() {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.removeItem(CONSENT_STORAGE_KEY);
      } catch {
        // best-effort
      }
    },
  };
}

/** Initial snapshot for a machine with no prior state. */
export function initialSnapshot(): ConsentSnapshot {
  return { state: "not_asked", updatedAt: 0, lastOsPermission: null };
}

/**
 * Public controller returned by {@link createConsentController}. All
 * methods are async because the underlying OS calls are async, but every
 * transition also synchronously updates `snapshot` before awaiting the
 * subscribers so React consumers see one consistent value per render.
 */
export type ConsentController = {
  /** Current snapshot — read-only from callers' perspective. */
  snapshot: ConsentSnapshot;
  /** Subscribe to snapshot changes. Returns unsubscribe. */
  subscribe(listener: (s: ConsentSnapshot) => void): () => void;
  /** Move `not_asked | declined_by_user | denied_by_os | revoked` → `asking`. */
  openSheet(): void;
  /** User tapped Allow inside the sheet. Triggers the OS prompt. */
  grantFromSheet(): Promise<ConsentSnapshot>;
  /** User tapped "Just foreground" inside the sheet. */
  declineFromSheet(): void;
  /**
   * Called on app resume. Compares the OS's current answer to what we
   * think we have; if they disagree we transition (usually to `revoked`).
   */
  reconcileWithOs(): Promise<ConsentSnapshot>;
  /** Reset to first-run state — used by the "reset all settings" button. */
  reset(): void;
};

/**
 * Build a controller. `now` is injectable so tests can pin the clock.
 */
export function createConsentController(deps: {
  adapter: NotificationAdapter;
  storage: ConsentStorage;
  now?: () => number;
}): ConsentController {
  const now = deps.now ?? Date.now;
  let snapshot: ConsentSnapshot = deps.storage.read() ?? initialSnapshot();
  const listeners = new Set<(s: ConsentSnapshot) => void>();

  /**
   * Commit a new snapshot: persist, then notify subscribers. All
   * transitions funnel through here so we can never accidentally emit
   * without persisting or vice versa.
   */
  function commit(next: Omit<ConsentSnapshot, "updatedAt">): ConsentSnapshot {
    snapshot = { ...next, updatedAt: now() };
    deps.storage.write(snapshot);
    listeners.forEach((l) => {
      try {
        l(snapshot);
      } catch (err) {
        // Isolate one bad subscriber from the rest.
        console.warn("[consent] subscriber threw", err);
      }
    });
    return snapshot;
  }

  const controller: ConsentController = {
    get snapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    openSheet() {
      // Idempotent: only meaningful from a resting state.
      if (snapshot.state === "asking" || snapshot.state === "granted") return;
      commit({ state: "asking", lastOsPermission: snapshot.lastOsPermission });
    },
    async grantFromSheet() {
      // Some callers may bypass openSheet; be tolerant.
      if (snapshot.state !== "asking") {
        commit({ state: "asking", lastOsPermission: snapshot.lastOsPermission });
      }
      const os = await deps.adapter.requestPermission();
      if (os === "granted") return commit({ state: "granted", lastOsPermission: os });
      if (os === "unavailable") return commit({ state: "unavailable", lastOsPermission: os });
      // "prompt" here means the OS neither granted nor denied — treat as denied
      // for machine purposes so we show the "open settings" CTA. iOS returns
      // "denied" on second-ask; Android returns "prompt" if the user swiped
      // the dialog away without choosing.
      return commit({ state: "denied_by_os", lastOsPermission: os });
    },
    declineFromSheet() {
      commit({ state: "declined_by_user", lastOsPermission: snapshot.lastOsPermission });
    },
    async reconcileWithOs() {
      const os = await deps.adapter.checkPermission();
      // Platform-level unavailability wins over every other transition:
      // if the notification API vanished (SSR, unsupported UA, plugin not
      // installed on native) neither `granted` nor `denied_by_os` is
      // meaningful, so surface `unavailable` immediately.
      if (os === "unavailable") {
        if (snapshot.state === "unavailable") return snapshot;
        return commit({ state: "unavailable", lastOsPermission: os });
      }
      // Terminal states that must react to a drift:
      //   granted → revoked when OS no longer says granted
      //   denied_by_os / revoked → granted when the user re-enabled it in Settings
      if (snapshot.state === "granted" && os !== "granted") {
        return commit({ state: "revoked", lastOsPermission: os });
      }
      if ((snapshot.state === "denied_by_os" || snapshot.state === "revoked") && os === "granted") {
        return commit({ state: "granted", lastOsPermission: os });
      }
      // No transition — but refresh lastOsPermission for the diagnostics row.
      if (snapshot.lastOsPermission !== os) {
        return commit({ state: snapshot.state, lastOsPermission: os });
      }
      return snapshot;
    },
    reset() {
      deps.storage.clear();
      commit({ state: "not_asked", lastOsPermission: null });
    },
  };
  return controller;
}
