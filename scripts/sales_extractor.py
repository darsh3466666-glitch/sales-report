#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sales_extractor.py — محرك استخراج وتحليل بيانات مبيعات وتحصيلات الأعلاف
يقرأ الملفات الثلاثة من D:\\Mostafa Ibrahim ويستخرج بيانات التقرير بتطبيع عربي كامل
"""

import os
import sys
import json
import re
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import openpyxl

COLLECTIONS_FILE = r'D:\Mostafa Ibrahim\شيت تحصيل.xlsm'
INVOICES_FILE = r'D:\Mostafa Ibrahim\بيان اسعار فواتير اليوم\فواتير اليوم.xlsx'
INVENTORY_FILE = r'D:\Mostafa Ibrahim\جرد يومي\تقارير  ارصدة المخازن.xlsx'

EXCLUDED_CUSTOMERS = ["تصنيع", "عمال", "نقل"]
EXCLUDED_PRODUCTS = ["تصنيع", "عمال", "نقل", "مصاريف نقل", "أجور عمال", "أجور تصنيع", "مصنعية"]

def normalize_arabic(text):
    if not text:
        return ""
    s = str(text)
    s = re.sub(r'[\u00A0\u200B\u200C\u200D\uFEFF]', ' ', s)
    s = s.replace('ـ', '')
    s = re.sub(r'[()\-–—_/,]+', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'[أإآا]', 'ا', s)
    s = s.replace('ة', 'ه').replace('ى', 'ي')
    s = re.sub(r'\bعبد\s+', 'عبد', s)
    return s

def get_lookup_keys(name):
    if not name:
        return []
    norm = normalize_arabic(name)
    if not norm:
        return []
    keys = {norm}
    no_al = re.sub(r'\bال', '', norm).strip()
    if len(no_al) > 2:
        keys.add(no_al)
    return list(keys)

def safe_num(val):
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(',', '')
    is_neg = False
    if s.endswith('-'):
        is_neg = True
        s = s[:-1].strip()
    elif s.startsWith('-') if hasattr(s, 'startsWith') else s.startswith('-'):
        is_neg = True
        s = s[1:].strip()
    try:
        n = float(s)
        return -n if is_neg else n
    except:
        return 0.0

def safe_str(val):
    if val is None:
        return ""
    return str(val).strip()

def map_commodity_name(raw_name):
    if not raw_name:
        return None
    norm = normalize_arabic(raw_name).lower()
    norm = norm.replace('٤', '4').replace('٦', '6').replace('٪', '%')

    # Exclude full fat soy
    if any(k in norm for k in ["فولفات", "فول فات", "فولفيت", "fullfat", "full fat"]):
        return None
    # Exclude soy 44%
    if "44" in norm and ("صويا" in norm or "فول" in norm):
        return None
    # Soy 46%
    if "46" in norm and any(k in norm for k in ["صويا", "فول", "كسب"]):
        return "صويا 46%"

    # Corn (ذرة صفراء)
    corn_excluded = any(k in norm for k in ["بذر", "بزر", "كتان", "جلوتين", "جنين", "قشر", "كسب", "نشا", "زيت", "مستخلص", "ابيض", "بيضاء", "فشار", "سيلاج", "علف"])
    if not corn_excluded:
        if any(k in norm for k in ["ذره صفراء", "ذرة صفراء", "ذره ارجنتين", "ذرة ارجنتين", "ذره برازيل", "ذرة برازيل", "ذره اوكران", "ذرة اوكران", "ذره صب", "ذرة صب", "ذره مستورد", "ذرة مستورد", "ذره محلي", "ذرة محلي"]) or norm in ["ذره", "ذرة", "الذره", "الذرة"] or norm.startswith("ذره ") or norm.startswith("ذرة "):
            return "ذرة صفراء"

    # Bran (نخالة / ردة)
    if any(k in norm for k in ["نخال", "رده", "ردة"]) and not any(k in norm for k in ["علف", "مركز"]):
        return "نخالة"

    # Rice Bran (رجيعة / رجيع كون)
    if "رجيع" in norm and "علف" not in norm:
        return "رجيعة"

    # DDGS (دي دي جي)
    if "دي دي" in norm or "ddg" in norm:
        return "دي دي جي"

    # Kasb Al-Nour (كسب النور)
    is_feed = any(k in norm for k in ["علف", "تسمين", "حلاب", "بياض", "بادئ", "نامي", "ناهي", "دواجن", "مواشي"])
    is_soy = "صويا" in norm or "فول" in norm
    if not is_feed and not is_soy:
        if any(k in norm for k in ["كسب النور", "كسب عباد", "كسب بذره", "كسب بذرة", "كسب قطن", "كسب سمسم"]) or norm == "كسب":
            return "كسب النور"

    return None

def extract_sales_data(collections_path=COLLECTIONS_FILE, invoices_path=INVOICES_FILE, inventory_path=INVENTORY_FILE):
    if not os.path.exists(collections_path):
        raise FileNotFoundError(f"ملف التحصيل غير موجود: {collections_path}")
    if not os.path.exists(invoices_path):
        raise FileNotFoundError(f"ملف الفواتير غير موجود: {invoices_path}")

    # 1. Open workbooks
    wb1 = openpyxl.load_workbook(collections_path, data_only=True, read_only=True)
    wb2 = openpyxl.load_workbook(invoices_path, data_only=True, read_only=True)
    wb3 = openpyxl.load_workbook(inventory_path, data_only=True, read_only=True) if os.path.exists(inventory_path) else None

    # Resolve sheet names
    def get_sheet(wb, names):
        for s in wb.sheetnames:
            norm = s.strip().lower()
            if any(n.lower() in norm for n in names):
                return wb[s]
        return None

    ws_sales = get_sheet(wb1, ['مبيعات'])
    ws_qabd = get_sheet(wb1, ['قبض'])
    ws_qty = get_sheet(wb1, ['كميات'])
    ws_inv = get_sheet(wb1, ['فواتير'])
    ws_master = get_sheet(wb1, ['master_data', 'master', 'ماستر'])
    ws_sabeq = get_sheet(wb1, ['سابق', 'السابق', 'ارصدة سابقة', 'أرصدة سابقة'])
    ws_cust_invoices = get_sheet(wb2, ['تقرير مبيعات العملاء', 'العملاء'])
    ws_inventory = get_sheet(wb3, ['تقارير  ارصدة المخازن', 'ارصدة المخازن', 'المخازن']) if wb3 else None

    # Canonical Customer Names Map
    canonical_names = {}
    def register_canonical(raw_name):
        t = safe_str(raw_name)
        if len(t) <= 2:
            return ""
        for k in get_lookup_keys(t):
            if k not in canonical_names:
                canonical_names[k] = t
        return t

    def resolve_customer_name(raw_name):
        t = safe_str(raw_name)
        if not t:
            return ""
        for k in get_lookup_keys(t):
            if k in canonical_names:
                return canonical_names[k]
        return register_canonical(t)

    # Read Sabeq / Master previous balances
    sabeq_balances = {}
    master_names = set()
    if ws_sabeq:
        for r in ws_sabeq.iter_rows(values_only=True):
            if not r or len(r) < 2:
                continue
            cname = safe_str(r[0])
            if cname and len(cname) > 2 and 'اجمالي' not in cname and 'إجمالي' not in cname:
                register_canonical(cname)
                norm = normalize_arabic(cname)
                master_names.add(norm)
                bal = safe_num(r[1])
                if bal != 0:
                    sabeq_balances[norm] = bal

    if ws_master:
        for r in ws_master.iter_rows(values_only=True):
            if not r or len(r) < 3:
                continue
            cname = safe_str(r[1])
            if cname and len(cname) > 2:
                register_canonical(cname)
                norm = normalize_arabic(cname)
                master_names.add(norm)
                bal = safe_num(r[2])
                if norm not in sabeq_balances and bal != 0:
                    sabeq_balances[norm] = bal

    # Read Totals from Sales Sheet
    report_date = datetime.now().strftime('%Y-%m-%d')
    sales_rows = list(ws_sales.iter_rows(values_only=True))
    if sales_rows:
        row0 = sales_rows[0]
        for cell in row0:
            if isinstance(cell, datetime):
                report_date = cell.strftime('%Y-%m-%d')
                break

    row2 = sales_rows[2] if len(sales_rows) > 2 else []
    raw_material_qty = safe_num(row2[1]) if len(row2) > 1 else 0
    total_qty = safe_num(row2[2]) if len(row2) > 2 else 0
    total_sales_sheet = safe_num(row2[3]) if len(row2) > 3 else 0
    total_collected_sheet = safe_num(row2[4]) if len(row2) > 4 else 0
    feed_qty = safe_num(row2[6]) if len(row2) > 6 else 0

    # Read Sales Customers (row 4+)
    sales_customers = {}
    for r in sales_rows[4:]:
        if not r or len(r) < 4:
            continue
        raw_name = safe_str(r[2])
        if not raw_name or any(ex in raw_name for ex in EXCLUDED_CUSTOMERS):
            continue
        cname = resolve_customer_name(raw_name)
        sales = safe_num(r[3])
        collected = safe_num(r[4])
        prev_bal = safe_num(r[5])
        bal = safe_num(r[6])
        if cname not in sales_customers:
            sales_customers[cname] = {
                'sales': 0,
                'collected': 0,
                'prev_balance': prev_bal,
                'balance': bal,
                'invoice_count': 1 if sales > 0 else 0
            }
        sales_customers[cname]['sales'] += sales
        sales_customers[cname]['collected'] += collected
        if prev_bal != 0:
            sales_customers[cname]['prev_balance'] = prev_bal

    # Read Invoices Sheet
    invoices = []
    if ws_inv:
        for r in list(ws_inv.iter_rows(values_only=True))[1:]:
            if not r or len(r) < 4:
                continue
            inv_no = safe_str(r[0])
            raw_cname = safe_str(r[2])
            if any(ex in raw_cname for ex in EXCLUDED_CUSTOMERS):
                continue
            cname = resolve_customer_name(raw_cname) if raw_cname else ""
            amt = safe_num(r[3])
            inv_date = r[1].strftime('%Y-%m-%d') if isinstance(r[1], datetime) else report_date
            invoices.append({
                'invoice_no': inv_no or None,
                'invoice_date': inv_date,
                'customer_name': cname or None,
                'total_amount': amt
            })

    # Read Customer Products from wb2 (فواتير اليوم)
    customer_products = []
    cust_prod_map = {}
    product_aggregates = {}
    if ws_cust_invoices:
        for r in list(ws_cust_invoices.iter_rows(values_only=True))[3:]:
            if not r or len(r) < 6:
                continue
            raw_cname = safe_str(r[0])
            if not raw_cname or any(ex in raw_cname for ex in EXCLUDED_CUSTOMERS):
                continue
            cname = resolve_customer_name(raw_cname)
            prod_name = safe_str(r[2])
            if not prod_name or any(ex in prod_name for ex in EXCLUDED_PRODUCTS):
                continue
            qty = safe_num(r[4])
            total = safe_num(r[5])
            unit_price = round(total / qty, 2) if qty > 0 else 0

            customer_products.append({
                'customer_name': cname,
                'product_name': prod_name,
                'quantity': qty,
                'total_amount': total,
                'unit_price': unit_price
            })

            # Product aggregate
            if prod_name not in product_aggregates:
                product_aggregates[prod_name] = {'total_qty': 0, 'total_amount': 0}
            product_aggregates[prod_name]['total_qty'] += qty
            product_aggregates[prod_name]['total_amount'] += total

    # Read Qabd Sheet (Receipts)
    total_qabd = 0
    if ws_qabd:
        for r in list(ws_qabd.iter_rows(values_only=True))[1:]:
            if not r or len(r) < 3:
                continue
            amt = safe_num(r[2])
            total_qabd += amt
            raw_cname = safe_str(r[0])
            if raw_cname and not any(ex in raw_cname for ex in EXCLUDED_CUSTOMERS):
                cname = resolve_customer_name(raw_cname)
                if cname in sales_customers:
                    sales_customers[cname]['collected'] = max(sales_customers[cname]['collected'], amt)

    # Read Inventory (تقارير ارصدة المخازن)
    inventory_items = []
    if ws_inventory:
        for r in list(ws_inventory.iter_rows(values_only=True))[3:]:
            if not r or len(r) < 5:
                continue
            item_name = safe_str(r[2])
            if not item_name or any(ex in item_name for ex in EXCLUDED_PRODUCTS):
                continue
            unit = safe_str(r[3]) or "كيلو"
            bal = safe_num(r[4])
            inventory_items.append({
                'id': f"inv-{len(inventory_items)+1}",
                'item_name': item_name,
                'balance': bal,
                'unit': unit
            })

    # Build Customers list
    customers_list = []
    tot_sales = 0
    tot_collected = 0
    for idx, (cname, data) in enumerate(sales_customers.items()):
        sales = data['sales']
        collected = data['collected']
        prev = data['prev_balance'] or sabeq_balances.get(normalize_arabic(cname), 0)
        outstanding = prev + sales - collected
        ratio = (collected / sales) if sales > 0 else (1.0 if collected > 0 else 0.0)

        # Risk score calculation
        risk_score = 0
        if sales > 0 and collected == 0:
            risk_score += 40
        if outstanding > 100000:
            risk_score += 30
        elif outstanding > 50000:
            risk_score += 20
        if ratio < 0.3 and sales > 0:
            risk_score += 20
        risk_score = min(100, max(0, risk_score))

        status = "منخفض" if risk_score < 40 else ("متوسط" if risk_score < 70 else "عالي")

        # Check if new customer (not in sabeq)
        norm = normalize_arabic(cname)
        is_new = (prev == 0 and norm not in master_names and sales > 0)

        tot_sales += sales
        tot_collected += collected

        customers_list.append({
            'id': f"cust-{idx+1}",
            'customer_name': cname,
            'sales_amount': sales,
            'collected_amount': collected,
            'prev_balance': prev,
            'outstanding_amount': outstanding,
            'collection_ratio': round(ratio, 4),
            'invoice_count': data['invoice_count'],
            'total_qty': 0, # will link
            'risk_score': risk_score,
            'status': status,
            'is_new': is_new
        })

    # Fill customer total_qty from products
    cust_qty_sum = {}
    for cp in customer_products:
        cust_qty_sum[cp['customer_name']] = cust_qty_sum.get(cp['customer_name'], 0) + cp['quantity']
    for c in customers_list:
        c['total_qty'] = cust_qty_sum.get(c['customer_name'], 0)

    # Sort customers by sales descending
    customers_list.sort(key=lambda x: x['sales_amount'], reverse=True)

    # Calculate Totals
    final_sales = total_sales_sheet if total_sales_sheet > 0 else tot_sales
    final_collected = total_qabd if total_qabd > 0 else (total_collected_sheet if total_collected_sheet > 0 else tot_collected)
    col_rate = (final_collected / final_sales) if final_sales > 0 else 0
    active_customers = len([c for c in customers_list if c['sales_amount'] > 0])
    invoice_cnt = max(len(invoices), sum(c['invoice_count'] for c in customers_list))
    avg_inv = (final_sales / invoice_cnt) if invoice_cnt > 0 else 0
    tot_receivables = sum(c['outstanding_amount'] for c in customers_list if c['sales_amount'] > 0)
    opening_bal = sum(c['prev_balance'] for c in customers_list)

    # Products list
    products_list = []
    for pname, pdata in product_aggregates.items():
        products_list.append({
            'id': f"prod-{len(products_list)+1}",
            'product_name': pname,
            'total_qty': pdata['total_qty'],
            'total_amount': pdata['total_amount']
        })

    report_id = f"rep_{report_date.replace('-', '')}"

    result = {
        'report': {
            'id': report_id,
            'report_date': report_date,
            'total_sales': final_sales,
            'total_collected': final_collected,
            'total_receipts_qabd': total_qabd,
            'total_collected_from_sheet': total_collected_sheet,
            'total_sales_from_sheet': total_sales_sheet,
            'collection_rate': round(col_rate, 4),
            'total_qty': total_qty,
            'raw_material_qty': raw_material_qty,
            'feed_qty': feed_qty,
            'customer_count': active_customers,
            'invoice_count': invoice_cnt,
            'average_invoice': round(avg_inv, 2),
            'total_receivables': tot_receivables,
            'opening_balance': opening_bal,
            'ai_summary': None
        },
        'customers': customers_list,
        'products': products_list,
        'customerProducts': customer_products,
        'inventory': inventory_items,
        'invoices': invoices,
        'comparisons': {
            'yesterday': None,
            'lastWeek': None,
            'lastMonth': None
        },
        'history': [
            {
                'report_date': report_date,
                'total_sales': final_sales,
                'total_collected': final_collected
            }
        ]
    }

    return result

def main():
    print(f"=== استخراج بيانات التقرير من الإكسيل ===")
    data = extract_sales_data()
    r = data['report']
    print(f"تاريخ التقرير: {r['report_date']}")
    print(f"إجمالي المبيعات: {r['total_sales']:,.0f} ج.م")
    print(f"إجمالي التحصيل: {r['total_collected']:,.0f} ج.م (نسبة: {r['collection_rate']*100:.1f}%)")
    print(f"إجمالي الكميات: {r['total_qty']:,.2f} كجم")
    print(f"عدد العملاء النشطين: {r['customer_count']}")
    print(f"عدد الأصناف: {len(data['products'])}")
    print(f"عناصر المخزون: {len(data['inventory'])}")

    # Write output to public and dist
    os.makedirs('public', exist_ok=True)
    os.makedirs('dist', exist_ok=True)

    with open('public/sales_data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    with open('dist/sales_data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"تم حفظ البيانات بنجاح في public/sales_data.json و dist/sales_data.json")

if __name__ == '__main__':
    main()
