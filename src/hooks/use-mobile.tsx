import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Subscribe to viewport width and report whether the client is below the
 * mobile breakpoint (768 px).
 *
 * Uses `window.matchMedia` so re-renders fire on breakpoint crossings only,
 * not on every resize tick. Returns `false` during SSR and until the effect
 * runs on the client (the internal `undefined` initial state is coerced to
 * `false`), avoiding a hydration mismatch.
 *
 * @returns `true` when the current viewport width is `< MOBILE_BREAKPOINT`.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
