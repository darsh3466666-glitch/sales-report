import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Printer,
  Monitor,
  Smartphone,
  ChevronDown,
  Check,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

interface PrintDialogProps {
  printLayout: "pc" | "mobile";
  setPrintLayout: (layout: "pc" | "mobile") => void;
  trigger?: React.ReactNode;
}

export function PrintDialog({
  printLayout,
  setPrintLayout,
  trigger,
}: PrintDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Clean execution that never freezes the page or locks pointer events
  const handlePrint = (layout: "pc" | "mobile") => {
    setPrintLayout(layout);
    setIsOpen(false);

    // 1. Immediately ensure clean body/HTML styles so nothing ever freezes
    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
    document.body.removeAttribute("data-scroll-locked");
    if (document.documentElement) {
      document.documentElement.style.pointerEvents = "";
      document.documentElement.style.overflow = "";
    }

    // 2. Temporarily remove dark mode for crisp white-paper printing
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

    // Fallback restoration in case afterprint does not fire (common in Chrome PDF save/cancel)
    setTimeout(restoreStyles, 1500);

    // 3. Trigger native print after brief frame render
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

  return (
    <div className="relative inline-flex items-center" ref={containerRef}>
      {trigger ? (
        <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      ) : (
        <div className="inline-flex items-center rounded-full bg-card shadow-xs border border-muted hover:border-primary/30 divide-x divide-x-reverse divide-muted">
          {/* Main Direct Print Button (One-click Google Studio Landscape Print) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePrint(printLayout || "pc")}
            className="px-2.5 sm:px-3 h-8 sm:h-9 rounded-r-full font-bold text-primary-dark hover:bg-primary-bg gap-1.5"
            title="طباعة التقرير مباشرة (تنسيق جوجل استوديو - عرضي)"
          >
            <Printer className="h-4 w-4 text-accent-dark shrink-0" />
            <span className="hidden sm:inline font-bold">طباعة التقرير</span>
          </Button>

          {/* Options Dropdown Trigger */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="px-1.5 sm:px-2 h-8 sm:h-9 rounded-l-full font-bold text-primary-dark hover:bg-primary-bg"
            title="خيارات وتنسيق الطباعة"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 text-muted-foreground ${
                isOpen ? "rotate-180 text-primary" : ""
              }`}
            />
          </Button>
        </div>
      )}

      {/* Google Studio Style Print Options Dropdown */}
      {isOpen && (
        <div
          dir="rtl"
          className="absolute left-0 sm:right-auto top-full mt-2 w-72 sm:w-80 rounded-2xl bg-card border-2 border-primary/20 shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3 py-2 border-b border-muted/60 mb-1">
            <div className="flex items-center gap-1.5 text-xs font-black text-primary">
              <FileText className="h-3.5 w-3.5" />
              <span>خيارات الطباعة وتصدير PDF</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              اختر التنسيق المطلوب للطباعة أو الحفظ كملف PDF
            </p>
          </div>

          <div className="space-y-1">
            {/* Option 1: Google Studio Landscape PC Layout */}
            <button
              type="button"
              onClick={() => handlePrint("pc")}
              className={`w-full text-right p-2.5 rounded-xl transition-all flex items-start gap-2.5 cursor-pointer text-xs ${
                printLayout === "pc"
                  ? "bg-primary/10 text-primary-dark font-black border border-primary/30"
                  : "hover:bg-muted/60 text-foreground font-semibold"
              }`}
            >
              <div
                className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                  printLayout === "pc"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Monitor className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold">تنسيق جوجل استوديو (A4 Landscape)</span>
                  {printLayout === "pc" && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                  عرضي ممتد مثل تقرير جوجل استوديو الأصلي، تظهر فيه الكروت والرسوم البيانية متجاورة بعرض الصفحة.
                </p>
              </div>
            </button>

            {/* Option 2: Mobile / Portrait Layout */}
            <button
              type="button"
              onClick={() => handlePrint("mobile")}
              className={`w-full text-right p-2.5 rounded-xl transition-all flex items-start gap-2.5 cursor-pointer text-xs ${
                printLayout === "mobile"
                  ? "bg-primary/10 text-primary-dark font-black border border-primary/30"
                  : "hover:bg-muted/60 text-foreground font-semibold"
              }`}
            >
              <div
                className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                  printLayout === "mobile"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Smartphone className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold">تنسيق طولي (A4 Portrait)</span>
                  {printLayout === "mobile" && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                  طولي رأسي مناسب للهاتف والقراءة المتسلسلة وحفظ ملفات PDF الطولية القياسية.
                </p>
              </div>
            </button>
          </div>

          <div className="mt-2 pt-2 border-t border-muted/60 flex items-center justify-between px-1">
            <span className="text-[10px] text-muted-foreground">
              النمط النشط:{" "}
              <strong className="text-foreground">
                {printLayout === "pc" ? "عرضي (استوديو)" : "طولي (Portrait)"}
              </strong>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
            >
              إغلاق
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
