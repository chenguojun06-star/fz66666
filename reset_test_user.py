#!/usr/bin/env python3
"""
通过 admin API + MySQL 重置 test_user 密码，然后运行完整系统测试
"""
import urllib.request, json, subprocess, time

BASE = "http://localhost:8088"

def get(path, token):
    r = urllib.request.Request(BASE + path, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(r, timeout=10).read())

def post(path, body, token=""):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(BASE + path,
        data=json.dumps(body).encode(), headers=headers)
    return json.loads(urllib.request.urlopen(r, timeout=10).read())

# Step1: get admin token
admin_r = post("/api/system/user/login", {"username":"admin","password":"admin123"})
admin_token = admin_r["data"]["token"]
admin_hash = None

# Step2: get admin pwd hash from MySQL via subprocess
result = subprocess.run(
    ["docker","exec","fashion-mysql-simple","mysql","-uroot","-pchangeme",
     "fashion_supplychain","-sNe",
     "SELECT password FROM t_user WHERE username='admin'"],
    capture_output=True, text=True
)
for line in result.stdout.splitlines():
    line = line.strip()
    if line.startswith("$2"):
        admin_hash = line
        break

print(f"Admin hash retrieved: {admin_hash[:20]}...")

# Step3: update test_user password in MySQL
if admin_hash:
    sql = f"UPDATE t_user SET password='{admin_hash}',approval_status='approved',registration_status='ACTIVE' WHERE username='test_user'"
    r2 = subprocess.run(
        ["docker","exec","fashion-mysql-simple","mysql","-uroot","-pchangeme",
         "fashion_supplychain","-e", sql],
        capture_output=True, text=True
    )
    print(f"MySQL update: returncode={r2.returncode} stderr={r2.stderr[:100]}")

# Step4: try test_user login
try:
    tr = post("/api/system/user/login", {"username":"test_user","password":"admin123"})
    print(f"test_user login: code={tr.get('code')}, tenantId={tr.get('data',{}).get('user',{}).get('tenantId','?')}")
    if tr.get("code") == 200:
        print(f"  Token: {tr['data']['token'][:30]}...")
        print("SUCCESS: test_user login OK, can now access tenant 99 data")
    else:
        print(f"WARN: login failed: {tr}")
except Exception as e:
    print(f"Login error: {e}")
