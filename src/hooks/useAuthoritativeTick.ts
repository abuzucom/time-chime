import { useEffect, useState } from "react";
import { authoritativeNow } from "@/lib/time/now";

/**
 * Subscribes a component to an rAF-driven tick derived from authoritativeNow().
 * Pauses when the tab is hidden. Returns the corrected Unix ms timestamp.
 */
export function useAuthoritativeTick(): number {
  const [now, setNow] = useState(() => authoritativeNow());

  useEffect(() => {
    let frame = 0;
    let running = true;
    const loop = () => {
      if (!running) return;
      setNow(authoritativeNow());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        running = false;
        cancelAnimationFrame(frame);
      } else {
        running = true;
        frame = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return now;
}
