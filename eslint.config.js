import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // AGENTS.md code-quality rules: nesting depth and function size.
      "max-depth": ["error", 3],
      "max-lines-per-function": [
        "warn",
        { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      // AGENTS.md rule 1: no untrusted input in evaluated code.
      "no-eval": "error",
      "no-implied-eval": "error",
      // Favor composition over inheritance.
      //
      // Any `class Foo extends Bar` is flagged unless `Bar` is a framework /
      // platform base class from the allowlist below. This blocks deep app-level
      // hierarchies (`class B extends A`, `class C extends B`, …) while still
      // permitting the legitimate cases: custom Errors, Web Components,
      // EventTarget subclasses, typed-array views, and the rare pre-hooks
      // React.Component. Prefer hooks, composition, or dependency injection
      // for anything else.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ClassDeclaration[superClass.name!=/^(Error|TypeError|RangeError|SyntaxError|EvalError|ReferenceError|URIError|AggregateError|DOMException|HTMLElement|SVGElement|EventTarget|AbortController|Component|PureComponent|Array|Map|Set|WeakMap|WeakSet|Uint8Array|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|Float32Array|Float64Array)$/]",
          message:
            "Avoid class inheritance except from framework/platform base classes (Error, HTMLElement, EventTarget, React.Component, typed arrays, …). Prefer composition, hooks, or dependency injection.",
        },
        {
          selector:
            "ClassExpression[superClass.name!=/^(Error|TypeError|RangeError|SyntaxError|EvalError|ReferenceError|URIError|AggregateError|DOMException|HTMLElement|SVGElement|EventTarget|AbortController|Component|PureComponent|Array|Map|Set|WeakMap|WeakSet|Uint8Array|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|Float32Array|Float64Array)$/]",
          message:
            "Avoid class inheritance except from framework/platform base classes. Prefer composition, hooks, or dependency injection.",
        },
        // CORS lockdown: this app has no legitimate cross-origin API caller,
        // so wildcard `Access-Control-Allow-Origin: *` in a server route is
        // almost certainly a mistake that would open every endpoint to any
        // site. Fail the build and force the author to name an explicit
        // origin (or, better, use assertSameOrigin from src/lib/http/same-origin.ts).
        {
          selector:
            "Literal[value=/Access-Control-Allow-Origin[^\\n]*\\*/i]",
          message:
            "Wildcard CORS (`Access-Control-Allow-Origin: *`) is banned. Restrict to the app origin or use assertSameOrigin() from '@/lib/http/same-origin'.",
        },
        {
          selector:
            "TemplateElement[value.raw=/Access-Control-Allow-Origin[^\\n]*\\*/i]",
          message:
            "Wildcard CORS (`Access-Control-Allow-Origin: *`) is banned. Restrict to the app origin or use assertSameOrigin() from '@/lib/http/same-origin'.",
        },
        // AGENTS.md rule 7: no MD5/SHA-1 without a justifying comment. ESLint
        // can't see comments here, so this simply bans the call outright —
        // the rare justified non-security use (cache keys, dedup) needs an
        // inline eslint-disable with the same justification the rule requires.
        {
          selector:
            "CallExpression[callee.name='createHash'][arguments.0.value=/^(md5|sha-?1)$/i]",
          message:
            "MD5/SHA-1 is banned in security-sensitive contexts (AGENTS.md rule 7). Use SHA-256/SHA-3, or bcrypt/scrypt/Argon2 for passwords. Non-security use requires a justifying comment and an eslint-disable on this line.",
        },
        {
          selector:
            "CallExpression[callee.property.name='createHash'][arguments.0.value=/^(md5|sha-?1)$/i]",
          message:
            "MD5/SHA-1 is banned in security-sensitive contexts (AGENTS.md rule 7). Use SHA-256/SHA-3, or bcrypt/scrypt/Argon2 for passwords. Non-security use requires a justifying comment and an eslint-disable on this line.",
        },
      ],
    },
  },
  {
    // Config files are declarative option objects, not control-flow code —
    // the function-size rule (AGENTS.md code quality) doesn't fit them.
    files: ["*.config.ts", "*.config.js"],
    rules: {
      "max-lines-per-function": "off",
    },
  },
  eslintPluginPrettier,
);
