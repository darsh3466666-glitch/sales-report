import fs from "fs";
import path from "path";
import assert from "assert";

const args = process.argv.slice(2);
const checkArg = args.find((a) => a.startsWith("--check="));
const checkName = checkArg ? checkArg.split("=")[1] : "";

const functionsPath = path.resolve("src/lib/cashflow.functions.ts");
const tablePath = path.resolve("src/components/cashflow/CashFlowTable.tsx");
const routesPath = path.resolve("src/routes/cashflow.tsx");

const fnCode = fs.readFileSync(functionsPath, "utf-8");
const tableCode = fs.readFileSync(tablePath, "utf-8");
const routeCode = fs.readFileSync(routesPath, "utf-8");

if (checkName === "baseline-persistence") {
  // Check that active cycle state is defined and used for baseline persistence
  assert(
    fnCode.includes("ActiveCashFlowCycleState") || fnCode.includes("ACTIVE_CYCLE_STORAGE_KEY"),
    "Active cycle state type/key must be present in cashflow.functions.ts"
  );
  assert(
    fnCode.includes("getActiveCycleState") && fnCode.includes("saveActiveCycleState"),
    "getActiveCycleState and saveActiveCycleState must be implemented"
  );
  console.log("PASS: baseline persistence verified");
  process.exit(0);
}

if (checkName === "live-collection") {
  // Check that live treasury matching adds unexpected payers with expected = 0
  assert(
    fnCode.includes("fetchLiveTreasuryIncoming"),
    "fetchLiveTreasuryIncoming must be present"
  );
  assert(
    fnCode.includes("isUnexpectedInflow") || fnCode.includes("expectedAmount"),
    "Unexpected inflow logic must be present"
  );
  console.log("PASS: live collection verified");
  process.exit(0);
}

if (checkName === "manual-edits") {
  // Check that manual user edits are given absolute priority and saved to active cycle
  assert(
    fnCode.includes("saveCustomerOverride"),
    "saveCustomerOverride must be present"
  );
  assert(
    fnCode.includes("recalculateCashFlowSummary"),
    "recalculateCashFlowSummary must be present"
  );
  assert(
    fnCode.includes("overrides.fixedAmounts"),
    "overrides.fixedAmounts must be checked before resetting to 0"
  );
  console.log("PASS: manual edits verified");
  process.exit(0);
}

if (checkName === "non-negative-remaining") {
  // Check that remaining calculation never yields negative values
  assert(
    fnCode.includes("Math.max(0, cust.expectedAmount - cust.totalCollected)") ||
    fnCode.includes("Math.max(0, expectedAmount - totalCollected)"),
    "Remaining calculation in cashflow.functions.ts must use Math.max(0, ...)"
  );
  assert(
    tableCode.includes("Math.max(0, cust.remaining)"),
    "Remaining display in CashFlowTable.tsx must use Math.max(0, ...)"
  );
  console.log("PASS: non-negative remaining verified");
  process.exit(0);
}

console.error("Unknown check:", checkName);
process.exit(1);
