import openpyxl
import json
import datetime
import os
import sys

EXCEL_FILE = r'D:\Mostafa Ibrahim\شيت تحصيل.xlsm'
PUBLIC_DIR = r'public'
DIST_DIR = r'dist'

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
    
    # Automatic cycle transition: Week ends Tuesday at 7:00 PM (19:00)
    if day == 1 and hour >= 19:
        # Tuesday after 7 PM -> transitions to new cycle starting tomorrow Wednesday!
        days_to_wed = -1
    elif day >= 2:
        # Wed(2), Thu(3), Fri(4), Sat(5), Sun(6)
        days_to_wed = day - 2
    else:
        # Mon(0), Tue(1) before 7 PM
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

    # 1. Load active week treasury transactions
    data_path = os.path.join(PUBLIC_DIR, 'cashflow_data.json')
    default_seed_tx = [
        {"receipt": "K3786", "amount": 800, "description": "عميل نقدى", "type": "خزينة", "date": "2026-11-11"},
        {"receipt": "K3787", "amount": 16000, "description": "محمود ابو زيد - الهداهده", "type": "خزينة", "date": "2026-11-11"},
        {"receipt": "K3788", "amount": 30000, "description": "احمد راغب(الهداهدة)", "type": "خزينة", "date": "2026-11-11"},
        {"receipt": "K3789", "amount": 44000, "description": "اسامه علي عبد الكريم", "type": "خزينة", "date": "2026-11-11"},
        {"receipt": "K3790", "amount": 50, "description": "عميل نقدى", "type": "خزينة", "date": "2026-11-11"},
        {"receipt": "K3791", "amount": 200000, "description": "محمد يونس عبد اللطيف(قلمشاه)", "type": "ب مصر", "date": "2026-11-11"},
        {"receipt": "K3793", "amount": 29000, "description": "حمزة عبدالحميد خليفة - حلوان", "type": "خزينة", "date": "2026-11-11"},
        {"receipt": "K3794", "amount": 10700, "description": "محمد حنفي(شعبان) طريق اسيوط", "type": "خزينة", "date": "2026-11-11"},
        {"receipt": "K3795", "amount": 1570, "description": "مرسي (مدشه)", "type": "خزينة", "date": "2026-11-11"},
        {"receipt": "K3796", "amount": 850, "description": "عميل نقدى", "type": "خزينة", "date": "2026-11-11"},
        {"receipt": "K3797", "amount": 39200, "description": "محمد ابو فهد-المنيب", "type": "خزينة", "date": "2026-11-12"},
        {"receipt": "K3798", "amount": 140000, "description": "ابو حمزة للأعلاف", "type": "خزينة", "date": "2026-11-12"},
        {"receipt": "K3799", "amount": 5700, "description": "علي محمد (نصار)", "type": "خزينة", "date": "2026-11-12"},
        {"receipt": "K3800", "amount": 1700, "description": "عميل نقدى", "type": "خزينة", "date": "2026-11-12"},
        {"receipt": "K3801", "amount": 850, "description": "عميل نقدى", "type": "خزينة", "date": "2026-11-12"},
        {"receipt": "K3802", "amount": 100000, "description": "ايه بي ديري /هشام فؤادطارق حسن وشركاه", "type": "تنمية", "date": "2026-11-12"},
        {"receipt": "K3803", "amount": 1190, "description": "عميل نقدى", "type": "خزينة", "date": "2026-11-12"},
        {"receipt": "K3804", "amount": 5000, "description": "حماده عبد الخالق قيصر", "type": "خزينة", "date": "2026-11-12"},
        {"receipt": "K3805", "amount": 200000, "description": "مزرعه الخيرات", "type": "زراعي", "date": "2026-11-12"},
        {"receipt": "K3806", "amount": 40000, "description": "عبد التواب احمد( ميدوم )", "type": "ب مصر", "date": "2026-11-12"},
        {"receipt": "K3807", "amount": 850, "description": "عميل نقدى", "type": "خزينة", "date": "2026-11-12"},
        {"receipt": "K3808", "amount": 5000, "description": "قرنى احمد محمد حسين (كمال علوى)", "type": "خزينة", "date": "2026-11-14"},
        {"receipt": "K3809", "amount": 1700, "description": "عميل نقدى", "type": "خزينة", "date": "2026-11-14"},
        {"receipt": "K3810", "amount": 605, "description": "بدوي حجازي البطل (الشوبك )", "type": "خزينة", "date": "2026-11-14"},
        {"receipt": "K3811", "amount": 21500, "description": "بدوي حجازي البطل (الشوبك )", "type": "ب مصر", "date": "2026-11-14"},
        {"receipt": "K3812", "amount": 13495, "description": "بدوي حجازي البطل (الشوبك )", "type": "فودا", "date": "2026-11-14"},
        {"receipt": "K3813", "amount": 7000, "description": "ايمن علي حسن", "type": "خزينة", "date": "2026-11-14"},
        {"receipt": "K3814", "amount": 2000, "description": "سامي قرني(اسعد نصيف)", "type": "خزينة", "date": "2026-11-14"},
        {"receipt": "K3815", "amount": 40000, "description": "عدلي عبدالهادي (ابو شويقي)", "type": "خزينة", "date": "2026-11-14"},
        {"receipt": "K3816", "amount": 150000, "description": "كرم مسعود ابو بكر (الهداهده)", "type": "خزينة", "date": "2026-11-14"},
        {"receipt": "K3817", "amount": 2550, "description": "عميل نقدى", "type": "خزينة", "date": "2026-11-14"}
    ]
    existing_weekly_tx = list(default_seed_tx)
    if os.path.exists(data_path):
        try:
            with open(data_path, 'r', encoding='utf-8') as f:
                prev_d = json.load(f)
                if isinstance(prev_d, dict) and 'weeklyTreasuryTransactions' in prev_d:
                    seen_sigs = set(f"{t.get('date')}_{normalize_arabic(t.get('description',''))}_{float(t.get('amount', 0))}" for t in existing_weekly_tx)
                    for t in prev_d['weeklyTreasuryTransactions']:
                        t_date = str(t.get('date', '')).strip()
                        # If date is within the current active cycle, default_seed_tx is authoritative
                        if "2026-11-11" <= t_date <= "2026-11-17":
                            continue
                        sig = f"{t.get('date')}_{normalize_arabic(t.get('description',''))}_{float(t.get('amount', 0))}"
                        if sig not in seen_sigs:
                            existing_weekly_tx.append(t)
                            seen_sigs.add(sig)
        except Exception:
            pass

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
        has_paid = norm in paid_names_set or any(norm in pn or pn in norm for pn in paid_names_set)

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

        # Notes priority: Master_Data Column M first, then config notes
        note = m_note or notes.get(m_name, '')
        if note:
            notes[m_name] = note

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

    clean_fixed = {k: v for k, v in fixed_amounts.items() if pinned_customers.get(k, False)}
    existing_config["pinnedCustomers"] = pinned_customers
    existing_config["fixedAmounts"] = clean_fixed
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
