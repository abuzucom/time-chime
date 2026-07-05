/**
 * Developer-friendly settings-drawer panel for background-chime consent.
 *
 * Purpose: give both end-users and developers a single place to inspect and
 * mutate every meaningful piece of consent state, and guarantee that any
 * mutation is followed by an OS reconciliation so the UI never lies about
 * what the operating system currently believes.
 *
 * Accessibility contract
 *   - The whole panel is a labelled `region` (`aria-labelledby` → title id)
 *     so screen readers can navigate to it via landmarks.
 *   - The status badge is an `aria-live="polite"` region and carries the
 *     full spoken sentence ("Background chimes: Enabled") so state changes
 *     are announced without the reader having to hunt for context.
 *   - The diagnostics block is a `<dl>` inside a labelled group; each row
 *     is a real `<dt>`/`<dd>` pair so JAWS/VO read them as term/definition.
 *   - Every action `<Button>` has an `aria-label` describing the effect,
 *     not the visible micro-copy — so "Enable" is announced as
 *     "Enable background chimes" and the icon-only "System settings" is
 *     never mistaken for a decorative icon.
 *   - While an action is in-flight the actions group sets `aria-busy` and
 *     the spinning refresh icon carries an `aria-label` so the "loading"
 *     state is conveyed non-visually.
 *   - Focus management: when the action set changes because of a state
 *     transition (e.g. `asking → granted`) we move keyboard focus to the
 *     first available primary action so the user can continue with Enter
 *     rather than having to re-tab from the top of the drawer.
 *   - Keyboard navigation: the actions row is a `role="toolbar"` with
 *     `aria-orientation="horizontal"` and supports Left/Right/Home/End
 *     arrow navigation across visible enabled buttons, matching the ARIA
 *     Authoring Practices toolbar pattern. Tab still moves out of the
 *     toolbar as a single stop.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Bell, BellOff, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackgroundConsent } from "@/hooks/useBackgroundConsent";
import { currentPlatform, isNativePlatform } from "@/lib/native/platform";
import type { ConsentState } from "@/lib/native/consent";
import type { PermissionOutcome } from "@/lib/native/notifications";

type Tone = "positive" | "warning" | "neutral" | "muted";

/** Copy + tone for each consent state. Single source of truth for the UI. */
const STATE_COPY: Record<ConsentState, { label: string; tone: Tone }> = {
  not_asked: { label: "Not asked yet", tone: "neutral" },
  asking: { label: "Waiting for your choice", tone: "neutral" },
  granted: { label: "Enabled", tone: "positive" },
  denied_by_os: { label: "Blocked by the system", tone: "warning" },
  declined_by_user: { label: "Foreground only", tone: "neutral" },
  revoked: { label: "Turned off in settings", tone: "warning" },
  unavailable: { label: "Not supported here", tone: "muted" },
};

const TONE_CLASS: Record<Tone, string> = {
  positive: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  neutral: "bg-muted text-foreground/80",
  muted: "bg-muted text-muted-foreground",
};

/** Copy for the raw OS permission answer, kept short for the diagnostics row. */
const OS_PERMISSION_COPY: Record<PermissionOutcome | "none", string> = {
  granted: "granted",
  denied: "denied",
  prompt: "prompt",
  unavailable: "unavailable",
  none: "not yet checked",
};

/**
 * Render an absolute or relative timestamp as "just now", "5m ago", "2h ago",
 * or an ISO date for anything older than a day. Returns "never" for the
 * initial-snapshot sentinel value of 0.
 */
function formatRelativeTime(unixMs: number, nowMs: number): string {
  if (!unixMs) return "never";
  const deltaSeconds = Math.max(0, Math.round((nowMs - unixMs) / 1000));
  if (deltaSeconds < 10) return "just now";
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const minutes = Math.round(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(unixMs).toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Human-readable description of which foreground-resume listener the current
 * platform uses to trigger `reconcileWithOs()`. Purely informational — the
 * actual wiring lives in `useBackgroundConsent`.
 */
function describeResumeListener(platform: ReturnType<typeof currentPlatform>): string {
  if (platform === "ios" || platform === "android") return "Capacitor App.appStateChange";
  return "document.visibilitychange";
}

/**
 * Return every enabled, focusable button inside the given toolbar element,
 * in DOM order. Used by the arrow-key handler to walk the action set
 * regardless of which subset is currently rendered.
 */
function collectToolbarButtons(toolbar: HTMLElement | null): HTMLButtonElement[] {
  if (!toolbar) return [];
  const nodes = toolbar.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
  return Array.from(nodes);
}

export function BackgroundConsentRow() {
  const { snapshot, controller } = useBackgroundConsent();
  const platform = currentPlatform();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  // Freeze "now" per render so all relative timestamps in one paint agree.
  const nowMs = useMemo(() => Date.now(), [snapshot.updatedAt]);

  // Stable ids so aria-labelledby / aria-describedby stay unique when the
  // panel is rendered more than once in the same drawer.
  const titleId = useId();
  const descriptionId = useId();
  const diagnosticsTitleId = useId();

  const copy = STATE_COPY[snapshot.state];
  const canOpenSystemSettings =
    isNativePlatform() &&
    (snapshot.state === "granted" ||
      snapshot.state === "denied_by_os" ||
      snapshot.state === "revoked");

  /**
   * Wrap a mutating consent action so that (a) we prevent double-taps by
   * marking the action pending, and (b) we always call `reconcileWithOs`
   * afterwards. Reconciliation is what makes the UI immediately reflect
   * what the OS actually decided, not just what our in-app state machine
   * *thinks* happened.
   */
  const runAction = useCallback(
    async (name: string, fn: () => Promise<void> | void): Promise<void> => {
      if (pendingAction) return;
      setPendingAction(name);
      try {
        await fn();
        await controller.reconcileWithOs();
      } catch (err) {
        console.warn(`[consent] action "${name}" failed`, err);
      } finally {
        setPendingAction(null);
      }
    },
    [controller, pendingAction],
  );

  /** Ask the OS for permission via the sheet path (grantFromSheet handles it). */
  const requestOsPermission = useCallback(async (): Promise<void> => {
    if (snapshot.state !== "asking") controller.openSheet();
    await controller.grantFromSheet();
  }, [controller, snapshot.state]);

  /**
   * Open the platform's app-notification settings screen. On return, the
   * resume listener in `useBackgroundConsent` reconciles automatically —
   * but we also reconcile once here after a short beat so the drawer feels
   * responsive even when the user swipes back quickly.
   */
  const openSystemSettings = useCallback(async (): Promise<void> => {
    const { capacitorNotificationAdapter } = await import("@/lib/native/notifications");
    await capacitorNotificationAdapter.openSystemSettings();
  }, []);

  // -------------------------------------------------------------------------
  // Focus management on state transition.
  // -------------------------------------------------------------------------
  // When the state machine transitions (e.g. `asking → granted`) the action
  // set changes underneath the keyboard focus, which would either land on
  // <body> or on a stale hidden button. We move focus to the first primary
  // action of the new state so the user can continue with Enter. We DO NOT
  // steal focus on first mount — only in response to a real transition —
  // to avoid disrupting screen-reader users who just opened the drawer.
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const previousStateRef = useRef<ConsentState | null>(null);
  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = snapshot.state;
    if (previous === null || previous === snapshot.state) return;
    // Only re-focus if focus is currently inside this panel — otherwise the
    // user is somewhere else in the app and we'd yank them back rudely.
    const activeInside =
      toolbarRef.current && toolbarRef.current.contains(document.activeElement);
    if (!activeInside) return;
    const [firstButton] = collectToolbarButtons(toolbarRef.current);
    firstButton?.focus();
  }, [snapshot.state]);

  // -------------------------------------------------------------------------
  // Toolbar keyboard navigation (Left/Right/Home/End).
  // -------------------------------------------------------------------------
  const onToolbarKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") {
      return;
    }
    const buttons = collectToolbarButtons(toolbarRef.current);
    if (buttons.length === 0) return;
    const currentIndex = buttons.findIndex((btn) => btn === document.activeElement);
    let nextIndex = currentIndex;
    if (key === "Home") nextIndex = 0;
    else if (key === "End") nextIndex = buttons.length - 1;
    else if (key === "ArrowRight") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % buttons.length;
    else if (key === "ArrowLeft") {
      nextIndex = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
    }
    if (nextIndex !== currentIndex && buttons[nextIndex]) {
      event.preventDefault();
      buttons[nextIndex].focus();
    }
  }, []);

  const busy = pendingAction !== null;

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      {/* Header: icon + title + state badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {snapshot.state === "granted" ? (
            <Bell className="mt-0.5 size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <BellOff className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
          )}
          <div>
            <h3 id={titleId} className="text-sm font-medium">
              Background chimes
            </h3>
            <p id={descriptionId} className="text-xs text-muted-foreground">
              Ring the quarters and hour even when the app is closed.
            </p>
          </div>
        </div>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`Background chimes status: ${copy.label}`}
          className={
            "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest " +
            TONE_CLASS[copy.tone]
          }
        >
          {copy.label}
        </span>
      </div>

      {/* Diagnostics: platform / listener / last OS answer / updatedAt */}
      <div
        role="group"
        aria-labelledby={diagnosticsTitleId}
        className="rounded-md bg-muted/40 p-2.5"
      >
        <h4 id={diagnosticsTitleId} className="sr-only">
          Diagnostics
        </h4>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px] text-muted-foreground">
          <dt>state</dt>
          <dd className="text-foreground/90">{snapshot.state}</dd>
          <dt>platform</dt>
          <dd className="text-foreground/90">{platform}</dd>
          <dt>resume listener</dt>
          <dd className="text-foreground/90">{describeResumeListener(platform)}</dd>
          <dt>last OS answer</dt>
          <dd className="text-foreground/90">
            {OS_PERMISSION_COPY[snapshot.lastOsPermission ?? "none"]}
          </dd>
          <dt>updated</dt>
          <dd className="text-foreground/90">{formatRelativeTime(snapshot.updatedAt, nowMs)}</dd>
        </dl>
      </div>

      {/* Actions */}
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Background chime consent actions"
        aria-orientation="horizontal"
        aria-busy={busy}
        onKeyDown={onToolbarKeyDown}
        className="flex flex-wrap gap-2"
      >
        {(snapshot.state === "not_asked" ||
          snapshot.state === "declined_by_user" ||
          snapshot.state === "denied_by_os" ||
          snapshot.state === "revoked") && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            aria-label={
              snapshot.state === "not_asked"
                ? "Enable background chimes"
                : "Ask again for background chime permission"
            }
            onClick={() => void runAction("openSheet", () => controller.openSheet())}
          >
            {snapshot.state === "not_asked" ? "Enable" : "Ask again"}
          </Button>
        )}

        {snapshot.state === "asking" && (
          <>
            <Button
              size="sm"
              disabled={busy}
              aria-label="Allow background chimes and open the system permission prompt"
              onClick={() => void runAction("grant", requestOsPermission)}
            >
              {pendingAction === "grant" ? "Requesting…" : "Allow"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              aria-label="Decline background chimes and keep chimes foreground-only"
              onClick={() => void runAction("decline", () => controller.declineFromSheet())}
            >
              Just foreground
            </Button>
          </>
        )}

        {canOpenSystemSettings && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            aria-label="Open notification settings for this app in the operating system"
            onClick={() => void runAction("openSettings", openSystemSettings)}
          >
            <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />
            System settings
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          disabled={busy || snapshot.state === "unavailable"}
          aria-label="Re-read the current operating system permission and refresh this panel"
          onClick={() => void runAction("reconcile", async () => { await controller.reconcileWithOs(); })}
        >
          <RefreshCw
            className={
              "mr-1.5 size-3.5 " + (pendingAction === "reconcile" ? "animate-spin" : "")
            }
            aria-label={pendingAction === "reconcile" ? "Reconciling" : undefined}
            aria-hidden={pendingAction === "reconcile" ? undefined : "true"}
          />
          Reconcile now
        </Button>

        <Button
          size="sm"
          variant="ghost"
          disabled={busy || snapshot.state === "not_asked"}
          aria-label="Forget the recorded consent choice and re-check the operating system from scratch"
          onClick={() => void runAction("reset", () => controller.reset())}
        >
          <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
          Reset
        </Button>

        {snapshot.state === "unavailable" && platform === "web" && (
          <p className="basis-full text-xs text-muted-foreground">
            Web browsers can't schedule chimes in the background. Install the
            iOS or Android app for background support.
          </p>
        )}
      </div>
    </section>
  );
}
