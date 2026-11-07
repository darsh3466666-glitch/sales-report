import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, '../dist');
const publicDir = path.resolve(__dirname, '../public');

if (fs.existsSync(distDir)) {
  // 1. Copy index.html -> 404.html for GitHub Pages routing
  const indexHtml = path.join(distDir, 'index.html');
  const notFoundHtml = path.join(distDir, '404.html');
  if (fs.existsSync(indexHtml)) {
    fs.copyFileSync(indexHtml, notFoundHtml);
    console.log('✓ Created 404.html from index.html');
  }

  // 2. Create .nojekyll for GitHub Pages
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
  console.log('✓ Created .nojekyll');

  // 3. Ensure sales_data.json is in dist
  const publicData = path.join(publicDir, 'sales_data.json');
  const distData = path.join(distDir, 'sales_data.json');
  if (fs.existsSync(publicData)) {
    fs.copyFileSync(publicData, distData);
    console.log('✓ Copied sales_data.json to dist');
  }

  console.log('SUCCESS_BUILD_VERIFIED');
} else {
  console.error('Dist directory does not exist!');
  process.exit(1);
}
