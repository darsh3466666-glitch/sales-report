import openpyxl
import json
import datetime
import os
import sys

EXCEL_FILE = r'D:\Mostafa Ibrahim\شيت تحصيل.xlsm'
PUBLIC_DIR = r'public'
DIST_DIR = r'dist'

import re
from functools import lru_cache

@lru_cache(maxsize=4096)
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

@lru_cache(maxsize=4096)
def clean_arabic_matching(text):
    if not text:
        return ''
    s = str(text).strip()
    idx = s.find('(')
    if idx >= 0:
        s = s[:idx]
    idx_dash = s.find(' - ')
    if idx_dash >= 0:
        s = s[:idx_dash]
    s = re.sub(r'^(المعلم|حاج|الحاج|مهندس|المهندس|م|استاذ|الاستاذ|أ|شيخ|الشيخ|دكتور|د)[\.\/\\\s\-_]+', '', s)
    s = re.sub(r'^[\.\/\\\-_]+', '', s)
    s = s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
    s = s.replace('ة', 'ه').replace('ى', 'ي')
    s = s.replace('ذ', 'ز').replace('ض', 'ظ')
    s = s.replace('عيد التواب', 'عبدالتواب').replace('عبد ', 'عبد').replace('ابو ', 'ابو').replace('بن ', 'بن')
    for ch in ['-', '/', '\\', '_', '.', ',', '،']:
        s = s.replace(ch, ' ')
    return ' '.join(s.split())

GENERIC_SINGLE_NAMES = {
    'احمد', 'محمد', 'محمود', 'علي', 'حسن', 'حسين', 'سيد', 'ابراهيم', 'مصطفي', 'مصطفى',
    'خالد', 'طارق', 'عمرو', 'عمر', 'يوسف', 'سعيد', 'اشرف', 'جمال', 'عادل', 'رضا', 'نقدي', 'كاش'
}

def is_one_edit_apart(s1, s2):
    s1 = s1.replace('ط', 'ت').replace('ص', 'س').replace('ظ', 'ز').rstrip('ي')
    s2 = s2.replace('ط', 'ت').replace('ص', 'س').replace('ظ', 'ز').rstrip('ي')
    if s1 == s2:
        return True
    if abs(len(s1) - len(s2)) > 1:
        return False
    if len(s1) < 3 or len(s2) < 3:
        return False
    edits = 0
    i, j = 0, 0
    while i < len(s1) and j < len(s2):
        if s1[i] != s2[j]:
            edits += 1
            if edits > 1:
                return False
            if len(s1) > len(s2):
                i += 1
            elif len(s2) > len(s1):
                j += 1
            else:
                i += 1
                j += 1
        else:
            i += 1
            j += 1
    return True

def words_match(w1, w2, allow_fuzzy=False):
    if not w1 or not w2:
        return False
    if w1 == w2:
        return True
    nw1 = w1.rstrip('ي')
    nw2 = w2.rstrip('ي')
    if nw1 == nw2:
        return True
    sw1 = nw1[2:] if nw1.startswith('ال') and len(nw1) >= 4 else nw1
    sw2 = nw2[2:] if nw2.startswith('ال') and len(nw2) >= 4 else nw2
    if sw1 == sw2:
        return True
    if allow_fuzzy and is_one_edit_apart(sw1, sw2):
        return True
    return False

TREASURY_CUSTOMER_ALIASES = {
    normalize_arabic("احمد عدلي مصطفي"): "اشرف عدلي مصطفي",
    normalize_arabic("احمد عدلي"): "اشرف عدلي مصطفي",
    normalize_arabic("احمد عدلى مصطفى"): "اشرف عدلي مصطفي",
    normalize_arabic("احمد عدلى"): "اشرف عدلي مصطفي",
    normalize_arabic("جمعه محمد عزوز"): "جمعه محمد عزوز(العياط)",
    normalize_arabic("جمعه محمد عزوز العياط"): "جمعه محمد عزوز(العياط)",
    normalize_arabic("سيد خالد السواق"): "سيد خالد السواق-الحموي",
    normalize_arabic("سيد خالد"): "سيد خالد السواق-الحموي",
    normalize_arabic("عيد احمد عبدالفتاح"): "عيد احمد عبد الفتاح(ابو السعود)",
    normalize_arabic("عيد احمد عبد الفتاح"): "عيد احمد عبد الفتاح(ابو السعود)",
    normalize_arabic("توفيق محمد"): "توفيق محمد (نجع العرب)",
    normalize_arabic("سلامه حمدي"): "سلامه حمدي ( البرنسة)",
    normalize_arabic("حسام عدلي عبود"): "حسام عدلي عبود(قيصر)",
}

def match_treasury_to_customer(desc, cust_name):
    if not desc or not cust_name:
        return False
    norm_d = normalize_arabic(desc)
    resolved_desc = TREASURY_CUSTOMER_ALIASES.get(norm_d, desc)
    cd = clean_arabic_matching(resolved_desc)
    cc = clean_arabic_matching(cust_name)
    if not cd or not cc:
        return False
    if cd == cc or words_match(cd, cc, allow_fuzzy=False):
        return True

    cd_words = [w for w in cd.split() if len(w) >= 2]
    cc_words = [w for w in cc.split() if len(w) >= 2]

    # Prefix match on clean words (allowing fuzzy tolerance on last word if prior words match)
    if len(cd_words) >= 2 and len(cc_words) >= 2:
        m_count = 0
        min_len = min(len(cd_words), len(cc_words))
        for i in range(min_len):
            is_last = (i == min_len - 1 and i >= 2)
            if words_match(cd_words[i], cc_words[i], allow_fuzzy=is_last):
                m_count += 1
            else:
                break
        if m_count >= 2 and (m_count == len(cd_words) or m_count == len(cc_words)):
            return True

    # Order-invariant & full tokens match (including paren annotations like مرسي مدشه or حلوان احمد سلامه)
    raw_norm = normalize_arabic(cust_name)
    for ch in ['-', '/', '\\', '_', '.', ',', '،', '(', ')']:
        raw_norm = raw_norm.replace(ch, ' ')
    all_cust_words = [w for w in raw_norm.split() if len(w) >= 2]
    if len(cd_words) >= 2 and len(all_cust_words) >= 2:
        matched_tokens = 0
        used = set()
        for i, dw in enumerate(cd_words):
            is_fuzzy = (i >= 2)
            for idx, cw in enumerate(all_cust_words):
                if idx not in used and words_match(dw, cw, allow_fuzzy=is_fuzzy):
                    matched_tokens += 1
                    used.add(idx)
                    break
        if matched_tokens >= 2 and (matched_tokens == len(cd_words) or matched_tokens == len(all_cust_words)):
            return True

    # Distinctive single entity or compound name (e.g. الخيرات or ابوحمزه)
    if len(cd_words) == 1 and cd_words[0] not in GENERIC_SINGLE_NAMES:
        if any(words_match(cd_words[0], w, allow_fuzzy=False) for w in cc_words):
            return True

    return False

def format_date(val):
    if not val:
        return ''
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    if len(s) >= 10 and s[4] == '-' and s[7] == '-':
        return s[:10]
    return s

def get_year(val):
    if not val:
        return 0
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.year
    s = str(val).strip()
    if len(s) >= 4 and s[:4].isdigit():
        return int(s[:4])
    return 0

def get_current_week_window(ref_date=None):
    if ref_date is None:
        ref_date = datetime.datetime.now()
    elif isinstance(ref_date, str):
        ref_date = datetime.datetime.strptime(ref_date[:10], '%Y-%m-%d')
        
    day = ref_date.weekday() # 0: Mon, 1: Tue, 2: Wed, 3: Thu, 4: Fri, 5: Sat, 6: Sun
    hour = ref_date.hour
    
    # Weekly cycle: Wednesday to Tuesday.
    # Note: Automatic 7:00 PM Tuesday transition has been completely disabled per user requirement.
    # Weekly rollover is exclusively controlled manually via the "إنهاء الأسبوع ودخول أسبوع جديد" button.
    if day >= 2:
        # Wed(2), Thu(3), Fri(4), Sat(5), Sun(6)
        days_to_wed = day - 2
    else:
        # Mon(0), Tue(1) -> started previous Wednesday
        days_to_wed = day + 5
        
    start_date = ref_date.date() - datetime.timedelta(days=days_to_wed)
    end_date = start_date + datetime.timedelta(days=6)
    return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')

def extract_cashflow():
    """
    Direct extraction solely from 'Master_Data' in 'شيت تحصيل.xlsm'.
    Eliminates all secondary sheets ('خط_سير', 'متابعة المحصل', 'عملاء الدورة', 'cash flow')
    to prevent customer drops or unintended filters.
    
    Master_Data columns:
    - Col B (index 1): Customer Name (اسم العميل)
    - Col C (index 2): Current Balance (الرصيد الحالي)
    - Col D (index 3): Last Payment Year (سنة آخر سداد)
    - Col E (index 4): Last Invoice Year (سنة آخر فاتورة)
    - Col H (index 7): Due Date (تاريخ التحصيل - محدث يدوياً من المستخدم)
    - Col I (index 8): Status (حالة العميل)
    - Col K (index 10): Today Status (حالة اليوم)
    - Col M (index 12): Notes (ملاحظات - محدثة يدوياً من المستخدم)
    """
    if not os.path.exists(EXCEL_FILE):
        print(f"Error: {EXCEL_FILE} does not exist")
        return False

    wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True, read_only=True)

    config_path = os.path.join(PUBLIC_DIR, 'cashflow_config.json')
    existing_config = {
        "weeklyGoal": 4000000,
        "fixedAmounts": {},
        "notes": {},
        "pinnedCustomers": {},
        "previousWeek": None
    }
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                existing_config = json.load(f)
        except Exception as e:
            print("Could not read existing config:", e)

    pinned_customers = existing_config.get("pinnedCustomers", {})
    fixed_amounts = existing_config.get("fixedAmounts", {})
    notes = existing_config.get("notes", {})

    # 1. Load active week treasury transactions dynamically:
    # Auto-fetch all daily snapshots directly from cowshedelnour-glitch/treasury-dashboard repository history
    # This guarantees 100% independence from user PC, absences, and local watcher pauses!
    week_start, week_end = get_current_week_window()
    data_path = os.path.join(PUBLIC_DIR, 'cashflow_data.json')
    
    all_weekly_tx = []
    seen_tx_sigs = set()

    # (A) Query GitHub repository commits for all days in this active week
    try:
        import urllib.request
        commits_url = f"https://api.github.com/repos/cowshedelnour-glitch/treasury-dashboard/commits?since={week_start}T00:00:00Z&until={week_end}T23:59:59Z&per_page=100"
        req = urllib.request.Request(commits_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            commits = json.loads(resp.read().decode('utf-8'))
        
        latest_by_date = {}
        for c in commits:
            dt = c['commit']['author']['date'].split('T')[0]
            if dt not in latest_by_date and week_start <= dt <= week_end:
                latest_by_date[dt] = c['sha']
        
        print(f"Discovered {len(latest_by_date)} daily treasury snapshots in active week: {sorted(latest_by_date.keys())}")
        
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
                        i_type = str(item.get('type', 'خزينة')).strip()
                        i_date = str(item.get('date', dt)).strip() or dt
                        i_rcpt = str(item.get('receipt', '')).strip() or f"live_{i_date}_{idx}"
                        norm_i = normalize_arabic(i_desc)
                        sig = f"{i_date}_{norm_i}_{i_amt}_{i_rcpt}"
                        if i_amt > 0 and norm_i and sig not in seen_tx_sigs:
                            # Exclude internal non-customer movements
                            if any(x in norm_i for x in ['النور نقد', 'نقديه النور', 'نقدية النور', 'نقدي النور']) or norm_i in ['النور', 'معلف النور']:
                                continue
                            if norm_i in TREASURY_CUSTOMER_ALIASES:
                                i_desc = TREASURY_CUSTOMER_ALIASES[norm_i]
                            seen_tx_sigs.add(sig)
                            all_weekly_tx.append({
                                "receipt": i_rcpt,
                                "amount": i_amt,
                                "description": i_desc,
                                "type": i_type,
                                "date": i_date
                            })
            except Exception as e_snap:
                print(f"Note: error fetching snapshot for {dt}:", e_snap)
    except Exception as e_commits:
        print("Note: GitHub commits fetch failed or offline, falling back to cached/live data:", e_commits)

    # (B) Fallback / Real-time Today overlay from live URL
    try:
        req_live = urllib.request.Request(
            "https://cowshedelnour-glitch.github.io/treasury-dashboard/data.json",
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req_live, timeout=5) as resp_live:
            t_data = json.loads(resp_live.read().decode('utf-8'))
            t_rep_date = str(t_data.get('reportDate', '')).strip() or datetime.date.today().strftime('%Y-%m-%d')
            for idx, item in enumerate(t_data.get('transactions', {}).get('incoming', [])):
                i_amt = float(item.get('amount', 0))
                i_desc = str(item.get('description', '')).strip()
                i_type = str(item.get('type', 'خزينة')).strip()
                i_date = str(item.get('date', t_rep_date)).strip() or t_rep_date
                i_rcpt = str(item.get('receipt', '')).strip() or f"live_{i_date}_{idx}"
                norm_i = normalize_arabic(i_desc)
                sig = f"{i_date}_{norm_i}_{i_amt}_{i_rcpt}"
                if i_amt > 0 and norm_i and sig not in seen_tx_sigs:
                    if any(x in norm_i for x in ['النور نقد', 'نقديه النور', 'نقدية النور', 'نقدي النور']) or norm_i in ['النور', 'معلف النور']:
                        continue
                    if norm_i in TREASURY_CUSTOMER_ALIASES:
                        i_desc = TREASURY_CUSTOMER_ALIASES[norm_i]
                    seen_tx_sigs.add(sig)
                    all_weekly_tx.append({
                        "receipt": i_rcpt,
                        "amount": i_amt,
                        "description": i_desc,
                        "type": i_type,
                        "date": i_date
                    })
    except Exception as e_live:
        print("Note: live treasury incoming fetch failed:", e_live)

    # (C) Merge with cached past transactions only if no transactions were discovered
    if len(all_weekly_tx) == 0 and os.path.exists(data_path):
        try:
            with open(data_path, 'r', encoding='utf-8') as f:
                prev_d = json.load(f)
                if isinstance(prev_d, dict) and 'weeklyTreasuryTransactions' in prev_d:
                    for idx, t in enumerate(prev_d['weeklyTreasuryTransactions']):
                        t_date = str(t.get('date', '')).strip()
                        t_desc = normalize_arabic(t.get('description', ''))
                        t_amt = float(t.get('amount', 0))
                        t_rcpt = str(t.get('receipt', '')).strip()
                        sig = f"{t_date}_{t_desc}_{t_amt}_{t_rcpt}"
                        if t_amt > 0 and t_desc and (week_start <= t_date <= week_end) and sig not in seen_tx_sigs:
                            if any(x in t_desc for x in ['النور نقد', 'نقديه النور', 'نقدية النور', 'نقدي النور']) or t_desc in ['النور', 'معلف النور']:
                                continue
                            seen_tx_sigs.add(sig)
                            all_weekly_tx.append(t)
        except Exception as e_cached:
            print("Note: cached data read:", e_cached)

    existing_weekly_tx = all_weekly_tx
    print(f"Total authentic weekly treasury transactions assembled: {len(existing_weekly_tx)}, sum = {sum(t['amount'] for t in existing_weekly_tx)}")

    paid_names_set = set()
    for t in existing_weekly_tx:
        p_desc = normalize_arabic(t.get('description', ''))
        if p_desc:
            paid_names_set.add(p_desc)

    # 2. Extract actual collections from 'قبض' sheet in 'شيت تحصيل.xlsm' for the active week
    week_start, week_end = get_current_week_window()
    sheet_collections = {}
    sheet_cash_amt = 0.0
    if 'قبض' in wb.sheetnames:
        ws_q = wb['قبض']
        for r in list(ws_q.iter_rows(values_only=True))[1:]:
            if r and len(r) > 2 and r[0] and r[1] and r[2]:
                q_name = str(r[0]).strip()
                q_date = format_date(r[1])
                q_amt = float(r[2]) if r[2] is not None and isinstance(r[2], (int, float)) else 0.0
                if q_amt > 0 and q_date and week_start <= q_date <= week_end:
                    norm_q = normalize_arabic(q_name)
                    if 'النور نقد' in norm_q or 'نقديه النور' in norm_q or 'نقدية النور' in norm_q or 'نقدي النور' in norm_q or norm_q in ('النور', 'معلف النور'):
                        continue
                    if norm_q in ('عميل نقدي', 'عميل نقدى', 'نقدي', 'نقدى', 'كاش', 'مبيعات نقدية'):
                        sheet_cash_amt += q_amt
                        continue
                    sheet_collections[norm_q] = sheet_collections.get(norm_q, 0.0) + q_amt

    # 2.5 Index Master_Data - The ONLY authoritative sheet
    master_dict = {}
    master_names_list = []
    master_names_set = set()
    master_customers_list = []

    if 'Master_Data' in wb.sheetnames:
        ws_m = wb['Master_Data']
        m_rows = list(ws_m.iter_rows(values_only=True))
        for r in m_rows[1:]:
            if r and len(r) > 2 and r[1]:
                m_name = str(r[1]).strip()
                norm = normalize_arabic(m_name)
                if not norm:
                    continue
                m_bal = float(r[2]) if r[2] is not None and isinstance(r[2], (int, float)) else 0.0
                pay_yr = get_year(r[3]) if len(r) > 3 else 0
                inv_yr = get_year(r[4]) if len(r) > 4 else 0
                m_due = format_date(r[7]) if len(r) > 7 else ''
                status = str(r[8]).strip() if len(r) > 8 and r[8] else ''
                today_status = str(r[10]).strip() if len(r) > 10 and r[10] else ''
                m_note = str(r[12]).strip() if len(r) > 12 and r[12] else ''

                is_khalis = ('عميل خالص' in status) or ('خالص' in today_status) or ('تم التصفية' in m_note)
                is_active_2026 = (pay_yr >= 2026 or inv_yr >= 2026)

                master_dict[norm] = {
                    'name': m_name,
                    'balance': m_bal,
                    'dueDate': m_due,
                    'notes': m_note,
                    'isKhalis': is_khalis,
                    'isActive2026': is_active_2026,
                    'lastPaymentYear': pay_yr,
                    'lastInvoiceYear': inv_yr,
                }

    # Map each collection in sheet_collections strictly to ONE customer in master_dict
    matched_sheet_collections = {}
    for sq_norm, sq_amt in sheet_collections.items():
        if sq_norm in master_dict:
            matched_sheet_collections[sq_norm] = matched_sheet_collections.get(sq_norm, 0.0) + sq_amt
        else:
            best_match = None
            for m_norm, m_info in master_dict.items():
                if match_treasury_to_customer(sq_norm, m_info['name']):
                    best_match = m_norm
                    break
            if best_match:
                matched_sheet_collections[best_match] = matched_sheet_collections.get(best_match, 0.0) + sq_amt

    # Populate master_customers_list and update master_dict with collectedFromSheet
    for norm, m_info in master_dict.items():
        m_name = m_info['name']
        # User instruction: sheet 'قبض' is for comparison only; official collections come strictly from Treasury vouchers!
        sheet_amt = 0.0
        m_info['collectedFromSheet'] = sheet_amt

        is_expense = any(k in norm for k in ['ريع نقل', 'سولار', 'مصاريف', 'مرتبات', 'كهرباء', 'مياه', 'صيانة', 'بوفيه', 'ادوات', 'ايجار', 'ايراد'])
        if not is_expense and m_name:
            master_names_list.append(m_name)
            master_names_set.add(norm)
            master_customers_list.append({
                'customerName': m_name,
                'currentBalance': m_info['balance'],
                'dueDate': m_info['dueDate'],
                'notes': m_info['notes'],
                'isActive2026': m_info['isActive2026'],
                'isKhalis': m_info['isKhalis'],
                'collectedFromSheet': sheet_amt,
            })

    def get_sheet_collection(c_name, c_norm):
        return 0.0

    # 3. Extract baseline customers strictly from Master_Data for current cycle window
    data_rows = []

    for norm, m_info in master_dict.items():
        m_name = m_info['name']
        bal = m_info['balance']
        due = m_info['dueDate']
        m_note = m_info['notes']
        is_khalis = m_info['isKhalis']
        is_active_2026 = m_info['isActive2026']

        is_pinned = bool(pinned_customers.get(m_name, False))
        sheet_amt = get_sheet_collection(m_name, norm)
        has_paid = (
            sheet_amt > 0 or
            norm in paid_names_set or
            any(norm in pn or pn in norm for pn in paid_names_set) or
            any(match_treasury_to_customer(tx.get('description', ''), m_name) for tx in existing_weekly_tx)
        )

        # Exclusion 1: Settled accounts (عميل خالص / تم التصفية) unless customer paid this week or is pinned
        if is_khalis and not has_paid and not is_pinned:
            continue

        # Exclusion 2: Must have balance >= 5000 EGP unless customer paid this week or is pinned
        if bal < 5000 and not has_paid and not is_pinned:
            continue

        # Exclusion 3: Must be active in 2026 unless customer paid this week or is pinned
        if not is_active_2026 and not has_paid and not is_pinned:
            continue

        # Due Date Rule: Due date in Master_Data (Col H) must fall on or before week_end
        is_due_this_week = bool(due and due <= week_end)

        if not is_due_this_week and not has_paid and not is_pinned:
            continue

        # Determine expected amount:
        # 1. Manual user override takes absolute priority
        # 2. Unexpected payer who paid during week but wasn't due gets 0.0
        # 3. Otherwise current balance is the baseline target
        if m_name in fixed_amounts:
            expected = max(0.0, float(fixed_amounts[m_name]))
        elif not is_due_this_week and has_paid:
            expected = 0.0
        else:
            expected = max(0.0, bal)

        # Notes: User-saved notes (from config) take priority; fall back to Master_Data if not set
        if m_name in notes and notes[m_name] != '':
            note = notes[m_name]  # Keep user's saved note
        else:
            note = m_note or ''  # Use Excel note as default only if no saved note
            if note:
                notes[m_name] = note  # Save new note from Excel (only if not already set)

        data_rows.append({
            'customerName': m_name,
            'normalizedName': norm,
            'currentBalance': bal,
            'expectedAmount': expected,
            'collectedFromSheet': sheet_amt,
            'dueDate': due,
            'rate': 0.0,
            'status': 'لم يسدد',
            'remaining': expected,
            'notes': note,
            'isPinned': is_pinned
        })

    # 4. Ensure permanent Cash Customer exists and is pinned
    CASH_CUSTOMER_NAME = "عميل نقدي (كاش)"
    pinned_customers[CASH_CUSTOMER_NAME] = True
    has_cash_cust = any(r['customerName'] == CASH_CUSTOMER_NAME or 'نقدي' in r['customerName'] for r in data_rows)
    if not has_cash_cust:
        cash_exp = fixed_amounts.get(CASH_CUSTOMER_NAME, 0.0)
        cash_note = notes.get(CASH_CUSTOMER_NAME, 'مبيعات وتحصيلات نقدية أسبوعية (كاش)')
        data_rows.append({
            'customerName': CASH_CUSTOMER_NAME,
            'normalizedName': normalize_arabic(CASH_CUSTOMER_NAME),
            'currentBalance': 0.0,
            'expectedAmount': cash_exp,
            'collectedFromSheet': sheet_cash_amt,
            'dueDate': '',
            'rate': 1.0 if cash_exp == 0 else 0.0,
            'status': 'مكتمل' if cash_exp == 0 else 'لم يسدد',
            'remaining': 0.0,
            'notes': cash_note,
            'isPinned': True
        })
        fixed_amounts[CASH_CUSTOMER_NAME] = cash_exp
        if CASH_CUSTOMER_NAME not in notes:
            notes[CASH_CUSTOMER_NAME] = cash_note
    else:
        for r in data_rows:
            if r['customerName'] == CASH_CUSTOMER_NAME or 'نقدي' in r['customerName']:
                r['collectedFromSheet'] = max(r.get('collectedFromSheet', 0.0), sheet_cash_amt)

    # Sort customers: Pinned first, then by due date ascending, then balance descending
    def customer_sort_order(c):
        p_rank = 0 if c['isPinned'] else 1
        d_val = c['dueDate'] if c['dueDate'] else '9999-99-99'
        return (p_rank, d_val, -c['currentBalance'])

    data_rows.sort(key=customer_sort_order)
    for i, r in enumerate(data_rows):
        r['index'] = i + 1

    existing_config["pinnedCustomers"] = pinned_customers
    existing_config["fixedAmounts"] = fixed_amounts  # Preserve ALL user overrides, not just pinned
    existing_config["notes"] = notes
    existing_config["updatedAt"] = datetime.datetime.now().isoformat()

    os.makedirs(PUBLIC_DIR, exist_ok=True)
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(existing_config, f, ensure_ascii=False, indent=2)

    total_expected = sum(r['expectedAmount'] for r in data_rows)
    total_collected = sum(r['collectedFromSheet'] for r in data_rows)

    summary = {
        'reportDate': datetime.date.today().strftime('%Y-%m-%d'),
        'weekStart': week_start,
        'weekEnd': week_end,
        'weeklyGoal': existing_config.get('weeklyGoal', 4000000),
        'totalExpected': total_expected,
        'totalCollected': total_collected,
        'customerCount': len(data_rows),
        'remainingToTarget': max(0, existing_config.get('weeklyGoal', 4000000) - total_collected),
        'collectionRate': (total_collected / total_expected) if total_expected > 0 else 0.0,
        'masterCustomerNames': master_names_list,
        'masterCustomers': master_customers_list,
        'weeklyTreasuryTransactions': existing_weekly_tx,
        'customers': data_rows
    }

    with open(data_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    if os.path.exists(DIST_DIR):
        with open(os.path.join(DIST_DIR, 'cashflow_config.json'), 'w', encoding='utf-8') as f:
            json.dump(existing_config, f, ensure_ascii=False, indent=2)
        with open(os.path.join(DIST_DIR, 'cashflow_data.json'), 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"Successfully extracted {len(data_rows)} cashflow customers solely from Master_Data. Total expected: {total_expected:,.2f} EGP")
    return True

if __name__ == '__main__':
    extract_cashflow()
