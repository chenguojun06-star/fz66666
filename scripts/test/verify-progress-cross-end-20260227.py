import json
import subprocess
import time
import uuid
import urllib.request
import urllib.error

BASE = 'http://localhost:8088'


def req(method, path, data=None, token=None):
    url = BASE + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as error:
        body = ''
        try:
            body = error.read().decode('utf-8')
        except Exception:
            body = ''
        raise RuntimeError(f'HTTP {error.code} {path} -> {body}')


def first_record(payload):
    data = payload.get('data') or {}
    records = data.get('records') or data.get('list') or []
    return records[0] if records else None


def ensure_style_orderable(style_id):
    if not style_id:
        return
    sql = f"UPDATE t_style_info SET sample_status='COMPLETED', status='ENABLED' WHERE id='{style_id}';"
    subprocess.run([
        'docker', 'exec', 'fashion-mysql-simple', 'mysql', '-uroot', '-pchangeme', '-D', 'fashion_supplychain', '-e', sql
    ], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


report = {'steps': [], 'issues': [], 'checks': {}, 'summary': {}}
order_id = None
order_no = None
token = None
created_style_id = None
created_factory_id = None

try:
    login = req('POST', '/api/system/user/login', {'username': 'admin', 'password': '123456'})
    token = (login.get('data') or {}).get('token')
    if not token:
        raise RuntimeError(f'登录失败: {login}')
    report['steps'].append('登录成功')

    style = first_record(req('GET', '/api/style/info/list?current=1&size=1', token=token))
    if not style:
        existing_order = first_record(req('GET', '/api/production/order/list?page=1&size=1', token=token))
        if existing_order and existing_order.get('styleId'):
            style = {
                'id': existing_order.get('styleId'),
                'styleNo': existing_order.get('styleNo') or 'STYLE-NA',
                'styleName': existing_order.get('styleName') or '历史款式'
            }
            report['steps'].append(f'使用历史订单款式兜底 {style.get("styleNo")} ({style.get("id")})')

    if not style:
        temp_style_no = f'TMPSTYLE-{time.strftime("%Y%m%d%H%M%S")}'
        created_style = req('POST', '/api/style/info', {
            'styleNo': temp_style_no,
            'styleName': '临时核查款式',
            'category': '测试',
            'season': '2026春',
            'status': 'draft'
        }, token)
        created_style_id = (created_style.get('data') or {}).get('id')
        if not created_style_id:
            raise RuntimeError('未找到可用款式，且自动创建款式失败')
        style = {'id': created_style_id, 'styleNo': temp_style_no, 'styleName': '临时核查款式'}
        report['steps'].append(f'自动创建临时款式成功 {temp_style_no} ({created_style_id})')

    ensure_style_orderable(style.get('id'))

    factory = first_record(req('GET', '/api/system/factory/list?page=1&pageSize=1', token=token))
    if not factory:
        temp_factory_code = f'TMPFAC-{time.strftime("%m%d%H%M%S")}'
        created_factory = req('POST', '/api/system/factory', {
            'factoryCode': temp_factory_code,
            'factoryName': f'临时工厂-{temp_factory_code}',
            'contactPerson': '测试人',
            'contactPhone': '13800000000',
            'status': 'active',
            'factoryType': 'EXTERNAL'
        }, token)
        created_ok = bool((created_factory.get('data') is True) or (created_factory.get('code') == 200))
        if not created_ok:
            raise RuntimeError('未找到可用工厂，且自动创建工厂失败')

        refreshed_factory = first_record(req('GET', f'/api/system/factory/list?page=1&pageSize=20&factoryCode={temp_factory_code}', token=token))
        if not refreshed_factory:
            raise RuntimeError('自动创建工厂后未查询到工厂记录')
        factory = refreshed_factory
        created_factory_id = factory.get('id')
        report['steps'].append(f'自动创建临时工厂成功 {temp_factory_code} ({created_factory_id})')

    ts = time.strftime('%Y%m%d%H%M%S')
    order_no = f'REALCHK-{ts}'

    payload = {
        'orderNo': order_no,
        'styleId': style.get('id'),
        'styleNo': style.get('styleNo') or 'STYLE-NA',
        'styleName': style.get('styleName') or '测试款',
        'factoryId': str(factory.get('id')),
        'factoryName': factory.get('factoryName') or factory.get('name') or '测试工厂',
        'merchandiser': '系统管理员',
        'company': '真实核查租户',
        'productCategory': '核查类目',
        'patternMaker': '系统管理员',
        'orderQuantity': 20,
        'plannedStartDate': '2026-02-27T09:00:00',
        'plannedEndDate': '2026-03-05T18:00:00',
        'orderDetails': json.dumps([
            {
                'color': '黑色',
                'size': 'M',
                'quantity': 12,
                'materialPriceSource': '物料采购系统',
                'materialPriceAcquiredAt': '2026-02-27 10:00:00',
                'materialPriceVersion': 'v1'
            },
            {
                'color': '黑色',
                'size': 'L',
                'quantity': 8,
                'materialPriceSource': '物料采购系统',
                'materialPriceAcquiredAt': '2026-02-27 10:00:00',
                'materialPriceVersion': 'v1'
            }
        ], ensure_ascii=False),
        'progressWorkflowJson': json.dumps([
            {'id': 'procurement', 'name': '采购', 'unitPrice': 0},
            {'id': 'cutting', 'name': '裁剪', 'unitPrice': 1.2},
            {'id': 'sewing', 'name': '车缝', 'unitPrice': 2.4},
            {'id': 'packaging', 'name': '尾部', 'unitPrice': 0.8}
        ], ensure_ascii=False),
        'remarks': '真实核查自动测试-可删除'
    }

    created = req('POST', '/api/production/order', payload, token)
    order_id = (created.get('data') or {}).get('id')
    if not order_id:
        raise RuntimeError(f'创建订单失败: {created}')
    report['steps'].append(f'创建订单成功 {order_no} ({order_id})')

    scans = [
        {'scanType': 'production', 'processName': '车缝', 'progressStage': '车缝', 'quantity': 12, 'color': '黑色', 'size': 'M', 'scanCode': order_no, 'orderId': order_id, 'orderNo': order_no, 'requestId': str(uuid.uuid4())},
        {'scanType': 'production', 'processName': '尾部', 'progressStage': '尾部', 'quantity': 8, 'color': '黑色', 'size': 'L', 'scanCode': order_no, 'orderId': order_id, 'orderNo': order_no, 'requestId': str(uuid.uuid4())}
    ]

    for item in scans:
        result = req('POST', '/api/production/scan/execute', item, token)
        if result.get('code') != 200:
            report['issues'].append(f'扫码执行失败: {result}')
    report['steps'].append('执行2笔扫码完成')

    order_list = req('GET', f'/api/production/order/list?orderNo={order_no}', token=token)
    order_rec = first_record(order_list)
    if not order_rec:
        raise RuntimeError('订单列表未找到测试订单')

    scan_list = req('GET', f'/api/production/scan/list?orderId={order_id}&page=1&pageSize=500', token=token)
    records = ((scan_list.get('data') or {}).get('records') or [])
    valid = [row for row in records if str(row.get('scanResult') or '').lower() == 'success' and int(row.get('quantity') or 0) > 0]

    def node_stats(node_name):
        matched = [row for row in valid if str(row.get('progressStage') or '').strip() == node_name or str(row.get('processName') or '').strip() == node_name]
        quantity = sum(int(row.get('quantity') or 0) for row in matched)
        last_time = max((str(row.get('scanTime') or '') for row in matched), default='')
        return quantity, last_time, matched

    sewing_qty, sewing_time, sewing_rows = node_stats('车缝')
    tail_qty, tail_time, tail_rows = node_stats('尾部')

    checks = {
        '我的订单-生产进度字段存在': order_rec.get('productionProgress') is not None,
        '我的订单-完成数量字段存在': order_rec.get('completedQuantity') is not None,
        '进度球-车缝数量=12': sewing_qty == 12,
        '进度球-尾部数量=8': tail_qty == 8,
        '进度球-车缝时间存在': bool(sewing_time),
        '进度球-尾部时间存在': bool(tail_time),
        '弹窗-车缝扫码明细有记录': len(sewing_rows) > 0,
        '弹窗-车缝记录含领取人': any(bool(str(row.get('operatorName') or '').strip()) for row in sewing_rows),
        '弹窗-车缝记录含时间': any(bool(str(row.get('scanTime') or '').strip()) for row in sewing_rows),
        '小程序-同源订单进度字段存在': order_rec.get('productionProgress') is not None,
        '小程序-同源扫码记录含领取人': any(bool(str(row.get('operatorName') or '').strip()) for row in valid),
        '小程序-同源扫码记录含时间': any(bool(str(row.get('scanTime') or '').strip()) for row in valid),
    }
    report['checks'] = checks

    failed = [name for name, passed in checks.items() if not passed]
    report['summary'] = {
        'orderNo': order_no,
        'orderId': order_id,
        'productionProgress': order_rec.get('productionProgress'),
        'completedQuantity': order_rec.get('completedQuantity'),
        'scanRecordCount': len(records),
        'validScanCount': len(valid),
        'sewing': {'qty': sewing_qty, 'time': sewing_time, 'rows': len(sewing_rows)},
        'tail': {'qty': tail_qty, 'time': tail_time, 'rows': len(tail_rows)},
        'failedChecks': failed,
    }

except Exception as error:
    report['fatalError'] = str(error)

finally:
    if token and order_id:
        try:
            req('POST', f'/api/production/scan/delete-full-link/{order_id}', {}, token)
            report['steps'].append('已清理扫码全链路数据')
        except Exception as error:
            report['issues'].append(f'清理扫码失败: {error}')

        try:
            req('DELETE', f'/api/production/order/{order_id}', None, token)
            report['steps'].append('已删除测试订单')
        except Exception as error:
            if 'HTTP 404' in str(error):
                report['steps'].append('测试订单已不存在（视为已清理）')
            else:
                report['issues'].append(f'删除订单失败: {error}')

    if token and created_style_id:
        try:
            req('DELETE', f'/api/style/info/{created_style_id}', None, token)
            report['steps'].append('已删除临时款式')
        except Exception as error:
            report['issues'].append(f'删除临时款式失败: {error}')

    if token and created_factory_id:
        try:
            req('DELETE', f'/api/system/factory/{created_factory_id}', None, token)
            report['steps'].append('已删除临时工厂')
        except Exception as error:
            report['issues'].append(f'删除临时工厂失败: {error}')

print(json.dumps(report, ensure_ascii=False, indent=2))
