/**
 * Runtime platform detection.
 *
 * The app ships as a Vite web build AND as a Capacitor-wrapped native shell
 * for iOS/Android. Every native-only code path (LocalNotifications,
 * exact-alarm permission, app-resume events, deep-links into system settings)
 * MUST gate on {@link isNativePlatform} so the web build never tries to load
 * a Capacitor plugin that has no browser implementation.
 *
 * We intentionally do NOT re-export `Capacitor.getPlatform()` — callers only
 * need the boolean and the coarse "ios" | "android" | "web" string, and
 * wrapping the API here means the rest of the codebase never has to import
 * `@capacitor/core` directly (which keeps the web bundle from tree-shaking
 * around it).
 */
import { Capacitor } from "@capacitor/core";

export type NativePlatform = "ios" | "android" | "web";

/** True when running inside a Capacitor iOS or Android shell. */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    // Defensive: Capacitor.isNativePlatform can throw during SSR before the
    // global bridge has been installed. Treat any failure as "not native".
    return false;
  }
}

/** Coarse platform id — "ios" or "android" when native, otherwise "web". */
export function currentPlatform(): NativePlatform {
  try {
    const platformName = Capacitor.getPlatform();
    if (platformName === "ios" || platformName === "android") return platformName;
    return "web";
  } catch {
    return "web";
  }
}
