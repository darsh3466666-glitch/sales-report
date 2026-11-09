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
    # remove punctuation and extra spaces
    for ch in ['(', ')', '-', '/', '\\', '_', '.', ',', '،']:
        text = text.replace(ch, ' ')
    return ' '.join(text.split())

def extract_cashflow():
    if not os.path.exists(EXCEL_FILE):
        print(f"Error: {EXCEL_FILE} does not exist")
        return False

    wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True, read_only=True)
    if 'cash flow' not in wb.sheetnames:
        print("Warning: 'cash flow' sheet not found")
        return False

    ws_cf = wb['cash flow']
    rows = list(ws_cf.iter_rows(values_only=True))

    config_path = os.path.join(PUBLIC_DIR, 'cashflow_config.json')
    existing_config = {"weeklyGoal": 4000000, "fixedAmounts": {}, "notes": {}, "customExpected": {}}
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                existing_config = json.load(f)
        except Exception as e:
            print("Could not read existing config:", e)

    data_rows = []
    pinned_customers = existing_config.get("pinnedCustomers", {})
    fixed_amounts = existing_config.get("fixedAmounts", {})
    notes = existing_config.get("notes", {})

    for i in range(4, len(rows)):
        r = rows[i]
        if not r or len(r) < 3 or not r[2]:
            continue
        c_name = str(r[2]).strip()
        bal = float(r[1]) if r[1] is not None and isinstance(r[1], (int, float)) else 0.0
        
        # Pinned logic: default is False. Only user explicitly decides who is pinned!
        is_pinned = bool(pinned_customers.get(c_name, False))

        # If user explicitly pinned the customer, their fixed amount is preserved; otherwise use sheet expected
        sheet_expected = float(r[3]) if r[3] is not None and isinstance(r[3], (int, float)) else 0.0
        expected = float(fixed_amounts[c_name]) if is_pinned and c_name in fixed_amounts else sheet_expected
        
        collected = float(r[4]) if r[4] is not None and isinstance(r[4], (int, float)) else 0.0
        
        due_date = ""
        if isinstance(r[5], (datetime.datetime, datetime.date)):
            due_date = r[5].strftime('%Y-%m-%d')
        elif r[5]:
            due_date = str(r[5]).strip()

        rate = float(r[6]) if r[6] is not None and isinstance(r[6], (int, float)) else (collected / expected if expected > 0 else 0.0)
        status = str(r[7]).strip() if r[7] else ('مكتمل' if collected >= expected and expected > 0 else ('جزئي' if collected > 0 else 'لم يسدد'))
        remaining = float(r[8]) if r[8] is not None and isinstance(r[8], (int, float)) else (expected - collected)
        note = str(r[9]).strip() if len(r) > 9 and r[9] else ''

        if note and c_name not in notes:
            notes[c_name] = note

        data_rows.append({
            'index': len(data_rows) + 1,
            'customerName': c_name,
            'normalizedName': normalize_arabic(c_name),
            'currentBalance': bal,
            'expectedAmount': expected,
            'collectedFromSheet': collected,
            'dueDate': due_date,
            'rate': rate,
            'status': status,
            'remaining': remaining,
            'notes': note or notes.get(c_name, ''),
            'isPinned': is_pinned
        })

    # Ensure permanent Cash Customer exists and is pinned weekly
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

    # Keep only explicitly pinned customers in fixedAmounts
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
        'weeklyGoal': existing_config.get('weeklyGoal', 4000000),
        'totalExpected': total_expected,
        'totalCollected': total_collected,
        'customerCount': len(data_rows),
        'remainingToTarget': max(0, existing_config.get('weeklyGoal', 4000000) - total_collected),
        'collectionRate': (total_collected / total_expected) if total_expected > 0 else 0.0,
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

    print(f"[extract_cashflow] Success! Extracted {len(data_rows)} customers, Total Expected: {total_expected:,.2f}, Total Collected: {total_collected:,.2f}")
    return True

if __name__ == '__main__':
    extract_cashflow()
