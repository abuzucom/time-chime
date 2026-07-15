import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Time Chime" },
      {
        name: "description",
        content:
          "How Time Chime handles data: no accounts, no analytics, no personal data leaves your device.",
      },
      { property: "og:title", content: "Privacy Policy — Time Chime" },
      {
        property: "og:description",
        content:
          "How Time Chime handles data: no accounts, no analytics, no personal data leaves your device.",
      },
    ],
  }),
  component: Privacy,
});

const EFFECTIVE_DATE = "July 2, 2026";

function Privacy() {
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
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
          Effective {EFFECTIVE_DATE}
        </p>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          This page is maintained by the Time Chime maintainers to describe how the App
          (&ldquo;Time Chime&rdquo;) handles data. It is app-owned editable content, not
          independent legal verification. Time Chime is a free, open-source clock and chime
          application. If you deploy a fork commercially, you are responsible for tailoring this
          policy to your jurisdiction and operational reality.
        </p>

        <Section id="section-1" title="1. Summary">
          <ul className="list-disc space-y-1 break-words pl-5 sm:pl-6">
            <li>No accounts. No sign-in. No user profiles.</li>
            <li>No analytics, telemetry, advertising, or tracking pixels.</li>
            <li>Preferences and time-provider choices live in your device&rsquo;s local storage.</li>
            <li>
              Network requests during normal use are limited to loading the app bundle and
              querying selected public HTTPS JSON time references.
            </li>
            <li>
              You can export or delete all local data at any time from the settings drawer.
            </li>
          </ul>
        </Section>

        <Section id="section-2" title="2. What we do not collect">
          <p>
            The maintainers do not operate an account system, ad network, or analytics pipeline
            for Time Chime. Specifically, the App does not collect:
          </p>
          <ul className="list-disc space-y-1 break-words pl-5 sm:pl-6">
            <li>Names, email addresses, phone numbers, or other contact identifiers.</li>
            <li>Precise geolocation, device advertising IDs, or persistent tracking cookies.</li>
            <li>Behavioural analytics, session recordings, or crash-reporting telemetry.</li>
            <li>Contents of your clipboard, contacts, photos, microphone, or camera.</li>
          </ul>
        </Section>

        <Section id="section-3" title="3. What is stored on your device">
          <p>
            The App stores the following in your browser&rsquo;s <code>localStorage</code> (or
            the equivalent app-container storage on iOS and Android). None of it leaves your
            device:
          </p>
          <ul className="list-disc space-y-1 break-words pl-5 sm:pl-6">
            <li>
              Your chosen clock face, sound set, sound mode, quiet hours, chime speed, transpose,
              theme, and time-provider preferences.
            </li>
            <li>
              Your selected HTTPS time providers. Measurement results and clock offsets are not
              retained across page loads.
            </li>
            <li>
              Your consent choice for OS-level background notifications, if you granted it.
            </li>
          </ul>
          <p>
            You can review, export as JSON, or delete this data at any time from the{" "}
            <em>Settings &rarr; Privacy</em> section of the App.
          </p>
        </Section>

        <Section id="section-4" title="4. Network requests during use">
          <p>The App contacts the network only in narrow, documented cases:</p>
          <ul className="list-disc space-y-1 break-words pl-5 sm:pl-6">
            <li>
              Loading the App bundle and static assets from the origin that served the page.
            </li>
            <li>
<<<<<<< HEAD
              Querying selected public HTTPS JSON references through the App server so Time Chime
              can estimate an app-only clock offset. See{" "}
=======
            Querying the public HTTPS JSON time reference you selected in settings,
              so the App can display authoritative time and drift. See{" "}
>>>>>>> origin/main
              <Link
                to="/sync-guide"
                className="underline underline-offset-2 hover:text-foreground"
              >
                the OS time guide
              </Link>{" "}
              for the provider list.
            </li>
            <li>
              Outbound links you click (Support, Sync Guide, Third-Party Notices) load in your
              browser under the target site&rsquo;s own privacy terms.
            </li>
          </ul>
          <p>
            The maintainers do not log these requests. Third-party providers can see the IP
            address and timing of your request under their own privacy policies &mdash; see
            Section 6.
          </p>
        </Section>

        <Section id="section-5" title="5. Background chimes & notifications">
          <p>
            If you enable background chimes, the App uses your operating system&rsquo;s local
            notification / alarm scheduler to fire chimes when the App is not in the
            foreground. Notification content is generated on-device from your local settings; no
            push server is involved and no notification payload is sent over the network by the
            maintainers.
          </p>
          <p>
            You can revoke the notification/alarm permission at any time from your OS settings,
            or clear the in-app consent from <em>Settings &rarr; Privacy</em>.
          </p>
        </Section>

        <Section id="section-6" title="6. Third-party time providers">
          <p>
<<<<<<< HEAD
            When the App measures a network reference, its server queries the selected provider
            (Time.now or Clock.now). Providers may log server connection metadata under their own
            privacy policies. The App does not send your browser IP address or user agent to them.
=======
            When you use the time-sync feature, the App makes an HTTPS request directly from
            your device to the provider you select (Time.now or Clock.now). Those providers may log connection metadata &mdash; typically IP address,
            timestamp, and user agent &mdash; under their own privacy policies. The maintainers
            do not receive, aggregate, or have visibility into those logs.
>>>>>>> origin/main
          </p>
          <p>
            You can change or restrict the selected provider from the settings drawer.
          </p>
        </Section>
        <Section id="section-7" title="7. Your rights (GDPR, CCPA, TDPSA and similar)">
          <p>
            Because the maintainers do not collect or store personal data server-side, most
            statutory data-subject requests reduce to actions you can perform yourself in the
            App:
          </p>
          <ul className="list-disc space-y-1 break-words pl-5 sm:pl-6">
            <li>
              <strong>Access / portability</strong>: use <em>Export my data</em> in the settings
              drawer to download a JSON copy of everything Time Chime stores about you locally.
            </li>
            <li>
              <strong>Deletion</strong>: use <em>Delete all my data</em> in the settings drawer,
              or clear site data from your browser / uninstall the app.
            </li>
            <li>
              <strong>Correction / restriction / objection</strong>: adjust the corresponding
              preference in settings, or delete the data as above.
            </li>
            <li>
              <strong>Do Not Sell / Share (CCPA), GPC, DNT</strong>: the App does not sell or
              share personal information and honours Global Privacy Control and Do Not Track
              signals by design.
            </li>
          </ul>
          <p>
            If you deploy a fork of Time Chime that collects additional data (for example, by
            adding analytics or accounts), you are the controller for that data and must publish
            your own privacy policy and rights-request contact.
          </p>
        </Section>

        <Section id="section-8" title="8. Children">
          <p>
            Time Chime is a general-audience clock application and does not knowingly collect
            information from anyone, including children. The App is suitable for use by minors
            under adult supervision on the same terms as any other clock or utility app.
          </p>
        </Section>

        <Section id="section-9" title="9. Security">
          <p>
            The App is delivered over HTTPS with a strict Content Security Policy, HSTS, and
            related headers. Because the App holds no server-side account or payload, there is
            no server-side data breach surface controlled by the maintainers. For security
            reports, see <code>SECURITY.md</code> in the public repository.
          </p>
        </Section>

        <Section id="section-10" title="10. Changes to this policy">
          <p>
            This policy may be updated from time to time. Material changes will be reflected by
            updating the effective date above. Continued use of the App after changes take
            effect constitutes acceptance of the revised policy. See the{" "}
            <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
              Terms of Service
            </Link>{" "}
            for the governing agreement.
          </p>
        </Section>

        <Section id="section-11" title="11. Contact">
          <p>
            For privacy questions, open an issue on the project&rsquo;s public repository. For
            security disclosures, follow <code>SECURITY.md</code> instead of the public issue
            tracker.
          </p>
        </Section>

        <p className="mt-10 text-[11px] text-muted-foreground">
          Nothing on this page is legal advice. This policy describes the upstream Time Chime
          App as maintained by its authors; a fork or hosted deployment may behave differently
          and is responsible for its own privacy disclosures.
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
