import * as XLSX from "xlsx";
import { CashFlowSummary } from "./cashflow.functions";

export function exportCashFlowToExcel(data: CashFlowSummary) {
  const wb = XLSX.utils.book_new();

  // Summary headers
  const summaryHeader = [
    ["شيت التدفقات النقدية الأسبوعي (Cash Flow)"],
    ["تاريخ التقرير", data.reportDate],
    ["دورة الأسبوع", data.weekLabel],
    ["المستهدف الأسبوعي", data.weeklyGoal],
    ["إجمالي المتوقع", data.totalExpected],
    ["إجمالي المحصل", data.totalCollected],
    ["منها من الشيت", data.collectedFromSheet],
    ["منها من الخزينة مباشر", data.collectedFromTreasury],
    ["نسبة التحصيل", `${(data.collectionRate * 100).toFixed(1)}%`],
    ["المتبقي للوصول للمستهدف", data.remainingToTarget],
    [],
  ];

  // Table rows
  const tableHeaders = [
    "م",
    "الرصيد الحالي",
    "العميل",
    "المتوقع",
    "المحصل",
    "موعد السداد",
    "نسبة السداد",
    "حالة السداد",
    "المتبقى",
    "ملاحظات",
  ];

  const tableRows = data.customers.map((c) => [
    c.index,
    c.currentBalance,
    c.customerName,
    c.expectedAmount,
    c.totalCollected,
    c.dueDate || "",
    c.rate ? `${(c.rate * 100).toFixed(1)}%` : "0%",
    c.status,
    c.remaining,
    c.notes || "",
  ]);

  const fullData = [...summaryHeader, tableHeaders, ...tableRows];
  const ws = XLSX.utils.aoa_to_sheet(fullData);

  // Set column widths
  ws["!cols"] = [
    { wch: 6 },  // م
    { wch: 16 }, // الرصيد الحالي
    { wch: 32 }, // العميل
    { wch: 14 }, // المتوقع
    { wch: 14 }, // المحصل
    { wch: 14 }, // موعد السداد
    { wch: 12 }, // نسبة السداد
    { wch: 12 }, // حالة السداد
    { wch: 14 }, // المتبقى
    { wch: 28 }, // ملاحظات
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Cash Flow");
  XLSX.writeFile(wb, `كاش_فلو_${data.reportDate}.xlsx`);
}
