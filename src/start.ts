import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { enforceHttps } from "./lib/http/https-guard";
import { withSecurityHeaders } from "./lib/http/security-headers";

const httpsGuardMiddleware = createMiddleware().server(({ request, next }) => {
  const httpsRedirect = enforceHttps(request);
  if (httpsRedirect) return withSecurityHeaders(httpsRedirect);
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Stamp HSTS / Referrer-Policy / Permissions-Policy on every response the
// Worker emits (SSR HTML, server-function payloads, the 500 page above).
// See src/lib/http/security-headers.ts for rationale. Runs *outside*
// errorMiddleware so it also decorates the fallback 500 response.
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const response = await rebuildHtmlResponseWithMatchingSecurityHeaders(result.response);
  return {
    ...result,
    response,
  };
});

async function rebuildHtmlResponseWithMatchingSecurityHeaders(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) return withSecurityHeaders(response);

  const html = await response.clone().text();
  const rebuilt = new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });

  return withSecurityHeaders(rebuilt, readRenderedCspNonce(html));
}

function readRenderedCspNonce(html: string): string | undefined {
  const match = html.match(
    /<meta[^>]+(?:property|name)=["']csp-nonce["'][^>]+content=["']([^"']+)["']/i,
  );
  return match?.[1];
}

export const startInstance = createStart(() => ({
  requestMiddleware: [httpsGuardMiddleware, securityHeadersMiddleware, errorMiddleware],
}));
