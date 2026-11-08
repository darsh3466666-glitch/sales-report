#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sales_watcher.py — مراقب مبيعات النور الصامت المحصن ضد التوقف
يتابع ملفات الإكسيل الـ 3 كل 20 ثانية:
1. شيت تحصيل.xlsm
2. فواتير اليوم.xlsx
3. تقارير ارصدة المخازن.xlsx

الميزات الدفاعية:
- متوافق 100% مع pythonw.exe (التعامل الآمن مع sys.stdout = None).
- Win32 Named Mutex لمنع ازدواجية التشغيل.
- كتابة نبضات حية (Heartbeat) دورياً للتحقق من نشاطه.
- إزالة أقفال git التالفة (index.lock) تلقائياً عند الحاجة.
- عدم التوقف أو الانهيار أبداً مع وجود استثناءات الشبكة أو الإكسيل.
"""

import os
import sys
import json
import time
import subprocess
import traceback
from datetime import datetime

if sys.stdout is not None:
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

if sys.stderr is not None:
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

CREATE_NO_WINDOW = 0x08000000

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(REPO_DIR, 'watcher.log')
MTIMES_FILE = os.path.join(REPO_DIR, '.last_mtimes.json')
HEARTBEAT_FILE = os.path.join(REPO_DIR, '.watcher_heartbeat')
SYNC_SCRIPT = os.path.join(REPO_DIR, 'scripts', 'sync_reports.ts')

WATCHED_FILES = [
    r'D:\Mostafa Ibrahim\شيت تحصيل.xlsm',
    r'D:\Mostafa Ibrahim\بيان اسعار فواتير اليوم\فواتير اليوم.xlsx',
    r'D:\Mostafa Ibrahim\جرد يومي\تقارير  ارصدة المخازن.xlsx'
]

_MUTEX_HANDLE = None

def acquire_single_instance_lock():
    global _MUTEX_HANDLE
    if os.name == 'nt':
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            mutex = kernel32.CreateMutexW(None, False, "Local\\SalesReportWatcherMutex_Nour")
            if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
                return False
            _MUTEX_HANDLE = mutex
            return True
        except Exception as e:
            log(f"Warning acquiring mutex: {e}")
            return True
    return True

def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{timestamp}] {msg}'
    if sys.stdout is not None:
        try:
            print(line)
        except Exception:
            pass
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception:
        pass

def update_heartbeat():
    try:
        with open(HEARTBEAT_FILE, 'w', encoding='utf-8') as f:
            f.write(f"{time.time()}|{os.getpid()}")
    except Exception:
        pass

def clean_stale_git_locks():
    try:
        git_lock = os.path.join(REPO_DIR, '.git', 'index.lock')
        if os.path.exists(git_lock):
            mtime = os.path.getmtime(git_lock)
            if time.time() - mtime > 60:
                os.remove(git_lock)
                log("Cleaned up stale git index.lock")
    except Exception as e:
        log(f"Warning cleaning git lock: {e}")

def get_current_mtimes():
    mtimes = {}
    for f in WATCHED_FILES:
        if os.path.exists(f):
            try:
                mtimes[f] = os.path.getmtime(f)
            except Exception as e:
                log(f"Warning getting mtime for {f}: {e}")
    return mtimes

def run_once(force=False):
    update_heartbeat()
    clean_stale_git_locks()
    try:
        cur_mtimes = get_current_mtimes()
        last_mtimes = {}
        if os.path.exists(MTIMES_FILE):
            try:
                with open(MTIMES_FILE, 'r', encoding='utf-8') as mf:
                    last_mtimes = json.load(mf)
            except Exception:
                pass

        files_changed = (cur_mtimes != last_mtimes)

        if not files_changed and not force:
            return True

        log("Detected file changes or force run. Extracting sales data...")

        # 1. Run official accounting sync script
        npx_cmd = 'npx.cmd' if os.name == 'nt' else 'npx'
        ext_res = subprocess.run(
            [npx_cmd, 'tsx', SYNC_SCRIPT],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            encoding='utf-8',
            shell=(os.name == 'nt'),
            creationflags=CREATE_NO_WINDOW if os.name == 'nt' else 0,
            timeout=120
        )
        if ext_res.returncode != 0:
            log(f"Sync ERROR: {ext_res.stderr or ext_res.stdout}")
            return False

        log(f"Sync completed successfully. Output:\n{ext_res.stdout.strip()}")

        # 2. Re-build client SPA assets if needed, or update dist/sales_data.json
        dist_json = os.path.join(REPO_DIR, 'dist', 'sales_data.json')
        public_json = os.path.join(REPO_DIR, 'public', 'sales_data.json')
        if os.path.exists(public_json):
            import shutil
            os.makedirs(os.path.join(REPO_DIR, 'dist'), exist_ok=True)
            shutil.copyfile(public_json, dist_json)

        # 3. Git commit & push to GitHub
        try:
            log("Syncing with GitHub repository...")
            subprocess.run(['git', 'add', 'public/sales_data.json', 'dist/sales_data.json'], cwd=REPO_DIR, capture_output=True, creationflags=CREATE_NO_WINDOW)
            
            diff_check = subprocess.run(['git', 'diff', '--staged', '--name-only'], cwd=REPO_DIR, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
            if diff_check.stdout.strip():
                now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                subprocess.run(['git', 'commit', '-m', f'Auto-update sales report data: {now_str}'], cwd=REPO_DIR, capture_output=True, creationflags=CREATE_NO_WINDOW)
                subprocess.run(['git', 'push', 'origin', 'main'], cwd=REPO_DIR, capture_output=True, creationflags=CREATE_NO_WINDOW)

                # Clean any lingering temporary branch first
                subprocess.run(['git', 'branch', '-D', 'gh-pages-tmp'], cwd=REPO_DIR, capture_output=True, creationflags=CREATE_NO_WINDOW)

                # Push dist to gh-pages branch
                log("Updating gh-pages branch...")
                subprocess.run(['git', 'subtree', 'split', '--prefix', 'dist', '-b', 'gh-pages-tmp'], cwd=REPO_DIR, capture_output=True, creationflags=CREATE_NO_WINDOW)
                subprocess.run(['git', 'push', '-f', 'origin', 'gh-pages-tmp:gh-pages'], cwd=REPO_DIR, capture_output=True, creationflags=CREATE_NO_WINDOW)
                subprocess.run(['git', 'branch', '-D', 'gh-pages-tmp'], cwd=REPO_DIR, capture_output=True, creationflags=CREATE_NO_WINDOW)
                log("GitHub Pages updated successfully!")
            else:
                log("No changes detected in data file to commit.")
        except Exception as ge:
            log(f"Git push warning: {ge}")

        # Save mtimes
        with open(MTIMES_FILE, 'w', encoding='utf-8') as mf:
            json.dump(cur_mtimes, mf)

        log("Cycle completed successfully.")
        return True
    except Exception as e:
        log(f"FATAL in run_once: {e}")
        log(traceback.format_exc())
        return False

def run_loop(interval_seconds=20):
    if not acquire_single_instance_lock():
        log("Another instance of sales_watcher is already running. Exiting cleanly.")
        sys.exit(0)

    log(f"=== Sales Watcher Daemon Started (PID: {os.getpid()}, Interval: {interval_seconds}s) ===")
    log(f"Watched files: {WATCHED_FILES}")
    
    while True:
        try:
            update_heartbeat()
            run_once(force=False)
        except Exception as e:
            log(f"Recovered from error in loop: {e}")
        time.sleep(interval_seconds)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--once':
        sys.exit(0 if run_once(force=True) else 1)
    elif len(sys.argv) > 1 and sys.argv[1] == '--check':
        sys.exit(0 if run_once(force=False) else 1)
    else:
        run_loop(20)
