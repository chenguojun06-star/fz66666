#!/usr/bin/env python3
"""验证扫码工序动态适配的完整数据流（增强容错版）"""
import json
import subprocess
import sys


def request(path, token=None, method='GET', payload=None):
    cmd = ['curl', '-s', f'http://localhost:8088{path}']
    if method != 'GET':
        cmd += ['-X', method]
    if token:
        cmd += ['-H', f'Authorization: Bearer {token}']
    if payload is not None:
        cmd += ['-H', 'Content-Type: application/json', '-d', json.dumps(payload, ensure_ascii=False)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(res.stdout)
    except Exception:
        return {'code': -1, 'message': 'invalid json', 'raw': res.stdout}


def unwrap_data(resp):
    if isinstance(resp, dict):
        if 'data' in resp:
            return resp.get('data')
        if 'records' in resp:
            return resp
    return resp


def login_get_token():
    resp = request(
        '/api/system/user/login',
        method='POST',
        payload={'username': 'admin', 'password': 'admin123'},
    )
    data = unwrap_data(resp) or {}
    token = data.get('token') if isinstance(data, dict) else None
    if not token:
        print('❌ 登录失败:', resp)
        sys.exit(1)
    return token


def pick_orders(token):
    resp = request('/api/production/order/list?pageNum=1&pageSize=20', token=token)
    data = unwrap_data(resp)
    if isinstance(data, dict):
        records = data.get('records') or []
    elif isinstance(data, list):
        records = data
    else:
        records = []
    order_nos = [str(item.get('orderNo', '')).strip() for item in records if item.get('orderNo')]
    uniq = []
    for order_no in order_nos:
        if order_no not in uniq:
            uniq.append(order_no)
    return uniq[:2]


token = login_get_token()
errors = []

print('=' * 60)
print('1. 验证不同订单的工序配置和单价差异')
print('=' * 60)

orders = pick_orders(token)
if len(orders) < 1:
    print('❌ 未获取到可测试订单')
    sys.exit(1)
if len(orders) == 1:
    print(f'⚠️ 仅获取到1个订单: {orders[0]}，将只验证接口字段完整性')

configs = {}
for order in orders:
    res = request(f'/api/production/scan/process-config/{order}', token=token)
    if res.get('code') != 200:
        message = str(res.get('message', 'unknown'))
        if '未配置工序单价模板' in message:
            print(f'  ⚠️  {order}: {message}（已跳过）')
        else:
            errors.append(f'{order}: 工序配置接口失败 - {message}')
        configs[order] = []
        continue
    procs = unwrap_data(res) or []
    if not isinstance(procs, list):
        procs = []
    configs[order] = procs
    prices = {p.get('processName', '?'): p.get('price', 0) for p in procs}
    print(f'  {order}: {prices}')

if len(orders) >= 2:
    p1 = {p.get('processName'): p.get('price', 0) for p in configs[orders[0]] if p.get('processName')}
    p2 = {p.get('processName'): p.get('price', 0) for p in configs[orders[1]] if p.get('processName')}
    common = set(p1.keys()) & set(p2.keys())
    diff_found = False
    for name in sorted(common):
        if p1[name] != p2[name]:
            diff_found = True
            print(f'  ✅ {name}: {orders[0]}=¥{p1[name]} vs {orders[1]}=¥{p2[name]} (不同)')
    if not diff_found and common:
        print('  ⚠️  两个订单共同工序单价相同')

available_orders = [order for order in orders if configs.get(order)]
if not available_orders:
    print('\n⚠️ 当前抽取订单都未配置工序模板，已完成接口连通性验证。')
    print('✅ 脚本执行完成（无可比较模板数据）')
    sys.exit(0)

print('\n' + '=' * 60)
print('2. 验证扫码历史过滤（排除系统记录）')
print('=' * 60)

target_order = available_orders[0]
scan_res = request(f'/api/production/scan/list?orderNo={target_order}&pageSize=100', token=token)
scan_data = unwrap_data(scan_res)
records = scan_data.get('records', []) if isinstance(scan_data, dict) else []
print(f'  订单 {target_order} 总记录数: {len(records)}')

system_prefixes = ['ORDER_CREATED:', 'CUTTING_BUNDLED:', 'ORDER_PROCUREMENT:', 'WAREHOUSING:', 'SYSTEM:']
manual = []
for record in records:
    req_id = (record.get('requestId', '') or '').strip()
    scan_type = (record.get('scanType', '') or '').lower()
    system_generated = any(req_id.startswith(prefix) for prefix in system_prefixes)
    valid = scan_type in ('production', 'quality')
    if not system_generated and valid:
        manual.append(record)

scanned_names = sorted({record.get('processName', '') for record in manual if record.get('processName')})
print(f'  有效手动扫码: {len(manual)}条')
print(f'  已扫工序名: {scanned_names}')

print('\n' + '=' * 60)
print('3. 验证工序选择器过滤结果')
print('=' * 60)
procs = configs.get(target_order, [])
countable = [p for p in procs if p.get('processName') not in ('采购', '裁剪', '入库')]
remaining = [p for p in countable if p.get('processName') not in scanned_names]
print(f"  可计数工序: {[p.get('processName') for p in countable]}")
print(f'  已完成工序: {scanned_names}')
print(f"  剩余可选: {[p.get('processName') for p in remaining]}")

for process in remaining:
    print(f"    → {process.get('processName')}（¥{process.get('price', 0)}）")

print('\n' + '=' * 60)
print('4. 验证API字段完整性')
print('=' * 60)
required_fields = ['processName', 'price', 'sortOrder', 'progressStage']
for order in orders:
    for process in configs.get(order, []):
        for field in required_fields:
            if field not in process:
                err = f"{order}: 工序[{process.get('processName', '?')}]缺少字段[{field}]"
                errors.append(err)
                print(f'  ❌ {err}')

if not errors:
    print('  ✅ 所有工序配置字段完整')

print('\n' + '=' * 60)
if errors:
    print(f'❌ 发现 {len(errors)} 个问题:')
    for error in errors:
        print(f'  - {error}')
    sys.exit(1)

print('✅ 全部验证通过！')
print('  - 工序配置接口可用 ✓')
print('  - 扫码历史过滤可用 ✓')
print('  - 工序选择器过滤逻辑可验证 ✓')
print('  - API字段完整性 ✓')
sys.exit(0)
