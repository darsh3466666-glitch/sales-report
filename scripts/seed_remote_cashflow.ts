import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import config from "../firebase-applet-config.json";
import { getLiveCashFlowData, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_CYCLE_DOC, FIRESTORE_CF_OVERRIDES_DOC } from "../src/lib/cashflow.functions";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Initializing Firebase app for Cash Flow remote sync...");
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);

  // 1. Get current authentic cashflow summary from local engine
  const summary = await getLiveCashFlowData();
  const mahmoudInSummary = summary.customers.find((c: any) => c.customerName.includes("محمود اسماعيل"));
  console.log("Mahmoud in summary before saving to Firestore:", mahmoudInSummary);
  console.log(`Extracted summary: ${summary.customers.length} customers, Total Expected: ${summary.totalExpected}, Total Collected: ${summary.totalCollected}`);

  // 2. Read notes and fixedAmounts from cashflow_config.json if available
  let cfgNotes: Record<string, string> = {};
  let cfgFixed: Record<string, number> = {};
  let cfgPinned: Record<string, boolean> = {};

  const cfgPath = path.resolve(process.cwd(), "public", "cashflow_config.json");
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      cfgNotes = cfg.notes || {};
      cfgFixed = cfg.fixedAmounts || {};
      cfgPinned = cfg.pinnedCustomers || {};
    } catch (e) {}
  }

  // 3. Prepare User Overrides, strictly preserving user-deleted and manually added customers!
  let existingDeleted: string[] = [];
  let existingAdded: any[] = [];
  const ovRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_OVERRIDES_DOC);
  try {
    const ovSnap = await getDoc(ovRef);
    if (ovSnap.exists()) {
      const d = ovSnap.data();
      if (Array.isArray(d?.deletedCustomers)) existingDeleted = d.deletedCustomers;
      if (Array.isArray(d?.addedCustomers)) existingAdded = d.addedCustomers;
    }
  } catch (e) {}

  const userOverrides = {
    fixedAmounts: cfgFixed,
    notes: cfgNotes,
    pinnedStatus: cfgPinned,
    deletedCustomers: existingDeleted,
    addedCustomers: existingAdded,
    updatedAt: new Date().toISOString()
  };

  // 4. Prepare Active Cycle State
  const activeCycleState = {
    cycleId: `week_${summary.weekStart}_to_${summary.weekEnd}`,
    weekStart: summary.weekStart,
    weekEnd: summary.weekEnd,
    weekLabel: summary.weekLabel,
    weeklyGoal: summary.weeklyGoal || 4000000,
    customers: summary.customers,
    updatedAt: new Date().toISOString(),
    source: "seed_sync_v9"
  };

  console.log("Saving user overrides to Firestore...");
  await setDoc(ovRef, userOverrides, { merge: true });

  console.log("Saving active cycle state to Firestore...");
  const cycleRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_CYCLE_DOC);
  const cleanActiveCycleState = JSON.parse(JSON.stringify(activeCycleState));
  await setDoc(cycleRef, cleanActiveCycleState, { merge: true });

  // 5. Verify Firestore write
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
