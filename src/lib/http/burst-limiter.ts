/**
 * In-memory sliding-window burst limiter for Worker server functions.
 *
 * Scope and caveats — read before relying on this for anything but burst
 * absorption:
 *
 *  - **Per-isolate, not global.** Cloudflare Workers run many isolates in
 *    parallel across colos and even within one colo. A caller hitting two
 *    different isolates will get two independent buckets. This limiter
 *    catches *bursts* from one caller landing on one isolate — the common
 *    accidental case (a hot-reload loop, a runaway `setInterval`) — but is
 *    NOT a substitute for a shared quota. Cloudflare Rate Limiting (docs at
 *    developers.cloudflare.com/waf/rate-limiting-rules) is the correct
 *    layer for a real per-IP quota; see docs/OPERATIONS.md.
 *  - **Best-effort key.** We key on `CF-Connecting-IP` because it is the
 *    only header Cloudflare guarantees is the true edge peer. `x-forwarded-
 *    for` can be attacker-controlled. When no IP is present (local dev,
 *    non-CF host) the limiter falls open — better to serve the request
 *    than to reject every anonymous caller.
 *  - **Bounded memory.** The bucket map is capped and evicted lazily so a
 *    long-running isolate under IP-spray cannot balloon memory.
 *
 * The token counter uses a sliding window: on each request we drop any
 * timestamps older than the window, then reject if the remaining count is
 * at or above the limit. This is more accurate than a fixed calendar-minute
 * window (which allows a 2× spike across the boundary) and cheaper than a
 * leaky bucket.
 */

/** Configuration for a single limiter instance. */
export interface BurstLimiterOptions {
  /** Maximum requests per window per key. */
  readonly limit: number;
  /** Rolling window length in milliseconds. */
  readonly windowMs: number;
  /**
   * Hard cap on how many distinct keys we track in one isolate. Once
   * exceeded the oldest-touched key is evicted. Prevents unbounded growth
   * under IP-spray. Default 10 000 — a few hundred KB at most.
   */
  readonly maxKeys?: number;
}

export interface BurstDecision {
  /** True when the request is within limit and MAY proceed. */
  readonly allowed: boolean;
  /** Requests already recorded in the current window (including this one when allowed). */
  readonly used: number;
  /** Requests still available in the current window (0 when denied). */
  readonly remaining: number;
  /**
   * Seconds until the oldest request in the window falls off. Present when
   * denied so callers can populate `Retry-After`. Always ≥ 1 to avoid
   * telling a client "retry in 0 seconds" (which browsers round to no wait).
   */
  readonly retryAfterSeconds: number;
}

/**
 * Create an isolated limiter. Each `createBurstLimiter` call owns its own
 * Map, so a caller can compose independent quotas (per endpoint, per
 * verb, etc.) without them sharing state.
 */
export function createBurstLimiter(options: BurstLimiterOptions) {
  const limit = options.limit;
  const windowMs = options.windowMs;
  const maxKeys = options.maxKeys ?? 10_000;

  // Per-key ring of arrival timestamps. Kept as a plain number[] rather
  // than a proper ring buffer because the working set is tiny (≤ limit
  // per key) and array shift on ≤ 10 items is faster than any data
  // structure ceremony.
  const buckets = new Map<string, number[]>();

  return {
    /**
     * Record a hit for `key` and return the decision. Callers that get
     * `allowed: false` MUST NOT do the work — the hit is still counted
     * only when allowed, so a denied caller doesn't burn additional
     * budget just by being denied.
     */
    check(key: string, now: number = Date.now()): BurstDecision {
      const cutoff = now - windowMs;
      let arrivals = buckets.get(key);

      if (arrivals) {
        // Drop expired timestamps in-place. Since arrivals are appended in
        // time order, we can splice from the front until we hit a fresh one.
        let drop = 0;
        while (drop < arrivals.length && arrivals[drop] <= cutoff) drop++;
        if (drop > 0) arrivals.splice(0, drop);
      } else {
        arrivals = [];
        // Enforce the isolate-wide cap BEFORE inserting a new key so
        // memory can never exceed `maxKeys` entries.
        if (buckets.size >= maxKeys) evictOldest(buckets);
        buckets.set(key, arrivals);
      }

      if (arrivals.length >= limit) {
        // Oldest arrival dictates when the next slot opens up.
        const oldest = arrivals[0] ?? now;
        const msUntilFree = Math.max(0, oldest + windowMs - now);
        return {
          allowed: false,
          used: arrivals.length,
          remaining: 0,
          // Round UP so Retry-After never under-promises. Floor at 1s so
          // browsers don't ignore a "0" hint and retry immediately.
          retryAfterSeconds: Math.max(1, Math.ceil(msUntilFree / 1000)),
        };
      }

      arrivals.push(now);
      return {
        allowed: true,
        used: arrivals.length,
        remaining: limit - arrivals.length,
        retryAfterSeconds: 0,
      };
    },
  };
}

/**
 * Evict the bucket whose most-recent hit is oldest. O(n) scan is fine at
 * eviction time — it only runs when we're already at the cap, which is
 * the rare path.
 */
function evictOldest(buckets: Map<string, number[]>): void {
  let victim: string | null = null;
  let victimTs = Infinity;
  for (const [key, arrivals] of buckets) {
    const last = arrivals[arrivals.length - 1] ?? 0;
    if (last < victimTs) {
      victimTs = last;
      victim = key;
    }
  }
  if (victim !== null) buckets.delete(victim);
}

/**
 * Extract the true client IP for use as a limiter key. Only trusts
 * `CF-Connecting-IP` — every other candidate (`x-forwarded-for`,
 * `x-real-ip`, `forwarded`) can be spoofed by a caller so using them
 * would let an attacker forge a fresh key per request and bypass the
 * limit entirely. Returns `null` when the request did not come through
 * Cloudflare; the caller should fail open in that case.
 */
export function clientIpKey(getHeader: (name: string) => string | undefined): string | null {
  const ip = getHeader("cf-connecting-ip");
  if (!ip) return null;
  // Normalize case + trim; some proxies emit trailing whitespace on the value.
  return ip.trim().toLowerCase() || null;
}
