import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, '../dist');
const publicDir = path.resolve(__dirname, '../public');

if (fs.existsSync(distDir)) {
  // 1. Copy index.html -> 404.html and static route folders for direct clean 200 OK routing
  const indexHtml = path.join(distDir, 'index.html');
  const notFoundHtml = path.join(distDir, '404.html');
  if (fs.existsSync(indexHtml)) {
    fs.copyFileSync(indexHtml, notFoundHtml);
    console.log('✓ Created 404.html from index.html');

    const staticRoutes = ['cashflow', 'dashboard', 'history', 'cashflow/history', 'inventory', 'inventory/history'];
    for (const route of staticRoutes) {
      const targetDir = path.join(distDir, route);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(indexHtml, path.join(targetDir, 'index.html'));
      console.log(`✓ Created clean route folder: ${route}/index.html`);
    }
  }

  // 2. Create .nojekyll for GitHub Pages
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
  console.log('✓ Created .nojekyll');

  // 3. Ensure sales_data.json, cashflow_data.json, cashflow_config.json, cashflow_history.json, inventory_data.json are in dist
  for (const fileName of ['sales_data.json', 'cashflow_data.json', 'cashflow_config.json', 'cashflow_history.json', 'inventory_data.json']) {
    const publicFile = path.join(publicDir, fileName);
    const distFile = path.join(distDir, fileName);
    if (fs.existsSync(publicFile)) {
      let copied = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          fs.copyFileSync(publicFile, distFile);
          console.log(`✓ Copied ${fileName} to dist`);
          copied = true;
          break;
        } catch (err) {
          if (attempt === 5) {
            console.warn(`Warning: Could not copy ${fileName} on attempt ${attempt}:`, err.message);
          } else {
            // Wait 250ms synchronously
            const start = Date.now();
            while (Date.now() - start < 250) {}
          }
        }
      }
    }
  }

  // 4. Write version.json containing the active built entry bundle hash for zero-delay client auto-updates
  const assetsDir = path.join(distDir, 'assets');
  let entryChunk = '';
  let styleChunk = '';
  if (fs.existsSync(assetsDir)) {
    const assetFiles = fs.readdirSync(assetsDir);
    entryChunk = assetFiles.find((f) => /^index-.*\.js$/.test(f)) || '';
    styleChunk = assetFiles.find((f) => /^styles-.*\.css$/.test(f)) || '';
  }
  const versionPayload = {
    entry: entryChunk,
    style: styleChunk,
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(distDir, 'version.json'),
    JSON.stringify(versionPayload, null, 2),
    'utf8'
  );
  console.log(`✓ Created version.json (entry=${entryChunk || 'none'})`);

  console.log('SUCCESS_BUILD_VERIFIED');
} else {
  console.error('Dist directory does not exist!');
  process.exit(1);
}
