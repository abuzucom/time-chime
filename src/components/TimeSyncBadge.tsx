import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTimeSync } from "@/lib/time/TimeSyncContext";
import { driftSeverity, formatOffset, formatRelative } from "@/lib/time/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Compact status pill showing the current device-vs-authoritative-time
 * offset and its severity color. Clicking opens a dialog with per-provider
 * RTT results, an offset history sparkline, and a manual re-sync button.
 * Consumes `useTimeSync` internally — takes no props.
 */
export function TimeSyncBadge() {
  const sync = useTimeSync();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const severity = sync.lastSyncAt === null ? "warn" : driftSeverity(sync.offsetMs);
  const label =
    sync.lastSyncAt === null
      ? sync.syncing
        ? "Syncing…"
        : "Not yet synced"
      : `Device clock ${formatOffset(sync.offsetMs)}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
            "hover:bg-accent",
            severity === "ok" && "border-[color:var(--drift-ok)]/40 text-[color:var(--drift-ok-text)]",
            severity === "warn" && "border-[color:var(--drift-warn)]/40 text-[color:var(--drift-warn-text)]",
            severity === "bad" && "border-[color:var(--drift-bad)]/40 text-[color:var(--drift-bad-text)]",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              severity === "ok" && "bg-[color:var(--drift-ok)]",
              severity === "warn" && "bg-[color:var(--drift-warn)]",
              severity === "bad" && "bg-[color:var(--drift-bad)]",
              sync.syncing && "animate-pulse",
            )}
          />
          <span>{label}</span>
          {sync.rttMs > 0 && (
            <span className="text-muted-foreground">± {Math.round(sync.rttMs / 2)} ms</span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Time sync status</DialogTitle>
        </DialogHeader>
        <DriftPanelBody now={now} />
      </DialogContent>
    </Dialog>
  );
}

function DriftPanelBody({ now }: { now: number }) {
  const sync = useTimeSync();
  const severity = sync.lastSyncAt === null ? "warn" : driftSeverity(sync.offsetMs);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Device drift</div>
        <div
          className={cn(
            "mt-1 font-mono text-3xl font-light",
            severity === "ok" && "text-[color:var(--drift-ok-text)]",
            severity === "warn" && "text-[color:var(--drift-warn-text)]",
            severity === "bad" && "text-[color:var(--drift-bad-text)]",
          )}
        >
          {formatOffset(sync.offsetMs)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {sync.offsetMs >= 0 ? "device clock is behind reference" : "device clock is ahead of reference"}
          {" · uncertainty ± "}
          {Math.round(sync.rttMs / 2)} ms
        </div>
      </div>

      {sync.history.length > 1 && <Sparkline samples={sync.history.map((h) => h.offsetMs)} />}

      <div>
        <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Sources</div>
        <ul className="space-y-1.5 text-sm">
          {sync.sources.length === 0 && <li className="text-muted-foreground">No samples yet.</li>}
          {sync.sources.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    s.ok ? "bg-[color:var(--drift-ok)]" : "bg-[color:var(--drift-bad)]",
                  )}
                />
                <span>{s.name}</span>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  Stratum {s.stratum}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {s.ok ? `${s.rttMs} ms` : s.error ?? "error"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <div className="text-xs text-muted-foreground">
          {sync.lastSyncAt ? `Last sync ${formatRelative(sync.lastSyncAt, now)}` : "Never synced"}
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
      </div>

      <div className="rounded-md border border-dashed border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
        Your device clock is set by your operating system, not by this app. To
        make the OS itself sync against Stratum-1 sources instead of default
        pool servers,{" "}
        <Link
          to="/sync-guide"
          className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
        >
          follow the OS sync guide
        </Link>
        .
      </div>
    </div>
  );
}

function Sparkline({ samples }: { samples: number[] }) {
  const svgWidth = 240;
  const svgHeight = 40;
  const max = Math.max(...samples.map(Math.abs), 1);
  const step = svgWidth / Math.max(samples.length - 1, 1);
  // Map an offset sample onto SVG coordinates. `x` walks left-to-right one
  // step per sample; `y` centers 0 on the midline, scales the signed offset
  // to a ±(halfHeight − margin) band, and inverts (SVG y grows downward).
  const halfHeight = svgHeight / 2;
  const yMargin = 3;
  const sampleToSvgPoint = (offsetMs: number, index: number): string => {
    const x = index * step;
    const y = halfHeight - (offsetMs / max) * (halfHeight - yMargin);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const points = samples.map(sampleToSvgPoint).join(" ");
  return (

    <svg width={svgWidth} height={svgHeight} className="text-muted-foreground">
      <line
        x1="0"
        y1={svgHeight / 2}
        x2={svgWidth}
        y2={svgHeight / 2}
        stroke="currentColor"
        strokeOpacity="0.2"
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--drift-ok)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
