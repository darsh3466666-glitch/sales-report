import { normalizeArabicName } from "./excel-parser.functions";
import { get, set, keys } from "idb-keyval";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface ArchivedCashFlowWeek {
  id: string;
  weekLabel: string;
  startDate: string;
  endDate: string;
  archivedAt: string;
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
}

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
  status: "مكتمل" | "جزئي" | "لم يسدد" | "لا يوجد استحقاق";
  remaining: number;
  notes: string;
  isPinned?: boolean;
  treasuryTransactions?: TreasuryIncomingTx[];
  isExtraCollector?: boolean;
  isUnexpectedInflow?: boolean;
}

export interface CashFlowComparisonMetrics {
  title: string;
  target: number;
  collected: number;
  remainingToTarget: number;
  achievementRate: number;
  overdueCount: number;
  expected?: number;
  remainingExpected?: number;
  collectionRate?: number;
}

export interface CashFlowWeeklyComparison {
  hasGenuinePreviousSnapshot?: boolean;
  lastWeek: CashFlowComparisonMetrics;
  currentWeek: CashFlowComparisonMetrics;
  growthRate: number;
}

export interface MasterCustomerItem {
  customerName: string;
  currentBalance: number;
  dueDate: string;
  notes: string;
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
  comparison?: CashFlowWeeklyComparison;
  masterCustomerNames?: string[];
  masterCustomers?: MasterCustomerItem[];
}

export interface CashFlowConfig {
  weeklyGoal: number;
  fixedAmounts: Record<string, number>;
  notes: Record<string, string>;
  customExpected?: Record<string, number>;
  pinnedCustomers?: Record<string, boolean>;
  previousWeek?: Partial<CashFlowComparisonMetrics> | null;
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

export interface UserOverrides {
  fixedAmounts: Record<string, number>;
  notes: Record<string, string>;
  pinnedStatus: Record<string, boolean>;
  deletedCustomers?: string[];
  addedCustomers?: CashFlowCustomer[];
}

/**
 * Load user local overrides from LocalStorage.
 */
export function getUserOverrides(): UserOverrides {
  if (typeof window === "undefined") {
    return { fixedAmounts: {}, notes: {}, pinnedStatus: {}, deletedCustomers: [], addedCustomers: [] };
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return { fixedAmounts: {}, notes: {}, pinnedStatus: {}, deletedCustomers: [], addedCustomers: [] };
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
      deletedCustomers: Array.isArray(parsed?.deletedCustomers) ? parsed.deletedCustomers : [],
      addedCustomers: Array.isArray(parsed?.addedCustomers) ? parsed.addedCustomers : [],
    };
  } catch {
    return { fixedAmounts: {}, notes: {}, pinnedStatus: {}, deletedCustomers: [], addedCustomers: [] };
  }
}

/**
 * Mark a customer as deleted by user for this cycle.
 */
export function markCustomerAsDeleted(customerName: string) {
  if (typeof window === "undefined" || !customerName) return;
  try {
    const current = getUserOverrides();
    const deleted = new Set(current.deletedCustomers || []);
    deleted.add(customerName);
    current.deletedCustomers = Array.from(deleted);
    if (current.addedCustomers) {
      current.addedCustomers = current.addedCustomers.filter((c) => c.customerName !== customerName);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.error("Failed to mark customer as deleted:", err);
  }
}

/**
 * Save customer added manually by user.
 */
export function saveManuallyAddedCustomer(customer: CashFlowCustomer) {
  if (typeof window === "undefined" || !customer.customerName) return;
  try {
    const current = getUserOverrides();
    if (current.deletedCustomers) {
      current.deletedCustomers = current.deletedCustomers.filter((n) => n !== customer.customerName);
    }
    const added = current.addedCustomers || [];
    const filtered = added.filter((c) => c.customerName !== customer.customerName);
    filtered.push(customer);
    current.addedCustomers = filtered;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.error("Failed to save manually added customer:", err);
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
 * Delete customer from summary and update state instantly in-memory.
 */
export function deleteCustomerFromSummary(
  summary: CashFlowSummary,
  customerName: string
): CashFlowSummary {
  markCustomerAsDeleted(customerName);
  const remainingCusts = summary.customers
    .filter((c) => c.customerName !== customerName)
    .map((c, idx) => ({ ...c, index: idx + 1 }));

  let totalExpected = 0;
  let totalCollected = 0;
  let collectedFromSheet = 0;
  let collectedFromTreasury = 0;
  let overdueCount = 0;
  const todayStr = new Date().toISOString().split("T")[0];

  for (const c of remainingCusts) {
    totalExpected += c.expectedAmount;
    totalCollected += c.totalCollected;
    collectedFromSheet += c.collectedFromSheet;
    collectedFromTreasury += c.collectedFromTreasury;
    if (c.dueDate && c.dueDate < todayStr && c.remaining > 0 && (c.rate || 0) < 0.9) {
      overdueCount++;
    }
  }

  const weeklyGoal = summary.weeklyGoal || 4000000;
  const remainingToTarget = Math.max(0, weeklyGoal - totalCollected);
  const collectionRate = totalExpected > 0 ? totalCollected / totalExpected : 0;

  return {
    ...summary,
    totalExpected,
    totalCollected,
    collectedFromSheet,
    collectedFromTreasury,
    collectionRate,
    remainingToTarget,
    customerCount: remainingCusts.length,
    overdueCount,
    customers: remainingCusts,
  };
}

/**
 * Add customer manually to summary and update state instantly in-memory.
 */
export function addCustomerToSummary(
  summary: CashFlowSummary,
  newCust: {
    customerName: string;
    expectedAmount: number;
    currentBalance?: number;
    dueDate?: string;
    notes?: string;
    isPinned?: boolean;
  }
): CashFlowSummary {
  const name = newCust.customerName.trim();
  const expectedAmount = Number(newCust.expectedAmount) || 0;
  const currentBalance = Number(newCust.currentBalance) || 0;
  const dueDate = newCust.dueDate || "";
  const notes = (newCust.notes || "").trim();
  const isPinned = Boolean(newCust.isPinned);

  const existingIdx = summary.customers.findIndex((c) => c.customerName === name);

  const custObj: CashFlowCustomer = {
    index: existingIdx >= 0 ? summary.customers[existingIdx].index : summary.customers.length + 1,
    customerName: name,
    normalizedName: normalizeArabicName(name),
    currentBalance,
    expectedAmount,
    collectedFromSheet: 0,
    collectedFromTreasury: 0,
    totalCollected: 0,
    dueDate,
    rate: expectedAmount > 0 ? 0 : 1,
    status: expectedAmount > 0 ? "لم يسدد" : "لا يوجد استحقاق",
    remaining: expectedAmount,
    notes,
    isPinned,
    treasuryTransactions: [],
  };

  saveManuallyAddedCustomer(custObj);
  if (isPinned) {
    saveCustomerOverride(name, { expectedAmount, isPinned: true, notes });
  }

  let updatedCusts: CashFlowCustomer[];
  if (existingIdx >= 0) {
    updatedCusts = summary.customers.map((c, i) => (i === existingIdx ? custObj : c));
  } else {
    updatedCusts = [...summary.customers, custObj];
  }
  updatedCusts = updatedCusts.map((c, idx) => ({ ...c, index: idx + 1 }));

  let totalExpected = 0;
  let totalCollected = 0;
  let collectedFromSheet = 0;
  let collectedFromTreasury = 0;
  let overdueCount = 0;
  const todayStr = new Date().toISOString().split("T")[0];

  for (const c of updatedCusts) {
    totalExpected += c.expectedAmount;
    totalCollected += c.totalCollected;
    collectedFromSheet += c.collectedFromSheet;
    collectedFromTreasury += c.collectedFromTreasury;
    if (c.dueDate && c.dueDate < todayStr && c.remaining > 0 && (c.rate || 0) < 0.9) {
      overdueCount++;
    }
  }

  const weeklyGoal = summary.weeklyGoal || 4000000;
  const remainingToTarget = Math.max(0, weeklyGoal - totalCollected);
  const collectionRate = totalExpected > 0 ? totalCollected / totalExpected : 0;

  return {
    ...summary,
    totalExpected,
    totalCollected,
    collectedFromSheet,
    collectedFromTreasury,
    collectionRate,
    remainingToTarget,
    customerCount: updatedCusts.length,
    overdueCount,
    customers: updatedCusts,
  };
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

    let expectedAmount = Number(updates.expectedAmount) || 0;
    const isPinned = Boolean(updates.isPinned);
    const notes = String(updates.notes || "");
    const totalCollected = c.collectedFromSheet + c.collectedFromTreasury;

    const isCashCust =
      c.customerName === "عميل نقدي (كاش)" ||
      c.customerName === "نقدي كاش" ||
      c.customerName.includes("نقدي");

    if (isCashCust) {
      expectedAmount = Math.max(expectedAmount, totalCollected);
    }

    const remaining = expectedAmount - totalCollected;
    const rate =
      expectedAmount > 0 ? totalCollected / expectedAmount : totalCollected > 0 ? 1 : 0;

    let status: CashFlowCustomer["status"] = "لم يسدد";
    if (expectedAmount === 0) {
      status = totalCollected > 0 ? "مكتمل" : "لا يوجد استحقاق";
    } else if (totalCollected >= expectedAmount) {
      status = "مكتمل";
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

  let comparison = currentSummary.comparison;
  if (comparison) {
    const currentWeekRate = weeklyGoal > 0 ? (totalCollected / weeklyGoal) * 100 : 0;
    const growthRate =
      comparison.lastWeek.collected > 0
        ? ((totalCollected - comparison.lastWeek.collected) / comparison.lastWeek.collected) * 100
        : 0;
    comparison = {
      ...comparison,
      currentWeek: {
        ...comparison.currentWeek,
        target: weeklyGoal,
        collected: totalCollected,
        remainingToTarget,
        achievementRate: currentWeekRate,
        overdueCount,
      },
      growthRate,
    };
  }

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
    comparison,
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

  try {
    const liveTreasuryTx = await fetchLiveTreasuryIncoming();
    const overrides = getUserOverrides();

    const weekInfo = getCurrentCashFlowWeekWindow(options?.referenceDate || rawData?.reportDate || new Date());

    let baseCustomers: CashFlowCustomer[] = (rawData?.customers || []).map(
      (c: any, idx: number) => {
        const name = c.customerName || "";
        // Pinned status: strictly default to false! Only user explicitly decides who is pinned.
        const isPinned =
          overrides.pinnedStatus?.[name] !== undefined
            ? overrides.pinnedStatus[name]
            : Boolean(rawConfig?.pinnedCustomers?.[name] ?? c.isPinned ?? false);

        const expectedAmount =
          overrides.fixedAmounts?.[name] !== undefined
            ? overrides.fixedAmounts[name]
            : isPinned && rawConfig?.fixedAmounts?.[name] !== undefined
            ? rawConfig.fixedAmounts[name]
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

    // Index master customer names from raw base data
    const masterNamesSet = new Set<string>();
    if (rawData?.masterCustomerNames && Array.isArray(rawData.masterCustomerNames)) {
      for (const name of rawData.masterCustomerNames) {
        masterNamesSet.add(normalizeArabicName(name));
      }
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
          // Find if this transaction description corresponds to an actual customer in Master Data or Sales Report
          const matchedSales = Array.from(allSalesCustomersMap.values()).find((sc) =>
            matchTreasuryDescriptionToCustomer(tx.description, sc.customer_name)
          );

          let matchedMasterName = "";
          if (rawData?.masterCustomerNames) {
            for (const mName of rawData.masterCustomerNames) {
              if (matchTreasuryDescriptionToCustomer(tx.description, mName)) {
                matchedMasterName = mName;
                break;
              }
            }
          }

          const validCustName = matchedMasterName || (matchedSales ? matchedSales.customer_name : "");
          const normValid = normalizeArabicName(validCustName);

          // STRICT REQUIREMENT: Only accept if it is an authentic customer from Master Data!
          // Never convert accounting entries or non-customer descriptions (like "ريع نقل", "سولار", "مصاريف") into customers!
          const isMasterCustomer =
            validCustName &&
            !normValid.includes("ريع نقل") &&
            !/^(ريع|ريع نقل|نقل|سولار|مصاريف|مرتبات|كهرباء|مياه|صيانة|بوفيه|ادوات|ايجار|ايراد|ايرادات)$/.test(normValid) &&
            (masterNamesSet.size === 0 || masterNamesSet.has(normValid));

          if (isMasterCustomer) {
            const custName = validCustName;
            const currentBal = matchedSales
              ? Number(
                  matchedSales.outstanding_amount ||
                    matchedSales.prev_balance ||
                    matchedSales.total_balance ||
                    0
              )
            : tx.amount;

            // STRICT USER REQUIREMENT:
            // "عميل سدد واسمه مكنش ف القايمة اول م اتعملت سعتها ضيفه ولكن خلي المتوقع منه صفر وضيف له السداد بتاعه عادي لان ف الحالة دي انا كنت مش متوقع انه يجي"
            const expectedAmount =
              overrides.fixedAmounts?.[custName] !== undefined
                ? overrides.fixedAmounts[custName]
                : rawConfig?.fixedAmounts?.[custName] !== undefined
                ? rawConfig.fixedAmounts[custName]
                : 0; // Strictly 0 for unexpected inflow!

            const notes =
              overrides.notes?.[custName] !== undefined
                ? overrides.notes[custName]
                : rawConfig?.notes?.[custName] || `سداد وارد غير متوقع (${tx.type})`;

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
              rate: 1,
              status: "مكتمل",
              remaining: 0,
              notes,
              isPinned: Boolean(
                overrides.pinnedStatus?.[custName] !== undefined
                  ? overrides.pinnedStatus[custName]
                  : rawConfig?.pinnedCustomers?.[custName] ?? false
              ),
              isUnexpectedInflow: true,
              treasuryTransactions: [tx],
            };

            baseCustomers.push(newCust);
            tx.matchedCustomer = custName;
            matched = true;
          } else {
            // Non-customer transaction (e.g. "ريع نقل") - keep in unmatchedTreasuryTx only
            matched = false;
          }
        }
      }

      if (!matched) {
        unmatchedTreasuryTx.push(tx);
      }
    }

    // Strict validation: Filter out ANY non-master accounts or accounting descriptions from baseCustomers
    baseCustomers = baseCustomers.filter((c) => {
      if (c.customerName === CASH_NAME || c.customerName.includes("نقدي")) return true;
      const norm = normalizeArabicName(c.customerName);
      if (norm.includes("ريع نقل") || /^(ريع|نقل|سولار|مصاريف|مرتبات|كهرباء|مياه|صيانة|بوفيه|ادوات|ايجار|ايراد|ايرادات)$/.test(norm)) {
        return false;
      }
      if (masterNamesSet.size > 0) {
        return masterNamesSet.has(norm);
      }
      return true;
    });

    // Filter out user-deleted customers for this active week
    if (overrides.deletedCustomers && overrides.deletedCustomers.length > 0) {
      const deletedSet = new Set(overrides.deletedCustomers);
      baseCustomers = baseCustomers.filter((c) => !deletedSet.has(c.customerName));
    }

    // Append user-added customers for this active week
    if (overrides.addedCustomers && overrides.addedCustomers.length > 0) {
      for (const ac of overrides.addedCustomers) {
        if (!baseCustomers.some((c) => c.customerName === ac.customerName)) {
          baseCustomers.push({
            ...ac,
            index: baseCustomers.length + 1,
          });
        }
      }
    }

    // Re-index remaining customers 1..N
    baseCustomers.forEach((c, idx) => {
      c.index = idx + 1;
    });

    // Recalculate each customer's final status & remaining
    let totalExpected = 0;
    let totalCollected = 0;
    let collectedFromSheet = 0;
    let collectedFromTreasury = 0;
    let overdueCount = 0;

    const todayStr = new Date().toISOString().split("T")[0];

    for (const cust of baseCustomers) {
      cust.totalCollected = cust.collectedFromSheet + cust.collectedFromTreasury;

      // Special rule for Cash customer: always increase expectedAmount so incoming is exactly identical to expected!
      const isCashCust =
        cust.customerName === "عميل نقدي (كاش)" ||
        cust.customerName === "نقدي كاش" ||
        cust.customerName.includes("نقدي");

      if (isCashCust) {
        cust.expectedAmount = Math.max(cust.expectedAmount || 0, cust.totalCollected);
      }

      cust.remaining = cust.expectedAmount - cust.totalCollected;
      cust.rate =
        cust.expectedAmount > 0
          ? cust.totalCollected / cust.expectedAmount
          : cust.totalCollected > 0
          ? 1
          : 0;

      if (cust.expectedAmount === 0) {
        cust.status = cust.totalCollected > 0 ? "مكتمل" : "لا يوجد استحقاق";
      } else if (cust.totalCollected >= cust.expectedAmount) {
        cust.status = "مكتمل";
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

    // Build Weekly Comparison Metrics (Executive Totals)
    const prevOverrideRaw =
      typeof window !== "undefined"
        ? localStorage.getItem("cashflow_previous_week_override")
        : null;
    let storedPreviousWeek: CashFlowComparisonMetrics | null = null;
    if (prevOverrideRaw) {
      try {
        storedPreviousWeek = JSON.parse(prevOverrideRaw);
      } catch (e) {}
    }

    const activePreviousWeek = storedPreviousWeek || rawConfig?.previousWeek;
    const hasGenuinePreviousSnapshot = Boolean(
      activePreviousWeek &&
      typeof activePreviousWeek.collected === "number" &&
      activePreviousWeek.collected > 0
    );

    let comparison: CashFlowWeeklyComparison | undefined = undefined;
    if (hasGenuinePreviousSnapshot && activePreviousWeek) {
      const lastWeekCollected = Number(activePreviousWeek.collected) || 0;
      const lastWeekTarget = Number(activePreviousWeek.target) || weeklyGoal;
      const lastWeekOverdue = Number(activePreviousWeek.overdueCount) || 0;
      const lastWeekTitle = activePreviousWeek.title || "الأسبوع السابق";
      const lastWeekExpected = Number(activePreviousWeek.expected) || lastWeekCollected;
      const lastWeekRemainingExpected = Math.max(0, lastWeekExpected - lastWeekCollected);
      const lastWeekCollectionRate =
        Number(activePreviousWeek.collectionRate) ||
        (lastWeekExpected > 0 ? (lastWeekCollected / lastWeekExpected) * 100 : 0);

      const lastWeekRemaining = Math.max(0, lastWeekTarget - lastWeekCollected);
      const lastWeekRate =
        lastWeekTarget > 0 ? (lastWeekCollected / lastWeekTarget) * 100 : 0;
      const currentWeekRate =
        weeklyGoal > 0 ? (totalCollected / weeklyGoal) * 100 : 0;
      const growthRate =
        lastWeekCollected > 0
          ? ((totalCollected - lastWeekCollected) / lastWeekCollected) * 100
          : 0;

      comparison = {
        hasGenuinePreviousSnapshot: true,
        lastWeek: {
          title: lastWeekTitle,
          target: lastWeekTarget,
          collected: lastWeekCollected,
          remainingToTarget: lastWeekRemaining,
          achievementRate: lastWeekRate,
          overdueCount: lastWeekOverdue,
          expected: lastWeekExpected,
          remainingExpected: lastWeekRemainingExpected,
          collectionRate: lastWeekCollectionRate,
        },
        currentWeek: {
          title: weekInfo.weekLabel || "هذا الأسبوع",
          target: weeklyGoal,
          collected: totalCollected,
          remainingToTarget,
          achievementRate: currentWeekRate,
          overdueCount,
          expected: totalExpected,
          remainingExpected: Math.max(0, totalExpected - totalCollected),
          collectionRate: totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0,
        },
        growthRate,
      };
    } else {
      const currentWeekRate =
        weeklyGoal > 0 ? (totalCollected / weeklyGoal) * 100 : 0;
      comparison = {
        hasGenuinePreviousSnapshot: false,
        lastWeek: {
          title: "الأسبوع التأسيسي الأول (لا توجد دورة سابقة)",
          target: 0,
          collected: 0,
          remainingToTarget: 0,
          achievementRate: 0,
          overdueCount: 0,
          expected: 0,
          remainingExpected: 0,
          collectionRate: 0,
        },
        currentWeek: {
          title: weekInfo.weekLabel || "هذا الأسبوع",
          target: weeklyGoal,
          collected: totalCollected,
          remainingToTarget,
          achievementRate: currentWeekRate,
          overdueCount,
          expected: totalExpected,
          remainingExpected: Math.max(0, totalExpected - totalCollected),
          collectionRate: totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0,
        },
        growthRate: 0,
      };
    }

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
      comparison,
      masterCustomerNames: rawData?.masterCustomerNames || [],
      masterCustomers: rawData?.masterCustomers || [],
    };
  } catch (err) {
    console.error("Critical error in getLiveCashFlowData processing:", err);
    const weekInfo = getCurrentCashFlowWeekWindow(options?.referenceDate || rawData?.reportDate || new Date());
    const fallbackCustomers: CashFlowCustomer[] = (rawData?.customers || []).map((c: any, idx: number) => ({
      index: idx + 1,
      customerName: c.customerName || `عميل ${idx + 1}`,
      normalizedName: c.normalizedName || "",
      currentBalance: Number(c.currentBalance) || 0,
      expectedAmount: Number(c.expectedAmount) || 0,
      collectedFromSheet: Number(c.collectedFromSheet) || 0,
      collectedFromTreasury: 0,
      totalCollected: Number(c.collectedFromSheet) || 0,
      dueDate: c.dueDate || "",
      rate: c.rate || 0,
      status: c.status || "لم يسدد",
      remaining: Number(c.remaining) || 0,
      notes: c.notes || "",
      isPinned: Boolean(c.isPinned),
      treasuryTransactions: [],
    }));
    return {
      reportDate: rawData?.reportDate || new Date().toISOString().split("T")[0],
      weekStart: weekInfo.weekStart,
      weekEnd: weekInfo.weekEnd,
      weekLabel: weekInfo.weekLabel,
      weeklyGoal: rawConfig?.weeklyGoal || rawData?.weeklyGoal || 4000000,
      totalExpected: rawData?.totalExpected || 0,
      totalCollected: rawData?.totalCollected || 0,
      collectedFromSheet: rawData?.totalCollected || 0,
      collectedFromTreasury: 0,
      collectionRate: rawData?.collectionRate || 0,
      remainingToTarget: rawData?.remainingToTarget || 4000000,
      customerCount: fallbackCustomers.length,
      overdueCount: rawData?.overdueCount || 0,
      customers: fallbackCustomers,
      unmatchedTreasuryTx: [],
    };
  }
}

const CF_ARCHIVE_PREFIX = "cf_archive_";

/**
 * Fetch all archived Cash Flow weeks from static JSON, IndexedDB, and Firestore.
 */
export async function getArchivedCashFlowWeeks(): Promise<ArchivedCashFlowWeek[]> {
  const archivesMap = new Map<string, ArchivedCashFlowWeek>();

  // 1. Static fallback from public/cashflow_history.json
  if (typeof window !== "undefined") {
    try {
      const basePath = window.location.pathname.includes("/sales-report")
        ? "/sales-report/"
        : "./";
      const res = await fetch(`${basePath}cashflow_history.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.id) archivesMap.set(item.id, item);
          }
        }
      }
    } catch (e) {
      console.warn("Could not load static cashflow history:", e);
    }
  }

  // 2. Load from IndexedDB (instant offline storage)
  if (typeof window !== "undefined") {
    try {
      const allKeys = await keys();
      const archiveKeys = allKeys.filter(
        (k) => typeof k === "string" && k.startsWith(CF_ARCHIVE_PREFIX)
      );
      for (const k of archiveKeys) {
        const item = await get<ArchivedCashFlowWeek>(k);
        if (item && item.id) {
          archivesMap.set(item.id, item);
        }
      }
    } catch (e) {
      console.warn("Could not load IndexedDB archives:", e);
    }
  }

  // 3. Load from Firestore (cross-device cloud sync)
  if (typeof window !== "undefined") {
    try {
      const colRef = collection(db, "cashflow_archives");
      const snap = await getDocs(colRef);
      snap.forEach((d) => {
        const data = d.data() as ArchivedCashFlowWeek;
        if (data && data.id) {
          archivesMap.set(data.id, data);
        }
      });
    } catch (e) {
      // Offline fallback
    }
  }

  const list = Array.from(archivesMap.values());
  list.sort((a, b) =>
    (b.endDate || b.archivedAt || "").localeCompare(a.endDate || a.archivedAt || "")
  );
  return list;
}

/**
 * Archive the current ending week, update previous snapshot baseline,
 * and initialize a frozen fresh week with pinned customers carried over.
 */
export async function archiveCurrentWeekAndStartNew(
  currentSummary: CashFlowSummary
): Promise<{ newSummary: CashFlowSummary; archivedWeek: ArchivedCashFlowWeek }> {
  const weekId = `week_${currentSummary.weekStart}_to_${currentSummary.weekEnd}`;
  const nowIso = new Date().toISOString();

  const archivedWeek: ArchivedCashFlowWeek = {
    id: weekId,
    weekLabel:
      currentSummary.weekLabel ||
      `دورة ${currentSummary.weekStart} إلى ${currentSummary.weekEnd}`,
    startDate: currentSummary.weekStart,
    endDate: currentSummary.weekEnd,
    archivedAt: nowIso,
    weeklyGoal: currentSummary.weeklyGoal,
    totalExpected: currentSummary.totalExpected,
    totalCollected: currentSummary.totalCollected,
    collectedFromSheet: currentSummary.collectedFromSheet,
    collectedFromTreasury: currentSummary.collectedFromTreasury,
    collectionRate: currentSummary.collectionRate,
    remainingToTarget: currentSummary.remainingToTarget,
    customerCount: currentSummary.customerCount,
    overdueCount: currentSummary.overdueCount,
    customers: currentSummary.customers || [],
  };

  // 1. Save to IndexedDB
  if (typeof window !== "undefined") {
    try {
      await set(`${CF_ARCHIVE_PREFIX}${weekId}`, archivedWeek);
    } catch (e) {
      console.warn("Failed to save to IndexedDB:", e);
    }
  }

  // 2. Save to Firestore
  if (typeof window !== "undefined") {
    try {
      const docRef = doc(db, "cashflow_archives", weekId);
      await setDoc(docRef, archivedWeek);
    } catch (e) {
      console.warn("Failed to sync archive to Firestore:", e);
    }
  }

  // 3. Set the ending week's figures as the new baseline for "Previous Snapshot"
  const overrides = getUserOverrides();
  const newPreviousWeek: CashFlowComparisonMetrics = {
    title: archivedWeek.weekLabel,
    target: archivedWeek.weeklyGoal,
    collected: archivedWeek.totalCollected,
    remainingToTarget: archivedWeek.remainingToTarget,
    achievementRate:
      archivedWeek.weeklyGoal > 0
        ? (archivedWeek.totalCollected / archivedWeek.weeklyGoal) * 100
        : 0,
    overdueCount: archivedWeek.overdueCount,
    expected: archivedWeek.totalExpected,
    remainingExpected: Math.max(
      0,
      archivedWeek.totalExpected - archivedWeek.totalCollected
    ),
    collectionRate:
      archivedWeek.totalExpected > 0
        ? (archivedWeek.totalCollected / archivedWeek.totalExpected) * 100
        : 0,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(
        "cashflow_previous_week_override",
        JSON.stringify(newPreviousWeek)
      );
    } catch (e) {}
  }

  // 4. Compute next week window (advancing forward)
  const currentEnd = new Date(currentSummary.weekEnd);
  const nextStart = new Date(currentEnd);
  nextStart.setDate(currentEnd.getDate() + 1);
  nextStart.setHours(0, 0, 0, 0);

  const nextWeekInfo = getCurrentCashFlowWeekWindow(nextStart);

  // 5. Build clean customers list for the new week from Master Data + Pinned Accounts
  // User Criteria:
  // - "يجيب كل الي عليهم مستحقات من شيت الماستر لحد يوم التلات الجي 17/11 وهكذا"
  // - "لازم يكون حسابه مش صفر يعني فيه رصيد"
  // - "الي متثبت له مبلغ متلعبش فيه خالص مش بيتغير ولا مبلغه بيتغير"
  const newCustomersMap = new Map<string, CashFlowCustomer>();

  // A) Carry over all pinned customers (preserving their exact fixed amounts)
  for (const c of currentSummary.customers) {
    const isPinned = c.isPinned || overrides.pinnedStatus?.[c.customerName] || false;
    if (isPinned) {
      const fixedAmt =
        overrides.fixedAmounts?.[c.customerName] !== undefined
          ? overrides.fixedAmounts[c.customerName]
          : c.expectedAmount;

      newCustomersMap.set(c.customerName, {
        ...c,
        index: newCustomersMap.size + 1,
        expectedAmount: fixedAmt,
        collectedFromSheet: 0,
        collectedFromTreasury: 0,
        totalCollected: 0,
        remaining: fixedAmt,
        rate: 0,
        status: fixedAmt > 0 ? "لم يسدد" : "لا يوجد استحقاق",
        treasuryTransactions: [],
        isPinned: true,
      });
    }
  }

  // Ensure Cash Customer is present and pinned
  const CASH_NAME = "عميل نقدي (كاش)";
  if (!newCustomersMap.has(CASH_NAME)) {
    const cashAmt = overrides.fixedAmounts?.[CASH_NAME] ?? 0;
    newCustomersMap.set(CASH_NAME, {
      index: newCustomersMap.size + 1,
      customerName: CASH_NAME,
      normalizedName: normalizeArabicName(CASH_NAME),
      currentBalance: 0,
      expectedAmount: cashAmt,
      collectedFromSheet: 0,
      collectedFromTreasury: 0,
      totalCollected: 0,
      dueDate: "",
      rate: cashAmt > 0 ? 0 : 1,
      status: cashAmt > 0 ? "لم يسدد" : "مكتمل",
      remaining: cashAmt,
      notes: overrides.notes?.[CASH_NAME] || "مبيعات وتحصيلات نقدية أسبوعية (كاش)",
      isPinned: true,
      treasuryTransactions: [],
    });
  }

  // B) Populate eligible customers from Master Data
  // Criteria: currentBalance > 0 AND (due date <= nextWeekEnd OR dueDate in past/empty)
  const masterList = currentSummary.masterCustomers || [];
  for (const m of masterList) {
    if (!m.customerName) continue;
    if (m.currentBalance <= 0) continue; // Must have balance > 0!

    const norm = normalizeArabicName(m.customerName);
    if (norm.includes("ريع نقل") || /^(ريع|نقل|سولار|مصاريف|مرتبات|كهرباء|مياه|صيانة|بوفيه|ادوات|ايجار|ايراد|ايرادات)$/.test(norm)) {
      continue;
    }

    if (newCustomersMap.has(m.customerName)) {
      // Update balance if already present as pinned
      const existing = newCustomersMap.get(m.customerName)!;
      existing.currentBalance = m.currentBalance;
      if (m.dueDate && !existing.dueDate) existing.dueDate = m.dueDate;
      continue;
    }

    // Check due date limit (up to next Tuesday)
    const isDueInNextWeek = !m.dueDate || m.dueDate <= nextWeekInfo.weekEnd;
    if (isDueInNextWeek) {
      const expAmt =
        overrides.fixedAmounts?.[m.customerName] !== undefined
          ? overrides.fixedAmounts[m.customerName]
          : m.currentBalance;

      const custNotes = overrides.notes?.[m.customerName] || m.notes || "";

      newCustomersMap.set(m.customerName, {
        index: newCustomersMap.size + 1,
        customerName: m.customerName,
        normalizedName: norm,
        currentBalance: m.currentBalance,
        expectedAmount: expAmt,
        collectedFromSheet: 0,
        collectedFromTreasury: 0,
        totalCollected: 0,
        dueDate: m.dueDate || "",
        rate: 0,
        status: expAmt > 0 ? "لم يسدد" : "لا يوجد استحقاق",
        remaining: expAmt,
        notes: custNotes,
        isPinned: Boolean(overrides.pinnedStatus?.[m.customerName]),
        treasuryTransactions: [],
      });
    }
  }

  // Also include any customer from ending week who still had unpaid remaining
  for (const c of currentSummary.customers) {
    if (!newCustomersMap.has(c.customerName) && c.remaining > 0 && c.currentBalance > 0) {
      newCustomersMap.set(c.customerName, {
        ...c,
        index: newCustomersMap.size + 1,
        collectedFromSheet: 0,
        collectedFromTreasury: 0,
        totalCollected: 0,
        remaining: c.expectedAmount,
        rate: 0,
        status: c.expectedAmount > 0 ? "لم يسدد" : "لا يوجد استحقاق",
        treasuryTransactions: [],
      });
    }
  }

  const newCustomers: CashFlowCustomer[] = Array.from(newCustomersMap.values()).map((c, idx) => ({
    ...c,
    index: idx + 1,
  }));

  // Clear cycle-specific temporary customer deletions and additions for the clean new week
  try {
    const freshOverrides = getUserOverrides();
    freshOverrides.deletedCustomers = [];
    freshOverrides.addedCustomers = [];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(freshOverrides));
  } catch (e) {}

  let totalExpected = 0;
  for (const c of newCustomers) {
    totalExpected += c.expectedAmount;
  }

  const weeklyGoal = currentSummary.weeklyGoal || 4000000;
  const growthRate =
    newPreviousWeek.collected > 0
      ? ((0 - newPreviousWeek.collected) / newPreviousWeek.collected) * 100
      : 0;

  const newSummary: CashFlowSummary = {
    reportDate: new Date().toISOString().split("T")[0],
    weekStart: nextWeekInfo.weekStart,
    weekEnd: nextWeekInfo.weekEnd,
    weekLabel: nextWeekInfo.weekLabel,
    weeklyGoal,
    totalExpected,
    totalCollected: 0,
    collectedFromSheet: 0,
    collectedFromTreasury: 0,
    collectionRate: 0,
    remainingToTarget: weeklyGoal,
    customerCount: newCustomers.length,
    overdueCount: 0,
    customers: newCustomers,
    unmatchedTreasuryTx: [],
    comparison: {
      lastWeek: newPreviousWeek,
      currentWeek: {
        title: nextWeekInfo.weekLabel,
        target: weeklyGoal,
        collected: 0,
        remainingToTarget: weeklyGoal,
        achievementRate: 0,
        overdueCount: 0,
        expected: totalExpected,
        remainingExpected: totalExpected,
        collectionRate: 0,
      },
      growthRate,
    },
    masterCustomerNames: currentSummary.masterCustomerNames || [],
    masterCustomers: currentSummary.masterCustomers || [],
  };

  // Persist the new active cycle locally
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("cashflow_active_cycle", JSON.stringify(newSummary));
    } catch (e) {}
  }

  return { newSummary, archivedWeek };
}
