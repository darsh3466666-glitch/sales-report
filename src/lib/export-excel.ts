import * as XLSX from "xlsx";

interface ReportData {
  report: {
    report_date: string;
    total_sales: number;
    total_collected: number;
    collection_rate: number;
    total_qty: number;
    raw_material_qty: number;
    feed_qty: number;
    customer_count: number;
    invoice_count: number;
    average_invoice: number;
    total_receivables: number;
    opening_balance?: number;
  };
  customers: Array<{
    customer_name: string;
    sales_amount: number;
    collected_amount: number;
    outstanding_amount: number;
    collection_ratio: number;
    invoice_count: number;
    total_qty: number;
    risk_score: number;
    status: string;
  }>;
  products: Array<{
    product_name: string;
    total_qty: number;
    total_amount: number;
    category: string | null;
  }>;
  customerProducts: Array<{
    customer_name: string;
    product_name: string;
    quantity: number;
    total_amount: number;
  }>;
}

export function exportReportToExcel(data: ReportData) {
  const wb = XLSX.utils.book_new();
  const r = data.report;

  // Summary sheet
  const summary = [
    ["تقرير يوم", r.report_date],
    [],
    ["المؤشر", "القيمة"],
    ["إجمالي المبيعات", r.total_sales],
    ["إجمالي التحصيل", r.total_collected],
    ["نسبة التحصيل", `${(r.collection_rate * 100).toFixed(1)}%`],
    ["المديونية القديمة", r.opening_balance || 0],
    ["مديونية اليوم", r.total_receivables],
    [
      "إجمالي المديونية",
      (r.opening_balance || 0) +
        (r.total_sales || 0) -
        (r.total_collected || 0),
    ],
    ["إجمالي الكميات (كيلو)", r.total_qty],
    ["كميات الخامات", r.raw_material_qty],
    ["كميات الأعلاف", r.feed_qty],
    ["عدد العملاء", r.customer_count],
    ...(data.customers.some((c) => (c as any).is_new)
      ? [
          [
            "العملاء الجدد",
            data.customers.filter((c) => (c as any).is_new).length,
          ],
        ]
      : []),
    ["عدد الفواتير", r.invoice_count],
    ["متوسط الفاتورة", r.average_invoice],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 28 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "ملخص");

  // Customers sheet
  const todayCustomers = data.customers.filter(
    (c) => (c.sales_amount || 0) > 0,
  );
  const customersRows = [
    [
      "#",
      "العميل",
      "المبيعات",
      "المحصل",
      "المتأخر",
      "الكمية (كيلو)",
      "نسبة التحصيل",
      "الفواتير",
      "درجة المخاطرة",
      "الحالة",
    ],
    ...todayCustomers
      .sort((a, b) => b.sales_amount - a.sales_amount)
      .map((c, i) => [
        i + 1,
        c.customer_name,
        c.sales_amount,
        c.collected_amount,
        c.outstanding_amount,
        c.total_qty,
        `${(c.collection_ratio * 100).toFixed(1)}%`,
        c.invoice_count > 0 ? c.invoice_count : c.sales_amount > 0 ? 1 : 0,
        c.risk_score,
        (c as any).is_new ? "عميل جديد" : c.status,
      ]),
  ];
  const wsCustomers = XLSX.utils.aoa_to_sheet(customersRows);
  wsCustomers["!cols"] = [
    { wch: 5 },
    { wch: 30 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCustomers, "العملاء");

  // Products sheet
  const productsRows = [
    ["#", "المنتج", "الفئة", "الكمية", "القيمة"],
    ...data.products
      .sort((a, b) => b.total_qty - a.total_qty)
      .map((p, i) => [
        i + 1,
        p.product_name,
        p.category || "—",
        p.total_qty,
        p.total_amount,
      ]),
  ];
  const wsProducts = XLSX.utils.aoa_to_sheet(productsRows);
  wsProducts["!cols"] = [
    { wch: 5 },
    { wch: 30 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsProducts, "المنتجات");

  // Customer-products sheet
  if (data.customerProducts?.length) {
    const cpRows = [
      ["العميل", "المنتج", "الكمية", "القيمة"],
      ...data.customerProducts.map((cp) => [
        cp.customer_name,
        cp.product_name,
        cp.quantity,
        cp.total_amount,
      ]),
    ];
    const wsCP = XLSX.utils.aoa_to_sheet(cpRows);
    wsCP["!cols"] = [{ wch: 28 }, { wch: 28 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsCP, "مبيعات العملاء");
  }

  XLSX.writeFile(wb, `تقرير-${r.report_date}.xlsx`);
}
