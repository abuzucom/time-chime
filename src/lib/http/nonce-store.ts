/** Browser-safe CSP nonce helpers. The request-scoped nonce itself is carried
 * through TanStack Start middleware context, not a custom AsyncLocalStorage,
 * so this module can be imported by the shared router without pulling Node
 * built-ins into the browser bundle.
 */

/**
 * Fresh base64url random nonce. 128 bits of entropy — CSP3 recommends ≥ 128.
 * `crypto.getRandomValues` is available in Workers, Node ≥ 19, and browsers.
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Base64url — safe inside quoted CSP source tokens and HTML attributes.
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Read the nonce already published in the hydrated document, if any. This is
 * only used as a client-side fallback; SSR gets its nonce from middleware.
 */
export function readCspNonce(): string {
  if (typeof document !== "undefined") {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[property="csp-nonce"], meta[name="csp-nonce"]',
    );
    const nonce = meta?.content?.trim();
    if (nonce) return nonce;
  }

  return generateCspNonce();
}
