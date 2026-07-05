/**
 * Static pre-hydration script + its SHA-256 hash.
 *
 * Extracted out of `src/routes/__root.tsx` so the CSP can reference the
 * script's hash without duplicating the source. The hash is precomputed
 * (see the sibling test `pre-hydration.test.mjs`) rather than computed at
 * module init because:
 *
 *   - The script string is embedded on both server and client — we can't
 *     rely on `node:crypto` at hydration time.
 *   - `SubtleCrypto.digest` is async; a top-level `await` would push CSP
 *     work into the render path.
 *   - The script is truly static: any edit here MUST fail the test until
 *     the hash below is updated, which is exactly the invariant we want.
 *
 * If you edit `PRE_HYDRATION_SCRIPT`, re-run:
 *   node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('src/lib/http/pre-hydration.ts','utf8').match(/PRE_HYDRATION_SCRIPT = \`([\\s\\S]*?)\`;/)[1]).digest('base64'))"
 * and paste the result into `PRE_HYDRATION_SCRIPT_SHA256`. The unit test
 * asserts they match.
 */

// Sets theme + digital hue on <html> AND installs a CSP nonce shim BEFORE
// React (or any third-party library) paints, so:
//   1. We never flash the wrong palette.
//   2. Every dynamically-created <style> / <link rel="stylesheet"> element
//      inherits the request's CSP nonce automatically — required because
//      Radix, cmdk, vaul, sonner, embla, recharts and friends inject
//      <style> tags at runtime without accepting a nonce prop. With strict
//      style-src (no 'unsafe-inline'), those tags would be blocked without
//      this shim.
// Kept dependency-free, idempotent, and above all STATIC — its bytes are
// baked into the CSP hash below.
export const PRE_HYDRATION_SCRIPT = `
(function(){
  try {
    var meta = document.querySelector('meta[property="csp-nonce"],meta[name="csp-nonce"]');
    var nonce = meta && meta.getAttribute('content');
    if (nonce) {
      var origCreate = document.createElement.bind(document);
      document.createElement = function(tag, options) {
        var el = origCreate(tag, options);
        var name = (typeof tag === 'string' ? tag : '').toLowerCase();
        if (name === 'style' || name === 'link') {
          try { el.setAttribute('nonce', nonce); } catch (e) {}
        }
        return el;
      };
      var patchAppend = function(proto, method) {
        var orig = proto && proto[method];
        if (!orig || orig.__westminsterNoncePatch) return;
        var patched = function() {
          for (var i = 0; i < arguments.length; i++) {
            var node = arguments[i];
            var tag = node && node.tagName && String(node.tagName).toLowerCase();
            if ((tag === 'style' || tag === 'link') && !node.getAttribute('nonce')) {
              try { node.setAttribute('nonce', nonce); } catch (e) {}
            }
          }
          return orig.apply(this, arguments);
        };
        patched.__westminsterNoncePatch = true;
        proto[method] = patched;
      };
      patchAppend(Node.prototype, 'appendChild');
      patchAppend(Node.prototype, 'insertBefore');
      patchAppend(Element.prototype, 'append');
      patchAppend(Element.prototype, 'prepend');
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) console.warn('[pre-hydration csp-nonce]', err);
  }
  try {
    var raw = localStorage.getItem('westminster.settings.v1');
    var s = raw ? JSON.parse(raw) : {};
    var theme = s.theme || 'system';
    var resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    var el = document.documentElement;
    el.classList.remove('dark','grey');
    if (resolved === 'dark') el.classList.add('dark');
    else if (resolved === 'grey') el.classList.add('grey');
    el.dataset.digitalHue = s.digitalHue || 'amber';
    el.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
  } catch (err) {
    // Corrupt/blocked storage — safe to fall through to CSS defaults, but surface for debugging.
    if (typeof console !== 'undefined' && console.warn) console.warn('[pre-hydration theme]', err);
  }
})();
`;

// Base64-encoded SHA-256 of `PRE_HYDRATION_SCRIPT` verbatim (including the
// leading/trailing newlines and every space). Referenced by the CSP as
// `'sha256-<value>'` in place of `'unsafe-inline'` — this is the strict-CSP
// pattern from https://web.dev/articles/strict-csp for known static scripts.
// Placeholder — recomputed by the test/CI check; see the helper above.
export const PRE_HYDRATION_SCRIPT_SHA256 = "zj5+Riv9UC93ilYGilI420yOJ81Jwc+2sVqIgxRvADQ=";

// Convenience CSP source token — quoted per CSP grammar.
export const PRE_HYDRATION_SCRIPT_CSP_SOURCE = `'sha256-${PRE_HYDRATION_SCRIPT_SHA256}'`;
