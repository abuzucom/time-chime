# Architecture: Time → Chime Pipeline

This document describes the composed pipeline that carries a single
network reference timestamp from an HTTPS JSON service all the way to a
speaker playing the correct Westminster quarter. Each stage is a small,
independently testable module; stages communicate through plain values
(numbers, records, callbacks) rather than shared mutable state or class
hierarchies.

## Pipeline overview

```text
 ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
 │  HTTPS JSON references │───▶│ Server probe         │───▶│ Client sync loop     │
 │  (NIST, PTB, CF, …)  │    │ time.functions.ts    │    │ TimeSyncContext.tsx  │
 └──────────────────────┘    └──────────────────────┘    └──────────┬───────────┘
                                                                    │ offset, rtt
                                                                    ▼
 ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
 │  Clock faces / UI    │◀───│ Second-boundary tick │◀───│ authoritativeNow()   │
 │  faces/*.tsx         │    │ useAuthoritative…    │    │ time/now.ts          │
 └──────────────────────┘    └──────────────────────┘    └──────────┬───────────┘
                                                                    │
                                                                    ▼
                             ┌──────────────────────┐    ┌──────────────────────┐
                             │ Audio graph          │◀───│ Chime scheduler      │
                             │ chimes/audio.ts      │    │ chimes/scheduler.ts  │
                             └──────────────────────┘    └──────────┬───────────┘
                                                                    │
                                                                    ▼
                                                        ┌──────────────────────┐
                                                        │ Westminster score    │
                                                        │ chimes/westminster.ts│
                                                        └──────────────────────┘
```

## Module responsibilities

### Time acquisition

- **`src/lib/time.functions.ts`** — server-only `createServerFn`s. Owns
  `probeProvider`, which issues an HTTPS request to a single stratum-1
  source from a fixed **allow-list** (`PROVIDER_CATALOG`) — user input
  selects *which* provider, never *what URL* (SSRF-safe by design).
  Cloudflare is the preferred anchor; leap-smeared sources
  (Google Public NTP) are intentionally excluded. Records send/receive
  timestamps and returns a sample
  `{ providerId, serverTime, rtt, uncertainty }`. Knows nothing about
  React, audio, or scheduling. Default provider selection is region-aware
  via the `CF-IPCountry` header.
- **`src/lib/time/TimeSyncContext.tsx`** — client sync loop. Composes
  `takeSingleSample` → `collectBestProbe` → `reduceBestSampleIntoState`,
  with `handleSyncFailure` on the error path and a circuit breaker on
  repeated failure. Enforces `MIN_SYNC_INTERVAL_MS = 60_000` and jitters
  scheduled syncs so multiple tabs do not stampede. Publishes the current
  `{ offsetMs, rttMs, uncertaintyMs, lastSyncAt, history }` via React
  context.
- **`src/lib/time/now.ts`** — pure function `authoritativeNow()` that
  returns `Date.now() + offsetMs`, with `safeFinite` guards so a broken
  sync state can never leak `NaN`/`Infinity` downstream.
- **`src/lib/time/state.ts` / `format.ts`** — plain data helpers built on
  Luxon: drift classification, UTC/local/Julian/Unix formatting, natural
  language dates. No I/O.

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
  opted *in* from an empty baseline, not opted *out* from a permissive
  one.

