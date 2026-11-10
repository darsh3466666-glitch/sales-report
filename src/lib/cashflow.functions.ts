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
  status: "مكتمل" | "جزئي" | "لم يسدد" | "فائض" | "لا يوجد استحقاق";
  remaining: number;
  notes: string;
  isPinned?: boolean;
  treasuryTransactions?: TreasuryIncomingTx[];
  isExtraCollector?: boolean;
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
  lastWeek: CashFlowComparisonMetrics;
  currentWeek: CashFlowComparisonMetrics;
  growthRate: number;
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
}

export interface CashFlowConfig {
  weeklyGoal: number;
  fixedAmounts: Record<string, number>;
  notes: Record<string, string>;
  customExpected?: Record<string, number>;
  pinnedCustomers?: Record<string, boolean>;
  previousWeek?: Partial<CashFlowComparisonMetrics>;
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
                  : rawConfig?.pinnedCustomers?.[custName] ?? false
              ),
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

    // Build Weekly Comparison Metrics (Executive Totals)
    const lastWeekCollected =
      rawConfig?.previousWeek?.collected !== undefined
        ? Number(rawConfig.previousWeek.collected)
        : 1702215;
    const lastWeekTarget =
      rawConfig?.previousWeek?.target !== undefined
        ? Number(rawConfig.previousWeek.target)
        : weeklyGoal;
    const lastWeekOverdue =
      rawConfig?.previousWeek?.overdueCount !== undefined
        ? Number(rawConfig.previousWeek.overdueCount)
        : 3;
    const lastWeekTitle =
      rawConfig?.previousWeek?.title || "اللقطة السابقة (قبل القائمة الجديدة)";

    const lastWeekExpected =
      rawConfig?.previousWeek?.expected !== undefined
        ? Number(rawConfig.previousWeek.expected)
        : 2451315;
    const lastWeekRemainingExpected =
      rawConfig?.previousWeek?.remainingExpected !== undefined
        ? Number(rawConfig.previousWeek.remainingExpected)
        : 749100;
    const lastWeekCollectionRate =
      rawConfig?.previousWeek?.collectionRate !== undefined
        ? Number(rawConfig.previousWeek.collectionRate)
        : 69.4;

    const lastWeekRemaining = Math.max(0, lastWeekTarget - lastWeekCollected);
    const lastWeekRate =
      lastWeekTarget > 0 ? (lastWeekCollected / lastWeekTarget) * 100 : 0;
    const currentWeekRate =
      weeklyGoal > 0 ? (totalCollected / weeklyGoal) * 100 : 0;
    const growthRate =
      lastWeekCollected > 0
        ? ((totalCollected - lastWeekCollected) / lastWeekCollected) * 100
        : 0;

    const comparison: CashFlowWeeklyComparison = {
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

  // 5. Build clean customers list for the new week (resetting collected, keeping expected and pinned status)
  const newCustomers: CashFlowCustomer[] = currentSummary.customers.map(
    (c, idx) => {
      const isPinned =
        c.isPinned || overrides.pinnedStatus?.[c.customerName] || false;
      const expectedAmount =
        isPinned && overrides.fixedAmounts?.[c.customerName] !== undefined
          ? overrides.fixedAmounts[c.customerName]
          : c.expectedAmount;

      return {
        ...c,
        index: idx + 1,
        collectedFromSheet: 0,
        collectedFromTreasury: 0,
        totalCollected: 0,
        remaining: expectedAmount,
        rate: 0,
        status: expectedAmount > 0 ? "لم يسدد" : "لا يوجد استحقاق",
        treasuryTransactions: [],
        isPinned,
      };
    }
  );

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
  };

  // Persist the new active cycle locally
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("cashflow_active_cycle", JSON.stringify(newSummary));
    } catch (e) {}
  }

  return { newSummary, archivedWeek };
}
