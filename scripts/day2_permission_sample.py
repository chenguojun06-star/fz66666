import json
import subprocess
import sys

BASE = "http://localhost:8088"


def curl_code(method, path, token=None, data=None):
    cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", method, BASE + path]
    if token:
        cmd += ["-H", f"Authorization: Bearer {token}"]
    if data is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(data, ensure_ascii=False)]
    return subprocess.check_output(cmd, text=True).strip()


def get_admin_token():
    payload = {"username": "admin", "password": "admin123"}
    cmd = [
        "curl",
        "-s",
        "-X",
        "POST",
        BASE + "/api/system/user/login",
        "-H",
        "Content-Type: application/json",
        "-d",
        json.dumps(payload, ensure_ascii=False),
    ]
    out = subprocess.check_output(cmd, text=True)
    try:
        return json.loads(out).get("data", {}).get("token", "")
    except Exception:
        return ""


def main():
    token = get_admin_token()
    if not token:
        print("LOGIN_FAILED")
        raise SystemExit(1)

    mode = "sample"
    if len(sys.argv) >= 3 and sys.argv[1] == "--mode":
        mode = sys.argv[2].strip().lower()

    sample_checks = [
        ("protected", "GET", "/api/production/purchase/list", None),
        ("protected", "GET", "/api/production/purchase/stats", None),
        ("protected", "GET", "/api/production/pattern/list", None),
        ("protected", "GET", "/api/production/pattern/development-stats", None),
        ("protected", "POST", "/api/finance/payroll-settlement/operator-summary", {}),
        ("protected", "POST", "/api/common/upload", None),
        ("protected", "GET", "/api/production/pattern/123", None),
        ("protected", "GET", "/api/production/material/list", None),
        ("protected", "POST", "/api/production/purchase/update-arrived-quantity", {"id": "x", "arrivedQuantity": 1}),
        ("protected", "POST", "/api/production/pattern/123/receive", {}),
        ("public", "POST", "/api/system/user/login", {"username": "admin", "password": "admin123"}),
        ("public", "GET", "/api/system/user/online-count", None),
        ("public", "GET", "/api/production/scan/list", None),
        ("public", "GET", "/api/dashboard/urgent-events", None),
        ("public", "GET", "/api/production/cutting-task/stats", None),
        ("public", "GET", "/api/finance/material-reconciliation/list", None),
        ("public", "POST", "/api/system/tenant/list", {}),
        ("public", "POST", "/api/wechat/mini-program/login", {"code": "mock"}),
        ("public", "GET", "/api/production/warehousing/list", None),
        ("public", "GET", "/api/stock/sample/list", None),
    ]

    guard_checks = [
        ("must-auth", "GET", "/api/system/user/online-count", None),
        ("must-auth", "GET", "/api/production/scan/list", None),
        ("must-auth", "GET", "/api/dashboard/urgent-events", None),
        ("must-auth", "GET", "/api/production/cutting-task/stats", None),
        ("must-auth", "GET", "/api/finance/material-reconciliation/list", None),
        ("must-auth", "POST", "/api/system/tenant/list", {}),
        ("must-auth", "GET", "/api/stock/sample/list", None),
    ]

    extended_checks = [
        ("protected", "GET", "/api/production/scan/list", None),
        ("protected", "POST", "/api/production/scan/execute", {"scanCode": "TEST-SCAN", "scanType": "production"}),
        ("protected", "POST", "/api/production/scan/undo", {"requestId": "TEST"}),
        ("protected", "POST", "/api/system/tenant/list", {}),
        ("protected", "POST", "/api/system/tenant/create", {}),
        ("protected", "POST", "/api/system/tenant-app/list", {}),
        ("protected", "GET", "/api/system/tenant-app/1", None),
        ("protected", "GET", "/api/system/user/online-count", None),
        ("protected", "GET", "/api/dashboard/urgent-events", None),
        ("protected", "GET", "/api/stock/sample/list", None),
        ("protected", "GET", "/api/production/cutting-task/list", None),
        ("protected", "GET", "/api/finance/material-reconciliation/list", None),
        ("protected", "GET", "/api/production/purchase/list", None),
        ("protected", "POST", "/api/finance/payroll-settlement/operator-summary", {}),
        ("protected", "POST", "/api/common/upload", None),
        ("public", "POST", "/api/system/user/login", {"username": "admin", "password": "admin123"}),
        ("public", "POST", "/api/wechat/mini-program/login", {"code": "mock"}),
        ("public", "POST", "/openapi/v1/order/list", {}),
        ("public", "POST", "/openapi/v1/order/create", {}),
        ("public", "GET", "/openapi/v1/order/status/TEST-ORDER", None),
    ]

    if mode == "guard":
        checks = guard_checks
    elif mode == "extended":
        checks = extended_checks
    else:
        checks = sample_checks

    ok = 0
    for item_type, method, path, body in checks:
        no_token = curl_code(method, path, None, body)
        with_token = curl_code(method, path, token, body)

        if item_type == "must-auth":
            passed = no_token in {"401", "403"} and with_token not in {"401", "403"}
        elif item_type == "protected":
            passed = no_token in {"401", "403"} and with_token not in {"401", "403"}
        else:
            passed = no_token not in {"401", "403"}

        if passed:
            ok += 1

        print("\t".join([item_type, method, path, no_token, with_token, "PASS" if passed else "FAIL"]))

    print(f"SUMMARY\t{ok}\t{len(checks)}\tmode={mode}")

    if mode == "guard" and ok != len(checks):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
