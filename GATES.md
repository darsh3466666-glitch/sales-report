# Gates: Multi-Day Weekly Treasury Accumulation & Collection Persistence in Cashflow

OWNS: src/lib/cashflow.functions.ts, public/cashflow_data.json, dist/cashflow_data.json, scripts/extract_cashflow.py

Scope: Fix the critical flaw where daily rollover in the external treasury dashboard wipes previous days' collections within the active week. Ensure all incoming treasury and bank transactions accumulate across all days of the weekly cycle (Wednesday through Tuesday) so that payments from earlier in the week (e.g. Mohammed Younes 200k, Ahmed Ragheb 30k, Osama Ali 44k, Mahmoud Abuzeid 16k) remain permanently credited and accumulated alongside new daily payments (Abu Hamza 140k, Abu Fahd 39.2k, Ali Mohamed 5.7k, Cash).

- [x] G1: Multi-day weekly treasury transactions pool merges and preserves past days of active cycle
  CHECK: npx tsx scripts/test_weekly_accumulation.ts --check-pool
  EXPECT: PASS: multi-day transactions accumulated
  RESULT: PASS: multi-day transactions accumulated (10 transactions across multiple days)

- [x] G2: Individual customer amounts and statuses accurately reflect cumulative weekly collections
  CHECK: npx tsx scripts/test_weekly_accumulation.ts --check-customers
  EXPECT: PASS: all weekly customers accumulated
  RESULT: PASS: all weekly customers accumulated (All 8 key customer groups verified)

- [x] G3: Total weekly treasury inflow equals sum of active cycle days (477,450 EGP)
  CHECK: npx tsx scripts/test_weekly_accumulation.ts --check-totals
  EXPECT: PASS: total treasury weekly inflow verified
  RESULT: PASS: total treasury weekly inflow verified (477,450 EGP)

- [x] G4: Production build succeeds with 0 errors
  CHECK: npm run build
  EXPECT: SUCCESS_BUILD_VERIFIED
  RESULT: SUCCESS_BUILD_VERIFIED (built in 14.55s)
