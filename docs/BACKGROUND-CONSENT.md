# Background Chime Consent & Capacitor Lifecycle

Developer reference for the code paths that gate Time Chime's background
Westminster chimes on iOS and Android. Read this before touching
`src/lib/native/consent.ts`, `src/lib/native/notifications.ts`, or
`src/hooks/useBackgroundConsent.ts`.

---

## Why a state machine, not a boolean

Background chimes fire audible sound on the user's device while our app
is not in the foreground. That is a stronger contract than "I have
notification permission", and every mainstream platform enforces it in
subtly different ways:

- **iOS** — the OS permission prompt is **one-shot per install**. If we
  fire it before the user understands what we're asking for and they tap
  *Don't Allow*, background chimes are lost forever unless the user
  manually walks into `Settings.app`. Apple's HIG explicitly recommends a
  soft in-app pre-prompt.
- **Android 12+** — notification permission (`POST_NOTIFICATIONS`, since
  API 33) and the `SCHEDULE_EXACT_ALARM` capability are **two separate
  gestures on two separate settings screens**. Users need a mental
  model of *why* we're asking for both before we send them into the
  system UI.
- **Any platform** — the user can revoke permission **after** granting
  it, from outside the app. We need to detect that on resume and update
  our UI so we don't lie about the current state.

A boolean `hasPermission` cannot express "user declined our pre-prompt",
"OS returned denied", or "OS *previously* granted, now revoked". Those
distinctions drive different in-app copy, so we model them explicitly.

## The state machine

Defined in `src/lib/native/consent.ts`:

```text
                                         ┌── declineFromSheet() ──► declined_by_user
    not_asked ── openSheet() ──► asking ─┤
                                         └── grantFromSheet()
                                                ├─► granted
                                                └─► denied_by_os

    granted ── reconcileWithOs() detects drift ─► revoked
    denied_by_os │
    revoked      ├── openSheet() (retry from Settings) ──► asking
                 ┘

    <any state> ── adapter reports "unavailable" ──► unavailable
```

| State | Meaning | UI copy |
| ----- | ------- | ------- |
| `not_asked` | Fresh install, sheet never shown | "Enable background chimes" CTA |
| `asking` | Sheet is open, waiting on user tap | Sheet visible |
| `declined_by_user` | User dismissed the sheet without granting | Soft re-prompt available; we don't nag |
| `granted` | Sheet Allow + OS granted | Background chimes on |
| `denied_by_os` | Sheet Allow + OS denied (or iOS second-ask) | "Open Settings" deep-link CTA |
| `revoked` | We previously had `granted`, OS no longer allows it | "You previously allowed this…" CTA — different copy from `denied_by_os` |
| `unavailable` | No notifications API at all (SSR, opted-out browser, plugin missing) | Hide the toggle entirely |

`granted → revoked` and `denied_by_os / revoked → granted` are the two
transitions triggered by **`reconcileWithOs()`**, which runs every
time we come back to the foreground.

## Purity boundary

`consent.ts` **never imports Capacitor, React, or `window`**. It is a
pure controller factory that takes:

- a `NotificationAdapter` (`src/lib/native/notifications.ts`) — the OS
  seam,
- a `ConsentStorage` (localStorage in production, an in-memory `Map` in
  tests),
- an optional injectable `now()` for time-pinned tests.

This lets `consent.test.ts` cover every transition with plain
`node --test`, no jsdom, no Capacitor stub. Any new transition or
side-effect must remain testable with the same shape — do not reach
directly into `@capacitor/*` or `window` from `consent.ts`.

## Adapter selection

`useBackgroundConsent()` picks the adapter at hook-init time:

- `isNativePlatform()` from `src/lib/native/platform.ts` returns true
  only inside the Capacitor shell → `capacitorNotificationAdapter`.
- Otherwise → `webNotificationAdapter`, which can request the web
  Notifications permission but treats `schedule()` as a no-op (browsers
  can't schedule OS-level background alarms).

The controller is a **module singleton**, lazily built on first hook
call. Building a fresh controller per component would drop subscribers
on unmount and lose the persisted snapshot mid-render.

## Capacitor `appStateChange` listener lifecycle

`@capacitor/app`'s `appStateChange` event fires when the OS moves our
app between foreground and background. We use it to trigger
`reconcileWithOs()` the moment the user comes back — that is the *only*
opportunity to detect that they revoked our permission from
`Settings.app` while we were suspended.

The lifecycle is in `useBackgroundConsent`'s effect, and it has four
subtleties worth calling out.

### 1. Async setup, sync teardown

`App.addListener` is async, but React's effect cleanup is synchronous.
We can't `await` inside the returned cleanup, so the pattern is:

```ts
useEffect(() => {
  let cancelled = false;
  let removeNative: (() => void) | null = null;

  async function attachResumeListener() {
    await controller.reconcileWithOs();
    if (cancelled) return;

    if (isNativePlatform()) {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("appStateChange", (state) => {
        if (state.isActive) void controller.reconcileWithOs();
      });

      // Guard against unmount during the awaits above.
      if (cancelled) {
        void handle.remove();
        return;
      }
      removeNative = () => { void handle.remove(); };
    }
  }

  void attachResumeListener();
  return () => {
    cancelled = true;
    removeNative?.();
  };
}, [controller]);
```

### 2. The "unmount during setup" leak

If the component unmounts between `App.addListener` starting and its
Promise resolving, the returned cleanup closure has already captured
`removeNative === null` and cannot detach anything. Without the
`if (cancelled) { void handle.remove(); return; }` guard **after** the
listener resolves, the native listener leaks for the lifetime of the
JS isolate. On a hot-reload-heavy dev session that means dozens of stale
listeners all firing `reconcileWithOs` on every resume.

### 3. Unconditional first reconciliation

The very first thing `attachResumeListener` does — even before wiring
the OS listener — is call `controller.reconcileWithOs()`. This corrects
a stale `granted` snapshot from the previous launch **before** the UI
paints its first frame based on the persisted state. Without this,
users who revoked in Settings between sessions would briefly see
"Background chimes on" before we noticed and corrected it.

### 4. Web build uses `visibilitychange`

The Capacitor listener is behind an `isNativePlatform()` gate. In the
browser build we subscribe to `document.visibilitychange` instead —
same semantics (fires on tab focus, which is the web equivalent of an
OS-level app switch), no dependency on `@capacitor/app`. Both listeners
call the same `controller.reconcileWithOs()`, so the state machine
never has to know which platform triggered the reconciliation.

## Adding a new transition

If you need a new state or transition:

1. Add the state to the `ConsentState` union in `consent.ts` and to the
   ASCII diagram at the top of that file.
2. Route every transition through `commit()` so persistence and
   subscriber notification stay atomic — do NOT mutate `snapshot`
   directly.
3. Add a `node --test` case in `consent.test.ts` covering the new
   transition using the in-memory storage and a fake adapter.
4. Update the UI copy table in the consent sheet component so the new
   state has a defined presentation. Missing copy is a UX bug, not a
   compile error.

## Related files

- `src/lib/native/consent.ts` — pure state machine.
- `src/lib/native/consent.test.ts` — transition coverage.
- `src/lib/native/notifications.ts` — Capacitor + web adapters,
  including the Android 12+ `SCHEDULE_EXACT_ALARM` opportunistic
  request.
- `src/lib/native/platform.ts` — `isNativePlatform()` /
  `currentPlatform()` guards.
- `src/hooks/useBackgroundConsent.ts` — React binding + lifecycle
  wiring described above.
- `README-mobile.md` and `docs/MOBILE-QA.md` — real-device smoke steps
  that exercise the revoke → resume → `revoked` path.
