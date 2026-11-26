#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sales_watcher.py — مراقب النور الموحد (المبيعات + الكاش فلو + المخزون)
يتابع ملفات الإكسيل الخاصة بالمبيعات والمخزون والفواتير كل 20 ثانية:
1. شيت تحصيل.xlsm
2. فواتير اليوم.xlsx
3. تقارير ارصدة المخازن.xlsx
4. تقرير حركة الاصناف تفصيلي.xlsx
5. اخر فاتورة لعميل.xlsx

الميزات الدفاعية:
- متوافق 100% مع pythonw.exe (التعامل الآمن مع sys.stdout = None).
- Win32 Named Mutex لمنع ازدواجية التشغيل.
- كتابة نبضات حية (Heartbeat) دورياً للتحقق من نشاطه.
- فصل مسار تحديث المبيعات عن المخزون حتى لا يؤدي تعليق المبيعات لتأخير المخزون.
- نشر موحد فوري إلى gh-pages (< 1 ثانية) عبر fast tree-commit.
"""

import json
import os
import shutil
import subprocess
import sys
import time
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
INV_EXTRACT_SCRIPT = os.path.join(REPO_DIR, 'scripts', 'extract_inventory.py')

SALES_WATCHED_FILES = [
    r'D:\Mostafa Ibrahim\شيت تحصيل.xlsm',
    r'D:\Mostafa Ibrahim\بيان اسعار فواتير اليوم\فواتير اليوم.xlsx',
    r'D:\Mostafa Ibrahim\جرد يومي\تقارير  ارصدة المخازن.xlsx',
    r'D:\Mostafa Ibrahim\جرد يومي\تقرير حركة الاصناف تفصيلي .xlsx',
    r'D:\Mostafa Ibrahim\جرد يومي\تقرير حركة الاصناف تفصيلي.xlsx',
]

INVENTORY_DIRS = [
    (r'D:\Mostafa Ibrahim\جرد يومي', ['ارصدة', 'المخازن'], r'D:\Mostafa Ibrahim\جرد يومي\تقارير  ارصدة المخازن.xlsx'),
    (r'D:\Mostafa Ibrahim\آخر فاتورة للعميل_files', ['فاتورة'], r'D:\Mostafa Ibrahim\آخر فاتورة للعميل_files\اخر فاتورة لعميل.xlsx'),
    (r'D:\Mostafa Ibrahim\جرد يومي', ['حركة', 'تفصيلي'], r'D:\Mostafa Ibrahim\جرد يومي\تقرير حركة الاصناف تفصيلي .xlsx'),
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
        git_dir = os.path.join(REPO_DIR, '.git')
        git_lock = os.path.join(git_dir, 'index.lock')
        if os.path.exists(git_lock):
            mtime = os.path.getmtime(git_lock)
            if time.time() - mtime > 60:
                os.remove(git_lock)
                log("Cleaned up stale git index.lock")

        index_path = os.path.join(git_dir, 'index')
        if os.path.exists(index_path):
            try:
                with open(index_path, 'rb') as f:
                    header = f.read(4)
                if header != b'DIRC' or os.path.getsize(index_path) < 12:
                    log("Corrupted git index detected (bad signature). Auto-repairing...")
                    os.remove(index_path)
                    subprocess.run(['git', 'reset'], cwd=REPO_DIR, capture_output=True, creationflags=CREATE_NO_WINDOW)
            except Exception as ie:
                log(f"Warning checking git index: {ie}")
    except Exception as e:
        log(f"Warning cleaning git lock: {e}")


def find_latest_file(directory, keywords, default_path=None):
    candidates = []
    if os.path.exists(directory):
        try:
            for fname in os.listdir(directory):
                if fname.startswith('~$') or not fname.lower().endswith(('.xlsx', '.xlsm', '.xls')):
                    continue
                if all(kw in fname for kw in keywords):
                    candidates.append(os.path.join(directory, fname))
        except Exception:
            pass
    if default_path and os.path.exists(default_path) and default_path not in candidates:
        candidates.append(default_path)
    if not candidates:
        return default_path if (default_path and os.path.exists(default_path)) else None
    return max(candidates, key=lambda p: os.path.getmtime(p))


def get_mtimes_for_paths(paths):
    mtimes = {}
    for f in paths:
        if f and os.path.exists(f):
            try:
                mtimes[f] = os.path.getmtime(f)
            except Exception as e:
                log(f"Warning getting mtime for {f}: {e}")
    return mtimes


def get_inventory_watched_files():
    return [find_latest_file(d, kw, default_p) for d, kw, default_p in INVENTORY_DIRS]


def sync_sales_and_cashflow():
    npx_cmd = 'npx.cmd' if os.name == 'nt' else 'npx'
    cf_script = os.path.join(REPO_DIR, 'scripts', 'extract_cashflow.py')

    sync_proc = subprocess.Popen(
        [npx_cmd, 'tsx', SYNC_SCRIPT],
        cwd=REPO_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        shell=(os.name == 'nt'),
        creationflags=CREATE_NO_WINDOW if os.name == 'nt' else 0,
    )

    cf_proc = None
    if os.path.exists(cf_script):
        cf_proc = subprocess.Popen(
            [sys.executable or 'python', cf_script],
            cwd=REPO_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            creationflags=CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )

    sync_out, sync_err = sync_proc.communicate(timeout=120)
    cf_out, _ = (cf_proc.communicate(timeout=60) if cf_proc else ("", ""))

    if sync_proc.returncode != 0:
        log(f"Sync ERROR: {sync_err or sync_out}")
        return False, False

    log(f"Sync completed successfully. Output:\n{sync_out.strip()}")
    if cf_out:
        log(f"Cash flow extraction output:\n{cf_out.strip()}")

    if "تعليق المزامنة المؤقت" in sync_out:
        log("Sales sync paused due to date mismatch between files. Waiting for sales files to synchronize...")
        return True, True  # paused=True

    try:
        seed_script = os.path.join(REPO_DIR, 'scripts', 'seed_remote_cashflow.ts')
        if os.path.exists(seed_script):
            log("Syncing live cash flow to Firestore...")
            subprocess.run(
                [npx_cmd, 'tsx', seed_script],
                cwd=REPO_DIR,
                capture_output=True,
                shell=(os.name == 'nt'),
                creationflags=CREATE_NO_WINDOW if os.name == 'nt' else 0,
                timeout=60,
            )
    except Exception as cfe:
        log(f"Cash flow extraction warning: {cfe}")

    return True, False


def sync_inventory(force=False):
    if not os.path.exists(INV_EXTRACT_SCRIPT):
        log(f"Warning: {INV_EXTRACT_SCRIPT} not found.")
        return False
    cmd = [sys.executable or 'python', INV_EXTRACT_SCRIPT]
    if force:
        cmd.append('--force')
    res = subprocess.run(
        cmd,
        cwd=REPO_DIR,
        capture_output=True,
        text=True,
        encoding='utf-8',
        creationflags=CREATE_NO_WINDOW if os.name == 'nt' else 0,
        timeout=120,
    )
    if res.returncode != 0:
        log(f"Inventory extract ERROR: {res.stderr or res.stdout}")
        return False
    if res.stdout and res.stdout.strip():
        log(res.stdout.strip())
    return True


def push_data_to_github():
    os.makedirs(os.path.join(REPO_DIR, 'dist'), exist_ok=True)
    json_files = ['sales_data.json', 'cashflow_data.json', 'cashflow_config.json', 'inventory_data.json']
    for json_name in json_files:
        p_file = os.path.join(REPO_DIR, 'public', json_name)
        d_file = os.path.join(REPO_DIR, 'dist', json_name)
        if os.path.exists(p_file):
            try:
                shutil.copyfile(p_file, d_file)
            except Exception:
                pass

    log("Syncing with GitHub repository...")
    stage_targets = []
    for json_name in json_files:
        for folder in ('public', 'dist'):
            rel_path = f"{folder}/{json_name}"
            if os.path.exists(os.path.join(REPO_DIR, rel_path)):
                stage_targets.append(rel_path)

    if stage_targets:
        subprocess.run(
            ['git', 'add', *stage_targets],
            cwd=REPO_DIR,
            capture_output=True,
            creationflags=CREATE_NO_WINDOW,
            timeout=60,
        )

    diff_check = subprocess.run(
        ['git', 'diff', '--staged', '--name-only'],
        cwd=REPO_DIR,
        capture_output=True,
        text=True,
        creationflags=CREATE_NO_WINDOW,
        timeout=30,
    )
    if not diff_check.stdout.strip():
        log("No changes detected in data files to commit.")
        return

    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    subprocess.run(
        ['git', 'commit', '-m', f'Auto-update report data: {now_str}'],
        cwd=REPO_DIR,
        capture_output=True,
        creationflags=CREATE_NO_WINDOW,
        timeout=60,
    )
    subprocess.run(
        ['git', 'push', 'origin', 'main'],
        cwd=REPO_DIR,
        capture_output=True,
        creationflags=CREATE_NO_WINDOW,
        timeout=60,
    )

    # Push dist to gh-pages branch instantaneously (< 1 second) via direct tree commit
    log("Updating gh-pages branch (fast tree-commit)...")
    try:
        tree_sha = subprocess.check_output(
            ['git', 'rev-parse', 'HEAD:dist'],
            cwd=REPO_DIR,
            creationflags=CREATE_NO_WINDOW,
            timeout=15,
        ).decode().strip()

        parent_res = subprocess.run(
            ['git', 'rev-parse', 'origin/gh-pages'],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW,
            timeout=15,
        )
        parent_sha = parent_res.stdout.strip() if parent_res.returncode == 0 else ""

        commit_cmd = ['git', 'commit-tree', tree_sha, '-m', f"Auto-update site: {now_str}"]
        if parent_sha:
            commit_cmd.extend(['-p', parent_sha])

        new_commit = subprocess.check_output(
            commit_cmd,
            cwd=REPO_DIR,
            creationflags=CREATE_NO_WINDOW,
            timeout=15,
        ).decode().strip()

        push_res = subprocess.run(
            ['git', 'push', '-f', 'origin', f"{new_commit}:gh-pages"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW,
            timeout=45,
        )
        if push_res.returncode == 0:
            log("GitHub Pages updated successfully in < 1s!")
        else:
            log(f"GitHub Pages push error: {push_res.stderr}")
    except Exception as gpe:
        log(f"Fast gh-pages push warning: {gpe}")


def run_once(force=False):
    update_heartbeat()
    clean_stale_git_locks()
    try:
        cur_sales_mtimes = get_mtimes_for_paths(SALES_WATCHED_FILES)
        cur_inv_mtimes = get_mtimes_for_paths(get_inventory_watched_files())

        last_mtimes = {}
        if os.path.exists(MTIMES_FILE):
            try:
                with open(MTIMES_FILE, 'r', encoding='utf-8') as mf:
                    last_mtimes = json.load(mf)
            except Exception:
                pass

        sales_changed = force or any(last_mtimes.get(f) != m for f, m in cur_sales_mtimes.items())
        inv_missing = not os.path.exists(os.path.join(REPO_DIR, 'public', 'inventory_data.json'))
        inv_changed = force or inv_missing or any(last_mtimes.get(f) != m for f, m in cur_inv_mtimes.items())

        if not sales_changed and not inv_changed:
            return True

        log(f"Detected changes (sales={sales_changed}, inventory={inv_changed}). Running extractors...")

        sales_ok, sales_paused = (True, False)
        if sales_changed:
            sales_ok, sales_paused = sync_sales_and_cashflow()

        inv_ok = True
        if inv_changed:
            inv_ok = sync_inventory(force=force)

        if not sales_ok and not inv_ok:
            return False

        try:
            push_data_to_github()
        except Exception as ge:
            log(f"Git push warning: {ge}")

        updated_mtimes = dict(last_mtimes)
        if sales_changed and sales_ok and not sales_paused:
            updated_mtimes.update(cur_sales_mtimes)
        if inv_changed and inv_ok:
            updated_mtimes.update(cur_inv_mtimes)

        with open(MTIMES_FILE, 'w', encoding='utf-8') as mf:
            json.dump(updated_mtimes, mf)

        log("Cycle completed successfully.")
        return sales_ok and inv_ok
    except Exception as e:
        log(f"FATAL in run_once: {e}")
        log(traceback.format_exc())
        return False


def run_loop(interval_seconds=20):
    if not acquire_single_instance_lock():
        log("Another instance of sales_watcher is already running. Exiting cleanly.")
        sys.exit(0)

    log(f"=== Unified Sales & Inventory Watcher Started (PID: {os.getpid()}, Interval: {interval_seconds}s) ===")
    log(f"Sales files: {SALES_WATCHED_FILES}")
    log(f"Inventory files: {get_inventory_watched_files()}")

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
