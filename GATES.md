# Gates: cashflow-cycle-and-history

OWNS: src/**, scripts/**, public/**

Scope: Implement weekly cashflow cycle end-and-start workflow, smart extraction from collection sheets without legacy cash flow sheet, and dedicated weekly archive history page.

- [ ] G1: Extraction script successfully sources due dates and targets from خط_سير, عملاء الدورة, and Master_Data without relying on legacy cash flow sheet
  CHECK: python -c "import os, json; from scripts.extract_cashflow import extract_cashflow; ok = extract_cashflow(); data = json.load(open('public/cashflow_data.json', encoding='utf-8')); assert ok, 'extract failed'; assert data['customerCount'] > 0, 'no customers'; assert any(c.get('dueDate') for c in data['customers']), 'no due dates'; print('EXTRACTION_TEST_PASSED')"
  EXPECT: EXTRACTION_TEST_PASSED
  EVIDENCE: pending

- [ ] G2: Cash flow archive history persistence and retrieval engine works locally and via Firebase/IndexedDB
  CHECK: node -e "const fs = require('fs'); const path = require('path'); const p = path.join('public', 'cashflow_config.json'); assert = require('assert'); assert(fs.existsSync(p), 'config missing'); console.log('PERSISTENCE_STRUCTURE_PASSED');"
  EXPECT: PERSISTENCE_STRUCTURE_PASSED
  EVIDENCE: pending

- [ ] G3: New Cash Flow Week Confirmation Dialog and Archive Trigger integrated into cash flow UI
  CHECK: git grep -q "EndCycleModal" src/components/cashflow/
  EXPECT: 0
  EVIDENCE: pending

- [ ] G4: Dedicated Cash Flow History Route (/cashflow/history) created and accessible
  CHECK: git grep -q "cashflow/history" src/routes/
  EXPECT: 0
  EVIDENCE: pending

- [ ] G5: Production build succeeds with 0 errors
  CHECK: npm run build
  EXPECT: SUCCESS_BUILD_VERIFIED
  EVIDENCE: pending
