import React from "react";
import { Button } from "@/components/ui/button";
import { Smartphone, Monitor } from "lucide-react";
import { toast } from "sonner";

interface PrintDialogProps {
  printLayout: "pc" | "mobile";
  setPrintLayout: (layout: "pc" | "mobile") => void;
  trigger?: React.ReactNode;
}

export function PrintDialog({
  printLayout = "mobile",
  setPrintLayout,
  trigger,
}: PrintDialogProps) {
  // Clean, freeze-free print execution with immediate style & page rule application
  const handlePrint = (layout: "pc" | "mobile") => {
    // 1. Update React state
    setPrintLayout(layout);

    // 2. Synchronously apply class to container so CSS matches immediately without waiting for React cycle
    const container =
      document.querySelector(".print-layout-container") ||
      document.querySelector('[class*="print-layout-"]');
    if (container) {
      container.classList.remove("print-layout-pc", "print-layout-mobile");
      container.classList.add(`print-layout-${layout}`);
    }

    // 3. Synchronously inject / update the dynamic @page orientation rule
    let styleEl = document.getElementById(
      "dynamic-print-page"
    ) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "dynamic-print-page";
      document.head.appendChild(styleEl);
    }
    if (layout === "mobile") {
      styleEl.textContent =
        "@media print { @page { size: A4 portrait !important; margin: 10mm 10mm !important; } }";
    } else {
      styleEl.textContent =
        "@media print { @page { size: A4 landscape !important; margin: 6mm 10mm !important; } }";
    }

    // 4. Immediately ensure clean body/HTML styles so nothing ever freezes
    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
    document.body.removeAttribute("data-scroll-locked");
    if (document.documentElement) {
      document.documentElement.style.pointerEvents = "";
      document.documentElement.style.overflow = "";
    }

    // 5. Temporarily remove dark mode for crisp white-paper printing
    const wasDark = document.documentElement.classList.contains("dark");
    if (wasDark) {
      document.documentElement.classList.remove("dark");
    }

    const restoreStyles = () => {
      if (wasDark) {
        document.documentElement.classList.add("dark");
      }
      document.body.style.pointerEvents = "";
      document.body.style.overflow = "";
      document.body.removeAttribute("data-scroll-locked");
      window.removeEventListener("afterprint", restoreStyles);
    };

    window.addEventListener("afterprint", restoreStyles);
    setTimeout(restoreStyles, 1500);

    // 6. Trigger native print after brief frame render
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          window.print();
        } catch (err) {
          console.error("Print error:", err);
          toast.error("تعذر فتح نافذة الطباعة تلقائياً");
          restoreStyles();
        }
      }, 120);
    });
  };

  if (trigger) {
    return <div onClick={() => handlePrint(printLayout || "mobile")}>{trigger}</div>;
  }

  return (
    <div
      dir="rtl"
      className="inline-flex items-center p-0.5 rounded-full bg-card shadow-xs border border-muted hover:border-primary/40 transition-colors"
    >
      {/* 📱 Button 1: Mobile & PDF Portrait Print (Default Google Studio Mobile Format) */}
      <Button
        variant={printLayout === "mobile" ? "default" : "ghost"}
        size="sm"
        onClick={() => handlePrint("mobile")}
        className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-full font-bold gap-1.5 text-xs sm:text-sm cursor-pointer transition-all ${
          printLayout === "mobile"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-primary-dark hover:bg-primary-bg"
        }`}
        title="طباعة تنسيق الموبايل و PDF (طولي A4 - نفس ملف PDF المرفق تماماً)"
      >
        <Smartphone className="h-4 w-4 shrink-0" />
        <span className="font-extrabold">طباعة الموبايل (PDF)</span>
      </Button>

      {/* 💻 Button 2: PC Landscape Print */}
      <Button
        variant={printLayout === "pc" ? "default" : "ghost"}
        size="sm"
        onClick={() => handlePrint("pc")}
        className={`h-8 sm:h-9 px-2 sm:px-2.5 rounded-full font-bold gap-1 text-xs sm:text-sm cursor-pointer transition-all ${
          printLayout === "pc"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }`}
        title="طباعة تنسيق شاشات الكمبيوتر (عرضي A4 Landscape)"
      >
        <Monitor className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline font-bold">كمبيوتر (عرضي)</span>
      </Button>
    </div>
  );
}
