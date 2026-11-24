import urllib.request
import json
import os
import datetime
import re

def normalize_arabic(text):
    if not text:
        return ''
    text = str(text).strip()
    text = text.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
    text = text.replace('ة', 'ه').replace('ى', 'ي')
    text = text.replace('عبد ', 'عبد')
    for ch in ['(', ')', '-', '/', '\\', '_', '.', ',', '،']:
        text = text.replace(ch, ' ')
    return ' '.join(text.split())

TREASURY_CUSTOMER_ALIASES = {
    normalize_arabic("احمد عدلي مصطفي"): "اشرف عدلي مصطفي",
    normalize_arabic("احمد عدلي"): "اشرف عدلي مصطفي",
    normalize_arabic("احمد عدلى مصطفى"): "اشرف عدلي مصطفي",
    normalize_arabic("احمد عدلى"): "اشرف عدلي مصطفي",
}

def get_current_week_window(ref_date=None):
    if not ref_date:
        ref_date = datetime.date.today()
    offset = (ref_date.weekday() - 2) % 7
    start_date = ref_date - datetime.timedelta(days=offset)
    end_date = start_date + datetime.timedelta(days=6)
    return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')

def sync_treasury():
    week_start, week_end = get_current_week_window()
    print(f"Syncing Treasury for Active Week: {week_start} to {week_end}")

    seen_tx_sigs = set()
    all_weekly_tx = []

    # 1. Fetch GitHub snapshots from cowshedelnour-glitch/treasury-dashboard
    try:
        commits_url = f"https://api.github.com/repos/cowshedelnour-glitch/treasury-dashboard/commits?since={week_start}T00:00:00Z&until={week_end}T23:59:59Z&per_page=100"
        req = urllib.request.Request(commits_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            commits = json.loads(resp.read().decode('utf-8'))

        latest_by_date = {}
        for c in commits:
            dt = c['commit']['author']['date'].split('T')[0]
            if dt not in latest_by_date and week_start <= dt <= week_end:
                latest_by_date[dt] = c['sha']

        print(f"Discovered {len(latest_by_date)} daily snapshots in git: {sorted(latest_by_date.keys())}")

        for dt in sorted(latest_by_date.keys()):
            sha = latest_by_date[dt]
            raw_url = f"https://raw.githubusercontent.com/cowshedelnour-glitch/treasury-dashboard/{sha}/data.json"
            try:
                r_snap = urllib.request.Request(raw_url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(r_snap, timeout=6) as resp_snap:
                    snap_data = json.loads(resp_snap.read().decode('utf-8'))
                    incoming_list = snap_data.get('transactions', {}).get('incoming', [])
                    for idx, item in enumerate(incoming_list):
                        i_amt = float(item.get('amount', 0))
                        i_desc = str(item.get('description', '')).strip()
                        i_type = str(item.get('type', 'كاش')).strip()
                        i_date = str(item.get('date', dt)).strip() or dt
                        i_rcpt = str(item.get('receipt', '')).strip() or f"live_{i_date}_{idx}"
                        norm_i = normalize_arabic(i_desc)

                        # Exclude internal non-customer movements
                        if any(x in norm_i for x in ['النور نقد', 'نقديه النور', 'نقدية النور', 'نقدي النور']) or norm_i in ['النور', 'معلف النور']:
                            continue

                        if norm_i in TREASURY_CUSTOMER_ALIASES:
                            i_desc = TREASURY_CUSTOMER_ALIASES[norm_i]

                        sig = f"{i_date}_{norm_i}_{i_amt}_{i_rcpt}"
                        if i_amt > 0 and norm_i and sig not in seen_tx_sigs:
                            seen_tx_sigs.add(sig)
                            all_weekly_tx.append({
                                "receipt": i_rcpt,
                                "amount": i_amt,
                                "description": i_desc,
                                "type": i_type,
                                "date": i_date
                            })
            except Exception as e_snap:
                print(f"Error fetching snapshot for {dt}:", e_snap)
    except Exception as e_commits:
        print("Commits fetch failed:", e_commits)

    # 2. Live Today Overlay (only if today is not already captured in the latest git snapshot)
    try:
        req_live = urllib.request.Request(
            "https://cowshedelnour-glitch.github.io/treasury-dashboard/data.json",
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req_live, timeout=6) as resp_live:
            t_data = json.loads(resp_live.read().decode('utf-8'))
            t_rep_date = str(t_data.get('reportDate', '')).strip() or datetime.date.today().strftime('%Y-%m-%d')
            if t_rep_date not in latest_by_date:
                for idx, item in enumerate(t_data.get('transactions', {}).get('incoming', [])):
                    i_amt = float(item.get('amount', 0))
                    i_desc = str(item.get('description', '')).strip()
                    i_type = str(item.get('type', 'كاش')).strip()
                    i_date = str(item.get('date', t_rep_date)).strip() or t_rep_date
                    i_rcpt = str(item.get('receipt', '')).strip() or f"live_{i_date}_{idx}"
                    norm_i = normalize_arabic(i_desc)

                    if any(x in norm_i for x in ['النور نقد', 'نقديه النور', 'نقدية النور', 'نقدي النور']) or norm_i in ['النور', 'معلف النور']:
                        continue

                    if norm_i in TREASURY_CUSTOMER_ALIASES:
                        i_desc = TREASURY_CUSTOMER_ALIASES[norm_i]

                    sig = f"{i_date}_{norm_i}_{i_amt}_{i_rcpt}"
                    if i_amt > 0 and norm_i and sig not in seen_tx_sigs:
                        seen_tx_sigs.add(sig)
                        all_weekly_tx.append({
                            "receipt": i_rcpt,
                            "amount": i_amt,
                            "description": i_desc,
                            "type": i_type,
                            "date": i_date
                        })
    except Exception as e_live:
        print("Live fetch error:", e_live)

    print(f"Assembled {len(all_weekly_tx)} authentic weekly treasury transactions, total sum = {sum(t['amount'] for t in all_weekly_tx)}")

    # 3. Update public/cashflow_data.json and dist/cashflow_data.json
    paths = ['public/cashflow_data.json', 'dist/cashflow_data.json']
    for p in paths:
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    cf_data = json.load(f)
                cf_data['weeklyTreasuryTransactions'] = all_weekly_tx
                with open(p, 'w', encoding='utf-8') as f:
                    json.dump(cf_data, f, ensure_ascii=False, indent=2)
                print(f"Updated {p} successfully.")
            except Exception as e:
                print(f"Error updating {p}:", e)

if __name__ == '__main__':
    sync_treasury()
