import React from "react";
import { fmtNumber } from "@/lib/formatters";
import { DailyPricingKpis } from "./pricing-types";

interface PricingKpiStripProps {
  kpis: DailyPricingKpis;
}

export function PricingKpiStrip({ kpis }: PricingKpiStripProps) {
  return (
    <div className="pricing-kpi-strip grid grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.2fr)_minmax(0,1.8fr)] border-b border-slate-300 bg-slate-50 text-center divide-x divide-x-reverse divide-slate-200">
      {/* إجمالي العملاء */}
      <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
        <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
          إجمالي العملاء
        </div>
        <div className="pricing-kpi-val text-sm sm:text-base font-black text-[#2e7d32] leading-tight mt-0.5 whitespace-nowrap">
          عميل {kpis.totalCustomers}
        </div>
      </div>

      {/* إجمالي الفواتير */}
      <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
        <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
          إجمالي الفواتير
        </div>
        <div className="pricing-kpi-val text-sm sm:text-base font-black text-slate-900 leading-tight mt-0.5 whitespace-nowrap">
          {fmtNumber(kpis.totalSales, 0)}
        </div>
      </div>

      {/* متوسط سعر البيع */}
      <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
        <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
          متوسط السعر
        </div>
        <div className="pricing-kpi-val text-sm sm:text-base font-black text-slate-900 leading-tight mt-0.5 whitespace-nowrap">
          {kpis.avgPrice.toFixed(2)}
        </div>
      </div>

      {/* أعلى سعر بيع اليوم */}
      <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
        <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
          أعلى سعر بيع
        </div>
        <div className="pricing-kpi-val text-sm sm:text-base font-black text-slate-900 leading-tight mt-0.5 whitespace-nowrap">
          {kpis.highestPrice.toFixed(1)}
        </div>
      </div>

      {/* أقل سعر بيع اليوم */}
      <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
        <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
          أقل سعر بيع
        </div>
        <div className="pricing-kpi-val text-sm sm:text-base font-black text-slate-900 leading-tight mt-0.5 whitespace-nowrap">
          {kpis.lowestPrice.toFixed(1)}
        </div>
      </div>

      {/* الصنف الأكثر مبيعاً */}
      <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
        <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
          الأكثر مبيعاً
        </div>
        <div className="pricing-kpi-val text-xs sm:text-sm md:text-base font-black text-[#2e7d32] leading-snug mt-0.5 whitespace-normal break-words text-center px-0.5">
          {kpis.topProduct}
        </div>
      </div>

      {/* العميل الأكثر سحباً */}
      <div className="pricing-kpi-item p-1 sm:p-1.5 flex flex-col items-center justify-center text-center">
        <div className="pricing-kpi-label text-xs sm:text-sm font-bold text-slate-600 leading-tight">
          الأكثر سحباً
        </div>
        <div
          className="pricing-kpi-val text-xs sm:text-sm md:text-base font-black text-[#2e7d32] leading-snug mt-0.5 whitespace-normal break-words text-center px-1"
          title={kpis.topCustomer}
        >
          {kpis.topCustomer}
        </div>
      </div>
    </div>
  );
}
