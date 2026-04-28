import json, subprocess, sys

def api(method, path, token, data=None, params=None):
    url = f'http://127.0.0.1:8088{path}'
    if params:
        qs = '&'.join(f'{k}={v}' for k, v in params.items())
        url = f'{url}?{qs}'
    cmd = ['curl', '-s', '-X', method, url,
           '-H', f'Authorization: Bearer {token}',
           '-H', 'Content-Type: application/json']
    if data:
        cmd += ['-d', json.dumps(data)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except:
        return {'error': r.stdout[:200]}

# Decode JWT to see tenantId
import base64
d = api('POST', '/api/system/user/login', '', data={'username': 'lilb', 'password': '123456'})
token = d.get('data', {}).get('token', '')
if token:
    parts = token.split('.')
    if len(parts) >= 2:
        payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
        decoded = base64.urlsafe_b64decode(payload)
        jwt_data = json.loads(decoded)
        print(f'lilb JWT: userId={jwt_data.get("userId")} username={jwt_data.get("username")} tenantId={jwt_data.get("tenantId")} factoryId={jwt_data.get("factoryId")}')

# Try admin
d = api('POST', '/api/system/user/login', '', data={'username': 'admin', 'password': 'admin123'})
token2 = d.get('data', {}).get('token', '')
if token2:
    parts = token2.split('.')
    if len(parts) >= 2:
        payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
        decoded = base64.urlsafe_b64decode(payload)
        jwt_data = json.loads(decoded)
        print(f'admin JWT: userId={jwt_data.get("userId")} username={jwt_data.get("username")} tenantId={jwt_data.get("tenantId")} factoryId={jwt_data.get("factoryId")}')

# List all orders with lilb
d = api('GET', '/api/production/order/list', token, params={'page': '1', 'size': '5'})
records = d.get('data', {}).get('records', [])
total = d.get('data', {}).get('total', 0)
print(f'\nlilb orders: total={total} found={len(records)}')
for r in records[:3]:
    print(f'   {r.get("orderNo")} styleNo={r.get("styleNo")} tid={r.get("tenantId")}')

# List template library with lilb
d = api('GET', '/api/template-library/list', token, params={'page': '1', 'size': '10', 'type': 'PROCESS_PRICE'})
data = d.get('data', {})
if isinstance(data, dict):
    records2 = data.get('records', [])
    total2 = data.get('total', 0)
    print(f'\nlilb templates: total={total2} found={len(records2)}')
    for r in records2[:5]:
        sn = r.get('styleNo', r.get('scopeStyleNo', ''))
        print(f'   id={r.get("id","")[:8]} styleNo={sn} type={r.get("templateType")} tid={r.get("tenantId")}')
