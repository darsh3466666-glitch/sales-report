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
    return JSON.parse(raw);
  } catch {
    return { fixedAmounts: {}, notes: {}, pinnedStatus: {} };
  }
}

/**
 * Save customer override to LocalStorage and notify listeners.
 */
export function saveCustomerOverride(
  customerName: string,
  updates: { expectedAmount?: number; notes?: string; isPinned?: boolean }
) {
  if (typeof window === "undefined") return;
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
  window.dispatchEvent(new Event("cashflow_overrides_changed"));
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

  const liveTreasuryTx = await fetchLiveTreasuryIncoming();
  const overrides = getUserOverrides();

  const weekInfo = getCurrentCashFlowWeekWindow(options?.referenceDate || rawData?.reportDate || new Date());

  const baseCustomers: CashFlowCustomer[] = (rawData?.customers || []).map(
    (c: any, idx: number) => {
      const name = c.customerName || "";
      const isPinned =
        overrides.pinnedStatus[name] !== undefined
          ? overrides.pinnedStatus[name]
          : Boolean(rawConfig?.fixedAmounts?.[name] !== undefined || c.expectedAmount > 0);

      const expectedAmount =
        overrides.fixedAmounts[name] !== undefined
          ? overrides.fixedAmounts[name]
          : c.expectedAmount !== undefined
          ? c.expectedAmount
          : c.currentBalance || 0;

      const notes =
        overrides.notes[name] !== undefined
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
    cust.rate = cust.expectedAmount > 0 ? cust.totalCollected / cust.expectedAmount : 0;

    if (cust.expectedAmount === 0) {
      cust.status = cust.totalCollected > 0 ? "فائض" : "لا يوجد استحقاق";
    } else if (cust.totalCollected >= cust.expectedAmount) {
      cust.status = cust.totalCollected > cust.expectedAmount ? "فائض" : "مكتمل";
    } else if (cust.totalCollected > 0) {
      cust.status = "جزئي";
    } else {
      cust.status = "لم يسدد";
    }

    if (cust.dueDate && cust.dueDate < todayStr && cust.remaining > 0) {
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
