import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/sync-guide")({
  head: () => ({
    meta: [
      { title: "Sync your OS clock to Stratum-1 · Time Chime" },
      {
        name: "description",
        content:
          "Step-by-step instructions to configure macOS, Windows, Linux, iOS, and Android to synchronise their system clocks against authoritative Stratum-1 NTP and NTS time sources instead of default pool servers.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: SyncGuide,
});

/** ------------------------------------------------------------------
 * Curated list of Stratum-1 anchors we recommend for OS configuration.
 * NTS-capable entries are preferred because they are authenticated end-
 * to-end and immune to on-path tampering; plain NTP entries are marked.
 * ------------------------------------------------------------------ */
const RECOMMENDED = [
  {
    name: "Cloudflare Time Services",
    host: "time.cloudflare.com",
    nts: true,
    notes: "Anycast, NTS-capable, backed by Cloudflare's stratum-1 fleet.",
  },
  {
    name: "NIST Internet Time Service",
    host: "time.nist.gov",
    nts: false,
    notes: "United States national metrology anchor (NIST, Boulder + Gaithersburg).",
  },
  {
    name: "PTB — Physikalisch-Technische Bundesanstalt",
    host: "ptbtime1.ptb.de",
    nts: false,
    notes: "German national metrology institute; primary caesium clock.",
  },
  {
    name: "NPL — National Physical Laboratory (UK)",
    host: "ntp1.npl.co.uk",
    nts: false,
    notes: "UK national metrology anchor.",
  },
  {
    name: "Netnod NTS",
    host: "nts.netnod.se",
    nts: true,
    notes: "Swedish IX operator; NTS-capable, geographically dispersed.",
  },
  {
    name: "NRC Canada",
    host: "time.chu.nrc.ca",
    nts: false,
    notes: "Canadian national research council; caesium-disciplined.",
  },
];

function SyncGuide() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <div className="mb-6 text-xs uppercase tracking-widest text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          ← Back to the clock
        </Link>
      </div>

      <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Sync your OS clock to a Stratum-1 source
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        Most operating systems ship with a generic <code>pool.ntp.org</code> or
        vendor server enabled by default. Those are volunteer stratum-2/3
        servers with no authentication, variable latency, and no accountability
        for accuracy. If you care about millisecond-level correctness — for
        finance, telecoms, logging, forensics, or just principle — point your
        clock at a <strong>stratum-1</strong> reference disciplined by a
        caesium clock or GNSS, and prefer <strong>NTS</strong> (Network Time
        Security, RFC 8915) so the sync is authenticated end-to-end.
      </p>

      {/* ---------------- Recommended anchors ---------------- */}
      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-foreground">
          Recommended anchors
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick two or three from different operators. Diversity across
          jurisdictions and networks protects you from a single misbehaving
          source.
        </p>
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {RECOMMENDED.map((r) => (
            <li key={r.host} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{r.name}</span>
                  {r.nts ? (
                    <span className="rounded-sm bg-[color:var(--drift-ok)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-[color:var(--drift-ok-text)]">
                      NTS
                    </span>
                  ) : (
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      NTP
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{r.notes}</div>
              </div>
              <code className="mt-1 text-sm text-foreground sm:mt-0">{r.host}</code>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- Per-OS instructions ---------------- */}
      <PlatformSection
        title="macOS (Sonoma / Sequoia)"
        intro="macOS uses timed(8), which speaks NTP but not NTS. Point it at a stratum-1 anchor:"
      >
        <Code>{`# Set the time server (GUI equivalent: System Settings → General → Date & Time)
sudo systemsetup -setnetworktimeserver time.cloudflare.com
sudo systemsetup -setusingnetworktime on

# Force an immediate sync
sudo sntp -sS time.cloudflare.com`}</Code>
        <p className="mt-2 text-xs text-muted-foreground">
          For authenticated NTS on macOS, install <code>chrony</code> via
          Homebrew and disable <code>timed</code>. See the Linux section for a
          chrony config that also applies to macOS.
        </p>
      </PlatformSection>

      <PlatformSection
        title="Windows 10 / 11 / Server"
        intro="Windows Time (w32time) supports NTP only. Edit the peer list from an elevated PowerShell:"
      >
        <Code>{`# Configure multiple stratum-1 anchors (0x8 = client mode, SpecialInterval)
w32tm /config /manualpeerlist:"time.cloudflare.com,0x8 time.nist.gov,0x8 ptbtime1.ptb.de,0x8" /syncfromflags:manual /reliable:yes /update
Restart-Service w32time
w32tm /resync /rediscover

# Verify
w32tm /query /status
w32tm /query /peers`}</Code>
        <p className="mt-2 text-xs text-muted-foreground">
          For NTS on Windows, run <code>chrony</code> or <code>ntpsec</code>{" "}
          inside WSL2 and disable w32time, or use a hardware GNSS/PTP appliance
          for regulated workloads.
        </p>
      </PlatformSection>

      <PlatformSection
        title="Linux — chrony (recommended, supports NTS)"
        intro="chrony is the default on RHEL/Fedora/Ubuntu Server and is the best free client. It speaks NTS out of the box."
      >
        <Code>{`# /etc/chrony/chrony.conf  (or /etc/chrony.conf on RHEL)
# NTS-authenticated stratum-1 anchors — preferred
server time.cloudflare.com iburst nts
server nts.netnod.se       iburst nts

# Plain NTP fallbacks to national metrology institutes
server time.nist.gov       iburst
server ptbtime1.ptb.de     iburst
server ntp1.npl.co.uk      iburst

# Discipline the RTC and log measurements
makestep 1.0 3
rtcsync
logdir /var/log/chrony`}</Code>
        <Code>{`sudo systemctl restart chrony    # or chronyd on RHEL
chronyc sources -v
chronyc tracking
chronyc authdata               # confirm NTS-KE succeeded (Mode = NTS)`}</Code>
      </PlatformSection>

      <PlatformSection
        title="Linux — systemd-timesyncd"
        intro="timesyncd is SNTP-only (no NTS, no discipline history). Acceptable for laptops, not servers."
      >
        <Code>{`# /etc/systemd/timesyncd.conf
[Time]
NTP=time.cloudflare.com time.nist.gov ptbtime1.ptb.de
FallbackNTP=ntp1.npl.co.uk`}</Code>
        <Code>{`sudo systemctl restart systemd-timesyncd
timedatectl timesync-status`}</Code>
      </PlatformSection>

      <PlatformSection
        title="iOS / iPadOS"
        intro="Apple does not expose an NTP server setting on iOS. The system syncs to time.apple.com, which is a well-run stratum-1/2 anycast fleet — the practical remedy is to keep automatic time enabled and rely on this app for authoritative reference in the UI."
      >
        <ul className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
          <li>Settings → General → Date &amp; Time → <em>Set Automatically</em> = ON.</li>
          <li>
            On managed devices, MDM can push a custom{" "}
            <code>com.apple.MCX</code> NTP profile pointing at any host you
            choose (e.g. <code>time.cloudflare.com</code>).
          </li>
          <li>
            For sub-second accuracy on an untethered device, cross-check
            against this app's drift indicator.
          </li>
        </ul>
      </PlatformSection>

      <PlatformSection
        title="Android"
        intro="Stock Android uses NITZ (from the carrier) and Google's NTP servers. There is no per-user server setting without root."
      >
        <ul className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
          <li>Settings → System → Date &amp; time → <em>Set time automatically</em> = ON.</li>
          <li>
            GrapheneOS, LineageOS, and CalyxOS expose an NTP server field —
            set it to <code>time.cloudflare.com</code>.
          </li>
          <li>
            Rooted devices can override <code>ntp_server</code> via{" "}
            <code>settings put global ntp_server time.cloudflare.com</code>.
          </li>
        </ul>
      </PlatformSection>

      {/* ---------------- Verification ---------------- */}
      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-foreground">Verify the result</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Once configured, open the time-sync badge in the top corner of the
          clock. A green pill under ±50 ms means your OS is now within a
          hair's breadth of primary time. Anything red typically means the
          service is disabled, firewalled (UDP/123 outbound blocked), or your
          upstream is still an ISP-provided pool server.
        </p>
        <div className="mt-4">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Return to the clock
          </Link>
        </div>
      </section>

      <p className="mt-10 text-xs text-muted-foreground">
        Nothing you configure here is transmitted to us. All commands run
        locally on your machine and talk directly to the operator you choose.
      </p>
    </div>
  );
}

function PlatformSection({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{intro}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
      <code className="font-mono">{children}</code>
    </pre>
  );
}
