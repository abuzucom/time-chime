import { useMemo } from "react";
import { useAuthoritativeTick } from "@/hooks/useAuthoritativeTick";
import { useAuthoritativeSecondTick } from "@/hooks/useAuthoritativeSecondTick";
import { useKonamiCode } from "@/hooks/useKonamiCode";
import type { GrandfatherNumerals } from "@/lib/settings";
import { playMelody, unlockAudio } from "@/lib/chimes/audio";
import { toast } from "sonner";

type Props = { showSeconds?: boolean; numerals?: GrandfatherNumerals };

/**
 * The famous opening of J.S. Bach's Toccata & Fugue in D minor, BWV 565.
 * Two fermata-anchored mordent gestures, then the long D — tolled on the
 * carillon bell voice. Duration values are in unscaled seconds.
 */
const TOCCATA_OPENING: readonly { midi: number; dur: number }[] = [
  { midi: 81, dur: 0.35 }, // A5
  { midi: 79, dur: 0.35 }, // G5
  { midi: 81, dur: 2.0 }, // A5 (fermata, rings into the silence)
  { midi: 79, dur: 0.18 }, // G5
  { midi: 77, dur: 0.18 }, // F5
  { midi: 76, dur: 0.18 }, // E5
  { midi: 74, dur: 0.18 }, // D5
  { midi: 73, dur: 0.18 }, // C#5
  { midi: 74, dur: 2.4 }, // D5 (long)
];

/** Konami-code easter egg: unlock audio then toll the Toccata on the bell voice. */
async function playToccataEasterEgg(): Promise<void> {
  await unlockAudio();
  await playMelody(TOCCATA_OPENING, {
    setId: "bell",
    volume: 0.75,
    speed: 1,
    transpose: 0,
  });
}

function announceToccata(): void {
  toast("🎹 Toccata & Fugue in D minor", {
    description: "J.S. Bach · BWV 565 — carillon voice",
  });
}

// --- Static geometry (hoisted; never changes across renders) -----------------
const MINUTE_TICKS = Array.from({ length: 60 }, (_, i) => {
  const isHour = i % 5 === 0;
  return (
    <line
      key={i}
      x1="0"
      y1="-88"
      x2="0"
      y2={isHour ? -78 : -84}
      stroke="var(--face-ink)"
      strokeWidth={isHour ? 3.2 : 0.6}
      strokeLinecap={isHour ? "round" : "butt"}
      transform={`rotate(${i * 6})`}
    />
  );
});

const NUMERAL_SETS: Record<GrandfatherNumerals, string[]> = {
  roman: ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"],
  arabic: ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
  "eastern-arabic": ["١٢", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠", "١١"],
};

const NUMERAL_FONTS: Record<GrandfatherNumerals, string> = {
  roman: "'Cinzel', 'Times New Roman', serif",
  arabic: "'Cinzel', 'Times New Roman', serif",
  "eastern-arabic": "'Amiri', 'Scheherazade New', 'Times New Roman', serif",
};

/**
 * Grandfather / longcase clock face: brass bezel, ivory dial, hour numerals
 * (Roman, Arabic, or Eastern Arabic), filigree hands. Hour and minute hands
 * sweep continuously; the second hand ticks in discrete one-second steps
 * aligned to network-reference time.
 */
export function GrandfatherFace({ showSeconds = true, numerals = "roman" }: Props) {
  const { active: pulse } = useKonamiCode(
    function onKonamiActivated() {
      void playToccataEasterEgg();
      announceToccata();
    },
    { cooldownMs: 8000 },
  );


  const numeralLabels = useMemo(() => {
    const key: GrandfatherNumerals = NUMERAL_SETS[numerals] ? numerals : "roman";
    const labels = NUMERAL_SETS[key];
    const font = NUMERAL_FONTS[key];
    return labels.map((label, i) => {
      const angleRad = (i * 30 - 90) * (Math.PI / 180);
      const x = Math.cos(angleRad) * 62;
      const y = Math.sin(angleRad) * 62 + 5;
      return (
        <text
          key={label}
          x={x}
          y={y}
          textAnchor="middle"
          fontFamily={font}
          fontSize="15"
          fontWeight="800"
          fill="var(--face-ink)"
        >
          {label}
        </text>
      );
    });
  }, [numerals]);

  // Smooth source for hour + minute (rAF-driven off authoritativeNow()).
  const smooth = useAuthoritativeTick();
  // Discrete source for the second hand — fires exactly on each network-reference whole-second boundary.
  const secondTick = useAuthoritativeSecondTick();

  const smoothDate = new Date(smooth);
  const fractionalMinutes =
    smoothDate.getMinutes() +
    (smoothDate.getSeconds() + smoothDate.getMilliseconds() / 1000) / 60;
  const fractionalHours = (smoothDate.getHours() % 12) + fractionalMinutes / 60;

  const secAngle = new Date(secondTick).getSeconds() * 6;
  const minAngle = fractionalMinutes * 6;
  const hourAngle = fractionalHours * 30;

  return (
    <svg
      viewBox="-110 -110 220 220"
      className={`h-full w-full transition-[filter] duration-700 ${pulse ? "[filter:drop-shadow(0_0_18px_var(--face-brass-hi))]" : ""}`}
    >
      <defs>
        <radialGradient id="brass" cx="0.3" cy="0.3" r="0.9">
          <stop offset="0%" stopColor="var(--face-brass-hi)" />
          <stop offset="60%" stopColor="var(--face-brass)" />
          <stop offset="100%" stopColor="var(--face-brass-lo)" />
        </radialGradient>
        <radialGradient id="dial" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="var(--face-ivory-hi)" />
          <stop offset="100%" stopColor="var(--face-ivory)" />
        </radialGradient>
      </defs>
      {/* Bezel */}
      <circle r="108" fill="url(#brass)" />
      <circle r="96" fill="var(--face-walnut)" />
      <circle r="92" fill="url(#dial)" />
      {/* Minute ticks (static) */}
      {MINUTE_TICKS}
      {/* Hour numerals */}
      {numeralLabels}
      {/* Hour hand — filigree lozenge */}
      <g transform={`rotate(${hourAngle})`}>
        <path d="M 0 8 L -3 -50 L 0 -58 L 3 -50 Z" fill="var(--face-ink)" />
        <circle r="3" fill="var(--face-ink)" />
      </g>
      {/* Minute hand */}
      <g transform={`rotate(${minAngle})`}>
        <path d="M 0 8 L -2 -78 L 0 -84 L 2 -78 Z" fill="var(--face-ink)" />
      </g>
      {/* Second hand — brass with counterweight */}
      {showSeconds && (
        <g transform={`rotate(${secAngle})`}>
          <line x1="0" y1="14" x2="0" y2="-82" stroke="var(--face-brass-lo)" strokeWidth="1" />
          <circle cy="-72" r="3" fill="var(--face-brass-lo)" />
        </g>
      )}
      <circle r="2.5" fill="var(--face-brass-lo)" />
    </svg>
  );
}
