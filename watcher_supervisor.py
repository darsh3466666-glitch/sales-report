#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
watcher_supervisor.py — المشرف الذكي لحماية مراقب المبيعات من التوقف
يعمل هذا السكربت دورياً عبر Windows Task Scheduler كل دقيقة:
1. يفحص نبض المراقب (.watcher_heartbeat).
2. إذا كان حياً ونشطاً، يفحص ما إذا كانت هناك ملفات تغيرت للتأكيد.
3. إذا كان متوقفاً أو ميتاً لأي سبب، يقوم بإحيائه فوراً في الخلفية بصمت تام.
"""

import os
import sys
import time
import subprocess

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
DETACHED_PROCESS = 0x00000008

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(REPO_DIR, 'watcher.log')
HEARTBEAT_FILE = os.path.join(REPO_DIR, '.watcher_heartbeat')
WATCHER_SCRIPT = os.path.join(REPO_DIR, 'sales_watcher.py')

def log(msg):
    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{timestamp}] [Supervisor] {msg}'
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

def is_daemon_healthy(max_age_seconds=60):
    if not os.path.exists(HEARTBEAT_FILE):
        return False
    try:
        with open(HEARTBEAT_FILE, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            if not content:
                return False
            parts = content.split('|')
            ts = float(parts[0])
            age = time.time() - ts
            return age < max_age_seconds
    except Exception:
        return False

def revive_daemon():
    log("Watcher daemon is not responding or dead. Reviving now...")
    
    python_exe = sys.executable
    pythonw_exe = python_exe.replace("python.exe", "pythonw.exe")
    if not os.path.exists(pythonw_exe):
        pythonw_exe = python_exe

    try:
        flags = CREATE_NO_WINDOW | DETACHED_PROCESS if os.name == 'nt' else 0
        subprocess.Popen(
            [pythonw_exe, WATCHER_SCRIPT],
            cwd=REPO_DIR,
            creationflags=flags,
            close_fds=True
        )
        log("Spawned fresh sales_watcher daemon via pythonw.")
    except Exception as e:
        log(f"Failed to spawn daemon: {e}")

    # Run immediate sync cycle
    try:
        subprocess.run(
            [python_exe, WATCHER_SCRIPT, '--once'],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            encoding='utf-8',
            creationflags=CREATE_NO_WINDOW if os.name == 'nt' else 0,
            timeout=180
        )
    except Exception as e:
        log(f"Warning running immediate sync: {e}")

def main():
    if is_daemon_healthy(max_age_seconds=60):
        return
    else:
        revive_daemon()

if __name__ == '__main__':
    main()
