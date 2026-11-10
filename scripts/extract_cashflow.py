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
    Smart extraction without relying on the legacy 'cash flow' sheet.
    Sources due dates, targets, and balances from:
    1. 'خط_سير' (Weekly Route targets and new due dates)
    2. 'عملاء الدورة ' (Cycle customers whose due date falls in the period)
    3. 'Master_Data' (Current balances and payment agreements)
    Enforces strict business rules:
    - Minimum balance >= 1000 EGP (excluding cash customer)
    - Active customer in 2026 (last payment or invoice in 2026)
    - Excludes settled/cleared accounts (خالص / تم التصفية)
    - Only authentic Master_Data customer accounts
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

    # 1. Index Master_Data for latest actual balances and valid customer registry
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

                # Include all legitimate master customers in the searchable master registry for autocomplete/adding
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

    extracted_customers = {}

    # 2. Extract from 'خط_سير' (Primary Route sheet for weekly targets)
    if 'خط_سير' in wb.sheetnames:
        ws_route = wb['خط_سير']
        r_rows = list(ws_route.iter_rows(values_only=True))
        for r in r_rows[1:]:
            if r and len(r) > 4 and r[4]:
                c_name = str(r[4]).strip()
                norm = normalize_arabic(c_name)
                if not norm:
                    continue
                # Expected amount from column F (index 5)
                exp = float(r[5]) if len(r) > 5 and r[5] is not None and isinstance(r[5], (int, float)) else 0.0
                # Due date from column C (index 2)
                due = format_date(r[2]) if len(r) > 2 else ''
                # Note from column J (index 9)
                note = str(r[9]).strip() if len(r) > 9 and r[9] else ''
                
                bal = master_dict.get(norm, {}).get('balance', exp)
                if due == '' and norm in master_dict:
                    due = master_dict[norm].get('dueDate', '')

                extracted_customers[norm] = {
                    'customerName': c_name,
                    'normalizedName': norm,
                    'currentBalance': bal,
                    'expectedAmount': exp,
                    'collectedFromSheet': 0.0,
                    'dueDate': due,
                    'notes': note,
                    'source': 'خط_سير'
                }

    # 3. Extract from 'عملاء الدورة ' (Cycle customers)
    cycle_sheet_name = 'عملاء الدورة ' if 'عملاء الدورة ' in wb.sheetnames else ('عملاء الدورة' if 'عملاء الدورة' in wb.sheetnames else None)
    if cycle_sheet_name:
        ws_cycle = wb[cycle_sheet_name]
        c_rows = list(ws_cycle.iter_rows(values_only=True))
        for r in c_rows[2:]:
            if r and len(r) > 2 and r[1]:
                c_name = str(r[1]).strip()
                norm = normalize_arabic(c_name)
                if not norm:
                    continue
                bal = float(r[2]) if r[2] is not None and isinstance(r[2], (int, float)) else 0.0
                due = format_date(r[3]) if len(r) > 3 else ''

                if norm in extracted_customers:
                    if not extracted_customers[norm]['dueDate'] and due:
                        extracted_customers[norm]['dueDate'] = due
                    if extracted_customers[norm]['currentBalance'] == 0.0 and bal > 0:
                        extracted_customers[norm]['currentBalance'] = bal
                else:
                    if bal > 0:
                        extracted_customers[norm] = {
                            'customerName': c_name,
                            'normalizedName': norm,
                            'currentBalance': bal,
                            'expectedAmount': bal,
                            'collectedFromSheet': 0.0,
                            'dueDate': due,
                            'notes': notes.get(c_name, ''),
                            'source': 'عملاء الدورة'
                        }

    # 4. Fallback merge from legacy 'cash flow' sheet if present (for backward compatibility and sheet collection matching)
    if 'cash flow' in wb.sheetnames:
        ws_cf = wb['cash flow']
        cf_rows = list(ws_cf.iter_rows(values_only=True))
        for r in cf_rows[4:]:
            if r and len(r) > 2 and r[2]:
                c_name = str(r[2]).strip()
                norm = normalize_arabic(c_name)
                if not norm:
                    continue
                bal = float(r[1]) if r[1] is not None and isinstance(r[1], (int, float)) else 0.0
                exp = float(r[3]) if len(r) > 3 and r[3] is not None and isinstance(r[3], (int, float)) else 0.0
                coll = float(r[4]) if len(r) > 4 and r[4] is not None and isinstance(r[4], (int, float)) else 0.0
                due = format_date(r[5]) if len(r) > 5 else ''
                note = str(r[9]).strip() if len(r) > 9 and r[9] else ''

                if norm in extracted_customers:
                    extracted_customers[norm]['collectedFromSheet'] = coll
                    if exp > 0 and extracted_customers[norm]['expectedAmount'] == 0:
                        extracted_customers[norm]['expectedAmount'] = exp
                    if due and not extracted_customers[norm]['dueDate']:
                        extracted_customers[norm]['dueDate'] = due
                    if note and not extracted_customers[norm]['notes']:
                        extracted_customers[norm]['notes'] = note
                else:
                    extracted_customers[norm] = {
                        'customerName': c_name,
                        'normalizedName': norm,
                        'currentBalance': bal,
                        'expectedAmount': exp if exp > 0 else bal,
                        'collectedFromSheet': coll,
                        'dueDate': due,
                        'notes': note or notes.get(c_name, ''),
                        'source': 'cash flow'
                    }

    # 5. Build final customer rows with pinned handling and strict business filters
    week_start, week_end = get_current_week_window()
    data_rows = []
    for norm, c in extracted_customers.items():
        c_name = c['customerName']
        is_cash = (c_name == "عميل نقدي (كاش)")
        
        # Enforce user requirements:
        # 1. Must be present in Master_Data
        # 2. Balance must be >= 5000 EGP (no zeros, piasters, or small residuals)
        # 3. Active in 2026 (last payment or invoice >= 2026)
        # 4. Must not be settled/cleared (عميل خالص / تم التصفية)
        # 5. Strict Week Boundary: Only customers due on or before weekEnd (<= 2026-11-10)
        #    belong to the current week baseline! Customers due after weekEnd belong to the NEXT week!
        #    Exception: If a customer paid during this week, include with expectedAmount = 0.0!
        c_due = c.get('dueDate', '')
        collected = float(c.get('collectedFromSheet', 0.0))

        if not is_cash:
            m_info = master_dict.get(norm)
            if not m_info:
                continue
            bal = m_info.get('balance', 0.0)
            if bal < 5000:
                continue
            if m_info.get('isKhalis', False):
                continue
            if not m_info.get('isActive2026', False):
                continue
            c['currentBalance'] = bal
            if not c['dueDate'] and m_info.get('dueDate'):
                c['dueDate'] = m_info['dueDate']
                c_due = m_info['dueDate']

            is_due_this_week = bool(c_due and c_due <= week_end)
            has_paid_this_week = (collected > 0)

            if not is_due_this_week and not has_paid_this_week:
                # Customer belongs to the next week (e.g. 11/11 to 17/11)! Exclude from current week!
                continue

            if not is_due_this_week and has_paid_this_week:
                # User rule: "عميل سدد واسمه مكنش ف القايمة اول م اتعملت سعتها ضيفه ولكن خلي المتوقع منه صفر وضيف له السداد بتاعه عادي"
                if c_name not in fixed_amounts:
                    c['expectedAmount'] = 0.0

        is_pinned = bool(pinned_customers.get(c_name, False))
        
        # Fixed amount takes precedence
        if c_name in fixed_amounts:
            expected = float(fixed_amounts[c_name])
        else:
            expected = float(c['expectedAmount'])

        collected = float(c['collectedFromSheet'])
        rate = (collected / expected) if expected > 0 else (1.0 if collected > 0 else 0.0)
        
        if expected == 0:
            status = 'مكتمل' if collected > 0 else 'لا يوجد استحقاق'
        elif collected >= expected:
            status = 'مكتمل'
        elif collected > 0:
            status = 'جزئي'
        else:
            status = 'لم يسدد'

        remaining = max(0.0, expected - collected)
        if not is_cash:
            note = m_info.get('notes', '') or c.get('notes', '') or notes.get(c_name, '')
        else:
            note = notes.get(c_name, 'مبيعات وتحصيلات نقدية أسبوعية (كاش)')

        if note:
            notes[c_name] = note

        data_rows.append({
            'index': len(data_rows) + 1,
            'customerName': c_name,
            'normalizedName': norm,
            'currentBalance': c['currentBalance'],
            'expectedAmount': expected,
            'collectedFromSheet': collected,
            'dueDate': c['dueDate'],
            'rate': rate,
            'status': status,
            'remaining': remaining,
            'notes': note,
            'isPinned': is_pinned
        })

    # 6. Ensure permanent Cash Customer exists and is pinned weekly
    CASH_CUSTOMER_NAME = "عميل نقدي (كاش)"
    pinned_customers[CASH_CUSTOMER_NAME] = True
    has_cash_cust = any(r['customerName'] == CASH_CUSTOMER_NAME or 'نقدي' in r['customerName'] for r in data_rows)
    if not has_cash_cust:
        cash_exp = fixed_amounts.get(CASH_CUSTOMER_NAME, 0.0)
        cash_note = notes.get(CASH_CUSTOMER_NAME, 'مبيعات وتحصيلات نقدية أسبوعية (كاش)')
        data_rows.append({
            'index': len(data_rows) + 1,
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
        'customers': data_rows
    }

    data_path = os.path.join(PUBLIC_DIR, 'cashflow_data.json')
    with open(data_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    if os.path.exists(DIST_DIR):
        with open(os.path.join(DIST_DIR, 'cashflow_config.json'), 'w', encoding='utf-8') as f:
            json.dump(existing_config, f, ensure_ascii=False, indent=2)
        with open(os.path.join(DIST_DIR, 'cashflow_data.json'), 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"Successfully extracted {len(data_rows)} cashflow customers. Total expected: {total_expected:,.2f} EGP")
    return True

if __name__ == '__main__':
    extract_cashflow()
