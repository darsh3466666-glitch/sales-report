import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { AlertTriangle, TrendingUp, Zap } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateAiSummary } from "@/lib/ai-summary.functions";
import { getLatestReportFull } from "@/lib/reports.functions";
import { saveAiSummaryLocally } from "@/lib/local-db";
import { toast } from "sonner";

interface Summary {
  executiveSummary?: string;
  risks?: string[];
  opportunities?: string[];
  recommendations?: string[];
  collectionInsights?: string;
  salesInsights?: string;
}

export function AiSummaryCard({
  reportId,
  summary,
  onUpdate,
}: {
  reportId: string;
  summary: Summary | null;
  onUpdate: (s: Summary) => void;
}) {
  const [loading, setLoading] = useState(false);
  const genFn = useServerFn(generateAiSummary);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  async function generate() {
    setLoading(true);
    try {
      const full = await getLatestReportFull({ data: { reportId } });
      if (!full?.report) throw new Error("No report to summarize");
      const res = await genFn({
        data: {
          reportId: full.report.id,
          stats: full.report,
          yesterday: full.comparisons?.yesterday,
          lastWeek: full.comparisons?.lastWeek,
          lastMonth: full.comparisons?.lastMonth,
          customers: full.customers,
        },
      });
      await saveAiSummaryLocally(reportId, res);
      if (isMounted.current) {
        onUpdate(res);
        toast.success("تم توليد التحليل");
      }
    } catch (e) {
      if (isMounted.current) {
        toast.error(e instanceof Error ? e.message : "فشل التوليد");
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }

  return (
    <Card className="shadow-accent-glow border-0 rounded-[32px] bg-gradient-to-br from-cream to-cream/80 overflow-hidden relative border-t-0 border-b-0 border-l-0">
      <CardHeader className="flex-row items-center justify-between border-b-[3px] border-dashed border-primary-dark/20 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="text-2xl flex items-center justify-center">✨</div>
          <CardTitle className="text-xl sm:text-2xl font-extrabold tracking-wide text-primary-dark">
            الملخص التنفيذي بالذكاء الاصطناعي
          </CardTitle>
        </div>
        <Button
          size="sm"
          onClick={generate}
          disabled={loading}
          className="rounded-full font-bold px-6"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin ml-1" />
          ) : (
            <Sparkles className="h-4 w-4 ml-1" />
          )}
          {summary ? "تحديث" : "توليد"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm font-medium">
        {!summary && !loading && (
          <p className="text-primary-dark/70 text-center py-6 text-base font-bold">
            اضغط "توليد" لإنشاء تحليل تنفيذي شامل بناءً على بيانات اليوم.
          </p>
        )}
        {summary?.executiveSummary && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border-[3px] border-primary-light">
            <h4 className="font-extrabold text-lg mb-2 flex items-center gap-2 text-primary-dark">
              <div className="text-xl flex items-center justify-center">📊</div>{" "}
              الخلاصة التنفيذية
            </h4>
            <p className="leading-relaxed text-base text-primary-dark/90 font-bold">
              {summary.executiveSummary}
            </p>
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-4">
          {summary?.salesInsights && (
            <div className="rounded-2xl border-[3px] border-info bg-white p-4 shadow-sm">
              <h5 className="font-extrabold text-info mb-2 flex items-center gap-2">
                <div className="text-xl flex items-center justify-center">
                  🚀
                </div>{" "}
                تحليل المبيعات
              </h5>
              <p className="leading-relaxed text-base text-primary-dark/80 font-bold">
                {summary.salesInsights}
              </p>
            </div>
          )}
          {summary?.collectionInsights && (
            <div className="rounded-2xl border-[3px] border-success bg-white p-4 shadow-sm">
              <h5 className="font-extrabold text-success mb-2 flex items-center gap-2">
                <div className="text-xl flex items-center justify-center">
                  💰
                </div>{" "}
                تحليل التحصيل
              </h5>
              <p className="leading-relaxed text-base text-primary-dark/80 font-bold">
                {summary.collectionInsights}
              </p>
            </div>
          )}
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {!!summary?.risks?.length && (
            <div className="rounded-2xl border-[3px] border-coral bg-coral/5 p-4 shadow-sm">
              <h5 className="font-extrabold text-coral mb-3 flex items-center gap-2">
                <div className="text-xl flex items-center justify-center">
                  ⚠️
                </div>{" "}
                المخاطر
              </h5>
              <ul className="space-y-2 list-disc pr-5 font-bold text-coral-dark">
                {summary.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {!!summary?.opportunities?.length && (
            <div className="rounded-2xl border-[3px] border-success bg-success/5 p-4 shadow-sm">
              <h5 className="font-extrabold text-success mb-3 flex items-center gap-2">
                <div className="text-xl flex items-center justify-center">
                  🌟
                </div>{" "}
                الفرص
              </h5>
              <ul className="space-y-2 list-disc pr-5 font-bold text-success">
                {summary.opportunities.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {!!summary?.recommendations?.length && (
            <div className="rounded-2xl border-[3px] border-info bg-info/5 p-4 shadow-sm">
              <h5 className="font-extrabold text-info mb-3 flex items-center gap-2">
                <div className="text-xl flex items-center justify-center">
                  💡
                </div>{" "}
                التوصيات
              </h5>
              <ul className="space-y-2 list-disc pr-5 font-bold text-info">
                {summary.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
