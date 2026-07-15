import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTimeSync } from "@/lib/time/TimeSyncContext";
import { deriveReferencePresentation } from "@/lib/time/measurement";
import { driftSeverity } from "@/lib/time/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MEASUREMENT_COOLDOWN_MS = 30_000;

/** Show the current HTTPS reference measurement without OS-sync claims. */
export function TimeSyncBadge() {
  const reference = useTimeSync();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);
<<<<<<< HEAD
  const presentation = deriveReferencePresentation({
    status: reference.status,
    now,
    offsetMs: reference.offsetMs,
    measuredAt: reference.measuredAt,
    selectedReferenceName: reference.selectedReferenceName,
  });
  const severity = reference.status === "available" ? driftSeverity(reference.offsetMs) : null;
=======
  const hasReference =
    sync.lastSyncAt !== null && !sync.error && sync.sources.some((source) => source.ok);
  const severity = hasReference ? driftSeverity(sync.offsetMs) : "warn";
  const label =
    sync.syncing
      ? "Syncing…"
      : hasReference
        ? `Device clock ${formatOffset(sync.offsetMs)}`
        : "Time sync unavailable";
>>>>>>> origin/main

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            "hover:bg-accent",
            severity === null && "border-border text-muted-foreground",
            severity === "ok" &&
              "border-[color:var(--drift-ok)]/40 text-[color:var(--drift-ok-text)]",
            severity === "warn" &&
              "border-[color:var(--drift-warn)]/40 text-[color:var(--drift-warn-text)]",
            severity === "bad" &&
              "border-[color:var(--drift-bad)]/40 text-[color:var(--drift-bad-text)]",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              severity === null && "bg-muted-foreground",
              severity === "ok" && "bg-[color:var(--drift-ok)]",
              severity === "warn" && "bg-[color:var(--drift-warn)]",
              severity === "bad" && "bg-[color:var(--drift-bad)]",
              reference.measuring && "animate-pulse",
            )}
          />
<<<<<<< HEAD
          <span>{presentation.badgeLabel}</span>
=======
          <span>{label}</span>
          {hasReference && sync.rttMs > 0 && (
            <span className="text-muted-foreground">± {Math.round(sync.rttMs / 2)} ms</span>
          )}
>>>>>>> origin/main
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Time reference status</DialogTitle>
        </DialogHeader>
        <ReferencePanelBody now={now} />
      </DialogContent>
    </Dialog>
  );
}

<<<<<<< HEAD
/** Show the current estimate, provider responses, and measurement action. */
function ReferencePanelBody({ now }: { now: number }) {
  const reference = useTimeSync();
  const presentation = deriveReferencePresentation({
    status: reference.status,
    now,
    offsetMs: reference.offsetMs,
    measuredAt: reference.measuredAt,
    selectedReferenceName: reference.selectedReferenceName,
  });
  const severity = reference.status === "available" ? driftSeverity(reference.offsetMs) : null;
  const remainingMs = reference.measuredAt
    ? Math.max(0, MEASUREMENT_COOLDOWN_MS - (now - reference.measuredAt))
    : 0;
  const cooling = remainingMs > 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
=======
/** Dialog body: current drift magnitude/severity, provider list, and sparkline history. */
function DriftPanelBody({ now }: { now: number }) {
  const sync = useTimeSync();
  const hasReference =
    sync.lastSyncAt !== null && !sync.error && sync.sources.some((source) => source.ok);
  const severity = hasReference ? driftSeverity(sync.offsetMs) : "warn";
>>>>>>> origin/main

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Estimated device offset
        </div>
        <div
          className={cn(
            "mt-1 font-mono text-3xl font-light",
            severity === null && "text-muted-foreground",
            severity === "ok" && "text-[color:var(--drift-ok-text)]",
            severity === "warn" && "text-[color:var(--drift-warn-text)]",
            severity === "bad" && "text-[color:var(--drift-bad-text)]",
          )}
        >
<<<<<<< HEAD
          {presentation.offsetLabel}
=======
          {hasReference ? formatOffset(sync.offsetMs) : "No reference"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {hasReference
            ? sync.offsetMs >= 0
              ? "device clock is behind reference"
              : "device clock is ahead of reference"
            : "No current network reference is available"}
          {hasReference && (
            <>{" · uncertainty ± "}{Math.round(sync.rttMs / 2)} ms</>
          )}
>>>>>>> origin/main
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{presentation.detail}</div>
      </div>

      <div>
        <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
          Provider responses
        </div>
        <ul className="space-y-1.5 text-sm">
          {reference.sources.length === 0 && (
            <li className="text-muted-foreground">No provider responses yet.</li>
          )}
          {reference.sources.map((source) => (
            <li key={source.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    source.ok ? "bg-[color:var(--drift-ok)]" : "bg-[color:var(--drift-bad)]",
                  )}
                />
                <span>
                  {source.name}
                  {reference.selectedReferenceId === source.id ? " (selected)" : ""}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {source.ok ? `${source.rttMs} ms response` : (source.error ?? "error")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t pt-3">
<<<<<<< HEAD
        <div className="text-xs text-muted-foreground">{presentation.ageLabel}</div>
        <Button
          size="sm"
          variant="outline"
          disabled={reference.measuring || cooling}
          onClick={() => void reference.measure(undefined, { force: true })}
          title={cooling ? `Wait ${remainingSeconds}s before measuring again` : undefined}
        >
          <RefreshCw className={cn(reference.measuring && "animate-spin")} />
          {cooling ? `Wait ${remainingSeconds}s` : "Measure again"}
        </Button>
=======
        <div className="text-xs text-muted-foreground">
          {sync.lastSyncAt && hasReference
            ? `Last successful sync ${formatRelative(sync.lastSyncAt, now)}`
            : "No successful sync"}
          {sync.inferredCountry && ` · region ${sync.inferredCountry}`}
        </div>
        {(() => {
          // Client-side cooldown to respect NTS operator acceptable-use
          // policies (Cloudflare, NIST, PTB, etc. all forbid tight polling
          // from user-initiated actions). Matches the server-side minimum
          // resync interval so hammering the button cannot flood upstreams.
          const RESYNC_COOLDOWN_MS = 30_000;
          const remainingMs = sync.lastSyncAt
            ? Math.max(0, RESYNC_COOLDOWN_MS - (now - sync.lastSyncAt))
            : 0;
          const cooling = remainingMs > 0;
          const remainingSec = Math.ceil(remainingMs / 1000);
          return (
            <Button
              size="sm"
              variant="outline"
              disabled={sync.syncing || cooling}
              onClick={() => void sync.resync()}
              title={cooling ? `Please wait ${remainingSec}s before resyncing again` : undefined}
            >
              <RefreshCw className={cn(sync.syncing && "animate-spin")} />
              {cooling ? `Wait ${remainingSec}s` : "Resync now"}
            </Button>
          );
        })()}
>>>>>>> origin/main
      </div>

      <div className="rounded-md border border-dashed border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
        This HTTPS measurement estimates an offset for Time Chime only. It does not change your
        operating-system clock or provide a certified accuracy bound. For authenticated system time,{" "}
        <Link
          to="/sync-guide"
          className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
        >
          follow the OS time guide
        </Link>
        .
      </div>
    </div>
  );
}
