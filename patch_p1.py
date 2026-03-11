import re
with open('scripts/p1-test.py', 'r') as f:
    content = f.read()

replacement = """if factory_ok:
    # Factory save just returns boolean. Let's find it.
    s2, b2 = req("POST", "/api/system/factory/list", {"filters": {"factoryCode": f"TF{ts}"}})
    if s2 == 200 and b2.get("data") and b2["data"].get("records"):
        factory_id = b2["data"]["records"][0]["id"]
        print(f"    found created factory id={factory_id}")"""

content = re.sub(r'if factory_ok and b\.get\("data"\):.*?print\(f"    created factory id=\{factory_id\}"\)', replacement, content, flags=re.DOTALL)

with open('scripts/p1-test.py', 'w') as f:
    f.write(content)
