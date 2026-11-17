import React from "react";
import { fmtNumber } from "@/lib/formatters";
import { CustomerMatrixRow, ProductStat } from "./pricing-types";

interface PricingMatrixTableProps {
  products: string[];
  customers: CustomerMatrixRow[];
  productStats: Map<string, ProductStat>;
  dynamicCustColWidthPercent: number;
  productSubColWidth: string;
}

export function PricingMatrixTable({
  products,
  customers,
  productStats,
  dynamicCustColWidthPercent,
  productSubColWidth,
}: PricingMatrixTableProps) {
  // Ensure table has adequate minimum width so columns never overlap on mobile
  const minTableWidth = Math.max(760, 220 + products.length * 130);

  return (
    <div className="relative w-full overflow-hidden">
      {/* Mobile Swipe Hint (visible on small screens) */}
      <div className="block md:hidden bg-amber-50/90 text-amber-900 border-b border-amber-200 text-[11px] font-bold py-1.5 px-3 text-center no-print">
        👈 يمكنك سحب الجدول أفقياً لتصفح بقية الأصناف والأسعار
      </div>

      <div
        className="overflow-x-auto w-full smooth-touch-scroll"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <table
          className="pricing-table w-full border-collapse text-center"
          style={{
            tableLayout: "fixed",
            minWidth: `${minTableWidth}px`,
          }}
        >
          <colgroup>
            <col style={{ width: "42px" }} />
            <col style={{ width: `${Math.max(160, dynamicCustColWidthPercent * 10)}px` }} />
            {products.map((p) => (
              <React.Fragment key={`col-${p}`}>
                <col style={{ width: "65px" }} />
                <col style={{ width: "70px" }} />
              </React.Fragment>
            ))}
          </colgroup>
          <thead>
            {/* Product Names (Top Header Row) */}
            <tr className="bg-slate-100 text-slate-800 font-bold border-b-2 border-slate-400">
              <th
                rowSpan={2}
                className="sticky right-0 z-20 border-l-2 border-r-2 border-slate-400 py-2 px-1 bg-slate-200 text-slate-900 font-bold text-center text-xs sm:text-base w-[42px]"
              >
                م
              </th>
              <th
                rowSpan={2}
                className="sticky right-[42px] z-20 border-l-2 border-slate-400 py-2 px-2 text-right font-black bg-slate-200 text-slate-900 text-xs sm:text-base whitespace-nowrap shadow-[-3px_0_5px_-1px_rgba(0,0,0,0.12)]"
              >
                العميل
              </th>
              {products.map((p, pIdx) => (
                <th
                  key={p}
                  colSpan={2}
                  className={`border-l-2 border-slate-400 py-2 px-1 font-black text-xs sm:text-base text-slate-900 ${
                    pIdx % 2 === 0 ? "bg-slate-200/80" : "bg-slate-100"
                  }`}
                >
                  {p}
                </th>
              ))}
            </tr>

            {/* Sub Header: Quantity & Price */}
            <tr className="bg-slate-50 text-slate-800 font-bold border-b-2 border-slate-400 text-xs sm:text-sm">
              {products.map((p, pIdx) => (
                <React.Fragment key={`${p}-sub`}>
                  <th
                    className={`border-l border-slate-300 py-1 px-1 font-extrabold text-[11px] sm:text-sm whitespace-nowrap ${
                      pIdx % 2 === 0 ? "bg-slate-100/70" : "bg-slate-50"
                    }`}
                  >
                    الكمية
                  </th>
                  <th
                    className={`border-l-2 border-slate-400 py-1 px-1 font-extrabold text-[11px] sm:text-sm whitespace-nowrap ${
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
            {customers.map((cust, idx) => (
              <tr
                key={cust.name}
                className="group hover:bg-slate-100/60 transition-colors odd:bg-white even:bg-slate-50/50"
              >
                {/* Sequence Number - Sticky */}
                <td className="sticky right-0 z-10 border-l-2 border-r-2 border-slate-400 py-2 px-1 font-bold text-slate-700 bg-slate-100 text-center text-xs sm:text-base w-[42px]">
                  {idx + 1}
                </td>

                {/* Customer Name - Sticky with solid background and shadow */}
                <td
                  className="sticky right-[42px] z-10 border-l-2 border-slate-400 py-2 px-2.5 text-right font-bold text-slate-900 whitespace-nowrap text-xs sm:text-base bg-white group-hover:bg-slate-50 shadow-[-3px_0_5px_-1px_rgba(0,0,0,0.12)]"
                  title={cust.name}
                >
                  {cust.name}
                </td>

                {/* Product Columns (Qty & Price) */}
                {products.map((p, pIdx) => {
                  const prod = cust.products.get(p);
                  const stats = productStats.get(p);
                  const colBg = pIdx % 2 === 0 ? "bg-slate-50/25" : "";

                  if (!prod || prod.qty <= 0) {
                    return (
                      <React.Fragment key={`${cust.name}-${p}`}>
                        <td
                          className={`border-l border-slate-200 py-2 px-1 text-slate-300 text-xs sm:text-base text-center ${colBg}`}
                        >
                          -
                        </td>
                        <td
                          className={`border-l-2 border-slate-400 py-2 px-1 text-slate-300 text-xs sm:text-base text-center ${colBg}`}
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
                        className={`border-l border-slate-200 py-2 px-1 text-slate-800 font-semibold text-xs sm:text-base tabular-nums text-center whitespace-nowrap ${colBg}`}
                      >
                        {fmtNumber(prod.qty, prod.qty % 1 === 0 ? 0 : 1)}
                      </td>
                      <td
                        className={`border-l-2 border-slate-400 py-2 px-1 text-xs sm:text-base tabular-nums text-center whitespace-nowrap ${priceCellClass}`}
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
    </div>
  );
}
