import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

export const generateAiSummary = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        reportId: z.string(),
        stats: z.object({
          report_date: z.string(),
          total_sales: z.number(),
          total_collected: z.number(),
          collection_rate: z.number(),
          total_receivables: z.number(),
          total_qty: z.number(),
          feed_qty: z.number(),
          raw_material_qty: z.number(),
          customer_count: z.number(),
          invoice_count: z.number(),
          average_invoice: z.number(),
        }),
        yesterday: z.any().optional(),
        lastWeek: z.any().optional(),
        lastMonth: z.any().optional(),
        customers: z.any().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "يرجى إعداد مفتاح GEMINI_API_KEY في الإعدادات (Settings > Secrets)",
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const report = data.stats;
    const yesterday = data.yesterday;
    const lastWeek = data.lastWeek;
    const lastMonth = data.lastMonth;
    const customers = data.customers || [];

    const prompt = `أنت محلل مالي تنفيذي خبير في شركة تصنيع وتوزيع الأعلاف. قم بتحليل البيانات التالية وقدم تقريراً تنفيذياً موجزاً باللغة العربية.

بيانات اليوم (${report.report_date}):
- إجمالي المبيعات: ${report.total_sales.toLocaleString()} ج.م
- إجمالي التحصيل: ${report.total_collected.toLocaleString()} ج.م
- نسبة التحصيل: ${(report.collection_rate * 100).toFixed(1)}%
- إجمالي الذمم: ${report.total_receivables.toLocaleString()} ج.م
- إجمالي الكميات: ${report.total_qty} كيلو (علف: ${report.feed_qty}، خامات: ${report.raw_material_qty})
- عدد العملاء: ${report.customer_count}
- عدد الفواتير: ${report.invoice_count}
- متوسط الفاتورة: ${report.average_invoice.toLocaleString()} ج.م

${yesterday ? `أمس: مبيعات ${yesterday.total_sales.toLocaleString()}، تحصيل ${yesterday.total_collected.toLocaleString()}` : ""}
${lastWeek ? `نفس اليوم الأسبوع الماضي: مبيعات ${lastWeek.total_sales.toLocaleString()}، تحصيل ${lastWeek.total_collected.toLocaleString()}` : ""}
${lastMonth ? `الشهر الماضي: مبيعات ${lastMonth.total_sales.toLocaleString()}، تحصيل ${lastMonth.total_collected.toLocaleString()}` : ""}

أكبر 10 عملاء بالمبيعات:
${customers
  .slice(0, 10)
  .map(
    (c: any) =>
      `- ${c.customer_name}: مبيعات ${c.sales_amount.toLocaleString()}، تحصيل ${c.collected_amount.toLocaleString()}، نسبة ${(c.collection_ratio * 100).toFixed(0)}%`,
  )
  .join("\n")}

أعد الإجابة بصيغة JSON صالحة فقط بدون أي نص آخر بهذا الشكل:
{
  "executiveSummary": "ملخص تنفيذي في 2-3 جمل",
  "risks": ["مخاطرة 1", "مخاطرة 2"],
  "opportunities": ["فرصة 1", "فرصة 2"],
  "recommendations": ["توصية 1", "توصية 2", "توصية 3"],
  "collectionInsights": "تحليل التحصيل في جملتين",
  "salesInsights": "تحليل المبيعات في جملتين"
}`;

    // Try different models as fallbacks if the API returns 503/UNAVAILABLE or rate limits
    const modelsToTry = [
      "gemini-2.5-flash",
      "gemini-1.5-flash",
      "gemini-2.5-pro",
    ];
    let lastError: any = null;
    let text = "";

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting to generate summary using model: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });
        if (response.text) {
          text = response.text;
          console.log(
            `Successfully generated summary using model: ${modelName}`,
          );
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(
          `Model ${modelName} failed or returned error:`,
          err.message || err,
        );
        // Wait a small moment before trying the fallback to prevent instant thrashing
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!text) {
      console.warn(
        "AI generation failed or quota exceeded, using heuristic financial summary fallback.",
      );
      const topCustomer = customers
        .slice()
        .sort(
          (a: any, b: any) => (b.sales_amount || 0) - (a.sales_amount || 0),
        )[0];
      const collPct = (report.collection_rate * 100).toFixed(1);
      return {
        executiveSummary: `بلغت مبيعات اليوم ${report.total_sales.toLocaleString()} ج.م بكمية إجمالية قدرها ${report.total_qty.toLocaleString()} كجم بنسبة تحصيل ${collPct}% ومتحصلات نقدية بلغت ${report.total_collected.toLocaleString()} ج.م، مع بلوغ إجمالي رصيد المديونية ${report.total_receivables.toLocaleString()} ج.م.`,
        risks: [
          report.collection_rate < 0.2
            ? `نسبة التحصيل منخفضة (${collPct}%) وتحتاج لمتابعة فورية للمتحصلات`
            : `متابعة تحصيل الآجل للعملاء ذوي المديونيات المرتفعة`,
          topCustomer
            ? `تركيز نسبي في مبيعات العميل (${topCustomer.customer_name}) بإجمالي ${topCustomer.sales_amount?.toLocaleString()} ج.م`
            : `تذبذب كميات السحب اليومية`,
        ],
        opportunities: [
          `تنشيط تحصيل مستحقات العملاء ذوي الرصيد السابق`,
          `زيادة معدلات دوران أصناف الأعلاف ذات السحب العالي (${report.feed_qty.toLocaleString()} كجم)`,
        ],
        recommendations: [
          `ربط تسليم طلبيات الغد بنسب تحصيل لا تقل عن 50% للعملاء ذوي المديونية المرتفعة`,
          `متابعة مبيعات الخامات والأعلاف ومقارنتها بتكلفة المخزون المتبقي`,
          `تحديث أذون الصرف وسندات القبض يومياً لضبط أرصدة العملاء بدقة`,
        ],
        collectionInsights: `تم تحصيل مبلغ ${report.total_collected.toLocaleString()} ج.م بنسبة بلغت ${collPct}% من مبيعات اليوم.`,
        salesInsights: `بلغ إجمالي المبيعات ${report.total_sales.toLocaleString()} ج.م موزعة على ${report.invoice_count} فاتورة بمتوسط ${report.average_invoice.toLocaleString()} ج.م لكل فاتورة.`,
      };
    }

    type Summary = {
      executiveSummary: string;
      risks: string[];
      opportunities: string[];
      recommendations: string[];
      collectionInsights: string;
      salesInsights: string;
    };
    let parsed: Summary;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : text) as Summary;
    } catch {
      parsed = {
        executiveSummary: text,
        risks: [],
        opportunities: [],
        recommendations: [],
        collectionInsights: "",
        salesInsights: "",
      };
    }

    return parsed;
  });
