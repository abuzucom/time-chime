import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { authoritativeNow } from "@/lib/time/now";
import { effectiveSoundMode, useSettings } from "@/lib/settings";
import { phraseDurationSeconds, playPhrase, resetAudioSubsystem } from "./audio";
import type { Phrase } from "./westminster";

/**
 * Attempt to play a phrase, retrying once after resetting the shared
 * AudioContext if the first attempt reports failure. On repeated failure the
 * chime is silently dropped for this tick (and the user is notified at most
 * once per session) so a wedged audio device can never crash the scheduler
 * loop or spam toasts every 15 minutes.
 */
async function playWithRetry(
  phrase: Phrase,
  opts: Parameters<typeof playPhrase>[1],
  onDegrade: () => void,
): Promise<void> {
  try {
    const ok = await playPhrase(phrase, opts);
    if (ok) return;
    resetAudioSubsystem();
    const retryOk = await playPhrase(phrase, opts);
    if (!retryOk) onDegrade();
  } catch (err) {
    // playPhrase should not throw, but guard the scheduler loop regardless.
    console.warn("[scheduler] chime playback threw unexpectedly", err);
    resetAudioSubsystem();
    onDegrade();
  }
}


/**
 * Watches authoritative time and triggers Westminster chimes at the quarter
 * boundaries. Runs continuously while the app is in the foreground. Background
 * playback on mobile is handled separately by Capacitor local notifications
 * (documented in README-mobile.md).
 */
export function useChimeScheduler() {
  const settings = useSettings();
  const lastFiredMinute = useRef<number>(-1);
  const audioDegradedNotified = useRef<boolean>(false);

  useEffect(() => {
    let handle: number | null = null;

    /**
     * Show a one-shot toast when audio fails permanently for the session.
     * Kept dedupe'd via `audioDegradedNotified` so a wedged AudioContext can't
     * spam the user every 15 minutes.
     */
    const notifyDegraded = (): void => {
      if (audioDegradedNotified.current) return;
      audioDegradedNotified.current = true;
      try {
        toast.error("Chime playback unavailable", {
          description:
            "The browser audio subsystem rejected playback. Chimes are paused until the page is reloaded or interacted with.",
        });
      } catch {
        // Toast infra unavailable (SSR / test) — degradation itself already logged.
      }
    };

    /**
     * Coerce a value to a finite number in [min, max], falling back to
     * `fallback` on NaN / Infinity / non-numbers. Local to the scheduler so
     * no divisor, delay, or gain we hand to Web Audio / setTimeout is ever
     * non-finite even if user settings get corrupted.
     */
    const clampFinite = (value: unknown, fallback: number, min: number, max: number): number => {
      const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
      return Math.min(max, Math.max(min, numeric));
    };

    /**
     * Fully-validated playback parameters derived from user settings, ready
     * to hand to the audio engine. Returned by `resolveChimeParams`.
     */
    type ChimeParams = {
      vol: number;
      speed: number;
      transpose: number;
    };

    /**
     * Resolve the per-strike audio parameters (volume, speed, transpose)
     * from the current settings, applying the "quiet" mode volume ceiling
     * and clamping every value into the audio engine's finite-safe range.
     */
    const resolveChimeParams = (mode: "normal" | "quiet"): ChimeParams => {
      const master = clampFinite(settings.masterVolume, 0.6, 0, 1);
      const ceiling = clampFinite(settings.quietCeiling, 0.2, 0, 1);
      const vol = master * (mode === "quiet" ? ceiling : 1);
      const speed = clampFinite(settings.chimeSpeed, 1, 0.25, 8);
      const transpose = Math.round(clampFinite(settings.transposeSemitones, 0, -24, 24));
      return { vol, speed, transpose };
    };

    /**
     * Schedule the hour-strike bell to fire after the Q4 melody completes
     * (or immediately, if the melody was suppressed). Uses `setTimeout`
     * with a clamped delay so a NaN/Infinity computed duration can't fire
     * the bell instantly or hang it forever.
     */
    const scheduleHourStrike = (
      params: ChimeParams,
      playedQuarter: boolean,
      hour12: number,
    ): void => {
      const rawDelayMs = playedQuarter
        ? (phraseDurationSeconds("q4", settings.soundSet, 0, params.speed) + 1.2) * 1000
        : 0;
      const delayMs = clampFinite(rawDelayMs, 0, 0, 60_000);
      const fireHourBell = (): void => {
        void playWithRetry(
          "hour",
          {
            setId: settings.soundSet,
            volume: params.vol,
            speed: params.speed,
            transpose: params.transpose,
            hourCount: hour12,
          },
          notifyDegraded,
        );
      };
      window.setTimeout(fireHourBell, delayMs);
    };

    /**
     * Handle a single quarter-boundary crossing (:00 / :15 / :30 / :45):
     * decide which of the quarter melody and hour bell should play under
     * the user's chime settings, then hand them to the audio engine.
     */
    const dispatchQuarter = (nowDate: Date, minute: number, soundMode: "normal" | "quiet"): void => {
      const phrase: Phrase =
        minute === 15 ? "q1" : minute === 30 ? "q2" : minute === 45 ? "q3" : "q4";
      // Two independent decisions: whether the quarter melody plays and
      // whether the hour bell tolls. Collapsing them into one gate let the
      // q4 melody fire when only chimeHour was enabled.
      const playQuarter = settings.chimeQuarters;
      const playHour = phrase === "q4" && settings.chimeHour;
      if (!playQuarter && !playHour) return;

      const params = resolveChimeParams(soundMode);
      if (playQuarter) {
        void playWithRetry(
          phrase,
          { setId: settings.soundSet, volume: params.vol, speed: params.speed, transpose: params.transpose },
          notifyDegraded,
        );
      }
      if (playHour) {
        const hour12 = nowDate.getHours() % 12 || 12;
        scheduleHourStrike(params, playQuarter, hour12);
      }
    };

    /**
     * Poll authoritative time every 250 ms and, when the clock crosses a
     * quarter-hour boundary (:00 / :15 / :30 / :45 at second 0), dispatch
     * exactly one chime for that minute. Self-schedules via `setTimeout`
     * so the loop survives a corrupt clock reading (a NaN tick is skipped
     * rather than propagated).
     */
    const tick = () => {
      const rawNow = authoritativeNow();
      if (!Number.isFinite(rawNow)) {
        // authoritativeNow() already self-heals, but belt-and-braces: skip
        // this tick rather than risk NaN reaching a chime schedule.
        handle = window.setTimeout(tick, 250);
        return;
      }
      // Apply the user's drift-calibration lead: shift the "current" time
      // forward by `chimeLeadMs` so we fire early enough that the sound
      // arrives at the ear on the true quarter boundary. Clamped to a sane
      // ±2s so a corrupt value can't skip whole quarters or fire twice.
      const leadMs = clampFinite(settings.chimeLeadMs, 0, -500, 2000);
      const now = rawNow + leadMs;
      const nowDate = new Date(now);
      const minute = nowDate.getMinutes();
      const bucketKey = nowDate.getHours() * 100 + minute;
      const onBoundary =
        (minute === 0 || minute === 15 || minute === 30 || minute === 45) &&
        nowDate.getSeconds() === 0;

      // Fire only at :00, :15, :30, :45, once per minute crossing.
      if (onBoundary && lastFiredMinute.current !== bucketKey) {
        lastFiredMinute.current = bucketKey;
        const mode = effectiveSoundMode(settings, now);
        if (mode !== "mute") dispatchQuarter(nowDate, minute, mode);
      }



      handle = window.setTimeout(tick, 250);
    };
    tick();
    return () => {
      if (handle !== null) window.clearTimeout(handle);
    };
  }, [settings]);
}
