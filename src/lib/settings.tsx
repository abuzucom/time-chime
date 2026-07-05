import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

export type FaceId = "grandfather" | "midcentury" | "digital-local" | "digital-utc";
export type SoundMode = "normal" | "quiet" | "mute";
export type SoundSet = "bell" | "train" | "midi";
export type Theme = "light" | "grey" | "dark" | "system";
export type DigitalHue = "green" | "amber" | "white";
export type GrandfatherNumerals = "roman" | "arabic" | "eastern-arabic";

export type Settings = {
  face: FaceId;
  soundMode: SoundMode;
  soundSet: SoundSet;
  theme: Theme;
  digitalHue: DigitalHue;
  grandfatherNumerals: GrandfatherNumerals;
  midcenturyNumerals: boolean;
  masterVolume: number; // 0..1
  quietCeiling: number; // 0.05..0.4
  chimeSpeed: number; // 0.5..4  playback rate multiplier
  transposeSemitones: number; // -5..+6, whole semitones from E major
  /**
   * Milliseconds *before* the true quarter boundary at which the audio
   * engine begins playback, compensating for output-pipeline latency
   * (baseLatency + outputLatency + Bluetooth / HDMI transport). Set by
   * the "Calibrate" action in the Settings drawer or nudged manually via
   * the drift slider. Clamped downstream to [-500, +2000].
   */
  chimeLeadMs: number;
  chimeQuarters: boolean; // :15/:30/:45
  chimeHour: boolean;
  hour24: boolean;
  showSeconds: boolean;
  utcExtras: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number; // hour 0-23
  quietHoursEnd: number; // hour 0-23
  driftAlertMs: number;
  utcZoneOverride: string; // "auto" or IANA
  donationNudge: boolean;
  donationFirstLaunch: number | null;
  donationDismissed: boolean;
  /**
   * Whether the background-chime consent sheet has ever been shown to this
   * user. We only auto-open it once; after that it's reachable only from
   * the Settings drawer. See `src/lib/native/consent.ts`.
   */
  backgroundConsentAsked: boolean;
};

const DEFAULTS: Settings = {
  face: "grandfather",
  soundMode: "normal",
  soundSet: "bell",
  theme: "system",
  digitalHue: "amber",
  grandfatherNumerals: "roman",
  midcenturyNumerals: true,
  masterVolume: 0.6,
  quietCeiling: 0.2,
  chimeSpeed: 1,
  transposeSemitones: 0,
  chimeLeadMs: 0,
  chimeQuarters: true,
  chimeHour: true,
  hour24: false,
  showSeconds: true,
  utcExtras: false,
  quietHoursEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  driftAlertMs: 2000,
  utcZoneOverride: "auto",
  donationNudge: true,
  donationFirstLaunch: null,
  donationDismissed: false,
  backgroundConsentAsked: false,
};

const KEY = "westminster.settings.v1";

type Ctx = Settings & { ready: boolean; update: (patch: Partial<Settings>) => void; reset: () => void };
const SettingsContext = createContext<Ctx | null>(null);

/**
 * Read persisted user settings from `localStorage`, merged over {@link DEFAULTS}.
 *
 * Returns {@link DEFAULTS} unchanged when running on the server, when no value
 * has been persisted yet, or when the stored payload is corrupt/unreadable
 * (parse failures are logged but non-fatal).
 */
const VALID_NUMERALS: readonly GrandfatherNumerals[] = ["roman", "arabic", "eastern-arabic"];

/** Known legacy strings that older builds may have persisted, mapped to the current canonical id. */
const LEGACY_NUMERAL_ALIASES: Record<string, GrandfatherNumerals> = {
  latin: "roman",
  western: "arabic",
  hindu: "arabic",
  "hindu-arabic": "arabic",
  numeric: "arabic",
  numbers: "arabic",
  "eastern_arabic": "eastern-arabic",
  "eastern arabic": "eastern-arabic",
  arabic_indic: "eastern-arabic",
  "arabic-indic": "eastern-arabic",
};

/**
 * Coerce an unknown persisted value into a valid {@link GrandfatherNumerals},
 * mapping known legacy aliases first and defaulting to Roman as a last resort.
 */
function sanitizeNumerals(v: unknown): GrandfatherNumerals {
  if (typeof v !== "string") return "roman";
  const normalized = v.trim().toLowerCase();
  if (VALID_NUMERALS.includes(normalized as GrandfatherNumerals)) {
    return normalized as GrandfatherNumerals;
  }
  return LEGACY_NUMERAL_ALIASES[normalized] ?? "roman";
}

/** Bump when a new migration step is added; stored under `_schemaVersion`. */
const CURRENT_SCHEMA_VERSION = 2;

type StoredShape = Partial<Settings> & { _schemaVersion?: number };

/**
 * Convert an unversioned or older payload into a shape compatible with the
 * current {@link Settings}. Each `if (from < N)` block is one migration step
 * that runs exactly once per stored value; steps are additive and idempotent.
 */
function migratePersistedSettings(raw: StoredShape): StoredShape {
  const from = typeof raw._schemaVersion === "number" ? raw._schemaVersion : 1;
  const next: StoredShape = { ...raw };

  // v1 → v2: `grandfatherNumerals` was added; older payloads have no value,
  // and some intermediate builds shipped aliases like "latin"/"western".
  if (from < 2) {
    next.grandfatherNumerals = sanitizeNumerals(next.grandfatherNumerals);
  }

  next._schemaVersion = CURRENT_SCHEMA_VERSION;
  return next;
}

/**
 * Read the persisted settings blob from `localStorage`, migrate it forward
 * to the current schema version, and layer it over {@link DEFAULTS}.
 *
 * Runs synchronously so the `SettingsProvider` can seed its `useState`
 * lazily without a hydration flicker. Returns {@link DEFAULTS} during SSR
 * (no `window`) and on every failure path — a corrupt or hand-edited
 * payload should never crash the app.
 *
 * @returns The resolved settings plus a `loadError` flag the provider uses
 *   to show a one-time "settings reset" toast when persistence was corrupt.
 */
function loadPersistedSettings(): { settings: Settings; loadError: boolean } {
  if (typeof window === "undefined") return { settings: DEFAULTS, loadError: false };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { settings: DEFAULTS, loadError: false };
    const parsed = JSON.parse(raw) as StoredShape;
    const migrated = migratePersistedSettings(parsed);
    const merged: Settings = { ...DEFAULTS, ...migrated };
    // Final guardrail: even at the current schema version, a hand-edited
    // localStorage value could still be garbage — sanitize on every load.
    merged.grandfatherNumerals = sanitizeNumerals(merged.grandfatherNumerals);
    return { settings: merged, loadError: false };
  } catch (err) {
    // Corrupt or unreadable persisted settings — surface for debugging but fall back to defaults.
    console.warn("[settings] failed to load persisted settings; using defaults", err);
    return { settings: DEFAULTS, loadError: true };
  }
}
/**
 * Serialize and write settings to `localStorage`, emitting a one-shot
 * toast if storage is unavailable (quota exceeded, private browsing,
 * disabled cookies). The `alreadyWarned` ref prevents spamming the user
 * once per session — mutated in place.
 */
function persistSettingsWithFeedback(
  next: Settings,
  alreadyWarned: React.MutableRefObject<boolean>,
): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    alreadyWarned.current = false;
  } catch (err) {
    // Storage may be full, disabled, or blocked by privacy mode — degrade gracefully.
    console.warn("[settings] failed to persist settings", err);
    if (!alreadyWarned.current) {
      alreadyWarned.current = true;
      toast.warning("Settings can't be saved", {
        description:
          "Storage is full or blocked (e.g. private browsing). Changes apply this session only.",
      });
    }
  }
}


/**
 * React context provider for user settings.
 *
 * Loads persisted settings from `localStorage` on mount (falling back to
 * defaults on error), persists every change, applies the resolved theme
 * (`light | dark | grey`) as a class on `<html>` and syncs with the OS
 * `prefers-color-scheme` when the user picks `"system"`, and stamps the
 * first-launch timestamp used by the once-a-year donation nudge.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  const persistFailed = useRef(false);

  useEffect(() => {
    const { settings: loaded, loadError } = loadPersistedSettings();
    // Stamp first-launch time for the once-a-year donation nudge
    if (loaded.donationFirstLaunch === null) {
      loaded.donationFirstLaunch = Date.now();
    }
    setState(loaded);
    setReady(true);
    if (loadError) {
      toast.error("Saved settings were unreadable", {
        description: "Falling back to defaults. Your changes will still save going forward.",
      });
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    persistSettingsWithFeedback(state, persistFailed);
  }, [state, ready]);


  // Apply theme class to <html>
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyResolvedTheme = (): void => {
      const resolved =
        state.theme === "system" ? (media.matches ? "dark" : "light") : state.theme;
      root.classList.remove("dark", "grey");
      if (resolved === "dark") root.classList.add("dark");
      else if (resolved === "grey") root.classList.add("grey");
      root.style.colorScheme = resolved === "light" ? "light" : "dark";
    };
    applyResolvedTheme();
    media.addEventListener("change", applyResolvedTheme);
    return () => media.removeEventListener("change", applyResolvedTheme);
  }, [state.theme, ready]);

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      ready,
      update: (patch) => setState((s) => ({ ...s, ...patch })),
      reset: () => setState({ ...DEFAULTS, donationFirstLaunch: Date.now() }),
    }),
    [state, ready],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/**
 * Access the current settings plus `update` / `reset` helpers.
 * @throws If called outside `<SettingsProvider>`.
 */
export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings requires <SettingsProvider>");
  return ctx;
}

/**
 * Compose the user's chosen sound mode with the automatic quiet-hours
 * window into a single mode the audio scheduler can consume directly.
 *
 * Precedence, highest first:
 *  1. `"mute"` — user explicitly disabled sound; always wins.
 *  2. Quiet-hours window active AND user's mode is `"normal"` — downgraded
 *     to `"quiet"` so the automated window can attenuate.
 *  3. Otherwise the user's chosen mode passes through unchanged. A manual
 *     `"quiet"` selection stays `"quiet"` in and out of the window.
 *
 * @param s     Current settings snapshot.
 * @param nowMs Authoritative "now" in ms since epoch (from the time-sync
 *              context, NOT `Date.now()` — the window must use synced time).
 * @returns The mode the audio engine should treat as active right now.
 */
export function effectiveSoundMode(s: Settings, nowMs: number): SoundMode {
  if (s.soundMode === "mute") return "mute";
  if (!s.quietHoursEnabled) return s.soundMode;
  const hour = new Date(nowMs).getHours();
  const inQuiet =
    s.quietHoursStart <= s.quietHoursEnd
      ? hour >= s.quietHoursStart && hour < s.quietHoursEnd
      : hour >= s.quietHoursStart || hour < s.quietHoursEnd;
  // Quiet hours only *downgrade* "normal" → "quiet". "quiet" is already at the
  // reduced-volume tier, so the window is a no-op there by design.
  if (inQuiet && s.soundMode === "normal") return "quiet";
  return s.soundMode;
}
