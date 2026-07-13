# Time Chime

A configurable clock for the web, iOS, and Android that plays the Westminster
chimes on the quarter and strikes on the hour — calibrated against selectable network time references.

Time Chime is **free, open-source, and privacy-respecting**. It has no
accounts, no ads, no trackers, and no analytics. All preferences live in your
browser's local storage.

---

## Features

### Clock faces

- **Grandfather** — classic brass-and-walnut longcase. Selectable hour
  numerals: Roman, Western Arabic, or Eastern Arabic.
- **Mid-Century Modern** — flat matte dial with a true continuously
  sweeping second hand modelled on vintage synchronous-electric clocks
  (Telechron, GE). Sans-serif Arabic numerals; the numeral ring can be
  hidden for a minimal tick-only look.
- **Digital · Local** — big legible readout with a natural-language date
  line, IANA timezone, and 12/24 h toggle.
- **Digital · UTC** — ISO-8601 conformant UTC display with day-of-year,
  ISO week, Julian date (6 decimals, whole-second aligned), and Unix time;
  secondary local time line.

### Chimes

- **Westminster** score with the correct five canonical changes (Q1–Q4 +
  hour strike), each change three crotchets and one minim, in the
  historical E-major key by default.
- **Three sound sets**, switchable per-user:
  1. **Church Bell** — warm cast-bronze tower bell (procedural Web Audio).
  2. **Japanese Train Station** — bright vibraphone jingle.
  3. **Pure MIDI** — clinical synthesised voices (WASM SoundFont player).
- **Chime speed slider** — 1× (recalibrated default, ~25 % slower than
  the previous baseline) up to 4×.
- **Transpose** −5 to +6 semitones.
- **Subtle vibrato** via LFO modulation of every voice.
- **Preview button** always plays the _last_ quarter that would have
  fired against the current app clock (rounded to the nearest 15 min
  boundary), so what you hear is what the next real chime will be.

### Sound modes

- **Normal · Quiet · Mute**, with a configurable Quiet volume ceiling
  and an automated **Quiet Hours** window (e.g. 22:00 – 07:00) that
  composes with the manual mode.

### Background chimes (mobile)

- iOS and Android use `@capacitor/local-notifications` with a custom
  notification sound. Opt-in flow with a consent sheet, iOS notification
  permission, and (Android 12+) the `SCHEDULE_EXACT_ALARM` gate.
  Foreground/background handshake prevents double-fire.

### Time reference measurement

- **HTTPS references** - the server queries Time.now and Clock.now; Time.now is preferred by policy.
- **Automatic measurement** - page load, tab focus, and a jittered background schedule request fresh readings.
- **App-only calibration** - a valid estimate adjusts Time Chime's clock and chimes but never changes the operating-system clock.
- **Honest status** - the panel identifies the selected reference, measurement age, and provider response times. It does not claim NTP synchronization or a certified accuracy bound.
- **Provider picker** - choose 1-2 sources; defaults are Time.now then Clock.now.

### Themes & appearance

- **Light · Dark · Grey**, with FOUC-free pre-hydration. All colour,
  border, and accent tokens are OKLCH and audited for WCAG AA contrast.

### Extras

- **OBS Browser Source** — `/obs?face=…&numerals=…&theme=transparent`
  renders a chosen face full-bleed with a transparent background for
  Twitch / YouTube streaming overlays.
- **Konami code easter eggs** — enter ↑↑↓↓←→←→BA on any face for a
  face-specific hidden fanfare.
- **PWA offline shell** — the app loads offline; the `/offline` route
  offers a manual reference measurement when connectivity returns.
- **Donations** — entirely optional links to GitHub Sponsors, Ko-fi,
  and Liberapay on `/support`. No IAP, no store fees, no tracking.

---

## Tech stack

- **React 19** + **TanStack Router** + **TanStack Start** (SSR + server
  functions, deployed as a Nitro bundle; default preset is
  `cloudflare-pages`, easily switched to `node-server`, `vercel`,
  `netlify`, etc.).
- **Tailwind CSS v4** with OKLCH design tokens in `src/styles.css`.
- **Luxon** for all date/time formatting.
- **Web Audio API** for procedural chime synthesis (no bundled audio blobs).
- **Capacitor 8** wrapper for iOS and Android:
  - `@capacitor/local-notifications` for background chimes.
  - `@capacitor/preferences` mirrors browser `localStorage` on device.
- **Vite 7** build tooling. **Bun** as the recommended package manager
  (24-hour `minimumReleaseAge` supply-chain guard).

The project is **standalone** — it has no runtime dependency on any
particular vendor and builds with plain `bun install && bun run build`
on any host that can serve a Nitro bundle.

---

## Getting started

```bash
# Requires Node 20+; bun recommended.
bun install
bun run dev          # web dev server
bun run build        # production build (Nitro Cloudflare preset by default)
bun run test         # security-header, clickjacking, CSP-hash, fuzz, e2e
bun run lint
```

### iOS / Android

See [`README-mobile.md`](./README-mobile.md) for the full Capacitor
workflow, including the mobile smoke script in
[`docs/MOBILE-QA.md`](./docs/MOBILE-QA.md). In short:

```bash
bun run build
npx cap sync
npx cap open ios       # Xcode → run on device (real device required for notif QA)
npx cap open android   # Android Studio
```

---

## Routes

| Path                   | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `/`                    | Main clock (face + preview + settings drawer)                |
| `/support`             | Donation links                                               |
| `/obs`                 | Browser-source overlay for OBS/Streamlabs (URL-configurable) |
| `/offline`             | Offline fallback shown when the PWA has no network           |
| `/sync-guide`          | User-facing guide to OS clock accuracy                       |
| `/background-chimes`   | Guide for enabling mobile background chimes                  |
| `/permissions`         | Explains every permission the app can request                |
| `/privacy`             | Privacy policy                                               |
| `/terms`               | Terms of use                                                 |
| `/third-party-notices` | Licences of bundled OSS                                      |
| `/sitemap`             | HTML sitemap                                                 |

---

## Time-reference services

Time Chime uses these selectable HTTPS JSON services:

- [Time.now](https://time.now/developer/api)
- [Clock.now](https://clock.now/)

These responses help estimate device drift but do not prove Stratum-1 status or
provide NTS authentication. For stronger system-level guarantees, configure the
operating system with an authenticated NTP/NTS client. An authoritative Time
Chime server and NTS bridge are deferred to a future major release.

---

## Time reference architecture

Browsers cannot open raw UDP sockets, so Time Chime does not perform NTP.
The application uses this measurement pipeline:

1. The server function queries selected HTTPS JSON references and records when each provider timestamp arrives.
2. The server projects the selected timestamp to the end of its processing interval.
3. The browser estimates an offset against the midpoint of the complete request and keeps the lowest client-observed response time from four measurements.
4. A valid estimate adjusts only Time Chime's internal clock and chime scheduler. Failure resets the app to device time.

The estimate depends on network-latency assumptions. It is not operating-system clock synchronization, an authoritative time source, or a certified accuracy bound. Measurements are not persisted across page loads; provider preferences are.
---

## Privacy

Time Chime is **privacy-by-design**:

- No cookies, no analytics, no third-party scripts.
- The only network requests during normal use are:
  1. Loading the app bundle from the origin.
  2. Server-side HTTPS reference measurements with no browser PII forwarded.
- Preferences are stored in `localStorage` (web) or the Capacitor
  Preferences vault (native), both on-device only. A versioned settings
  migration (`v1 → v2`) normalises legacy keys without loss.
- The Settings drawer offers one-click **Export my data** and **Delete
  all my data** actions. Global Privacy Control (`Sec-GPC`) and DNT
  are honoured.
- Compliance posture for GDPR, CCPA/CPRA, and the Texas Data Privacy
  and Security Act is summarised on the in-app `/privacy` route and in
  [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md).

---

## Developer notes: audio pipeline

The chime engine is a small, deliberately un-clever Web Audio graph. If you
are adding a sound set, a new phrase, or a background-playback path, this
section is the short tour.

### Shared `AudioContext`

Browsers hard-cap concurrent `AudioContext` instances (Chromium's ceiling
is 6). Every voice, phrase, and easter-egg melody therefore routes through
a single lazily-constructed, module-level context in
`src/lib/chimes/audio.ts`:

- `getSharedAudioContext()` returns the memoised context, or `null` on
  SSR, in headless environments, or when construction throws (autoplay
  policy, hardware exhaustion). Callers must handle `null` — the
  function never throws.
- `unlockAudio()` must be called from a user gesture (button click,
  keydown) to `resume()` the context on browsers that suspend audio
  before interaction. The Settings drawer wires this to the first
  Preview click and to the Enable-chimes toggle.
- `resetAudioSubsystem()` closes and nulls the singleton so the next
  `playPhrase` rebuilds it. The scheduler calls this after a playback
  failure to shake off a wedged driver, muted output device, or
  autoplay-policy state change.
- `measureAudioLatencyMs()` sums `baseLatency` + `outputLatency` and
  feeds the Settings → _Calibrate_ flow, which shifts scheduled chimes
  earlier so the physical strike lands on the wall-clock second (matters
  most on Bluetooth speakers, where ~200 ms is normal).

### Graph shape per phrase

`playPhrase` and `playMelody` share `initPlaybackSession()`:

```
[ voice A ] ┐
[ voice B ] ┼──► bus (GainNode) ──► master (GainNode, volume) ──► destination
[ voice C ] ┘                             │
                                          └──► [optional] delay → feedback → wet
```

- One **master** gain per phrase, cleaned up implicitly when its
  scheduled oscillators stop.
- Voices are pure functions of `(audioCtx, out, freq, when, dur)` —
  `playBellNote` (six sine partials + slow vibrato), `playTrainNote`
  (sine + triangle octave), `playMidiNote` (square + fast vibrato).
  Adding a fourth sound set is: add an `id` to `SoundSetId`, a timing
  row to `SOUND_SET_TIMING`, and a voice function with that signature.
- `attachVibrato()` wires a per-voice LFO into the oscillator's
  `frequency` param; depth ramps in over ~150 ms so the initial strike
  speaks cleanly.
- `BELL_PARTIALS` is hoisted to module scope — a full hourly change
  schedules ~30 notes × 6 partials, and re-allocating the descriptor
  array every strike was measurable GC pressure on low-end Android.

### How the tick drives playback

The chime scheduler does **not** poll `Date.now()`. Every visible pixel
and every scheduled strike derives from `authoritativeNow()` —
`Date.now() + offsetMs`, where `offsetMs` comes from the HTTPS reference estimate in
`src/lib/time/TimeSyncContext.tsx`. An
ESLint rule enforces this outside the time library.

`useAuthoritativeSecondTick()` (`src/hooks/useAuthoritativeSecondTick.ts`)
is the heartbeat:

1. Read `authoritativeNow()`.
2. Compute `1000 - (auth % 1000)` — ms until the next app-clock
   whole-second boundary — and defensively clamp to `[1, 1000]` so a
   corrupted offset can't spin the loop.
3. `setTimeout` for exactly that delay.
4. On fire, re-read `authoritativeNow()` and recurse. This self-
   correcting loop absorbs OS timer jitter and, more importantly, picks
   up a fresh measurement's offset delta on the _next_ tick without any
   explicit invalidation.
5. `visibilitychange` cancels the pending timer on hide and re-arms on
   show, so a backgrounded tab doesn't accumulate a queue of stale
   ticks.

The main clock component subscribes to this tick and, on each fire,
checks whether the second just crossed a quarter (`:00`, `:15`, `:30`,
`:45`). If so, it calls `playPhrase(phrase, opts)` with the correct
phrase (`q1`–`q4` or `hour`), passing user-controlled `speed`,
`transpose`, `volume`, and — for `hour` — the 12-hour reckoned
`hourCount`. `playPhrase` schedules every note against
`audioCtx.currentTime + 0.05`, so the tick fires the _scheduling call_
on the boundary and Web Audio guarantees the _audible strike_ is
sample-accurate from that anchor.

On mobile, background chimes take a different path — see
[`README-mobile.md`](./README-mobile.md) and `src/lib/native/` — because
`AudioContext` is suspended when the app is backgrounded. Those firings
are pre-scheduled via `@capacitor/local-notifications` with a bundled
notification sound, and a foreground/background handshake in
`useBackgroundConsent` prevents the notification and the in-app
scheduler from both striking the same quarter.

### Adding a new phrase or melody

- **New Westminster-shaped phrase**: extend `QUARTER_SEQUENCE` in
  `src/lib/chimes/westminster.ts`. `phraseNotes()` and `phraseBeats()`
  handle the rhythm expansion (3 crotchets + 1 minim per change) for
  free.
- **New Westminster-shaped phrase**: extend `QUARTER_SEQUENCE` in
  `src/lib/chimes/westminster.ts`. `phraseNotes()` and `phraseBeats()`
  handle the rhythm expansion (3 crotchets + 1 minim per change) for
  free.
- **One-off melody** (Konami easter eggs, stingers): call `playMelody`
  with an array of `{ midi, dur }`. Same voice, same vibrato, same
  master routing. Use the optional `delay` send for reverb-flavoured
  tails without adding a convolver.

### Background chime consent (mobile)

Background chimes on iOS and Android are gated by a small state machine
in `src/lib/native/consent.ts`, driven by a Capacitor
`App.appStateChange` listener wired up in
`src/hooks/useBackgroundConsent.ts`. States distinguish
`declined_by_user`, `denied_by_os`, and `revoked` so the sheet copy can
reflect _why_ chimes are off. Every foreground resume calls
`reconcileWithOs()` to detect out-of-app permission changes.

See [`docs/BACKGROUND-CONSENT.md`](./docs/BACKGROUND-CONSENT.md) for
the state diagram, the async-setup / sync-teardown pattern, and the
listener-leak guard that has to run _after_ `App.addListener` resolves.

---

## Repository layout

```
src/
  routes/                        # TanStack Router file routes
    __root.tsx                   # HTML shell, CSP <meta>, pre-hydration guard
    index.tsx                    # Main clock + preview + settings
    obs.tsx                      # OBS browser-source overlay
    offline.tsx                  # PWA offline fallback
    support.tsx sync-guide.tsx …
    api/public/csp-report.tsx    # CSP violation sink (204, no persistence)
  components/
    faces/                       # Grandfather / MidCentury / DigitalLocal / DigitalUtc
    ui/                          # shadcn/ui primitives (locally vendored)
  hooks/
    useAuthoritativeTick.ts
    useAuthoritativeSecondTick.ts
    useSweepAngle.ts             # rAF-driven sweep for the Mid-Century seconds hand
  lib/
    time/                        # TimeSyncContext, now(), format helpers (Luxon)
    time.functions.ts            # Server function → stratum-1 HTTPS sources
    chimes/                      # westminster score, audio graph, scheduler
    http/                        # security headers, CSP, HSTS, burst limiter, HTTPS guard
    native/                      # Capacitor consent state machine + tests
    pwa/                         # register-sw + offline plumbing
    settings.tsx                 # Settings context + versioned migration
  styles.css                     # OKLCH design tokens (Light/Dark/Grey)
docs/
  ARCHITECTURE.md                # Composed pipeline
  OPERATIONS.md                  # Cloudflare rate-limit + Turnstile playbook
  MOBILE-QA.md                   # Real-device smoke script
  COMPLIANCE.md                  # Application profile + operator checklist + SLA
  COMPLIANCE-MAPPING.md          # SOC 2 TSC + ISO/IEC 27001:2022 Annex A tables
  SECURITY-TOP10.md              # OWASP Top 10 (2021) self-review
tests/                           # header, clickjacking, CSP-hash, HTTPS-guard fuzz, e2e
ios/                             # Capacitor iOS project (Info.plist etc.)
android/                         # Capacitor Android project (AndroidManifest.xml etc.)
public/
  _headers                       # Static-asset security headers (mirrored by src/lib/http/)
  .well-known/security.txt
```

---

## Security & compliance

- [`SECURITY.md`](./SECURITY.md) — coordinated disclosure policy.
- [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md) — application profile,
  operator checklist, dependency remediation SLA, weekly ZAP baseline
  workflow.
- [`docs/SECURITY-TOP10.md`](./docs/SECURITY-TOP10.md) — OWASP Top 10
  (2021) self-review with per-item file/test evidence.
- [`docs/COMPLIANCE-MAPPING.md`](./docs/COMPLIANCE-MAPPING.md) — SOC 2
  Trust Services Criteria and ISO/IEC 27001:2022 Annex A control tables.

These are **self-authored control descriptions, not certifications**.

Implemented technical controls include: strict nonce-based CSP,
2-year HSTS with preload, deny-by-default Permissions-Policy (23
directives), Host-header validation with property-based fuzz tests,
in-memory burst limiter (paired with edge WAF per
`docs/OPERATIONS.md`), CSP-report sink with allow-listed fields and
origin-only URL truncation, `bunfig.toml` `minimumReleaseAge = 24h`
supply-chain guard, and CI-gated `npm audit` + OSV-Scanner + weekly
ZAP baseline.

---

## Contributing

Issues and pull requests are welcome. Please read `CONTRIBUTING.md` and
`CODE_OF_CONDUCT.md` first. By contributing, you agree to license your
work under the project's MIT licence.

---

## Licence

MIT — see [`LICENSE`](./LICENSE).

"Westminster Quarters" the chime melody is in the public domain. The
name "Time Chime" is used descriptively; this project is not
affiliated with the Palace of Westminster or the Elizabeth Tower.
