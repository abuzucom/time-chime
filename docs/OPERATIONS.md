# Operations — Abuse Protection

Time Chime ships with client-side rate hygiene (minimum sync intervals,
jitter, and a circuit breaker in `src/lib/time/TimeSyncContext.tsx`) but
those live in the browser and cannot defend the origin against a scripted
attacker. The two Cloudflare features below close that gap. They are
**dashboard-only** — nothing in the repo needs to change to enable them,
which is deliberate: the app runs equally well on Cloudflare Pages,
Workers, Netlify, or a self-hosted node and must not require a specific
provider to be secure.

If you deploy on a non-Cloudflare host, the "Equivalents" section at the
bottom lists like-for-like controls on Netlify, Fastly, and NGINX.

---

## 1. Threat model

The only origin-hittable surfaces are:

| Surface | Path | Cost per call | Abuse risk |
|---|---|---|---|
| `syncTime` server function | `POST /_serverFn/syncTime` | parallel outbound HTTPS fetches to selected JSON time references | An attacker can turn our Worker into a **reflector** against a time-reference provider, getting us banned from the upstream. |
| SSR HTML shell | `GET /`, `/support`, `/obs` | 1 render | Cheap; only DoS-relevant at very high RPS. |
| Static assets | `GET /assets/*` | Served from Cloudflare cache | Not a concern — cache eats the load. |

**Primary goal:** protect the upstream time providers from being rate-limited
because of our traffic. **Secondary goal:** keep Worker cost predictable.

## 2. Cloudflare Rate Limiting (WAF)

Cloudflare's WAF rate limiter is the correct layer for `/_serverFn/*`.
It sits in front of the Worker, so blocked requests never spend a
Worker invocation.

### 2.1 Enable the rule

1. Cloudflare dashboard → **Security → WAF → Rate limiting rules → Create rule**.
2. Fill in as follows (adjust the domain to your zone):

   | Field | Value |
   |---|---|
   | **Rule name** | `syncTime — per-IP burst` |
   | **If incoming requests match** | `(http.request.uri.path contains "/_serverFn/syncTime")` |
   | **When rate exceeds** | `10` requests |
   | **Period** | `1 minute` |
   | **With the same characteristics** | `IP` |
   | **Then take action** | `Block` |
   | **Duration** | `1 minute` |
   | **Response type** | `Default Cloudflare response` (returns HTTP 429) |

3. Save & deploy. The client-side circuit breaker already handles 429s
   gracefully (it backs off and surfaces a toast via `sonner`), so no
   code change is required.

### 2.2 Second rule — global burst cap

Add a second rule for the same path with characteristics = `<none>` (global)
at **300 req/min → Block 5 min**. This protects the upstream provider if
we're under a distributed attack where individual IPs stay under the
per-IP cap.

### 2.3 Tuning

- **Legit traffic budget:** the client re-syncs at most once every 60 s
  (see `MIN_SYNC_INTERVAL_MS` in `TimeSyncContext.tsx`). A user who
  opens 10 tabs is worst-case 10/min from one IP, which sits exactly at
  the threshold. Raise to 20/min if you see false positives from
  households behind CG-NAT.
- **Observability:** enable **Security → Events → Sampled logs** for the
  rule so you can see hit patterns before tightening further.
- **Do not** rate-limit `/` or `/assets/*` — Cloudflare already caches
  those and rate-limiting cached responses just adds latency.

### 2.4 Configuration-as-code (optional)

If your zone is managed by Terraform, the equivalent resource is:

```hcl
resource "cloudflare_ruleset" "westminster_ratelimit" {
  zone_id     = var.zone_id
  name        = "Time Chime abuse protection"
  description = "Rate-limit the syncTime server function"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules {
    action      = "block"
    description = "syncTime — per-IP burst"
    expression  = "(http.request.uri.path contains \"/_serverFn/syncTime\")"
    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 10
      mitigation_timeout  = 60
    }
  }
}
```

## 3. Cloudflare Turnstile

Turnstile is a CAPTCHA replacement that issues a short-lived token when
it decides the caller is human. It is only worth adding if you observe
sustained abuse that the rate limiter cannot cleanly isolate (e.g.
distributed bots that stay under thresholds). Do **not** enable it by
default — it adds a 30–80 KB script, a network round-trip, and a
privacy footprint the app otherwise avoids.

### 3.1 Provision the widget

1. Cloudflare dashboard → **Turnstile → Add site**.
   - **Domain:** your production host.
   - **Widget mode:** `Managed` (invisible for real users, interactive
     only when suspicious).
   - **Pre-clearance:** off (we verify per server-function call).
2. Copy the **Site key** (public, safe to ship in the bundle) and the
   **Secret key** (server-side only).

### 3.2 Store the secret

Store the Turnstile secret in your platform's secret manager (Cloudflare Workers Secrets, Vercel/Netlify env vars, `.env`, etc.):

```
Name:  TURNSTILE_SECRET_KEY
Value: <secret key from the dashboard>
```

The site key is a **publishable** value and belongs in
`VITE_TURNSTILE_SITE_KEY` in `.env.production` (checked into the repo is
fine — it identifies the widget, not you).

### 3.3 Wire the widget

Sketch of the changes (not implemented in the repo — apply only if you
turn Turnstile on):

```tsx
// src/components/TurnstileGate.tsx
import { Turnstile } from "@marsidev/react-turnstile";
export function TurnstileGate({ onToken }: { onToken: (t: string) => void }) {
  return (
    <Turnstile
      siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
      onSuccess={onToken}
      options={{ appearance: "interaction-only", theme: "auto" }}
    />
  );
}
```

```ts
// src/lib/time.functions.ts — inside the syncTime handler, BEFORE the
// upstream fetch. Verify the token against Cloudflare's siteverify
// endpoint; treat a missing / invalid token as HTTP 401.
const form = new URLSearchParams({
  secret: process.env.TURNSTILE_SECRET_KEY!,
  response: data.turnstileToken,
});
const verify = await fetch(
  "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  { method: "POST", body: form },
);
const { success } = (await verify.json()) as { success: boolean };
if (!success) throw new Response("Turnstile failed", { status: 401 });
```

### 3.4 UX rules

- Only render the widget after the user has interacted with the page
  once (opening the settings drawer counts). Rendering on first paint
  turns the clock face into a challenge screen for legitimate users.
- Cache a successful token for its full 300 s lifetime and reuse it
  across `syncTime` calls in that window — don't force a new challenge
  every minute.
- Provide a fallback UI when the widget fails to load (e.g. Turnstile
  blocked by uBlock Origin): let the app continue in "client clock
  only" mode with the drift indicator flagged as `unknown` rather than
  hard-erroring.

## 4. Verifying the setup

After enabling either control, run the following from a machine that is
**not** on your office IP:

```bash
# Should return 200 for the first 10, then 429 with a Retry-After header.
for i in $(seq 1 15); do
  curl -sS -o /dev/null -w "%{http_code}\n" \
    -X POST https://<your-host>/_serverFn/syncTime \
    -H "content-type: application/json" \
    -d '{"data":{"providerId":"timeNow"}}'
done
```

Expected output: ten `200`s followed by `429`s. If you see all `200`s,
the rule expression does not match the actual server-function path —
inspect a real request in the browser DevTools Network tab and copy the
path verbatim into the rule.

For Turnstile, load the app in an incognito window and confirm:

1. No widget renders on first paint.
2. Opening Settings and pressing "Sync now" renders the widget once,
   completes silently, and the sync succeeds.
3. Repeated syncs within 5 minutes do **not** re-render the widget
   (token is cached).

## 5. Equivalents on other hosts

| Host | Rate limit | Bot challenge |
|---|---|---|
| **Netlify** | Edge Functions + `netlify.toml` `[[edge_functions]]` with a KV-backed token bucket (Netlify has no built-in RL). | hCaptcha or Turnstile via the same siteverify flow above. |
| **Fastly** | VCL `if (req.rate.10s > N) { error 429; }` on the `syncTime` path. | Fastly Bot Management (paid) or Turnstile. |
| **NGINX / self-hosted** | `limit_req_zone $binary_remote_addr zone=synctime:10m rate=10r/m;` on the location block. | Turnstile via siteverify — the widget doesn't care what host serves the page. |
| **AWS CloudFront** | AWS WAF rate-based rule scoped to `URI path contains /_serverFn/syncTime`. | AWS WAF CAPTCHA action or Turnstile. |

Whichever host you pick, keep the two properties above intact: rate limits
before the Worker/function invocation, and CAPTCHAs verified server-side
via siteverify — never trust a client-side "I passed" flag.

## 6. Related docs

- `SECURITY.md` — vulnerability disclosure policy.
- `docs/COMPLIANCE.md` — OWASP ASVS / ISO 27001 / SOC 2 control mapping.
- `scripts/check-route-headers.mjs` — CI header regression suite.
- `src/lib/time/TimeSyncContext.tsx` — client-side minimum-interval logic
  and 429 back-off behaviour that pairs with the WAF rule above.
