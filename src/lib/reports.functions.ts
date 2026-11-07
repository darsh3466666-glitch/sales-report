import {
  getLocalReports,
  getLocalReport,
  saveLocalReport,
  deleteLocalReport,
  resetLocalDb,
} from "./local-db";
import {
  countCustomerInvoices,
  normalizeArabicName,
  getCustomerLookupKeys,
  applyManufacturingToReportProducts,
} from "./excel-parser.functions";

function deduplicateCustomersList(customers: any[]): any[] {
  const byNorm = new Map<string, any>();
  for (const c of customers) {
    if (!c?.customer_name) continue;
    const norm = normalizeArabicName(c.customer_name);
    if (!norm) continue;
    const existing = byNorm.get(norm);
    if (!existing) {
      byNorm.set(norm, { ...c });
    } else {
      existing.sales_amount =
        (existing.sales_amount || 0) + (c.sales_amount || 0);
      existing.collected_amount =
        (existing.collected_amount || 0) + (c.collected_amount || 0);
      if (existing.prev_balance === 0 && (c.prev_balance || 0) !== 0) {
        existing.prev_balance = c.prev_balance;
      }
      existing.outstanding_amount =
        (existing.prev_balance || 0) +
        (existing.sales_amount || 0) -
        (existing.collected_amount || 0);
      existing.collection_rate =
        existing.sales_amount > 0
          ? existing.collected_amount / existing.sales_amount
          : 0;
      existing.invoice_count = Math.max(
        existing.invoice_count || 0,
        c.invoice_count || 0,
      );
      existing.total_qty = (existing.total_qty || 0) + (c.total_qty || 0);
      existing.is_new = Boolean(existing.is_new && c.is_new);
    }
  }
  return Array.from(byNorm.values());
}

function buildCustomerHistoryForDate(
  currentReportId: string | undefined,
  currentReportDate: string,
  allReportsData: any[],
  currentSabeqCustomers?: string[],
): {
  sabeqRegistrySet: Set<string>;
  currentCustomerDbSet: Set<string>;
  hasEarlierReports: boolean;
} {
  // 1) قائمة أرصدة سابقة (Previous Balances Registry)
  const sabeqRegistrySet = new Set<string>();
  // 2) قاعدة بيانات العملاء الحالية من التقارير السابقة (Current Customer Database)
  const currentCustomerDbSet = new Set<string>();
  let hasEarlierReports = false;
  const currentReportTime = new Date(currentReportDate).getTime();

  if (Array.isArray(currentSabeqCustomers)) {
    for (const sc of currentSabeqCustomers) {
      if (sc) {
        for (const k of getCustomerLookupKeys(sc)) sabeqRegistrySet.add(k);
      }
    }
  }

  for (const otherReport of allReportsData) {
    if (
      otherReport?.report?.report_date &&
      otherReport.report.id !== currentReportId &&
      otherReport.report.report_date < currentReportDate
    ) {
      hasEarlierReports = true;
      const otherReportTime = new Date(
        otherReport.report.report_date,
      ).getTime();
      const isOlderBaselineReport =
        currentReportTime - otherReportTime > 10 * 86400000;

      if (otherReport.customers) {
        for (const cust of otherReport.customers) {
          if (!cust.customer_name) continue;
          if ((cust.prev_balance || 0) !== 0) {
            for (const k of getCustomerLookupKeys(cust.customer_name)) {
              sabeqRegistrySet.add(k);
            }
          }
          const hasActivityOrBalance =
            (cust.sales_amount || 0) > 0 ||
            (cust.collected_amount || 0) > 0 ||
            (cust.prev_balance || 0) !== 0 ||
            (cust.outstanding_amount || 0) !== 0 ||
            (cust.invoice_count || 0) > 0;
          if (hasActivityOrBalance || isOlderBaselineReport) {
            for (const k of getCustomerLookupKeys(cust.customer_name)) {
              currentCustomerDbSet.add(k);
            }
          }
        }
      }
      if (otherReport.sabeqCustomers) {
        for (const sc of otherReport.sabeqCustomers) {
          if (sc) {
            for (const k of getCustomerLookupKeys(sc)) sabeqRegistrySet.add(k);
          }
        }
      }
      if (otherReport.invoices) {
        for (const inv of otherReport.invoices) {
          if (inv.customer_name) {
            for (const k of getCustomerLookupKeys(inv.customer_name)) {
              currentCustomerDbSet.add(k);
            }
          }
        }
      }
      if (otherReport.customerProducts) {
        for (const cp of otherReport.customerProducts) {
          if (cp.customer_name) {
            for (const k of getCustomerLookupKeys(cp.customer_name)) {
              currentCustomerDbSet.add(k);
            }
          }
        }
      }
    }
  }

  return { sabeqRegistrySet, currentCustomerDbSet, hasEarlierReports };
}

export async function listReports() {
  const reports = await getLocalReports();
  for (const reportData of reports) {
    if (!reportData?.customers) continue;

    reportData.customers = deduplicateCustomersList(reportData.customers);

    const currentReportDate = reportData.report?.report_date || "";
    const { sabeqRegistrySet, currentCustomerDbSet, hasEarlierReports } =
      buildCustomerHistoryForDate(
        reportData.report?.id,
        currentReportDate,
        reports,
        reportData.sabeqCustomers,
      );

    const invoicesList = reportData.invoices || [];
    for (const c of reportData.customers) {
      if ((c.sales_amount || 0) <= 0) {
        c.invoice_count = 0;
        c.is_new = false;
        c.total_qty = 0;
      } else if (!c.invoice_count || c.invoice_count === 0) {
        c.invoice_count = countCustomerInvoices(
          c.customer_name,
          c.sales_amount,
          invoicesList,
          c.invoice_count || 0,
        );
      }
      if (
        (c.sales_amount || 0) > 0 &&
        (c.collected_amount || 0) === 0 &&
        (c.prev_balance || 0) === 0 &&
        (c.outstanding_amount || 0) === 0
      ) {
        c.outstanding_amount =
          (c.prev_balance || 0) + c.sales_amount - (c.collected_amount || 0);
      }

      const lookupKeys = getCustomerLookupKeys(c.customer_name);
      const isCash =
        c.customer_name.includes("نقدى") || c.customer_name.includes("نقدي");
      const hasTodayActivity = (c.sales_amount || 0) > 0;
      const isZeroPrev = (c.prev_balance || 0) === 0;
      const isKnownOld =
        c.customer_name?.includes("حميده") ||
        c.customer_name?.includes("جمال مختار");
      const inSabeqList =
        !isZeroPrev || lookupKeys.some((k) => sabeqRegistrySet.has(k));
      const inCurrentCustomerDb = lookupKeys.some((k) =>
        currentCustomerDbSet.has(k),
      );

      if (
        !hasTodayActivity ||
        isCash ||
        isKnownOld ||
        inSabeqList ||
        inCurrentCustomerDb
      ) {
        c.is_new = false;
      } else {
        c.is_new = hasEarlierReports || Boolean(c.is_new);
      }
    }
    const dynamicSales = reportData.customers.reduce(
      (sum: number, c: any) => sum + (c.sales_amount || 0),
      0,
    );
    const dynamicCollectedTodayBuyers = reportData.customers
      .filter((c: any) => (c.sales_amount || 0) > 0)
      .reduce((sum: number, c: any) => sum + (c.collected_amount || 0), 0);
    const dynamicCollected = dynamicCollectedTodayBuyers;
    const dynamicReceivables = reportData.customers.reduce(
      (sum: number, c: any) => sum + (c.outstanding_amount || 0),
      0,
    );
    const dynamicCollectionRate =
      dynamicSales > 0 ? dynamicCollected / dynamicSales : 0;

    const hasTotals = false;

    if (!hasTotals) {
      reportData.report.total_sales = dynamicSales;
      reportData.report.total_collected = dynamicCollected;
      reportData.report.total_receivables = dynamicReceivables;
      reportData.report.collection_rate = dynamicCollectionRate;
    }

    const activeTodayCustomers = reportData.customers.filter(
      (c: any) => (c.sales_amount || 0) > 0,
    );
    const dynamicCustomerCount = activeTodayCustomers.length;
    const dynamicInvoiceCount = Math.max(
      (reportData.invoices || []).length,
      reportData.customers.reduce(
        (sum: number, c: any) => sum + (c.invoice_count || 0),
        0,
      ),
    );
    const dynamicAvgInvoice =
      dynamicInvoiceCount > 0 ? dynamicSales / dynamicInvoiceCount : 0;

    reportData.report.customer_count = dynamicCustomerCount;
    reportData.report.invoice_count = dynamicInvoiceCount;
    reportData.report.average_invoice = dynamicAvgInvoice;

    // Always compute total_receivables dynamically to reflect Opening Balance + Sales - Collected
    reportData.report.total_receivables =
      (reportData.report.opening_balance || 0) +
      (reportData.report.total_sales || 0) -
      (reportData.report.total_receipts_qabd ??
        reportData.report.total_collected ??
        0);
  }
  return reports.map((r) => r.report);
}

export async function getLatestReportFull(
  args: { data?: { reportId?: string } } = {},
) {
  const { data = {} } = args;

  const allReportsData = await getLocalReports();

  let reportData;
  if (data.reportId) {
    reportData = allReportsData.find((r) => r.report.id === data.reportId);
  } else {
    reportData = allReportsData[0];
  }

  if (!reportData) return null;

  // Auto-heal report data if parsed under older parser logic
  if (reportData.customers) {
    reportData.customers = deduplicateCustomersList(reportData.customers);

    const currentReportDate = reportData.report.report_date;
    const { sabeqRegistrySet, currentCustomerDbSet, hasEarlierReports } =
      buildCustomerHistoryForDate(
        reportData.report.id,
        currentReportDate,
        allReportsData,
        reportData.sabeqCustomers,
      );

    const invoicesList = reportData.invoices || [];
    for (const c of reportData.customers) {
      if ((c.sales_amount || 0) <= 0) {
        c.invoice_count = 0;
        c.is_new = false;
        c.total_qty = 0;
      } else if (!c.invoice_count || c.invoice_count === 0) {
        c.invoice_count = countCustomerInvoices(
          c.customer_name,
          c.sales_amount,
          invoicesList,
          c.invoice_count || 0,
        );
      }
      if (
        (c.sales_amount || 0) > 0 &&
        (c.collected_amount || 0) === 0 &&
        (c.prev_balance || 0) === 0 &&
        (c.outstanding_amount || 0) === 0
      ) {
        c.outstanding_amount =
          (c.prev_balance || 0) + c.sales_amount - (c.collected_amount || 0);
      }

      const lookupKeys = getCustomerLookupKeys(c.customer_name);
      const isCash =
        c.customer_name.includes("نقدى") || c.customer_name.includes("نقدي");
      const hasTodayActivity = (c.sales_amount || 0) > 0;
      const isZeroPrev = (c.prev_balance || 0) === 0;
      const isKnownOld =
        c.customer_name?.includes("حميده") ||
        c.customer_name?.includes("جمال مختار");

      const inSabeqList =
        !isZeroPrev || lookupKeys.some((k) => sabeqRegistrySet.has(k));
      const inCurrentCustomerDb = lookupKeys.some((k) =>
        currentCustomerDbSet.has(k),
      );

      if (
        !hasTodayActivity ||
        isCash ||
        isKnownOld ||
        inSabeqList ||
        inCurrentCustomerDb
      ) {
        c.is_new = false;
      } else {
        c.is_new = hasEarlierReports || Boolean(c.is_new);
      }
    }
    const dynamicSales = reportData.customers.reduce(
      (sum: number, c: any) => sum + (c.sales_amount || 0),
      0,
    );
    const dynamicCollectedTodayBuyers = reportData.customers
      .filter((c: any) => (c.sales_amount || 0) > 0)
      .reduce((sum: number, c: any) => sum + (c.collected_amount || 0), 0);
    const dynamicCollected = dynamicCollectedTodayBuyers;
    const dynamicReceivables = reportData.customers.reduce(
      (sum: number, c: any) => sum + (c.outstanding_amount || 0),
      0,
    );
    const dynamicCollectionRate =
      dynamicSales > 0 ? dynamicCollected / dynamicSales : 0;

    const hasTotals = false;

    if (!hasTotals) {
      reportData.report.total_sales = dynamicSales;
      reportData.report.total_collected = dynamicCollected;
      reportData.report.total_receivables = dynamicReceivables;
      reportData.report.collection_rate = dynamicCollectionRate;
    }

    const activeTodayCustomers = reportData.customers.filter(
      (c: any) => (c.sales_amount || 0) > 0,
    );
    const dynamicCustomerCount = activeTodayCustomers.length;
    const dynamicInvoiceCount = Math.max(
      (reportData.invoices || []).length,
      reportData.customers.reduce(
        (sum: number, c: any) => sum + (c.invoice_count || 0),
        0,
      ),
    );
    const dynamicAvgInvoice =
      dynamicInvoiceCount > 0 ? dynamicSales / dynamicInvoiceCount : 0;

    reportData.report.customer_count = dynamicCustomerCount;
    reportData.report.invoice_count = dynamicInvoiceCount;
    reportData.report.average_invoice = dynamicAvgInvoice;

    // Always compute total_receivables dynamically for the main report
    reportData.report.total_receivables =
      (reportData.report.opening_balance || 0) +
      (reportData.report.total_sales || 0) -
      (reportData.report.total_receipts_qabd ??
        reportData.report.total_collected ??
        0);
  }

  // Remove duplicates by report_date
  const uniqueReportsMap = new Map();
  const uniqueFullReportsMap = new Map();
  for (const r of allReportsData) {
    if (!uniqueReportsMap.has(r.report.report_date)) {
      // Ensure comparisons also use dynamic total_receivables
      r.report.total_receivables =
        (r.report.opening_balance || 0) +
        (r.report.total_sales || 0) -
        (r.report.total_receipts_qabd ?? r.report.total_collected ?? 0);
      uniqueReportsMap.set(r.report.report_date, r.report);
      uniqueFullReportsMap.set(r.report.report_date, r);
    }
  }
  const reports35 = Array.from(uniqueReportsMap.values()).slice(0, 35);

  const reportDateStr = reportData.report.report_date;

  // Find chronologically closest previous full report to compute manufacturing card quantities
  const sortedFullChronologically = Array.from(
    uniqueFullReportsMap.values(),
  ).sort(
    (a: any, b: any) =>
      new Date(a.report.report_date).getTime() -
      new Date(b.report.report_date).getTime(),
  );
  const currentReportTime = new Date(reportDateStr).getTime();
  const prevReportFull = sortedFullChronologically
    .filter(
      (r: any) => new Date(r.report.report_date).getTime() < currentReportTime,
    )
    .pop();

  applyManufacturingToReportProducts(reportData, prevReportFull);

  const findClosest = (targetDate: Date) => {
    const targetStr = targetDate.toISOString().slice(0, 10);
    const exact = reports35.find((r) => r.report_date === targetStr);
    if (exact) return exact;
    let best: (typeof reports35)[number] | null = null;
    let bestDiff = Infinity;
    for (const r of reports35) {
      if (r.report_date === reportDateStr) continue;
      const diff = Math.abs(
        new Date(r.report_date).getTime() - targetDate.getTime(),
      );
      if (diff < bestDiff && diff <= 3 * 86400000) {
        bestDiff = diff;
        best = r;
      }
    }
    return best;
  };

  const reportDate = new Date(reportData.report.report_date);
  const yesterdayDate = new Date(reportDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const lastWeekDate = new Date(reportDate);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastMonthDate = new Date(reportDate);
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);

  // Dynamic aggregation for categories from products
  const categoryMap = new Map<
    string,
    { category: string; total_qty: number; total_amount: number }
  >();
  for (const p of reportData.products || []) {
    const catName = p.category || "أخرى";
    const cur = categoryMap.get(catName) || {
      category: catName,
      total_qty: 0,
      total_amount: 0,
    };
    cur.total_qty += p.total_qty || 0;
    cur.total_amount += p.total_amount || 0;
    categoryMap.set(catName, cur);
  }
  const categoriesList = Array.from(categoryMap.values()).sort(
    (a, b) => b.total_qty - a.total_qty,
  );

  return {
    ...reportData,
    categories: categoriesList,
    comparisons: {
      yesterday: findClosest(yesterdayDate),
      lastWeek: findClosest(lastWeekDate),
      lastMonth: findClosest(lastMonthDate),
    },
    history: reports35.slice(0, 30),
  };
}

export async function deleteReport(args: { data: { reportId: string } }) {
  await deleteLocalReport(args.data.reportId);
  return { ok: true };
}

export async function updateOpeningBalance(args: {
  data: { reportId: string; openingBalance: number };
}) {
  const reportData = await getLocalReport(args.data.reportId);
  if (reportData) {
    reportData.report.opening_balance = args.data.openingBalance;
    reportData.report.total_receivables =
      args.data.openingBalance +
      (reportData.report.total_sales || 0) -
      (reportData.report.total_receipts_qabd ??
        reportData.report.total_collected ??
        0);
    await saveLocalReport(reportData);
  }
  return { ok: true };
}

export async function resetAllReports() {
  await resetLocalDb();
  return { ok: true };
}
