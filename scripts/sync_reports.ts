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

  if (fs.existsSync(WATCHED_FILES.collections) && fs.existsSync(WATCHED_FILES.invoices)) {
    console.log('[sync_reports] Reading local files from D:\\Mostafa Ibrahim...');
    const collectionsB64 = fs.readFileSync(WATCHED_FILES.collections).toString('base64');
    const invoicesB64 = fs.readFileSync(WATCHED_FILES.invoices).toString('base64');
    const inventoryB64 = fs.existsSync(WATCHED_FILES.inventory)
      ? fs.readFileSync(WATCHED_FILES.inventory).toString('base64')
      : undefined;

    console.log('[sync_reports] Parsing and updating report with verified engine...');
    const res = await parseAndImportReport({
      data: {
        collectionsB64,
        invoicesB64,
        inventoryB64,
        isManual: true,
      },
    });

    console.log(`[sync_reports] Processed ${res.reportDate}: Sales ${res.totalSales}, Invoices ${res.invoiceCount}`);
    if (res.allReports && res.allReports.length > 0) {
      allReports = res.allReports;
    }
  }

  if (allReports.length === 0) {
    console.log('[sync_reports] Fetching reports from database...');
    allReports = await getLocalReports();
  }

  console.log(`[sync_reports] Writing ${allReports.length} reports to public/dist sales_data.json...`);
  const publicPath = path.join(rootDir, 'public', 'sales_data.json');
  const distPath = path.join(rootDir, 'dist', 'sales_data.json');
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
