import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Bug,
  Clock,
  Coffee,
  Heart,
  HeartHandshake,
  LifeBuoy,
  Mail,
  ShieldAlert,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support · Time Chime" },
      {
        name: "description",
        content:
          "Get help with Time Chime: troubleshooting for chimes, background notifications, and clock sync, plus ways to contact the developers or support the project.",
      },
    ],
  }),
  component: Support,
});

/**
 * /support
 * --------
 * The support hub. Three concerns, in this priority order:
 *
 *   1. Troubleshooting — surface the most-hit user issues (chimes not
 *      playing, background/permissions, clock drift) with deep-links to
 *      the guide pages that already document each fix.
 *   2. Contact — how to reach a human: bug report, security disclosure,
 *      generic email. All plain outbound anchors; no forms, no backend.
 *   3. Support the project — kept from the previous incarnation of this
 *      route; donations are optional and go direct to the developers via
 *      third-party platforms.
 *
 * We deliberately keep this a static page: no analytics, no
 * "chat with support" widget, and no rel=referrer leakage on outbound
 * links.
 */

const TROUBLESHOOTING = [
  {
    id: "chimes-silent",
    icon: Volume2,
    title: "The chimes aren't playing",
    body: "Check the Mute / Quiet chip on the clock face, verify device volume, and confirm Quiet Hours aren't active in Settings.",
    to: "/background-chimes",
    linkLabel: "How chimes are scheduled",
  },
  {
    id: "background",
    icon: Bell,
    title: "Chimes don't ring when the app is closed",
    body: "Background chimes require a local-notification permission (and, on Android 12+, the Alarms & reminders toggle). Enable them here:",
    to: "/permissions",
    linkLabel: "Manage permissions",
  },
  {
    id: "clock-drift",
    icon: Clock,
    title: "The clock looks off by a second or two",
    body: "Time Chime estimates device drift against selected network references. For stronger guarantees, point your OS clock at an authenticated NTP/NTS service.",
    to: "/sync-guide",
    linkLabel: "OS clock sync guide",
  },
  {
    id: "privacy",
    icon: ShieldAlert,
    title: "What data does the app store?",
    body: "Nothing leaves your device. Preferences and sync history live only in local storage. See the full policy for details on GDPR/CCPA/TDPSA.",
    to: "/privacy",
    linkLabel: "Read the Privacy Policy",
  },
] as const;

const CONTACT = [
  {
    id: "bug",
    icon: Bug,
    label: "Report a bug",
    note: "File an issue on GitHub with reproduction steps.",
    href: "https://github.com/YOUR_HANDLE/westminster/issues/new?labels=bug",
    external: true,
  },
  {
    id: "email",
    icon: Mail,
    label: "Email the developers",
    note: "For questions that don't fit a public issue.",
    href: "mailto:support@example.com",
    external: false,
  },
  {
    id: "security",
    icon: ShieldAlert,
    label: "Report a security issue",
    note: "See SECURITY.md — coordinated disclosure preferred.",
    href: "mailto:security@example.com",
    external: false,
  },
  {
    id: "docs",
    icon: BookOpen,
    label: "Browse the docs",
    note: "Architecture, mobile QA, operations.",
    href: "https://github.com/YOUR_HANDLE/westminster/tree/main/docs",
    external: true,
  },
] as const;

const DONATE = [
  {
    id: "github",
    label: "GitHub Sponsors",
    href: "https://github.com/sponsors/YOUR_HANDLE",
    icon: HeartHandshake,
    note: "Recurring or one-time. Zero platform fees.",
  },
  {
    id: "kofi",
    label: "Ko-fi",
    href: "https://ko-fi.com/YOUR_HANDLE",
    icon: Coffee,
    note: "One-time tips. No account required to give.",
  },
  {
    id: "liberapay",
    label: "Liberapay",
    href: "https://liberapay.com/YOUR_HANDLE",
    icon: Heart,
    note: "Non-profit, weekly recurring donations.",
  },
] as const;

function Support() {
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
            <LifeBuoy className="size-5" />
          </div>
          <h1 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">Support</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Something not working? Start with the troubleshooting shortcuts
            below. If you're still stuck, the developers are one email or
            issue away.
          </p>
        </div>

        {/* -------------------- Troubleshooting -------------------- */}
        <section aria-labelledby="troubleshooting" className="mt-10">
          <h2
            id="troubleshooting"
            className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Troubleshooting
          </h2>
          <div className="mt-3 space-y-2">
            {TROUBLESHOOTING.map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.id}
                  className="rounded-lg border bg-card p-4 sm:flex sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{t.title}</div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t.body}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 sm:mt-0 sm:shrink-0">
                    <Button asChild variant="outline" size="sm">
                      <Link to={t.to}>{t.linkLabel} →</Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* -------------------- Contact -------------------- */}
        <section aria-labelledby="contact" className="mt-10">
          <h2
            id="contact"
            className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Contact
          </h2>
          <div className="mt-3 space-y-2">
            {CONTACT.map((c) => {
              const Icon = c.icon;
              return (
                <a
                  key={c.id}
                  href={c.href}
                  {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-[color:var(--face-brass)]/50 hover:bg-accent/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <div className="text-sm font-medium text-foreground">{c.label}</div>
                      <div className="text-xs text-muted-foreground">{c.note}</div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.external ? "Opens in a new tab →" : "→"}
                  </span>
                </a>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            There is no ticketing system and no live chat. Email is read by a
            small team on best-effort basis; GitHub issues are the fastest
            route for bugs.
          </p>
        </section>

        {/* -------------------- Donate -------------------- */}
        <section aria-labelledby="donate" className="mt-10">
          <h2
            id="donate"
            className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Support the project
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Time Chime is free and always will be. If it's earned a spot on
            your desk, you can send the developers a small thank-you — every
            option is optional.
          </p>
          <div className="mt-3 space-y-2">
            {DONATE.map((p) => {
              const Icon = p.icon;
              return (
                <a
                  key={p.id}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-[color:var(--face-brass)]/50 hover:bg-accent/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <div className="text-sm font-medium text-foreground">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.note}</div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">Opens in a new tab →</span>
                </a>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Time Chime never processes payments itself. Donations are handled
            by the linked platforms under their own terms.
          </p>
        </section>
      </main>
    </div>
  );
}
