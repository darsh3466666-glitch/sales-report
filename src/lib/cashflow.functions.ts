import { normalizeArabicName } from "./excel-parser.functions";

export interface TreasuryIncomingTx {
  amount: number;
  description: string;
  type: string;
  matchedCustomer?: string;
}

export interface CashFlowCustomer {
  index: number;
  customerName: string;
  normalizedName: string;
  currentBalance: number;
  expectedAmount: number;
  collectedFromSheet: number;
  collectedFromTreasury: number;
  totalCollected: number;
  dueDate: string;
  rate: number;
  status: "مكتمل" | "جزئي" | "لم يسدد" | "فائض" | "لا يوجد استحقاق";
  remaining: number;
  notes: string;
  isPinned?: boolean;
  treasuryTransactions?: TreasuryIncomingTx[];
  isExtraCollector?: boolean;
}

export interface CashFlowSummary {
  reportDate: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  weeklyGoal: number;
  totalExpected: number;
  totalCollected: number;
  collectedFromSheet: number;
  collectedFromTreasury: number;
  collectionRate: number;
  remainingToTarget: number;
  customerCount: number;
  overdueCount: number;
  customers: CashFlowCustomer[];
  unmatchedTreasuryTx: TreasuryIncomingTx[];
}

export interface CashFlowConfig {
  weeklyGoal: number;
  fixedAmounts: Record<string, number>;
  notes: Record<string, string>;
  customExpected?: Record<string, number>;
  updatedAt?: string;
}

const LOCAL_STORAGE_KEY = "cashflow_user_overrides_v1";

/**
 * Calculates Wednesday to Tuesday week window for any given reference date.
 */
export function getCurrentCashFlowWeekWindow(refDate: Date | string = new Date()): {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
} {
  const d = typeof refDate === "string" ? new Date(refDate) : new Date(refDate);
  const day = d.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat

  let daysToWed = 0;
  if (day >= 3) {
    // Wed (3), Thu (4), Fri (5), Sat (6) -> started this week's Wednesday
    daysToWed = day - 3;
  } else {
    // Sun (0), Mon (1), Tue (2) -> started last week's Wednesday
    daysToWed = day + 4;
  }

  const startDate = new Date(d);
  startDate.setDate(d.getDate() - daysToWed);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6); // ends following Tuesday
  endDate.setHours(23, 59, 59, 999);

  const fmt = (date: Date) => date.toISOString().split("T")[0];
  
  const arabicMonthNames = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];

  const startStr = `${startDate.getDate()} ${arabicMonthNames[startDate.getMonth()]}`;
  const endStr = `${endDate.getDate()} ${arabicMonthNames[endDate.getMonth()]} ${endDate.getFullYear()}`;
  const weekLabel = `دورة الأسبوع: من الأربعاء (${startStr}) إلى الثلاثاء (${endStr})`;

  return {
    weekStart: fmt(startDate),
    weekEnd: fmt(endDate),
    weekLabel,
  };
}

function stripTitles(str: string): string {
  return str
    .replace(/(^|\s)(المعلم|حاج|الحاج|مهندس|المهندس|استاذ|الاستاذ|شيخ|الشيخ|دكتور|د)(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches a Treasury description against a customer name using Arabic normalizations.
 */
export function matchTreasuryDescriptionToCustomer(
  desc: string,
  customerName: string
): boolean {
  if (!desc || !customerName) return false;
  const nd = normalizeArabicName(desc);
  const nc = normalizeArabicName(customerName);
  if (!nd || !nc) return false;
  if (nd === nc) return true;
  if (nc.includes(nd) || nd.includes(nc)) return true;

  // Special deterministic matching for generic cash
  const isDescCash = /^(نقدي|كاش|نقدي كاش|عميل نقدي|نقدى)$/.test(nd);
  const isCustCash = /^(نقدي|كاش|نقدي كاش|عميل نقدي|عميل نقدي كاش)$/.test(nc);
  if (isDescCash && isCustCash) return true;

  const td = stripTitles(nd);
  const tc = stripTitles(nc);
  if (td && tc) {
    if (td === tc || tc.includes(td) || td.includes(tc)) return true;
    const dWords = td.split(" ").filter((w) => w.length >= 3);
    if (dWords.length >= 2 && dWords.every((w) => tc.includes(w))) {
      return true;
    }
  }

  const dWords = nd.split(" ").filter((w) => w.length >= 3);
  if (dWords.length > 0 && dWords.every((w) => nc.includes(w))) {
    return true;
  }
  return false;
}

/**
 * Fetch incoming transactions from live Treasury Dashboard.
 */
export async function fetchLiveTreasuryIncoming(): Promise<TreasuryIncomingTx[]> {
  try {
    const res = await fetch(
      `https://cowshedelnour-glitch.github.io/treasury-dashboard/data.json?t=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (data?.transactions?.incoming && Array.isArray(data.transactions.incoming)) {
      return data.transactions.incoming.map((tx: any) => ({
        amount: Number(tx.amount) || 0,
        description: String(tx.description || ""),
        type: String(tx.type || ""),
      }));
    }
    return [];
  } catch (err) {
    console.warn("Could not fetch live treasury feed:", err);
    return [];
  }
}

/**
 * Load user local overrides from LocalStorage.
 */
export function getUserOverrides(): {
  fixedAmounts: Record<string, number>;
  notes: Record<string, string>;
  pinnedStatus: Record<string, boolean>;
} {
  if (typeof window === "undefined") {
    return { fixedAmounts: {}, notes: {}, pinnedStatus: {} };
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return { fixedAmounts: {}, notes: {}, pinnedStatus: {} };
    const parsed = JSON.parse(raw);
    return {
      fixedAmounts:
        parsed && typeof parsed.fixedAmounts === "object" && parsed.fixedAmounts !== null
          ? parsed.fixedAmounts
          : {},
      notes:
        parsed && typeof parsed.notes === "object" && parsed.notes !== null
          ? parsed.notes
          : {},
      pinnedStatus:
        parsed && typeof parsed.pinnedStatus === "object" && parsed.pinnedStatus !== null
          ? parsed.pinnedStatus
          : {},
    };
  } catch {
    return { fixedAmounts: {}, notes: {}, pinnedStatus: {} };
  }
}

/**
 * Save customer override to LocalStorage safely without event side-effects.
 */
export function saveCustomerOverride(
  customerName: string,
  updates: { expectedAmount?: number; notes?: string; isPinned?: boolean }
) {
  if (typeof window === "undefined" || !customerName) return;
  try {
    const current = getUserOverrides();
    if (updates.expectedAmount !== undefined) {
      current.fixedAmounts[customerName] = updates.expectedAmount;
    }
    if (updates.notes !== undefined) {
      current.notes[customerName] = updates.notes;
    }
    if (updates.isPinned !== undefined) {
      current.pinnedStatus[customerName] = updates.isPinned;
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.error("Failed to save cashflow override:", err);
  }
}

/**
 * Recalculates cashflow summary completely in-memory (0ms, zero network requests).
 */
export function recalculateCashFlowSummary(
  currentSummary: CashFlowSummary,
  customerName: string,
  updates: { expectedAmount: number; isPinned: boolean; notes: string }
): CashFlowSummary {
  const todayStr = new Date().toISOString().split("T")[0];

  const updatedCustomers = currentSummary.customers.map((c) => {
    if (c.customerName !== customerName) return c;

    const expectedAmount = Number(updates.expectedAmount) || 0;
    const isPinned = Boolean(updates.isPinned);
    const notes = String(updates.notes || "");
    const totalCollected = c.collectedFromSheet + c.collectedFromTreasury;
    const remaining = expectedAmount - totalCollected;
    const rate =
      expectedAmount > 0 ? totalCollected / expectedAmount : totalCollected > 0 ? 1 : 0;

    let status: CashFlowCustomer["status"] = "لم يسدد";
    if (expectedAmount === 0) {
      status = totalCollected > 0 ? "فائض" : "لا يوجد استحقاق";
    } else if (totalCollected >= expectedAmount) {
      status = totalCollected > expectedAmount ? "فائض" : "مكتمل";
    } else if (totalCollected > 0) {
      status = "جزئي";
    } else {
      status = "لم يسدد";
    }

    return {
      ...c,
      expectedAmount,
      isPinned,
      notes,
      totalCollected,
      remaining,
      rate,
      status,
    };
  });

  let totalExpected = 0;
  let totalCollected = 0;
  let collectedFromSheet = 0;
  let collectedFromTreasury = 0;
  let overdueCount = 0;

  for (const c of updatedCustomers) {
    totalExpected += c.expectedAmount;
    totalCollected += c.totalCollected;
    collectedFromSheet += c.collectedFromSheet;
    collectedFromTreasury += c.collectedFromTreasury;

    if (c.dueDate && c.dueDate < todayStr && c.remaining > 0 && (c.rate || 0) < 0.9) {
      overdueCount++;
    }
  }

  const weeklyGoal = currentSummary.weeklyGoal || 4000000;
  const remainingToTarget = Math.max(0, weeklyGoal - totalCollected);
  const collectionRate = totalExpected > 0 ? totalCollected / totalExpected : 0;

  return {
    ...currentSummary,
    totalExpected,
    totalCollected,
    collectedFromSheet,
    collectedFromTreasury,
    collectionRate,
    remainingToTarget,
    overdueCount,
    customers: updatedCustomers,
  };
}

/**
 * Fetch base Cash Flow data from static file, then enhance with live Treasury & overrides.
 */
export async function getLiveCashFlowData(options?: {
  referenceDate?: string;
}): Promise<CashFlowSummary> {
  const basePath =
    typeof window !== "undefined" &&
    window.location.pathname.includes("/sales-report")
      ? "/sales-report/"
      : "./";

  let rawData: any = null;
  let rawConfig: any = null;

  try {
    const res = await fetch(`${basePath}cashflow_data.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (res.ok) {
      rawData = await res.json();
    }
  } catch (e) {
    console.warn("Failed to fetch cashflow_data.json:", e);
  }

  try {
    const cfgRes = await fetch(`${basePath}cashflow_config.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (cfgRes.ok) {
      rawConfig = await cfgRes.json();
    }
  } catch (e) {
    console.warn("Failed to fetch cashflow_config.json:", e);
  }

  const allSalesCustomersMap = new Map<string, any>();
  try {
    const sRes = await fetch(`${basePath}sales_data.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (sRes.ok) {
      const sData = await sRes.json();
      if (Array.isArray(sData)) {
        for (const rep of sData) {
          for (const sc of rep.customers || []) {
            if (sc && sc.customer_name && !allSalesCustomersMap.has(sc.customer_name)) {
              allSalesCustomersMap.set(sc.customer_name, sc);
            }
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }

  const liveTreasuryTx = await fetchLiveTreasuryIncoming();
  const overrides = getUserOverrides();

  const weekInfo = getCurrentCashFlowWeekWindow(options?.referenceDate || rawData?.reportDate || new Date());

  const baseCustomers: CashFlowCustomer[] = (rawData?.customers || []).map(
    (c: any, idx: number) => {
      const name = c.customerName || "";
      const isPinned =
        overrides.pinnedStatus?.[name] !== undefined
          ? overrides.pinnedStatus[name]
          : Boolean(rawConfig?.fixedAmounts?.[name] !== undefined || c.expectedAmount > 0);

      const expectedAmount =
        overrides.fixedAmounts?.[name] !== undefined
          ? overrides.fixedAmounts[name]
          : c.expectedAmount !== undefined
          ? c.expectedAmount
          : c.currentBalance || 0;

      const notes =
        overrides.notes?.[name] !== undefined
          ? overrides.notes[name]
          : c.notes || rawConfig?.notes?.[name] || "";

      return {
        index: idx + 1,
        customerName: name,
        normalizedName: c.normalizedName || normalizeArabicName(name),
        currentBalance: Number(c.currentBalance) || 0,
        expectedAmount: Number(expectedAmount) || 0,
        collectedFromSheet: Number(c.collectedFromSheet) || 0,
        collectedFromTreasury: 0,
        totalCollected: Number(c.collectedFromSheet) || 0,
        dueDate: c.dueDate || "",
        rate: 0,
        status: "لم يسدد" as const,
        remaining: 0,
        notes,
        isPinned,
        treasuryTransactions: [] as TreasuryIncomingTx[],
      };
    }
  );

  // Ensure permanent Cash Customer exists and is pinned weekly
  const CASH_NAME = "عميل نقدي (كاش)";
  let cashCust = baseCustomers.find(
    (c) => c.customerName === CASH_NAME || c.customerName.includes("نقدي")
  );
  if (!cashCust) {
    const expectedAmount =
      overrides.fixedAmounts?.[CASH_NAME] !== undefined
        ? overrides.fixedAmounts[CASH_NAME]
        : rawConfig?.fixedAmounts?.[CASH_NAME] !== undefined
        ? rawConfig.fixedAmounts[CASH_NAME]
        : 0;

    const notes =
      overrides.notes?.[CASH_NAME] !== undefined
        ? overrides.notes[CASH_NAME]
        : rawConfig?.notes?.[CASH_NAME] || "مبيعات وتحصيلات نقدية أسبوعية (كاش)";

    cashCust = {
      index: baseCustomers.length + 1,
      customerName: CASH_NAME,
      normalizedName: normalizeArabicName(CASH_NAME),
      currentBalance: 0,
      expectedAmount: Number(expectedAmount) || 0,
      collectedFromSheet: 0,
      collectedFromTreasury: 0,
      totalCollected: 0,
      dueDate: "",
      rate: expectedAmount > 0 ? 0 : 1,
      status: expectedAmount > 0 ? "لم يسدد" : "مكتمل",
      remaining: 0,
      notes,
      isPinned: true,
      treasuryTransactions: [],
    };
    baseCustomers.push(cashCust);
  } else {
    cashCust.isPinned = true;
  }

  // Match live Treasury incoming transactions with customers
  const unmatchedTreasuryTx: TreasuryIncomingTx[] = [];

  for (const tx of liveTreasuryTx) {
    let matched = false;
    for (const cust of baseCustomers) {
      if (matchTreasuryDescriptionToCustomer(tx.description, cust.customerName)) {
        cust.collectedFromTreasury += tx.amount;
        cust.treasuryTransactions = cust.treasuryTransactions || [];
        cust.treasuryTransactions.push(tx);
        tx.matchedCustomer = cust.customerName;
        matched = true;
        break;
      }
    }

    // If not matched in base customers, check if it's generic cash or a known customer from Sales report
    if (!matched) {
      const normDesc = normalizeArabicName(tx.description);
      const isGenericCash = /^(نقدي|كاش|مصاريف|مرتجع|ايداع|سحب)$/.test(normDesc);

      if (isGenericCash || tx.type === "كاش" || normDesc.includes("نقدي") || normDesc.includes("كاش")) {
        cashCust.collectedFromTreasury += tx.amount;
        cashCust.treasuryTransactions = cashCust.treasuryTransactions || [];
        cashCust.treasuryTransactions.push(tx);
        tx.matchedCustomer = cashCust.customerName;
        matched = true;
      } else {
        const matchedSales = Array.from(allSalesCustomersMap.values()).find((sc) =>
          matchTreasuryDescriptionToCustomer(tx.description, sc.customer_name)
        );

        const custName = matchedSales ? matchedSales.customer_name : tx.description;
        const currentBal = matchedSales
          ? Number(
              matchedSales.outstanding_amount ||
                matchedSales.prev_balance ||
                matchedSales.total_balance ||
                0
            )
          : tx.amount;

        const expectedAmount =
          overrides.fixedAmounts?.[custName] !== undefined
            ? overrides.fixedAmounts[custName]
            : rawConfig?.fixedAmounts?.[custName] !== undefined
            ? rawConfig.fixedAmounts[custName]
            : tx.amount;

        const notes =
          overrides.notes?.[custName] !== undefined
            ? overrides.notes[custName]
            : rawConfig?.notes?.[custName] || `تحصيل خزينة وارد (${tx.type})`;

        const newCust: CashFlowCustomer = {
          index: baseCustomers.length + 1,
          customerName: custName,
          normalizedName: normalizeArabicName(custName),
          currentBalance: currentBal,
          expectedAmount,
          collectedFromSheet: 0,
          collectedFromTreasury: tx.amount,
          totalCollected: tx.amount,
          dueDate: "",
          rate: expectedAmount > 0 ? tx.amount / expectedAmount : 1,
          status:
            tx.amount >= expectedAmount
              ? tx.amount > expectedAmount
                ? "فائض"
                : "مكتمل"
              : "جزئي",
          remaining: Math.max(0, expectedAmount - tx.amount),
          notes,
          isPinned: Boolean(
            overrides.pinnedStatus?.[custName] !== undefined
              ? overrides.pinnedStatus[custName]
              : rawConfig?.fixedAmounts?.[custName] !== undefined
          ),
          treasuryTransactions: [tx],
        };

        baseCustomers.push(newCust);
        tx.matchedCustomer = custName;
        matched = true;
      }
    }

    if (!matched) {
      unmatchedTreasuryTx.push(tx);
    }
  }

  // Recalculate each customer's final status & remaining
  let totalExpected = 0;
  let totalCollected = 0;
  let collectedFromSheet = 0;
  let collectedFromTreasury = 0;
  let overdueCount = 0;

  const todayStr = new Date().toISOString().split("T")[0];

  for (const cust of baseCustomers) {
    cust.totalCollected = cust.collectedFromSheet + cust.collectedFromTreasury;
    cust.remaining = cust.expectedAmount - cust.totalCollected;
    cust.rate =
      cust.expectedAmount > 0
        ? cust.totalCollected / cust.expectedAmount
        : cust.totalCollected > 0
        ? 1
        : 0;

    if (cust.expectedAmount === 0) {
      cust.status = cust.totalCollected > 0 ? "فائض" : "لا يوجد استحقاق";
    } else if (cust.totalCollected >= cust.expectedAmount) {
      cust.status = cust.totalCollected > cust.expectedAmount ? "فائض" : "مكتمل";
    } else if (cust.totalCollected > 0) {
      cust.status = "جزئي";
    } else {
      cust.status = "لم يسدد";
    }

    if (cust.dueDate && cust.dueDate < todayStr && cust.remaining > 0 && (cust.rate || 0) < 0.9) {
      overdueCount++;
    }

    totalExpected += cust.expectedAmount;
    totalCollected += cust.totalCollected;
    collectedFromSheet += cust.collectedFromSheet;
    collectedFromTreasury += cust.collectedFromTreasury;
  }

  const weeklyGoal = rawConfig?.weeklyGoal || rawData?.weeklyGoal || 4000000;
  const remainingToTarget = Math.max(0, weeklyGoal - totalCollected);
  const collectionRate = totalExpected > 0 ? totalCollected / totalExpected : 0;

  return {
    reportDate: rawData?.reportDate || todayStr,
    weekStart: weekInfo.weekStart,
    weekEnd: weekInfo.weekEnd,
    weekLabel: weekInfo.weekLabel,
    weeklyGoal,
    totalExpected,
    totalCollected,
    collectedFromSheet,
    collectedFromTreasury,
    collectionRate,
    remainingToTarget,
    customerCount: baseCustomers.length,
    overdueCount,
    customers: baseCustomers,
    unmatchedTreasuryTx,
  };
}
