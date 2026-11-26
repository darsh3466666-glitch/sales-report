#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
watcher_supervisor.py — المشرف الذكي لحماية مراقب المبيعات والمخزون من التوقف أو العمل بنسخة قديمة
يعمل هذا السكربت دورياً عبر Windows Task Scheduler كل دقيقة:
1. يفحص نبض المراقب (.watcher_heartbeat) وصلاحية الـ PID.
2. يتحقق أن النسخة العاملة في الذاكرة تطابق آخر تعديل لملف sales_watcher.py.
3. إذا كان متوقفاً أو يعمل بنسخة قديمة، يقوم بإنهاء النسخة القديمة وإحياء نسخة جديدة بصمت تام.
"""

import os
import subprocess
import sys
import time

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


def is_pid_alive(pid):
    if pid <= 0:
        return False
    if os.name == 'nt':
        try:
            res = subprocess.run(
                ['tasklist', '/FI', f'PID eq {pid}', '/NH'],
                capture_output=True,
                text=True,
                creationflags=CREATE_NO_WINDOW,
                timeout=10,
            )
            return str(pid) in (res.stdout or '')
        except Exception:
            return True
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def stop_stale_pid(pid):
    if pid <= 0:
        return
    try:
        if os.name == 'nt':
            subprocess.run(
                ['taskkill', '/PID', str(pid), '/F'],
                capture_output=True,
                creationflags=CREATE_NO_WINDOW,
                timeout=10,
            )
        else:
            os.kill(pid, 9)
        log(f"Terminated stale watcher PID {pid} so updated script can start.")
    except Exception as e:
        log(f"Warning terminating stale PID {pid}: {e}")


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
        if (time.time() - ts) >= max_age_seconds:
            return False

        pid = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
        if pid and not is_pid_alive(pid):
            log(f"Heartbeat PID {pid} is no longer running.")
            return False

        disk_mtime = os.path.getmtime(WATCHER_SCRIPT) if os.path.exists(WATCHER_SCRIPT) else 0.0
        if len(parts) >= 3:
            running_mtime = float(parts[2])
            if abs(running_mtime - disk_mtime) > 0.01:
                log(f"Watcher script changed on disk ({running_mtime} -> {disk_mtime}); forcing restart.")
                stop_stale_pid(pid)
                return False
        elif disk_mtime > ts:
            log("Legacy watcher heartbeat lacks script version; forcing restart.")
            stop_stale_pid(pid)
            return False

        return True
    except Exception:
        return False


def revive_daemon():
    log("Watcher daemon is missing, stale, or dead. Reviving now...")

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
            close_fds=True,
        )
        log("Spawned fresh sales_watcher daemon via pythonw.")
    except Exception as e:
        log(f"Failed to spawn daemon: {e}")

    try:
        subprocess.run(
            [python_exe, WATCHER_SCRIPT, '--check'],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            encoding='utf-8',
            creationflags=CREATE_NO_WINDOW if os.name == 'nt' else 0,
            timeout=180,
        )
    except Exception as e:
        log(f"Warning running immediate sync check: {e}")


def main():
    if is_daemon_healthy(max_age_seconds=60):
        return
    revive_daemon()


if __name__ == '__main__':
    main()
