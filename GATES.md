# Gates: Automated Sales Report Pipeline & 24/7 GitHub Pages

OWNS: scripts/**, src/**, dist/**, public/**, package.json, vite.config.ts, sales_watcher.py, start_watcher.bat, silent_watcher.vbs, setup_task_scheduler.ps1

Scope: Automated extraction of 3 local Excel files, real-time sync, and continuous 24/7 deployment to GitHub Pages (darsh3466666-glitch/sales-report) with silent background watching.

- [ ] G1: Excel Extraction & Data Generation
  CHECK: python scripts/verify_extraction.py
  EXPECT: SUCCESS_EXTRACTION_VERIFIED
  EVIDENCE: pending

- [ ] G2: SPA Static Client Web Build
  CHECK: npm run build
  EXPECT: SUCCESS_BUILD_VERIFIED
  EVIDENCE: pending

- [ ] G3: GitHub Repository Creation & Remote Configuration
  CHECK: gh repo view darsh3466666-glitch/sales-report --json name,url
  EXPECT: "name":"sales-report"
  EVIDENCE: pending

- [ ] G4: Silent Background Watcher & Windows Task Scheduler
  CHECK: powershell -ExecutionPolicy Bypass -File scripts/verify_watcher.ps1
  EXPECT: SUCCESS_WATCHER_REGISTERED
  EVIDENCE: pending

- [ ] G5: End-to-End Live Sync & Public Link Verification
  CHECK: python scripts/verify_live_url.py
  EXPECT: SUCCESS_LIVE_REPORT_ONLINE
  EVIDENCE: pending
