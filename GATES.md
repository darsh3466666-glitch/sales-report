# Gates: Automated Sales Report Pipeline & 24/7 GitHub Pages

OWNS: scripts/**, src/**, dist/**, public/**, package.json, vite.config.spa.ts, sales_watcher.py, start_watcher.bat, silent_watcher.vbs, setup_task_scheduler.ps1

Scope: Automated extraction of 3 local Excel files, real-time sync, and continuous 24/7 deployment to GitHub Pages (darsh3466666-glitch/sales-report) with silent background watching.

- [x] G1: Excel Extraction & Data Generation
  CHECK: python scripts/verify_extraction.py
  EXPECT: SUCCESS_EXTRACTION_VERIFIED
  EVIDENCE: Output verified: SUCCESS_EXTRACTION_VERIFIED (Extracted 186,000 EGP sales, 426,620 EGP collections, 9841.25 kg qty, 10 active customers).

- [x] G2: SPA Static Client Web Build
  CHECK: npm run build
  EXPECT: SUCCESS_BUILD_VERIFIED
  EVIDENCE: Output verified: SUCCESS_BUILD_VERIFIED (Vite client SPA built with /sales-report/ base, 404.html, .nojekyll, and sales_data.json copied to dist/).

- [x] G3: GitHub Repository Creation & Remote Configuration
  CHECK: gh repo view darsh3466666-glitch/sales-report --json name,url
  EXPECT: "name":"sales-report"
  EVIDENCE: Output verified: {"name":"sales-report","url":"https://github.com/darsh3466666-glitch/sales-report"}.

- [x] G4: Silent Background Watcher & Windows Task Scheduler
  CHECK: powershell -ExecutionPolicy Bypass -File scripts/verify_watcher.ps1
  EXPECT: SUCCESS_WATCHER_REGISTERED
  EVIDENCE: Output verified: SUCCESS_WATCHER_REGISTERED (Startup shortcut created and background watcher launched).

- [x] G5: End-to-End Live Sync & Public Link Verification
  CHECK: python scripts/verify_live_url.py
  EXPECT: SUCCESS_LIVE_REPORT_ONLINE
  EVIDENCE: Output verified: SUCCESS_LIVE_REPORT_ONLINE (HTTP 200 OK for HTML and sales_data.json at https://darsh3466666-glitch.github.io/sales-report/).

- [x] G6: Historical Data Restoration & Full Accounting Engine Integration
  CHECK: Automated test querying GitHub Pages sales_data.json
  EXPECT: 91 historical reports, accurate opening balance (~27.48M EGP), 13 invoices, 14,308 EGP average invoice, active historical comparisons
  EVIDENCE: Verified: 91 reports deployed to GitHub Pages (HTTP 200). Opening balance 27,481,992 EGP, receivables 27,241,372 EGP, sales 186,000 EGP, collections 138,320 EGP, invoice count 13, avg invoice 14,308 EGP. IndexedDB bad cache auto-purge implemented in local-db.ts.


- [x] G7: Bulletproof Auto-Reviving Watcher & Task Scheduler Service
  CHECK: powershell -ExecutionPolicy Bypass -File scripts/verify_watcher_resilience.ps1
  EXPECT: SUCCESS_WATCHER_RESILIENCE_VERIFIED
  EVIDENCE: Output verified: SUCCESS_WATCHER_RESILIENCE_VERIFIED (Task Scheduler job SalesReportWatcher_Nour registered and running every 1 minute with interactive principal; startup fail-safe shortcut confirmed; crash auto-recovery supervisor verified; live file change detection and full extraction-sync cycle executed cleanly).
