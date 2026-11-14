import { normalizeArabicName } from "./excel-parser.functions";
import { get, set, keys } from "idb-keyval";
import { collection, doc, getDocs, setDoc, getDoc } from "firebase/firestore";
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
  collectedCash?: number;
  collectedBank?: number;
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
  date?: string;
  receipt?: string;
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
  collectedCash: number;
  collectedBank: number;
  collectionRate: number;
  remainingToTarget: number;
  customerCount: number;
  overdueCount: number;
  customers: CashFlowCustomer[];
  unmatchedTreasuryTx: TreasuryIncomingTx[];
  weeklyTreasuryTransactions?: TreasuryIncomingTx[];
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
  const hours = d.getHours();

  let daysToWed = 0;
  if (day === 2 && hours >= 19) {
    // Tuesday after 7:00 PM -> automatically transition to the new week cycle starting tomorrow Wednesday!
    daysToWed = -1;
  } else if (day >= 3) {
    // Wed (3), Thu (4), Fri (5), Sat (6) -> started this week's Wednesday
    daysToWed = day - 3;
  } else {
    // Sun (0), Mon (1), Tue (2) before 7 PM -> started last week's Wednesday
    daysToWed = day + 4;
  }

  const startDate = new Date(d);
  startDate.setDate(d.getDate() - daysToWed);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6); // ends following Tuesday
  endDate.setHours(23, 59, 59, 999);

  const fmt = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const dayNum = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${dayNum}`;
  };
  
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

const GENERIC_PREFIXES = new Set([
  "مزرعه",
  "مزرعة",
  "محل",
  "شركه",
  "شركة",
  "مصنع",
  "محطه",
  "محطة",
  "توكيل",
  "معرض",
  "عميل",
  "حساب",
  "مكتب",
]);

export function cleanCustomerMatchingName(s: string): string {
  if (!s) return "";
  let res = s
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[يى]/g, "ي")
    .replace(/ذ/g, "ز") // Egyptian colloquial typing: ابوذيد -> ابوزيد
    .replace(/ظ/g, "ض")
    .replace(/[\s\-_]+/g, " ")
    .replace(/عيد\s*التواب/g, "عبدالتواب")
    .replace(/عبد\s+/g, "عبد")
    .replace(/ابو\s+/g, "ابو")
    .replace(/بن\s+/g, "بن");
  const parenIdx = res.indexOf("(");
  if (parenIdx >= 0) res = res.slice(0, parenIdx);
  const dashIdx = res.indexOf(" - ");
  if (dashIdx >= 0) res = res.slice(0, dashIdx);
  return res.trim();
}

/**
 * Enhanced matching between Treasury Description and Customer Name.
 * High-precision algorithm ensures common Egyptian nicknames, colloquial typing (ابوذيد vs ابو زيد),
 * compound prefixes (عبدالـ vs عبد الـ), and parenthesized notes match accurately, while entities
 * can NEVER be mixed up or falsely matched.
 */
export const isCashNorm = (s: string) => {
  if (!s) return false;
  const noSpace = s.replace(/\s+/g, "");
  return (
    /^(نقدي|نقدى|كاش|نقديكاش|عميلنقدي|عميلنقدى|عميلكاش|عميلنقديكاش)$/.test(noSpace) ||
    /^(عميلنقدي|نقديكاش)/.test(noSpace) ||
    (/نقدي|كاش/.test(s) && !/(ابو|احمد|محمد|علي|محمود|حمزة|مرسي|اسامه|يونس)/.test(s))
  );
};

export function matchTreasuryDescriptionToCustomer(
  desc: string,
  customerName: string
): boolean {
  if (!desc || !customerName) return false;
  const nd = normalizeArabicName(desc);
  const nc = normalizeArabicName(customerName);
  if (!nd || !nc) return false;

  // 1. Exact full normalized match (e.g. "مزرعة السلام" === "مزرعه السلام")
  if (nd === nc) return true;

  // 2. Generic cash matching
  const isDescCash = isCashNorm(nd);
  const isCustCash = isCashNorm(nc);
  if (isDescCash && isCustCash) return true;
  if (isDescCash || isCustCash) return false;

  // 3. Honorific & entity prefixes at start only: "المعلم عبدالفتاح ربيع" === "عبدالفتاح ربيع", "مزرعه الخيرات" === "الخيرات"
  const stripPrefixHonorific = (s: string) =>
    s
      .replace(
        /^(المعلم|حاج|الحاج|مهندس|المهندس|استاذ|الاستاذ|شيخ|الشيخ|دكتور|د|مزرعة|مزرعه|شركة|شركه|محطة|محطه|مصنع|معمل|معرض)\s+/g,
        ""
      )
      .trim();

  const sd = stripPrefixHonorific(nd);
  const sc = stripPrefixHonorific(nc);
  if (sd && sc && sd === sc) return true;

  // 4. Clean match (handling colloquial ذ/ز, compound prefixes عبد/ابو, and trailing annotations)
  const cd = cleanCustomerMatchingName(desc);
  const cc = cleanCustomerMatchingName(customerName);
  if (cd && cc && cd === cc) return true;

  // 5. Match full name ignoring parenthesized nickname/branch annotation
  const cleanParens = (s: string) => {
    const idx = s.indexOf("(");
    return idx >= 0 ? s.slice(0, idx).trim() : s;
  };
  const bd = normalizeArabicName(cleanParens(desc));
  const bc = normalizeArabicName(cleanParens(customerName));
  if (bd && bc && (bd === bc || sd === bc || bd === sc)) return true;

  // 6. STRICT ENTITY GUARD:
  const isEntity = Array.from(GENERIC_PREFIXES).some(
    (k) => nd.includes(k) || nc.includes(k)
  );
  if (isEntity) return false;

  // 7. Full personal name prefix matching on clean words (must have at least 2 full words):
  // e.g. "محمود ابوذيد" matches "محمود ابو زيد - الهداهده"
  // "اسامه علي" matches "اسامه علي عبد الكريم"
  // "احمد راغب" matches "احمد راغب(الهداهدة)"
  // "محمد يونس" matches "محمد يونس عبد اللطيف(قلمشاه)"
  const cdWords = cd.split(" ").filter((w) => w.length >= 2);
  if (cdWords.length >= 2) {
    if (cc.startsWith(cd + " ") || cc === cd) {
      return true;
    }
  }

  const dWords = nd.split(" ").filter((w) => w.length >= 2);
  if (dWords.length >= 2) {
    if (nc.startsWith(nd + " ") || bc.startsWith(nd + " ")) {
      return true;
    }
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
    const reportDate = String(data?.reportDate || "").trim();
    if (data?.transactions?.incoming && Array.isArray(data.transactions.incoming)) {
      return data.transactions.incoming.map((tx: any) => ({
        amount: Number(tx.amount) || 0,
        description: String(tx.description || ""),
        type: String(tx.type || ""),
        date: String(tx.date || reportDate || ""),
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

export interface ActiveCashFlowCycleState {
  cycleId: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  weeklyGoal: number;
  customers: CashFlowCustomer[];
  archivedTxSignatures?: string[];
  weeklyTreasuryTransactions?: TreasuryIncomingTx[];
  updatedAt: string;
}

export const ACTIVE_CYCLE_STORAGE_KEY = "cashflow_active_cycle_state_v7";
export const FIRESTORE_CF_COLLECTION = "cashflow_settings";
export const FIRESTORE_CF_CYCLE_DOC = "active_cycle";
export const FIRESTORE_CF_OVERRIDES_DOC = "user_overrides";

/**
 * Fetch remote active cycle state from Firestore cloud database.
 * Enables 100% real-time synchronization across Mobile, PC, and Incognito browsers.
 */
export async function fetchRemoteCycleState(): Promise<ActiveCashFlowCycleState | null> {
  try {
    const docRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_CYCLE_DOC);
    const snap = await Promise.race([
      getDoc(docRef),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 2500)),
    ]);
    if (snap && snap.exists()) {
      const data = snap.data() as ActiveCashFlowCycleState;
      if (data && data.cycleId && Array.isArray(data.customers) && data.customers.length > 0) {
        return data;
      }
    }
    return null;
  } catch (e) {
    console.warn("Could not fetch remote cycle state from Firestore:", e);
    return null;
  }
}

/**
 * Save active cycle state to Firestore cloud database so all devices stay identical.
 */
export async function saveRemoteCycleState(state: ActiveCashFlowCycleState): Promise<void> {
  if (!state) return;
  try {
    const docRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_CYCLE_DOC);
    await Promise.race([
      setDoc(docRef, state, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore save timeout")), 3000)),
    ]);
  } catch (e) {
    console.warn("Could not save remote cycle state to Firestore:", e);
  }
}

/**
 * Fetch remote user overrides (notes, custom amounts, pins, additions, deletions) from Firestore.
 */
export async function fetchRemoteUserOverrides(): Promise<UserOverrides | null> {
  try {
    const docRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_OVERRIDES_DOC);
    const snap = await Promise.race([
      getDoc(docRef),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 2500)),
    ]);
    if (snap && snap.exists()) {
      return snap.data() as UserOverrides;
    }
    return null;
  } catch (e) {
    console.warn("Could not fetch remote overrides from Firestore:", e);
    return null;
  }
}

/**
 * Save user overrides to Firestore cloud database so notes and expected amounts are never lost.
 */
export async function saveRemoteUserOverrides(overrides: UserOverrides): Promise<void> {
  if (!overrides) return;
  try {
    const docRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_OVERRIDES_DOC);
    await Promise.race([
      setDoc(docRef, overrides, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore save timeout")), 3000)),
    ]);
  } catch (e) {
    console.warn("Could not save remote overrides to Firestore:", e);
  }
}

export function getActiveCycleState(): ActiveCashFlowCycleState | null {
  if (typeof window === "undefined") return null;
  try {
    // Purge old cached state versions to enforce clean bank vs cash transaction breakdown and restore all weekly customers
    localStorage.removeItem("cashflow_active_cycle_state_v6");
    localStorage.removeItem("cashflow_active_cycle_state_v5");
    localStorage.removeItem("cashflow_active_cycle_state_v4");
    localStorage.removeItem("cashflow_active_cycle_state_v3");
    localStorage.removeItem("cashflow_active_cycle_state_v2");
    localStorage.removeItem("cashflow_active_cycle_state_v1");
    localStorage.removeItem("cashflow_active_cycle_state");

    const raw = localStorage.getItem(ACTIVE_CYCLE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read active cycle state:", e);
    return null;
  }
}

export function saveActiveCycleState(state: ActiveCashFlowCycleState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_CYCLE_STORAGE_KEY, JSON.stringify(state));
    // Asynchronously push to cloud Firestore so Mobile and Incognito browsers mirror this state instantly!
    saveRemoteCycleState(state).catch(() => {});
  } catch (e) {
    console.error("Failed to save active cycle state:", e);
  }
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
 * Synchronize remote Firestore overrides into LocalStorage cache.
 */
export function syncRemoteOverridesToLocal(remote: UserOverrides) {
  if (typeof window === "undefined" || !remote) return;
  try {
    const local = getUserOverrides();
    const merged: UserOverrides = {
      fixedAmounts: { ...local.fixedAmounts, ...(remote.fixedAmounts || {}) },
      notes: { ...local.notes, ...(remote.notes || {}) },
      pinnedStatus: { ...local.pinnedStatus, ...(remote.pinnedStatus || {}) },
      deletedCustomers: Array.from(new Set([...(local.deletedCustomers || []), ...(remote.deletedCustomers || [])])),
      addedCustomers: remote.addedCustomers && remote.addedCustomers.length > 0 ? remote.addedCustomers : (local.addedCustomers || []),
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.warn("Failed to sync remote overrides to local:", e);
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
    saveRemoteUserOverrides(current).catch(() => {});
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
    saveRemoteUserOverrides(current).catch(() => {});
  } catch (err) {
    console.error("Failed to save manually added customer:", err);
  }
}

/**
 * Save customer override to LocalStorage and cloud Firestore safely.
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
    saveRemoteUserOverrides(current).catch(() => {});

    // Also update customer in active cycle state if present
    const cycle = getActiveCycleState();
    if (cycle && Array.isArray(cycle.customers)) {
      const target = cycle.customers.find((c) => c.customerName === customerName);
      if (target) {
        if (updates.expectedAmount !== undefined) target.expectedAmount = updates.expectedAmount;
        if (updates.notes !== undefined) target.notes = updates.notes;
        if (updates.isPinned !== undefined) target.isPinned = updates.isPinned;
        cycle.updatedAt = new Date().toISOString();
        saveActiveCycleState(cycle);
      }
    }
  } catch (err) {
    console.error("Failed to save cashflow override:", err);
  }
}

/**
 * Fallback to identify clients who pay via bank transfers if their transaction type was not captured.
 */
export function isBankCustomer(customerName: string, notes?: string): boolean {
  const normName = normalizeArabicName(customerName || "").toLowerCase();
  const normNotes = String(notes || "").toLowerCase();

  return (
    normName.includes("يونس") ||
    normName.includes("عبدالتواب") ||
    normName.includes("عبد التواب") ||
    normName.includes("عيد التواب") ||
    normName.includes("ميدوم") ||
    normName.includes("ايه بي ديري") ||
    normName.includes("ديري") ||
    normName.includes("الخيرات") ||
    normName.includes("بنك") ||
    normNotes.includes("بنك") ||
    normNotes.includes("تحويل")
  );
}

/**
 * Determines whether a transaction payment type or description indicates a bank deposit/transfer vs pure physical cash in treasury.
 * In this system:
 * - Pure cash types are strictly: "كاش", "نقدي", "نقدية", "خزينة" (or English "cash").
 * - Any bank account name ("ب مصر", "تنمية", "زراعي", "اهلي", "cib", "qnb", etc.) or anything with "بنك" / "تحويل" is BANK!
 * - If customer is a known bank payer (e.g. عبدالتواب احمد, ايه بي ديري, الخيرات, يونس), payment is ALWAYS BANK!
 * - Any payment type that is NOT pure cash is treated as a bank deposit.
 */
export function isBankPayment(typeOrDesc?: string, description?: string): boolean {
  const normType = String(typeOrDesc || "").trim().toLowerCase();
  const normDesc = String(description || "").trim().toLowerCase();

  // 1. Explicit cash keywords on transaction type take highest precedence:
  // If the transaction is recorded as pure cash (كاش, نقدي, خزينة), and does not mention a bank account/transfer, it IS cash!
  const isPureCash =
    /^(كاش|نقدي|نقدى|نقدية|نقديه|خزينة|خزينه|cash)$/i.test(normType) &&
    !/بنك|bank|تحويل|ايداع|إيداع|شيك|سويفت|swift|انستاباي|instapay|ب[\s_.]?مصر|تنمي[ةه]|زراع[يى]|[أا]هل[يى]|قاهر[ةه]|cib|qnb/i.test(normDesc);
  if (isPureCash) return false;

  // 2. Known bank names, abbreviations, or banking instruments
  const bankPatterns = [
    /بنك/,
    /bank/i,
    /ب[\s_.]?مصر/,         // ب مصر / بنك مصر
    /تنمي[ةه]/,            // تنمية / تنميه (بنك التنمية)
    /زراع[يى]/,            // زراعي (البنك الزراعي)
    /[أا]هل[يى]/,          // أهلي / اهلي (البنك الأهلي)
    /قاهر[ةه]/,            // قاهرة (بنك القاهرة)
    /[إا]سكندري[ةه]/,      // إسكندرية (بنك الإسكندرية)
    /cib/i,                // CIB
    /تجار[يى]/,            // تجاري دولي
    /qnb/i,                // QNB
    /قطر/,                 // قطر الوطني
    /فيصل/,                // بنك فيصل
    /برك[ةه]/,             // بنك البركة
    /[أا]بو[\s_.]?ظب[يى]/, // أبو ظبي
    /adib/i,
    /عرب[يى][\s_.]?[أا]فريق[يى]/,
    /aaib/i,
    /تحويل/,
    /[إا]يداع/,
    /شيك/,
    /سويفت|swift/i,
    /انستاباي|instapay/i,
    /حساب/
  ];

  for (const pat of bankPatterns) {
    if (pat.test(normType) || pat.test(normDesc)) {
      return true;
    }
  }

  // 3. Fallback: if type is present and is NOT any form of cash, it is a bank deposit
  if (normType && !/^(كاش|نقدي|نقدى|نقدية|نقديه|خزينة|خزينه|cash)$/i.test(normType)) {
    return true;
  }

  return false;
}

/**
 * Helper to calculate cumulative breakdown of collected amounts into pure cash and bank transfers.
 */
export function calculateCashAndBankBreakdown(customers: CashFlowCustomer[]): {
  collectedCash: number;
  collectedBank: number;
} {
  let collectedCash = 0;
  let collectedBank = 0;

  for (const cust of customers) {
    let cCash = 0;
    let cBank = 0;

    if (Array.isArray(cust.treasuryTransactions) && cust.treasuryTransactions.length > 0) {
      for (const tx of cust.treasuryTransactions) {
        if (isBankPayment(tx.type, tx.description)) {
          cBank += tx.amount || 0;
        } else {
          cCash += tx.amount || 0;
        }
      }
    } else if (cust.collectedFromTreasury > 0) {
      if (isBankCustomer(cust.customerName, cust.notes)) {
        cBank += cust.collectedFromTreasury;
      } else {
        cCash += cust.collectedFromTreasury;
      }
    }

    const uncoveredSheet = Math.max(
      0,
      (cust.collectedFromSheet || 0) - (cust.collectedFromTreasury || 0)
    );
    if (uncoveredSheet > 0) {
      if (isBankCustomer(cust.customerName, cust.notes)) {
        cBank += uncoveredSheet;
      } else {
        cCash += uncoveredSheet;
      }
    }

    collectedCash += cCash;
    collectedBank += cBank;
  }

  return { collectedCash, collectedBank };
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

  const { collectedCash, collectedBank } = calculateCashAndBankBreakdown(remainingCusts);

  const weeklyGoal = summary.weeklyGoal || 4000000;
  const remainingToTarget = Math.max(0, weeklyGoal - totalCollected);
  const collectionRate = totalExpected > 0 ? totalCollected / totalExpected : 0;

  let comparison = summary.comparison;
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
        expected: totalExpected,
        remainingExpected: Math.max(0, totalExpected - totalCollected),
        collectionRate: totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0,
      },
      growthRate,
    };
  }

  try {
    const cycle = getActiveCycleState();
    if (cycle) {
      cycle.customers = remainingCusts;
      cycle.updatedAt = new Date().toISOString();
      saveActiveCycleState(cycle);
    }
  } catch (e) {}

  return {
    ...summary,
    totalExpected,
    totalCollected,
    collectedFromSheet,
    collectedFromTreasury,
    collectedCash,
    collectedBank,
    collectionRate,
    remainingToTarget,
    customerCount: remainingCusts.length,
    overdueCount,
    customers: remainingCusts,
    comparison,
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

  const { collectedCash, collectedBank } = calculateCashAndBankBreakdown(updatedCusts);

  const weeklyGoal = summary.weeklyGoal || 4000000;
  const remainingToTarget = Math.max(0, weeklyGoal - totalCollected);
  const collectionRate = totalExpected > 0 ? totalCollected / totalExpected : 0;

  let comparison = summary.comparison;
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
        expected: totalExpected,
        remainingExpected: Math.max(0, totalExpected - totalCollected),
        collectionRate: totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0,
      },
      growthRate,
    };
  }

  try {
    const cycle = getActiveCycleState();
    if (cycle) {
      cycle.customers = updatedCusts;
      cycle.updatedAt = new Date().toISOString();
      saveActiveCycleState(cycle);
    }
  } catch (e) {}

  return {
    ...summary,
    totalExpected,
    totalCollected,
    collectedFromSheet,
    collectedFromTreasury,
    collectedCash,
    collectedBank,
    collectionRate,
    remainingToTarget,
    customerCount: updatedCusts.length,
    overdueCount,
    customers: updatedCusts,
    comparison,
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

    const remaining = Math.max(0, expectedAmount - totalCollected);
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

  const { collectedCash, collectedBank } = calculateCashAndBankBreakdown(updatedCustomers);

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

  try {
    const cycle = getActiveCycleState();
    if (cycle) {
      cycle.customers = updatedCustomers;
      cycle.updatedAt = new Date().toISOString();
      saveActiveCycleState(cycle);
    }
  } catch (e) {}

  return {
    ...currentSummary,
    totalExpected,
    totalCollected,
    collectedFromSheet,
    collectedFromTreasury,
    collectedCash,
    collectedBank,
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
  let salesReportsList: any[] = [];
  const allSalesCustomersMap = new Map<string, any>();

  if (typeof window === "undefined") {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const pubPath = path.resolve(process.cwd(), "public");
      const distPath = path.resolve(process.cwd(), "dist");
      const targetDir = fs.existsSync(pubPath) ? pubPath : distPath;

      if (fs.existsSync(path.join(targetDir, "cashflow_data.json"))) {
        rawData = JSON.parse(
          fs.readFileSync(path.join(targetDir, "cashflow_data.json"), "utf8")
        );
      }
      if (fs.existsSync(path.join(targetDir, "cashflow_config.json"))) {
        rawConfig = JSON.parse(
          fs.readFileSync(path.join(targetDir, "cashflow_config.json"), "utf8")
        );
      }
      if (fs.existsSync(path.join(targetDir, "sales_data.json"))) {
        const sData = JSON.parse(
          fs.readFileSync(path.join(targetDir, "sales_data.json"), "utf8")
        );
        if (Array.isArray(sData)) {
          salesReportsList = sData;
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
  } else {
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

    try {
      const sRes = await fetch(`${basePath}sales_data.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (sRes.ok) {
        const sData = await sRes.json();
        if (Array.isArray(sData)) {
          salesReportsList = sData;
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
  }

  try {
    const [liveTreasuryTx, remoteCycle, remoteOverrides] = await Promise.all([
      fetchLiveTreasuryIncoming(),
      fetchRemoteCycleState(),
      fetchRemoteUserOverrides(),
    ]);

    if (remoteOverrides) {
      syncRemoteOverridesToLocal(remoteOverrides);
    }
    const overrides = getUserOverrides();

    const weekInfo = getCurrentCashFlowWeekWindow(options?.referenceDate || rawData?.reportDate || new Date());
    const currentCycleId = `week_${weekInfo.weekStart}_to_${weekInfo.weekEnd}`;

    const localSavedCycle = getActiveCycleState();
    const isRemoteValid = Boolean(
      remoteCycle &&
      (remoteCycle.cycleId === currentCycleId ||
        (!remoteCycle.weekEnd || remoteCycle.weekEnd >= weekInfo.weekStart)) &&
      Array.isArray(remoteCycle.customers) &&
      remoteCycle.customers.length > 0
    );

    const savedCycle = isRemoteValid ? remoteCycle : localSavedCycle;
    if (isRemoteValid && remoteCycle && typeof window !== "undefined") {
      try {
        localStorage.setItem(ACTIVE_CYCLE_STORAGE_KEY, JSON.stringify(remoteCycle));
      } catch (e) {}
    }

    const CASH_NAME = "عميل نقدي (كاش)";
    let baseCustomers: CashFlowCustomer[] = [];

    // Index master customer names from raw base data
    const masterNamesSet = new Set<string>();
    if (rawData?.masterCustomerNames && Array.isArray(rawData.masterCustomerNames)) {
      for (const name of rawData.masterCustomerNames) {
        masterNamesSet.add(normalizeArabicName(name));
      }
    }

    const isSavedCycleValid = Boolean(
      savedCycle &&
      (savedCycle.cycleId === currentCycleId ||
        (!savedCycle.weekEnd || savedCycle.weekEnd >= weekInfo.weekStart)) &&
      Array.isArray(savedCycle.customers) &&
      savedCycle.customers.length > 0
    );

    if (isSavedCycleValid && savedCycle) {
      // 1. REUSE ACTIVE CYCLE BASELINE - DO NOT RE-EXTRACT FROM RAW DATA!
      // This strictly enforces user rule:
      // "التحديث التلقائي قولت يحصل مرة واحدة بس بالنسبة للعملاء والمتوقع منهم وده لما نبدأ ف الاسبوع الجديد"
      // Expected amounts, pinned status, notes, added customers, and deleted customers remain strictly frozen!
      baseCustomers = savedCycle.customers.map((c) => {
        const expectedAmount =
          overrides.fixedAmounts?.[c.customerName] !== undefined
            ? overrides.fixedAmounts[c.customerName]
            : c.expectedAmount;

        let notes =
          overrides.notes?.[c.customerName] !== undefined
            ? overrides.notes[c.customerName]
            : c.notes || "";

        // Strictly remove synthetic "سداد وارد غير متوقع" note as instructed by user!
        if (notes && notes.includes("سداد وارد غير متوقع")) {
          notes = "";
        }

        const isPinned =
          overrides.pinnedStatus?.[c.customerName] !== undefined
            ? overrides.pinnedStatus[c.customerName]
            : Boolean(c.isPinned);

        const rawCust = (rawData?.customers || []).find(
          (rc: any) =>
            rc.customerName === c.customerName ||
            rc.normalizedName === c.normalizedName
        );
        const collectedFromSheet = Math.max(
          Number(c.collectedFromSheet) || 0,
          Number(rawCust?.collectedFromSheet) || 0
        );

        return {
          ...c,
          expectedAmount,
          collectedFromSheet,
          notes,
          isPinned,
          collectedFromTreasury: 0,
          treasuryTransactions: [] as TreasuryIncomingTx[],
        };
      });

      // Clean up any stale/erroneous unexpected customer that was falsely matched before (e.g. "مزرعة المهندس" instead of "مزرعه السلام")
      baseCustomers = baseCustomers.filter((c) => {
        if (
          c.customerName === "مزرعة المهندس" &&
          (c.isUnexpectedInflow || c.notes?.includes("سداد وارد غير متوقع"))
        ) {
          return false;
        }
        return true;
      });
    } else {
      // 2. INITIALIZE FRESH BASELINE FOR THE CYCLE (ONCE AT CYCLE START / RESET)
      baseCustomers = (rawData?.customers || []).map((c: any, idx: number) => {
        const name = c.customerName || "";
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
      });

      // Strict validation: Filter out < 5000, settled, and next-week unpaid customers
      baseCustomers = baseCustomers.filter((c) => {
        if (c.customerName === CASH_NAME || c.customerName.includes("نقدي")) return true;
        if (c.currentBalance < 5000) return false;
        if (c.notes?.includes("عميل خالص") || c.notes?.includes("تم التصفية")) return false;
        const norm = normalizeArabicName(c.customerName);
        if (norm.includes("ريع نقل") || /^(ريع|نقل|سولار|مصاريف|مرتبات|كهرباء|مياه|صيانة|بوفيه|ادوات|ايجار|ايراد|ايرادات)$/.test(norm)) {
          return false;
        }
        if (masterNamesSet.size > 0 && !masterNamesSet.has(norm)) {
          return false;
        }

        const isDueThisWeekOrPast = !c.dueDate || c.dueDate <= weekInfo.weekEnd;
        const hasPaid = (c.collectedFromSheet > 0 || c.collectedFromTreasury > 0);

        if (!isDueThisWeekOrPast && !hasPaid) {
          return false;
        }

        if (!isDueThisWeekOrPast && hasPaid) {
          if (overrides.fixedAmounts?.[c.customerName] !== undefined) {
            c.expectedAmount = Number(overrides.fixedAmounts[c.customerName]) || 0;
          } else if (rawConfig?.fixedAmounts?.[c.customerName] !== undefined) {
            c.expectedAmount = Number(rawConfig.fixedAmounts[c.customerName]) || 0;
          } else {
            c.expectedAmount = 0;
          }
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
    }

    // Ensure permanent Cash Customer exists and is pinned weekly
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

    // Determine active week cycle boundaries for treasury transaction isolation
    const effectiveWeekStart = (isSavedCycleValid && savedCycle?.weekStart) ? savedCycle.weekStart : weekInfo.weekStart;
    const effectiveWeekEnd = (isSavedCycleValid && savedCycle?.weekEnd) ? savedCycle.weekEnd : weekInfo.weekEnd;

    // Track signatures of treasury transactions from genuinely previous/archived cycles
    const archivedTxSet = new Set<string>();
    if (savedCycle && savedCycle.weekEnd && savedCycle.weekEnd < weekInfo.weekStart) {
      // ONLY seal transactions that genuinely belong to an old, archived past week!
      for (const c of savedCycle.customers || []) {
        for (const tx of c.treasuryTransactions || []) {
          const txDate = tx.date || savedCycle.weekEnd;
          if (txDate < weekInfo.weekStart) {
            const sig = `${txDate}_${tx.description}_${tx.amount}_${tx.type}`;
            archivedTxSet.add(sig);
          }
        }
      }
    }

    // Build multi-day cumulative weekly treasury transactions pool for this active cycle
    // (Accumulates transactions across Wednesday through Tuesday so daily rollover never wipes previous days!)
    const weeklyTxMap = new Map<string, TreasuryIncomingTx>();

    const addTxToWeeklyPool = (tx: TreasuryIncomingTx) => {
      if (!tx) return;
      const amt = Number(tx.amount) || 0;
      if (amt <= 0) return;
      const desc = String(tx.description || "").trim();
      if (!desc) return;
      const typ = String(tx.type || "").trim();
      let d = String(tx.date || "").trim();

      // Ensure transaction belongs strictly to this active week window if date is present
      if (d) {
        if (d < effectiveWeekStart || d > effectiveWeekEnd) return;
      }

      const receiptNo = String(tx.receipt || "").trim();
      const isNormCash = /^(نقدي|نقدى|كاش|عميل نقدي|عميل نقدى)$/.test(desc);
      const normDesc = isNormCash ? "نقدي" : normalizeArabicName(desc);

      // Check if an existing transaction in the pool already represents this payment
      for (const existing of weeklyTxMap.values()) {
        const existDate = (existing.date || effectiveWeekStart).trim();
        const curDate = (d || effectiveWeekStart).trim();
        if (existDate !== curDate) continue;

        const existIsCash = /^(نقدي|نقدى|كاش|عميل نقدي|عميل نقدى)$/.test(existing.description);
        const existNormDesc = existIsCash ? "نقدي" : normalizeArabicName(existing.description);
        const isSameCustomer = (isNormCash && existIsCash) || (existNormDesc === normDesc);

        if (isSameCustomer && Math.abs(existing.amount - amt) < 1) {
          // If both have receipts and they are distinct receipts (e.g. K3801 vs K3807), keep both!
          if (existing.receipt && receiptNo && existing.receipt !== receiptNo) {
            continue;
          }
          // Otherwise, it's the exact same transaction being synced across seeds/localStorage
          if (receiptNo && !existing.receipt) {
            existing.receipt = receiptNo;
          }
          if (isBankPayment(typ, desc)) {
            existing.type = typ || "بنك";
          }
          return;
        }
      }

      const sig = receiptNo
        ? `rcpt_${receiptNo}`
        : `${d || effectiveWeekStart}_${normDesc}_${amt}_${weeklyTxMap.size}`;

      // A transaction belonging to the current active week can NEVER be dropped by archivedTxSet!
      const isCurrentWeek = (!d || (d >= effectiveWeekStart && d <= effectiveWeekEnd));
      if (!isCurrentWeek && archivedTxSet.has(sig)) return;

      weeklyTxMap.set(sig, {
        amount: amt,
        description: desc,
        type: typ,
        date: d || effectiveWeekStart,
        receipt: receiptNo || undefined,
      });
    };

    // 1a. From static verified seed in cashflow_data.json
    if (Array.isArray(rawData?.weeklyTreasuryTransactions)) {
      for (const tx of rawData.weeklyTreasuryTransactions) {
        addTxToWeeklyPool(tx);
      }
    }

    // 1b. From previously saved active cycle state in localStorage
    if (isSavedCycleValid && Array.isArray(savedCycle?.weeklyTreasuryTransactions)) {
      for (const tx of savedCycle.weeklyTreasuryTransactions) {
        addTxToWeeklyPool(tx);
      }
    }

    // 1c. Safeguard: restore transactions previously attached to customers in savedCycle
    if (isSavedCycleValid && Array.isArray(savedCycle?.customers)) {
      for (const c of savedCycle.customers) {
        if (Array.isArray(c.treasuryTransactions)) {
          for (const tx of c.treasuryTransactions) {
            addTxToWeeklyPool(tx);
          }
        }
      }
    }

    // 1d. From live incoming transactions fetched right now from Treasury dashboard
    if (Array.isArray(liveTreasuryTx)) {
      for (const tx of liveTreasuryTx) {
        addTxToWeeklyPool(tx);
      }
    }

    // 1e. From daily sales and collection reports in sales_data.json
    // Any customer with collected_amount > 0 in a report within this active week is an authentic verified collection!
    for (const rep of salesReportsList) {
      const repDate = String(rep.report?.report_date || rep.date || rep.report_date || "").trim();
      if (repDate && repDate >= effectiveWeekStart && repDate <= effectiveWeekEnd) {
        for (const sc of rep.customers || []) {
          const amt = Number(sc.collected_amount) || 0;
          if (amt <= 0) continue;
          const cName = String(sc.customer_name || "").trim();
          if (!cName) continue;

          // Check if this collection was already captured in weeklyTxMap (e.g. from Treasury or seed)
          let alreadyCaptured = false;
          const normCName = normalizeArabicName(cName);

          if (isCashNorm(normCName)) {
            const existingCashTotalOnDate = Array.from(weeklyTxMap.values())
              .filter(
                (t) =>
                  (t.date === repDate || !t.date) &&
                  isCashNorm(normalizeArabicName(t.description))
              )
              .reduce((sum, t) => sum + t.amount, 0);
            if (existingCashTotalOnDate >= amt || Math.abs(existingCashTotalOnDate - amt) < 1) {
              alreadyCaptured = true;
            } else if (existingCashTotalOnDate > 0 && amt > existingCashTotalOnDate) {
              // Deduplication delta: capture only the unrecorded portion so individual receipts are never duplicated
              const delta = amt - existingCashTotalOnDate;
              alreadyCaptured = true;
              addTxToWeeklyPool({
                amount: delta,
                description: cName,
                type: "خزينة",
                date: repDate || effectiveWeekStart,
              });
            }
          }

          if (!alreadyCaptured) {
            for (const existingTx of weeklyTxMap.values()) {
              const existingDate = (existingTx.date || "").trim();
              const sameDate = !existingDate || !repDate || existingDate === repDate;
              if (sameDate && Math.abs(existingTx.amount - amt) < 1) {
                const normDesc = normalizeArabicName(existingTx.description);
                if (
                  normDesc === normCName ||
                  matchTreasuryDescriptionToCustomer(existingTx.description, cName) ||
                  matchTreasuryDescriptionToCustomer(cName, existingTx.description)
                ) {
                  alreadyCaptured = true;
                  break;
                }
              }
            }
          }

          if (!alreadyCaptured) {
            const isBank = isBankCustomer(cName);
            addTxToWeeklyPool({
              amount: amt,
              description: cName,
              type: isBank ? "بنك" : "خزينة",
              date: repDate || effectiveWeekStart,
            });
          }
        }
      }
    }

    const cycleTreasuryTx = Array.from(weeklyTxMap.values());

    // Match live Treasury incoming transactions with customers
    const unmatchedTreasuryTx: TreasuryIncomingTx[] = [];

    for (const tx of cycleTreasuryTx) {
      let matched = false;
      for (const cust of baseCustomers) {
        if (matchTreasuryDescriptionToCustomer(tx.description, cust.customerName)) {
          // Prevent attaching duplicate transaction with same amount and date to the same customer
          const isCash = isCashNorm(normalizeArabicName(cust.customerName));
          const alreadyHasTx = (cust.treasuryTransactions || []).some((t) => {
            if (t.receipt && tx.receipt) {
              return t.receipt === tx.receipt;
            }
            if (isCash) {
              return false;
            }
            return (
              (t.date === tx.date || !t.date || !tx.date) &&
              Math.abs(t.amount - tx.amount) < 1
            );
          });
          if (alreadyHasTx) {
            matched = true;
            break;
          }
          cust.collectedFromTreasury += tx.amount;
          cust.treasuryTransactions = cust.treasuryTransactions || [];
          cust.treasuryTransactions.push(tx);
          tx.matchedCustomer = cust.customerName;
          matched = true;
          break;
        }
      }

      // If not matched in base customers, check if it corresponds to an authentic customer from Master Data or Sales Report!
      if (!matched) {
        const normTxDesc = normalizeArabicName(tx.description);

        let matchedMasterName = "";
        if (rawData?.masterCustomerNames) {
          // Priority 1: Exact normalized match first!
          for (const mName of rawData.masterCustomerNames) {
            if (normTxDesc === normalizeArabicName(mName)) {
              matchedMasterName = mName;
              break;
            }
          }
          // Priority 2: Enhanced matching!
          if (!matchedMasterName) {
            for (const mName of rawData.masterCustomerNames) {
              if (matchTreasuryDescriptionToCustomer(tx.description, mName)) {
                matchedMasterName = mName;
                break;
              }
            }
          }
        }

        let matchedSalesName = "";
        let matchedSalesObj: any = null;
        if (!matchedMasterName) {
          const matchedSalesExact = Array.from(allSalesCustomersMap.values()).find(
            (sc) => normTxDesc === normalizeArabicName(sc.customer_name)
          );
          if (matchedSalesExact) {
            matchedSalesName = matchedSalesExact.customer_name;
            matchedSalesObj = matchedSalesExact;
          } else {
            const matchedSalesFuzzy = Array.from(allSalesCustomersMap.values()).find(
              (sc) => matchTreasuryDescriptionToCustomer(tx.description, sc.customer_name)
            );
            if (matchedSalesFuzzy) {
              matchedSalesName = matchedSalesFuzzy.customer_name;
              matchedSalesObj = matchedSalesFuzzy;
            }
          }
        }

        const validCustName = matchedMasterName || matchedSalesName;
        const normValid = normalizeArabicName(validCustName);

        // STRICT REQUIREMENT: Only accept if it is an authentic customer from Master Data!
        // Never convert accounting entries or non-customer descriptions (like "ريع نقل", "سولار", "مصاريف") into customers!
        const isMasterCustomer =
          validCustName &&
          !normValid.includes("ريع نقل") &&
          !/^(ريع|ريع نقل|نقل|سولار|مصاريف|مرتبات|كهرباء|مياه|صيانة|بوفيه|ادوات|ايجار|ايراد|ايرادات)$/.test(normValid) &&
          (masterNamesSet.size === 0 || masterNamesSet.has(normValid));

        if (isMasterCustomer) {
          const existingInBase = baseCustomers.find(
            (c) => normalizeArabicName(c.customerName) === normValid
          );
          if (existingInBase) {
            const alreadyHasTx = (existingInBase.treasuryTransactions || []).some(
              (t) => (t.date === tx.date || !t.date || !tx.date) && Math.abs(t.amount - tx.amount) < 1
            );
            if (!alreadyHasTx) {
              existingInBase.collectedFromTreasury += tx.amount;
              existingInBase.treasuryTransactions = existingInBase.treasuryTransactions || [];
              existingInBase.treasuryTransactions.push(tx);
            }
            tx.matchedCustomer = existingInBase.customerName;
            matched = true;
          } else {
            const custName = validCustName;
            const matchedMasterCust = rawData?.masterCustomers?.find(
              (m: any) => normalizeArabicName(m.customerName) === normValid
            );
            const currentBal = matchedMasterCust?.currentBalance !== undefined
              ? Number(matchedMasterCust.currentBalance)
              : matchedSalesObj
              ? Number(
                  matchedSalesObj.outstanding_amount ||
                    matchedSalesObj.prev_balance ||
                    matchedSalesObj.total_balance ||
                    0
                )
              : 0;
            const dueDate = matchedMasterCust?.dueDate || "";

            // STRICT USER REQUIREMENT:
            // "المفروض العميل النقدي ف قايمة الكاش فلو يستقل بذاته زي مهو بنفس طريقة عرضه
            // لكن لما عملاء تيجي وهي مكنتش ف الكاش فلو تدخل ب اسمها عادي ولكن بمتوقع صفر"
            const expectedAmount =
              overrides.fixedAmounts?.[custName] !== undefined
                ? overrides.fixedAmounts[custName]
                : rawConfig?.fixedAmounts?.[custName] !== undefined
                ? rawConfig.fixedAmounts[custName]
                : 0; // Strictly 0 for unexpected inflow!

            let notes =
              overrides.notes?.[custName] !== undefined
                ? overrides.notes[custName]
                : rawConfig?.notes?.[custName] || matchedMasterCust?.notes || "";
            if (notes.includes("سداد وارد غير متوقع")) {
              notes = "";
            }

            const newCust: CashFlowCustomer = {
              index: baseCustomers.length + 1,
              customerName: custName,
              normalizedName: normValid,
              currentBalance: currentBal,
              expectedAmount,
              collectedFromSheet: 0,
              collectedFromTreasury: tx.amount,
              totalCollected: tx.amount,
              dueDate,
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
          }
        } else {
          // ONLY if it does not match ANY authentic customer, check if it's purely generic cash:
          // e.g. "نقدي", "نقدى", "كاش", "عميل نقدي", "عميل نقدى"
          const isGenericCash = /^(نقدي|نقدى|كاش|عميل نقدي|عميل نقدى|عميل كاش|مبيعات نقدية|مبيعات نقدي)$/.test(normTxDesc);

          if (isGenericCash) {
            cashCust.collectedFromTreasury += tx.amount;
            cashCust.treasuryTransactions = cashCust.treasuryTransactions || [];
            cashCust.treasuryTransactions.push(tx);
            tx.matchedCustomer = cashCust.customerName;
            matched = true;
          }
        }
      }

      if (!matched) {
        unmatchedTreasuryTx.push(tx);
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
      // Avoid double-counting if the exact same collection was recorded in both Sheet and Treasury
      const sheetAmt = cust.collectedFromSheet || 0;
      const treasAmt = cust.collectedFromTreasury || 0;
      if (sheetAmt > 0 && treasAmt > 0) {
        if (Math.abs(sheetAmt - treasAmt) < 1 || treasAmt >= sheetAmt) {
          cust.totalCollected = treasAmt;
        } else {
          cust.totalCollected = treasAmt + (sheetAmt - treasAmt);
        }
      } else {
        cust.totalCollected = sheetAmt + treasAmt;
      }

      // Special rule for Cash customer: always increase expectedAmount so incoming is exactly identical to expected!
      const isCashCust =
        cust.customerName === "عميل نقدي (كاش)" ||
        cust.customerName === "نقدي كاش" ||
        cust.customerName.includes("نقدي");

      if (isCashCust) {
        cust.expectedAmount = Math.max(cust.expectedAmount || 0, cust.totalCollected);
      }

      cust.remaining = Math.max(0, cust.expectedAmount - cust.totalCollected);
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
    const { collectedCash, collectedBank } = calculateCashAndBankBreakdown(baseCustomers);

    // Persist active cycle state so baseline customers and expected amounts stay frozen across all 30s background queries
    saveActiveCycleState({
      cycleId: currentCycleId,
      weekStart: weekInfo.weekStart,
      weekEnd: weekInfo.weekEnd,
      weekLabel: weekInfo.weekLabel,
      weeklyGoal,
      customers: baseCustomers,
      archivedTxSignatures: Array.from(archivedTxSet),
      weeklyTreasuryTransactions: cycleTreasuryTx,
      updatedAt: new Date().toISOString(),
    });

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
      collectedCash,
      collectedBank,
      collectionRate,
      remainingToTarget,
      customerCount: baseCustomers.length,
      overdueCount,
      customers: baseCustomers,
      unmatchedTreasuryTx,
      weeklyTreasuryTransactions: cycleTreasuryTx,
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
      collectedCash: rawData?.totalCollected || 0,
      collectedBank: 0,
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
    collectedCash: currentSummary.collectedCash ?? currentSummary.collectedFromTreasury,
    collectedBank: currentSummary.collectedBank ?? 0,
    collectionRate: currentSummary.collectionRate,
    remainingToTarget: currentSummary.remainingToTarget,
    customerCount: currentSummary.customerCount,
    overdueCount: currentSummary.overdueCount,
    customers: currentSummary.customers || [],
  };

  // 1. Save to IndexedDB (with safety timeout)
  if (typeof window !== "undefined") {
    try {
      await Promise.race([
        set(`${CF_ARCHIVE_PREFIX}${weekId}`, archivedWeek),
        new Promise((_, reject) => setTimeout(() => reject(new Error("IDB timeout")), 2000)),
      ]);
    } catch (e) {
      console.warn("Failed to save to IndexedDB:", e);
    }
  }

  // 2. Save to Firestore (with safety timeout)
  if (typeof window !== "undefined") {
    try {
      const docRef = doc(db, "cashflow_archives", weekId);
      await Promise.race([
        setDoc(docRef, archivedWeek),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 2500)),
      ]);
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
  // Criteria: currentBalance >= 5000 AND not settled AND (due date <= nextWeekEnd OR dueDate in past/empty)
  const masterList = currentSummary.masterCustomers || [];
  for (const m of masterList) {
    if (!m.customerName) continue;
    if (m.currentBalance < 5000) continue; // Minimum balance threshold >= 5000 EGP!
    if (m.notes?.includes("عميل خالص") || m.notes?.includes("تم التصفية")) continue;

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

  // Also include any customer from ending week who still had unpaid remaining (provided balance >= 5000 and not settled)
  for (const c of currentSummary.customers) {
    if (!newCustomersMap.has(c.customerName) && c.remaining > 0 && c.currentBalance >= 5000) {
      if (c.notes?.includes("عميل خالص") || c.notes?.includes("تم التصفية")) continue;
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
    saveRemoteUserOverrides(freshOverrides).catch(() => {});
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
    collectedCash: 0,
    collectedBank: 0,
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

  // Collect signatures of all treasury transactions in the week being ended
  // This guarantees that none of them can EVER be counted in the new week
  const currentTreasurySigs: string[] = [];
  for (const c of currentSummary.customers || []) {
    for (const tx of c.treasuryTransactions || []) {
      const sig = `${tx.date || currentSummary.reportDate || ""}_${tx.description}_${tx.amount}_${tx.type}`;
      currentTreasurySigs.push(sig);
    }
  }
  for (const tx of currentSummary.unmatchedTreasuryTx || []) {
    const sig = `${tx.date || currentSummary.reportDate || ""}_${tx.description}_${tx.amount}_${tx.type}`;
    currentTreasurySigs.push(sig);
  }

  saveActiveCycleState({
    cycleId: `week_${nextWeekInfo.weekStart}_to_${nextWeekInfo.weekEnd}`,
    weekStart: nextWeekInfo.weekStart,
    weekEnd: nextWeekInfo.weekEnd,
    weekLabel: nextWeekInfo.weekLabel,
    weeklyGoal,
    customers: newCustomers,
    archivedTxSignatures: currentTreasurySigs,
    updatedAt: new Date().toISOString(),
  });

  return { newSummary, archivedWeek };
}
