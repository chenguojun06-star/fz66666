#!/usr/bin/env python3
"""Check actual API field structures"""
import urllib.request, json

BASE = "http://localhost:8088"

def post(path, data, token=None):
    body = json.dumps(data).encode()
    headers = {"Content-Type":"application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def get(path, token):
    req = urllib.request.Request(f"{BASE}{path}",
        headers={"Content-Type":"application/json","Authorization":f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

# Login
token = post("/api/system/user/login", {"username":"admin","password":"admin123"})["data"]["token"]
user_token = post("/api/system/user/login", {"username":"test_user","password":"admin123"})["data"]["token"]

# Check operation log actual fields
log = get("/api/system/operation-log/list?page=1&pageSize=3", token=token)
print("== Operation Log fields (sample) ==")
records = log.get("data",{}).get("records",[])
if records:
    print("Keys:", list(records[0].keys()))
    for rec in records[:2]:
        print(json.dumps({k:v for k,v in rec.items() if v is not None}, ensure_ascii=False, indent=2))

# Check finished settlement
settle = get("/api/finance/finished-settlement/list?page=1&pageSize=3", token=user_token)
print("\n== Finished Settlement fields (sample) ==")
records2 = settle.get("data",{}).get("records",[])
if records2:
    print("Keys:", list(records2[0].keys()))
    for rec in records2[:2]:
        print(json.dumps({k:v for k,v in rec.items() if v is not None}, ensure_ascii=False, indent=2))

# Check payroll settlement
import urllib.error
try:
    payroll = post("/api/finance/payroll-settlement/operator-summary", {"page":1,"pageSize":3}, token=user_token)
    print("\n== Payroll Settlement ==")
    data = payroll.get("data")
    if isinstance(data, list) and data:
        print("List keys:", list(data[0].keys()))
        print("Sample:", json.dumps(data[0], ensure_ascii=False, indent=2))
    elif isinstance(data, dict):
        print("Dict keys:", list(data.keys()))
        recs = data.get("records") or data.get("list") or []
        if recs:
            print("Record keys:", list(recs[0].keys()))
            print("Sample:", json.dumps(recs[0], ensure_ascii=False, indent=2))
    else:
        print("data:", json.dumps(payroll, ensure_ascii=False, indent=2)[:500])
except urllib.error.HTTPError as e:
    print(f"\nPayroll error: HTTP {e.code}: {e.read().decode()[:300]}")
