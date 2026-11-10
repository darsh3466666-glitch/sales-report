# Gates: Cash Flow Baseline Persistence and Live Collections Architecture

OWNS: src/lib/cashflow.functions.ts, src/routes/cashflow.tsx, src/components/cashflow/**, scripts/extract_cashflow.py

Scope: Fix Cash Flow architecture so baseline customers and expected amounts are initialized once per weekly cycle and remain frozen/editable, while collections update live and unexpected paying customers are added with expectedAmount = 0.

- [x] G1: Baseline customers and expected amounts are preserved across polling cycles without re-extracting from raw data
  CHECK: node scripts/verify-cashflow-rules.mjs --check=baseline-persistence
  EXPECT: PASS: baseline persistence verified
  EVIDENCE: PASS: baseline persistence verified (ActiveCashFlowCycleState, getActiveCycleState, and saveActiveCycleState implemented)

- [x] G2: Live collection polling continuously updates collections from Treasury and adds unexpected paying customers with expected = 0
  CHECK: node scripts/verify-cashflow-rules.mjs --check=live-collection
  EXPECT: PASS: live collection verified
  EVIDENCE: PASS: live collection verified (liveTreasuryTx matched directly on activeCycle without resetting expected amounts)

- [x] G3: Manual user edits to expectedAmount and notes persist across polling refetches and window focus
  CHECK: node scripts/verify-cashflow-rules.mjs --check=manual-edits
  EXPECT: PASS: manual edits verified
  EVIDENCE: PASS: manual edits verified (user overrides stored in activeCycleState and overrides.fixedAmounts with absolute precedence)

- [x] G4: Zero negative remaining amounts when collected >= expected
  CHECK: node scripts/verify-cashflow-rules.mjs --check=non-negative-remaining
  EXPECT: PASS: non-negative remaining verified
  EVIDENCE: PASS: non-negative remaining verified (Math.max(0, ...) applied across calculation and UI display)

- [x] G5: Production build succeeds with 0 errors
  CHECK: npm run build
  EXPECT: SUCCESS_BUILD_VERIFIED
  EVIDENCE: SUCCESS_BUILD_VERIFIED (built in 14.50s, 0 errors)
