import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import config from "../firebase-applet-config.json";
import {
  getLiveCashFlowData,
  getCurrentCashFlowWeekWindow,
  pruneExpiredNonPinnedOverrides,
  FIRESTORE_CF_COLLECTION,
  FIRESTORE_CF_CYCLE_DOC,
  FIRESTORE_CF_OVERRIDES_DOC,
} from "../src/lib/cashflow.functions";
import { normalizeArabicName } from "../src/lib/excel-parser.functions";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Initializing Firebase app for Cash Flow remote sync...");
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);

  // 1. Load & clean User Overrides in Firestore FIRST (remove stale non-pinned fixedAmounts from older cycles!)
  const cfgPath = path.resolve(process.cwd(), "public", "cashflow_config.json");
  let cfgNotes: Record<string, string> = {};
  let cfgFixed: Record<string, number> = {};
  let cfgPinned: Record<string, boolean> = {};
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      cfgNotes = cfg.notes || {};
      cfgFixed = cfg.fixedAmounts || {};
      cfgPinned = cfg.pinnedCustomers || {};
    } catch (e) {}
  }

  const ovRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_OVERRIDES_DOC);
  let remoteOv: any = {};
  try {
    const ovSnap = await getDoc(ovRef);
    if (ovSnap.exists()) remoteOv = ovSnap.data() || {};
  } catch (e) {}

  const weekInfo = getCurrentCashFlowWeekWindow();
  const currentCycleId = `week_${weekInfo.weekStart}_to_${weekInfo.weekEnd}`;

  // Merge pinned & notes without overwriting live Firestore browser edits or resurrecting deleted customers
  const mergedPinned: Record<string, boolean> = { ...cfgPinned, ...(remoteOv.pinnedStatus || {}) };
  const mergedNotes: Record<string, string> = { ...cfgNotes, ...(remoteOv.notes || {}) };
  const mergedFixed: Record<string, number> = { ...(remoteOv.fixedAmounts || {}) };
  for (const [k, v] of Object.entries(cfgFixed)) {
    const norm = normalizeArabicName(k);
    const hasRemote = Object.keys(mergedFixed).some((rk) => normalizeArabicName(rk) === norm);
    if (!hasRemote && mergedPinned[k]) {
      mergedFixed[k] = Number(v);
    }
  }

  const rawMergedOverrides = {
    fixedAmounts: mergedFixed,
    fixedCycleIds: remoteOv.fixedCycleIds || {},
    notes: mergedNotes,
    pinnedStatus: mergedPinned,
    deletedCustomers: Array.isArray(remoteOv.deletedCustomers) ? remoteOv.deletedCustomers : [],
    addedCustomers: Array.isArray(remoteOv.addedCustomers) ? remoteOv.addedCustomers : [],
    updatedAt: new Date().toISOString(),
    itemTimestamps: remoteOv.itemTimestamps || {},
  };

  const { cleaned: cleanedOverrides, changed } = pruneExpiredNonPinnedOverrides(rawMergedOverrides, currentCycleId);
  if (changed || !remoteOv.updatedAt) {
    console.log("Cleaning expired non-pinned fixedAmounts in Firestore user_overrides...");
  }
  // Replace whole overrides doc (no merge:true) so deleted/pruned fixedAmounts keys are actually removed from Firestore
  await setDoc(ovRef, JSON.parse(JSON.stringify(cleanedOverrides)));

  const cycleRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_CYCLE_DOC);
  let remoteCycleSource = "";
  try {
    const cSnap = await getDoc(cycleRef);
    if (cSnap.exists()) remoteCycleSource = String(cSnap.data()?.source || "");
  } catch (e) {}

  // 2. Get current authentic cashflow summary using cleaned Firestore overrides & live Master_Data
  // If migrating from an older schema before seed_sync_v12, force refreshing non-pinned baseline from Master_Data
  const forceRefreshNonPinnedBaseline = remoteCycleSource !== "seed_sync_v12";
  const summary = await getLiveCashFlowData({ forceRefreshNonPinnedBaseline });
  console.log(`Extracted summary: ${summary.customers.length} customers, Total Expected: ${summary.totalExpected}, Total Collected: ${summary.totalCollected}`);

  // 3. Prepare Active Cycle State
  const activeCycleState = {
    cycleId: `week_${summary.weekStart}_to_${summary.weekEnd}`,
    weekStart: summary.weekStart,
    weekEnd: summary.weekEnd,
    weekLabel: summary.weekLabel,
    weeklyGoal: summary.weeklyGoal || 4000000,
    customers: summary.customers,
    weeklyTreasuryTransactions: summary.weeklyTreasuryTransactions || [],
    updatedAt: new Date().toISOString(),
    source: "seed_sync_v12",
  };

  console.log("Saving active cycle state to Firestore...");
  await setDoc(cycleRef, JSON.parse(JSON.stringify(activeCycleState)));

  const verifySnap = await getDoc(cycleRef);
  if (verifySnap.exists()) {
    const d = verifySnap.data();
    console.log(`SUCCESS! Remote cycle verified in Firestore: cycleId=${d.cycleId}, customers=${d.customers?.length}`);
  } else {
    console.error("FAIL: Could not verify Firestore cycle document!");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Error seeding remote cashflow:", err);
  process.exit(1);
});
