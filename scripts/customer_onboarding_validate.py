#!/usr/bin/env python3
import argparse
import csv
from pathlib import Path

REQUIRED = {
    '01_tenant_and_users.csv': [
        'tenantCode','tenantName','ownerUsername','ownerPassword','ownerName','contactPhone',
        'employeeUsername','employeeName','employeePhone','roleCode'
    ],
    '02_orders.csv': [
        'tenantCode','orderNo','styleNo','styleName','orderQuantity','color','size','expectedShipDate','factoryName','status'
    ],
    '03_material_purchase.csv': [
        'tenantCode','orderNo','materialCode','materialName','materialType','color','size','purchaseQuantity','unit','status'
    ],
}


def check_file(path: Path, required_headers):
    errors = []
    if not path.exists():
        return [f'文件不存在: {path.name}']

    with path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        miss = [h for h in required_headers if h not in headers]
        if miss:
            errors.append(f'{path.name}: 缺少列 {miss}')
            return errors

        for idx, row in enumerate(reader, start=2):
            for key in required_headers:
                if str(row.get(key, '')).strip() == '':
                    errors.append(f'{path.name}:{idx} 列 {key} 不能为空')

            if path.name == '02_orders.csv':
                qty = str(row.get('orderQuantity', '')).strip()
                if not qty.isdigit() or int(qty) <= 0:
                    errors.append(f'{path.name}:{idx} orderQuantity 必须为正整数')

            if path.name == '03_material_purchase.csv':
                qty = str(row.get('purchaseQuantity', '')).strip()
                if not qty.isdigit() or int(qty) <= 0:
                    errors.append(f'{path.name}:{idx} purchaseQuantity 必须为正整数')

    return errors


def main():
    parser = argparse.ArgumentParser(description='客户开通模板校验')
    parser.add_argument('--dir', default='docs/onboarding-templates', help='模板目录')
    args = parser.parse_args()

    base = Path(args.dir)
    all_errors = []

    for filename, headers in REQUIRED.items():
        all_errors.extend(check_file(base / filename, headers))

    if all_errors:
        print('❌ 校验失败：')
        for e in all_errors:
            print(' -', e)
        raise SystemExit(1)

    print('✅ 校验通过，可进入导入流程')


if __name__ == '__main__':
    main()
