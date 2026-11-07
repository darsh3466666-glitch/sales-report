import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Sparkles } from "lucide-react";
import {
  CustomerProductItem,
  DailyPricingProps,
  CustomerMatrixRow,
  ProductStat,
  ProcessedPricingData,
  TARGET_PRICING_PRODUCTS,
  mapToTargetPricingProduct,
} from "./daily-pricing/pricing-types";
import { PricingKpiStrip } from "./daily-pricing/PricingKpiStrip";
import { PricingMatrixTable } from "./daily-pricing/PricingMatrixTable";
import { PricingAnalyticsTables } from "./daily-pricing/PricingAnalyticsTables";

export type { CustomerProductItem, DailyPricingProps };

export function DailyPricingReport({
  reportDate,
  customerProducts = [],
  customersList = [],
}: DailyPricingProps) {
  const [search, setSearch] = useState("");

  // Process products, customers, matrix, and statistics
  const data: ProcessedPricingData = useMemo(() => {
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
    const customerMap = new Map<string, CustomerMatrixRow>();

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
    const productStatsMap = new Map<string, ProductStat>();

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

      {/* PRINTABLE CONTAINER */}
      <div className="pricing-main-card w-full max-w-6xl mx-auto bg-white text-slate-900 border border-slate-300 rounded-xl overflow-hidden shadow-xs print:max-w-none print:w-full print:border-none print:shadow-none print:m-0">
        {/* 1. Header Banner */}
        <div className="pricing-banner bg-[#46634c] text-white text-center py-2.5 px-3 font-bold text-base sm:text-lg tracking-wide flex items-center justify-center gap-2">
          <span>تقرير الأسعار اليومية - بتاريخ {formattedDate}</span>
        </div>

        {/* 2. Top Summary KPI Strip */}
        <PricingKpiStrip kpis={data.kpis} />

        {/* 3. Section Title */}
        <div className="pricing-section-title bg-[#46634c] text-white text-center py-2 px-3 font-bold text-sm sm:text-base border-t border-b border-[#3b5340]">
          أسعار البيع الفعلية لكل صنف لكل عميل خلال اليوم
        </div>

        {/* 4. The Matrix Table */}
        <PricingMatrixTable
          products={data.products}
          customers={filteredCustomers}
          productStats={data.productStats}
          dynamicCustColWidthPercent={dynamicCustColWidthPercent}
          productSubColWidth={productSubColWidth}
        />

        {/* 5. Bottom 3 Analytical Comparison Tables */}
        <PricingAnalyticsTables
          products={data.products}
          productStats={data.productStats}
        />
      </div>
    </div>
  );
}
