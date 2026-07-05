import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CloudOff, LifeBuoy, RefreshCw, Wifi, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTimeSync } from "@/lib/time/TimeSyncContext";

export const Route = createFileRoute("/offline")({
  head: () => ({
    meta: [
      { title: "Offline · Time Chime" },
      {
        name: "description",
        content:
          "Time Chime is offline. The clock and chimes keep running locally; time sync and remote resources will resume once your connection is back.",
      },
    ],
  }),
  component: OfflinePage,
});

/**
 * /offline
 * --------
 * Static fallback shown when the app (or a service worker) determines the
 * network is unreachable. Deliberately dependency-light: no server fn call,
 * no loader, no third-party icons beyond lucide. It must render even when
 * every remote source is down.
 *
 * Behaviour:
 *   - Reflects `navigator.onLine` live via the `online`/`offline` events so
 *     the user sees the state flip without a manual reload.
 *   - "Try again" reloads the current tab; when we arrived here via a
 *     failed navigation, that's the correct recovery.
 *   - Deep-links to /support for troubleshooting, and back to / because the
 *     local clock face works fully offline (chimes, drift display against
 *     the last-known NTS anchor, settings).
 */
function OfflinePage() {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const { resync, lastSyncAt } = useTimeSync();
  const [resyncing, setResyncing] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const handleRetry = () => {
    // Full reload rather than router.invalidate(): the user is on a
    // fallback route and typically wants to re-attempt whatever failed.
    window.location.reload();
  };

  const handleResync = async () => {
    if (resyncing) return;
    setResyncing(true);
    try {
      await resync();
      toast.success("Chime time resynced", {
        description: "Fetched a fresh reading from the configured stratum-1 sources.",
      });
    } catch (error) {
      toast.error("Couldn't resync chime time", {
        description:
          error instanceof Error ? error.message : "Try again once the network is stable.",
      });
    } finally {
      setResyncing(false);
    }
  };

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

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-14 text-center sm:py-20">
        <div
          className={
            "inline-flex size-14 items-center justify-center rounded-full " +
            (online
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-muted text-muted-foreground")
          }
          aria-hidden="true"
        >
          {online ? <Wifi className="size-6" /> : <CloudOff className="size-6" />}
        </div>

        <h1 className="mt-5 font-serif text-3xl tracking-tight sm:text-4xl">
          {online ? "You're back online" : "You're offline"}
        </h1>

        <p
          className="mt-3 text-sm leading-relaxed text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {online
            ? "Your connection has returned. Retry to reload the page you were on, or head back to the clock."
            : "Time Chime couldn't reach the network. The clock face and scheduled chimes keep running from your device — only time-sync updates and remote resources are paused."}
        </p>

        <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center sm:flex-wrap">
          <Button onClick={handleRetry} className="gap-2">
            <RefreshCw className="size-4" />
            Try again
          </Button>
          <Button
            onClick={handleResync}
            variant="secondary"
            disabled={!online || resyncing}
            className="gap-2"
            title={
              online
                ? "Fetch a fresh reading from the configured stratum-1 sources"
                : "Available once your connection returns"
            }
          >
            <Timer className={"size-4" + (resyncing ? " animate-spin" : "")} />
            {resyncing ? "Resyncing…" : "Resync chime time"}
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/support">
              <LifeBuoy className="size-4" />
              Get support
            </Link>
          </Button>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          {lastSyncAt
            ? `Last successful time sync: ${new Date(lastSyncAt).toLocaleString()}`
            : "No successful time sync recorded yet."}
        </p>

        <div className="mt-10 w-full rounded-lg border bg-card p-4 text-left">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            While offline
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">Clock face:</span> renders from
              the last-known NTS offset — drift may grow until the next sync.
            </li>
            <li>
              <span className="text-foreground">Chimes:</span> scheduled
              locally, so quarter-hour strikes continue on time.
            </li>
            <li>
              <span className="text-foreground">Settings:</span> persist to
              local storage; no network required.
            </li>
          </ul>
        </div>

        <p className="mt-6 text-[11px] text-muted-foreground">
          Still stuck after reconnecting? See the{" "}
          <Link to="/support" className="underline underline-offset-2">
            support page
          </Link>{" "}
          for troubleshooting steps.
        </p>
      </main>
    </div>
  );
}
