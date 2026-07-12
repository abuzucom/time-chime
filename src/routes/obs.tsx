import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useSettings, type FaceId, type GrandfatherNumerals } from "@/lib/settings";
import { GrandfatherFace } from "@/components/faces/GrandfatherFace";
import { MidCenturyFace } from "@/components/faces/MidCenturyFace";
import { DigitalLocalFace } from "@/components/faces/DigitalLocalFace";
import { DigitalUtcFace } from "@/components/faces/DigitalUtcFace";
import { TimeSyncBadge } from "@/components/TimeSyncBadge";

/**
 * OBS Browser Source mode.
 *
 * A chromeless, optionally transparent render of a clock face suitable for
 * embedding as a Browser Source in OBS / Streamlabs / Twitch Studio.
 *
 * Recommended OBS setup:
 *   URL:    https://<your-host>/obs?face=grandfather&transparent=1&size=520
 *   Width:  560
 *   Height: 560
 *   CSS:    body { background: rgba(0,0,0,0); margin: 0; overflow: hidden; }
 *   Check:  "Shutdown source when not visible" (optional)
 *   Check:  "Refresh browser when scene becomes active"
 *
 * All settings can be driven via URL params so a single stream deck can host
 * multiple presets without touching the app UI:
 *   face        grandfather | midcentury | digital-local | digital-utc
 *   transparent 1 | 0                 (default 1 — no background)
 *   theme       light | grey | dark  (forces a palette, overrides user setting)
 *   size        pixels             (max width/height of the face, default 520)
 *   drift       1 | 0                 (show the network-reference drift badge, default 0)
 *   seconds     1 | 0                 (show second hand / seconds digits)
 *   pad         pixels             (outer padding, default 0)
 *   numerals    roman | arabic | eastern-arabic  (grandfather face only)
 *
 * Chimes still play through the normal scheduler — mute them from the main
 * settings page if you'd rather run the visuals silently on stream.
 */

type Search = {
  face?: FaceId;
  transparent?: 0 | 1;
  theme?: "light" | "grey" | "dark";
  size?: number;
  drift?: 0 | 1;
  seconds?: 0 | 1;
  pad?: number;
  numerals?: GrandfatherNumerals;
};

const FACE_IDS: FaceId[] = ["grandfather", "midcentury", "digital-local", "digital-utc"];
const NUMERAL_IDS: GrandfatherNumerals[] = ["roman", "arabic", "eastern-arabic"];

/**
 * Coerce a URL query-string value to a binary flag (`0 | 1`). Accepts the
 * strings `"0"/"1"/"true"/"false"`, real booleans, and the numbers `0/1`;
 * returns `fallback` for absent, empty, or unrecognised inputs so bad URLs
 * degrade to the caller's default instead of throwing.
 */
function coerceQueryBool(v: unknown, fallback: 0 | 1): 0 | 1 {
  if (v === undefined || v === null || v === "") return fallback;
  if (v === "1" || v === 1 || v === true || v === "true") return 1;
  if (v === "0" || v === 0 || v === false || v === "false") return 0;
  return fallback;
}

export const Route = createFileRoute("/obs")({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const face = typeof raw.face === "string" && FACE_IDS.includes(raw.face as FaceId)
      ? (raw.face as FaceId)
      : undefined;
    const theme = raw.theme === "light" || raw.theme === "grey" || raw.theme === "dark"
      ? raw.theme
      : undefined;
    const size = raw.size !== undefined ? Number(raw.size) : undefined;
    const pad = raw.pad !== undefined ? Number(raw.pad) : undefined;
    const numerals = typeof raw.numerals === "string" && NUMERAL_IDS.includes(raw.numerals as GrandfatherNumerals)
      ? (raw.numerals as GrandfatherNumerals)
      : undefined;
    return {
      face,
      theme,
      transparent: coerceQueryBool(raw.transparent, 1),
      drift: coerceQueryBool(raw.drift, 0),
      seconds: raw.seconds === undefined ? undefined : coerceQueryBool(raw.seconds, 1),
      size: Number.isFinite(size) ? size : undefined,
      pad: Number.isFinite(pad) ? pad : undefined,
      numerals,
    };
  },
  component: ObsBrowserSource,
});

function ObsBrowserSource() {
  const search = Route.useSearch();
  const settings = useSettings();

  const face: FaceId = search.face ?? settings.face;
  const transparent = search.transparent !== 0;
  const showDrift = search.drift === 1;
  const showSeconds = search.seconds === undefined ? settings.showSeconds : search.seconds === 1;
  const size = search.size ?? 520;
  const pad = search.pad ?? 0;

  // Force a palette when the URL asks for one; leave the app alone if not.
  useEffect(() => {
    if (!search.theme) return;
    const root = document.documentElement;
    const prevClasses = root.className;
    const prevScheme = root.style.colorScheme;
    root.classList.remove("dark", "grey");
    if (search.theme === "dark") root.classList.add("dark");
    else if (search.theme === "grey") root.classList.add("grey");
    root.style.colorScheme = search.theme === "light" ? "light" : "dark";
    return () => {
      root.className = prevClasses;
      root.style.colorScheme = prevScheme;
    };
  }, [search.theme]);

  // Transparent background is the killer feature for OBS — the compositor
  // alpha-blends the clock straight over the game / camera scene.
  useEffect(() => {
    if (!transparent) return;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      bodyMargin: body.style.margin,
      overflow: body.style.overflow,
    };
    html.style.background = "transparent";
    body.style.background = "transparent";
    body.style.margin = "0";
    body.style.overflow = "hidden";
    return () => {
      html.style.background = prev.htmlBg;
      body.style.background = prev.bodyBg;
      body.style.margin = prev.bodyMargin;
      body.style.overflow = prev.overflow;
    };
  }, [transparent]);

  const wrapperStyle = useMemo(
    () => ({
      padding: `${pad}px`,
      background: transparent ? "transparent" : undefined,
    }),
    [pad, transparent],
  );

  const faceStyle = useMemo(
    () => ({
      width: `${size}px`,
      maxWidth: "100%",
      aspectRatio: "1 / 1",
    }),
    [size],
  );

  return (
    <div
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 text-foreground " +
        (transparent ? "" : "bg-background")
      }
      style={wrapperStyle}
      data-obs-source="time chime"
    >
      <div style={faceStyle}>
        {face === "grandfather" && (search.numerals !== undefined || settings.ready) && (
          <GrandfatherFace showSeconds={showSeconds} numerals={search.numerals ?? settings.grandfatherNumerals} />
        )}
        {face === "midcentury" && <MidCenturyFace showSeconds={showSeconds} numerals={settings.midcenturyNumerals} />}
        {face === "digital-local" && <DigitalLocalFace />}
        {face === "digital-utc" && <DigitalUtcFace />}
      </div>
      {showDrift && <TimeSyncBadge />}
    </div>
  );
}
