import { useMemo } from "react";
import { toast } from "sonner";
import { useAuthoritativeTick } from "@/hooks/useAuthoritativeTick";
import { useKonamiCode } from "@/hooks/useKonamiCode";
import { useSettings } from "@/lib/settings";
import { playMelody, unlockAudio } from "@/lib/chimes/audio";

// Static formatters — resolved once at module load.
const LOCAL_TZ =
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
const DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const OFFSET_FMT = new Intl.DateTimeFormat(undefined, { timeZoneName: "longOffset" });

/**
 * John Williams' five-note motif from *Close Encounters of the Third Kind*:
 * D5 – E5 – C5 – C4 – G4. Rendered through the pure-MIDI square voice for
 * that unmistakable "first contact" synth-pad quality.
 */
const CLOSE_ENCOUNTERS: readonly { midi: number; dur: number }[] = [
  { midi: 74, dur: 0.42 }, // D5
  { midi: 76, dur: 0.42 }, // E5
  { midi: 72, dur: 0.42 }, // C5
  { midi: 60, dur: 0.42 }, // C4
  { midi: 67, dur: 1.2 }, // G4 (held)
];

/** Konami-code easter egg: unlock audio then play the CE3K motif on MIDI. */
async function playCloseEncountersEasterEgg(): Promise<void> {
  await unlockAudio();
  await playMelody(CLOSE_ENCOUNTERS, {
    setId: "midi",
    volume: 0.65,
    speed: 1,
    transpose: 0,
  });
}

function announceCloseEncounters(): void {
  toast("🛸 Close Encounters", {
    description: "John Williams · 1977 — pure MIDI voice",
  });
}


/**
 * Digital face showing local time with day + date + IANA zone label.
 *
 * Easter egg: the Konami code (↑↑↓↓←→←→BA) plays the *Close Encounters
 * of the Third Kind* five-note motif through the pure-MIDI voice.
 */
export function DigitalLocalFace() {
  const now = useAuthoritativeTick();
  const { hour24, showSeconds } = useSettings();
  const nowDate = new Date(now);

  // Time formatter only rebuilds when its options change.
  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: showSeconds ? "2-digit" : undefined,
        hourCycle: hour24 ? "h23" : "h12",
      }),
    [hour24, showSeconds],
  );

  const offsetLabel = OFFSET_FMT.formatToParts(nowDate).find((p) => p.type === "timeZoneName")?.value;

  const { active: flicker } = useKonamiCode(
    function onKonamiActivated() {
      void playCloseEncountersEasterEgg();
      announceCloseEncounters();
    },
    { cooldownMs: 3200 },
  );


  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-3 text-center transition-opacity duration-150 ${flicker ? "animate-pulse" : ""}`}
    >
      <div
        className="font-mono font-light leading-none tracking-tight text-[color:var(--digital-fg)] whitespace-nowrap"
        style={{
          fontSize: "clamp(1.75rem, 8vw, 5.5rem)",
          textShadow: flicker
            ? "0 0 40px var(--digital-fg), 0 0 12px var(--digital-fg)"
            : "0 0 24px color-mix(in oklab, var(--digital-fg) 30%, transparent)",
        }}
      >
        {timeFmt.format(nowDate)}
      </div>
      <div className="text-lg font-medium text-foreground">{DAY_FMT.format(nowDate)}</div>
      <div className="text-sm text-muted-foreground">{DATE_FMT.format(nowDate)}</div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        {LOCAL_TZ} · {offsetLabel}
      </div>
    </div>
  );
}
