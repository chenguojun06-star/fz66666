#!/usr/bin/env python3
"""
部署后冒烟测试 — 云端环境通用版

用途：
  - CI 部署到 CloudBase 后立即执行
  - 本地部署后也可执行
  - 失败 → 飞书告警 + 退出码 1（CI 可据此回滚/阻断）

覆盖历史上崩过的接口：
  - 2026-06-18 登录 500（t_user.position 列缺失）
  - 2026-06-18 /api/dashboard/menu-badge-counts 500（safety_stock 列缺失）
  - 2026-06-18 /api/color-card/list 500（列名不匹配）
  - 2026-06-11 全站 502（socat IPv6）
  - 2026-06-12 部署失败（探针配置）

环境变量：
  SMOKE_BASE_URL       必填，如 https://xxx.sh.run.tcloudbaseapp.com
  SMOKE_USERNAME       可选，默认 admin
  SMOKE_PASSWORD       可选，默认 admin123
  SMOKE_TENANT_ID      可选，默认 1
  SMOKE_FEISHU_WEBHOOK 可选，失败时发飞书通知
  SMOKE_TIMEOUT        可选，单请求超时秒，默认 15
  SMOKE_MAX_RETRIES    可选，部署后服务启动中，重试次数，默认 6（每次间隔 10s）
"""
import json
import os
import ssl
import sys
import time
import urllib.request
import urllib.error

# 跳过 SSL 证书验证（CloudBase/自签证书场景）
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

BASE = os.environ.get("SMOKE_BASE_URL", "https://api.webyszl.cn").rstrip("/")
USERNAME = os.environ.get("SMOKE_USERNAME", "lilb")
PASSWORD = os.environ.get("SMOKE_PASSWORD", "admin123")
TENANT_ID = os.environ.get("SMOKE_TENANT_ID", "")
if not TENANT_ID.strip() or not TENANT_ID.strip().isdigit():
    TENANT_ID = ""  # 不指定租户时留空，按账号默认租户登录
FEISHU_WEBHOOK = os.environ.get("SMOKE_FEISHU_WEBHOOK", "")
TIMEOUT = int(os.environ.get("SMOKE_TIMEOUT", "15"))
MAX_RETRIES = int(os.environ.get("SMOKE_MAX_RETRIES", "6"))

if not BASE:
    print("\n" + "=" * 56)
    print("  ❌ 错误：SMOKE_BASE_URL 未配置")
    print("=" * 56)
    print()
    print("  冒烟测试需要测试目标地址，请通过环境变量设置：")
    print()
    print("  1) 本地执行：")
    print("     SMOKE_BASE_URL=http://localhost:8088 python3 scripts/postdeploy-smoke-test.py")
    print()
    print("  2) CI/CloudBase 部署后：")
    print("     SMOKE_BASE_URL=https://xxx.sh.run.tcloudbaseapp.com \\")
    print("     SMOKE_USERNAME=admin SMOKE_PASSWORD=admin123 \\")
    print("     python3 scripts/postdeploy-smoke-test.py")
    print()
    print("  如在 GitHub Actions 中运行，请在仓库 Settings → Secrets 中配置：")
    print("     SMOKE_BASE_URL, SMOKE_USERNAME, SMOKE_PASSWORD, SMOKE_TENANT_ID")
    print("=" * 56)
    sys.exit(2)

results = []
token = None


def log(status, name, detail):
    results.append((status, name, detail))
    mark = "✅" if status == "PASS" else "❌"
    print(f"  {mark} [{status}] {name}: {detail}")


def http(method, path, data=None, with_token=True, retry=True):
    """HTTP 请求，部署后服务可能还在启动，支持重试"""
    url = f"{BASE}{path}" if path.startswith("/") else f"{BASE}/{path}"
    headers = {"Content-Type": "application/json"}
    if with_token and token:
        headers["Authorization"] = f"Bearer {token}"

    payload = json.dumps(data).encode("utf-8") if data is not None else None
    attempts = MAX_RETRIES if retry else 1

    for i in range(attempts):
        try:
            req = urllib.request.Request(url, data=payload, method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=ssl_ctx) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                return resp.status, body
        except urllib.error.HTTPError as e:
            # 4xx/5xx 不重试（除了 502/503 可能是服务还没起来）
            if e.code in (502, 503, 504) and retry and i < attempts - 1:
                print(f"  ⏳ {method} {path} → {e.code}，服务可能启动中，10s 后重试 ({i+1}/{attempts})")
                time.sleep(10)
                continue
            try:
                body = e.read().decode("utf-8", errors="replace")
            except Exception:
                body = ""
            return e.code, body
        except Exception as e:
            if retry and i < attempts - 1:
                print(f"  ⏳ {method} {path} → {e}，10s 后重试 ({i+1}/{attempts})")
                time.sleep(10)
                continue
            return 0, str(e)
    return 0, "max retries exceeded"


def expect_200(method, path, name, data=None, with_token=True):
    code, body = http(method, path, data=data, with_token=with_token)
    if code == 200:
        log("PASS", name, f"HTTP 200")
        return body
    else:
        snippet = body[:200] if body else "(empty)"
        log("FAIL", name, f"HTTP {code} | {snippet}")
        return None


def expect_code_200(method, path, name, data=None):
    """业务码 code=200 才算通过（用于登录等返回 HTTP 200 但业务码可能非 200 的接口）"""
    code, body = http(method, path, data=data, with_token=False)
    if code != 200:
        snippet = body[:200] if body else "(empty)"
        log("FAIL", name, f"HTTP {code} | {snippet}")
        return None
    try:
        resp = json.loads(body)
        biz_code = resp.get("code")
        if biz_code == 200:
            log("PASS", name, f"code=200")
            return resp
        else:
            log("FAIL", name, f"code={biz_code} msg={resp.get('message','')[:100]}")
            return None
    except Exception as e:
        log("FAIL", name, f"JSON解析失败: {e} | {body[:200]}")
        return None


# ─────────────────────────────────────────────────────────
# 1. 健康检查（不带 token，不带重试逻辑的快速探测）
# ─────────────────────────────────────────────────────────
print("=" * 56)
print(f"  部署后冒烟测试  {time.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"  目标: {BASE}")
print("=" * 56)

print("\n--- 0. 服务可达性（等待启动，最多 60s）---")
# 先探测一个公开接口，等服务起来
service_up = False
for i in range(6):
    code, _ = http("GET", "/api/system/tenant/public-list", with_token=False, retry=False)
    if code == 200:
        service_up = True
        log("PASS", "服务可达", f"第 {i+1} 次探测成功")
        break
    print(f"  ⏳ 第 {i+1} 次探测 HTTP {code}，10s 后重试...")
    time.sleep(10)

if not service_up:
    log("FAIL", "服务可达", "6 次探测均失败，服务未启动")
else:
    # 公开租户列表
    expect_200("GET", "/api/system/tenant/public-list", "租户列表(公开)", with_token=False)

# ─────────────────────────────────────────────────────────
# 1. 登录（历史崩过：06-18 t_user.position 缺失 → 500）
# ─────────────────────────────────────────────────────────
print("\n--- 1. 登录（历史崩过：t_user.position 缺失）---")
login_data = {"username": USERNAME, "password": PASSWORD}
if TENANT_ID:
    login_data["tenantId"] = int(TENANT_ID)
login_resp = expect_code_200("POST", "/api/system/user/login", "登录", data=login_data)
if login_resp and login_resp.get("data", {}).get("token"):
    token = login_resp["data"]["token"]
    log("PASS", "Token获取", f"长度={len(token)}")
else:
    log("FAIL", "Token获取", "登录响应无 token")
    print("\n⚠️  登录失败，跳过后续需认证接口测试，但已记录的失败项会在汇总中展示")

# ─────────────────────────────────────────────────────────
# 2. 核心查询接口（每个都崩过）
# ─────────────────────────────────────────────────────────
if token:
    print("\n--- 2. 核心查询接口（历史崩过）---")

    # 06-18 崩过的接口
    expect_200("GET", "/api/dashboard/menu-badge-counts", "菜单Badge(06-18崩过)")
    expect_200("GET", "/api/color-card/list", "色卡列表(06-18崩过)")
    expect_200("GET", "/api/system/user/me", "当前用户信息(06-18崩过:position)")

    # 高频核心接口
    expect_200("GET", "/api/style/info/list", "款式列表")
    expect_200("GET", "/api/production/scan/list", "扫码记录列表")
    expect_200("GET", "/api/production/cutting/list", "裁剪菲号列表")
    expect_200("GET", "/api/dashboard/top-stats", "Dashboard TopStats")
    expect_200("GET", "/api/dashboard/overdue-orders", "逾期订单")
    expect_200("GET", "/api/finance/finished-settlement/list", "成品结算列表")

    # 权限控制
    code, _ = http("GET", "/api/system/user/list", with_token=False, retry=False)
    if code in (401, 403):
        log("PASS", "无Token拦截", f"HTTP {code}")
    else:
        log("FAIL", "无Token拦截", f"HTTP {code}（期望401/403）")

# ─────────────────────────────────────────────────────────
# 3. 汇总
# ─────────────────────────────────────────────────────────
print("\n" + "=" * 56)
print("  测试结果汇总")
print("=" * 56)
pass_cnt = sum(1 for s, _, _ in results if s == "PASS")
fail_cnt = sum(1 for s, _, _ in results if s == "FAIL")
for status, name, detail in results:
    mark = "✅" if status == "PASS" else "❌"
    print(f"  {mark} {name}: {detail}")
print("-" * 56)
print(f"  通过: {pass_cnt} | 失败: {fail_cnt} | 总计: {pass_cnt + fail_cnt}")
print("=" * 56)

# ─────────────────────────────────────────────────────────
# 4. 失败发飞书
# ─────────────────────────────────────────────────────────
if fail_cnt > 0 and FEISHU_WEBHOOK:
    failed_items = [f"• {n}: {d}" for s, n, d in results if s == "FAIL"]
    content = (
        f"🔴 部署后冒烟测试失败\n"
        f"目标: {BASE}\n"
        f"时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"失败: {fail_cnt}/{pass_cnt + fail_cnt}\n\n"
        f"失败项:\n" + "\n".join(failed_items[:20])
    )
    try:
        payload = json.dumps({"msg_type": "text", "content": {"text": content}}).encode("utf-8")
        req = urllib.request.Request(FEISHU_WEBHOOK, data=payload, method="POST",
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                print("\n📡 已发送飞书告警")
    except Exception as e:
        print(f"\n⚠️ 飞书告警发送失败: {e}")

if fail_cnt > 0:
    print(f"\n⚠️  {fail_cnt} 项失败，请立即排查！")
    sys.exit(1)
else:
    print("\n🎉 所有测试通过，服务健康。")
    sys.exit(0)
