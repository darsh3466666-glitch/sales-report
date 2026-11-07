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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
