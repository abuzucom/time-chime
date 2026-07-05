import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Time Chime" },
      {
        name: "description",
        content:
          "The terms governing your use of Time Chime, a free, open-source clock and chime application.",
      },
      { property: "og:title", content: "Terms of Service — Time Chime" },
      {
        property: "og:description",
        content:
          "The terms governing your use of Time Chime, a free, open-source clock and chime application.",
      },
    ],
  }),
  component: Terms,
});

const EFFECTIVE_DATE = "July 2, 2026";

function Terms() {
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

      <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Terms of Service</h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
          Effective {EFFECTIVE_DATE}
        </p>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          This page is maintained by the Time Chime maintainers to describe the terms on which
          Time Chime (the &ldquo;App&rdquo;) is made available. Time Chime is a free,
          open-source clock and chime application. By using the App you agree to these terms. If
          you don&rsquo;t agree, please stop using the App.
        </p>

        <Section id="section-1" title="1. The App is free and provided as-is">
          <p>
            Time Chime is distributed at no cost under the MIT licence. It is provided
            &ldquo;AS IS&rdquo;, without warranty of any kind, express or implied, including but
            not limited to the warranties of merchantability, fitness for a particular purpose,
            and non-infringement. To the maximum extent permitted by law, the maintainers are
            not liable for any claim, damages, or other liability arising from your use of the
            App.
          </p>
          <p>
            The App displays time and plays chimes for informational and aesthetic purposes only.
            It is <strong>not</strong> a certified time source and must not be relied on for
            navigation, aviation, legal timekeeping, medical dosing, financial settlement, or any
            other safety- or compliance-critical purpose.
          </p>
        </Section>

        <Section title="2. Acceptable use" id="section-2">
          <p>
            To keep Time Chime reliable for everyone and to protect the volunteer-run time
            infrastructure it depends on, you agree to follow the rules below when you use the
            App.
          </p>

          <h3 className="mt-4 font-serif text-base text-foreground">2.1 Lawful use</h3>
          <ul className="list-disc space-y-1 break-words pl-5 sm:pl-6">
            <li>Do not use the App in any way that violates applicable law in your jurisdiction.</li>
            <li>
              Do not use the App to harass, defraud, or infringe the rights of any person or
              organisation.
            </li>
          </ul>

          <h3 className="mt-4 font-serif text-base text-foreground">
            2.2 Respect for time providers
          </h3>
          <ul className="list-disc space-y-1 break-words pl-5 sm:pl-6">
            <li>
              Do not attempt to disrupt, overload, or abuse the time-sync endpoints or any
              third-party services the App relies on (see{" "}
              <Link
                to="/sync-guide"
                className="underline underline-offset-2 hover:text-foreground"
              >
                the sync guide
              </Link>{" "}
              for the provider list).
            </li>
            <li>
              Do not remove or bypass client-side rate limits, request batching, or backoff logic
              when redistributing a modified build.
            </li>
          </ul>

          <h3 className="mt-4 font-serif text-base text-foreground">2.3 Integrity of the App</h3>
          <ul className="list-disc space-y-1 break-words pl-5 sm:pl-6">
            <li>
              Do not reverse-engineer the App to circumvent security controls, the Content
              Security Policy, or other integrity protections.
            </li>
            <li>
              Do not represent the App as an authoritative or certified time source. See{" "}
              <a href="#section-1" className="underline underline-offset-2 hover:text-foreground">
                Section 1
              </a>{" "}
              for the &ldquo;as-is&rdquo; disclaimer.
            </li>
          </ul>

          <h3 className="mt-4 font-serif text-base text-foreground">
            2.4 Forks and redistribution
          </h3>
          <ul className="list-disc space-y-1 break-words pl-5 sm:pl-6">
            <li>
              You may fork and redistribute the App under the MIT Licence (see{" "}
              <a href="#section-6" className="underline underline-offset-2 hover:text-foreground">
                Section 6
              </a>
              ), but you must not imply endorsement by the upstream maintainers.
            </li>
            <li>
              If you operate a public deployment, publish your own contact and abuse-handling
              information — do not direct end-user complaints to the upstream project.
            </li>
          </ul>
        </Section>

        <Section id="section-3" title="3. Privacy">
          <p>
            Time Chime collects no accounts, no analytics, and no personal data. All preferences
            are stored on your device. Network requests during normal use are limited to loading
            the app bundle and querying stratum-1 time providers.
          </p>
          <p>
            See the{" "}
            <Link
              to="/privacy"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Privacy Policy
            </Link>{" "}
            for the full policy, records of processing, and your GDPR / CCPA / TDPSA rights.
          </p>
        </Section>

        <Section title="4. Third-party time providers">
          <p>
            The App queries public time endpoints operated by national metrology institutes and
            other independent operators (e.g. NIST, PTB, NPL, NRC, Cloudflare). Those providers
            are governed by their own terms and privacy policies. The maintainers do not control
            and are not responsible for their availability, accuracy, or content.
          </p>
        </Section>

        <Section title="5. Donations">
          <p>
            Donations made through the links on the Support page are processed entirely by the
            respective third-party platforms (GitHub Sponsors, Ko-fi, Liberapay, etc.) under
            their own terms. Donations are voluntary, non-refundable through the App, and do not
            purchase any feature, licence, or support obligation.
          </p>
        </Section>

        <Section id="section-6" title="6. Open-source licence">
          <p>
            The Time Chime source code is licensed under the MIT Licence. You are free to use,
            copy, modify, merge, publish, and distribute it under the terms of that licence, a
            copy of which is included in the repository as <code>LICENSE</code>.
          </p>
          <p>
            Time Chime bundles additional open-source components, each under its own licence.
            See the{" "}
            <Link
              to="/third-party-notices"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Third-Party Notices
            </Link>{" "}
            page for the full list of bundled components and their licences.
          </p>
          <p>
            &ldquo;Time Chime&rdquo; refers descriptively to the public-domain chime melody. The
            App is not affiliated with the Palace of Westminster or the Elizabeth Tower.
          </p>
        </Section>

        <Section title="7. Changes to these terms">
          <p>
            These terms may be updated from time to time. Material changes will be reflected by
            updating the effective date above. Continued use of the App after changes take effect
            constitutes acceptance of the revised terms.
          </p>
        </Section>

        <Section title="8. Contact">
          <p>
            For security disclosures, see <code>SECURITY.md</code> in the repository. For general
            questions, open an issue on the project&rsquo;s public repository.
          </p>
        </Section>

        <p className="mt-10 text-[11px] text-muted-foreground">
          Nothing on this page is legal advice. If you deploy a fork of Time Chime commercially,
          consult a lawyer to tailor these terms to your jurisdiction and use case.
        </p>
      </main>
    </div>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-8 scroll-mt-20">
      <h2 className="font-serif text-xl">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
