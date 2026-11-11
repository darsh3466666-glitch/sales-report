# Gates: Remove Manufacturing Column & Audit Artificial Manufacturing Formula

OWNS: src/components/dashboard/CustomerTable.tsx, src/lib/excel-parser.functions.ts, src/components/dashboard/TopProductsSection.tsx

Scope: Remove the redundant 'تشغيل تصنيع' column from the Customer Table as requested, neutralize the artificial reverse-engineered standard recipe in computeManufacturingQuantities, and document the formula mechanics and flaws thoroughly.

- [ ] G1: Column 'تشغيل تصنيع' is removed from CustomerTable.tsx and the clean 'المبيعات' column is restored
  CHECK: node -e "const fs = require('fs'); const code = fs.readFileSync('src/components/dashboard/CustomerTable.tsx', 'utf8'); if (!code.includes('تشغيل تصنيع <ArrowUpDown') && code.includes('المبيعات <ArrowUpDown')) { console.log('PASS: customer table column reverted'); } else { process.exit(1); }"
  EXPECT: PASS: customer table column reverted

- [ ] G2: Artificial reverse-engineering recipe in excel-parser.functions.ts is neutralized so fictional manufacturing is not generated
  CHECK: node -e "const fs = require('fs'); const code = fs.readFileSync('src/lib/excel-parser.functions.ts', 'utf8'); if (!code.includes('ذره صفراء: 650') || code.includes('// HEURISTIC_DISABLED')) { console.log('PASS: artificial recipe neutralized'); } else { process.exit(1); }"
  EXPECT: PASS: artificial recipe neutralized

- [ ] G3: Production build succeeds with 0 errors
  CHECK: npm run build
  EXPECT: SUCCESS_BUILD_VERIFIED
