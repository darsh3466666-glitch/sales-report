import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Printer,
  Monitor,
  Smartphone,
  AlertTriangle,
  ExternalLink,
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
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<"pc" | "mobile">(printLayout);
  const [isIframe, setIsIframe] = useState(false);

  useEffect(() => {
    setIsIframe(window.self !== window.top);
  }, []);

  function handleStartPrint() {
    setPrintLayout(selected);
    setOpen(false);

    // Give a clear, longer delay for full Dialog unmounting/fading and focus release to finish, resolving focus trap blocks on print.
    setTimeout(() => {
      const wasDark = document.documentElement.classList.contains("dark");
      if (wasDark) {
        document.documentElement.classList.remove("dark");
      }

      const restore = () => {
        if (wasDark) {
          document.documentElement.classList.add("dark");
        }
        window.removeEventListener("afterprint", restore);
      };

      window.addEventListener("afterprint", restore);

      try {
        window.print();
      } catch (e) {
        console.error("Print blocked or failed", e);
        toast.error(
          "فشلت عملية الطباعة. يرجى تجربة فتح التطبيق في نافذة مستقلة.",
        );
      }
    }, 550);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className="px-2 sm:px-3 text-primary-dark hover:bg-primary-bg rounded-full"
          >
            <Printer className="h-4 w-4 sm:ml-1 shrink-0 text-accent-dark" />
            <span className="hidden sm:inline font-bold">طباعة التقرير</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="max-w-md w-[95%] rounded-[32px] border-[3px] border-primary-light gap-4 p-5 sm:p-6 bg-cream shadow-xl"
        dir="rtl"
      >
        <DialogHeader className="text-right">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-primary-dark">
            <div className="text-xl flex items-center justify-center">🖨️</div>
            <span>إعداد وتنسيق طباعة التقرير</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-primary-dark/80 font-bold">
            اختر التنسيق والنموذج المناسب لطباعة هذا التقرير أو حفظه كـ PDF.
          </DialogDescription>
        </DialogHeader>

        {/* Iframe Warning */}
        {isIframe && (
          <div className="bg-coral/10 border-[3px] border-coral-light p-3 sm:p-4 rounded-[24px] text-coral-dark text-xs sm:text-sm leading-relaxed space-y-2 font-bold shadow-sm">
            <div className="flex items-start gap-2 font-black">
              <div className="text-base flex items-center justify-center mt-0.5">
                ⚠️
              </div>
              <span>تنبيه هام ومساعد للطباعة:</span>
            </div>
            <p className="font-extrabold text-right">
              بسبب قيود المتصفح الأمنية داخل نافذة المعاينة، لن يتم عرض نافذة
              الطباعة مباشرة.
            </p>
            <p>
              يرجى الضغط على الزر أدناه لفتح التطبيق في نافذة مستقلة لتفعيل
              خيارات الطباعة والحفظ كملف PDF بنجاح وبأعلى جودة:
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full flex items-center justify-center gap-2 border-[3px] border-coral-light bg-white hover:bg-cream text-coral-dark font-extrabold rounded-full py-2 mt-2 cursor-pointer no-print shadow-sm"
              onClick={() => window.open(window.location.href, "_blank")}
            >
              <ExternalLink className="h-4 w-4 text-coral shrink-0" />
              <span>افتح في نافذة مستقلة وجديدة ↗</span>
            </Button>
          </div>
        )}

        {/* Layout Selection */}
        <div className="space-y-3 my-2">
          <h3 className="text-xs sm:text-sm font-black text-primary-dark">
            شكل وتصميم الطباعة:
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* PC Layout Option */}
            <button
              type="button"
              onClick={() => setSelected("pc")}
              className={`flex flex-col items-center justify-center p-3 sm:p-4 border-[3px] rounded-[24px] text-center transition-all gap-2 bg-white cursor-pointer shadow-sm ${
                selected === "pc"
                  ? "border-accent ring-[4px] ring-accent/30 scale-[1.02]"
                  : "border-primary-light/50 hover:border-primary-light"
              }`}
            >
              <div
                className={`p-2 rounded-[16px] ${selected === "pc" ? "bg-accent/20 text-accent-dark" : "bg-primary-bg text-primary-dark"}`}
              >
                <Monitor className="h-6 w-6" />
              </div>
              <span className="text-xs sm:text-sm font-extrabold block text-primary-dark">
                تنسيق شاشات الكمبيوتر
              </span>
              <span className="text-[10px] sm:text-xs text-primary-dark/70 font-bold block max-w-[150px] leading-tight">
                (عرضي ممتد - A4 Landscape)
                <br />
                تنظيم البيانات عريضاً في صفوف كالبينتو جارد.
              </span>
            </button>

            {/* Mobile Layout Option */}
            <button
              type="button"
              onClick={() => setSelected("mobile")}
              className={`flex flex-col items-center justify-center p-3 sm:p-4 border-[3px] rounded-[24px] text-center transition-all gap-2 bg-white cursor-pointer shadow-sm ${
                selected === "mobile"
                  ? "border-accent ring-[4px] ring-accent/30 scale-[1.02]"
                  : "border-primary-light/50 hover:border-primary-light"
              }`}
            >
              <div
                className={`p-2 rounded-[16px] ${selected === "mobile" ? "bg-accent/20 text-accent-dark" : "bg-primary-bg text-primary-dark"}`}
              >
                <Smartphone className="h-6 w-6" />
              </div>
              <span className="text-xs sm:text-sm font-extrabold block text-primary-dark">
                تنسيق المحمول والـ PDF الطولي
              </span>
              <span className="text-[10px] sm:text-xs text-primary-dark/70 font-bold block max-w-[150px] leading-tight">
                (طولي مرتب - A4 Portrait)
                <br />
                يبسط العناصر بشكل عمودي لتكون واضحة ومقروءة جداً على الهاتف.
              </span>
            </button>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row-reverse gap-2 mt-2">
          <Button
            type="button"
            className="w-full sm:w-auto font-bold gap-1.5"
            onClick={handleStartPrint}
          >
            <Printer className="h-4 w-4 shrink-0" />
            <span>عرض خيارات وبدء الطباعة</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto rounded-full font-bold"
            onClick={() => setOpen(false)}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
