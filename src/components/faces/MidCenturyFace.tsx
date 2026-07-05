import { toast } from "sonner";
import { useAuthoritativeTick } from "@/hooks/useAuthoritativeTick";
import { useKonamiCode } from "@/hooks/useKonamiCode";
import { playMelody, unlockAudio } from "@/lib/chimes/audio";

type Props = { showSeconds?: boolean; numerals?: boolean };

/**
 * Ubiquitous four-note notification chime: C4 – E4 – G4 – C5. Played on the
 * Japanese-train vibraphone voice for a warm station-platform texture.
 */
const NOTIFICATION_CHIME: readonly { midi: number; dur: number }[] = [
  { midi: 60, dur: 0.22 }, // C4
  { midi: 64, dur: 0.22 }, // E4
  { midi: 67, dur: 0.22 }, // G4
  { midi: 72, dur: 0.9 }, // C5 (rings out)
];

/** Konami-code easter egg: unlock audio then chime C-E-G-C on the train voice. */
async function playNotificationEasterEgg(): Promise<void> {
  await unlockAudio();
  await playMelody(NOTIFICATION_CHIME, {
    setId: "train",
    volume: 0.7,
    speed: 1,
    transpose: 0,
  });
}

function announceNotification(): void {
  toast("🔔 Notification", {
    description: "C · E · G · C — Japanese train tone",
  });
}

// --- Static geometry (hoisted; never changes across renders) -----------------
const HOUR_TICKS = Array.from({ length: 12 }, (_, i) => (
  <rect
    key={i}
    x={-0.8}
    y={-95}
    width={1.6}
    height={8}
    rx="0.6"
    fill="var(--mc-ink)"
    transform={`rotate(${i * 30})`}
  />
));

const ARABIC_NUMERALS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((numeral, i) => {
  const angleRad = (i * 30 - 90) * (Math.PI / 180);
  const x = Math.cos(angleRad) * 74;
  const y = Math.sin(angleRad) * 74 + 6;
  return (
    <text
      key={numeral}
      x={x}
      y={y}
      textAnchor="middle"
      fontFamily="'Work Sans', 'Helvetica Neue', sans-serif"
      fontSize="18"
      fontWeight="300"
      fill="var(--mc-ink)"
    >
      {numeral}
    </text>
  );
});

/**
 * Mid-Century Modern face — flat matte dial, thin sans-serif Arabic numerals,
 * slim baton hands, single accent second hand with a TRUE continuous linear
 * sweep in the style of a vintage synchronous-electric clock (Telechron etc.).
 *
 * Easter egg: the Konami code (↑↑↓↓←→←→BA) plays the York "On the Beach"
 * hook on the pure-MIDI square-wave voice.
 */
export function MidCenturyFace({ showSeconds = true, numerals = true }: Props) {
  const now = useAuthoritativeTick();
  const nowDate = new Date(now);
  const ms = nowDate.getMilliseconds();
  const totalSeconds = nowDate.getSeconds() + ms / 1000;
  const fractionalMinutes = nowDate.getMinutes() + totalSeconds / 60;
  const fractionalHours = (nowDate.getHours() % 12) + fractionalMinutes / 60;

  const secAngle = totalSeconds * 6;
  const minAngle = fractionalMinutes * 6;
  const hourAngle = fractionalHours * 30;

  const { active: pulse } = useKonamiCode(
    function onKonamiActivated() {
      void playNotificationEasterEgg();
      announceNotification();
    },
    { cooldownMs: 2500 },
  );


  return (
    <svg
      viewBox="-110 -110 220 220"
      className={`h-full w-full transition-[filter] duration-700 ${pulse ? "[filter:drop-shadow(0_0_18px_var(--mc-accent))]" : ""}`}
    >
      <circle r="105" fill="var(--mc-bezel)" />
      <circle r="100" fill="var(--mc-dial)" />
      {/* Hour ticks (static) */}
      {HOUR_TICKS}
      {/* Arabic numerals (static, optional) */}
      {numerals && ARABIC_NUMERALS}
      {/* Hour hand */}
      <g transform={`rotate(${hourAngle})`}>
        <rect x="-2.5" y="-52" width="5" height="60" rx="1.5" fill="var(--mc-ink)" />
      </g>
      {/* Minute hand */}
      <g transform={`rotate(${minAngle})`}>
        <rect x="-2" y="-82" width="4" height="90" rx="1.5" fill="var(--mc-ink)" />
      </g>
      {/* Second hand — accent color, sweeping */}
      {showSeconds && (
        <g transform={`rotate(${secAngle})`}>
          <rect x="-0.6" y="-88" width="1.2" height="102" fill="var(--mc-accent)" />
          <circle cx="0" cy="-70" r="4" fill="var(--mc-accent)" />
        </g>
      )}
      <circle r="4" fill="var(--mc-ink)" />
      <circle r="1.5" fill="var(--mc-dial)" />
    </svg>
  );
}
