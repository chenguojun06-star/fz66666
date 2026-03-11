import urllib.request, json
BASE = "http://localhost:8088"
TOKEN = None
r = urllib.request.Request(BASE + "/api/system/user/login", data=json.dumps({"username": "admin", "password": "admin123"}).encode(), headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(r) as resp:
    TOKEN = json.loads(resp.read())["data"]["token"]

r2 = urllib.request.Request(BASE + "/api/system/factory/list", data=json.dumps({"filters": {}}).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"}, method="POST")
with urllib.request.urlopen(r2) as resp:
    print(resp.read().decode())
