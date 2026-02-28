import json
import urllib.parse
import urllib.request

BASE = 'http://localhost:8088'


def req(method, path, data=None, token=None):
    url = BASE + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode('utf-8'))


def stage_hit(record, stage):
    scan_type = str(record.get('scanType') or '').lower()
    progress_stage = str(record.get('progressStage') or '')
    process_name = str(record.get('processName') or '')
    if stage == 'cutting':
        return scan_type == 'cutting' or ('裁剪' in progress_stage) or ('裁剪' in process_name)
    if stage == 'quality':
        return (
            scan_type == 'quality'
            or ('质检' in progress_stage)
            or ('质检' in process_name)
            or ('验收' in progress_stage)
            or ('验收' in process_name)
        )
    if stage == 'warehouse':
        return scan_type == 'warehouse' or ('入库' in progress_stage) or ('入库' in process_name)
    return False


def first_record(payload):
    data = payload.get('data') or {}
    records = data.get('records') or data.get('list') or []
    return records[0] if records else None


result = {'stageChecks': {}, 'issues': []}

login = req('POST', '/api/system/user/login', {'username': 'admin', 'password': '123456'})
token = (login.get('data') or {}).get('token')
if not token:
    raise RuntimeError('登录失败，无法核查')

orders_payload = req('GET', '/api/production/order/list?page=1&size=200', token=token)
orders = ((orders_payload.get('data') or {}).get('records') or [])

for stage in ['cutting', 'quality', 'warehouse']:
    target_order = None
    stage_rows = []

    for order in orders:
        order_id = str(order.get('id') or '').strip()
        if not order_id:
            continue

        scan_payload = req('GET', f'/api/production/scan/list?orderId={urllib.parse.quote(order_id)}&page=1&pageSize=500', token=token)
        rows = ((scan_payload.get('data') or {}).get('records') or [])
        valid_rows = [
            row for row in rows
            if str(row.get('scanResult') or '').lower() == 'success' and int(row.get('quantity') or 0) > 0
        ]
        hits = [row for row in valid_rows if stage_hit(row, stage)]

        if hits:
            target_order = order
            stage_rows = hits
            break

    if not target_order:
        result['stageChecks'][stage] = {
            'found': False,
            'message': '未找到可用于核查的真实记录'
        }
        continue

    qty = sum(int(row.get('quantity') or 0) for row in stage_rows)
    latest_time = max((str(row.get('scanTime') or '') for row in stage_rows), default='')
    has_operator = any(bool(str(row.get('operatorName') or '').strip()) for row in stage_rows)
    has_time = any(bool(str(row.get('scanTime') or '').strip()) for row in stage_rows)

    order_no = str(target_order.get('orderNo') or '')
    order_again_payload = req('GET', f'/api/production/order/list?orderNo={urllib.parse.quote(order_no)}', token=token)
    order_again = first_record(order_again_payload) or {}

    passed = (
        qty > 0
        and bool(latest_time)
        and has_operator
        and has_time
        and (order_again.get('productionProgress') is not None)
        and (order_again.get('completedQuantity') is not None)
    )

    result['stageChecks'][stage] = {
        'found': True,
        'orderNo': order_no,
        'orderId': str(target_order.get('id') or ''),
        'rowCount': len(stage_rows),
        'sumQuantity': qty,
        'latestScanTime': latest_time,
        'hasOperatorName': has_operator,
        'hasScanTime': has_time,
        'orderProductionProgress': order_again.get('productionProgress'),
        'orderCompletedQuantity': order_again.get('completedQuantity'),
        'pass': passed,
    }

print(json.dumps(result, ensure_ascii=False, indent=2))
