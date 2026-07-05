import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackgroundConsent } from "@/hooks/useBackgroundConsent";
import { currentPlatform, isNativePlatform } from "@/lib/native/platform";
import type { ConsentState } from "@/lib/native/consent";

export const Route = createFileRoute("/permissions")({
  head: () => ({
    meta: [
      { title: "Permissions · Time Chime" },
      {
        name: "description",
        content:
          "Grant and manage the background notification permission Time Chime needs to ring chimes on the quarter and the hour while the app is closed.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PermissionsPage,
});

/**
 * /permissions
 * ------------
 * User-facing page that both explains WHY background notifications are needed
 * for chimes and provides the buttons to grant / open OS settings / revoke.
 *
 * Design notes
 * ------------
 * - The heavy lifting (state machine, OS reconciliation, adapter selection)
 *   already lives in `useBackgroundConsent`. This page is purely a
 *   presentation surface around that hook — no new business logic.
 * - The page renders three states in one flow:
 *     1. Explanation (always visible)
 *     2. Live status card (colour + copy driven by ConsentState)
 *     3. Action bar (buttons vary by state and by web-vs-native)
 * - On web the "grant" button asks for the Notifications permission via
 *   the Web Notifications API adapter; scheduling itself is a no-op there
 *   (browsers can't wake a suspended tab), so the copy is explicit about
 *   the limitation and directs the user to install the native app.
 * - On native we ALSO nudge users about SCHEDULE_EXACT_ALARM and battery
 *   optimisation, since those are the two things that silently stop
 *   working chimes after permission is granted.
 */
function PermissionsPage() {
  const { snapshot, controller } = useBackgroundConsent();
  const platform = useMemo(currentPlatform, []);
  const native = isNativePlatform();

  async function handleGrant() {
    controller.openSheet();
    const result = await controller.grantFromSheet();
    if (result.state === "granted") {
      toast.success("Background chimes enabled", {
        description: "Time Chime can now ring on the quarter and the hour.",
      });
    } else if (result.state === "denied_by_os") {
      toast.error("Permission denied by the OS", {
        description:
          "Open System Settings to allow notifications for Time Chime.",
      });
    } else if (result.state === "unavailable") {
      toast.error("Notifications aren't available on this device.");
    }
  }

  function handleDecline() {
    controller.openSheet();
    controller.declineFromSheet();
    toast("Kept to foreground only", {
      description: "You can enable background chimes here at any time.",
    });
  }

  async function handleOpenSettings() {
    if (!native) {
      toast("Open your browser's site settings", {
        description:
          "Look for Notifications under this site's permissions in your browser.",
      });
      return;
    }
    // Delegates to capacitor-native-settings via the adapter used by the
    // consent controller; we import here to avoid coupling the page to the
    // notifications module surface.
    const { capacitorNotificationAdapter } = await import(
      "@/lib/native/notifications"
    );
    await capacitorNotificationAdapter.openSystemSettings();
  }

  function handleReset() {
    controller.reset();
    toast("Consent reset", { description: "You'll be asked again on the next chime setup." });
  }

  const status = STATUS_UI[snapshot.state];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to clock
        </Link>
        <span className="font-serif text-lg tracking-wide">Time Chime</span>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <div className="text-center">
          <div className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-[color:var(--face-brass)]/20 text-[color:var(--face-brass-lo)]">
            <Bell className="size-5" />
          </div>
          <h1 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">
            Let the chimes ring in the background
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Time Chime asks for one permission — local notifications — and
            uses it to schedule the chime for the next few quarters. The OS
            plays the sound at the exact moment, even when the app is
            closed. Nothing about your schedule leaves your device.
          </p>
        </div>

        {/* -------------------- Live status card -------------------- */}
        <section
          aria-labelledby="perm-status"
          className={`mt-8 rounded-xl border p-5 ${status.container}`}
        >
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full ${status.iconWrap}`}>
              <status.Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 id="perm-status" className="text-sm font-semibold">
                {status.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{status.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Platform: <span className="font-mono">{platform}</span>
                {snapshot.lastOsPermission ? (
                  <>
                    {" "}· OS answer:{" "}
                    <span className="font-mono">{snapshot.lastOsPermission}</span>
                  </>
                ) : null}
                {snapshot.updatedAt ? (
                  <>
                    {" "}· Updated{" "}
                    {new Date(snapshot.updatedAt).toLocaleString()}
                  </>
                ) : null}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(snapshot.state === "not_asked" ||
              snapshot.state === "declined_by_user" ||
              snapshot.state === "asking") && (
              <>
                <Button onClick={handleGrant} disabled={snapshot.state === "asking"}>
                  {snapshot.state === "asking" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Bell />
                  )}
                  Enable background chimes
                </Button>
                <Button variant="outline" onClick={handleDecline}>
                  <BellOff />
                  Foreground only
                </Button>
              </>
            )}

            {(snapshot.state === "denied_by_os" || snapshot.state === "revoked") && (
              <>
                <Button onClick={handleOpenSettings}>
                  <ExternalLink />
                  Open System Settings
                </Button>
                <Button variant="outline" onClick={() => void controller.reconcileWithOs()}>
                  Re-check
                </Button>
              </>
            )}

            {snapshot.state === "granted" && (
              <>
                <Button variant="outline" onClick={handleOpenSettings}>
                  <ExternalLink />
                  Manage in System Settings
                </Button>
                <Button variant="ghost" onClick={handleReset}>
                  Reset consent
                </Button>
              </>
            )}

            {snapshot.state === "unavailable" && (
              <Button variant="outline" onClick={() => void controller.reconcileWithOs()}>
                Re-check
              </Button>
            )}
          </div>
        </section>

        {/* -------------------- Platform-specific explainer -------------------- */}
        <section className="mt-8 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            What each permission does
          </h2>

          <PermissionRow
            title="Local notifications"
            required
            body="Lets Time Chime ask the OS to play the chime sound at a specific future time and display a small banner. The chime schedule is regenerated locally each time you open the app."
          />

          {platform === "android" && (
            <PermissionRow
              title="Alarms & reminders (SCHEDULE_EXACT_ALARM)"
              required
              body="Android 12+ requires a separate opt-in for alarms to fire at the exact second rather than being batched. Time Chime requests this alongside notifications. Without it, chimes still ring but may drift by a minute or two."
            />
          )}

          {platform === "android" && (
            <PermissionRow
              title="Battery: Unrestricted"
              body="Android's battery saver can silently stop apps from waking up. Set Time Chime to Unrestricted under Settings → Apps → Time Chime → Battery so scheduled chimes always fire."
            />
          )}

          {platform === "ios" && (
            <PermissionRow
              title="Time-Sensitive Notifications"
              body="Enable this in iOS Settings so quarters still ring while a Focus mode is active. The physical silent switch and the volume slider also affect chime audibility."
            />
          )}

          {platform === "web" && (
            <PermissionRow
              title="Browser notifications"
              body="Web browsers do NOT allow audio to play while a tab is backgrounded. On the web, chimes only ring while the Time Chime tab is open. For true background chimes, install the iOS or Android app."
            />
          )}
        </section>

        {/* -------------------- Cross-links -------------------- */}
        <section className="mt-10 rounded-lg border border-dashed p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Related</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              to="/background-chimes"
              className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              How background chimes work
            </Link>
            <Link
              to="/sync-guide"
              className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              OS clock sync guide
            </Link>
            <Link
              to="/privacy"
              className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              Privacy Policy
            </Link>
          </div>
        </section>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          The notification permission grants Time Chime nothing beyond the
          ability to post local notifications. No location, contacts,
          microphone, or network access is enabled by allowing this.
        </p>
      </main>
    </div>
  );
}

function PermissionRow({
  title,
  body,
  required,
}: {
  title: string;
  body: string;
  required?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {required ? (
          <span className="rounded-sm bg-[color:var(--drift-ok)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-[color:var(--drift-ok-text)]">
            Required
          </span>
        ) : (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Recommended
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

// ---------- Status → UI table ----------------------------------------------
// Kept as a lookup table (rather than inline conditionals) so every state has
// a well-defined visual — impossible to accidentally forget one.
const STATUS_UI: Record<
  ConsentState,
  {
    title: string;
    body: string;
    container: string;
    iconWrap: string;
    Icon: typeof Bell;
  }
> = {
  not_asked: {
    title: "Background chimes are off",
    body: "You haven't been asked for permission yet. Tap Enable to grant it now.",
    container: "bg-card",
    iconWrap: "bg-muted text-muted-foreground",
    Icon: BellOff,
  },
  asking: {
    title: "Waiting for your response…",
    body: "Please respond to the OS permission prompt.",
    container: "bg-card",
    iconWrap: "bg-muted text-muted-foreground",
    Icon: Loader2,
  },
  declined_by_user: {
    title: "Chimes will play only while the app is open",
    body: "You chose foreground-only. You can enable background chimes at any time.",
    container: "bg-card",
    iconWrap: "bg-muted text-muted-foreground",
    Icon: BellOff,
  },
  granted: {
    title: "Background chimes are enabled",
    body: "Time Chime can post chime notifications while the app is closed. You're all set.",
    container: "border-[color:var(--drift-ok)]/40 bg-[color:var(--drift-ok)]/10",
    iconWrap: "bg-[color:var(--drift-ok)]/20 text-[color:var(--drift-ok-text)]",
    Icon: ShieldCheck,
  },
  denied_by_os: {
    title: "The OS declined the request",
    body: "iOS only asks once. Open System Settings and enable Notifications for Time Chime.",
    container: "border-destructive/40 bg-destructive/10",
    iconWrap: "bg-destructive/15 text-destructive",
    Icon: XCircle,
  },
  revoked: {
    title: "Permission was revoked",
    body: "Notifications were previously allowed but the OS no longer permits them. Re-enable in System Settings.",
    container: "border-destructive/40 bg-destructive/10",
    iconWrap: "bg-destructive/15 text-destructive",
    Icon: ShieldAlert,
  },
  unavailable: {
    title: "Notifications aren't available here",
    body: "This device or browser doesn't expose a notifications API. Chimes will play only while the app is open.",
    container: "bg-muted/40",
    iconWrap: "bg-muted text-muted-foreground",
    Icon: CheckCircle2,
  },
};
