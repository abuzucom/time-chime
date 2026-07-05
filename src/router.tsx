import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { readCspNonce } from "./lib/http/nonce-store";

/**
 * Construct a fresh TanStack Router instance with its own `QueryClient`.
 *
 * Called once per request on the server (so each SSR render gets an isolated
 * query cache) and once on the client at hydration. Scroll restoration is
 * enabled and preload staleness is set to 0 so hovered links always refetch.
 *
 * @returns A configured router bound to the generated route tree.
 */
export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    ssr: { nonce: readCspNonce() },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
