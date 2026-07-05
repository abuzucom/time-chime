import { useEffect, useRef, useState } from "react";

/**
 * The canonical Konami cheat code: ↑ ↑ ↓ ↓ ← → ← → B A.
 * Exported so the sequence is defined in exactly one place across all four
 * clock faces (and any future consumers).
 */
export const KONAMI_SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;

type Options = {
  /** How long `active` stays `true` after activation, in milliseconds. */
  cooldownMs: number;
};

/**
 * Listen for the Konami code on `window` and invoke `onActivate` once the
 * full sequence is typed. While a previous activation is still within its
 * cooldown window subsequent completions are ignored — this prevents the
 * user from restarting an easter-egg melody on top of itself.
 *
 * The returned `active` flag is `true` from the moment of activation until
 * `cooldownMs` has elapsed, so callers can drive a visual pulse / glow
 * without wiring up their own timer.
 *
 * Matching is case-insensitive for single-character keys (so both `b`/`B`
 * and `a`/`A` count) and a mis-typed key that happens to be the first key
 * of the sequence restarts progress at step 1 rather than 0 — matching the
 * behaviour of the arcade original.
 */
export function useKonamiCode(
  onActivate: () => void,
  { cooldownMs }: Options,
): { active: boolean } {
  // `progressRef` = index of the NEXT expected key in KONAMI_SEQUENCE.
  const progressRef = useRef(0);
  // `activeRef` mirrors `active` so the keydown listener (captured once)
  // can gate re-entry without re-subscribing on every state change.
  const activeRef = useRef(false);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleKeydown(event: KeyboardEvent): void {
      const expected = KONAMI_SEQUENCE[progressRef.current];
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (key !== expected) {
        // A mismatched key may itself be the first key of a new attempt.
        progressRef.current = key === KONAMI_SEQUENCE[0] ? 1 : 0;
        return;
      }

      progressRef.current += 1;
      if (progressRef.current < KONAMI_SEQUENCE.length) return;

      progressRef.current = 0;
      if (activeRef.current) return;
      activeRef.current = true;
      setActive(true);
      onActivateRef.current();
      window.setTimeout(function endCooldown() {
        activeRef.current = false;
        setActive(false);
      }, cooldownMs);
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [cooldownMs]);

  return { active };
}
