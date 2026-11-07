#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import json
import subprocess
import sys

def main():
    res = subprocess.run([sys.executable, 'scripts/sales_extractor.py'], capture_output=True, text=True, encoding='utf-8')
    if res.returncode != 0:
        print(f"Extraction failed: {res.stderr}")
        sys.exit(1)

    if not os.path.exists('public/sales_data.json') or not os.path.exists('dist/sales_data.json'):
        print("Missing sales_data.json")
        sys.exit(1)

    with open('public/sales_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    r = data.get('report', {})
    if r.get('total_sales', 0) <= 0:
        print("Invalid total_sales in report")
        sys.exit(1)

    if len(data.get('customers', [])) == 0:
        print("No customers extracted")
        sys.exit(1)

    print("SUCCESS_EXTRACTION_VERIFIED")
    sys.exit(0)

if __name__ == '__main__':
    main()
