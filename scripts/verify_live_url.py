#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import urllib.request
import json
import ssl
import sys

def main():
    ctx = ssl.create_default_context()
    
    # 1. Check HTML page
    url_html = "https://darsh3466666-glitch.github.io/sales-report/"
    req_html = urllib.request.Request(url_html, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req_html, context=ctx, timeout=15) as res:
            if res.status != 200:
                print(f"HTML status: {res.status}")
                sys.exit(1)
    except Exception as e:
        print(f"Error fetching HTML: {e}")
        sys.exit(1)

    # 2. Check JSON data
    url_json = "https://darsh3466666-glitch.github.io/sales-report/sales_data.json"
    req_json = urllib.request.Request(url_json, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req_json, context=ctx, timeout=15) as res:
            if res.status != 200:
                print(f"JSON status: {res.status}")
                sys.exit(1)
            data = json.loads(res.read().decode('utf-8'))
            latest = data[0] if isinstance(data, list) else data
            if not latest.get('report', {}).get('report_date'):
                print("Missing report_date in JSON")
                sys.exit(1)
    except Exception as e:
        print(f"Error fetching JSON: {e}")
        sys.exit(1)

    # 3. Check Cash Flow JSON data
    url_cf = "https://darsh3466666-glitch.github.io/sales-report/cashflow_data.json"
    req_cf = urllib.request.Request(url_cf, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req_cf, context=ctx, timeout=15) as res:
            if res.status != 200:
                print(f"Cash flow JSON status: {res.status}")
                sys.exit(1)
            cf_data = json.loads(res.read().decode('utf-8'))
            if not cf_data.get('customers'):
                print("Missing customers in Cash Flow JSON")
                sys.exit(1)
            print(f"Cash flow verified: {len(cf_data['customers'])} customers, Goal: {cf_data.get('weeklyGoal')}")
    except Exception as e:
        print(f"Error fetching Cash Flow JSON: {e}")
        sys.exit(1)

    print("SUCCESS_LIVE_REPORT_ONLINE")
    sys.exit(0)

if __name__ == '__main__':
    main()
