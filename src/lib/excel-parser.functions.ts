import { z } from "zod";
import * as XLSX from "xlsx";
import { isExcludedCustomer, type ParsedReport } from "./excel-parser";
import { saveLocalReport, getLocalReports } from "./local-db";

const InputSchema = z.object({
  collectionsB64: z.string().min(1),
  invoicesB64: z.string().min(1),
  reportDate: z.string().optional(), // YYYY-MM-DD override
  isManual: z.boolean().optional(),
  inventoryB64: z.string().optional(),
});

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  let strVal = String(v).trim().replace(/,/g, "");
  let isNegative = false;
  if (strVal.endsWith("-")) {
    isNegative = true;
    strVal = strVal.slice(0, -1).trim();
  } else if (strVal.startsWith("-")) {
    isNegative = true;
    strVal = strVal.slice(1).trim();
  }
  const n = parseFloat(strVal);
  if (isNaN(n)) return 0;
  return isNegative ? -n : n;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function normalizeArabicName(name: string): string {
  if (!name) return "";
  return (
    String(name)
      // eslint-disable-next-line no-misleading-character-class
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")
      .replace(/ـ/g, "")
      .replace(/[()\-–—_/,]+/g, " ")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[أإآا]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/\bعبد\s+/g, "عبد")
  );
}

export function getCustomerLookupKeys(name: string): string[] {
  if (!name) return [];
  const norm = normalizeArabicName(name);
  if (!norm) return [];
  const keys = new Set<string>([norm]);
  const noAl = norm.replace(/\bال/g, "").replace(/\s+/g, " ").trim();
  if (noAl.length > 2) keys.add(noAl);
  return Array.from(keys);
}

export function extractCustomerNameTokens(name: string): string[] {
  if (!name) return [];
  const raw = String(name).trim();
  const tokens = new Set<string>([raw]);

  // Inside parentheses
  const parenMatch = raw.match(/\((.*?)\)/);
  if (parenMatch && parenMatch[1].trim()) {
    tokens.add(parenMatch[1].trim());
  }

  // Before parentheses
  const beforeParen = raw.replace(/\(.*?\)/g, "").trim();
  if (beforeParen.length >= 3) {
    tokens.add(beforeParen);
  }

  // Before dash
  if (raw.includes("-")) {
    const beforeDash = raw.split("-")[0].trim();
    if (beforeDash.length >= 3) {
      tokens.add(beforeDash);
    }
  }

  return Array.from(tokens);
}

export function countCustomerInvoices(
  customerName: string,
  salesAmount: number,
  invoices: Array<{ customer_name?: string | null }>,
  fallbackCount: number = 0,
): number {
  if (!salesAmount || salesAmount <= 0) return 0;
  if (!customerName) return 1;

  // 1. Direct exact match
  const exactMatches = invoices.filter(
    (inv) =>
      inv.customer_name && inv.customer_name.trim() === customerName.trim(),
  ).length;
  if (exactMatches > 0) return exactMatches;

  // 2. Normalized match
  const targetNorm = normalizeArabicName(customerName);
  const normMatches = invoices.filter(
    (inv) =>
      inv.customer_name &&
      normalizeArabicName(inv.customer_name) === targetNorm,
  ).length;
  if (normMatches > 0) return normMatches;

  // 3. Substring / Token matching
  const tokens =
    extractCustomerNameTokens(customerName).map(normalizeArabicName);
  const tokenMatches = invoices.filter((inv) => {
    if (!inv.customer_name) return false;
    const invNorm = normalizeArabicName(inv.customer_name);
    return tokens.some(
      (tok) =>
        tok.length >= 3 &&
        (invNorm === tok || invNorm.includes(tok) || tok.includes(invNorm)),
    );
  }).length;
  if (tokenMatches > 0) return tokenMatches;

  // 4. Fallback count from sales sheet if available
  if (fallbackCount > 0) return fallbackCount;

  // 5. Accounting rule: If a customer has sales amount > 0, they MUST have at least 1 invoice!
  if (salesAmount > 0) return 1;

  return 0;
}

function toISO(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString();
  }
  if (typeof d === "number") {
    const parsed = XLSX.SSF.parse_date_code(d);
    if (parsed) {
      const dt = new Date(
        Date.UTC(
          parsed.y,
          parsed.m - 1,
          parsed.d,
          parsed.H || 0,
          parsed.M || 0,
          Math.floor(parsed.S || 0),
        ),
      );
      return dt.toISOString();
    }
  }
  const dt = new Date(String(d));
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

function parseWorkbook(b64: string): XLSX.WorkBook {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return XLSX.read(bytes, { type: "array", cellDates: true });
}

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
  });
}

function findSheet(wb: XLSX.WorkBook, keywords: string[]): string | null {
  for (const sn of wb.SheetNames) {
    const norm = sn.trim().toLowerCase();
    if (keywords.some((k) => norm.includes(k.toLowerCase()))) return sn;
  }
  return null;
}

export async function parseAndImportReport(args: { data: any }) {
  const data = InputSchema.parse(args.data);
  const wb1 = parseWorkbook(data.collectionsB64);
  const wb2 = parseWorkbook(data.invoicesB64);
  const wb3 = data.inventoryB64 ? parseWorkbook(data.inventoryB64) : null;

  const qabdName = findSheet(wb1, ["قبض"]);
  const salesName = findSheet(wb1, ["مبيعات"]);
  const qtyName = findSheet(wb1, ["كميات"]);
  const invName = findSheet(wb1, ["فواتير"]);
  const inventoryName =
    (wb3
      ? findSheet(wb3, [
          "تقارير  ارصدة المخازن",
          "ارصدة المخازن",
          "المخازن",
          "المخزون",
          "المخزن",
        ])
      : null) ||
    findSheet(wb2, [
      "تقارير  ارصدة المخازن",
      "ارصدة المخازن",
      "المخازن",
      "المخزون",
      "المخزن",
    ]) ||
    findSheet(wb1, [
      "تقارير  ارصدة المخازن",
      "ارصدة المخازن",
      "المخازن",
      "المخزون",
      "المخزن",
    ]);
  const masterDataName = findSheet(wb1, [
    "Master_Data",
    "master_data",
    "master",
    "ماستر",
  ]);

  if (!qabdName || !salesName || !qtyName || !invName) {
    throw new Error(
      "ملف التحصيل يجب أن يحتوي على شيتات: قبض، مبيعات، كميات، فواتير",
    );
  }

  const custReportName = findSheet(wb2, ["تقرير مبيعات العملاء", "العملاء"]);
  if (!custReportName) {
    throw new Error(
      "ملف فواتير اليوم يجب أن يحتوي على شيت 'تقرير مبيعات العملاء'",
    );
  }

  const salesRows = sheetRows(wb1, salesName);

  const canonicalNameByNorm = new Map<string, string>();
  const registerCanonicalName = (cname: string) => {
    const trimmed = str(cname);
    if (!trimmed || trimmed.length <= 2) return "";
    for (const key of getCustomerLookupKeys(trimmed)) {
      if (!canonicalNameByNorm.has(key)) {
        canonicalNameByNorm.set(key, trimmed);
      }
    }
    return trimmed;
  };
  const resolveCustomerName = (rawName: string): string => {
    const trimmed = str(rawName);
    if (!trimmed) return "";
    for (const key of getCustomerLookupKeys(trimmed)) {
      const existing = canonicalNameByNorm.get(key);
      if (existing) return existing;
    }
    return registerCanonicalName(trimmed);
  };

  const masterNames = new Set<string>();
  const masterBalances = new Map<string, number>();
  if (masterDataName) {
    const masterRows = sheetRows(wb1, masterDataName);

    let nameIdx = 1;
    let balanceIdx = 2;
    let headerRowIdx = 0;

    // Find the header row
    for (let i = 0; i < Math.min(20, masterRows.length); i++) {
      const row = masterRows[i] || [];
      if (row.some((cell) => str(cell).includes("اسم العميل"))) {
        headerRowIdx = i;
        break;
      }
    }

    const headers = masterRows[headerRowIdx] || [];
    let nameColIdx = headers.findIndex((h) => str(h).includes("اسم العميل"));
    if (nameColIdx === -1) {
      nameColIdx = headers.findIndex((h) => {
        const s = str(h);
        return (
          (s.includes("العميل") || s.includes("اسم")) && !s.includes("كود")
        );
      });
    }
    const balColIdx = headers.findIndex((h) => {
      const s = str(h);
      return (
        s.includes("الرصيد الحالي") ||
        s.includes("الرصيد") ||
        s.includes("الحالي")
      );
    });
    if (nameColIdx !== -1) nameIdx = nameColIdx;
    if (balColIdx !== -1) balanceIdx = balColIdx;

    for (let i = headerRowIdx + 1; i < masterRows.length; i++) {
      const r = masterRows[i];
      if (!r || !Array.isArray(r)) continue;
      const cname = r.length > nameIdx ? str(r[nameIdx]) : "";
      if (cname && cname.length > 2) {
        registerCanonicalName(cname);
        const normName = normalizeArabicName(cname);
        masterNames.add(cname);
        for (const k of getCustomerLookupKeys(cname)) {
          masterNames.add(k);
        }
        const balVal = r.length > balanceIdx ? num(r[balanceIdx]) : 0;
        const existing = masterBalances.get(normName);
        if (existing === undefined || (existing === 0 && balVal !== 0)) {
          masterBalances.set(normName, balVal);
        }
      }
    }
  }

  const sabeqKeywords = [
    "ارصدة سابقة",
    "أرصدة سابقة",
    "ارصده سابقه",
    "أرصده سابقه",
    "سابق",
    "السابق",
  ];
  const sabeqName =
    findSheet(wb1, sabeqKeywords) ||
    findSheet(wb2, sabeqKeywords) ||
    (wb3 ? findSheet(wb3, sabeqKeywords) : null);
  const sabeqBalances = new Map<string, number>();
  const sabeqNames = new Set<string>();
  if (sabeqName) {
    const sabeqWb = wb1.SheetNames.includes(sabeqName)
      ? wb1
      : wb2.SheetNames.includes(sabeqName)
        ? wb2
        : wb3 || wb1;
    const sabeqRows = sheetRows(sabeqWb, sabeqName);

    let nameIdx = 0;
    let balanceIdx = 1;
    let headerRowIdx = 0;

    for (let i = 0; i < Math.min(20, sabeqRows.length); i++) {
      const row = sabeqRows[i] || [];
      if (
        row.some((cell) => {
          const s = str(cell);
          return (
            s.includes("اسم") ||
            s.includes("العميل") ||
            s.includes("الاسم") ||
            s.includes("بيان")
          );
        })
      ) {
        headerRowIdx = i;
        break;
      }
    }

    const headers = sabeqRows[headerRowIdx] || [];
    let nameColIdx = headers.findIndex((h) => str(h).includes("اسم العميل"));
    if (nameColIdx === -1) {
      nameColIdx = headers.findIndex((h) => {
        const s = str(h);
        return (
          (s.includes("اسم") ||
            s.includes("العميل") ||
            s.includes("الاسم") ||
            s.includes("بيان")) &&
          !s.includes("كود")
        );
      });
    }
    const balColIdx = headers.findIndex((h) => {
      const s = str(h);
      return s.includes("رصيد") || s.includes("مبلغ") || s.includes("قيمة");
    });
    if (nameColIdx !== -1) nameIdx = nameColIdx;
    if (balColIdx !== -1) balanceIdx = balColIdx;

    for (let i = headerRowIdx + 1; i < sabeqRows.length; i++) {
      const r = sabeqRows[i];
      if (!r || !Array.isArray(r)) continue;
      let cname = r.length > nameIdx ? str(r[nameIdx]) : "";
      if (!cname || cname.length <= 2 || !isNaN(Number(cname))) {
        const fallbackCell = r.find((cell, idx) => {
          if (idx === balanceIdx) return false;
          const s = str(cell);
          return (
            s.length > 2 &&
            isNaN(Number(s.replace(/,/g, ""))) &&
            !s.includes("إجمالي") &&
            !s.includes("اجمالي")
          );
        });
        if (fallbackCell) cname = str(fallbackCell);
      }
      if (
        cname &&
        cname.length > 2 &&
        !cname.includes("إجمالي") &&
        !cname.includes("اجمالي")
      ) {
        registerCanonicalName(cname);
        const balVal = r.length > balanceIdx ? num(r[balanceIdx]) : 0;
        const normName = normalizeArabicName(cname);
        sabeqNames.add(cname);
        masterNames.add(cname);
        for (const k of getCustomerLookupKeys(cname)) {
          sabeqNames.add(k);
          masterNames.add(k);
        }
        const existing = sabeqBalances.get(normName);
        if (existing === undefined || (existing === 0 && balVal !== 0)) {
          sabeqBalances.set(normName, balVal);
        }
      }
    }
  }

  let reportDate = data.reportDate;

  if (!reportDate) {
    const headerRow = salesRows[0] || [];
    for (const cell of headerRow) {
      const iso = toISO(cell);
      if (iso) {
        reportDate = iso.slice(0, 10);
        break;
      }
    }
  }
  if (!reportDate) reportDate = new Date().toISOString().slice(0, 10);

  const totalsRow = salesRows[2] || [];
  const rawMaterialQty = num(totalsRow[1]);
  const totalQty = num(totalsRow[2]);
  const totalSalesFromSheet = num(totalsRow[3]);
  const totalCollectedFromSheet = num(totalsRow[4]);
  const feedQty = num(totalsRow[6]);

  const salesCustomersMap = new Map();
  for (let i = 4; i < salesRows.length; i++) {
    const r = salesRows[i];
    if (!r || !r[2]) continue;
    const rawName = str(r[2]);
    if (!rawName || isExcludedCustomer(rawName)) continue;
    const name = resolveCustomerName(rawName);
    const sales = num(r[3]);
    const collected = num(r[4]);
    const prev = num(r[5]);
    const bal = num(r[6]);
    const cur = salesCustomersMap.get(name) || {
      sales: 0,
      collected: 0,
      prev_balance: 0,
      balance: 0,
      invoice_count: 0,
    };
    cur.sales += sales;
    cur.collected += collected;
    cur.prev_balance = prev || cur.prev_balance;
    cur.balance = bal || cur.balance;
    if (sales > 0) {
      cur.invoice_count += 1;
    }
    salesCustomersMap.set(name, cur);
  }

  const invRows = sheetRows(wb1, invName);
  const invoices: ParsedReport["invoices"] = [];
  const invoiceCountByCustomer = new Map<string, number>();
  for (let i = 1; i < invRows.length; i++) {
    const r = invRows[i];
    if (!r || !r[0]) continue;
    const rawCname = str(r[2]);
    if (isExcludedCustomer(rawCname)) continue;
    const cname = rawCname ? resolveCustomerName(rawCname) : "";
    const amt = num(r[3]);
    invoices.push({
      invoice_no: str(r[0]) || null,
      invoice_date: toISO(r[1]),
      customer_name: cname || null,
      item_name: null,
      quantity: null,
      unit_price: null,
      total_amount: amt,
    });
    if (cname)
      invoiceCountByCustomer.set(
        cname,
        (invoiceCountByCustomer.get(cname) || 0) + 1,
      );
  }

  const qtyRows = sheetRows(wb1, qtyName);
  const productMap = new Map<string, { qty: number; category: string }>();
  for (let i = 1; i < qtyRows.length; i++) {
    const r = qtyRows[i];
    if (!r) continue;
    const product = str(r[1]);
    if (!product) continue;
    if (["تصنيع", "عمال", "نقل"].some((ex) => product.includes(ex))) continue;
    const issued = num(r[4]);
    const cur = productMap.get(product) || { qty: 0, category: "" };
    cur.qty += issued;
    productMap.set(product, cur);
  }

  const cust2Rows = sheetRows(wb2, custReportName);
  const customerProductsMap = new Map<
    string,
    Map<string, { qty: number; total: number }>
  >();
  const customerSalesF2 = new Map<string, { sales: number; qty: number }>();
  const productTotalsF2 = new Map<string, { qty: number; total: number }>();
  let totalSalesF2 = 0;

  for (let i = 3; i < cust2Rows.length; i++) {
    const r = cust2Rows[i];
    if (!r || !r[0]) continue;
    const rawCname = str(r[0]);
    if (!rawCname || isExcludedCustomer(rawCname)) continue;
    const cname = resolveCustomerName(rawCname);
    const product = str(r[2]);
    const qty = num(r[4]);
    const total = num(r[5]);
    if (!product) continue;

    const cp = customerProductsMap.get(cname) || new Map();
    const existing = cp.get(product) || { qty: 0, total: 0 };
    existing.qty += qty;
    existing.total += total;
    cp.set(product, existing);
    customerProductsMap.set(cname, cp);

    const cs = customerSalesF2.get(cname) || { sales: 0, qty: 0 };
    cs.sales += total;
    cs.qty += qty;
    customerSalesF2.set(cname, cs);

    const pt = productTotalsF2.get(product) || { qty: 0, total: 0 };
    pt.qty += qty;
    pt.total += total;
    productTotalsF2.set(product, pt);

    totalSalesF2 += total;
  }

  const qabdRows = sheetRows(wb1, qabdName);
  const collectedByCustomer = new Map<string, number>();
  let totalReceiptsFromQabd = 0;
  for (let i = 1; i < qabdRows.length; i++) {
    const r = qabdRows[i];
    if (!r) continue;
    const amt = num(r[2]);
    totalReceiptsFromQabd += amt;

    const rawName = str(r[0]);
    if (!rawName || isExcludedCustomer(rawName)) continue;
    const name = resolveCustomerName(rawName);
    const normName = normalizeArabicName(name);
    const isCashClient = name.includes("نقد");

    // Only include collections if the name exists in the master customer lists (or is a cash client)
    if (!isCashClient) {
      if (masterNames.size > 0) {
        if (!masterNames.has(name) && !masterNames.has(normName)) continue;
      } else {
        if (!salesCustomersMap.has(name) && !customerSalesF2.has(name))
          continue;
      }
    }

    collectedByCustomer.set(name, (collectedByCustomer.get(name) || 0) + amt);
  }

  // Reconcile replaced/swapped customers between wb1 (sales journal) and wb2 (customer products report)
  if (salesCustomersMap.size > 0 && customerSalesF2.size > 0) {
    const replacedOldCusts: string[] = [];
    for (const [oldName] of customerSalesF2.entries()) {
      const fromSales = salesCustomersMap.get(oldName);
      const normOld = normalizeArabicName(oldName);
      const hasInvoice =
        invoiceCountByCustomer.has(oldName) ||
        invoices.some(
          (inv) =>
            inv.customer_name &&
            (inv.customer_name === oldName ||
              normalizeArabicName(inv.customer_name) === normOld),
        );
      if (fromSales && (fromSales.sales || 0) === 0 && !hasInvoice) {
        replacedOldCusts.push(oldName);
      }
    }

    const newBuyersMissingProducts: string[] = [];
    for (const [newName, newData] of salesCustomersMap.entries()) {
      if ((newData.sales || 0) > 0 && !customerSalesF2.has(newName)) {
        newBuyersMissingProducts.push(newName);
      }
    }

    for (const oldName of replacedOldCusts) {
      const oldF2 = customerSalesF2.get(oldName);
      if (!oldF2) continue;
      // Match by exact sales amount or single replacement
      const matchNew =
        newBuyersMissingProducts.find(
          (n) => (salesCustomersMap.get(n)?.sales || 0) === oldF2.sales,
        ) ||
        (newBuyersMissingProducts.length === 1
          ? newBuyersMissingProducts[0]
          : null);

      if (matchNew) {
        // Reassign products to the new buyer
        const oldCp = customerProductsMap.get(oldName);
        if (oldCp) {
          customerProductsMap.set(matchNew, oldCp);
          customerProductsMap.delete(oldName);
        }
        customerSalesF2.set(matchNew, oldF2);
        customerSalesF2.delete(oldName);

        // Remove from list so it is not matched twice
        const idx = newBuyersMissingProducts.indexOf(matchNew);
        if (idx !== -1) newBuyersMissingProducts.splice(idx, 1);
      } else {
        customerSalesF2.delete(oldName);
        customerProductsMap.delete(oldName);
      }
    }
  }

  const existingReports = await getLocalReports();
  // Dual verification sets:
  // 1) sabeqRegistrySet: 'أرصدة سابقة' list (current workbook + stored reports + any prior non-zero prev_balance)
  // 2) currentCustomerDbSet: Current customer database (prior transactions, invoices, products, and established customer registry)
  const sabeqRegistrySet = new Set<string>(sabeqNames);
  const currentCustomerDbSet = new Set<string>();
  const currentReportTimeMs = new Date(reportDate).getTime();
  let hasEarlierReports = false;
  for (const prevRep of existingReports) {
    if (
      prevRep?.report?.report_date &&
      prevRep.report.report_date < reportDate
    ) {
      hasEarlierReports = true;
      const prevRepTimeMs = new Date(prevRep.report.report_date).getTime();
      const isOlderBaselineReport =
        currentReportTimeMs - prevRepTimeMs > 10 * 86400000;
      for (const cust of prevRep.customers || []) {
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
      for (const inv of prevRep.invoices || []) {
        if (inv.customer_name) {
          for (const k of getCustomerLookupKeys(inv.customer_name)) {
            currentCustomerDbSet.add(k);
          }
        }
      }
      for (const cp of prevRep.customerProducts || []) {
        if (cp.customer_name) {
          for (const k of getCustomerLookupKeys(cp.customer_name)) {
            currentCustomerDbSet.add(k);
          }
        }
      }
      for (const sc of prevRep.sabeqCustomers || []) {
        if (sc) {
          for (const k of getCustomerLookupKeys(sc)) {
            sabeqRegistrySet.add(k);
            currentCustomerDbSet.add(k);
          }
        }
      }
    }
  }

  const salesCustomersNormMap = new Map<string, any>();
  for (const [k, v] of salesCustomersMap.entries()) {
    salesCustomersNormMap.set(normalizeArabicName(k), v);
  }

  const allCustomerNames = new Set<string>([
    ...salesCustomersMap.keys(),
    ...collectedByCustomer.keys(),
    ...customerSalesF2.keys(),
  ]);

  const customersByNormMap = new Map<
    string,
    ParsedReport["customers"][number]
  >();

  for (const name of allCustomerNames) {
    if (isExcludedCustomer(name)) continue;
    const normName = normalizeArabicName(name);
    if (!normName) continue;
    const f2 = customerSalesF2.get(name);
    const fromSales =
      salesCustomersMap.get(name) ?? salesCustomersNormMap.get(normName);

    let sales = 0;
    if (fromSales) {
      if ((fromSales.sales || 0) > 0) {
        sales = fromSales.sales;
      } else {
        // Customer in sales sheet has 0 sales. Only allow sales if they actually have an invoice!
        const hasInvoice =
          invoiceCountByCustomer.has(name) ||
          invoices.some(
            (inv) =>
              inv.customer_name &&
              (inv.customer_name === name ||
                normalizeArabicName(inv.customer_name) === normName),
          );
        sales = hasInvoice ? f2?.sales || 0 : 0;
      }
    } else {
      sales = f2?.sales || 0;
    }

    const rawCollected = Math.max(
      collectedByCustomer.get(name) || 0,
      fromSales?.collected || 0,
    );
    const collected = rawCollected;
    const qty = sales > 0 ? (f2?.qty ?? 0) : 0;
    const sabeqBal = sabeqBalances.get(normName);
    const prevBalance =
      sabeqBal !== undefined && sabeqBal !== 0
        ? sabeqBal
        : (fromSales?.prev_balance ?? sabeqBal ?? 0);

    let outstanding = masterBalances.get(normName);
    if (
      outstanding === undefined ||
      (outstanding === 0 && (sales > 0 || collected > 0) && prevBalance === 0)
    ) {
      outstanding = prevBalance + sales - collected;
    }

    const collectionRatio = sales > 0 ? collected / sales : 0;
    const invoiceCount =
      sales > 0
        ? countCustomerInvoices(
            name,
            sales,
            invoices,
            invoiceCountByCustomer.get(name) ?? fromSales?.invoice_count ?? 0,
          )
        : 0;

    let riskScore = 0;
    if (collectionRatio < 0.25) riskScore += 50;
    else if (collectionRatio < 0.5) riskScore += 25;
    if (outstanding > 50000) riskScore += 30;
    if (sales === 0 && outstanding > 0) riskScore += 20;
    riskScore = Math.min(100, Math.max(0, riskScore));

    let status = "normal";
    if (riskScore >= 70) status = "high_risk";
    else if (riskScore >= 40) status = "medium_risk";
    else if (sales === 0 && collected === 0) status = "inactive";

    const isCashAccount = name.includes("نقدى") || name.includes("نقدي");
    const hasTodayMovement = sales > 0;
    const isZeroPrevBalance = prevBalance === 0;
    const isKnownOld = name.includes("حميده") || name.includes("جمال مختار");

    // Dual Verification (التحقق المزدوج):
    // 1. Check against 'أرصدة سابقة' list (sabeqRegistrySet)
    // 2. Check against current customer database (currentCustomerDbSet)
    const lookupKeys = getCustomerLookupKeys(name);
    const inSabeqList =
      sabeqRegistrySet.has(name) ||
      lookupKeys.some((k) => sabeqRegistrySet.has(k));
    const inCurrentCustomerDb =
      isKnownOld || lookupKeys.some((k) => currentCustomerDbSet.has(k));

    const isNew =
      hasTodayMovement &&
      isZeroPrevBalance &&
      !isCashAccount &&
      (hasEarlierReports || sabeqRegistrySet.size > 0) &&
      !inSabeqList &&
      !inCurrentCustomerDb;

    const existingEntry = customersByNormMap.get(normName);
    if (existingEntry) {
      existingEntry.sales_amount = Math.max(existingEntry.sales_amount, sales);
      existingEntry.collected_amount = Math.max(
        existingEntry.collected_amount,
        collected,
      );
      existingEntry.prev_balance =
        existingEntry.prev_balance !== 0
          ? existingEntry.prev_balance
          : prevBalance;
      existingEntry.outstanding_amount =
        existingEntry.prev_balance +
        existingEntry.sales_amount -
        existingEntry.collected_amount;
      existingEntry.total_qty = Math.max(existingEntry.total_qty, qty);
      existingEntry.invoice_count = Math.max(
        existingEntry.invoice_count,
        invoiceCount,
      );
      existingEntry.collection_ratio =
        existingEntry.sales_amount > 0
          ? existingEntry.collected_amount / existingEntry.sales_amount
          : 0;
      existingEntry.is_new = Boolean(existingEntry.is_new && isNew);
    } else {
      customersByNormMap.set(normName, {
        id: name,
        customer_name: name,
        sales_amount: sales,
        collected_amount: collected,
        prev_balance: prevBalance,
        outstanding_amount: outstanding,
        collection_ratio: collectionRatio,
        invoice_count: invoiceCount,
        total_qty: qty,
        risk_score: riskScore,
        status,
        is_new: isNew,
      });
    }
  }

  const customers: ParsedReport["customers"] = Array.from(
    customersByNormMap.values(),
  );

  const customerProducts: ParsedReport["customerProducts"] = [];
  for (const [cname, products] of customerProductsMap.entries()) {
    for (const [pname, data] of products.entries()) {
      customerProducts.push({
        customer_name: cname,
        product_name: pname,
        quantity: data.qty,
        total_amount: data.total,
        unit_price:
          data.qty > 0 ? Number((data.total / data.qty).toFixed(2)) : 0,
      });
    }
  }

  const allProducts = new Set<string>([
    ...productMap.keys(),
    ...productTotalsF2.keys(),
  ]);
  const productAggregates: ParsedReport["productAggregates"] = [];

  for (const p of allProducts) {
    const f1 = productMap.get(p);
    const f2 = productTotalsF2.get(p);
    const qty = f2?.qty || f1?.qty || 0;
    const amt = f2?.total || 0;
    const category = inferProductCategory(p);
    productAggregates.push({
      product_name: p,
      total_qty: qty,
      sales_qty: qty,
      mfg_qty: 0,
      total_amount: amt,
      category,
    });
  }

  // Recalculate true ERP-level totals by using sheet-level summary totals or summing ALL customers (including excluded ones like "تصنيع" / "عمال" / "نقل")
  let sumAllSales = 0;
  let sumAllCollected = 0;
  let sumAllReceivables = 0;

  for (const name of allCustomerNames) {
    const f2 = customerSalesF2.get(name);
    const fromSales = salesCustomersMap.get(name);
    const sales = Math.max(f2?.sales || 0, fromSales?.sales || 0);
    const rawCollected = Math.max(
      collectedByCustomer.get(name) || 0,
      fromSales?.collected || 0,
    );
    sumAllSales += sales;
    sumAllCollected += rawCollected;
  }

  if (masterBalances.size > 0) {
    for (const bal of masterBalances.values()) {
      sumAllReceivables += bal;
    }
  } else {
    for (const name of allCustomerNames) {
      const f2 = customerSalesF2.get(name);
      const fromSales = salesCustomersMap.get(name);
      const sales = Math.max(f2?.sales || 0, fromSales?.sales || 0);
      const rawCollected = Math.max(
        collectedByCustomer.get(name) || 0,
        fromSales?.collected || 0,
      );
      const normName = normalizeArabicName(name);
      const prevBalance =
        sabeqBalances.get(normName) ?? fromSales?.prev_balance ?? 0;
      let outstanding = masterBalances.get(normName);
      if (outstanding === undefined)
        outstanding = prevBalance + sales - rawCollected;
      sumAllReceivables += outstanding;
    }
  }

  const totalCollectedFromTodayBuyers = customers
    .filter((c) => c.sales_amount > 0)
    .reduce((sum, c) => sum + c.collected_amount, 0);

  const totalSales = totalSalesFromSheet || sumAllSales;
  const totalCollected = totalCollectedFromTodayBuyers;
  const finalTotalQty =
    totalQty || customers.reduce((sum, c) => sum + c.total_qty, 0);

  const collectionRate = totalSales > 0 ? totalCollected / totalSales : 0;
  const activeTodayCustomers = customers.filter(
    (c) => c.sales_amount > 0 || c.invoice_count > 0,
  );
  const customerCount = activeTodayCustomers.length;
  const invoiceCountTotal = Math.max(
    invoices.length,
    customers.reduce((sum, c) => sum + (c.invoice_count || 0), 0),
  );
  const averageInvoice =
    invoiceCountTotal > 0 ? totalSales / invoiceCountTotal : 0;

  const existingSameDate = existingReports.find(
    (r: any) => r.report.report_date === reportDate,
  );

  // Compute default opening balance by looking chronologically for the closest previous report's total debt
  const sortedChronologically = [...existingReports].sort(
    (a: any, b: any) =>
      new Date(a.report.report_date).getTime() -
      new Date(b.report.report_date).getTime(),
  );

  let defaultOpeningBalance = 0;
  const currentDateTime = new Date(reportDate).getTime();
  const previousReport = sortedChronologically
    .filter(
      (r: any) => new Date(r.report.report_date).getTime() < currentDateTime,
    )
    .pop();

  if (previousReport) {
    defaultOpeningBalance =
      (previousReport.report.opening_balance || 0) +
      (previousReport.report.total_sales || 0) -
      (previousReport.report.total_receipts_qabd ??
        previousReport.report.total_collected ??
        0);
  }

  const finalOpeningBalance = existingSameDate
    ? existingSameDate.report.opening_balance || 0
    : defaultOpeningBalance;

  const calculatedTotalReceivables =
    finalOpeningBalance + totalSales - totalReceiptsFromQabd;

  const inventory: Array<{ item_name: string; balance: number; unit: string }> =
    [];
  if (inventoryName) {
    const invWb =
      wb3 && wb3.SheetNames.includes(inventoryName)
        ? wb3
        : wb2.SheetNames.includes(inventoryName)
          ? wb2
          : wb1;
    const invRows = sheetRows(invWb, inventoryName);
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(20, invRows.length); i++) {
      const row = invRows[i] || [];
      if (
        row.some(
          (cell) => str(cell).includes("الصنف") || str(cell).includes("الرصيد"),
        )
      ) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx !== -1) {
      const headers = invRows[headerRowIdx] || [];
      const nameCol = headers.findIndex(
        (h) => str(h).includes("الصنف") || str(h).includes("اسم الصنف"),
      );
      const balCol = headers.findIndex((h) => str(h) === "الرصيد");
      const unitCol = headers.findIndex(
        (h) => str(h).includes("الوحدة") || str(h).includes("وحدة"),
      );

      if (nameCol !== -1 && balCol !== -1) {
        for (let i = headerRowIdx + 1; i < invRows.length; i++) {
          const row = invRows[i] || [];
          const name = str(row[nameCol]);
          if (!name || name.includes("إجمالي") || name.includes("اجمالي"))
            continue;
          const balance = num(row[balCol]);
          const unit = unitCol !== -1 ? str(row[unitCol]) : "كيلو";
          inventory.push({ item_name: name, balance, unit });
        }
      }
    }
  }

  const reportPayload = {
    report: {
      id: existingSameDate ? existingSameDate.report.id : undefined,
      report_date: reportDate,
      total_sales: totalSales,
      total_collected: totalCollected,
      total_receipts_qabd: totalReceiptsFromQabd,
      total_collected_from_sheet: totalCollected,
      total_sales_from_sheet: totalSalesFromSheet,
      collection_rate: collectionRate,
      total_qty: finalTotalQty,
      raw_material_qty: rawMaterialQty,
      feed_qty: feedQty,
      customer_count: customerCount,
      invoice_count: invoiceCountTotal,
      average_invoice: averageInvoice,
      total_receivables: calculatedTotalReceivables,
      opening_balance: finalOpeningBalance,
      is_manual: data.isManual || false,
      uploaded_by: null,
      ai_summary: existingSameDate?.report.ai_summary || null,
    },
    customers,
    sabeqCustomers: Array.from(sabeqNames),
    products: productAggregates,
    customerProducts,
    invoices,
    inventory,
  };

  applyManufacturingToReportProducts(reportPayload, previousReport);

  const reportId = await saveLocalReport(reportPayload);

  const updatedReports = [
    reportPayload,
    ...existingReports.filter((r: any) => r.report?.report_date !== reportDate),
  ].sort(
    (a: any, b: any) =>
      new Date(b.report.report_date).getTime() -
      new Date(a.report.report_date).getTime(),
  );

  return {
    reportId,
    reportDate,
    totalSales,
    totalCollected,
    customerCount,
    invoiceCount: invoiceCountTotal,
    allReports: updatedReports,
  };
}

export function inferProductCategory(p: string): string {
  if (/علف|تسمين|بادئ|نامي/.test(p)) {
    return "علف";
  } else if (/خام|ذرة|ذره|صويا|ردة|نخالة|نخاله|كسب|رجيع|دي دي/.test(p)) {
    return "خامات";
  } else if (
    /فيتامين|املاح|بريمكس|اضافات|مضاد|خميره|حجر|ملح|بيكربونات|ماغنسيوم|رافع/.test(
      p,
    )
  ) {
    return "إضافات";
  }
  return "أخرى";
}

export function computeManufacturingQuantities(
  currReportData: any,
  prevReportData: any,
): Map<string, number> {
  const mfgMap = new Map<string, number>();
  if (
    !currReportData?.inventory?.length ||
    !prevReportData?.inventory?.length ||
    !currReportData?.report?.report_date ||
    !prevReportData?.report?.report_date
  ) {
    return mfgMap;
  }

  const dayGap = Math.round(
    (new Date(currReportData.report.report_date).getTime() -
      new Date(prevReportData.report.report_date).getTime()) /
      86400000,
  );
  // Only compare consecutive working days (1 day or 2 days across Friday holiday)
  if (dayGap < 1 || dayGap > 2) return mfgMap;

  const prevInv = new Map<string, number>();
  for (const x of prevReportData.inventory) {
    if (x?.item_name) prevInv.set(x.item_name.trim(), Number(x.balance) || 0);
  }

  const currInv = new Map<string, number>();
  for (const x of currReportData.inventory) {
    if (x?.item_name) currInv.set(x.item_name.trim(), Number(x.balance) || 0);
  }

  const cpMap = new Map<string, number>();
  for (const cp of currReportData.customerProducts || []) {
    if (!cp?.product_name) continue;
    const k = cp.product_name.trim();
    cpMap.set(k, (cpMap.get(k) || 0) + (Number(cp.quantity) || 0));
  }

  let bagsKg = 0;
  let feedProd = 0;
  let rawMfgSum = 0;
  const suppliedCoreItems: string[] = [];
  const coreMfgIngredients = [
    "ذره صفراء",
    "نخاله",
    "دي دي جي",
    "كسب النور",
    "حجر جيرى",
    "ملح طعام",
    "بريمكس تسمين",
    "مضاد سموم  كيميائي",
  ];

  for (const [item, cBal] of currInv.entries()) {
    const pBal = prevInv.get(item);
    if (pBal === undefined) continue;
    const sold = cpMap.get(item) || 0;
    const drop = Number((pBal - cBal).toFixed(3));
    const diff = Number((drop - sold).toFixed(3));

    const isBag = item.includes("شكاير");
    const isFeed = item.includes("علف");
    const isService = ["تصنيع", "عمال", "نقل"].some((x) => item.includes(x));

    if (isBag) {
      if (item.includes("110*60") && diff > 0) {
        bagsKg += diff * 50;
      }
    } else if (isFeed) {
      if (diff < 0) {
        feedProd += Math.abs(diff);
      }
    } else if (!isService) {
      if (diff > 0) {
        mfgMap.set(item, diff);
        rawMfgSum += diff;
      } else if (diff < 0) {
        if (coreMfgIngredients.includes(item)) {
          suppliedCoreItems.push(item);
        }
      }
    }
  }

  let targetMfgKg = 0;
  if (feedProd > 0 && bagsKg > 0) {
    targetMfgKg =
      Math.abs(bagsKg - feedProd) <= 1500
        ? bagsKg
        : Math.round(feedProd / 1000) * 1000;
  } else if (feedProd > 0) {
    targetMfgKg = Math.round(feedProd / 1000) * 1000;
  }

  const missingKg = Number((targetMfgKg - rawMfgSum).toFixed(3));

  if (targetMfgKg > 0 && missingKg > 0 && suppliedCoreItems.length > 0) {
    if (suppliedCoreItems.length === 1) {
      mfgMap.set(suppliedCoreItems[0], missingKg);
    } else {
      const tons = targetMfgKg / 1000;
      const stdPerTon: Record<string, number> = {
        "مضاد سموم  كيميائي": 1,
        "بريمكس تسمين": 3,
        "ملح طعام": 9,
        "حجر جيرى": 12,
        "دي دي جي": 50,
        "كسب النور": 75,
        نخاله: 200,
        "ذره صفراء": 650,
      };
      let remaining = missingKg;
      const sorted = [...suppliedCoreItems].sort(
        (a, b) => (stdPerTon[a] || 999) - (stdPerTon[b] || 999),
      );
      for (let idx = 0; idx < sorted.length; idx++) {
        const it = sorted[idx];
        if (idx === sorted.length - 1) {
          if (remaining > 0) mfgMap.set(it, Number(remaining.toFixed(3)));
        } else {
          const est = Math.min(
            remaining,
            Number(((stdPerTon[it] || 0) * tons).toFixed(3)),
          );
          if (est > 0) {
            mfgMap.set(it, est);
            remaining -= est;
          }
        }
      }
    }
  }

  return mfgMap;
}

export function applyManufacturingToReportProducts(
  currReportData: any,
  prevReportData: any,
): void {
  if (!currReportData) return;

  const cpMap = new Map<string, { qty: number; amount: number }>();
  const hasCustomerProducts =
    Array.isArray(currReportData.customerProducts) &&
    currReportData.customerProducts.length > 0;

  if (hasCustomerProducts) {
    for (const cp of currReportData.customerProducts) {
      if (!cp?.product_name) continue;
      const name = cp.product_name.trim();
      const cur = cpMap.get(name) || { qty: 0, amount: 0 };
      cur.qty = Number((cur.qty + (Number(cp.quantity) || 0)).toFixed(3));
      cur.amount = Number(
        (cur.amount + (Number(cp.total_amount) || 0)).toFixed(2),
      );
      cpMap.set(name, cur);
    }
  }

  const mfgMap = computeManufacturingQuantities(currReportData, prevReportData);

  const existingProductsMap = new Map<string, any>();
  for (const p of currReportData.products || []) {
    if (!p?.product_name) continue;
    existingProductsMap.set(p.product_name.trim(), p);
  }

  const allProductNames = new Set<string>([
    ...existingProductsMap.keys(),
    ...cpMap.keys(),
    ...mfgMap.keys(),
  ]);

  const updatedProducts: any[] = [];
  for (const name of allProductNames) {
    const existing = existingProductsMap.get(name);
    const fromCp = cpMap.get(name);

    const salesQty = hasCustomerProducts
      ? (fromCp?.qty ?? 0)
      : (existing?.sales_qty ?? existing?.total_qty ?? 0);
    const salesAmount = hasCustomerProducts
      ? (fromCp?.amount ?? 0)
      : (existing?.total_amount ?? 0);
    const mfgQty = mfgMap.get(name) || 0;
    const totalQty = Number((salesQty + mfgQty).toFixed(3));

    if (totalQty <= 0 && salesAmount <= 0 && !existing) continue;

    updatedProducts.push({
      ...(existing || {}),
      product_name: name,
      sales_qty: salesQty,
      mfg_qty: mfgQty,
      total_qty: totalQty,
      total_amount: salesAmount,
      category: existing?.category || inferProductCategory(name),
    });
  }

  currReportData.products = updatedProducts;
}
