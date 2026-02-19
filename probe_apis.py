#!/usr/bin/env python3
"""API结构探测脚本"""
import requests, warnings, json, random, string
warnings.filterwarnings('ignore')
BASE = 'http://localhost:8088'

def rnd(n=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))

# 登录
for user, pwd in [('lilb','admin123'), ('zhangcz','admin123'), ('admin','admin123')]:
    r = requests.post(f'{BASE}/api/system/user/login', json={'username':user,'password':pwd}, timeout=10)
    d = r.json()
    if d.get('code') == 200:
        print(f'LOGIN OK: {user}, tenantId={d["data"].get("tenantId")}')
        TOKEN = d['data']['token']
        H = {'Authorization': f'Bearer {TOKEN}'}
        break
else:
    print('ALL LOGINS FAILED'); exit(1)

def api(method, path, **kwargs):
    r = getattr(requests, method)(f'{BASE}{path}', headers=H, timeout=10, **kwargs)
    try:
        return r.json()
    except:
        return {'_raw': r.text[:200]}

# ===== 工厂 =====
print('\n=== FACTORY CREATE ===')
fac = api('post', '/api/system/factory', json={
    'factoryName': f'测试工厂_{rnd()}',
    'factoryCode': f'TF_{rnd(4)}',
    'contactName': '张三',
    'contactPhone': '13900000001',
    'address': '北京市测试区',
})
print(json.dumps(fac, ensure_ascii=False, indent=2))

print('\n=== FACTORY LIST ===')
flist = api('post', '/api/system/factory/list', json={'pageNum':1,'pageSize':5})
print(json.dumps(flist, ensure_ascii=False)[:400])

# ===== 款式 =====
print('\n=== STYLE CREATE ===')
sno = f'FZ{rnd(6)}'
style = api('post', '/api/style/style', json={
    'styleNo': sno,
    'styleName': f'测试款式_{rnd(4)}',
    'category': '上衣',
    'season': '2026春夏',
    'unit': '件',
})
print(json.dumps(style, ensure_ascii=False, indent=2))

# 款式列表，取第一个id
slist = api('post', '/api/style/style/list', json={'pageNum':1,'pageSize':3})
print('\n=== STYLE LIST ===')
print(json.dumps(slist, ensure_ascii=False)[:300])

# ===== BOM =====
style_id = style.get('data') if isinstance(style.get('data'), int) else style.get('data',{}).get('id') if isinstance(style.get('data'), dict) else None
print(f'\nstyle_id={style_id}')

if style_id:
    print('\n=== BOM ADD ===')
    bom = api('post', '/api/style/bom', json={
        'styleId': style_id,
        'materialName': '棉布',
        'materialCode': 'M001',
        'unit': '米',
        'dosage': 2.5,
        'unitPrice': 15.0,
        'materialType': '面料',
    })
    print(json.dumps(bom, ensure_ascii=False, indent=2))

    # ===== 款式工序 =====
    print('\n=== PROCESS ADD ===')
    proc = api('post', '/api/style/process', json={
        'styleId': style_id,
        'processName': '裁剪',
        'processCode': 'P001',
        'unitPrice': 5.0,
        'sortOrder': 1,
    })
    print(json.dumps(proc, ensure_ascii=False, indent=2))

    # ===== 报价单 =====
    print('\n=== QUOTATION CREATE ===')
    quot = api('post', '/api/style/quotation', json={
        'styleId': style_id,
        'targetProfitRate': 25.0,
        'remark': '测试报价',
    })
    print(json.dumps(quot, ensure_ascii=False, indent=2))

# ===== 内联：查 BOM 接口字段 =====
print('\n=== BOM API Probe - try different field names ===')
if style_id:
    for payload in [
        {'styleId': style_id, 'materialName': '棉布', 'unit': '米', 'dosage': 2.5, 'unitPrice': 15.0},
        {'styleId': style_id, 'materialName': '棉布', 'materialType': 'MAIN', 'unit': '米', 'dosage': 2.5, 'unitPrice': 15.0},
        {'styleId': style_id, 'materialName': '棉布', 'type': 'MAIN', 'unit': '米', 'dosage': 2.5, 'pricePerUnit': 15.0},
    ]:
        r = api('post', '/api/style/bom', json=payload)
        print(f'payload_keys={list(payload.keys())} => code={r.get("code")} msg={r.get("message",r.get("msg",""))}')

print('\nDone.')
