import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtNumber } from "@/lib/formatters";
import { Search, Sparkles } from "lucide-react";

export interface CustomerProductItem {
  customer_name: string;
  product_name: string;
  quantity: number;
  total_amount: number;
  unit_price?: number;
}

export interface DailyPricingProps {
  reportDate: string;
  customerProducts: CustomerProductItem[];
  customersList?: Array<{
    customer_name: string;
    sales_amount: number;
    total_qty?: number;
  }>;
}

// The exact specified commodities in standard display order
const TARGET_PRICING_PRODUCTS = [
  "ذرة صفراء",
  "نخالة",
  "صويا 46%",
  "رجيعة",
  "دي دي جي",
  "كسب النور",
];

function normalizeRawProductName(raw: string): string {
  return raw
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/٤/g, "4")
    .replace(/٦/g, "6")
    .replace(/٪/g, "%")
    .toLowerCase();
}

function mapToTargetPricingProduct(rawName: string): string | null {
  if (!rawName) return null;
  const norm = normalizeRawProductName(rawName);

  // 1. Check for Full Fat Soy (صويا فولفات) - MUST NEVER BE CLASSIFIED AS صويا 46%
  const isFullFat =
    norm.includes("فولفات") ||
    norm.includes("فول فات") ||
    norm.includes("فولفيت") ||
    norm.includes("fullfat") ||
    norm.includes("full fat") ||
    norm.includes("full_fat");

  if (isFullFat) {
    // صويا فولفات منتج منفصل تماماً عن صويا 46 ولا يدخل معه نهائياً
    return null;
  }

  // 2. Check for Soy 44% (صويا 44%) - Exclude from 46%
  if (norm.includes("44") && (norm.includes("صويا") || norm.includes("فول"))) {
    return null;
  }

  // 3. Exact matching for صويا 46% (فول صويا 46% / كسب صويا 46%)
  // يجب قراءة الاسم كاملاً والتأكد من وجود نسبة 46% وأنه صويا وليس فولفات
  if (
    norm.includes("46") &&
    (norm.includes("صويا") || norm.includes("فول") || norm.includes("كسب"))
  ) {
    return "صويا 46%";
  }

  // 4. Exact matching for ذرة صفراء (Yellow Corn)
  const isCornExcluded =
    norm.includes("بذر") ||
    norm.includes("بزر") ||
    norm.includes("كتان") ||
    norm.includes("جلوتين") ||
    norm.includes("جنين") ||
    norm.includes("قشر") ||
    norm.includes("كسب") ||
    norm.includes("نشا") ||
    norm.includes("زيت") ||
    norm.includes("مستخلص") ||
    norm.includes("ابيض") ||
    norm.includes("بيضاء") ||
    norm.includes("فشار") ||
    norm.includes("سيلاج") ||
    norm.includes("علف");

  if (!isCornExcluded) {
    if (
      norm.includes("ذره صفراء") ||
      norm.includes("ذرة صفراء") ||
      norm.includes("ذره ارجنتين") ||
      norm.includes("ذرة ارجنتين") ||
      norm.includes("ذره برازيل") ||
      norm.includes("ذرة برازيل") ||
      norm.includes("ذره اوكران") ||
      norm.includes("ذرة اوكران") ||
      norm.includes("ذره صب") ||
      norm.includes("ذرة صب") ||
      norm.includes("ذره مستورد") ||
      norm.includes("ذرة مستورد") ||
      norm.includes("ذره محلي") ||
      norm.includes("ذرة محلي") ||
      norm === "ذره" ||
      norm === "ذرة" ||
      norm === "الذره" ||
      norm === "الذرة" ||
      norm.startsWith("ذره ") ||
      norm.startsWith("ذرة ") ||
      norm.endsWith(" ذره") ||
      norm.endsWith(" ذرة")
    ) {
      return "ذرة صفراء";
    }
  }

  // 5. Exact matching for نخالة (Wheat Bran / ردة)
  if (
    (norm.includes("نخال") || norm.includes("رده") || norm.includes("ردة")) &&
    !norm.includes("علف") &&
    !norm.includes("مركز")
  ) {
    return "نخالة";
  }

  // 6. Exact matching for رجيعة (Rice Bran / رجيع كون)
  if (norm.includes("رجيع") && !norm.includes("علف")) {
    return "رجيعة";
  }

  // 7. Exact matching for دي دي جي (DDGS)
  if (norm.includes("دي دي") || norm.includes("ddg")) {
    return "دي دي جي";
  }

  // 8. Exact matching for كسب النور (Sunflower/linseed meal / كسب)
  // التأكد من استبعاد الأعلاف المصنعة التامة مثل علف النور تسمين وعلف النور حلاب
  const isFinishedFeed =
    norm.includes("علف") ||
    norm.includes("تسمين") ||
    norm.includes("حلاب") ||
    norm.includes("بياض") ||
    norm.includes("بادئ") ||
    norm.includes("نامي") ||
    norm.includes("ناهي") ||
    norm.includes("دواجن") ||
    norm.includes("مواشي");

  const isSoy = norm.includes("صويا") || norm.includes("فول");

  if (!isFinishedFeed && !isSoy) {
    if (
      norm.includes("كسب النور") ||
      norm.includes("كسب عباد") ||
      norm.includes("كسب بذره") ||
      norm.includes("كسب بذرة") ||
      norm.includes("كسب قطن") ||
      norm.includes("كسب سمسم") ||
      norm === "كسب"
    ) {
      return "كسب النور";
    }
  }

  return null;
}

export function DailyPricingReport({
  reportDate,
  customerProducts = [],
  customersList = [],
}: DailyPricingProps) {
  const [search, setSearch] = useState("");

  // Process products, customers, matrix, and statistics
  const data = useMemo(() => {
    // 1. Filter and map strictly to the target allowed commodities
    const validItems: CustomerProductItem[] = [];
    for (const cp of customerProducts) {
      if (!cp || !cp.customer_name || !cp.product_name) continue;
      if ((cp.quantity || 0) <= 0 && (cp.total_amount || 0) <= 0) continue;

      const canonicalName = mapToTargetPricingProduct(cp.product_name);
      if (!canonicalName) continue; // Exclude feeds or other non-target items

      validItems.push({
        ...cp,
        product_name: canonicalName,
      });
    }

    // 2. Products from the allowed list present in today's sales, in exact specified order
    const rawProducts = Array.from(
      new Set(validItems.map((cp) => cp.product_name)),
    );
    const sortedProducts = TARGET_PRICING_PRODUCTS.filter((targetName) =>
      rawProducts.includes(targetName),
    );

    // 3. Group by customer
    const customerMap = new Map<
      string,
      {
        name: string;
        products: Map<string, { qty: number; total: number; price: number }>;
        totalSales: number;
        totalQty: number;
      }
    >();

    // Seed customer map
    for (const c of customersList) {
      customerMap.set(c.customer_name, {
        name: c.customer_name,
        products: new Map(),
        totalSales: 0,
        totalQty: 0,
      });
    }

    for (const item of validItems) {
      const c = customerMap.get(item.customer_name) || {
        name: item.customer_name,
        products: new Map(),
        totalSales: 0,
        totalQty: 0,
      };

      const existingProd = c.products.get(item.product_name) || {
        qty: 0,
        total: 0,
        price: 0,
      };
      existingProd.qty += item.quantity || 0;
      existingProd.total += item.total_amount || 0;
      existingProd.price =
        existingProd.qty > 0
          ? Number((existingProd.total / existingProd.qty).toFixed(2))
          : item.unit_price || 0;

      c.products.set(item.product_name, existingProd);
      c.totalSales += item.total_amount || 0;
      c.totalQty += item.quantity || 0;
      customerMap.set(item.customer_name, c);
    }

    // Keep only customers who bought at least one of these target products today
    const activeCustomers = Array.from(customerMap.values()).filter(
      (c) => c.products.size > 0 && c.totalQty > 0,
    );
    activeCustomers.sort((a, b) => a.name.localeCompare(b.name, "ar"));

    // 4. Calculate for each product: Min, Max, Avg, and who got Min & Max
    const productStatsMap = new Map<
      string,
      {
        product: string;
        minPrice: number;
        minCustomer: string;
        maxPrice: number;
        maxCustomer: string;
        avgPrice: number;
        totalQty: number;
        totalAmount: number;
        hasPriceSpread: boolean;
      }
    >();

    let overallMinPrice = Infinity;
    let overallMaxPrice = -Infinity;
    let overallTotalSales = 0;
    let overallTotalQty = 0;

    let topProduct = { name: "-", qty: 0, total: 0 };
    let topCustomer = { name: "-", totalSales: 0 };

    for (const p of sortedProducts) {
      let pMin = Infinity;
      let pMinCust = "-";
      let pMax = -Infinity;
      let pMaxCust = "-";
      let pTotalQty = 0;
      let pTotalAmount = 0;

      for (const cust of activeCustomers) {
        const prodData = cust.products.get(p);
        if (prodData && prodData.qty > 0) {
          const price = prodData.price;
          pTotalQty += prodData.qty;
          pTotalAmount += prodData.total;

          if (price < pMin) {
            pMin = price;
            pMinCust = cust.name;
          }
          if (price > pMax) {
            pMax = price;
            pMaxCust = cust.name;
          }

          if (price < overallMinPrice) overallMinPrice = price;
          if (price > overallMaxPrice) overallMaxPrice = price;
        }
      }

      const pAvg = pTotalQty > 0 ? pTotalAmount / pTotalQty : 0;
      const validMin = pMin === Infinity ? 0 : pMin;
      const validMax = pMax === -Infinity ? 0 : pMax;

      productStatsMap.set(p, {
        product: p,
        minPrice: validMin,
        minCustomer: pMinCust,
        maxPrice: validMax,
        maxCustomer: pMaxCust,
        avgPrice: pAvg,
        totalQty: pTotalQty,
        totalAmount: pTotalAmount,
        hasPriceSpread: validMax > validMin && validMin > 0,
      });

      if (pTotalQty > topProduct.qty) {
        topProduct = { name: p, qty: pTotalQty, total: pTotalAmount };
      }
    }

    for (const cust of activeCustomers) {
      const custRecord = customersList.find(
        (c) => c.customer_name === cust.name,
      );
      const invoiceTotal =
        custRecord && custRecord.sales_amount > 0
          ? custRecord.sales_amount
          : cust.totalSales;

      const custQty =
        custRecord && custRecord.total_qty && custRecord.total_qty > 0
          ? custRecord.total_qty
          : cust.totalQty;

      cust.totalSales = invoiceTotal;
      overallTotalSales += invoiceTotal;
      overallTotalQty += custQty;
      if (invoiceTotal > topCustomer.totalSales) {
        topCustomer = { name: cust.name, totalSales: invoiceTotal };
      }
    }

    const overallAvgPrice =
      overallTotalQty > 0 ? overallTotalSales / overallTotalQty : 0;

    return {
      products: sortedProducts,
      customers: activeCustomers,
      productStats: productStatsMap,
      kpis: {
        totalCustomers: activeCustomers.length,
        totalSales: overallTotalSales,
        avgPrice: overallAvgPrice,
        highestPrice: overallMaxPrice === -Infinity ? 0 : overallMaxPrice,
        lowestPrice: overallMinPrice === Infinity ? 0 : overallMinPrice,
        topProduct: topProduct.name,
        topCustomer: topCustomer.name,
      },
    };
  }, [customerProducts, customersList]);

  // Filtered customer list by search query
  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return data.customers;
    const q = search.trim().toLowerCase();
    return data.customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [data.customers, search]);

  // Format date display
  const formattedDate = useMemo(() => {
    try {
      const d = new Date(reportDate);
      if (isNaN(d.getTime())) return reportDate;
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return reportDate;
    }
  }, [reportDate]);

  // Dynamically compute the ideal customer column percentage based on the longest name in the report
  const dynamicCustColWidthPercent = useMemo(() => {
    if (!filteredCustomers || filteredCustomers.length === 0) return 20;
    const maxChars = filteredCustomers.reduce(
      (max, c) => Math.max(max, (c.name || "").trim().length),
      0,
    );
    // Dynamic formula:
    // If longest name is 10 chars: ~16%
    // If longest name is 20 chars: ~20%
    // If longest name is 28 chars: ~23.5%
    // Clamped comfortably between 16% and 26%
    const computed = 11 + maxChars * 0.45;
    return Math.max(16, Math.min(26, parseFloat(computed.toFixed(1))));
  }, [filteredCustomers]);

  const numProducts = data.products.length || 1;
  const remainingForProducts = Math.max(
    50,
    100 - (3.5 + dynamicCustColWidthPercent),
  );
  const productSubColWidth = `${(remainingForProducts / (numProducts * 2)).toFixed(2)}%`;

  if (data.products.length === 0) {
    return (
      <Card className="rounded-2xl border-2 border-dashed border-muted p-8 text-center bg-card/50">
        <CardContent className="space-y-3">
          <Sparkles className="w-10 h-10 text-muted-foreground mx-auto opacity-40 animate-pulse" />
          <h3 className="font-bold text-lg text-foreground">
            لا توجد بيانات أصناف وأسعار لهذا اليوم
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            تأكد من رفع ملف فواتير اليوم متضمناً شيت &apos;تقرير مبيعات
            العملاء&apos; لإظهار مصفوفة أسعار البيع اليومية تلقائياً.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className="space-y-3 print:space-y-0 select-text pricing-print-wrapper"
      dir="rtl"
    >
      {/* Dynamic Style tuned specifically for Portrait (mobile friendly) and Landscape */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .pricing-print-wrapper {
                margin: 14px 0 !important;
                padding: 0 !important;
                width: 100% !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .pricing-main-card {
                border: 1.5px solid #475569 !important;
                box-shadow: none !important;
                border-radius: 4px !important;
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .pricing-banner {
                padding: 4px 6px !important;
                font-size: 14.5px !important;
                line-height: 1.25 !important;
              }
              .pricing-kpi-strip,
              .print-layout-pc .pricing-kpi-strip,
              .print-layout-mobile .pricing-kpi-strip {
                display: grid !important;
                grid-template-columns: repeat(5, minmax(0, 1fr)) minmax(0, 1.25fr) minmax(0, 1.85fr) !important;
                flex-direction: row !important;
                background-color: #f8fafc !important;
                border-bottom: 1.5px solid #94a3b8 !important;
                gap: 0 !important;
                width: 100% !important;
              }
              .pricing-kpi-item,
              .print-layout-pc .pricing-kpi-item,
              .print-layout-mobile .pricing-kpi-item {
                padding: 3.5px 2px !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                min-height: 0 !important;
                height: auto !important;
                width: auto !important;
              }
              .pricing-kpi-label,
              .print-layout-pc .pricing-kpi-label,
              .print-layout-mobile .pricing-kpi-label {
                font-size: 10.5px !important;
                font-weight: 700 !important;
                margin: 0 !important;
                padding: 0 !important;
                line-height: 1.15 !important;
                white-space: nowrap !important;
                color: #475569 !important;
              }
              .pricing-kpi-val,
              .print-layout-pc .pricing-kpi-val,
              .print-layout-mobile .pricing-kpi-val {
                font-size: 13.5px !important;
                font-weight: 900 !important;
                margin: 0 !important;
                padding: 0 !important;
                line-height: 1.15 !important;
                white-space: nowrap !important;
              }
              .pricing-section-title {
                padding: 3px 4px !important;
                font-size: 13px !important;
                line-height: 1.25 !important;
              }
              .pricing-table,
              .print-layout-pc .pricing-table,
              .print-layout-mobile .pricing-table {
                width: 100% !important;
                table-layout: fixed !important;
              }
              .pricing-table th,
              .pricing-table td,
              .print-layout-pc .pricing-table th,
              .print-layout-pc .pricing-table td,
              .print-layout-mobile .pricing-table th,
              .print-layout-mobile .pricing-table td {
                padding: 2.5px 2px !important;
                font-size: 12px !important;
                line-height: 1.25 !important;
              }
              .pricing-table th {
                font-size: 12.5px !important;
                font-weight: 800 !important;
              }
              .pricing-bottom-grid,
              .print-layout-pc .pricing-bottom-grid,
              .print-layout-mobile .pricing-bottom-grid {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                flex-direction: row !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                width: 100% !important;
              }
              .pricing-bottom-title {
                padding: 3px 4px !important;
                font-size: 12px !important;
                font-weight: 800 !important;
                line-height: 1.2 !important;
              }
              .pricing-bottom-table,
              .print-layout-pc .pricing-bottom-table,
              .print-layout-mobile .pricing-bottom-table {
                width: 100% !important;
                table-layout: fixed !important;
              }
              .pricing-bottom-table th,
              .pricing-bottom-table td,
              .print-layout-pc .pricing-bottom-table th,
              .print-layout-pc .pricing-bottom-table td,
              .print-layout-mobile .pricing-bottom-table th,
              .print-layout-mobile .pricing-bottom-table td {
                padding: 2px 2px !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                line-height: 1.2 !important;
              }
              table, tr, td, th {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          `,
        }}
      />

      {/* Search Toolbar (Hidden during print) */}
      <div className="no-print w-full max-w-6xl mx-auto flex items-center justify-end bg-card p-2 sm:p-2.5 rounded-2xl border shadow-xs">
        <div className="relative w-full max-w-sm">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث عن عميل في المصفوفة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9 h-8 sm:h-9 text-xs sm:text-sm rounded-xl"
          />
        </div>
        {search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearch("")}
            className="text-xs h-8 sm:h-9 px-2 text-muted-foreground mr-2"
          >
            إلغاء
          </Button>
        )}
      </div>

      {/* PRINTABLE CONTAINER: FIT ACROSS PAGE WITH ZERO GAP */}
      <div className="pricing-main-card w-full max-w-6xl mx-auto bg-white text-slate-900 border border-slate-300 rounded-xl overflow-hidden shadow-xs print:max-w-none print:w-full print:border-none print:shadow-none print:m-0">
        {/* 1. Header Banner */}
        <div className="pricing-banner bg-[#46634c] text-white text-center py-2.5 px-3 font-bold text-base sm:text-lg tracking-wide flex items-center justify-center gap-2">
          <span>تقرير الأسعار اليومية - بتاريخ {formattedDate}</span>
        </div>

        {/* 2. Top Summary KPI Strip - Proportional & legible */}
        <div className="pricing-kpi-strip grid grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.2fr)_minmax(0,1.8fr)] border-b border-slate-300 bg-slate-50 text-center divide-x divide-x-reverse divide-slate-200">
          {/* إجمالي العملاء */}
          <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
            <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
              إجمالي العملاء
            </div>
            <div className="pricing-kpi-val text-sm sm:text-base font-black text-[#2e7d32] leading-tight mt-0.5 whitespace-nowrap">
              عميل {data.kpis.totalCustomers}
            </div>
          </div>

          {/* إجمالي الفواتير */}
          <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
            <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
              إجمالي الفواتير
            </div>
            <div className="pricing-kpi-val text-sm sm:text-base font-black text-slate-900 leading-tight mt-0.5 whitespace-nowrap">
              {fmtNumber(data.kpis.totalSales, 0)}
            </div>
          </div>

          {/* متوسط سعر البيع */}
          <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
            <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
              متوسط السعر
            </div>
            <div className="pricing-kpi-val text-sm sm:text-base font-black text-slate-900 leading-tight mt-0.5 whitespace-nowrap">
              {data.kpis.avgPrice.toFixed(2)}
            </div>
          </div>

          {/* أعلى سعر بيع اليوم */}
          <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
            <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
              أعلى سعر بيع
            </div>
            <div className="pricing-kpi-val text-sm sm:text-base font-black text-slate-900 leading-tight mt-0.5 whitespace-nowrap">
              {data.kpis.highestPrice.toFixed(1)}
            </div>
          </div>

          {/* أقل سعر بيع اليوم */}
          <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
            <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
              أقل سعر بيع
            </div>
            <div className="pricing-kpi-val text-sm sm:text-base font-black text-slate-900 leading-tight mt-0.5 whitespace-nowrap">
              {data.kpis.lowestPrice.toFixed(1)}
            </div>
          </div>

          {/* الصنف الأكثر مبيعاً */}
          <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
            <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
              الأكثر مبيعاً
            </div>
            <div className="pricing-kpi-val text-xs sm:text-sm md:text-base font-black text-[#2e7d32] leading-snug mt-0.5 whitespace-normal break-words text-center px-0.5">
              {data.kpis.topProduct}
            </div>
          </div>

          {/* العميل الأكثر سحباً - يظهر كاملاً دون أي اقتطاع */}
          <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
            <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
              الأكثر سحباً
            </div>
            <div
              className="pricing-kpi-val text-xs sm:text-sm md:text-base font-black text-[#2e7d32] leading-snug mt-0.5 whitespace-normal break-words text-center px-1"
              title={data.kpis.topCustomer}
            >
              {data.kpis.topCustomer}
            </div>
          </div>
        </div>

        {/* 3. Section Title */}
        <div className="pricing-section-title bg-[#46634c] text-white text-center py-2 px-3 font-bold text-sm sm:text-base border-t border-b border-[#3b5340]">
          أسعار البيع الفعلية لكل صنف لكل عميل خلال اليوم
        </div>

        {/* 4. The Matrix Table - Exact proportional widths, larger fonts, zero gap */}
        <div className="overflow-x-auto">
          <table
            className="pricing-table w-full border-collapse text-center"
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: "3.5%" }} />
              <col style={{ width: `${dynamicCustColWidthPercent}%` }} />
              {data.products.map((p) => (
                <React.Fragment key={`col-${p}`}>
                  <col style={{ width: productSubColWidth }} />
                  <col style={{ width: productSubColWidth }} />
                </React.Fragment>
              ))}
            </colgroup>
            <thead>
              {/* Product Names (Top Header Row) */}
              <tr className="bg-slate-100 text-slate-800 font-bold border-b-2 border-slate-400">
                <th
                  rowSpan={2}
                  className="border-l-2 border-r-2 border-slate-400 py-2 px-1 bg-slate-200/90 text-slate-900 font-bold text-center text-sm sm:text-base"
                >
                  م
                </th>
                <th
                  rowSpan={2}
                  className="border-l-2 border-slate-400 py-2 px-2 text-right font-black bg-slate-200/90 text-slate-900 text-sm sm:text-base whitespace-nowrap"
                >
                  العميل
                </th>
                {data.products.map((p, pIdx) => (
                  <th
                    key={p}
                    colSpan={2}
                    className={`border-l-2 border-slate-400 py-2 px-1 font-black text-sm sm:text-base text-slate-900 ${
                      pIdx % 2 === 0 ? "bg-slate-200/80" : "bg-slate-100"
                    }`}
                  >
                    {p}
                  </th>
                ))}
              </tr>

              {/* Sub Header: Quantity & Price */}
              <tr className="bg-slate-50 text-slate-800 font-bold border-b-2 border-slate-400 text-xs sm:text-sm">
                {data.products.map((p, pIdx) => (
                  <React.Fragment key={`${p}-sub`}>
                    <th
                      className={`border-l border-slate-300 py-1 px-1 font-extrabold text-xs sm:text-sm ${
                        pIdx % 2 === 0 ? "bg-slate-100/70" : "bg-slate-50"
                      }`}
                    >
                      الكمية
                    </th>
                    <th
                      className={`border-l-2 border-slate-400 py-1 px-1 font-extrabold text-xs sm:text-sm ${
                        pIdx % 2 === 0 ? "bg-slate-100/70" : "bg-slate-50"
                      }`}
                    >
                      سعر البيع
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {filteredCustomers.map((cust, idx) => (
                <tr
                  key={cust.name}
                  className="hover:bg-slate-100/60 transition-colors odd:bg-white even:bg-slate-50/50"
                >
                  {/* Sequence Number */}
                  <td className="border-l-2 border-r-2 border-slate-400 py-2 px-1 font-bold text-slate-700 bg-slate-100/60 text-center text-sm sm:text-base">
                    {idx + 1}
                  </td>

                  {/* Customer Name - Dynamic width, NO truncation so full name always displays */}
                  <td
                    className="border-l-2 border-slate-400 py-2 px-2.5 text-right font-bold text-slate-900 whitespace-nowrap text-sm sm:text-base"
                    title={cust.name}
                  >
                    {cust.name}
                  </td>

                  {/* Product Columns (Qty & Price) */}
                  {data.products.map((p, pIdx) => {
                    const prod = cust.products.get(p);
                    const stats = data.productStats.get(p);
                    const colBg = pIdx % 2 === 0 ? "bg-slate-50/25" : "";

                    if (!prod || prod.qty <= 0) {
                      return (
                        <React.Fragment key={`${cust.name}-${p}`}>
                          <td
                            className={`border-l border-slate-200 py-2 px-1 text-slate-300 text-sm sm:text-base text-center ${colBg}`}
                          >
                            -
                          </td>
                          <td
                            className={`border-l-2 border-slate-400 py-2 px-1 text-slate-300 text-sm sm:text-base text-center ${colBg}`}
                          >
                            -
                          </td>
                        </React.Fragment>
                      );
                    }

                    const isMin =
                      stats?.hasPriceSpread &&
                      Math.abs(prod.price - stats.minPrice) < 0.05;
                    const isMax =
                      stats?.hasPriceSpread &&
                      Math.abs(prod.price - stats.maxPrice) < 0.05;

                    // Color highlighting matching original Excel pastel format
                    let priceCellClass = "font-bold text-slate-900";
                    if (isMin) {
                      priceCellClass =
                        "bg-[#f4cccc] text-[#900000] font-black border border-[#ea9999]";
                    } else if (isMax) {
                      priceCellClass =
                        "bg-[#d9ead3] text-[#274e13] font-black border border-[#b6d7a8]";
                    }

                    return (
                      <React.Fragment key={`${cust.name}-${p}`}>
                        <td
                          className={`border-l border-slate-200 py-2 px-1 text-slate-800 font-semibold text-sm sm:text-base tabular-nums text-center ${colBg}`}
                        >
                          {fmtNumber(prod.qty, prod.qty % 1 === 0 ? 0 : 1)}
                        </td>
                        <td
                          className={`border-l-2 border-slate-400 py-2 px-1 text-sm sm:text-base tabular-nums text-center ${priceCellClass}`}
                          title={`السعر: ${prod.price.toFixed(2)}`}
                        >
                          {prod.price % 1 === 0
                            ? prod.price
                            : prod.price.toFixed(2)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 5. Bottom 3 Analytical Comparison Tables */}
        <div className="pricing-bottom-grid grid grid-cols-1 md:grid-cols-3 border-t-2 border-slate-400 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-slate-300 bg-white">
          {/* Table 1: أقل سعر لكل صنف (الأحمر) */}
          <div className="overflow-hidden flex flex-col">
            <div className="pricing-bottom-title h-9 bg-[#b71c1c] text-white flex items-center justify-center px-2 font-bold text-sm sm:text-base">
              أقل سعر لكل صنف
            </div>
            <table
              className="pricing-bottom-table w-full text-xs sm:text-sm text-center border-collapse flex-1"
              style={{ tableLayout: "fixed" }}
            >
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "42%" }} />
                <col style={{ width: "28%" }} />
              </colgroup>
              <thead>
                <tr className="bg-red-50 text-red-950 font-bold border-b border-red-200 h-8">
                  <th className="h-8 py-1 px-1 border-l border-red-200 align-middle text-center whitespace-nowrap text-xs sm:text-sm">
                    الصنف
                  </th>
                  <th className="h-8 py-1 px-1 border-l border-red-200 text-center align-middle whitespace-nowrap text-xs sm:text-sm">
                    العميل
                  </th>
                  <th className="h-8 py-1 px-1 text-center align-middle whitespace-nowrap text-xs sm:text-sm">
                    السعر
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100">
                {data.products.map((p) => {
                  const s = data.productStats.get(p);
                  const hasData = s && s.totalQty > 0;
                  return (
                    <tr
                      key={`min-${p}`}
                      className="h-8 hover:bg-red-50/50 odd:bg-white even:bg-red-50/20"
                    >
                      <td className="h-8 py-1 px-1 font-bold border-l border-red-200 text-slate-900 whitespace-nowrap align-middle text-xs sm:text-sm">
                        {p}
                      </td>
                      <td
                        className="h-8 py-1 px-1 border-l border-red-200 text-slate-800 truncate text-center font-medium align-middle text-xs sm:text-sm"
                        title={hasData ? s.minCustomer : "-"}
                      >
                        {hasData ? s.minCustomer : "-"}
                      </td>
                      <td className="h-8 py-1 px-1 font-black text-[#c62828] bg-red-50/70 align-middle text-xs sm:text-sm">
                        {hasData
                          ? s.minPrice % 1 === 0
                            ? s.minPrice
                            : s.minPrice.toFixed(2)
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table 2: أعلى سعر لكل صنف (الأخضر) */}
          <div className="overflow-hidden flex flex-col">
            <div className="pricing-bottom-title h-9 bg-[#2e7d32] text-white flex items-center justify-center px-2 font-bold text-sm sm:text-base">
              أعلى سعر لكل صنف
            </div>
            <table
              className="pricing-bottom-table w-full text-xs sm:text-sm text-center border-collapse flex-1"
              style={{ tableLayout: "fixed" }}
            >
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "42%" }} />
                <col style={{ width: "28%" }} />
              </colgroup>
              <thead>
                <tr className="bg-emerald-50 text-emerald-950 font-bold border-b border-emerald-200 h-8">
                  <th className="h-8 py-1 px-1 border-l border-emerald-200 align-middle text-center whitespace-nowrap text-xs sm:text-sm">
                    الصنف
                  </th>
                  <th className="h-8 py-1 px-1 border-l border-emerald-200 text-center align-middle whitespace-nowrap text-xs sm:text-sm">
                    العميل
                  </th>
                  <th className="h-8 py-1 px-1 text-center align-middle whitespace-nowrap text-xs sm:text-sm">
                    السعر
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100">
                {data.products.map((p) => {
                  const s = data.productStats.get(p);
                  const hasData = s && s.totalQty > 0;
                  return (
                    <tr
                      key={`max-${p}`}
                      className="h-8 hover:bg-emerald-50/50 odd:bg-white even:bg-emerald-50/20"
                    >
                      <td className="h-8 py-1 px-1 font-bold border-l border-emerald-200 text-slate-900 whitespace-nowrap align-middle text-xs sm:text-sm">
                        {p}
                      </td>
                      <td
                        className="h-8 py-1 px-1 border-l border-emerald-200 text-slate-800 truncate text-center font-medium align-middle text-xs sm:text-sm"
                        title={hasData ? s.maxCustomer : "-"}
                      >
                        {hasData ? s.maxCustomer : "-"}
                      </td>
                      <td className="h-8 py-1 px-1 font-black text-[#2e7d32] bg-emerald-50/70 align-middle text-xs sm:text-sm">
                        {hasData
                          ? s.maxPrice % 1 === 0
                            ? s.maxPrice
                            : s.maxPrice.toFixed(2)
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table 3: ملخص الأسعار لكل صنف (الأزرق) */}
          <div className="overflow-hidden flex flex-col">
            <div className="pricing-bottom-title h-9 bg-[#1565c0] text-white flex items-center justify-center px-2 font-bold text-sm sm:text-base">
              ملخص الأسعار لكل صنف
            </div>
            <table
              className="pricing-bottom-table w-full text-xs sm:text-sm text-center border-collapse flex-1"
              style={{ tableLayout: "fixed" }}
            >
              <colgroup>
                <col style={{ width: "28%" }} />
                <col style={{ width: "24%" }} />
                <col style={{ width: "24%" }} />
                <col style={{ width: "24%" }} />
              </colgroup>
              <thead>
                <tr className="bg-blue-50 text-blue-950 font-bold border-b border-blue-200 h-8">
                  <th className="h-8 py-1 px-1 border-l border-blue-200 align-middle text-center whitespace-nowrap text-xs sm:text-sm">
                    الصنف
                  </th>
                  <th className="h-8 py-1 px-1 border-l border-blue-200 text-red-700 align-middle text-center whitespace-nowrap text-xs sm:text-sm">
                    أقل سعر
                  </th>
                  <th className="h-8 py-1 px-1 border-l border-blue-200 text-emerald-700 align-middle text-center whitespace-nowrap text-xs sm:text-sm">
                    أعلى سعر
                  </th>
                  <th className="h-8 py-1 px-1 text-blue-800 text-center align-middle whitespace-nowrap text-xs sm:text-sm">
                    متوسط السعر
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {data.products.map((p) => {
                  const s = data.productStats.get(p);
                  const hasData = s && s.totalQty > 0;
                  return (
                    <tr
                      key={`sum-${p}`}
                      className="h-8 hover:bg-blue-50/50 odd:bg-white even:bg-blue-50/20"
                    >
                      <td className="h-8 py-1 px-1 font-bold border-l border-blue-200 text-slate-900 whitespace-nowrap align-middle text-xs sm:text-sm">
                        {p}
                      </td>
                      <td className="h-8 py-1 px-1 font-black text-red-700 border-l border-blue-200 align-middle text-xs sm:text-sm">
                        {hasData
                          ? s.minPrice % 1 === 0
                            ? s.minPrice
                            : s.minPrice.toFixed(2)
                          : "-"}
                      </td>
                      <td className="h-8 py-1 px-1 font-black text-emerald-700 border-l border-blue-200 align-middle text-xs sm:text-sm">
                        {hasData
                          ? s.maxPrice % 1 === 0
                            ? s.maxPrice
                            : s.maxPrice.toFixed(2)
                          : "-"}
                      </td>
                      <td className="h-8 py-1 px-1 font-black text-blue-800 bg-blue-50/50 align-middle text-xs sm:text-sm">
                        {hasData ? s.avgPrice.toFixed(2) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
