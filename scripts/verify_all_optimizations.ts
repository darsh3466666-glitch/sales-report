import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  matchTreasuryDescriptionToCustomer,
  cleanCustomerMatchingName,
} from '../src/lib/cashflow.functions';
import {
  normalizeArabicName,
  countCustomerInvoices,
  getInvoiceIndex,
} from '../src/lib/excel-parser.functions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function verifyAll() {
  console.log('========================================================');
  console.log('   AUDIT & VERIFICATION: ALL REPORTS & ALGORITHMS');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, cond: boolean) {
    if (cond) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Sales Report Integrity Verification
  console.log('--- 1. Comprehensive Sales Report Verification ---');
  const salesPath = path.join(rootDir, 'public', 'sales_data.json');
  assert('public/sales_data.json exists', fs.existsSync(salesPath));

  const salesData = JSON.parse(fs.readFileSync(salesPath, 'utf8'));
  assert('sales_data.json is non-empty array', Array.isArray(salesData) && salesData.length > 0);

  const latest = salesData[0];
  assert('Latest report date is valid', Boolean(latest?.report?.report_date));
  assert('Total sales matches', (latest?.report?.total_sales || 0) > 0);
  assert('Customers list exists and populated', (latest?.customers || []).length > 0);
  assert('Invoices list exists and populated', (latest?.invoices || []).length > 0);

  // Test O(1) invoice index on sales invoices
  const dummyInvoices = [
    { customer_name: 'احمد محمد مرداشي (وحيد كامل)' },
    { customer_name: 'احمد محمد مرداشي (وحيد كامل)' },
    { customer_name: 'حسام عدلي' },
  ];
  const idx = getInvoiceIndex(dummyInvoices);
  assert('Invoice exact map is indexed', idx.exactMap.get('احمد محمد مرداشي (وحيد كامل)') === 2);
  assert('Invoice norm map is indexed', idx.normMap.get(normalizeArabicName('حسام عدلي')) === 1);
  assert('countCustomerInvoices returns accurate count', countCustomerInvoices('احمد محمد مرداشي (وحيد كامل)', 50000, dummyInvoices) === 2);

  // 2. Cash Flow Report & Matching Algorithms
  console.log('\n--- 2. Cash Flow Report & Matching Algorithms ---');
  const cfPath = path.join(rootDir, 'public', 'cashflow_data.json');
  assert('public/cashflow_data.json exists', fs.existsSync(cfPath));

  const cfData = JSON.parse(fs.readFileSync(cfPath, 'utf8'));
  assert('Cash flow customers populated', (cfData?.customers || []).length > 0);
  assert('Master customers populated', (cfData?.masterCustomers || []).length > 0);
  assert('Weekly treasury transactions populated', (cfData?.weeklyTreasuryTransactions || []).length > 0);

  // Verify Mordash matching
  const mordashMatch = matchTreasuryDescriptionToCustomer(
    'احمد محمد مرداش',
    'احمد محمد مرداشي (وحيد كامل)'
  );
  assert('Ahmed Mohamed Mordash matches accurately with trailing yaa tolerance', mordashMatch === true);

  // Verify other diverse Egyptian patterns
  assert('Order-invariant matching (حلوان احمد سلامه vs احمد سلامه)', matchTreasuryDescriptionToCustomer('احمد سلامه حلوان', 'احمد سلامه (حلوان)') === true);
  assert('Entity match (الخيرات vs مزرعة الخيرات)', matchTreasuryDescriptionToCustomer('الخيرات', 'مزرعه الخيرات') === true);
  assert('Colloquial typos (ابوذيد vs ابوزيد)', matchTreasuryDescriptionToCustomer('ابوذيد', 'ابوزيد') === true);
  assert('Compound prefix (عبدالتواب vs عبد التواب)', matchTreasuryDescriptionToCustomer('عبد التواب', 'عبدالتواب') === true);
  assert('Internal treasury expense is excluded from customer matching', matchTreasuryDescriptionToCustomer('النور نقدية', 'احمد سلامه') === false);

  // 3. Build & Assets Check
  console.log('\n--- 3. Bundle Split & Frontend Performance ---');
  const distDir = path.join(rootDir, 'dist', 'assets');
  assert('dist/assets exists', fs.existsSync(distDir));

  const files = fs.readdirSync(distDir);
  const excelChunk = files.find(f => f.startsWith('vendor-excel'));
  const chartsChunk = files.find(f => f.startsWith('vendor-charts'));
  const firebaseChunk = files.find(f => f.startsWith('vendor-firebase'));
  const indexChunk = files.find(f => f.startsWith('index-'));

  assert('vendor-excel chunk separated', Boolean(excelChunk));
  assert('vendor-charts chunk separated', Boolean(chartsChunk));
  assert('vendor-firebase chunk separated', Boolean(firebaseChunk));
  assert('index entry chunk generated', Boolean(indexChunk));

  if (indexChunk) {
    const size = fs.statSync(path.join(distDir, indexChunk)).size;
    console.log(`[INFO] Main index chunk size: ${(size / 1024).toFixed(1)} KB`);
    assert('index chunk is smaller than 1.5MB (previously 2.27MB monolithic)', size < 1500 * 1024);
  }

  console.log(`\n========================================================`);
  console.log(`   AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

verifyAll().catch(e => {
  console.error(e);
  process.exit(1);
});
