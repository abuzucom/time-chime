# Mobile QA smoke script — background chime consent

Run through this checklist on a **real device** (not a simulator — iOS
Simulator silently drops scheduled `LocalNotifications` firing more than a
few seconds in the future, and the Android emulator doesn't honour the
`SCHEDULE_EXACT_ALARM` gate). Aim for one iOS build and one Android 12+
build before every store submission.

The pure state-machine transitions are already covered by
`src/lib/native/consent.test.ts` (`npm run test:consent`); this script only
covers what depends on the OS.

## Prep

1. `bun run build` and `npx cap sync`.
2. Uninstall the app from the device so first-run state is clean.
3. Airplane mode off; date & time set to **network**.

## iOS (iPhone, iOS 16+)

1. Launch the app for the first time. Consent sheet appears within ~1 s.
   - Copy mentions "iOS" and does **not** mention Android exact-alarms.
2. Tap **Just while the app is open**. Sheet closes. Settings drawer →
   Background chimes row shows "Foreground only" with an "Ask again"
   button. No OS prompt was shown.
3. Tap "Ask again" → sheet re-opens → tap **Allow background chimes**.
   iOS system prompt appears. Tap **Allow**. Row now shows "Enabled" in
   emerald.
4. Force-quit the app. Wait for the next :15 boundary. A notification
   should post with the correct quarter title and sound.
5. Reopen the app **before** the next boundary. Verify the in-tab audio
   fires (foreground path) and no duplicate notification arrives.
6. Go to **Settings.app → Notifications → Time Chime → Allow
   Notifications: off**. Return to the app. The row should transition to
   "Turned off in settings" (amber) within one second of foreground.
7. Tap **Open system settings** on the row. iOS Settings should deep-link
   to Time Chime's notification page.
8. Re-enable notifications in Settings.app, return to the app. Row goes
   back to "Enabled" without re-prompting.

## Android (Pixel or equivalent, Android 13+)

1. Launch. Consent sheet appears; copy mentions **exact alarms** on
   Android 12+.
2. Tap **Allow background chimes**. Android 13 posts the
   `POST_NOTIFICATIONS` runtime prompt — tap **Allow**. Immediately after,
   the app should route the user to the exact-alarm settings screen if it
   is not already granted.
3. Grant exact alarms → return to the app. Row shows "Enabled".
4. Repeat steps 4–7 from the iOS list. The Settings deep-link should land
   on the app's notification settings.
5. Bonus: on a device with "Battery optimization → optimized" set for
   Time Chime, verify chimes still fire at the correct minute. If they
   drift more than 60 s, add Time Chime to the battery-optimization
   allow-list and note the model in the release notes — some OEMs (Xiaomi,
   Huawei) enforce aggressive Doze even with exact alarms.

## Regressions to watch for

- **Double-fire**: foreground audio AND the OS notification playing the
  same quarter. Means the visibility handshake in
  `src/lib/chimes/scheduler.ts` failed to cancel the pending strike.
- **Silent OS prompt**: consent sheet skipped, OS prompt shown alone.
  Means the auto-open guard in `BackgroundConsentSheet.tsx` regressed.
- **Persistent "asking" state**: user swiped the sheet away and reopening
  the app shows the drawer stuck on "Waiting for your choice…". The
  `onOpenChange` fallback in the sheet must call `declineFromSheet()`.

If any of these reproduce, add a covering case to `consent.test.ts` before
fixing.
