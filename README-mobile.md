# Time Chime — Mobile (iOS & Android)

Time Chime ships as a **Capacitor 8** wrapper around the web build. The
same React bundle runs on the phone; the wrapper adds:

- **Background chimes** via `@capacitor/local-notifications` with a
  custom notification sound so the correct Westminster quarter fires
  even when the app is backgrounded or the screen is locked.
- **On-device preference storage** via `@capacitor/preferences`, mirroring
  browser `localStorage` on native.
- **Consent flow** for iOS notifications and (Android 12+) the
  `SCHEDULE_EXACT_ALARM` gate.

The mobile projects live under `ios/` and `android/` and are committed
to the repo — you do not need to regenerate them.

---

## Prerequisites

| Tool | Version |
| ---- | ------- |
| Node | 20 LTS+ |
| Bun  | 1.1+ (recommended package manager) |
| Xcode | 15+ (iOS build; macOS only) |
| Android Studio | Hedgehog / Iguana or newer |
| JDK | 17 (bundled with Android Studio) |
| CocoaPods | 1.15+ (`sudo gem install cocoapods`) |

---

## First-time setup

```bash
bun install
bun run build
npx cap sync
```

`cap sync` copies the web bundle into `ios/App/App/public` and
`android/app/src/main/assets/public`, then runs `pod install` on iOS.
Re-run it after every `bun run build`.

---

## iOS

```bash
bun run build && npx cap sync ios
npx cap open ios              # opens ios/App/App.xcworkspace in Xcode
```

Then in Xcode:

1. Select a signing team (Signing & Capabilities tab).
2. Pick a real device — the iOS Simulator silently drops
   `LocalNotifications` scheduled more than a few seconds in the future,
   so background-chime QA **must** run on hardware.
3. Product → Run.

`ios/App/App/Info.plist` already declares the notification usage strings
and background modes the app needs. Do not remove them.

### App Store submission checklist

- Version + build number bumped in Xcode general tab.
- `Info.plist` privacy strings still describe the true use.
- Screenshots regenerated (light theme, all four faces).
- Privacy Nutrition Label in App Store Connect matches
  [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md) — "Data Not Collected"
  across every category.
- Push the branch, tag the release, run the smoke script below on a
  real device.

---

## Android

```bash
bun run build && npx cap sync android
npx cap open android          # opens android/ in Android Studio
```

Then in Android Studio:

1. Build → Generate Signed Bundle / APK for a release build.
2. Deploy to a physical Pixel or equivalent — the Android emulator does
   not honour the `SCHEDULE_EXACT_ALARM` gate correctly.

`android/app/src/main/AndroidManifest.xml` already declares:

- `POST_NOTIFICATIONS` (Android 13+ runtime permission).
- `SCHEDULE_EXACT_ALARM` + `USE_EXACT_ALARM` (Android 12+, required for
  the chime to fire on the correct minute rather than being coalesced
  into a batched wake-up).
- `RECEIVE_BOOT_COMPLETED` so scheduled chimes survive a reboot.

### Play Store submission checklist

- `versionCode` and `versionName` bumped in `android/app/build.gradle`.
- Signed release AAB uploaded.
- Data safety form matches [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md)
  — "No data collected or shared".
- Target SDK matches Play's current minimum (34 as of 2024, 35 as of
  2025).

---

## Background-chime consent flow

The state machine is pure and lives in `src/lib/native/consent.ts`,
covered by `src/lib/native/consent.test.ts` (`bun run test:consent`).
End-to-end behaviour depends on the OS and MUST be verified on a real
device using the script in [`docs/MOBILE-QA.md`](./docs/MOBILE-QA.md)
before every store submission.

Key rules encoded in the state machine:

- The in-app **consent sheet** shows *before* the OS prompt. Skipping it
  and calling the OS directly is a regression.
- Choosing "Just while the app is open" MUST NOT trigger the OS prompt.
- If the user swipes the sheet away, the state falls back to
  "declined-in-app" — not a stuck "asking" state.
- If OS notifications are turned off in system settings, the app
  detects it on next foreground and offers a deep-link back to the
  right settings screen.

---

## Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| Chime fires the moment the app is backgrounded, then never again | You built for the Simulator | Rebuild for a real device |
| Chime drifts by 30 – 90 s | Android Battery Optimization set to "Optimized" on an aggressive OEM (Xiaomi, Huawei) | Add the app to the battery-optimization allow-list; note the OEM in release notes |
| iOS shows the notification but no sound plays | Focus mode / Silent switch is on, or the custom sound file is missing from the bundle | Verify Focus mode; re-run `npx cap sync ios` |
| Double-fire (in-app audio + notification) | Foreground / background handshake in `src/lib/chimes/scheduler.ts` failed to cancel the pending strike | File an issue; add a covering test to `consent.test.ts` |

---

## Related docs

- [`docs/MOBILE-QA.md`](./docs/MOBILE-QA.md) — real-device smoke script.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — how the chime
  scheduler talks to authoritative time.
- [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md) — data-safety /
  privacy-nutrition source of truth.
