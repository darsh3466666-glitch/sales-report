import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseAndImportReport } from '../src/lib/excel-parser.functions';
import { getLocalReports } from '../src/lib/local-db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const WATCHED_FILES = {
  collections: 'D:\\Mostafa Ibrahim\\شيت تحصيل.xlsm',
  invoices: 'D:\\Mostafa Ibrahim\\بيان اسعار فواتير اليوم\\فواتير اليوم.xlsx',
  inventory: 'D:\\Mostafa Ibrahim\\جرد يومي\\تقارير  ارصدة المخازن.xlsx',
};

async function main() {
  console.log('[sync_reports] Starting auto-sync...');
  let allReports: any[] = [];
  const publicPath = path.join(rootDir, 'public', 'sales_data.json');
  const distPath = path.join(rootDir, 'dist', 'sales_data.json');

  // Preload existing reports so historical data and previous day balances are ALWAYS preserved
  let preloadedReports: any[] = [];
  if (fs.existsSync(publicPath)) {
    try {
      const raw = fs.readFileSync(publicPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        preloadedReports = parsed;
        allReports = parsed;
      }
    } catch {}
  }

  if (fs.existsSync(WATCHED_FILES.collections) && fs.existsSync(WATCHED_FILES.invoices)) {
    console.log('[sync_reports] Reading local files from D:\\Mostafa Ibrahim...');
    const collectionsB64 = fs.readFileSync(WATCHED_FILES.collections).toString('base64');
    const invoicesB64 = fs.readFileSync(WATCHED_FILES.invoices).toString('base64');
    const inventoryB64 = fs.existsSync(WATCHED_FILES.inventory)
      ? fs.readFileSync(WATCHED_FILES.inventory).toString('base64')
      : undefined;

    const MOVEMENTS_PATHS = [
      'D:\\Mostafa Ibrahim\\جرد يومي\\تقرير حركة الاصناف تفصيلي .xlsx',
      'D:\\Mostafa Ibrahim\\جرد يومي\\تقرير حركة الاصناف تفصيلي.xlsx',
    ];
    const movementsFile = MOVEMENTS_PATHS.find((p) => fs.existsSync(p));
    const movementsB64 = movementsFile
      ? fs.readFileSync(movementsFile).toString('base64')
      : undefined;
    if (movementsFile) {
      console.log(`[sync_reports] Reading genuine movements file: ${movementsFile}`);
    }

    console.log('[sync_reports] Parsing and updating report with verified engine...');
    const res = await parseAndImportReport({
      data: {
        collectionsB64,
        invoicesB64,
        inventoryB64,
        movementsB64,
        isManual: true,
        existingReports: preloadedReports,
      },
    });

    console.log(`[sync_reports] Processed ${res.reportDate}: Sales ${res.totalSales}, Invoices ${res.invoiceCount}`);
    if (res.allReports && res.allReports.length > 0) {
      const newReport = res.allReports[0];
      const olderReports = preloadedReports.filter(
        (r) => r.report?.report_date !== newReport.report?.report_date
      );
      allReports = [newReport, ...olderReports];
    }
  }

  if (allReports.length === 0) {
    console.log('[sync_reports] Fetching reports from database...');
    allReports = await getLocalReports();
  }

  console.log(`[sync_reports] Writing ${allReports.length} reports to public/dist sales_data.json...`);
  const jsonStr = JSON.stringify(allReports);

  fs.writeFileSync(publicPath, jsonStr, 'utf8');
  if (fs.existsSync(path.join(rootDir, 'dist'))) {
    fs.writeFileSync(distPath, jsonStr, 'utf8');
  }

  console.log('[sync_reports] Sync complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[sync_reports] Error:', err);
  process.exit(1);
});
