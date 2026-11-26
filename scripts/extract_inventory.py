#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_inventory.py — مستخرج بيانات مخزون النور إلى JSON لنظام المبيعات الموحد
يقرأ ملفات الإكسيل (أرصدة المخازن، آخر فاتورة، حركة الأصناف التفصيلية)
ويولّد public/inventory_data.json و dist/inventory_data.json بكتابة ذرية آمنة.
"""

import json
import os
import shutil
import sys
import time
import traceback
import warnings
from collections import defaultdict
from datetime import datetime

warnings.filterwarnings('ignore')

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

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed", file=sys.stderr)
    sys.exit(1)

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPTS_DIR)

INVENTORY_DIR = r'D:\Mostafa Ibrahim\جرد يومي'
INVENTORY_FILE = os.path.join(INVENTORY_DIR, 'تقارير  ارصدة المخازن.xlsx')
INVOICES_DIR = r'D:\Mostafa Ibrahim\آخر فاتورة للعميل_files'
INVOICES_FILE = os.path.join(INVOICES_DIR, 'اخر فاتورة لعميل.xlsx')
RECONCILIATION_FILES = [
    os.path.join(INVENTORY_DIR, 'تقرير حركة الاصناف تفصيلي .xlsx'),
    os.path.join(INVENTORY_DIR, 'تقرير حركة الاصناف تفصيلي.xlsx'),
]

PUBLIC_JSON_FILE = os.path.join(REPO_DIR, 'public', 'inventory_data.json')
DIST_JSON_FILE = os.path.join(REPO_DIR, 'dist', 'inventory_data.json')
CACHE_REC_FILE = os.path.join(REPO_DIR, 'reconciliations_cache.json')

# الأصناف المستبعدة (تصنيع / عمال / نقل)
EXCLUDED_KEYWORDS = ['تصنيع', 'عمال', 'نقل', 'مصاريف نقل', 'أجور عمال', 'أجور تصنيع', 'مصنعية', 'أجور نقل']

# المعايير القياسية العالمية والمحلية للعجز والفاقد في الأعلاف وتجارة الحبوب (GAFTA / USDA / AFMA)
ITEM_THRESHOLDS = {
    '50005': {'name': 'ذره صفراء', 'safe': 5.0, 'high': 8.0, 'desc': 'حبوب صب كاملة'},
    '50016': {'name': 'فول صويا46%', 'safe': 6.0, 'high': 9.0, 'desc': 'كسب بروتين مطحون'},
    '50018': {'name': 'صويا فولفات', 'safe': 8.0, 'high': 12.0, 'desc': 'صويا مبثوقة عالية الزيت'},
    '50020': {'name': 'دي دي جي', 'safe': 7.0, 'high': 10.0, 'desc': 'مخلفات تقطير ناعمة'},
    '50011': {'name': 'رجيعه (رجيع كون)', 'safe': 10.0, 'high': 15.0, 'desc': 'ألياف أرز سريعة التطاير'},
    '50008': {'name': 'نخاله', 'safe': 10.0, 'high': 15.0, 'desc': 'ردة قمح خفيفة'},
    '50013': {'name': 'بذرة كتان', 'safe': 6.0, 'high': 10.0, 'desc': 'حبوب زيتية'},
    '6950740': {'name': 'كسب النور', 'safe': 15.0, 'high': 25.0, 'desc': 'كسب قطن محلي'},
    '50046': {'name': 'علف النور حلاب', 'safe': 3.0, 'high': 6.0, 'desc': 'علف تام مصنع'},
    '50010': {'name': 'علف تسمين النور', 'safe': 3.0, 'high': 6.0, 'desc': 'علف تام مصنع'},
    '50021': {'name': 'املاح معدنيه حلاب', 'safe': 2.0, 'high': 5.0, 'desc': 'إضافات دقيقة'},
    '50027': {'name': 'فيتامينات حلاب', 'safe': 2.0, 'high': 5.0, 'desc': 'فيتامينات دقيقة'},
    '50038': {'name': 'بيكربونات صوديوم', 'safe': 2.0, 'high': 5.0, 'desc': 'أملاح بيكربونات'},
    '50039': {'name': 'بريمكس تسمين', 'safe': 2.0, 'high': 5.0, 'desc': 'بريمكسات دقيقة'},
    '50033': {'name': 'اكسيد ماغنسيوم', 'safe': 2.0, 'high': 5.0, 'desc': 'معادن دقيقة'},
    '4620686': {'name': 'املاح معدنية اغنام', 'safe': 2.0, 'high': 5.0, 'desc': 'أملاح معدنية'},
    '50024': {'name': 'خميره', 'safe': 2.0, 'high': 5.0, 'desc': 'خمائر حيوية'},
    '50025': {'name': 'مضاد سموم  كيميائي', 'safe': 2.0, 'high': 5.0, 'desc': 'مضاد سموم'},
    '3900354': {'name': 'فيتامينات اغنام', 'safe': 2.0, 'high': 5.0, 'desc': 'فيتامينات دقيقة'},
    '6377177': {'name': 'شكاير منسوجة مقاس 70*115', 'safe': 1.0, 'high': 2.0, 'desc': 'شكاير تعبئة'},
    '2209192': {'name': 'شكاير منسوجة لون أصفر مقاس 110*60', 'safe': 1.0, 'high': 2.0, 'desc': 'شكاير تعبئة'},
    '1801610': {'name': 'شكاير منسوجه لون أبيض بيور مقاس 110*60', 'safe': 1.0, 'high': 2.0, 'desc': 'شكاير تعبئة'},
    '1941822': {'name': 'شكاير شفاف احمر 60*115 بذره', 'safe': 1.0, 'high': 2.0, 'desc': 'شكاير تعبئة'},
}


def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{timestamp}] [extract_inventory] {msg}'
    if sys.stdout is not None:
        try:
            print(line)
        except Exception:
            pass


def get_item_thresholds(code, is_feed=True):
    code_str = str(code).strip()
    if code_str in ITEM_THRESHOLDS:
        info = ITEM_THRESHOLDS[code_str]
        return info['safe'], info['high'], info.get('desc', '')
    if is_feed:
        return 5.0, 10.0, 'خامات أعلاف عامة'
    return 1.0, 2.0, 'مستلزمات تعبئة عامة'


def get_shortage_evaluation(code, kg_per_ton, shortage_pct, is_feed, diff):
    if diff > 0:
        return 'surplus', 'فائض جرد'
    if diff == 0:
        return 'matched', 'مطابق'
    safe, high, _ = get_item_thresholds(code, is_feed)
    val = kg_per_ton if is_feed else shortage_pct
    if val > high:
        return 'high', 'عجز مرتفع'
    if val > safe:
        return 'moderate', 'عجز متوسط'
    return 'safe', 'عجز طبيعي آمن'


def safe_float(val):
    if val is None or val == '':
        return 0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0


def is_excluded(name, group=''):
    text = f"{name} {group}".strip()
    return any(kw in text for kw in EXCLUDED_KEYWORDS)


def find_latest_file(directory, keywords, default_path=None):
    candidates = []
    if os.path.exists(directory):
        try:
            for fname in os.listdir(directory):
                if fname.startswith('~$') or not fname.lower().endswith(('.xlsx', '.xlsm', '.xls')):
                    continue
                if all(kw in fname for kw in keywords):
                    candidates.append(os.path.join(directory, fname))
        except Exception as e:
            log(f"Error scanning directory {directory}: {e}")
    if default_path and os.path.exists(default_path) and default_path not in candidates:
        candidates.append(default_path)
    if not candidates:
        return default_path if (default_path and os.path.exists(default_path)) else None
    return max(candidates, key=lambda p: os.path.getmtime(p))


def safe_load_workbook(file_path, data_only=True, read_only=False, retries=5, delay=1.0):
    for attempt in range(retries):
        try:
            return openpyxl.load_workbook(file_path, data_only=data_only, read_only=read_only)
        except PermissionError:
            log(f"File {os.path.basename(file_path)} locked by Excel (attempt {attempt+1}/{retries}), retrying...")
            time.sleep(delay)
        except Exception as e:
            if attempt == retries - 1:
                raise e
            time.sleep(delay)
    raise IOError(f"Could not open {file_path} after {retries} attempts")


def read_inventory():
    target_file = find_latest_file(INVENTORY_DIR, ['ارصدة', 'المخازن'], INVENTORY_FILE)
    if not target_file or not os.path.exists(target_file):
        log(f'WARNING: Inventory balances file not found in {INVENTORY_DIR}')
        return [], ''
    try:
        mtime_str = datetime.fromtimestamp(os.path.getmtime(target_file)).strftime('%Y-%m-%d %H:%M:%S')
        log(f'Reading inventory balances from: {os.path.basename(target_file)} (modified: {mtime_str})')
        wb = safe_load_workbook(target_file, data_only=True, read_only=False)
        ws = wb.active
        items = []
        print_date = ''
        try:
            cell_val = str(ws.cell(row=2, column=1).value or '')
            if 'Print Date:' in cell_val:
                print_date = cell_val.replace('Print Date:', '').strip()
        except Exception:
            pass
        for row in ws.iter_rows(min_row=4, values_only=True):
            if not row[0] and not row[2]:
                continue
            items.append({
                'store': str(row[0] or '').strip(),
                'code': str(row[1] or '').strip(),
                'name': str(row[2] or '').strip(),
                'unit': str(row[3] or '').strip(),
                'balance': safe_float(row[4]),
                'detailed': str(row[5] or '').strip(),
                'detained': safe_float(row[6]),
                'group': str(row[7] or '').strip(),
                'supplier': str(row[8] or '').strip(),
            })
        wb.close()
        items = [i for i in items if not is_excluded(i['name'], i['group'])]
        items.sort(key=lambda x: (x['group'], x['name']))
        return items, print_date
    except Exception as e:
        log(f'ERROR inventory: {e}')
        return [], ''


def read_invoices():
    target_file = find_latest_file(INVOICES_DIR, ['فاتورة'], INVOICES_FILE)
    if not target_file or not os.path.exists(target_file):
        log(f'WARNING: Invoices file not found in {INVOICES_DIR}')
        return {'items': [], 'top_customers': [], 'daily_totals': [], 'print_date': '', 'total_transactions': 0}

    try:
        wb = safe_load_workbook(target_file, data_only=True, read_only=True)
        ws = wb.active
        print_date = ''
        item_data = defaultdict(lambda: {
            'name': '', 'code': '', 'unit': '',
            'total_out': 0, 'total_in': 0, 'total_revenue': 0,
            'invoice_count': 0, 'prices': [], 'customers': defaultdict(float),
            'daily_out': defaultdict(float), 'daily_customers': defaultdict(lambda: defaultdict(float)),
        })

        for row in ws.iter_rows(min_row=4, values_only=True):
            if not row[0] or not row[1]:
                continue
            code = str(row[0] or '').strip()
            name = str(row[1] or '').strip()
            if is_excluded(name):
                continue

            unit = str(row[2] or '').strip()
            qty_in = safe_float(row[3])
            qty_out = safe_float(row[4])
            price = safe_float(row[5])
            total = safe_float(row[7])
            bayan = str(row[10] or '').strip()
            date_str = str(row[11] or '').strip()

            try:
                date_part = date_str.split(' ')[0] if ' ' in date_str else date_str
                dt = datetime.strptime(date_part, '%Y-%m-%d')
            except Exception:
                dt = None

            item = item_data[code]
            item['name'] = name
            item['code'] = code
            item['unit'] = unit
            item['total_out'] += qty_out
            item['total_in'] += qty_in
            item['total_revenue'] += total
            item['invoice_count'] += 1
            if price > 0:
                item['prices'].append(price)

            customer = ''
            if 'للعميل' in bayan:
                try:
                    after = bayan.split('للعميل')[1]
                    customer = after.split('رقم')[0].strip() if 'رقم' in after else after.strip()
                except Exception:
                    customer = bayan
            elif bayan:
                customer = bayan

            if customer:
                item['customers'][customer] += qty_out

            if dt:
                date_key = dt.strftime('%Y-%m-%d')
                item['daily_out'][date_key] += qty_out
                if customer:
                    item['daily_customers'][date_key][customer] += qty_out

        wb.close()

        items_list = []
        for code, data in item_data.items():
            avg_price = (sum(data['prices']) / len(data['prices'])) if data['prices'] else 0
            latest_price = data['prices'][-1] if data['prices'] else 0
            top_customers = sorted(data['customers'].items(), key=lambda x: x[1], reverse=True)[:5]

            items_list.append({
                'code': code,
                'name': data['name'],
                'unit': data['unit'],
                'total_out': round(data['total_out'], 3),
                'total_in': round(data['total_in'], 3),
                'total_revenue': round(data['total_revenue'], 2),
                'invoice_count': data['invoice_count'],
                'avg_price': round(avg_price, 3),
                'latest_price': round(latest_price, 3),
                'top_customers': [{'name': c, 'qty': round(q, 3)} for c, q in top_customers],
                'daily_out': dict(data['daily_out']),
                'daily_customers': {d: dict(custs) for d, custs in data['daily_customers'].items()},
            })

        items_list.sort(key=lambda x: x['total_out'], reverse=True)

        all_customers = defaultdict(float)
        for item in items_list:
            for c in item['top_customers']:
                all_customers[c['name']] += c['qty']
        top_overall = sorted(all_customers.items(), key=lambda x: x[1], reverse=True)[:10]

        daily_totals = defaultdict(float)
        for item in items_list:
            for date, qty in item['daily_out'].items():
                daily_totals[date] += qty
        daily_sorted = sorted(daily_totals.items())

        return {
            'items': items_list,
            'top_customers': [{'name': c, 'qty': round(q, 3)} for c, q in top_overall],
            'daily_totals': [{'date': d, 'qty': round(q, 3)} for d, q in daily_sorted],
            'print_date': print_date,
            'total_transactions': sum(i['invoice_count'] for i in items_list),
        }
    except Exception as e:
        log(f'ERROR invoices: {e}')
        log(traceback.format_exc())
        return {'items': [], 'top_customers': [], 'daily_totals': [], 'print_date': '', 'total_transactions': 0}


def read_reconciliations(inv_items=None, force=False):
    target_file = find_latest_file(INVENTORY_DIR, ['حركة', 'تفصيلي'], RECONCILIATION_FILES[0])

    if not target_file or not os.path.exists(target_file):
        log('WARNING: Reconciliation file not found in ' + str(INVENTORY_DIR))
        if os.path.exists(CACHE_REC_FILE):
            try:
                with open(CACHE_REC_FILE, 'r', encoding='utf-8') as cf:
                    cached = json.load(cf)
                if 'data' in cached:
                    log('Falling back to cached reconciliation data')
                    return cached['data']
            except Exception:
                pass
        return {'items': [], 'summary': {}}

    try:
        mtime = os.path.getmtime(target_file)
        mtime_str = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
        if not force and os.path.exists(CACHE_REC_FILE):
            try:
                with open(CACHE_REC_FILE, 'r', encoding='utf-8') as cf:
                    cached = json.load(cf)
                if cached.get('mtime') == mtime and 'data' in cached:
                    log(f'Reconciliations verified with: {os.path.basename(target_file)} (modified: {mtime_str})')
                    cdata = cached['data']
                    if inv_items:
                        inv_map = {str(i.get('code', '')).strip(): i for i in inv_items}
                        for it in cdata.get('items', []):
                            inv_entry = inv_map.get(str(it['code']).strip())
                            it['current_stock_balance'] = inv_entry['balance'] if inv_entry else None
                    return cdata
            except Exception:
                pass

        log(f'Parsing reconciliations from: {os.path.basename(target_file)} (modified: {mtime_str})')
        wb = safe_load_workbook(target_file, data_only=True, read_only=True)
        ws = wb.active

        items_movements = defaultdict(list)
        cotton_seed_wared = []

        for row in ws.iter_rows(min_row=4, values_only=True):
            code = str(row[0] or '').strip()
            if not code:
                continue
            name = str(row[1] or '').strip()
            if is_excluded(name):
                continue

            unit = str(row[2] or '').strip()
            wared = safe_float(row[3])
            sader = safe_float(row[4])
            talef = safe_float(row[5])
            balance = safe_float(row[6])
            bayan = str(row[7] or '').strip()
            date_str = str(row[8] or '').strip()
            user = str(row[9] or '').strip()

            mov = {
                'code': code, 'name': name, 'unit': unit,
                'wared': wared, 'sader': sader, 'talef': talef,
                'balance': balance, 'bayan': bayan, 'date': date_str, 'user': user,
                'is_tasweya': 'تسوية' in bayan,
            }
            items_movements[code].append(mov)
            if code == '1115094' and wared > 0:
                cotton_seed_wared.append((date_str, wared))

        wb.close()

        result_items = []
        total_tasweyat_count = 0
        shortage_items_count = 0
        surplus_items_count = 0
        total_shortage_feed_kg = 0.0
        total_shortage_pieces = 0.0
        total_surplus_feed_kg = 0.0
        total_surplus_pieces = 0.0

        for code, movs in items_movements.items():
            tasweyat = [m for m in movs if m['is_tasweya']]
            if not tasweyat:
                continue

            name = movs[0]['name']
            unit = movs[0]['unit']
            is_kilo = (unit == 'كيلو')
            tasweyat.sort(key=lambda x: x['date'])
            total_tasweyat_count += len(tasweyat)

            history = []
            for idx, t in enumerate(tasweyat):
                p_date = tasweyat[idx - 1]['date'] if idx > 0 else '2025-12-31'
                t_date = t['date']

                c_movs = [m for m in movs if p_date < m['date'] <= t_date and not m['is_tasweya']]
                if code == '6950740':
                    c_wared = sum(w for d, w in cotton_seed_wared if p_date < d <= t_date)
                else:
                    c_wared = sum(m['wared'] for m in c_movs)
                c_sader = sum(m['sader'] for m in c_movs)

                diff = t['wared'] - t['sader']
                status = 'زيادة' if diff > 0 else 'عجز' if diff < 0 else 'مطابق'
                abs_diff = round(abs(diff), 3)

                if idx > 0:
                    prev_bal = tasweyat[idx - 1]['balance']
                else:
                    first_m = movs[0] if movs else None
                    prev_bal = first_m['balance'] if (first_m and 'افتتاح' in first_m.get('bayan', '')) else 0.0

                cur_bal = t['balance']
                cycle_base = round((prev_bal + c_wared) - cur_bal, 3)

                if is_kilo and cycle_base > 0 and diff < 0:
                    kg_per_ton = round((abs_diff / cycle_base) * 1000, 2)
                else:
                    kg_per_ton = 0.0

                shortage_pct = round((abs_diff / cycle_base * 100), 2) if (cycle_base > 0 and diff < 0) else 0.0
                shortage_level, shortage_label = get_shortage_evaluation(code, kg_per_ton, shortage_pct, is_kilo, diff)

                history.append({
                    'date': t_date,
                    'bayan': t['bayan'],
                    'user': t['user'],
                    'status': status,
                    'diff': abs_diff,
                    'raw_diff': diff,
                    'balance': round(t['balance'], 3),
                    'prev_date': p_date,
                    'prev_balance': round(prev_bal, 3),
                    'cycle_base': cycle_base,
                    'cycle_wared': round(c_wared, 3),
                    'cycle_sader': round(c_sader, 3),
                    'kg_per_ton': kg_per_ton,
                    'shortage_pct': shortage_pct,
                    'shortage_level': shortage_level,
                    'shortage_level_label': shortage_label,
                })

            last_h = history[-1]
            last_date = last_h['date']

            post_movs = [m for m in movs if m['date'] > last_date and not m['is_tasweya']]
            if code == '6950740':
                post_wared = sum(w for d, w in cotton_seed_wared if d > last_date)
            else:
                post_wared = sum(m['wared'] for m in post_movs)
            post_sader = sum(m['sader'] for m in post_movs)

            if last_h['raw_diff'] < 0:
                shortage_items_count += 1
                if is_kilo:
                    total_shortage_feed_kg += last_h['diff']
                else:
                    total_shortage_pieces += last_h['diff']
            elif last_h['raw_diff'] > 0:
                surplus_items_count += 1
                if is_kilo:
                    total_surplus_feed_kg += last_h['diff']
                else:
                    total_surplus_pieces += last_h['diff']

            is_cotton_based = (code == '6950740')
            category = 'خامات وأعلاف' if is_kilo else 'مستلزمات تعبئة وتغليف'

            shortage_cycles = [h for h in history if h['raw_diff'] < 0]
            total_item_shortage = sum(h['diff'] for h in shortage_cycles)
            total_shortage_base = sum(h.get('cycle_base', 0) for h in shortage_cycles if h.get('cycle_base', 0) > 0)
            total_all_base = sum(h.get('cycle_base', 0) for h in history if h.get('cycle_base', 0) > 0)
            total_all_wared = sum(h['cycle_wared'] for h in history)

            if is_kilo:
                item_avg_kg_per_ton = round(total_item_shortage / (total_shortage_base / 1000), 2) if total_shortage_base > 0 else 0.0
                item_avg_shortage_pct = round(total_item_shortage / total_shortage_base * 100, 2) if total_shortage_base > 0 else 0.0
            else:
                item_avg_kg_per_ton = 0.0
                item_avg_shortage_pct = round(total_item_shortage / total_shortage_base * 100, 2) if total_shortage_base > 0 else 0.0

            safe_lim, high_lim, item_desc = get_item_thresholds(code, is_kilo)
            cur_shortage_level, cur_shortage_label = get_shortage_evaluation(code, last_h['kg_per_ton'], last_h['shortage_pct'], is_kilo, last_h['raw_diff'])
            avg_shortage_level, avg_shortage_label = get_shortage_evaluation(code, item_avg_kg_per_ton, item_avg_shortage_pct, is_kilo, -1 if total_item_shortage > 0 else 0)

            result_items.append({
                'code': code,
                'name': name,
                'unit': unit,
                'category': category,
                'is_feed': is_kilo,
                'total_tasweyat': len(tasweyat),
                'last_tasweya_date': last_h['date'],
                'status': last_h['status'],
                'diff': last_h['diff'],
                'raw_diff': last_h['raw_diff'],
                'balance_after': last_h['balance'],
                'cycle_prev_date': last_h['prev_date'],
                'cycle_wared': last_h['cycle_wared'],
                'cycle_sader': last_h['cycle_sader'],
                'cycle_base': last_h.get('cycle_base', 0.0),
                'kg_per_ton': last_h['kg_per_ton'],
                'shortage_pct': last_h['shortage_pct'],
                'threshold_safe': safe_lim,
                'threshold_high': high_lim,
                'threshold_desc': item_desc,
                'shortage_level': cur_shortage_level,
                'shortage_level_label': cur_shortage_label,
                'avg_shortage_level': avg_shortage_level,
                'avg_shortage_label': avg_shortage_label,
                'avg_kg_per_ton': item_avg_kg_per_ton,
                'avg_shortage_pct': item_avg_shortage_pct,
                'total_shortage_qty': round(total_item_shortage, 3),
                'total_cycle_wared': round(total_all_wared, 3),
                'total_cycle_base': round(total_all_base, 3),
                'shortage_cycles_count': len(shortage_cycles),
                'post_wared': round(post_wared, 3),
                'post_sader': round(post_sader, 3),
                'is_cotton_based': is_cotton_based,
                'history': list(reversed(history)),
            })

        inv_map = {str(i.get('code', '')).strip(): i for i in (inv_items or [])}
        for it in result_items:
            inv_entry = inv_map.get(str(it['code']).strip())
            it['current_stock_balance'] = inv_entry['balance'] if inv_entry else None

        result_items.sort(key=lambda x: (
            0 if x['is_feed'] else 1,
            0 if x['raw_diff'] < 0 else 1,
            -x['kg_per_ton'] if x['is_feed'] else -x['shortage_pct'],
            -x['diff'],
        ))

        feed_shortages = [i['kg_per_ton'] for i in result_items if i['is_feed'] and 0 < i['kg_per_ton'] < 500 and i.get('cycle_base', 0) >= 100]
        if not feed_shortages:
            feed_shortages = [i['kg_per_ton'] for i in result_items if i['is_feed'] and i['kg_per_ton'] > 0]
        avg_kg_per_ton = round(sum(feed_shortages) / len(feed_shortages), 2) if feed_shortages else 0

        high_shortage_items_count = sum(1 for i in result_items if i.get('shortage_level') == 'high')
        moderate_shortage_items_count = sum(1 for i in result_items if i.get('shortage_level') == 'moderate')
        safe_shortage_items_count = sum(1 for i in result_items if i.get('shortage_level') == 'safe')

        reconciliation_data = {
            'items': result_items,
            'summary': {
                'total_items_with_tasweya': len(result_items),
                'total_tasweyat_count': total_tasweyat_count,
                'shortage_items_count': shortage_items_count,
                'surplus_items_count': surplus_items_count,
                'high_shortage_items_count': high_shortage_items_count,
                'moderate_shortage_items_count': moderate_shortage_items_count,
                'safe_shortage_items_count': safe_shortage_items_count,
                'total_shortage_feed_kg': round(total_shortage_feed_kg, 2),
                'total_shortage_pieces': int(total_shortage_pieces),
                'total_surplus_feed_kg': round(total_surplus_feed_kg, 2),
                'total_surplus_pieces': int(total_surplus_pieces),
                'total_shortage_kg': round(total_shortage_feed_kg, 2),
                'total_surplus_kg': round(total_surplus_feed_kg, 2),
                'avg_kg_per_ton': avg_kg_per_ton,
            },
        }

        try:
            tmp_cache = CACHE_REC_FILE + '.tmp'
            with open(tmp_cache, 'w', encoding='utf-8') as cf:
                json.dump({'mtime': mtime, 'data': reconciliation_data}, cf, ensure_ascii=False, indent=2)
            os.replace(tmp_cache, CACHE_REC_FILE)
        except Exception as e:
            log(f'ERROR saving reconciliation cache: {e}')

        return reconciliation_data
    except Exception as e:
        log(f'ERROR reconciliations: {e}')
        log(traceback.format_exc())
        if os.path.exists(CACHE_REC_FILE):
            try:
                with open(CACHE_REC_FILE, 'r', encoding='utf-8') as cf:
                    cached = json.load(cf)
                if 'data' in cached:
                    log('Falling back to cached reconciliation data after error')
                    return cached['data']
            except Exception:
                pass
        return {'items': [], 'summary': {}}


def generate_data(force=False):
    log('Reading inventory, invoices, and reconciliations...')
    inv_items, inv_print_date = read_inventory()
    invoices = read_invoices()
    reconciliations = read_reconciliations(inv_items, force=force)

    total_items = len(inv_items)
    total_balance = sum(i['balance'] for i in inv_items)
    low_stock = sum(1 for i in inv_items if 0 < i['balance'] < 50)
    out_of_stock = sum(1 for i in inv_items if i['balance'] <= 0)

    groups = {}
    for item in inv_items:
        g = item['group'] or 'غير مصنف'
        if g not in groups:
            groups[g] = {'count': 0, 'balance': 0}
        groups[g]['count'] += 1
        groups[g]['balance'] += item['balance']

    return {
        'generated_at': datetime.now().isoformat(),
        'print_date': inv_print_date,
        'invoices_print_date': invoices.get('print_date', ''),
        'store_name': 'النور لتجارة الأعلاف',
        'inventory': inv_items,
        'invoices': invoices,
        'reconciliations': reconciliations,
        'stats': {
            'total_items': total_items,
            'total_balance': round(total_balance, 3),
            'low_stock': low_stock,
            'out_of_stock': out_of_stock,
            'groups': groups,
            'total_transactions': invoices.get('total_transactions', 0),
        },
    }


def get_watched_source_files():
    return [
        find_latest_file(INVENTORY_DIR, ['ارصدة', 'المخازن'], INVENTORY_FILE),
        find_latest_file(INVOICES_DIR, ['فاتورة'], INVOICES_FILE),
        find_latest_file(INVENTORY_DIR, ['حركة', 'تفصيلي'], RECONCILIATION_FILES[0]),
    ]


def main():
    force = '--force' in sys.argv
    data = generate_data(force=force)

    os.makedirs(os.path.dirname(PUBLIC_JSON_FILE), exist_ok=True)
    tmp_pub = PUBLIC_JSON_FILE + '.tmp'
    with open(tmp_pub, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_pub, PUBLIC_JSON_FILE)

    os.makedirs(os.path.dirname(DIST_JSON_FILE), exist_ok=True)
    tmp_dist = DIST_JSON_FILE + '.tmp'
    shutil.copyfile(PUBLIC_JSON_FILE, tmp_dist)
    os.replace(tmp_dist, DIST_JSON_FILE)

    rec_count = len(data.get('reconciliations', {}).get('items', []))
    log(
        f"Done. Inventory: {data['stats']['total_items']} items "
        f"(Balance: {data['stats']['total_balance']}), "
        f"Reconciliations: {rec_count} items -> {PUBLIC_JSON_FILE}"
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
