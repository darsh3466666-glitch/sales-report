import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import config from "../firebase-applet-config.json";
import {
  getLiveCashFlowData,
  FIRESTORE_CF_COLLECTION,
  FIRESTORE_CF_CYCLE_DOC,
  FIRESTORE_CF_OVERRIDES_DOC,
} from "../src/lib/cashflow.functions";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Initializing Firebase app...");
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);

  const ovRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_OVERRIDES_DOC);
  const ovSnap = await getDoc(ovRef);
  const existingOv = ovSnap.exists() ? ovSnap.data() : {};

  // Pinned customers definition
  const pinnedCustomers: Record<string, boolean> = {
    "عميل نقدي (كاش)": true,
    "مزرعه الخيرات": true,
    "محمد يونس عبد اللطيف(قلمشاه)": true,
    "ابو حمزة للأعلاف": true,
    "ايه بي ديري /هشام فؤادطارق حسن وشركاه": true,
    "عيد احمد عبد الفتاح(ابو السعود)": true,
    "عبد التواب احمد( ميدوم )": true,
    "ايمن محمود يوسف (طاميه)": true,
    "المعلم/ عبد الفتاح ربيع": true,
    "بادية فارم (كوم ابو راضي)": true,
    "د.هاني محمود يوسف (طاميه)": true,
  };

  const cleanFixedAmounts: Record<string, number> = {
    "عميل نقدي (كاش)": 0,
    "مزرعه الخيرات": 300000,
    "محمد يونس عبد اللطيف(قلمشاه)": 200000,
    "ابو حمزة للأعلاف": 280000,
    "ايه بي ديري /هشام فؤادطارق حسن وشركاه": 100000,
    "عيد احمد عبد الفتاح(ابو السعود)": 150000,
    "عبد التواب احمد( ميدوم )": 120000,
    "ايمن محمود يوسف (طاميه)": 150000,
    "المعلم/ عبد الفتاح ربيع": 150000,
  };

  const cleanOverrides = {
    fixedAmounts: cleanFixedAmounts,
    notes: existingOv.notes || {},
    pinnedStatus: { ...(existingOv.pinnedStatus || {}), ...pinnedCustomers },
    deletedCustomers: Array.isArray(existingOv.deletedCustomers) ? existingOv.deletedCustomers : [],
    addedCustomers: Array.isArray(existingOv.addedCustomers) ? existingOv.addedCustomers : [],
    updatedAt: new Date().toISOString(),
  };

  // Explicitly ensure unpinned customers are NOT pinned
  cleanOverrides.pinnedStatus["كرم مسعود ابو بكر (الهداهده)"] = false;
  cleanOverrides.pinnedStatus["ايمن علي حسن"] = false;
  cleanOverrides.pinnedStatus["قرنى احمد محمد حسين (كمال علوى)"] = false;
  cleanOverrides.pinnedStatus["علي محمد (نصار)"] = false;
  cleanOverrides.pinnedStatus["حماده عبد الخالق قيصر"] = false;
  cleanOverrides.pinnedStatus["محمود ابو زيد - الهداهده"] = false;
  cleanOverrides.pinnedStatus["سامي قرني(اسعد نصيف)"] = false;
  cleanOverrides.pinnedStatus["مرسي (مدشه)"] = false;
  cleanOverrides.pinnedStatus["عدلي عبدالهادي (ابو شويقي)"] = false;
  cleanOverrides.pinnedStatus["اسامه علي عبد الكريم"] = false;

  console.log("Saving clean user overrides (without stale fixed amounts)...");
  await setDoc(ovRef, cleanOverrides); // Full overwrite, removes all 60 stale entries!

  // Update public/cashflow_config.json as well
  const cfgPath = path.resolve(process.cwd(), "public", "cashflow_config.json");
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.fixedAmounts = cleanFixedAmounts;
    cfg.pinnedCustomers = cleanOverrides.pinnedStatus;
    cfg.updatedAt = new Date().toISOString();
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
    console.log("Updated public/cashflow_config.json");
  }

  // Now recalculate clean live summary with the clean overrides
  console.log("Generating clean live cash flow data...");
  const summary = await getLiveCashFlowData();
  console.log(`Summary has ${summary.customers.length} customers, expected=${summary.totalExpected}, collected=${summary.totalCollected}`);

  // Save clean active cycle to Firestore
  console.log("Saving clean active cycle state to Firestore...");
  const cycleRef = doc(db, FIRESTORE_CF_COLLECTION, FIRESTORE_CF_CYCLE_DOC);
  const activeCycleState = {
    cycleId: `week_${summary.weekStart}_to_${summary.weekEnd}`,
    weekStart: summary.weekStart,
    weekEnd: summary.weekEnd,
    weekLabel: summary.weekLabel,
    weeklyGoal: summary.weeklyGoal || 4000000,
    customers: summary.customers,
    updatedAt: new Date().toISOString(),
    source: "clean_zero_expected_sync_v1",
  };
  await setDoc(cycleRef, JSON.parse(JSON.stringify(activeCycleState)));

  // Verification
  console.log("VERIFYING TARGET CUSTOMERS IN FIRESTORE:");
  const verifySnap = await getDoc(cycleRef);
  const data = verifySnap.data();
  const targets = ["قرنى", "ايمن علي", "علي محمد", "حماده", "كرم مسعود", "سامي", "مرسي", "عدلي"];
  for (const c of data?.customers || []) {
    if (targets.some((t: string) => c.customerName.includes(t))) {
      console.log(`  -> "${c.customerName}" | Exp: ${c.expectedAmount} | Coll: ${c.totalCollected} | Due: ${c.dueDate}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error cleaning and seeding:", err);
  process.exit(1);
});
