/**
 * React binding around the consent state machine.
 *
 * Wires four things the pure `consent.ts` module deliberately doesn't know
 * about:
 *
 *   1. Adapter selection — picks the Capacitor adapter on iOS/Android and
 *      the Web Notifications adapter in the browser build. The consent
 *      module only sees the abstract interface.
 *   2. React subscription — bridges the imperative subscribe/snapshot API
 *      to `useSyncExternalStore` so components re-render on transition.
 *   3. App-resume reconciliation — on native, subscribes to Capacitor's
 *      `App.appStateChange` event so we detect OS-level revocations the
 *      moment the user returns from Settings. On web, we listen for
 *      `visibilitychange` for the same reason.
 *   4. One-time opening of the sheet — for first-run users, we don't want
 *      to nag on every launch. The `backgroundConsentAsked` settings flag
 *      records that we've *shown* the sheet at least once, independent of
 *      what the user chose.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  browserConsentStorage,
  createConsentController,
  type ConsentController,
  type ConsentSnapshot,
} from "@/lib/native/consent";
import {
  capacitorNotificationAdapter,
  webNotificationAdapter,
} from "@/lib/native/notifications";
import { isNativePlatform } from "@/lib/native/platform";

// Module-singleton controller. The consent machine is app-global — every
// component needs to see the same snapshot, and building a new controller
// per hook call would drop subscribers on unmount.
let sharedController: ConsentController | null = null;

/** Lazily construct the singleton on first use so SSR doesn't touch it. */
function getController(): ConsentController {
  if (sharedController) return sharedController;
  const adapter = isNativePlatform() ? capacitorNotificationAdapter : webNotificationAdapter;
  sharedController = createConsentController({
    adapter,
    storage: browserConsentStorage(),
  });
  return sharedController;
}

/**
 * React hook exposing the current consent snapshot and the small set of
 * imperative actions components need. Also wires up the resume listener on
 * mount and tears it down on unmount.
 */
export function useBackgroundConsent(): {
  snapshot: ConsentSnapshot;
  controller: ConsentController;
} {
  const controller = useMemo(getController, []);

  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.snapshot,
    // SSR: report the persisted-or-initial snapshot without touching window.
    () => controller.snapshot,
  );

  // Reconcile on mount and on every foreground transition. On native we use
  // Capacitor's App plugin; on web we use visibilitychange (which fires on
  // tab focus as well as OS-level app switches). We *additionally* watch for
  // live permission-state changes so a revocation made while the app remains
  // in the foreground (browser site-settings dropdown, Android quick-toggle,
  // split-screen Settings on iPadOS) is detected without waiting for a
  // background/foreground round-trip.
  useEffect(() => {
    let cancelled = false;
    let removeNative: (() => void) | null = null;
    let removePermissionWatcher: (() => void) | null = null;
    let nativePollTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Web: subscribe to the Permissions API `change` event on the
     * `notifications` descriptor. Fires the instant the user flips the
     * browser's site-permission dropdown, no visibility transition required.
     */
    async function attachWebPermissionWatcher() {
      if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
      try {
        const status = await navigator.permissions.query({
          name: "notifications" as PermissionName,
        });
        if (cancelled) return;
        const onPermissionChange = () => {
          void controller.reconcileWithOs();
        };
        status.addEventListener("change", onPermissionChange);
        removePermissionWatcher = () => status.removeEventListener("change", onPermissionChange);
      } catch {
        // Some browsers (older Safari) reject "notifications" as a Permissions
        // API descriptor. visibilitychange still covers the return-from-Settings
        // path, so a missing watcher is non-fatal.
      }
    }

    /**
     * Native: Capacitor exposes no push event for OS permission changes, so
     * poll at low frequency while the app is active. `reconcileWithOs` is a
     * cheap check-only call (never triggers the OS prompt), and `commit` only
     * notifies subscribers when the answer actually differs.
     */
    function startNativePermissionPoll() {
      if (nativePollTimer !== null) return;
      nativePollTimer = setInterval(() => {
        void controller.reconcileWithOs();
      }, 15_000);
    }
    function stopNativePermissionPoll() {
      if (nativePollTimer === null) return;
      clearInterval(nativePollTimer);
      nativePollTimer = null;
    }

    async function attachResumeListener() {
      // First reconciliation happens unconditionally so a stale "granted"
      // snapshot from a previous session is corrected immediately.
      await controller.reconcileWithOs();
      if (cancelled) return;

      if (isNativePlatform()) {
        startNativePermissionPoll();
        try {
          const { App } = await import("@capacitor/app");
          const handle = await App.addListener("appStateChange", (state) => {
            if (state.isActive) {
              void controller.reconcileWithOs();
              startNativePermissionPoll();
            } else {
              // Pause polling while backgrounded to spare battery; the resume
              // handler above will re-reconcile the moment we come back.
              stopNativePermissionPoll();
            }
          });
          // If cleanup ran while we were suspended in the awaits above, the
          // returned cleanup closure never saw `removeNative` — detach here to
          // avoid leaking the native listener for the lifetime of the isolate.
          if (cancelled) {
            void handle.remove();
            return;
          }
          removeNative = () => {
            void handle.remove();
          };
        } catch (err) {
          console.warn("[consent] failed to attach appStateChange listener", err);
        }
      } else {
        await attachWebPermissionWatcher();
      }
    }

    /**
     * Foreground reconciliation for the web build. `document.hidden` flips
     * false when the tab regains focus.
     */
    function onVisibility() {
      if (typeof document !== "undefined" && !document.hidden) {
        void controller.reconcileWithOs();
      }
    }
    if (!isNativePlatform() && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    void attachResumeListener();
    return () => {
      cancelled = true;
      removeNative?.();
      removePermissionWatcher?.();
      stopNativePermissionPoll();
      if (!isNativePlatform() && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [controller]);

  return { snapshot, controller };
}
