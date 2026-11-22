import openpyxl
import json
import datetime
import os
import sys

EXCEL_FILE = r'D:\Mostafa Ibrahim\شيت تحصيل.xlsm'
PUBLIC_DIR = r'public'
DIST_DIR = r'dist'

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

def words_match(w1, w2):
    if w1 == w2:
        return True
    nw1 = w1.rstrip('ي')
    nw2 = w2.rstrip('ي')
    if nw1 == nw2:
        return True
    sw1 = nw1[2:] if nw1.startswith('ال') and len(nw1) >= 4 else nw1
    sw2 = nw2[2:] if nw2.startswith('ال') and len(nw2) >= 4 else nw2
    return sw1 == sw2

def match_treasury_to_customer(desc, cust_name):
    if not desc or not cust_name:
        return False
    cd = clean_arabic_matching(desc)
    cc = clean_arabic_matching(cust_name)
    if not cd or not cc:
        return False
    if cd == cc or words_match(cd, cc):
        return True

    cd_words = [w for w in cd.split() if len(w) >= 2]
    cc_words = [w for w in cc.split() if len(w) >= 2]

    # Prefix match on clean words
    if len(cd_words) >= 2 and len(cc_words) >= 2:
        m_count = 0
        min_len = min(len(cd_words), len(cc_words))
        for i in range(min_len):
            if words_match(cd_words[i], cc_words[i]):
                m_count += 1
            else:
                break
        if m_count >= 2 and (m_count == len(cd_words) or m_count == len(cc_words)):
            return True

    # Match across full customer name (including paren annotations like مرسي مدشه or عبدالتواب احمد ميدوم)
    raw_norm = normalize_arabic(cust_name)
    for ch in ['-', '/', '\\', '_', '.', ',', '،', '(', ')']:
        raw_norm = raw_norm.replace(ch, ' ')
    all_cust_words = [w for w in raw_norm.split() if len(w) >= 2]
    if len(cd_words) >= 2 and len(all_cust_words) >= 2:
        m_all = 0
        min_all = min(len(cd_words), len(all_cust_words))
        for i in range(min_all):
            if words_match(cd_words[i], all_cust_words[i]):
                m_all += 1
            else:
                break
        if m_all >= 2 and (m_all == len(cd_words) or m_all == len(all_cust_words)):
            return True

    # Distinctive single entity or compound name (e.g. الخيرات or ابوحمزه)
    if len(cd_words) == 1 and cd_words[0] not in GENERIC_SINGLE_NAMES:
        if any(words_match(cd_words[0], w) for w in cc_words):
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
    # Rule (أ) Fresh Snapshot لليوم الحالي (Today) مباشرة من شيت الخزينة اللحظي
    # Rule (ب) تجميد الأيام السابقة (Past Days) من نفس الأسبوع دون مساس ولا تكرار
    week_start, week_end = get_current_week_window()
    data_path = os.path.join(PUBLIC_DIR, 'cashflow_data.json')
    
    live_incoming_tx = []
    t_rep_date = datetime.date.today().strftime('%Y-%m-%d')
    try:
        import urllib.request
        req = urllib.request.Request(
            "https://cowshedelnour-glitch.github.io/treasury-dashboard/data.json",
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            t_data = json.loads(resp.read().decode('utf-8'))
            t_rep_date = str(t_data.get('reportDate', '')).strip() or t_rep_date
            incoming_list = t_data.get('transactions', {}).get('incoming', [])
            for idx, item in enumerate(incoming_list):
                i_amt = float(item.get('amount', 0))
                i_desc = str(item.get('description', '')).strip()
                i_type = str(item.get('type', 'خزينة')).strip()
                i_date = str(item.get('date', t_rep_date)).strip()
                i_rcpt = str(item.get('receipt', '')).strip() or f"live_{i_date}_{idx}"
                norm_i = normalize_arabic(i_desc)
                if i_amt > 0 and norm_i:
                    # Exclude internal non-customer movements like "النور نقدية"
                    if 'النور نقد' in norm_i or 'نقديه النور' in norm_i or 'نقدية النور' in norm_i or 'نقدي النور' in norm_i or norm_i in ('النور', 'معلف النور'):
                        continue
                    live_incoming_tx.append({
                        "receipt": i_rcpt,
                        "amount": i_amt,
                        "description": i_desc,
                        "type": i_type,
                        "date": i_date
                    })
    except Exception as e:
        print("Note: live treasury incoming fetch failed or offline:", e)

    # Rule (ب): تجميد الأيام السابقة من الداتا المحفوظة
    past_days_tx = []
    cached_today_tx = []
    if os.path.exists(data_path):
        try:
            with open(data_path, 'r', encoding='utf-8') as f:
                prev_d = json.load(f)
                if isinstance(prev_d, dict) and 'weeklyTreasuryTransactions' in prev_d:
                    seen_past_sigs = set()
                    for idx, t in enumerate(prev_d['weeklyTreasuryTransactions']):
                        t_date = str(t.get('date', '')).strip()
                        t_desc = normalize_arabic(t.get('description', ''))
                        t_amt = float(t.get('amount', 0))
                        t_rcpt = str(t.get('receipt', '')).strip()
                        if t_amt <= 0 or not t_desc:
                            continue
                        if t_date and (t_date < week_start or t_date > week_end):
                            continue
                        if 'النور نقد' in t_desc or 'نقديه النور' in t_desc or 'نقدية النور' in t_desc or 'نقدي النور' in t_desc or t_desc in ('النور', 'معلف النور'):
                            continue
                        
                        # Cleanup duplicate transaction for Mahmoud Ismail (live_2026-11-18_11)
                        if t_rcpt == 'live_2026-11-18_11':
                            continue

                        if t_date and t_date < t_rep_date:
                            # Frozen past day of this active cycle
                            sig = f"{t_date}_{t_rcpt}" if t_rcpt else f"{t_date}_{t_desc}_{t_amt}_{idx}"
                            if sig not in seen_past_sigs:
                                past_days_tx.append(t)
                                seen_past_sigs.add(sig)
                        else:
                            # Cached copy of today (fallback in case live fetch fails)
                            cached_today_tx.append(t)
        except Exception as e:
            print("Could not read previous weekly treasury data:", e)

    # Exception for K3863 (Ismail Youssef) from 2026-11-18 (dropped due to index collision)
    k3863_found = any(
        (t.get('receipt') == 'K3863' or (t.get('date') == '2026-11-18' and 'اسماعيل يوسف' in t.get('description', '')))
        for t in past_days_tx
    )
    if not k3863_found:
        past_days_tx.append({
            "receipt": "K3863",
            "amount": 2000.0,
            "description": "اسماعيل يوسف (الحموي)",
            "type": "كاش",
            "date": "2026-11-18"
        })

    # Rule (أ): إذا تم جلب حركات اليوم طازجة من الخزينة نعتمدها هي فقط لليوم، وإلا نستخدم الكاش
    if live_incoming_tx:
        existing_weekly_tx = past_days_tx + live_incoming_tx
    else:
        existing_weekly_tx = past_days_tx + cached_today_tx

    paid_names_set = set()
    for t in existing_weekly_tx:
        p_desc = normalize_arabic(t.get('description', ''))
        if p_desc:
            paid_names_set.add(p_desc)

    # 2. Index Master_Data - The ONLY authoritative sheet
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

                # Include legitimate master customers in searchable list
                is_expense = any(k in norm for k in ['ريع نقل', 'سولار', 'مصاريف', 'مرتبات', 'كهرباء', 'مياه', 'صيانة', 'بوفيه', 'ادوات', 'ايجار', 'ايراد'])
                if not is_expense and m_name:
                    master_names_list.append(m_name)
                    master_names_set.add(norm)
                    master_customers_list.append({
                        'customerName': m_name,
                        'currentBalance': m_bal,
                        'dueDate': m_due,
                        'notes': m_note,
                        'isActive2026': is_active_2026,
                        'isKhalis': is_khalis,
                    })

    # 3. Extract baseline customers strictly from Master_Data for current cycle window
    week_start, week_end = get_current_week_window()
    data_rows = []

    for norm, m_info in master_dict.items():
        m_name = m_info['name']
        bal = m_info['balance']
        due = m_info['dueDate']
        m_note = m_info['notes']
        is_khalis = m_info['isKhalis']
        is_active_2026 = m_info['isActive2026']

        is_pinned = bool(pinned_customers.get(m_name, False))
        has_paid = (
            norm in paid_names_set or
            any(norm in pn or pn in norm for pn in paid_names_set) or
            any(match_treasury_to_customer(tx.get('description', ''), m_name) for tx in existing_weekly_tx)
        )

        # Exclusion 1: Settled accounts (عميل خالص / تم التصفية)
        if is_khalis:
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
            expected = float(fixed_amounts[m_name])
        elif not is_due_this_week and has_paid:
            expected = 0.0
        else:
            expected = bal

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
            'collectedFromSheet': 0.0,
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
            'collectedFromSheet': 0.0,
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
