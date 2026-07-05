import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Map } from "lucide-react";

export const Route = createFileRoute("/sitemap")({
  head: () => ({
    meta: [
      { title: "Sitemap · Time Chime" },
      {
        name: "description",
        content:
          "Human-readable index of Time Chime's public pages: Terms of Service, Privacy Policy, and Third-Party Notices.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: SitemapPage,
});

/**
 * /sitemap
 * --------
 * A plain, human-readable index of the app's public legal / info pages.
 * Distinct from a machine-readable /sitemap.xml (which crawlers fetch);
 * this is what a visitor sees if they click a "Sitemap" footer link.
 */
const LINKS = [
  {
    to: "/terms",
    label: "Terms of Service",
    description: "How the app may be used, warranty disclaimer, licence.",
  },
  {
    to: "/privacy",
    label: "Privacy Policy",
    description:
      "What data the app handles (spoiler: nothing leaves your device) and your rights under GDPR, CCPA, and TDPSA.",
  },
  {
    to: "/third-party-notices",
    label: "Third-Party Notices",
    description: "Bundled open-source components and their licences.",
  },
] as const;

function SitemapPage() {
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
            <Map className="size-5" />
          </div>
          <h1 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">Sitemap</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            A short index of the legal and reference pages that accompany the
            clock.
          </p>
        </div>

        <nav aria-label="Sitemap" className="mt-8 space-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-[color:var(--face-brass)]/50 hover:bg-accent/40"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {link.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {link.description}
                </span>
              </span>
              <span aria-hidden className="text-muted-foreground">
                →
              </span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
