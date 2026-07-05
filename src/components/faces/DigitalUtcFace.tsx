import { toast } from "sonner";
import { useAuthoritativeSecondTick } from "@/hooks/useAuthoritativeSecondTick";
import { useKonamiCode } from "@/hooks/useKonamiCode";
import { useSettings } from "@/lib/settings";
import { dayOfYear, isoWeek, julianDate } from "@/lib/time/format";
import { formatIsoLocal, formatIsoUtcLuxon, formatNaturalLocalDate } from "@/lib/time/luxon";
import { playMelody, unlockAudio } from "@/lib/chimes/audio";

// Resolved once at module load; the OS timezone effectively never changes mid-session.
const AUTO_TZ =
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

/**
 * York — "On The Beach" (1999) signature trance hook, transcribed as a rising
 * A-major arpeggio that peaks and unwinds. Fast 16th-note feel with a longer
 * held tail, played through the pure-MIDI square-lead voice and washed through
 * a dotted-eighth delay for the classic trance echo trail.
 */
const ON_THE_BEACH_HOOK: readonly { midi: number; dur: number }[] = [
  { midi: 64, dur: 0.14 }, // E4
  { midi: 69, dur: 0.14 }, // A4
  { midi: 73, dur: 0.14 }, // C#5
  { midi: 76, dur: 0.14 }, // E5
  { midi: 73, dur: 0.14 }, // C#5
  { midi: 69, dur: 0.14 }, // A4
  { midi: 71, dur: 0.14 }, // B4
  { midi: 73, dur: 0.14 }, // C#5
  { midi: 76, dur: 0.14 }, // E5
  { midi: 78, dur: 0.14 }, // F#5
  { midi: 76, dur: 0.14 }, // E5
  { midi: 73, dur: 0.14 }, // C#5
  { midi: 71, dur: 0.14 }, // B4
  { midi: 69, dur: 0.9 }, // A4 (held)
];

/**
 * Konami-code easter egg: unlock audio then play the York hook through the
 * pure-MIDI voice with a dotted-eighth trance delay wash.
 */
async function playOnTheBeachEasterEgg(): Promise<void> {
  await unlockAudio();
  await playMelody(ON_THE_BEACH_HOOK, {
    setId: "midi",
    volume: 0.6,
    speed: 1,
    transpose: 0,
    delay: { timeMs: 163, feedback: 0.42, mix: 0.35 },
  });
}

function announceOnTheBeach(): void {
  toast("🌊 On The Beach", {
    description: "York · 1999 — pure MIDI voice with trance delay",
  });
}

/** ISO-8601 UTC-conformant digital display with optional secondary local line. */
export function DigitalUtcFace() {
  const authoritativeSecond = useAuthoritativeSecondTick();
  const now = Math.floor(authoritativeSecond / 1000) * 1000;
  const { utcExtras, utcZoneOverride } = useSettings();
  const nowDate = new Date(now);

  const localZone = utcZoneOverride === "auto" ? AUTO_TZ : utcZoneOverride;

  // "YYYY-MM-DD HH:MM:SS UTC" — split into date / time lines so it always fits on two lines.
  const isoUtc = formatIsoUtcLuxon(now);
  const [utcDate, utcTime, utcLabel] = isoUtc.split(" ");

  const { active: flicker } = useKonamiCode(
    function onKonamiActivated() {
      void playOnTheBeachEasterEgg();
      announceOnTheBeach();
    },
    { cooldownMs: 4200 },
  );


  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-4 text-center transition-opacity duration-150 ${flicker ? "animate-pulse" : ""}`}
    >
      <div
        className="font-mono font-light leading-[1.05] tracking-tight text-[color:var(--digital-fg)]"
        style={{
          textShadow: flicker
            ? "0 0 40px var(--digital-fg), 0 0 12px var(--digital-fg)"
            : "0 0 20px color-mix(in oklab, var(--digital-fg) 30%, transparent)",
        }}
      >
        <div className="whitespace-nowrap text-[clamp(1.5rem,7vw,4.5rem)]">{utcDate}</div>
        <div className="whitespace-nowrap text-[clamp(1.5rem,7vw,4.5rem)]">
          {utcTime} <span className="opacity-80">{utcLabel}</span>
        </div>
      </div>
      <div className="font-mono text-sm text-muted-foreground">
        {formatIsoLocal(now, localZone)}
      </div>
      <div className="text-sm text-muted-foreground sm:text-base">
        {formatNaturalLocalDate(now, localZone)}
      </div>

      {utcExtras && (() => {
        const extras: { label: string; value: string | number }[] = [
          { label: "Unix time", value: Math.floor(now / 1000) },
          { label: "Day of year", value: dayOfYear(nowDate) },
          { label: "ISO week", value: isoWeek(nowDate) },
          { label: "Julian date", value: julianDate(now).toFixed(6) },
        ];
        return (
          <div className="grid grid-cols-2 gap-6 pt-2 text-xs font-mono text-muted-foreground sm:grid-cols-4">
            {extras.map((x) => (
              <div key={x.label}>
                <div className="text-[10px] uppercase tracking-widest">{x.label}</div>
                <div className="mt-1 text-base text-foreground">{x.value}</div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
