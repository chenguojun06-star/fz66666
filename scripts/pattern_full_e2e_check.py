#!/usr/bin/env python3
import json
import subprocess
import sys
from urllib.parse import urlencode

BASE = 'http://localhost:8088'


def req(method, path, token=None, data=None):
    cmd = ['curl', '-sS', '-X', method, BASE + path]
    if token:
        cmd += ['-H', f'Authorization: Bearer {token}']
    if data is not None:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(data, ensure_ascii=False)]
    out = subprocess.check_output(cmd, text=True)
    try:
        return json.loads(out)
    except Exception:
        return {'_raw': out}


def login():
    for pwd in ('admin123', '123456'):
        r = req('POST', '/api/system/user/login', data={'username': 'admin', 'password': pwd})
        token = ((r.get('data') or {}).get('token')) if isinstance(r, dict) else None
        if token:
            return token
    return None


def main():
    token = login()
    if not token:
        print('FAIL login')
        return 2

    ls = req('GET', '/api/production/pattern/list?' + urlencode({'page': 1, 'size': 50}), token=token)
    records = ((ls.get('data') or {}).get('records')) if isinstance(ls, dict) else None
    if not records:
        print('FAIL pattern list empty')
        return 3

    candidate = None
    for item in records:
        status = str(item.get('status') or '').strip().upper()
        if status in ('PENDING', 'IN_PROGRESS'):
            candidate = item
            break
    if candidate is None:
        candidate = records[0]

    pattern_id = str(candidate.get('id'))
    print(f'INFO candidate id={pattern_id} styleNo={candidate.get("styleNo")} status={candidate.get("status")}')

    cfg = req('GET', f'/api/production/pattern/{pattern_id}/process-config', token=token)
    cfg_data = cfg.get('data') if isinstance(cfg, dict) else None
    if not isinstance(cfg_data, list) or len(cfg_data) == 0:
        print('FAIL process-config empty')
        return 4

    operations = []
    for item in sorted(cfg_data, key=lambda x: int(x.get('sortOrder') or 0)):
        value = str(item.get('operationType') or item.get('processName') or '').strip()
        if value:
            operations.append(value)
    print(f'INFO operations={operations}')

    scan_before = req('GET', f'/api/production/pattern/{pattern_id}/scan-records', token=token)
    scan_data_before = scan_before.get('data') if isinstance(scan_before, dict) else []
    scan_data_before = scan_data_before if isinstance(scan_data_before, list) else []
    scanned = set(str(x.get('operationType') or '').strip().lower() for x in scan_data_before if str(x.get('operationType') or '').strip())

    if 'receive' not in scanned:
        receive_submit = req('POST', '/api/production/pattern/scan', token=token, data={
            'patternId': pattern_id,
            'operationType': 'RECEIVE',
            'operatorRole': 'PLATE_WORKER',
            'remark': 'full-e2e-receive',
        })
        if int(receive_submit.get('code') or 0) != 200:
            print('FAIL submit receive')
            print(json.dumps(receive_submit, ensure_ascii=False))
            return 5
        print('PASS submit RECEIVE')
        scanned.add('receive')

    for op in operations:
        if op.lower() in scanned:
            continue
        submit = req('POST', '/api/production/pattern/scan', token=token, data={
            'patternId': pattern_id,
            'operationType': op,
            'operatorRole': 'PLATE_WORKER',
            'remark': 'full-e2e-dynamic',
        })
        if int(submit.get('code') or 0) != 200:
            print(f'FAIL submit op={op}')
            print(json.dumps(submit, ensure_ascii=False))
            return 6
        print(f'PASS submit op={op}')

    detail = req('GET', f'/api/production/pattern/{pattern_id}', token=token)
    detail_data = detail.get('data') if isinstance(detail, dict) else {}
    final_status = str((detail_data or {}).get('status') or '')
    print(f'INFO final_status={final_status}')

    warehouse = req('POST', f'/api/production/pattern/{pattern_id}/workflow-action?action=warehouse-in', token=token, data={
        'remark': 'full-e2e-warehouse',
    })
    if int(warehouse.get('code') or 0) != 200:
        print('FAIL warehouse action')
        print(json.dumps(warehouse, ensure_ascii=False))
        return 7
    print('PASS warehouse action')

    scan_after = req('GET', f'/api/production/pattern/{pattern_id}/scan-records', token=token)
    scan_data_after = scan_after.get('data') if isinstance(scan_after, dict) else []
    scan_data_after = scan_data_after if isinstance(scan_data_after, list) else []
    has_warehouse = any(str(x.get('operationType') or '').strip().upper() == 'WAREHOUSE_IN' for x in scan_data_after)
    print(f'PASS has warehouse record={has_warehouse}, total={len(scan_data_after)}')
    if not has_warehouse:
        return 8

    print('PASS full e2e done')
    return 0


if __name__ == '__main__':
    sys.exit(main())
