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
            return token, pwd
    return None, None


def normalize_status(value):
    return str(value or '').strip().upper()


def main():
    token, pwd = login()
    if not token:
        print('FAIL login')
        return 2
    print(f'PASS login (password={pwd})')

    params = urlencode({'page': 1, 'size': 20})
    ls = req('GET', f'/api/production/pattern/list?{params}', token=token)
    records = ((ls.get('data') or {}).get('records')) if isinstance(ls, dict) else None
    if not records:
        print('FAIL pattern list empty')
        return 3
    print(f'PASS list count={len(records)}')

    candidate = None
    for item in records:
        style_no = str(item.get('styleNo') or '')
        status = normalize_status(item.get('status'))
        if ('E2E-' in style_no or 'WH-' in style_no or 'TEST' in style_no) and status in ('PENDING', 'IN_PROGRESS', 'COMPLETED'):
            candidate = item
            break
    if candidate is None:
        candidate = records[0]

    pattern_id = str(candidate.get('id'))
    style_no = str(candidate.get('styleNo'))
    status = normalize_status(candidate.get('status'))
    print(f'INFO candidate id={pattern_id} styleNo={style_no} status={status}')

    cfg = req('GET', f'/api/production/pattern/{pattern_id}/process-config', token=token)
    cfg_data = cfg.get('data') if isinstance(cfg, dict) else None
    if not isinstance(cfg_data, list) or len(cfg_data) == 0:
        print('FAIL process-config empty')
        return 4
    print(f'PASS process-config size={len(cfg_data)} first={cfg_data[0]}')

    scan_list = req('GET', f'/api/production/pattern/{pattern_id}/scan-records', token=token)
    scan_data = scan_list.get('data') if isinstance(scan_list, dict) else []
    scan_data = scan_data if isinstance(scan_data, list) else []
    scanned = set(str(x.get('operationType') or '').strip() for x in scan_data if str(x.get('operationType') or '').strip())
    print(f'INFO existing scan-records={len(scan_data)} scanned={sorted(list(scanned))[:8]}')

    operation = 'RECEIVE'
    if status == 'PENDING' and 'RECEIVE' not in scanned:
        operation = 'RECEIVE'
    else:
        picked = None
        for item in sorted(cfg_data, key=lambda x: int(x.get('sortOrder') or 0)):
            value = str(item.get('operationType') or item.get('processName') or '').strip()
            if value and value not in scanned:
                picked = value
                break
        if picked:
            operation = picked
        elif status != 'COMPLETED' and 'RECEIVE' not in scanned:
            operation = 'RECEIVE'
        else:
            fallback = cfg_data[0]
            operation = str(fallback.get('operationType') or fallback.get('processName') or 'RECEIVE').strip() or 'RECEIVE'

    submit_payload = {
        'patternId': pattern_id,
        'operationType': operation,
        'operatorRole': 'PLATE_WORKER',
        'remark': '回归测试-动态工序',
    }
    submit = req('POST', '/api/production/pattern/scan', token=token, data=submit_payload)
    if int(submit.get('code') or 0) != 200:
        print('FAIL submit scan')
        print(json.dumps(submit, ensure_ascii=False))
        return 5

    submit_data = submit.get('data') or {}
    print(f"PASS submit operationType={operation} recordId={submit_data.get('recordId')} newStatus={submit_data.get('newStatus')}")

    scan_list_2 = req('GET', f'/api/production/pattern/{pattern_id}/scan-records', token=token)
    scan_data_2 = scan_list_2.get('data') if isinstance(scan_list_2, dict) else []
    scan_data_2 = scan_data_2 if isinstance(scan_data_2, list) else []
    found = any(str(x.get('operationType') or '').strip() == operation for x in scan_data_2)
    print(f'PASS verify scan-record appended={found} total={len(scan_data_2)}')
    if not found:
        print('FAIL verify operationType not found')
        return 6

    detail = req('GET', f'/api/production/pattern/{pattern_id}', token=token)
    rec = detail.get('data') if isinstance(detail, dict) else {}
    progress_raw = rec.get('progressNodes') if isinstance(rec, dict) else None
    progress = {}
    if isinstance(progress_raw, str) and progress_raw.strip():
        try:
            progress = json.loads(progress_raw)
        except Exception:
            progress = {}
    elif isinstance(progress_raw, dict):
        progress = progress_raw

    keys = sorted(list(progress.keys()))
    print(f'INFO progressNodes keys={keys[:12]}')
    print('PASS regression done')
    return 0


if __name__ == '__main__':
    sys.exit(main())
