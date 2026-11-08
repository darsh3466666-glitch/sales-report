import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";

// Prevent React 19 bug: infinite loop in dispatchEventForPluginEventSystem on selectionchange
if (typeof document !== "undefined") {
  document.addEventListener(
    "selectionchange",
    (e) => {
      e.stopImmediatePropagation();
    },
    true
  );
}

const queryClient = new QueryClient();

const basepath =
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/sales-report")
    ? "/sales-report"
    : undefined;

export const router = createRouter({
  routeTree,
  basepath,
  context: { queryClient },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
