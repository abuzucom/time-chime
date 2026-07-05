import { useEffect, useState } from "react";
import { authoritativeNow } from "@/lib/time/now";

/**
 * Fires exactly on each NTS-corrected whole-second boundary.
 *
 * Unlike an rAF loop (which can lag up to a frame past the true second),
 * this scheduler always aims for the next second in *authoritative* time —
 * accounting for the current NTP offset — and re-aligns after every tick,
 * so drift correction from a fresh resync is picked up immediately.
 *
 * Returns the authoritative Unix-ms timestamp at the moment of the tick.
 */
export function useAuthoritativeSecondTick(): number {
  const [now, setNow] = useState(() => authoritativeNow());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      const auth = authoritativeNow();
      // ms until the next whole authoritative second. Defensively clamp:
      // a corrupted `auth` (NaN) would make `delay` NaN → setTimeout treats
      // it as 0 and we'd spin. Floor at 1ms, cap at 1000ms.
      const modulo = Number.isFinite(auth) ? auth % 1000 : 0;
      const rawDelay = 1000 - modulo;
      const delay = Number.isFinite(rawDelay) ? Math.min(1000, Math.max(1, rawDelay)) : 1000;
      timer = setTimeout(() => {
        if (cancelled) return;
        setNow(authoritativeNow());
        scheduleNext();
      }, delay);
    };

    const onVisibility = () => {
      if (timer) clearTimeout(timer);
      if (document.visibilityState === "visible") {
        setNow(authoritativeNow());
        scheduleNext();
      }
    };

    scheduleNext();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return now;
}
