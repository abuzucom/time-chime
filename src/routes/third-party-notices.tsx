import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/third-party-notices")({
  head: () => ({
    meta: [
      { title: "Third-Party Notices — Time Chime" },
      {
        name: "description",
        content:
          "Open-source components bundled with Time Chime and the licences under which they are distributed.",
      },
      { property: "og:title", content: "Third-Party Notices — Time Chime" },
      {
        property: "og:description",
        content:
          "Open-source components bundled with Time Chime and the licences under which they are distributed.",
      },
    ],
  }),
  component: ThirdPartyNotices,
});

type Entry = {
  name: string;
  license: string;
  url: string;
  purpose: string;
};

type Group = {
  title: string;
  description: string;
  entries: Entry[];
};

const GROUPS: Group[] = [
  {
    title: "Framework & runtime",
    description: "Core libraries that render the app and route requests.",
    entries: [
      {
        name: "React & React DOM",
        license: "MIT",
        url: "https://github.com/facebook/react",
        purpose: "UI runtime.",
      },
      {
        name: "TanStack Router / Start / React Query",
        license: "MIT",
        url: "https://github.com/TanStack",
        purpose: "File-based routing, SSR, and data fetching.",
      },
      {
        name: "Vite",
        license: "MIT",
        url: "https://github.com/vitejs/vite",
        purpose: "Build tool and dev server.",
      },
      {
        name: "TypeScript",
        license: "Apache-2.0",
        url: "https://github.com/microsoft/TypeScript",
        purpose: "Typed source language.",
      },
      {
        name: "Zod",
        license: "MIT",
        url: "https://github.com/colinhacks/zod",
        purpose: "Runtime validation for server-function inputs.",
      },
    ],
  },
  {
    title: "UI, styling & components",
    description: "Design-system primitives and utility libraries.",
    entries: [
      {
        name: "Tailwind CSS & @tailwindcss/vite",
        license: "MIT",
        url: "https://github.com/tailwindlabs/tailwindcss",
        purpose: "Utility-first styling.",
      },
      {
        name: "Radix UI primitives",
        license: "MIT",
        url: "https://github.com/radix-ui/primitives",
        purpose: "Accessible dialog, dropdown, tooltip, and other primitives.",
      },
      {
        name: "shadcn/ui component patterns",
        license: "MIT",
        url: "https://github.com/shadcn-ui/ui",
        purpose: "Component recipes built on Radix + Tailwind.",
      },
      {
        name: "lucide-react",
        license: "ISC",
        url: "https://github.com/lucide-icons/lucide",
        purpose: "Icon set.",
      },
      {
        name: "sonner",
        license: "MIT",
        url: "https://github.com/emilkowalski/sonner",
        purpose: "Toast notifications for reference-measurement and settings errors.",
      },
      {
        name: "vaul",
        license: "MIT",
        url: "https://github.com/emilkowalski/vaul",
        purpose: "Drawer primitive for the settings sheet.",
      },
      {
        name: "cmdk",
        license: "MIT",
        url: "https://github.com/pacocoursey/cmdk",
        purpose: "Command palette primitive.",
      },
      {
        name: "class-variance-authority, clsx, tailwind-merge, tw-animate-css",
        license: "MIT",
        url: "https://github.com/joe-bell/cva",
        purpose: "Class composition and animation utilities.",
      },
      {
        name: "embla-carousel-react, react-resizable-panels, react-day-picker, input-otp, recharts, react-hook-form, @hookform/resolvers",
        license: "MIT",
        url: "https://github.com/",
        purpose: "Auxiliary UI components used by shadcn recipes.",
      },
    ],
  },
  {
    title: "Time, date & audio",
    description: "Libraries powering the clock faces and chime engine.",
    entries: [
      {
        name: "Luxon",
        license: "MIT",
        url: "https://github.com/moment/luxon",
        purpose: "Date, time, and time-zone formatting.",
      },
      {
        name: "date-fns",
        license: "MIT",
        url: "https://github.com/date-fns/date-fns",
        purpose: "Date arithmetic in shadcn calendar recipes.",
      },
      {
        name: "Web Audio API (browser)",
        license: "W3C Software Notice",
        url: "https://www.w3.org/TR/webaudio/",
        purpose: "Synthesises the Time Chime, train-station, and MIDI chime sets.",
      },
    ],
  },
  {
    title: "Mobile (Capacitor)",
    description: "Native shell for the iOS and Android builds.",
    entries: [
      {
        name: "@capacitor/core, @capacitor/app, @capacitor/local-notifications",
        license: "MIT",
        url: "https://github.com/ionic-team/capacitor",
        purpose: "Native bridge and scheduled background chimes.",
      },
      {
        name: "capacitor-native-settings",
        license: "MIT",
        url: "https://github.com/ionic-team/capacitor",
        purpose: "Deep-link into OS notification settings.",
      },
    ],
  },
  {
    title: "Third-party services (network only)",
    description:
      "External endpoints Time Chime contacts at runtime. Their code is not bundled; they are governed by their own terms.",
    entries: [
      {
        name: "Cloudflare platform services",
        license: "See provider terms",
        url: "https://www.cloudflare.com/time/",
        purpose: "Cloudflare platform and infrastructure services.",
      },
      {
        name: "NIST, PTB, NPL, NRC and other national metrology institutes",
        license: "See provider terms",
        url: "https://www.bipm.org/en/time-frequency",
        purpose: "Selectable HTTPS JSON time references.",
      },
    ],
  },
];

function ThirdPartyNotices() {
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

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Third-Party Notices</h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
          Bundled components & licences
        </p>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          Time Chime is built on the open-source ecosystem. The components below are bundled
          with the App or contacted at runtime. Each is used under the licence indicated; the
          full licence text ships with the corresponding package under{" "}
          <code>node_modules/&lt;package&gt;/LICENSE</code> in the repository, and authoritative
          copies are available at the linked upstream projects.
        </p>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Time Chime itself is distributed under the{" "}
          <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
            MIT Licence
          </Link>
          . This page satisfies the attribution requirements of the licences listed here; it does
          not modify or supersede them.
        </p>

        {GROUPS.map((group) => (
          <section key={group.title} className="mt-10">
            <h2 className="font-serif text-xl">{group.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>

            <ul className="mt-4 divide-y divide-border rounded-md border">
              {group.entries.map((entry) => (
                <li key={entry.name} className="flex flex-col gap-1 p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-words text-sm font-medium underline underline-offset-2 hover:text-foreground"
                    >
                      {entry.name}
                    </a>
                    <span className="rounded-sm border px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {entry.license}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{entry.purpose}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-10 text-[11px] text-muted-foreground">
          Notice something missing or mis-attributed? Please open an issue on the project&rsquo;s
          public repository so we can correct it.
        </p>

        <div className="mt-6">
          <Link
            to="/terms"
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            ← Back to Terms of Service
          </Link>
        </div>
      </main>
    </div>
  );
}
