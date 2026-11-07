import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { QueryClient } from "@tanstack/react-query";

export function createRouter() {
  const queryClient = new QueryClient();
  const basepath =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/sales-report")
      ? "/sales-report"
      : undefined;

  return createTanStackRouter({
    routeTree,
    basepath,
    context: { queryClient },
    defaultPreload: "intent",
  });
}

export const getRouter = createRouter;

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
