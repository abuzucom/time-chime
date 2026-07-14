import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CloudOff, LifeBuoy, RefreshCw, Timer, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTimeSync } from "@/lib/time/TimeSyncContext";

export const Route = createFileRoute("/offline")({
  head: () => ({
    meta: [
      { title: "Offline - Time Chime" },
      {
        name: "description",
        content:
          "Time Chime is offline. The clock and chimes keep running locally; network reference measurements resume after reconnection.",
      },
    ],
  }),
  component: OfflinePage,
});

/** Show local-clock behavior and recovery actions while offline. */
function OfflinePage() {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const { measure, measuredAt } = useTimeSync();
  const [measuring, setMeasuring] = useState(false);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  const reloadPage = () => window.location.reload();

  const measureReference = async () => {
    if (measuring) return;
    setMeasuring(true);
    try {
      await measure(undefined, { force: true });
    } finally {
      setMeasuring(false);
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
            (online ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground")
          }
          aria-hidden="true"
        >
          {online ? <Wifi className="size-6" /> : <CloudOff className="size-6" />}
        </div>

        <h1 className="mt-5 font-serif text-3xl tracking-tight sm:text-4xl">
          {online ? "You are back online" : "You are offline"}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground" role="status">
          {online
            ? "Your connection has returned. Reload the page or return to the clock."
            : "The clock face and chimes use device time while network reference measurements are unavailable."}
        </p>

        <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <Button onClick={reloadPage} className="gap-2">
            <RefreshCw className="size-4" />
            Try again
          </Button>
          <Button
            onClick={measureReference}
            variant="secondary"
            disabled={!online || measuring}
            className="gap-2"
            title={
              online
                ? "Fetch a fresh reading from the configured network references"
                : "Available after reconnection"
            }
          >
            <Timer className={"size-4" + (measuring ? " animate-spin" : "")} />
            {measuring ? "Measuring..." : "Measure network reference"}
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/support">
              <LifeBuoy className="size-4" />
              Get support
            </Link>
          </Button>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          {measuredAt
            ? `Last successful measurement: ${new Date(measuredAt).toLocaleString()}`
            : "No successful measurement recorded in this visit."}
        </p>

        <div className="mt-10 w-full rounded-lg border bg-card p-4 text-left">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            While offline
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">Clock face:</span> uses device time.
            </li>
            <li>
              <span className="text-foreground">Chimes:</span> remain scheduled locally.
            </li>
            <li>
              <span className="text-foreground">Settings:</span> remain in local storage.
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
