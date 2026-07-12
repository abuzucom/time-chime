import { createFileRoute, Link } from "@tanstack/react-router";
import { Github, Play } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { BackgroundConsentSheet } from "@/components/BackgroundConsentSheet";
import { SoundModeChip } from "@/components/SoundModeChip";
import { TimeSyncBadge } from "@/components/TimeSyncBadge";
import { GrandfatherFace } from "@/components/faces/GrandfatherFace";
import { MidCenturyFace } from "@/components/faces/MidCenturyFace";
import { DigitalLocalFace } from "@/components/faces/DigitalLocalFace";
import { DigitalUtcFace } from "@/components/faces/DigitalUtcFace";
import { playPhrase, phraseDurationSeconds, unlockAudio } from "@/lib/chimes/audio";
import { authoritativeNow } from "@/lib/time/now";
import { keyNameForSemitones } from "@/lib/chimes/westminster";
import { FACE_SHORT_LABEL, SET_SHORT_LABEL } from "@/lib/catalog";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const settings = useSettings();

  /**
   * Play a single-shot preview of the chime that best matches the current
   * authoritative time: rounds to the nearest quarter, plays that quarter's
   * phrase, and — at Q4 or the top of the hour — schedules the hour toll to
   * follow the melody with an appropriate gap. Unlocks the WebAudio context
   * first to satisfy browser autoplay policies.
   */
  const playPreviewChime = async (): Promise<void> => {
    await unlockAudio();
    const nowDate = new Date(authoritativeNow());
    const totalMinutes =
      nowDate.getMinutes() + nowDate.getSeconds() / 60 + nowDate.getMilliseconds() / 60000;
    // Which quarter of the hour are we in? 0 = top of hour, 1 = q1, …, 4 = next top.
    const quarterIndex = Math.round(totalMinutes / 15);
    const speed = settings.chimeSpeed;
    const transpose = settings.transposeSemitones;
    const base = { setId: settings.soundSet, volume: settings.masterVolume, speed, transpose } as const;
    if (quarterIndex === 0 || quarterIndex === 4) {
      const hour24 = nowDate.getHours() + (quarterIndex === 4 ? 1 : 0);
      const hour12 = ((hour24 + 11) % 12) + 1;
      void playPhrase("q4", base);
      const gap = phraseDurationSeconds("q4", settings.soundSet, 0, speed) + 1.2;
      window.setTimeout(() => {
        void playPhrase("hour", { ...base, hourCount: hour12 });
      }, gap * 1000);
    } else {
      const phrase = (["q1", "q2", "q3"] as const)[quarterIndex - 1];
      void playPhrase(phrase, base);
    }
  };

  const setLabel = SET_SHORT_LABEL;
  const faceLabel = FACE_SHORT_LABEL;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top plate — masthead */}
      <header className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-6 px-6 pt-6 sm:px-10 sm:pt-10">
        <div className="flex items-baseline gap-3">
          <span className="font-sans text-2xl font-semibold leading-none tracking-tight">
            Time Chime
          </span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground sm:inline">
            Chronometer · Model 03·E
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SettingsDrawer />
        </div>
      </header>

      <BackgroundConsentSheet />

      <div className="mx-auto mt-4 w-full max-w-6xl px-6 sm:px-10">
        <div className="rule-hair" />
      </div>

      {/* Editorial two-column body */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-stretch gap-12 px-6 py-10 sm:px-10 sm:py-16 lg:grid lg:grid-cols-12 lg:gap-16">
        {/* Clock hero, left */}
        <section className="order-2 flex flex-col items-center justify-center lg:order-1 lg:col-span-7">
          <div className="relative w-full max-w-[min(70vh,30rem)]">
            <div className="aspect-square w-full">
              {settings.face === "grandfather" && settings.ready && <GrandfatherFace showSeconds={settings.showSeconds} numerals={settings.grandfatherNumerals} />}
              {settings.face === "midcentury" && <MidCenturyFace showSeconds={settings.showSeconds} numerals={settings.midcenturyNumerals} />}
              {settings.face === "digital-local" && <DigitalLocalFace />}
              {settings.face === "digital-utc" && <DigitalUtcFace />}
            </div>

            {/* Drift chip — pinned below the face */}
            <div className="mt-6 flex justify-center">
              <TimeSyncBadge />
            </div>
          </div>
        </section>

        {/* Editorial metadata & controls, right */}
        <aside className="order-1 flex flex-col justify-center gap-10 lg:order-2 lg:col-span-5">
          <header className="space-y-2 border-l border-border pl-6">
            <span
              className="font-mono text-[10px] font-medium uppercase tracking-[0.24em]"
              style={{ color: "var(--accent-text)" }}
            >
              NTS Synchronised
            </span>
            <h1 className="font-sans text-4xl font-semibold leading-[1.05] tracking-tight text-foreground">
              The Chronometer
            </h1>
            <p className="max-w-xs text-sm font-light leading-relaxed text-muted-foreground">
              Precision stratum-1 timekeeping — the Westminster sequence, tolled on the quarter,
              in five-four metre.
            </p>
          </header>

          {/* Specification plate */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-l border-border pl-6 font-mono text-[11px]">
            <SpecRow label="Face" value={faceLabel[settings.face] ?? settings.face} />
            <SpecRow label="Voice" value={setLabel[settings.soundSet] ?? settings.soundSet} />
            <SpecRow label="Key" value={keyNameForSemitones(settings.transposeSemitones)} />
            <SpecRow label="Cadence" value={`${settings.chimeSpeed.toFixed(2)}×`} />
          </dl>

          <div className="space-y-6 pl-6">
            {/* Sound mode */}
            <div className="space-y-3">
              <span className="label-eyebrow block">Sound Mode</span>
              <SoundModeChip />
            </div>

            {/* Primary action — preview chime */}
            <button
              type="button"
              onClick={playPreviewChime}
              className="group flex w-full items-center justify-between border border-foreground/85 bg-transparent px-6 py-4 text-foreground transition-colors hover:bg-foreground hover:text-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em]">
                Preview Chime
              </span>
              <Play className="size-4 opacity-60 transition-opacity group-hover:opacity-100" />
            </button>

            {/* Foot rule — settings & support */}
            <div className="flex items-center justify-between border-t border-border pt-4">
              <Link
                to="/support"
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground transition-colors hover:text-foreground"
              >
                FAQ · v{__APP_VERSION__}
              </Link>
              <Link
                to="/support"
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Support the developers
              </Link>
            </div>
          </div>
        </aside>
      </main>

      {/* Colophon */}
      <footer className="mx-auto w-full max-w-6xl px-6 pb-6 sm:px-10 sm:pb-10">
        <div className="rule-hair mb-3" />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>© Time Chime</span>
          <div className="flex flex-wrap items-center gap-x-5">            <a
              href="https://github.com/abuzucom/time-chime"
              aria-label="View Time Chime on GitHub"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="size-3" aria-hidden="true" />
              GitHub
            </a>
            <a href="/privacy" className="hover:text-foreground">
              Privacy
            </a>
            <a
              href="https://github.com/abuzucom/time-chime"
              className="hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-foreground tabular-nums">{value}</dd>
    </div>
  );
}
