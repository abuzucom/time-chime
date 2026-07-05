/**
 * Notification adapter — the thin, injectable seam between the consent state
 * machine and the underlying OS notification API.
 *
 * The state machine in `consent.ts` never imports Capacitor directly; it
 * takes a {@link NotificationAdapter} so tests can supply a fake and the web
 * build can degrade gracefully. Two concrete adapters live here:
 *
 *   - {@link capacitorNotificationAdapter} — production adapter used inside
 *     the iOS/Android shell. Delegates to `@capacitor/local-notifications`
 *     and, on Android 12+, additionally requests the exact-alarm capability
 *     (`SCHEDULE_EXACT_ALARM`) that the OS gates behind a separate settings
 *     screen. Falling back to inexact alarms is acceptable — chimes may
 *     drift by a few minutes but still fire.
 *
 *   - {@link webNotificationAdapter} — used in the browser build. Web pages
 *     cannot schedule background local notifications, only foreground ones,
 *     so scheduling is a no-op that reports success; the in-tab Web Audio
 *     scheduler handles playback while the tab is alive. `permission-only`
 *     mode still surfaces the OS-level Notifications permission so the app
 *     can at least post a "chime missed while you were away" toast.
 *
 * Neither adapter throws. They return a discriminated result the state
 * machine can map to its own states.
 */
import type { PermissionState } from "@capacitor/core";

export type PermissionOutcome = "granted" | "denied" | "prompt" | "unavailable";

export type ScheduledStrike = {
  /** Stable id across scheduling passes so we can cancel/reschedule. */
  id: number;
  /** Whole-second wall-clock timestamp when the strike should fire. */
  atUnixMs: number;
  /** Localized notification title, e.g. "Time Chime · 3:15". */
  title: string;
  /** Short body, e.g. "Quarter past". */
  body: string;
  /** Bundled sound asset filename (see android/res/raw and ios sound files). */
  soundAsset: string | null;
};

export type NotificationAdapter = {
  /**
   * Non-mutating: read the current OS permission. Never triggers the OS
   * prompt. Safe to call on every app-resume.
   */
  checkPermission(): Promise<PermissionOutcome>;
  /**
   * Present the OS permission prompt (iOS: alert/sound; Android 13+:
   * POST_NOTIFICATIONS runtime prompt). MUST be called from a user gesture.
   */
  requestPermission(): Promise<PermissionOutcome>;
  /**
   * Schedule (or replace) the given strikes. Implementations should first
   * cancel any previously-scheduled strike with the same id so we can safely
   * call this on every window roll-over.
   */
  schedule(strikes: ScheduledStrike[]): Promise<{ ok: boolean; error?: string }>;
  /** Cancel every currently pending strike, regardless of id. */
  cancelAll(): Promise<void>;
  /** Open the OS settings page where the user can grant/revoke permission. */
  openSystemSettings(): Promise<void>;
};

// ---------------------------------------------------------------------------
// Capacitor adapter (native builds only)
// ---------------------------------------------------------------------------

/**
 * Map Capacitor's `PermissionState` union onto our simpler
 * {@link PermissionOutcome} vocabulary.
 */
function coercePermission(state: PermissionState | undefined): PermissionOutcome {
  switch (state) {
    case "granted":
      return "granted";
    case "denied":
      return "denied";
    case "prompt":
    case "prompt-with-rationale":
      return "prompt";
    default:
      return "unavailable";
  }
}

export const capacitorNotificationAdapter: NotificationAdapter = {
  async checkPermission() {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const res = await LocalNotifications.checkPermissions();
      return coercePermission(res.display);
    } catch (err) {
      console.warn("[notifications] checkPermission failed", err);
      return "unavailable";
    }
  },

  async requestPermission() {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const res = await LocalNotifications.requestPermissions();
      const base = coercePermission(res.display);
      if (base !== "granted") return base;

      // Android 12+ gates exact alarms behind a SEPARATE user-settings
      // screen (SCHEDULE_EXACT_ALARM). We attempt to request it opportunistically;
      // failure is not fatal — inexact alarms still fire, just with jitter.
      try {
        // The plugin exposes changeExactNotificationSetting only on Android 12+.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyPlugin = LocalNotifications as any;
        if (typeof anyPlugin.checkExactNotificationSetting === "function") {
          const exact = await anyPlugin.checkExactNotificationSetting();
          if (exact?.exact_alarm !== "granted" && typeof anyPlugin.requestExactNotificationSetting === "function") {
            await anyPlugin.requestExactNotificationSetting();
          }
        }
      } catch (err) {
        console.info("[notifications] exact-alarm request skipped", err);
      }
      return base;
    } catch (err) {
      console.warn("[notifications] requestPermission failed", err);
      return "unavailable";
    }
  },

  async schedule(strikes) {
    if (strikes.length === 0) return { ok: true };
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      // Replace by id: cancel first, then schedule fresh. Cheaper than diffing.
      await LocalNotifications.cancel({ notifications: strikes.map((s) => ({ id: s.id })) });
      await LocalNotifications.schedule({
        notifications: strikes.map((s) => ({
          id: s.id,
          title: s.title,
          body: s.body,
          schedule: { at: new Date(s.atUnixMs), allowWhileIdle: true },
          sound: s.soundAsset ?? undefined,
          channelId: "westminster-chimes",
          smallIcon: "ic_notification_bell",
        })),
      });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[notifications] schedule failed", err);
      return { ok: false, error: msg };
    }
  },

  async cancelAll() {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length === 0) return;
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    } catch (err) {
      console.warn("[notifications] cancelAll failed", err);
    }
  },

  async openSystemSettings() {
    try {
      const { NativeSettings, AndroidSettings, IOSSettings } = await import(
        "capacitor-native-settings"
      );
      await NativeSettings.open({
        optionAndroid: AndroidSettings.AppNotification,
        optionIOS: IOSSettings.App,
      });
    } catch (err) {
      console.warn("[notifications] openSystemSettings failed", err);
    }
  },
};

// ---------------------------------------------------------------------------
// Web fallback adapter
// ---------------------------------------------------------------------------

/**
 * Map the web Notifications API permission onto our vocabulary. The web
 * platform has no "exact alarm" concept, and background scheduling is not
 * available at all — chimes only fire while a tab is open.
 */
export const webNotificationAdapter: NotificationAdapter = {
  async checkPermission() {
    if (typeof Notification === "undefined") return "unavailable";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return "prompt";
  },
  async requestPermission() {
    if (typeof Notification === "undefined") return "unavailable";
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") return "granted";
      if (permission === "denied") return "denied";
      return "prompt";
    } catch {
      return "unavailable";
    }
  },
  async schedule() {
    // Web pages cannot schedule OS-level alarms. The in-tab Web Audio scheduler
    // (src/lib/chimes/scheduler.ts) covers foreground playback.
    return { ok: true };
  },
  async cancelAll() {
    // Nothing to cancel on web.
  },
  async openSystemSettings() {
    // The web has no cross-browser "notification settings" URL. Best we can
    // do is guide the user with a toast; the sheet component does that.
  },
};
