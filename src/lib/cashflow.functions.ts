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
  if (day >= 3) {
    // Wed (3), Thu (4), Fri (5), Sat (6) -> started this week's Wednesday
    daysToWed = day - 3;
  } else {
    // Sun (0), Mon (1), Tue (2) -> started previous Wednesday (No automatic 7 PM shift - manual button only)
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
    .replace(/[\s\-_]+/g, " ");

  const parenIdx = res.indexOf("(");
  if (parenIdx >= 0) res = res.slice(0, parenIdx);
  const dashIdx = res.indexOf(" - ");
  if (dashIdx >= 0) res = res.slice(0, dashIdx);

  // Strip common Egyptian honorific titles and punctuation from beginning (e.g. د.محمد, المعلم/, الحاج /)
  res = res
    .replace(
      /^(المعلم|حاج|الحاج|مهندس|المهندس|م|استاذ|الاستاذ|أ|شيخ|الشيخ|دكتور|د)[\.\/\\\s\-_]+/g,
      ""
    )
    .replace(/^[\.\/\\\-_]+/, "");

  res = res
    .replace(/عيد\s*التواب/g, "عبدالتواب")
    .replace(/عبد\s+/g, "عبد")
    .replace(/ابو\s+/g, "ابو")
    .replace(/بن\s+/g, "بن");

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
  // If description mentions "النور" and cash (e.g. "النور نقديه", "النور نقدية"), it is company internal treasury, NOT a customer!
  if (/النور\s*نقد|نقد.*النور/.test(s)) return false;
  const noSpace = s.replace(/\s+/g, "");
  return (
    /^(نقدي|نقدى|كاش|نقديكاش|عميلنقدي|عميلنقدى|عميلكاش|عميلنقديكاش)$/.test(noSpace) ||
    /^(عميلنقدي|نقديكاش)/.test(noSpace) ||
    (/نقدي|كاش/.test(s) && !/(ابو|احمد|محمد|علي|محمود|حمزة|مرسي|اسامه|يونس|النور)/.test(s))
  );
};

const GENERIC_SINGLE_NAMES = new Set([
  "احمد", "محمد", "محمود", "علي", "حسن", "حسين", "سيد", "ابراهيم", "مصطفي", "مصطفى",
  "خالد", "طارق", "عمرو", "عمر", "يوسف", "سعيد", "اشرف", "جمال", "عادل", "رضا", "نقدي", "كاش"
]);

function isOneEditApart(s1: string, s2: string): boolean {
  const normPhonetic = (s: string) =>
    s.replace(/ط/g, "ت").replace(/ص/g, "س").replace(/ظ/g, "ز").replace(/ي+$/, "");
  const p1 = normPhonetic(s1);
  const p2 = normPhonetic(s2);
  if (p1 === p2) return true;
  if (Math.abs(p1.length - p2.length) > 1) return false;
  if (p1.length < 3 || p2.length < 3) return false;
  let edits = 0;
  let i = 0, j = 0;
  while (i < p1.length && j < p2.length) {
    if (p1[i] !== p2[j]) {
      edits++;
      if (edits > 1) return false;
      if (p1.length > p2.length) i++;
      else if (p2.length > p1.length) j++;
      else { i++; j++; }
    } else {
      i++;
      j++;
    }
  }
  return true;
}

function wordsMatch(w1: string, w2: string, allowFuzzy = false): boolean {
  if (!w1 || !w2) return false;
  if (w1 === w2) return true;
  const nw1 = w1.replace(/ي+$/, "");
  const nw2 = w2.replace(/ي+$/, "");
  if (nw1 === nw2) return true;
  const sw1 = nw1.startsWith("ال") && nw1.length >= 4 ? nw1.slice(2) : nw1;
  const sw2 = nw2.startsWith("ال") && nw2.length >= 4 ? nw2.slice(2) : nw2;
  if (sw1 === sw2) return true;
  if (allowFuzzy && isOneEditApart(sw1, sw2)) return true;
  return false;
}

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
        /^(المعلم|حاج|الحاج|مهندس|المهندس|م|استاذ|الاستاذ|أ|شيخ|الشيخ|دكتور|د|مزرعة|مزرعه|شركة|شركه|محطة|محطه|مصنع|معمل|معرض)[\.\/\\\s\-_]+/g,
        ""
      )
      .trim();

  const sd = stripPrefixHonorific(nd);
  const sc = stripPrefixHonorific(nc);
  if (sd && sc && (sd === sc || wordsMatch(sd, sc, false))) return true;

  // 4. Clean match (handling colloquial ذ/ز, compound prefixes عبد/ابو, and trailing annotations)
  const cd = cleanCustomerMatchingName(desc);
  const cc = cleanCustomerMatchingName(customerName);
  if (cd && cc && (cd === cc || wordsMatch(cd, cc, false))) return true;

  // 5. Match full name ignoring parenthesized nickname/branch annotation
  const cleanParens = (s: string) => {
    const idx = s.indexOf("(");
    return idx >= 0 ? s.slice(0, idx).trim() : s;
  };
  const bd = normalizeArabicName(cleanParens(desc));
  const bc = normalizeArabicName(cleanParens(customerName));
  if (bd && bc && (bd === bc || sd === bc || bd === sc || wordsMatch(bd, bc, false))) return true;

  // 6. STRICT ENTITY GUARD:
  const isEntity = Array.from(GENERIC_PREFIXES).some(
    (k) => nd.includes(k) || nc.includes(k)
  );
  if (isEntity) return false;

  // 7. Token-based smart matching
  const cdWords = cd.split(" ").filter((w) => w.length >= 2);
  const ccWords = cc.split(" ").filter((w) => w.length >= 2);

  // 7a. Prefix matching on primary customer name (handles مرداش/مرداشي, ديب/الديب, and phonetic typos on final word)
  if (cdWords.length >= 2 && ccWords.length >= 2) {
    let mCount = 0;
    const minLen = Math.min(cdWords.length, ccWords.length);
    for (let i = 0; i < minLen; i++) {
      const isLast = i === minLen - 1 && i >= 2;
      if (wordsMatch(cdWords[i], ccWords[i], isLast)) {
        mCount++;
      } else {
        break;
      }
    }
    if (mCount >= 2 && (mCount === cdWords.length || mCount === ccWords.length)) {
      return true;
    }
  }

  // 7b. Order-invariant & full tokens match across all customer words (including paren annotations like "مرسي مدشه" or "حلوان احمد سلامه")
  const allCustWords = normalizeArabicName(customerName)
    .replace(/عبد\s+/g, "عبد")
    .replace(/ابو\s+/g, "ابو")
    .replace(/بن\s+/g, "بن")
    .replace(/[\.\/\\\s\-_()]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2);
  if (cdWords.length >= 2 && allCustWords.length >= 2) {
    let matchedTokens = 0;
    const used = new Set<number>();
    for (let i = 0; i < cdWords.length; i++) {
      const isFuzzy = i >= 2;
      for (let idx = 0; idx < allCustWords.length; idx++) {
        if (!used.has(idx) && wordsMatch(cdWords[i], allCustWords[idx], isFuzzy)) {
          matchedTokens++;
          used.add(idx);
          break;
        }
      }
    }
    if (matchedTokens >= 2 && (matchedTokens === cdWords.length || matchedTokens === allCustWords.length)) {
      return true;
    }
  }

  // 7c. Distinctive single entity or compound surname (e.g. "الخيرات" or "ابوحمزه")
  if (cdWords.length === 1 && !GENERIC_SINGLE_NAMES.has(cdWords[0])) {
    if (ccWords.some((w) => wordsMatch(cdWords[0], w, false))) {
      return true;
    }
  }

  const dWords = nd.split(" ").filter((w) => w.length >= 2);
  const cWords = bc.split(" ").filter((w) => w.length >= 2);
  if (dWords.length >= 2 && (nc.startsWith(nd + " ") || bc.startsWith(nd + " "))) {
    return true;
  }
  if (cWords.length >= 2 && (nd.startsWith(bc + " ") || nd === bc)) {
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
      { cache: "no-store", signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const reportDate = String(data?.reportDate || "").trim();
    if (data?.transactions?.incoming && Array.isArray(data.transactions.incoming)) {
      return data.transactions.incoming.map((tx: any, idx: number) => ({
        amount: Number(tx.amount) || 0,
        description: String(tx.description || ""),
        type: String(tx.type || ""),
        date: String(tx.date || reportDate || ""),
        receipt: String(tx.receipt || tx.id || `live_${reportDate || "tx"}_${idx}`),
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
  updatedAt?: string;
  itemTimestamps?: Record<string, number>;
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
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 5000)),
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
    const cleanState = JSON.parse(JSON.stringify(state));
    await Promise.race([
      setDoc(docRef, cleanState, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore save timeout")), 6000)),
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
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 5000)),
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
      new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore save timeout")), 6000)),
    ]);
  } catch (e) {
    console.warn("Could not save remote overrides to Firestore:", e);
  }
}

export const FIRESTORE_CF_PREV_WEEK_DOC = "previous_week";

/**
 * Fetch remote previous week comparison metrics from Firestore.
 * Ensures all devices (mobile, incognito, PC) have identical last-week comparison metrics.
 */
export async function fetchRemotePreviousWeek(): Promise<CashFlowComparisonMetrics | null> {
  try {
    const docRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_PREV_WEEK_DOC);
    const snap = await Promise.race([
      getDoc(docRef),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 5000)),
    ]);
    if (snap && snap.exists()) {
      return snap.data() as CashFlowComparisonMetrics;
    }
    return null;
  } catch (e) {
    console.warn("Could not fetch remote previous week from Firestore:", e);
    return null;
  }
}

/**
 * Save previous week comparison metrics to Firestore so all devices stay in sync.
 */
export async function saveRemotePreviousWeek(metrics: CashFlowComparisonMetrics): Promise<void> {
  if (!metrics) return;
  try {
    const docRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_PREV_WEEK_DOC);
    const cleanData = JSON.parse(JSON.stringify(metrics));
    await Promise.race([
      setDoc(docRef, cleanData, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore save timeout")), 3000)),
    ]);
  } catch (e) {
    console.warn("Could not save remote previous week to Firestore:", e);
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
 * Helper to match and retrieve fixed amounts across exact and normalized Arabic variants.
 */
export function getOverrideFixedAmount(
  overrides?: UserOverrides | null,
  customerName?: string,
  rawConfig?: any
): number | undefined {
  if (!customerName) return undefined;
  const norm = normalizeArabicName(customerName);

  // 1. Exact match in user overrides
  if (overrides?.fixedAmounts?.[customerName] !== undefined) {
    return Number(overrides.fixedAmounts[customerName]);
  }

  // 2. Normalized match in user overrides
  if (overrides?.fixedAmounts) {
    for (const [key, val] of Object.entries(overrides.fixedAmounts)) {
      if (normalizeArabicName(key) === norm) {
        return Number(val);
      }
    }
  }

  // 3. Exact match in rawConfig
  if (rawConfig?.fixedAmounts?.[customerName] !== undefined) {
    return Number(rawConfig.fixedAmounts[customerName]);
  }

  // 4. Normalized match in rawConfig
  if (rawConfig?.fixedAmounts) {
    for (const [key, val] of Object.entries(rawConfig.fixedAmounts)) {
      if (normalizeArabicName(key) === norm) {
        return Number(val);
      }
    }
  }

  return undefined;
}

/**
 * Helper to match and retrieve notes across exact and normalized Arabic variants.
 */
export function getOverrideNote(
  overrides?: UserOverrides | null,
  customerName?: string,
  rawConfig?: any
): string | undefined {
  if (!customerName) return undefined;
  const norm = normalizeArabicName(customerName);

  if (overrides?.notes?.[customerName] !== undefined) {
    return overrides.notes[customerName];
  }
  if (overrides?.notes) {
    for (const [key, val] of Object.entries(overrides.notes)) {
      if (normalizeArabicName(key) === norm) return val;
    }
  }
  if (rawConfig?.notes?.[customerName] !== undefined) {
    return rawConfig.notes[customerName];
  }
  if (rawConfig?.notes) {
    for (const [key, val] of Object.entries(rawConfig.notes)) {
      if (normalizeArabicName(key) === norm) return val;
    }
  }
  return undefined;
}

/**
 * Helper to match and retrieve pinned status across exact and normalized Arabic variants.
 */
export function getOverridePinned(
  overrides?: UserOverrides | null,
  customerName?: string,
  rawConfig?: any
): boolean | undefined {
  if (!customerName) return undefined;
  const norm = normalizeArabicName(customerName);

  if (overrides?.pinnedStatus?.[customerName] !== undefined) {
    return overrides.pinnedStatus[customerName];
  }
  if (overrides?.pinnedStatus) {
    for (const [key, val] of Object.entries(overrides.pinnedStatus)) {
      if (normalizeArabicName(key) === norm) return val;
    }
  }
  if (rawConfig?.pinnedCustomers?.[customerName] !== undefined) {
    return Boolean(rawConfig.pinnedCustomers[customerName]);
  }
  if (rawConfig?.pinnedCustomers) {
    for (const [key, val] of Object.entries(rawConfig.pinnedCustomers)) {
      if (normalizeArabicName(key) === norm) return Boolean(val);
    }
  }
  return undefined;
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
      updatedAt: parsed?.updatedAt,
      itemTimestamps: parsed?.itemTimestamps || {},
    };
  } catch {
    return { fixedAmounts: {}, notes: {}, pinnedStatus: {}, deletedCustomers: [], addedCustomers: [] };
  }
}

/**
 * Synchronize remote Firestore overrides into LocalStorage cache intelligently.
 * Ensures recent local user modifications are NEVER overwritten by stale remote cache.
 */
export function syncRemoteOverridesToLocal(remote: UserOverrides) {
  if (typeof window === "undefined" || !remote) return;
  try {
    const local = getUserOverrides();
    const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    const remoteTime = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;

    const mergedFixed: Record<string, number> = { ...(remote.fixedAmounts || {}) };
    const mergedTimestamps: Record<string, number> = { ...(remote.itemTimestamps || {}) };

    // Any local fixed amount modified more recently than remote must be preserved!
    for (const [name, amt] of Object.entries(local.fixedAmounts || {})) {
      const norm = normalizeArabicName(name);
      const lTime = local.itemTimestamps?.[norm] || localTime;
      const rTime = remote.itemTimestamps?.[norm] || remoteTime;
      if (lTime >= rTime) {
        for (const remKey of Object.keys(mergedFixed)) {
          if (normalizeArabicName(remKey) === norm) {
            delete mergedFixed[remKey];
          }
        }
        mergedFixed[name] = amt;
        mergedTimestamps[norm] = lTime;
      }
    }

    const mergedNotes: Record<string, string> = { ...(remote.notes || {}) };
    for (const [name, note] of Object.entries(local.notes || {})) {
      const norm = normalizeArabicName(name);
      const lTime = local.itemTimestamps?.[norm] || localTime;
      const rTime = remote.itemTimestamps?.[norm] || remoteTime;
      if (lTime >= rTime) {
        for (const remKey of Object.keys(mergedNotes)) {
          if (normalizeArabicName(remKey) === norm) {
            delete mergedNotes[remKey];
          }
        }
        mergedNotes[name] = note;
      }
    }

    const mergedPinned: Record<string, boolean> = { ...(remote.pinnedStatus || {}) };
    for (const [name, pin] of Object.entries(local.pinnedStatus || {})) {
      const norm = normalizeArabicName(name);
      const lTime = local.itemTimestamps?.[norm] || localTime;
      const rTime = remote.itemTimestamps?.[norm] || remoteTime;
      if (lTime >= rTime) {
        for (const remKey of Object.keys(mergedPinned)) {
          if (normalizeArabicName(remKey) === norm) {
            delete mergedPinned[remKey];
          }
        }
        mergedPinned[name] = pin;
      }
    }

    const merged: UserOverrides = {
      fixedAmounts: mergedFixed,
      notes: mergedNotes,
      pinnedStatus: mergedPinned,
      deletedCustomers: Array.from(new Set([...(local.deletedCustomers || []), ...(remote.deletedCustomers || [])])),
      addedCustomers: remote.addedCustomers && remote.addedCustomers.length > 0 ? remote.addedCustomers : (local.addedCustomers || []),
      updatedAt: new Date(Math.max(localTime, remoteTime, Date.now())).toISOString(),
      itemTimestamps: mergedTimestamps,
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));

    // If local was newer than remote, push merged back to Firestore so remote is refreshed!
    if (localTime > remoteTime) {
      saveRemoteUserOverrides(merged).catch(() => {});
    }
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
    current.updatedAt = new Date().toISOString();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
    saveRemoteUserOverrides(current).catch(() => {});
  } catch (err) {
    console.error("Failed to mark customer as deleted:", err);
  }
}

/**
 * Mark multiple customers as deleted by user for this cycle in a single atomic operation.
 */
export function markMultipleCustomersAsDeleted(customerNames: string[]) {
  if (typeof window === "undefined" || !customerNames || customerNames.length === 0) return;
  try {
    const current = getUserOverrides();
    const deleted = new Set(current.deletedCustomers || []);
    const namesSet = new Set(customerNames);
    customerNames.forEach((n) => {
      if (n) deleted.add(n);
    });
    current.deletedCustomers = Array.from(deleted);
    if (current.addedCustomers) {
      current.addedCustomers = current.addedCustomers.filter((c) => !namesSet.has(c.customerName));
    }
    current.updatedAt = new Date().toISOString();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
    saveRemoteUserOverrides(current).catch(() => {});
  } catch (err) {
    console.error("Failed to mark multiple customers as deleted:", err);
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
    current.updatedAt = new Date().toISOString();
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
    const normTarget = normalizeArabicName(customerName);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const current = getUserOverrides();
    current.itemTimestamps = current.itemTimestamps || {};
    current.itemTimestamps[normTarget] = nowMs;
    current.updatedAt = nowIso;

    if (updates.expectedAmount !== undefined) {
      // Clean up conflicting spelling variants
      for (const key of Object.keys(current.fixedAmounts)) {
        if (normalizeArabicName(key) === normTarget) {
          delete current.fixedAmounts[key];
        }
      }
      current.fixedAmounts[customerName] = updates.expectedAmount;
    }

    if (updates.notes !== undefined) {
      for (const key of Object.keys(current.notes)) {
        if (normalizeArabicName(key) === normTarget) {
          delete current.notes[key];
        }
      }
      current.notes[customerName] = updates.notes;
    }

    if (updates.isPinned !== undefined) {
      for (const key of Object.keys(current.pinnedStatus)) {
        if (normalizeArabicName(key) === normTarget) {
          delete current.pinnedStatus[key];
        }
      }
      current.pinnedStatus[customerName] = updates.isPinned;
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
    saveRemoteUserOverrides(current).catch(() => {});

    // Also update customer in active cycle state if present
    const cycle = getActiveCycleState();
    if (cycle && Array.isArray(cycle.customers)) {
      const target = cycle.customers.find(
        (c) =>
          c.customerName === customerName ||
          (c.normalizedName && c.normalizedName === normTarget) ||
          normalizeArabicName(c.customerName) === normTarget
      );
      if (target) {
        if (updates.expectedAmount !== undefined) target.expectedAmount = updates.expectedAmount;
        if (updates.notes !== undefined) target.notes = updates.notes;
        if (updates.isPinned !== undefined) target.isPinned = updates.isPinned;
        target.remaining = Math.max(0, (target.expectedAmount || 0) - (target.totalCollected || 0));
        target.rate =
          target.expectedAmount > 0
            ? target.totalCollected / target.expectedAmount
            : target.totalCollected > 0
            ? 1
            : 0;
        if (target.expectedAmount === 0) {
          target.status = target.totalCollected > 0 ? "مكتمل" : "لا يوجد استحقاق";
        } else if (target.remaining === 0) {
          target.status = "مكتمل";
        } else if (target.totalCollected > 0) {
          target.status = "جزئي";
        } else {
          target.status = "لم يسدد";
        }
        cycle.updatedAt = nowIso;
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
    let cycle = getActiveCycleState();
    if (!cycle) {
      cycle = {
        cycleId: `week_${summary.weekStart}_to_${summary.weekEnd}`,
        weekStart: summary.weekStart,
        weekEnd: summary.weekEnd,
        weekLabel: summary.weekLabel,
        weeklyGoal: summary.weeklyGoal || 4000000,
        customers: remainingCusts,
        updatedAt: new Date().toISOString(),
      };
    } else {
      cycle.customers = remainingCusts;
      cycle.updatedAt = new Date().toISOString();
    }
    saveActiveCycleState(cycle);
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
 * Delete multiple customers from summary and update state instantly in-memory in one batch.
 */
export function deleteMultipleCustomersFromSummary(
  summary: CashFlowSummary,
  customerNames: string[]
): CashFlowSummary {
  if (!customerNames || customerNames.length === 0) return summary;
  markMultipleCustomersAsDeleted(customerNames);

  const toDeleteSet = new Set(customerNames);
  const remainingCusts = summary.customers
    .filter((c) => !toDeleteSet.has(c.customerName))
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
    let cycle = getActiveCycleState();
    if (!cycle) {
      cycle = {
        cycleId: `week_${summary.weekStart}_to_${summary.weekEnd}`,
        weekStart: summary.weekStart,
        weekEnd: summary.weekEnd,
        weekLabel: summary.weekLabel,
        weeklyGoal: summary.weeklyGoal || 4000000,
        customers: remainingCusts,
        updatedAt: new Date().toISOString(),
      };
    } else {
      cycle.customers = remainingCusts;
      cycle.updatedAt = new Date().toISOString();
    }
    saveActiveCycleState(cycle);
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
  const normTarget = normalizeArabicName(customerName);

  const updatedCustomers = currentSummary.customers.map((c) => {
    if (c.customerName !== customerName && (c.normalizedName || normalizeArabicName(c.customerName)) !== normTarget) {
      return c;
    }

    let expectedAmount = Number(updates.expectedAmount) || 0;
    const isPinned = Boolean(updates.isPinned);
    const notes = String(updates.notes || "");
    const totalCollected =
      c.totalCollected !== undefined
        ? c.totalCollected
        : c.collectedFromSheet + c.collectedFromTreasury;

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
  let liveTreasuryTx: TreasuryIncomingTx[] = [];
  let remoteCycle: any = null;
  let remoteOverrides: any = null;
  let remotePrevWeek: any = null;

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
    } catch (e) {
      // ignore
    }
  } else {
    // Parallelize all initial fetches concurrently (cashflow_data, config, live treasury, remote cycle/overrides)
    const fetchCashflowData = async () => {
      try {
        const res = await fetch(`${basePath}cashflow_data.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn("Failed to fetch cashflow_data.json:", e);
      }
      return null;
    };

    const fetchCashflowConfig = async () => {
      try {
        const cfgRes = await fetch(`${basePath}cashflow_config.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (cfgRes.ok) return await cfgRes.json();
      } catch (e) {
        console.warn("Failed to fetch cashflow_config.json:", e);
      }
      return null;
    };

    try {
      const [fetchedData, fetchedConfig, liveTx, rCycle, rOverrides, rPrevWeek] =
        await Promise.all([
          fetchCashflowData(),
          fetchCashflowConfig(),
          fetchLiveTreasuryIncoming(),
          fetchRemoteCycleState(),
          fetchRemoteUserOverrides(),
          fetchRemotePreviousWeek(),
        ]);
      if (fetchedData) rawData = fetchedData;
      if (fetchedConfig) rawConfig = fetchedConfig;
      liveTreasuryTx = liveTx;
      remoteCycle = rCycle;
      remoteOverrides = rOverrides;
      remotePrevWeek = rPrevWeek;
    } catch (e) {
      console.warn("Error in parallel cashflow initial fetches:", e);
    }
  }

  try {
    if (typeof window === "undefined") {
      const [liveTx, rCycle, rOverrides, rPrevWeek] = await Promise.all([
        fetchLiveTreasuryIncoming(),
        fetchRemoteCycleState(),
        fetchRemoteUserOverrides(),
        fetchRemotePreviousWeek(),
      ]);
      liveTreasuryTx = liveTx;
      remoteCycle = rCycle;
      remoteOverrides = rOverrides;
      remotePrevWeek = rPrevWeek;
    }

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

    let savedCycle: ActiveCashFlowCycleState | null = localSavedCycle;
    if (isRemoteValid && remoteCycle) {
      const remoteTime = remoteCycle.updatedAt ? new Date(remoteCycle.updatedAt).getTime() : 0;
      const localTime = localSavedCycle?.updatedAt ? new Date(localSavedCycle.updatedAt).getTime() : 0;
      if (!localSavedCycle || remoteTime >= localTime) {
        savedCycle = remoteCycle;
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(ACTIVE_CYCLE_STORAGE_KEY, JSON.stringify(remoteCycle));
          } catch (e) {}
        }
      } else {
        savedCycle = localSavedCycle;
        saveRemoteCycleState(localSavedCycle).catch(() => {});
      }
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
      let hasAutoCorrected = false;
      baseCustomers = savedCycle.customers.map((c) => {
        const norm = c.normalizedName || normalizeArabicName(c.customerName);
        let overrideAmt = getOverrideFixedAmount(overrides, c.customerName, rawConfig);


        let expectedAmount =
          overrideAmt !== undefined
            ? overrideAmt
            : c.expectedAmount;

        const masterCust = (rawData?.masterCustomers || []).find(
          (mc: any) =>
            mc.customerName === c.customerName ||
            normalizeArabicName(mc.customerName) === norm
        ) || (rawData?.customers || []).find(
          (rc: any) =>
            rc.customerName === c.customerName ||
            rc.normalizedName === norm
        );

        const liveDueDate = masterCust?.dueDate !== undefined ? masterCust.dueDate : (c.dueDate || "");
        const liveBalance = masterCust?.currentBalance !== undefined ? masterCust.currentBalance : c.currentBalance;

        const isPinned =
          getOverridePinned(overrides, c.customerName, rawConfig) ?? Boolean(c.isPinned);

        const isCurrentWeekDue = Boolean(liveDueDate && liveDueDate >= weekInfo.weekStart && liveDueDate <= weekInfo.weekEnd);
        const isUnexpected = isCurrentWeekDue ? false : Boolean(c.isUnexpectedInflow);

        // Strict User Rule: If customer is due in a future week (> weekInfo.weekEnd) or is an unexpected inflow,
        // and is not pinned: expected amount MUST BE ZERO (0)!
        if (
          c.customerName !== CASH_NAME &&
          !c.customerName.includes("نقدي") &&
          !isPinned &&
          ((liveDueDate && liveDueDate > weekInfo.weekEnd) || isUnexpected)
        ) {
          expectedAmount = 0;
        }

        // Notes: User override (from config) takes priority; fall back to Master_Data, then saved
        let notes =
          overrides.notes?.[c.customerName] !== undefined && overrides.notes[c.customerName] !== ""
            ? overrides.notes[c.customerName]
            : masterCust?.notes !== undefined
            ? masterCust.notes
            : c.notes || "";

        // Strictly remove synthetic "سداد وارد غير متوقع" note as instructed by user!
        if (notes && notes.includes("سداد وارد غير متوقع")) {
          notes = "";
        }

        const collectedFromSheet = Math.max(
          Number(c.collectedFromSheet) || 0,
          Number(masterCust?.collectedFromSheet) || 0
        );

        return {
          ...c,
          currentBalance: liveBalance,
          dueDate: liveDueDate,
          expectedAmount,
          collectedFromSheet,
          notes,
          isPinned,
          collectedFromTreasury: 0,
          treasuryTransactions: [] as TreasuryIncomingTx[],
        };
      });

      if (hasAutoCorrected) {
        savedCycle.updatedAt = new Date().toISOString();
        saveActiveCycleState(savedCycle);
      }

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

      // User Rule (استثناء التواريخ): If customer's dueDate is postponed outside active week (> weekInfo.weekEnd) and has not paid:
      // They EXIT the active cycle completely!
      baseCustomers = baseCustomers.filter((c) => {
        if (c.customerName === CASH_NAME || c.customerName.includes("نقدي")) return true;
        if (c.isPinned) return true;
        const hasPaid = (c.collectedFromSheet > 0 || c.collectedFromTreasury > 0);
        if (c.dueDate && c.dueDate > weekInfo.weekEnd && !hasPaid) {
          return false; // POSTPONED TO FUTURE WEEK -> EXITS CURRENT CYCLE!
        }
        return true;
      });

      // Two-way sync: If any customer in Master_Data had their dueDate advanced INTO this active week (<= weekInfo.weekEnd),
      // OR they made an actual collection payment in sheet 'قبض' this week:
      // They ENTER the active cycle list immediately UNLESS explicitly deleted by user for this active week!
      const activeDeletedNormSet = new Set(
        (overrides.deletedCustomers || []).map((n) => normalizeArabicName(n))
      );
      for (const mc of rawData?.masterCustomers || []) {
        if (!mc.customerName) continue;
        const hasPaidInSheet = (Number(mc.collectedFromSheet) || 0) > 0;
        const isSettled = Boolean(mc.notes?.includes("عميل خالص") || mc.notes?.includes("تم التصفية") || mc.isKhalis);
        if (isSettled && !hasPaidInSheet) continue;
        if (mc.currentBalance < 5000 && !hasPaidInSheet) continue;

        const norm = normalizeArabicName(mc.customerName);
        if (
          activeDeletedNormSet.has(norm) ||
          (overrides.deletedCustomers || []).includes(mc.customerName)
        ) {
          continue; // User explicitly deleted this customer for this active week! DO NOT RE-ADD!
        }
        if (norm.includes("ريع نقل") || /^(ريع|نقل|سولار|مصاريف|مرتبات|كهرباء|مياه|صيانة|بوفيه|ادوات|ايجار|ايراد|ايرادات)$/.test(norm)) {
          continue;
        }
        const isAlreadyInBase = baseCustomers.some(
          (bc) => bc.customerName === mc.customerName || normalizeArabicName(bc.customerName) === norm
        );
        const qualifiesByDate = Boolean(mc.dueDate && mc.dueDate <= weekInfo.weekEnd);
        if (!isAlreadyInBase && (qualifiesByDate || hasPaidInSheet)) {
          const overrideAmt = getOverrideFixedAmount(overrides, mc.customerName, rawConfig);
          // If customer entered solely because they paid (unexpected / future due date), expectedAmount is strictly 0!
          const expAmt =
            overrideAmt !== undefined
              ? overrideAmt
              : (!qualifiesByDate && hasPaidInSheet ? 0 : mc.currentBalance);
          baseCustomers.push({
            index: baseCustomers.length + 1,
            customerName: mc.customerName,
            normalizedName: norm,
            currentBalance: mc.currentBalance,
            expectedAmount: Number(expAmt) || 0,
            collectedFromSheet: Number(mc.collectedFromSheet) || 0,
            collectedFromTreasury: 0,
            totalCollected: Number(mc.collectedFromSheet) || 0,
            dueDate: mc.dueDate,
            rate: 0,
            status: "لم يسدد",
            remaining: Number(expAmt) || 0,
            notes: mc.notes !== undefined ? mc.notes : (getOverrideNote(overrides, mc.customerName, rawConfig) || ""),
            isPinned: false,
            isUnexpectedInflow: !qualifiesByDate && hasPaidInSheet,
            treasuryTransactions: [],
          });
        }
      }
    } else {
      // 2. INITIALIZE FRESH BASELINE FOR THE CYCLE (ONCE AT CYCLE START / RESET)
      baseCustomers = (rawData?.customers || []).map((c: any, idx: number) => {
        const name = c.customerName || "";
        const isPinned =
          getOverridePinned(overrides, name, rawConfig) ?? Boolean(c.isPinned ?? false);

        const overrideAmt = getOverrideFixedAmount(overrides, name, rawConfig);
        const expectedAmount =
          overrideAmt !== undefined
            ? overrideAmt
            : c.expectedAmount !== undefined
            ? c.expectedAmount
            : c.currentBalance || 0;

        const masterCust = (rawData?.masterCustomers || []).find(
          (mc: any) =>
            mc.customerName === name ||
            normalizeArabicName(mc.customerName) === (c.normalizedName || normalizeArabicName(name))
        );

        const overrideNote = getOverrideNote(overrides, name, rawConfig);
        const notes =
          masterCust?.notes !== undefined
            ? masterCust.notes
            : overrideNote !== undefined
            ? overrideNote
            : c.notes || "";

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
        const hasPaid = ((c.collectedFromSheet || 0) > 0 || (c.collectedFromTreasury || 0) > 0);
        if (c.currentBalance < 5000 && !hasPaid && !c.isPinned) return false;
        if ((c.notes?.includes("عميل خالص") || c.notes?.includes("تم التصفية")) && !hasPaid && !c.isPinned) return false;
        const norm = normalizeArabicName(c.customerName);
        if (norm.includes("ريع نقل") || /^(ريع|نقل|سولار|مصاريف|مرتبات|كهرباء|مياه|صيانة|بوفيه|ادوات|ايجار|ايراد|ايرادات)$/.test(norm)) {
          return false;
        }
        if (masterNamesSet.size > 0 && !masterNamesSet.has(norm)) {
          return false;
        }

        const isDueThisWeekOrPast = !c.dueDate || c.dueDate <= weekInfo.weekEnd;

        if (!isSavedCycleValid && !isDueThisWeekOrPast && !hasPaid && !c.isPinned) {
          return false;
        }

        if (!isDueThisWeekOrPast && hasPaid && !c.isPinned) {
          const overrideAmt = getOverrideFixedAmount(overrides, c.customerName, rawConfig);
          if (overrideAmt !== undefined) {
            c.expectedAmount = overrideAmt;
          } else {
            c.expectedAmount = 0;
          }
        }

        return true;
      });

      // Rollover unpaid customers from previous cycle (User Rule: ينزل بالمبلغ المتبقي الذي لم يسدده من الأسبوع المنتهي)
      if (savedCycle && Array.isArray(savedCycle.customers)) {
        for (const prevCust of savedCycle.customers) {
          const norm = prevCust.normalizedName || normalizeArabicName(prevCust.customerName);
          const alreadyIn = baseCustomers.some(
            (b) => b.customerName === prevCust.customerName || normalizeArabicName(b.customerName) === norm
          );
          const remAmt = prevCust.remaining !== undefined ? prevCust.remaining : prevCust.expectedAmount;
          if (!alreadyIn && remAmt > 0 && prevCust.currentBalance >= 5000) {
            if (prevCust.notes?.includes("عميل خالص") || prevCust.notes?.includes("تم التصفية")) continue;
            baseCustomers.push({
              ...prevCust,
              index: baseCustomers.length + 1,
              expectedAmount: remAmt, // Carry over UNPAID REMAINING ONLY!
              collectedFromSheet: 0,
              collectedFromTreasury: 0,
              totalCollected: 0,
              remaining: remAmt,
              rate: 0,
              status: "لم يسدد",
              treasuryTransactions: [],
            });
          }
        }
      }
    }

    // Filter out user-deleted customers for this active week (applies strictly to both saved cycle and fresh baseline)
    if (overrides.deletedCustomers && overrides.deletedCustomers.length > 0) {
      const deletedSet = new Set(
        overrides.deletedCustomers.map((n) => normalizeArabicName(n))
      );
      baseCustomers = baseCustomers.filter((c) => {
        const norm = c.normalizedName || normalizeArabicName(c.customerName);
        return !deletedSet.has(norm) && !overrides.deletedCustomers!.includes(c.customerName);
      });
    }

    // Append user-added customers for this active week
    if (overrides.addedCustomers && overrides.addedCustomers.length > 0) {
      for (const ac of overrides.addedCustomers) {
        const norm = ac.normalizedName || normalizeArabicName(ac.customerName);
        if (
          !baseCustomers.some(
            (c) => c.customerName === ac.customerName || normalizeArabicName(c.customerName) === norm
          )
        ) {
          baseCustomers.push({
            ...ac,
            index: baseCustomers.length + 1,
          });
        }
      }
    }
    // Ensure permanent Cash Customer exists and is pinned weekly
    const rawCashCust = (rawData?.customers || []).find(
      (c: any) => c.customerName === CASH_NAME || c.customerName.includes("نقدي")
    );
    const rawCashSheet = Number(rawCashCust?.collectedFromSheet) || 0;

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
        collectedFromSheet: rawCashSheet,
        collectedFromTreasury: 0,
        totalCollected: rawCashSheet,
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
      if (rawCashSheet > 0) {
        cashCust.collectedFromSheet = Math.max(cashCust.collectedFromSheet || 0, rawCashSheet);
      }
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
      let amt = Number(tx.amount) || 0;
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

      // Strictly exclude non-customer internal transactions like "النور نقدية" / "النور نقديه"
      if (
        normDesc.includes("النور نقد") ||
        normDesc.includes("نقديه النور") ||
        normDesc.includes("نقدية النور") ||
        normDesc.includes("نقدي النور") ||
        normDesc === "النور" ||
        normDesc === "معلف النور"
      ) {
        return;
      }

      // Check if an existing transaction in the pool already represents this payment
      for (const existing of weeklyTxMap.values()) {
        const existDate = (existing.date || effectiveWeekStart).trim();
        const curDate = (d || effectiveWeekStart).trim();
        if (existDate !== curDate) continue;

        const existIsCash = /^(نقدي|نقدى|كاش|عميل نقدي|عميل نقدى)$/.test(existing.description);
        const existNormDesc = existIsCash ? "نقدي" : normalizeArabicName(existing.description);
        const isSameCustomer = (isNormCash && existIsCash) || (existNormDesc === normDesc);

        if (isSameCustomer && Math.abs(existing.amount - amt) < 1) {
          // If both have receipts and they are authentic distinct system receipts (e.g. K3801 vs K3807), keep both!
          const isSynthetic = (r: string) => !r || r.startsWith("live_") || r.startsWith("raw_");
          if (existing.receipt && receiptNo && existing.receipt !== receiptNo && !isSynthetic(existing.receipt) && !isSynthetic(receiptNo)) {
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

      const txObj: TreasuryIncomingTx = {
        amount: amt,
        description: desc,
        type: typ,
        date: d || effectiveWeekStart,
      };
      if (receiptNo) {
        txObj.receipt = receiptNo;
      }
      weeklyTxMap.set(sig, txObj);
    };

    // 1. Determine date of live feed if present
    const liveReportDate = (liveTreasuryTx && liveTreasuryTx.length > 0 && liveTreasuryTx[0].date)
      ? liveTreasuryTx[0].date.trim()
      : "";

    // 1a. Rule (ب) تجميد الأيام السابقة: From cashflow_data.json, load past days of the active week (frozen)
    if (Array.isArray(rawData?.weeklyTreasuryTransactions)) {
      rawData.weeklyTreasuryTransactions.forEach((tx: any, idx: number) => {
        // Drop known duplicate transaction for Mahmoud Ismail
        if (tx.receipt === "live_2026-11-18_11") return;

        const txDate = String(tx.date || "").trim();
        // Rule (أ) Fresh Snapshot لليوم الحالي: If live feed is active for liveReportDate, skip cached copy of that day
        if (liveReportDate && txDate === liveReportDate && liveTreasuryTx && liveTreasuryTx.length > 0) {
          return;
        }
        if (!tx.receipt) {
          tx.receipt = `raw_${tx.date || "tx"}_${idx}`;
        }
        addTxToWeeklyPool(tx);
      });
    }

    // 1b. Rule (أ) Fresh Snapshot لليوم الحالي: Take current live incoming transactions
    if (Array.isArray(liveTreasuryTx) && liveTreasuryTx.length > 0) {
      liveTreasuryTx.forEach((tx: any, idx: number) => {
        if (!tx.receipt) {
          tx.receipt = `live_${tx.date || "tx"}_${idx}`;
        }
        addTxToWeeklyPool(tx);
      });
    }

    const cycleTreasuryTx = Array.from(weeklyTxMap.values());

    // Match live Treasury incoming transactions with customers
    const unmatchedTreasuryTx: TreasuryIncomingTx[] = [];

    // Pre-sort Tier 1 customers ONCE before the matching loop (prioritizing customers with expected amounts)
    const tier1Customers = [...baseCustomers].sort((a, b) => {
      const aExp = (a.expectedAmount || 0) > 0 ? 1 : 0;
      const bExp = (b.expectedAmount || 0) > 0 ? 1 : 0;
      return bExp - aExp;
    });

    // Pre-build fast O(1) exact normalized index for Master Data names
    const masterExactNormMap = new Map<string, string>();
    if (rawData?.masterCustomerNames && Array.isArray(rawData.masterCustomerNames)) {
      for (const mName of rawData.masterCustomerNames) {
        const n = normalizeArabicName(mName);
        if (n && !masterExactNormMap.has(n)) {
          masterExactNormMap.set(n, mName);
        }
      }
    }

    for (const tx of cycleTreasuryTx) {
      let matched = false;

      // Find all candidate customers that match the transaction description
      const candidateCusts = tier1Customers.filter((c) =>
        matchTreasuryDescriptionToCustomer(tx.description, c.customerName)
      );

      // If multiple candidates match (e.g. "محمد رمضان" or "باديه فارم"),
      // prioritize the one whose collectedFromSheet matches tx.amount, or who has an expected amount
      let prioritizedCandidates = candidateCusts;
      if (candidateCusts.length > 1) {
        prioritizedCandidates = [...candidateCusts].sort((a, b) => {
          const aSheetMatch = Math.abs((a.collectedFromSheet || 0) - tx.amount) < 1 ? 1 : 0;
          const bSheetMatch = Math.abs((b.collectedFromSheet || 0) - tx.amount) < 1 ? 1 : 0;
          if (bSheetMatch !== aSheetMatch) return bSheetMatch - aSheetMatch;

          const aExp = (a.expectedAmount || 0) > 0 ? 1 : 0;
          const bExp = (b.expectedAmount || 0) > 0 ? 1 : 0;
          return bExp - aExp;
        });
      }

      for (const cust of prioritizedCandidates) {
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

      // Tier 2: If not matched in Tier 1, search Master Data narrowed by:
      // 1. Exact normalized name match in O(1)
      // 2. Active debtors sorted by closest due date to tx.date
      // 3. Remaining master customers
      if (!matched) {
        const normTxDesc = normalizeArabicName(tx.description);
        let matchedMasterName = masterExactNormMap.get(normTxDesc) || "";

        // Narrow candidates by active balance & due date proximity
        if (!matchedMasterName) {
          const txDate = tx.date || liveReportDate || todayStr;
          const masterList = Array.isArray(rawData?.masterCustomers) && rawData.masterCustomers.length > 0
            ? [...rawData.masterCustomers]
            : (rawData?.masterCustomerNames || []).map((n: string) => ({ customerName: n }));

          masterList.sort((a: any, b: any) => {
            const aBal = Number(a.currentBalance) || 0;
            const bBal = Number(b.currentBalance) || 0;
            const aActive = !a.isKhalis && aBal > 0 ? 1 : 0;
            const bActive = !b.isKhalis && bBal > 0 ? 1 : 0;
            if (bActive !== aActive) return bActive - aActive;

            const getDiff = (dStr?: string) => {
              if (!dStr || dStr.length < 10) return 9999;
              const d = new Date(dStr.slice(0, 10)).getTime();
              const t = new Date(txDate.slice(0, 10)).getTime();
              return isNaN(d) || isNaN(t) ? 9999 : Math.abs(d - t);
            };
            const aDiff = getDiff(a.dueDate);
            const bDiff = getDiff(b.dueDate);
            if (aDiff !== bDiff) return aDiff - bDiff;

            return bBal - aBal;
          });

          for (const mc of masterList) {
            if (matchTreasuryDescriptionToCustomer(tx.description, mc.customerName)) {
              matchedMasterName = mc.customerName;
              break;
            }
          }
        }

        const validCustName = matchedMasterName;
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
              : 0;
            const dueDate = matchedMasterCust?.dueDate || "";

            // STRICT USER REQUIREMENT:
            // "المفروض العميل النقدي ف قايمة الكاش فلو يستقل بذاته زي مهو بنفس طريقة عرضه
            // لكن لما عملاء تيجي وهي مكنتش ف الكاش فلو تدخل ب اسمها عادي ولكن بمتوقع صفر"
            const isCustPinned = Boolean(
              getOverridePinned(overrides, custName, rawConfig) ?? false
            );
            const overrideAmt = getOverrideFixedAmount(overrides, custName, rawConfig);
            const expectedAmount = isCustPinned
              ? (overrideAmt ?? 0)
              : 0; // Strictly 0 for unexpected inflow!

            let notes =
              matchedMasterCust?.notes !== undefined
                ? matchedMasterCust.notes
                : overrides.notes?.[custName] !== undefined
                ? overrides.notes[custName]
                : rawConfig?.notes?.[custName] || "";
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
              isUnexpectedInflow: !(dueDate && dueDate >= weekInfo.weekStart && dueDate <= weekInfo.weekEnd),
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
      // Avoid double-counting only if a specific treasury transaction already represents the sheet collection (same amount within 1 EGP)
      const sheetAmt = Number(cust.collectedFromSheet) || 0;
      const treasAmt = Number(cust.collectedFromTreasury) || 0;
      const treasTxs = cust.treasuryTransactions || [];

      const hasMatchingTreasTx = treasTxs.some(
        (tx) => Math.abs((Number(tx.amount) || 0) - sheetAmt) < 1
      );

      if (sheetAmt > 0 && treasAmt > 0) {
        if (hasMatchingTreasTx) {
          cust.totalCollected = treasAmt;
        } else {
          cust.totalCollected = treasAmt + sheetAmt;
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

      const isCurrentWeek = Boolean(cust.dueDate && cust.dueDate >= weekInfo.weekStart && cust.dueDate <= weekInfo.weekEnd);
      const isUnexpected = isCurrentWeek ? false : Boolean(cust.isUnexpectedInflow);

      // Strict User Rule: "لو عميل كان مش ف القائمة وسدد فلوس نازلها ف القائمة باسمه ولكن المتوقع بتاعه يكون صفر"
      // If customer is due in a future week (> weekInfo.weekEnd) or is an unexpected inflow, their expectedAmount MUST BE 0!
      if (
        !isCashCust &&
        !cust.isPinned &&
        ((cust.dueDate && cust.dueDate > weekInfo.weekEnd) || isUnexpected)
      ) {
        cust.expectedAmount = 0;
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

    const activePreviousWeek = remotePrevWeek || storedPreviousWeek || rawConfig?.previousWeek;
    if (!remotePrevWeek && storedPreviousWeek) {
      saveRemotePreviousWeek(storedPreviousWeek).catch(() => {});
    }
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
    await saveRemotePreviousWeek(newPreviousWeek);

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
    const isPinned = c.isPinned || getOverridePinned(overrides, c.customerName) || false;
    if (isPinned) {
      const overrideAmt = getOverrideFixedAmount(overrides, c.customerName);
      const fixedAmt = overrideAmt !== undefined ? overrideAmt : c.expectedAmount;

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
      const overrideAmt = getOverrideFixedAmount(overrides, m.customerName);
      const expAmt =
        overrideAmt !== undefined
          ? overrideAmt
          : m.currentBalance;

      const custNotes = getOverrideNote(overrides, m.customerName) || m.notes || "";

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
