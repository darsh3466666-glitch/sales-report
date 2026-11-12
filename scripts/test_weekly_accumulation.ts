import { getLiveCashFlowData } from "../src/lib/cashflow.functions";
import { normalizeArabicName } from "../src/lib/excel-parser.functions";

async function run() {
  const args = process.argv.slice(2);
  const checkPool = args.includes("--check-pool");
  const checkCustomers = args.includes("--check-customers");
  const checkTotals = args.includes("--check-totals");

  console.log("Fetching live cashflow data with weekly accumulation...");
  const summary = await getLiveCashFlowData({ referenceDate: "2026-11-12" });

  if (checkPool) {
    // Collect all matched + unmatched treasury transactions in summary
    let allTxCount = 0;
    let allTxSum = 0;
    for (const c of summary.customers) {
      if (Array.isArray(c.treasuryTransactions)) {
        for (const tx of c.treasuryTransactions) {
          allTxCount++;
          allTxSum += (tx.amount || 0);
        }
      }
    }
    for (const tx of summary.unmatchedTreasuryTx || []) {
      allTxCount++;
      allTxSum += (tx.amount || 0);
    }

    console.log(`Pool contains ${allTxCount} transactions with total ${allTxSum} EGP`);
    if (allTxSum === 477450) {
      console.log("PASS: multi-day transactions accumulated");
      return;
    } else {
      console.error(`FAIL: expected 477450 but got ${allTxSum}`);
      process.exitCode = 1;
      return;
    }
  }

  if (checkCustomers) {
    const custMap = new Map<string, any>();
    for (const c of summary.customers) {
      custMap.set(c.customerName, c);
      custMap.set(normalizeArabicName(c.customerName), c);
    }

    const checks = [
      { name: "محمد يونس عبد اللطيف(قلمشاه)", expectedColl: 200000, status: "مكتمل" },
      { name: "احمد راغب(الهداهدة)", expectedColl: 30000, status: "مكتمل" },
      { name: "اسامه علي عبد الكريم", expectedColl: 44000, status: "مكتمل" },
      { name: "محمود ابو زيد - الهداهده", expectedColl: 16000, status: "مكتمل" },
      { name: "ابو حمزة للأعلاف", expectedColl: 140000, status: "مكتمل" },
      { name: "محمد ابو فهد-المنيب", expectedColl: 39200, status: "مكتمل" },
      { name: "علي محمد (نصار)", expectedColl: 5700, status: "مكتمل" },
      { name: "عميل نقدي (كاش)", expectedColl: 2550, status: "مكتمل" },
    ];

    let allPass = true;
    for (const chk of checks) {
      const normChk = normalizeArabicName(chk.name);
      let cust = custMap.get(chk.name) || custMap.get(normChk);
      if (!cust) {
        // Try partial match
        for (const [k, v] of custMap.entries()) {
          if (k.includes(normChk) || normChk.includes(k)) {
            cust = v;
            break;
          }
        }
      }

      if (!cust) {
        console.error(`FAIL: customer ${chk.name} not found in summary`);
        allPass = false;
        continue;
      }

      const coll = cust.collectedFromTreasury || cust.totalCollected || 0;
      if (coll < chk.expectedColl) {
        console.error(`FAIL: ${chk.name} collected ${coll} < expected ${chk.expectedColl}`);
        allPass = false;
      } else if (chk.status && cust.status !== chk.status) {
        console.error(`FAIL: ${chk.name} status is ${cust.status}, expected ${chk.status}`);
        allPass = false;
      } else {
        console.log(`OK: ${chk.name} -> ${coll} EGP (${cust.status})`);
      }
    }

    if (allPass) {
      console.log("PASS: all weekly customers accumulated");
      return;
    } else {
      process.exitCode = 1;
      return;
    }
  }

  if (checkTotals) {
    console.log(`Total collected from treasury: ${summary.collectedFromTreasury}`);
    if (summary.collectedFromTreasury === 477450) {
      console.log("PASS: total treasury weekly inflow verified");
      return;
    } else {
      console.error(`FAIL: expected 477450 but got ${summary.collectedFromTreasury}`);
      process.exitCode = 1;
      return;
    }
  }

  console.log("No specific flag provided. Run with --check-pool, --check-customers, or --check-totals.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
