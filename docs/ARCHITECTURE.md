# Architecture: Time Reference to Chime Pipeline

This document describes how an HTTPS reference measurement calibrates Time Chime's internal clock and chime scheduler. The application does not synchronize the operating-system clock and does not claim a certified accuracy bound.

## Pipeline overview

```text
HTTPS JSON references -> server probe -> client measurement -> app-only offset
                                                         |
                                                         v
clock faces <- second-boundary tick <- app clock <- chime scheduler
```

## Module responsibilities

### Time acquisition

- **`src/lib/time.functions.ts`** - probes fixed, allow-listed HTTPS JSON services. It records each provider timestamp and when that timestamp reaches the server. The selected timestamp is projected to the end of server processing. The response retains the existing fields and adds selected-provider identity.
- **`src/lib/time/TimeSyncContext.tsx`** - represents not-measured, measuring, available, and unavailable states. It estimates an app-only offset against the complete client request midpoint and keeps the lowest client-observed response time from four measurements. Provider preferences persist; measurements and offsets do not.
- **`src/lib/time/measurement.ts`** - contains timestamp projection, midpoint offset estimation, and exact state-to-presentation claims.
- **`src/lib/time/now.ts`** - stores the app-only offset used by clock faces and chime scheduling. A failed or pending measurement resets the offset to zero, which means device time.
- **`src/lib/time/state.ts` / `format.ts`** - define state and plain formatting helpers with no I/O.

The HTTPS estimate assumes network delay is sufficiently balanced for a midpoint estimate. RTT is displayed only as provider response time. It is not converted into an uncertainty or accuracy claim.

### Tick generation

- **`src/hooks/useAuthoritativeTick.ts`** — coarse re-render hook for
  UI that updates every N ms against `authoritativeNow()`.
- **`src/hooks/useAuthoritativeSecondTick.ts`** — self-correcting
  `setTimeout` loop that fires exactly on the network-reference-corrected whole-second
  boundary. Consumed by digital faces (so seconds/Julian/Unix digits flip
  in lockstep) and by the scheduler to align chime triggers with real
  wall-clock seconds, not `Date.now()` drift.
- **`src/hooks/useSweepAngle.ts`** — `requestAnimationFrame`-driven hook
  that produces a continuous linear angle for the Mid-Century face's
  vintage synchronous-electric sweep.

### Presentation (composition, not inheritance)

- **`src/components/faces/*`** — Grandfather, MidCentury, DigitalLocal,
  DigitalUtc. Each face is a pure component that takes the current
  authoritative `Date` as a prop; none of them subclass a shared base.
  Behaviour that is genuinely shared (sweep interpolation, tick
  subscription) is a hook, not a superclass.
- **Numeral variants** live inside the face that uses them:
  Grandfather supports Roman / Western Arabic / Eastern Arabic;
  Mid-Century supports numerals-on / numerals-off. Selection is a plain
  settings value read via `useSettings()`.
- **`src/routes/obs.tsx`** — a face-only route that reads `face`,
  `numerals`, and `theme=transparent` from the URL for use as an OBS
  browser source. Rendering path is identical to the main route so no
  face code branches on "OBS mode".

### Chime rendering

- **`src/lib/chimes/westminster.ts`** — pure score. Given a quarter
  (Q1–Q4) plus the hour, returns the correct five canonical changes
  (each three crotchets + one minim) and the hour-strike count. No
  audio, no timing side effects.
- **`src/lib/chimes/audio.ts`** — Web Audio graph. Owns the
  `AudioContext`, the sound-set voices (church bell, train-station
  vibraphone, MIDI SoundFont), an LFO for subtle vibrato, volume scaling
  for Normal/Quiet/Mute, transposition (−5 to +6 semitones), the chime
  speed multiplier (1× default, up to 4×), audio-latency calibration
  offset, and `resetAudioSubsystem()` for recovery. Exposes
  `playPhrase(notes, opts) → boolean`.
- **`src/lib/chimes/scheduler.ts`** — orchestrator. Composes:
  - `resolveChimeParams` — reads settings (speed, transpose, sound set,
    sound mode, quiet hours) into a plain params object.
  - `scheduleHourStrike` / `dispatchQuarter` — turn an authoritative
    time into the correct Westminster phrase.
  - `playWithRetry` — calls `audio.playPhrase`; on failure invokes
    `resetAudioSubsystem()` and retries once, then surfaces a
    session-deduped toast via `sonner`.
  - On native, delegates future strikes to
    `@capacitor/local-notifications` when background consent is granted.

### Settings, persistence, and native bridge

- **`src/lib/settings.tsx`** — React context + persisted store. Owns a
  **versioned migration** (`v1 → v2`) that normalises legacy numeral
  aliases and other renamed keys, plus a `ready` flag so faces do not
  paint a default-Roman flash before hydration. On native, values are
  mirrored to `@capacitor/preferences`.
- **`src/lib/native/consent.ts`** — pure state machine for the
  background-chime consent flow (idle → asking → allowed / declined /
  system-off). Fully unit-tested (`consent.test.ts`); OS behaviour is
  covered by the real-device script in `docs/MOBILE-QA.md`.

### Security & transport

- **`src/lib/http/security-headers.ts`** — HSTS, Permissions-Policy,
  COOP/CORP, Referrer-Policy assembly; mirrored by `public/_headers` and
  verified in lock-step by `scripts/check-route-headers.mjs`.
- **`src/lib/http/pre-hydration.ts`** — nonce + SHA-256 hash for the
  single inline bootstrap script referenced by CSP.
- **`src/lib/http/clickjacking.ts`** — XFO + `frame-ancestors 'none'`
  for every response, including static error pages.
- **`src/lib/http/https-guard.ts`** — Host-header validation, property-fuzzed.
- **`src/lib/http/burst-limiter.ts`** — bounded in-memory sliding-window
  limiter (best-effort last-mile; edge WAF per `docs/OPERATIONS.md` is
  the durable quota).
- **`src/routes/api/public/csp-report.tsx`** — 204-only CSP violation
  sink with a field allow-list and origin-only URL truncation.

## Design rules embodied here

- **Composition over inheritance.** Every stage is a function or a hook.
  The only classes are framework primitives (`AudioContext`, React
  context objects); nothing in `src/` extends another class.
- **Values across boundaries.** Modules exchange serialisable records,
  never shared mutable objects. This is what lets the scheduler,
  faces, and OBS route all consume the same `authoritativeNow()`
  without coordinating.
- **Guards at the edges.** `safeFinite` in `now.ts`, clamping in
  `scheduler.ts`, and the retry in `playWithRetry` mean a fault in one
  stage degrades gracefully instead of propagating `NaN`/`Infinity`
  into `setTimeout` or the Web Audio graph.
- **Deny-by-default at the transport edge.** Every capability
  (Permissions-Policy directive, CSP source, outbound provider URL) is
  opted _in_ from an empty baseline, not opted _out_ from a permissive
  one.
