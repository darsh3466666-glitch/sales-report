# Gates: Independent Cash Customer & Individual Unexpected Inflow Rows in Cashflow

OWNS: src/lib/cashflow.functions.ts, scripts/extract_cashflow.py

Scope: Ensure 'عميل نقدي (كاش)' in the Cashflow dashboard is strictly independent and only aggregates genuine generic cash receipts (not any transaction merely because tx.type is 'كاش'). Any customers who make payments but were not in the baseline cashflow table must enter under their own individual names with expectedAmount = 0 and their actual collected amounts.

- [x] G1: Generic cash routing in cashflow.functions.ts checks description only, not tx.type
  CHECK: node -e "const fs = require('fs'); const code = fs.readFileSync('src/lib/cashflow.functions.ts', 'utf8'); if (!code.includes('tx.type === \"كاش\"') && code.includes('isGenericCash')) { console.log('PASS: tx.type cash bug removed'); } else { process.exit(1); }"
  EXPECT: PASS: tx.type cash bug removed
  RESULT: PASS: tx.type cash bug removed

- [x] G2: Verification engine accurately separates named treasury customers from عميل نقدي
  CHECK: npx tsx scripts/test_cashflow_fix.ts
  EXPECT: PASS: cash separated and named customers added
  RESULT: Total customers: 36
    - عميل نقدي (كاش): Treasury: 850, Expected: 850
    - اسامه علي عبد الكريم: Treasury: 44000, Expected: 0
    - احمد راغب(الهداهدة): Treasury: 30000, Expected: 0
    - محمود ابو زيد - الهداهده: Treasury: 16000, Expected: 0
    - محمد يونس عبد اللطيف(قلمشاه): Treasury: 200000, Expected: 0
    PASS: cash separated and named customers added

- [x] G3: Production build succeeds with 0 errors
  CHECK: npm run build
  EXPECT: SUCCESS_BUILD_VERIFIED
  RESULT: SUCCESS_BUILD_VERIFIED (built in 14.74s)
