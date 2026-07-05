import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/background-chimes")({
  head: () => ({
    meta: [
      { title: "Background chimes on iOS & Android · Time Chime" },
      {
        name: "description",
        content:
          "How Time Chime plays chimes in the background on iOS and Android using local notifications, and the exact permissions and OS settings required to keep them ringing on time.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: BackgroundChimes,
});

/**
 * /background-chimes
 * -----------------
 * User-facing explainer for how background chimes work and how to enable them.
 *
 * The web build cannot play audio while a tab is backgrounded (browser autoplay
 * policy + suspended AudioContext). The native builds use Capacitor
 * LocalNotifications with a bundled audio attachment so the OS itself rings
 * the chime at the scheduled time — no background execution required.
 *
 * This page walks users through granting the right permissions on iOS and
 * Android, and calls out the OS-level toggles (Focus, Do Not Disturb,
 * battery optimisation) that silently break scheduled notifications.
 *
 * Companion to /sync-guide (which covers OS clock accuracy, not chimes).
 */
function BackgroundChimes() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <div className="mb-6 text-xs uppercase tracking-widest text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          ← Back to the clock
        </Link>
      </div>

      <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Chimes that ring while the app is closed
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        Time Chime is designed to be a real clock, not just something you
        look at. On iPhone and Android it can strike the quarter and the
        hour even when the app is in the background, your phone is locked,
        or the screen is off — provided you grant it permission to post
        local notifications with sound.
      </p>

      {/* ---------------- How it works ---------------- */}
      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-foreground">How it works</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            When you open the app it computes the next few quarters and
            hands the schedule to the operating system as a batch of{" "}
            <strong>local notifications</strong>, each with a bundled chime
            audio file attached. When the scheduled moment arrives, the OS
            plays the sound and shows a small banner — even if Time Chime
            was force-quit hours earlier.
          </p>
          <p>
            The schedule is refreshed each time you open the app and
            whenever the OS wakes it briefly. There is no background
            listener, no persistent connection, and nothing is sent to a
            server. The audio and the schedule live entirely on your
            device.
          </p>
          <p>
            You can silence background chimes at any time with the{" "}
            <em>Mute</em> chip on the clock face, or lower them with{" "}
            <em>Quiet mode</em>. Quiet Hours can automatically silence them
            overnight without needing permission from the OS.
          </p>
        </div>
      </section>

      {/* ---------------- iOS ---------------- */}
      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-foreground">iOS / iPadOS</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The first time you open the app you'll be asked{" "}
          <em>&ldquo;Time Chime Would Like to Send You Notifications&rdquo;</em>.
          Tap <strong>Allow</strong>. If you tapped Don't Allow (or later
          turned it off), re-enable it here:
        </p>
        <ol className="mt-4 ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
          <li>
            Settings → <strong>Notifications</strong> → <strong>Time Chime</strong>.
          </li>
          <li>
            Turn on <em>Allow Notifications</em>, and enable{" "}
            <em>Sounds</em>, <em>Lock Screen</em>, and{" "}
            <em>Notification Centre</em>.
          </li>
          <li>
            Set <em>Notification Grouping</em> to <em>By App</em> so the
            quarters don't clutter your lock screen.
          </li>
        </ol>

        <h3 className="mt-6 font-serif text-lg font-semibold text-foreground">
          Things that silently stop the chimes
        </h3>
        <ul className="mt-2 ml-5 list-disc space-y-1 text-sm text-muted-foreground">
          <li>
            <strong>Focus / Do Not Disturb.</strong> Add Time Chime to
            each Focus you use, or enable{" "}
            <em>Time-Sensitive Notifications</em> for the app so quarters
            still ring during Focus.
          </li>
          <li>
            <strong>Silent switch / Silent mode.</strong> The physical
            ring/silent switch mutes notification sounds. Toggle it up to
            hear chimes.
          </li>
          <li>
            <strong>Low Power Mode.</strong> iOS may defer scheduled
            notifications by a minute or two under Low Power Mode.
          </li>
          <li>
            <strong>Not opening the app for weeks.</strong> iOS only
            allows a rolling window of ~64 pending notifications per app.
            Opening Time Chime every couple of days refills the queue.
          </li>
        </ul>
      </section>

      {/* ---------------- Android ---------------- */}
      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-foreground">Android (13+)</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Android 13 introduced runtime notification permission. You'll be
          prompted on first launch — tap <strong>Allow</strong>. To adjust
          it later:
        </p>
        <ol className="mt-4 ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
          <li>
            Settings → <strong>Apps</strong> → <strong>Time Chime</strong> →{" "}
            <strong>Notifications</strong>.
          </li>
          <li>
            Turn on <em>Allow notifications</em> and open the{" "}
            <em>Chimes</em> channel.
          </li>
          <li>
            Set <em>Importance</em> to <strong>High</strong> so the sound
            plays on the lock screen, and choose the bell tone as the
            channel sound.
          </li>
        </ol>

        <h3 className="mt-6 font-serif text-lg font-semibold text-foreground">
          Exact alarms and battery
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          For chimes to ring on the precise second, Time Chime requests
          the <code>SCHEDULE_EXACT_ALARM</code> permission. On Android 14+
          this appears as a separate toggle:
        </p>
        <ol className="mt-3 ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
          <li>
            Settings → Apps → Time Chime → <em>Alarms &amp; reminders</em>{" "}
            → <strong>Allow</strong>.
          </li>
          <li>
            Settings → Apps → Time Chime → <em>Battery</em> → set to{" "}
            <strong>Unrestricted</strong> (or <em>Optimised</em> at
            minimum). <em>Restricted</em> will stop chimes entirely.
          </li>
          <li>
            On Samsung, OnePlus, Xiaomi, and Huawei devices, additionally
            add Time Chime to the <em>Never sleeping apps</em> or{" "}
            <em>Protected apps</em> list — these manufacturers kill
            background scheduling far more aggressively than stock Android.
          </li>
        </ol>

        <h3 className="mt-6 font-serif text-lg font-semibold text-foreground">
          Things that silently stop the chimes
        </h3>
        <ul className="mt-2 ml-5 list-disc space-y-1 text-sm text-muted-foreground">
          <li>
            <strong>Do Not Disturb / Bedtime mode.</strong> Add
            Time Chime's <em>Chimes</em> channel to the DND exception
            list, or use the app's Quiet Hours instead.
          </li>
          <li>
            <strong>Ring volume set to zero.</strong> The chime uses the
            notification stream — turn the notification volume up.
          </li>
          <li>
            <strong>Aggressive battery savers</strong> (Adaptive Battery,
            Deep Sleep, Data Saver) can defer or skip alarms. Whitelist
            the app.
          </li>
        </ul>
      </section>

      {/* ---------------- Web ---------------- */}
      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-foreground">
          On the web
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Browsers do not permit audio to play while a tab is backgrounded
          or the browser itself is closed. On the web, chimes only ring
          while the Time Chime tab is open and focused. To keep the tab
          alive on a spare monitor, pin it in your browser and disable
          tab discarding in the browser's settings. For true background
          operation, install the iOS or Android app.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-foreground">
          Privacy
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Notification permission grants Time Chime the ability to post
          local notifications only. It does <strong>not</strong> give the
          app your location, contacts, microphone, or any network access
          beyond what it already has. Nothing about your chime schedule
          leaves your device. See the{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>{" "}
          for the full breakdown.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-2">
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Return to the clock
        </Link>
        <Link
          to="/sync-guide"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          OS clock sync guide →
        </Link>
      </div>
    </div>
  );
}
