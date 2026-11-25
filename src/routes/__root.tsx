import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import {
  isDynamicImportError,
  reportLovableError,
} from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

function NotFoundComponent() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-4"
      dir="rtl"
    >
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-4 text-muted-foreground">الصفحة غير موجودة</p>
        <a
          href="/"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          الرئيسية
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    if (isDynamicImportError(error)) {
      const timer = setTimeout(() => {
        const key = "__dynamic_import_reload__";
        const lastReload = Number(sessionStorage.getItem(key) || "0");
        if (Date.now() - lastReload > 5000) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        } else {
          router.invalidate();
          reset();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
    reportLovableError(error, { boundary: "root" });
  }, [error, router, reset]);

  if (isDynamicImportError(error)) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background px-4"
        dir="rtl"
      >
        <div className="max-w-md text-center text-muted-foreground">
          جاري تحميل الصفحة...
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-4"
      dir="rtl"
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">حدث خطأ</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "تقرير المبيعات اليومي الشامل - المبيعات والتحصيل" },
        {
          name: "description",
          content: "تقرير شامل لمتابعة المبيعات والتحصيل اليومي",
        },
        {
          property: "og:title",
          content: "تقرير المبيعات اليومي الشامل - المبيعات والتحصيل",
        },
        {
          name: "twitter:title",
          content: "تقرير المبيعات اليومي الشامل - المبيعات والتحصيل",
        },
        {
          property: "og:description",
          content: "تقرير شامل لمتابعة المبيعات والتحصيل اليومي",
        },
        {
          name: "twitter:description",
          content: "لوحة تنفيذية لمتابعة المبيعات والتحصيل اليومي",
        },
        {
          property: "og:image",
          content:
            "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/249baf60-205a-4646-88db-009df4be41db/id-preview-d588764e--f2d6f571-39ff-440d-b006-dd759432e6f6.lovable.app-1781360309720.png",
        },
        {
          name: "twitter:image",
          content:
            "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/249baf60-205a-4646-88db-009df4be41db/id-preview-d588764e--f2d6f571-39ff-440d-b006-dd759432e6f6.lovable.app-1781360309720.png",
        },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:type", content: "website" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap",
        },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark');}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function useAppVersionAutoSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Clean temporary cache-buster param from URL bar after fresh reload
    try {
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has("_v")) {
        currentUrl.searchParams.delete("_v");
        window.history.replaceState({}, "", currentUrl.toString());
      }
    } catch {
      // ignore
    }

    const extractEntryScriptName = (): string | null => {
      const scripts = Array.from(
        document.querySelectorAll('script[type="module"][src*="assets/index-"]')
      );
      for (const s of scripts) {
        const src = s.getAttribute("src") || "";
        const m = src.match(/(index-[^/?#]+\.js)/);
        if (m) return m[1];
      }
      return null;
    };

    const currentEntry = extractEntryScriptName();
    if (!currentEntry) return; // Dev mode or non-hashed entry

    const basePath = window.location.pathname.includes("/sales-report")
      ? "/sales-report/"
      : "./";

    let cancelled = false;
    let checking = false;

    const checkForNewBuild = async () => {
      if (cancelled || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const res = await fetch(`${basePath}version.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        const remoteEntry = String(data?.entry || "").trim();
        if (!remoteEntry || remoteEntry === currentEntry) return;

        // Loop guard: do not infinitely reload to the same version within 20s
        const guardKey = "__app_auto_updated_to__";
        const lastAttempt = sessionStorage.getItem(guardKey);
        if (lastAttempt) {
          const [prevEntry, prevTs] = lastAttempt.split("|");
          if (prevEntry === remoteEntry && Date.now() - Number(prevTs || 0) < 20000) {
            return;
          }
        }
        sessionStorage.setItem(guardKey, `${remoteEntry}|${Date.now()}`);

        if ("caches" in window) {
          try {
            const keys = await window.caches.keys();
            await Promise.all(keys.map((k) => window.caches.delete(k)));
          } catch {
            // ignore cache clear issues
          }
        }

        toast.info("تم توفر تحديث جديد للنظام، جاري التحديث تلقائياً...", {
          duration: 2000,
        });

        setTimeout(() => {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set("_v", remoteEntry);
          window.location.replace(nextUrl.toString());
        }, 500);
      } catch {
        // Offline or transient network error; skip silently
      } finally {
        checking = false;
      }
    };

    const initialTimer = window.setTimeout(checkForNewBuild, 2500);
    const pollInterval = window.setInterval(checkForNewBuild, 45000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        checkForNewBuild();
      }
    };

    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(pollInterval);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, []);
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useAppVersionAutoSync();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
