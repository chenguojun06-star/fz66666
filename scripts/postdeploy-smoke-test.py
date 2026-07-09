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

扩展测试（扫码→进度刷新链路）：
  - [扩展] 订单详情接口验证（productionProgress / stages.progress 完整性）
  - [扩展] 扫码历史接口验证（records 是数组 + tenantId 字段存在 + tenantId 一致性，多租户隔离）
  - [扩展] 款式工序配置接口验证（同一工序名+阶段不重复出现超过2次，重复仅警告不失败）
  - [扩展] WebSocket 握手验证（wss://{base}/ws/order-progress/{tenantId}?token={jwt}，HTTP 101 + 5s 不中断）

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


def _websocket_handshake_test(base_url, tenant_id, jwt_token, ssl_context, wait_seconds=5):
    """
    WebSocket 握手验证（轻量级）。

    优先使用 websocket-client 库；未安装时回退到 socket 手动实现 HTTP 升级握手。
    验证：
      - 握手成功（HTTP 101 Switching Protocols，非 401/403/500）
      - 连接后 {wait_seconds} 秒内不断开

    Returns:
        dict: {"success": bool, "detail": str}
    """
    import base64
    import socket
    from urllib.parse import urlparse

    parsed = urlparse(base_url)
    host = parsed.hostname
    if not host:
        return {"success": False, "detail": f"无效的 base_url: {base_url}"}
    port = parsed.port or (443 if parsed.scheme in ("https", "wss") else 80)
    use_ssl = parsed.scheme in ("https", "wss")

    ws_path = f"/ws/order-progress/{tenant_id}"

    # 优先尝试 websocket-client 库
    try:
        import websocket  # type: ignore
        ws_scheme = "wss" if use_ssl else "ws"
        ws_url = f"{ws_scheme}://{host}:{port}{ws_path}?token={jwt_token}"
        ws = websocket.create_connection(
            ws_url,
            timeout=10,
            sslopt={"cert_reqs": ssl.CERT_NONE} if use_ssl else None,
            header=[f"Authorization: Bearer {jwt_token}"],
        )
        try:
            ws.settimeout(wait_seconds + 0.5)
            try:
                ws.recv()  # 收到数据视为连接存活（也可能是服务端推送）
            except websocket.WebSocketTimeoutException:
                pass  # 超时无数据 = 连接仍存活（期望行为）
            return {"success": True,
                    "detail": f"握手成功（websocket-client），连接保持 {wait_seconds}s+"}
        finally:
            try:
                ws.close()
            except Exception:
                pass
    except ImportError:
        pass  # 库未安装，回退到手动实现
    except Exception as e:
        # 库存在但握手失败，仍用手动实现再试一次以获取更详细错误
        manual_fallback = _manual_ws_handshake(host, port, use_ssl, ws_path, jwt_token,
                                               ssl_context, wait_seconds)
        if manual_fallback["success"]:
            return manual_fallback
        return {"success": False,
                "detail": f"websocket-client 失败({type(e).__name__}: {e}) | 手动重试: {manual_fallback['detail']}"}

    # 手动实现：socket + ssl HTTP 升级握手
    return _manual_ws_handshake(host, port, use_ssl, ws_path, jwt_token,
                                ssl_context, wait_seconds)


def _manual_ws_handshake(host, port, use_ssl, ws_path, jwt_token, ssl_context, wait_seconds):
    """使用 socket 手动实现 WebSocket HTTP 升级握手。"""
    import base64
    import socket

    ws_key = base64.b64encode(os.urandom(16)).decode("utf-8")
    sock = None
    try:
        sock = socket.create_connection((host, port), timeout=10)
        if use_ssl:
            sock = ssl_context.wrap_socket(sock, server_hostname=host)

        handshake = (
            f"GET {ws_path}?token={jwt_token} HTTP/1.1\r\n"
            f"Host: {host}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {ws_key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"Authorization: Bearer {jwt_token}\r\n"
            f"\r\n"
        ).encode("utf-8")
        sock.sendall(handshake)

        # 读取响应头（直到 \r\n\r\n）
        response = b""
        sock.settimeout(10)
        while b"\r\n\r\n" not in response:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response += chunk

        if not response:
            return {"success": False, "detail": "握手无响应（连接被关闭）"}

        status_line = response.split(b"\r\n", 1)[0].decode("utf-8", errors="replace")
        parts = status_line.split()
        if len(parts) < 2:
            return {"success": False, "detail": f"无法解析状态行: {status_line}"}
        try:
            status_code = int(parts[1])
        except ValueError:
            return {"success": False, "detail": f"状态码非数字: {parts[1]} | {status_line}"}

        if status_code in (401, 403):
            return {"success": False, "detail": f"HTTP {status_code} 鉴权失败 | {status_line}"}
        if status_code == 404:
            return {"success": False, "detail": f"HTTP 404 端点不存在 | {status_line}"}
        if status_code >= 500:
            return {"success": False, "detail": f"HTTP {status_code} 服务异常 | {status_line}"}
        if status_code != 101:
            return {"success": False, "detail": f"未升级到 WebSocket（期望 101） | {status_line}"}

        # 握手成功（101），等待 {wait_seconds} 秒确认连接未断开
        sock.settimeout(wait_seconds + 0.5)
        try:
            data = sock.recv(1024)
            if not data:
                return {"success": False,
                        "detail": f"握手成功但 {wait_seconds}s 内连接被服务端关闭"}
            return {"success": True,
                    "detail": f"握手成功（手动 socket 101），连接保持 {wait_seconds}s+ | 收到 {len(data)} 字节"}
        except socket.timeout:
            return {"success": True,
                    "detail": f"握手成功（手动 socket 101），连接保持 {wait_seconds}s（无数据）"}
        except Exception as e:
            return {"success": False, "detail": f"握手成功但等待中断开: {type(e).__name__}: {e}"}
    except Exception as e:
        return {"success": False, "detail": f"连接失败: {type(e).__name__}: {e}"}
    finally:
        if sock is not None:
            try:
                sock.close()
            except Exception:
                pass


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

    # 核心链路接口（扫码/入库/工资结算）
    expect_200("GET", "/api/production/order/list", "生产订单列表")
    expect_200("GET", "/api/production/process/template/list", "工序模板列表")
    expect_200("GET", "/api/production/material/list", "物料列表")
    expect_200("GET", "/api/production/warehousing/list", "入库记录列表")
    expect_200("GET", "/api/finance/wage/payment/list", "工资结算列表")
    expect_200("GET", "/api/finance/wage/piece-rate/list", "计件单价列表")
    expect_200("GET", "/api/production/quality/check/list", "质检记录列表")

    # 权限控制
    code, _ = http("GET", "/api/system/user/list", with_token=False, retry=False)
    if code in (401, 403):
        log("PASS", "无Token拦截", f"HTTP {code}")
    else:
        log("FAIL", "无Token拦截", f"HTTP {code}（期望401/403）")

# ─────────────────────────────────────────────────────────
# 3. 扩展测试：扫码→进度刷新链路
# ─────────────────────────────────────────────────────────
if token:
    print("\n--- 3. 扩展测试：扫码→进度刷新链路 ---")

    # 先获取当前用户的 tenantId（用于多租户隔离验证）
    user_tenant_id = None
    try:
        me_code, me_body = http("GET", "/api/system/user/me")
        if me_code == 200:
            me_resp = json.loads(me_body)
            me_data = me_resp.get("data", {}) if isinstance(me_resp, dict) else {}
            user_tenant_id = me_data.get("tenantId")
            if user_tenant_id is not None:
                log("PASS", "[扩展]获取当前用户tenantId", f"tenantId={user_tenant_id}")
            else:
                log("FAIL", "[扩展]获取当前用户tenantId",
                    f"响应中无 tenantId 字段 | body={me_body[:200]}")
        else:
            snippet = me_body[:200] if me_body else "(empty)"
            log("FAIL", "[扩展]获取当前用户tenantId", f"HTTP {me_code} | {snippet}")
    except Exception as e:
        log("FAIL", "[扩展]获取当前用户tenantId", f"异常: {type(e).__name__}: {e}")

    # 从订单列表中取一个有效 orderId 和 patternProductionId
    order_id = None
    pattern_production_id = None
    try:
        ol_code, ol_body = http("GET", "/api/production/order/list?page=1&pageSize=10")
        if ol_code == 200:
            ol_resp = json.loads(ol_body)
            ol_data = ol_resp.get("data", {}) if isinstance(ol_resp, dict) else {}
            if isinstance(ol_data, dict):
                ol_records = ol_data.get("records") or ol_data.get("list") or []
            elif isinstance(ol_data, list):
                ol_records = ol_data
            else:
                ol_records = []
            if ol_records and isinstance(ol_records[0], dict):
                first_order = ol_records[0]
                order_id = first_order.get("id") or first_order.get("orderId")
                pattern_production_id = (
                    first_order.get("patternProductionId")
                    or first_order.get("patternId")
                    or first_order.get("productionPatternId")
                )
                log("PASS", "[扩展]获取有效订单ID",
                    f"orderId={order_id} | patternProductionId={pattern_production_id}")
            else:
                log("FAIL", "[扩展]获取有效订单ID", "订单列表为空或格式异常")
        else:
            snippet = ol_body[:200] if ol_body else "(empty)"
            log("FAIL", "[扩展]获取有效订单ID", f"HTTP {ol_code} | {snippet}")
    except Exception as e:
        log("FAIL", "[扩展]获取有效订单ID", f"异常: {type(e).__name__}: {e}")

    # 场景1：订单详情接口验证（进度数据完整性）
    try:
        if order_id:
            od_code, od_body = http("GET", f"/api/production/order/{order_id}")
            if od_code == 200:
                od_resp = json.loads(od_body)
                od_data = od_resp.get("data", {}) if isinstance(od_resp, dict) else {}
                if not isinstance(od_data, dict):
                    od_data = {}

                # 验证 productionProgress 字段存在且为 0-100 整数
                progress = od_data.get("productionProgress")
                if progress is None:
                    log("FAIL", "[扩展]订单详情进度数据",
                        f"无 productionProgress 字段 | body={od_body[:200]}")
                else:
                    try:
                        progress_int = int(progress)
                        if 0 <= progress_int <= 100:
                            log("PASS", "[扩展]订单详情进度数据",
                                f"productionProgress={progress_int}（0-100 合法）")
                        else:
                            log("FAIL", "[扩展]订单详情进度数据",
                                f"productionProgress={progress} 超出 0-100 范围")
                    except (ValueError, TypeError):
                        log("FAIL", "[扩展]订单详情进度数据",
                            f"productionProgress={progress!r} 不是整数")

                # 验证 stages 数组中每个阶段有 progress 字段
                stages = od_data.get("stages")
                if stages is None:
                    log("FAIL", "[扩展]订单详情stages结构", "无 stages 字段")
                elif not isinstance(stages, list):
                    log("FAIL", "[扩展]订单详情stages结构",
                        f"stages 不是数组 | type={type(stages).__name__}")
                elif not stages:
                    log("PASS", "[扩展]订单详情stages结构", "stages 为空数组（无可校验项）")
                else:
                    missing = [i for i, s in enumerate(stages)
                               if not isinstance(s, dict) or "progress" not in s]
                    if missing:
                        log("FAIL", "[扩展]订单详情stages结构",
                            f"stages 中索引 {missing[:10]} 缺少 progress 字段")
                    else:
                        log("PASS", "[扩展]订单详情stages结构",
                            f"共 {len(stages)} 个阶段，均含 progress 字段")
            else:
                snippet = od_body[:200] if od_body else "(empty)"
                log("FAIL", "[扩展]订单详情接口", f"HTTP {od_code} | {snippet}")
        else:
            log("FAIL", "[扩展]订单详情接口", "无可用 orderId，跳过")
    except Exception as e:
        log("FAIL", "[扩展]订单详情接口", f"异常: {type(e).__name__}: {e}")

    # 场景2：扫码历史接口验证（多租户隔离）
    try:
        if order_id:
            sl_code, sl_body = http(
                "GET",
                f"/api/production/scan/list?orderId={order_id}&page=1&pageSize=10"
            )
            if sl_code == 200:
                sl_resp = json.loads(sl_body)
                sl_data = sl_resp.get("data", {}) if isinstance(sl_resp, dict) else {}
                if isinstance(sl_data, dict):
                    sl_records = sl_data.get("records") or sl_data.get("list") or []
                elif isinstance(sl_data, list):
                    sl_records = sl_data
                else:
                    sl_records = []

                if not isinstance(sl_records, list):
                    log("FAIL", "[扩展]扫码历史records",
                        f"records 不是数组 | type={type(sl_records).__name__}")
                elif not sl_records:
                    log("PASS", "[扩展]扫码历史records",
                        "records 为空数组（无可校验项）")
                else:
                    # 验证每条记录有 tenantId 字段
                    missing_tid = [i for i, r in enumerate(sl_records)
                                   if not isinstance(r, dict) or "tenantId" not in r]
                    if missing_tid:
                        log("FAIL", "[扩展]扫码历史tenantId字段",
                            f"records 中索引 {missing_tid[:10]} 缺少 tenantId 字段（多租户隔离违规）")
                    else:
                        # 验证 tenantId 等于当前用户 tenantId
                        if user_tenant_id is not None:
                            mismatched = [i for i, r in enumerate(sl_records)
                                          if r.get("tenantId") != user_tenant_id]
                            if mismatched:
                                sample_tid = sl_records[mismatched[0]].get("tenantId")
                                log("FAIL", "[扩展]扫码历史tenantId一致性",
                                    f"records 中索引 {mismatched[:5]} 的 tenantId={sample_tid}"
                                    f" 与当前用户 tenantId={user_tenant_id} 不一致"
                                    f"（疑似跨租户数据泄漏 P0！）")
                            else:
                                log("PASS", "[扩展]扫码历史tenantId一致性",
                                    f"共 {len(sl_records)} 条记录，tenantId 均一致")
                        else:
                            log("PASS", "[扩展]扫码历史tenantId字段",
                                f"共 {len(sl_records)} 条记录均含 tenantId"
                                f"（未校验一致性，无用户 tenantId）")
            else:
                snippet = sl_body[:200] if sl_body else "(empty)"
                log("FAIL", "[扩展]扫码历史接口", f"HTTP {sl_code} | {snippet}")
        else:
            log("FAIL", "[扩展]扫码历史接口", "无可用 orderId，跳过")
    except Exception as e:
        log("FAIL", "[扩展]扫码历史接口", f"异常: {type(e).__name__}: {e}")

    # 场景3：款式工序配置接口验证（重复检查）
    try:
        if pattern_production_id:
            pc_code, pc_body = http(
                "GET",
                f"/api/production/pattern/{pattern_production_id}/process-config"
            )
            if pc_code == 200:
                pc_resp = json.loads(pc_body)
                pc_data = pc_resp.get("data", {}) if isinstance(pc_resp, dict) else {}
                # data 可能是数组或 {list: [...]} / {processes: [...]} / {records: [...]}
                if isinstance(pc_data, list):
                    process_list = pc_data
                elif isinstance(pc_data, dict):
                    process_list = (
                        pc_data.get("list")
                        or pc_data.get("processes")
                        or pc_data.get("records")
                        or []
                    )
                else:
                    process_list = []

                if not isinstance(process_list, list):
                    log("FAIL", "[扩展]工序配置结构",
                        f"工序列表不是数组 | type={type(process_list).__name__}")
                elif not process_list:
                    log("PASS", "[扩展]工序配置结构", "工序列表为空（无可校验项）")
                else:
                    # 检查重复：同一工序名+阶段不重复出现超过2次
                    from collections import Counter
                    key_counter = Counter()
                    for p in process_list:
                        if not isinstance(p, dict):
                            continue
                        name = (p.get("processName")
                                or p.get("name")
                                or p.get("processNameCn")
                                or "")
                        stage = (p.get("stage")
                                 or p.get("stageName")
                                 or p.get("productionStage")
                                 or "")
                        key = f"{name}|{stage}"
                        key_counter[key] += 1
                    duplicates = {k: v for k, v in key_counter.items() if v > 2}
                    if duplicates:
                        # 任务要求：有重复输出警告但不失败
                        log("PASS", "[扩展]工序配置重复检查(警告)",
                            f"共 {len(process_list)} 个工序，发现重复>2: {dict(list(duplicates.items())[:5])}"
                            f"（仅警告不失败）")
                    else:
                        log("PASS", "[扩展]工序配置重复检查",
                            f"共 {len(process_list)} 个工序，无重复超过2次")
            else:
                snippet = pc_body[:200] if pc_body else "(empty)"
                log("FAIL", "[扩展]工序配置接口", f"HTTP {pc_code} | {snippet}")
        else:
            log("FAIL", "[扩展]工序配置接口", "无可用 patternProductionId，跳过")
    except Exception as e:
        log("FAIL", "[扩展]工序配置接口", f"异常: {type(e).__name__}: {e}")

    # 场景4：WebSocket 握手验证（轻量级）
    try:
        if user_tenant_id is not None and token:
            ws_result = _websocket_handshake_test(BASE, user_tenant_id, token, ssl_ctx)
            if ws_result["success"]:
                log("PASS", "[扩展]WebSocket握手", ws_result["detail"])
            else:
                log("FAIL", "[扩展]WebSocket握手", ws_result["detail"])
        else:
            missing = []
            if user_tenant_id is None:
                missing.append("tenantId")
            if not token:
                missing.append("token")
            log("FAIL", "[扩展]WebSocket握手",
                f"缺少 {'+'.join(missing)}，跳过")
    except Exception as e:
        log("FAIL", "[扩展]WebSocket握手", f"异常: {type(e).__name__}: {e}")

# ─────────────────────────────────────────────────────────
# 4. 汇总
# ─────────────────────────────────────────────────────────
print("\n" + "=" * 56)
print("  测试结果汇总")
print("=" * 56)
pass_cnt = sum(1 for s, _, _ in results if s == "PASS")
fail_cnt = sum(1 for s, _, _ in results if s == "FAIL")
ext_pass_cnt = sum(1 for s, n, _ in results
                   if s == "PASS" and n.startswith("[扩展]"))
ext_fail_cnt = sum(1 for s, n, _ in results
                   if s == "FAIL" and n.startswith("[扩展]"))
ext_total = ext_pass_cnt + ext_fail_cnt

# 基础测试
print("\n  [基础测试]")
for status, name, detail in results:
    if name.startswith("[扩展]"):
        continue
    mark = "✅" if status == "PASS" else "❌"
    print(f"  {mark} {name}: {detail}")

# 扩展测试
if ext_total > 0:
    print(f"\n  [扩展测试] 共 {ext_total} 项")
    for status, name, detail in results:
        if not name.startswith("[扩展]"):
            continue
        mark = "✅" if status == "PASS" else "❌"
        print(f"  {mark} {name}: {detail}")

print("-" * 56)
print(f"  通过: {pass_cnt} | 失败: {fail_cnt} | 总计: {pass_cnt + fail_cnt}")
if ext_total > 0:
    print(f"  其中扩展测试: 通过 {ext_pass_cnt} | 失败 {ext_fail_cnt} | 总计 {ext_total}")
print("=" * 56)

# ─────────────────────────────────────────────────────────
# 5. 失败发飞书
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
