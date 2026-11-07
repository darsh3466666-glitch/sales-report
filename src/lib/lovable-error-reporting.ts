type LovableErrorOptions = {
  mechanism?:
    | "manual"
    | "onerror"
    | "unhandledrejection"
    | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
  }
}

export function isDynamicImportError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

export function reportLovableError(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;
  if (isDynamicImportError(error)) return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
}
