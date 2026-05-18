# 安全审计报告

**审计时间**: 2026-05-17
**审计范围**: 服装供应链系统后端 + 前端 + 小程序
**审计方法**: 代码路径分析 + 攻击面枚举

---

## 执行摘要

本次审计系统性检查了认证与访问控制、注入向量、外部交互、敏感数据处理四大高风险领域。共发现 **2 个已确认的中等及以上严重度漏洞**，均具有完整的端到端利用路径。

| 严重度 | 数量 | 漏洞ID |
|--------|------|--------|
| 高 (HIGH) | 1 | S-001 |
| 中 (MEDIUM) | 1 | S-002 |

---

## 已确认漏洞

### S-001: OpenAPI 签名验证缺少时间戳检查 — 高风险

**漏洞ID**: S-001
**严重度**: HIGH
**CWE**: CWE-347 (密码学签名验证缺失)

#### 攻击者画像

外部API客户（持有有效 AppKey + AppSecret 的已注册应用）

#### 输入向量

HTTP Header `X-Timestamp`（攻击者可控），该值在 [TenantAppOrchestrator.authenticateByAppKey()](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/integration/openapi/orchestration/TenantAppOrchestrator.java#L315-L341) 中被读取但从未验证：

```java
// 第 315-341 行
public TenantApp authenticateByAppKey(String appKey, String signature, String timestamp, String body) {
    // ... 查询应用、检查状态、检查过期 ...

    String decryptedSecret = aesEncryptor.decrypt(app.getAppSecret());
    String expectedSignature = hmacSha256(decryptedSecret, timestamp + (body != null ? body : ""));
    if (!expectedSignature.equals(signature)) {
        throw new SecurityException("签名验证失败");
    }

    checkAndIncrementQuota(app);
    return app;
    // ⚠️ 没有对 timestamp 进行任何范围校验
}
```

#### 完整攻击路径

1. 攻击者获取到合法 API 应用的 AppKey 和 AppSecret（通过逆向客户端应用、配置泄露等途径）
2. 使用任意时间戳计算签名：`HMAC-SHA256(appSecret, timestamp + requestBody)`
3. 多次重放同一合法请求，无需新鲜时间戳
4. 在配额耗尽前可无限期使用窃取的凭证

#### 影响

- **数据泄露**: 攻击者可冒充任意已注册应用，访问/修改该租户的生产订单、质检记录、付款数据、物流信息
- **数据篡改**: 通过 `/openapi/v1/order/create` 创建伪造订单，通过 `/openapi/v1/payment/confirm` 伪造付款确认
- **权限升级**: `DATA_IMPORT` 类型应用可批量创建款式、员工、工序数据
- **影响范围**: 每个已注册 OpenAPI 应用均受影响

#### 建议修复

在 `authenticateByAppKey()` 方法中添加时间戳有效性校验（允许 ±5 分钟窗口）：

```java
// 在 authenticateByAppKey() 方法开头添加
private static final long TIMESTAMP_TOLERANCE_SECONDS = 300L; // 5分钟

public TenantApp authenticateByAppKey(String appKey, String signature, String timestamp, String body) {
    // 新增：时间戳有效性校验
    if (timestamp == null || timestamp.isBlank()) {
        throw new SecurityException("缺少时间戳");
    }
    try {
        long requestTs = Long.parseLong(timestamp);
        long nowSec = System.currentTimeMillis() / 1000;
        if (Math.abs(nowSec - requestTs) > TIMESTAMP_TOLERANCE_SECONDS) {
            throw new SecurityException("请求已过期或时间戳无效");
        }
    } catch (NumberFormatException e) {
        throw new SecurityException("时间戳格式无效");
    }
    // ... 其余现有代码 ...
}
```

---

### S-002: IP 地址欺骗风险 — 中等风险

**漏洞ID**: S-002
**严重度**: MEDIUM
**CWE**: CWE-200 (信息泄露) / IP Spoofing

#### 攻击者画像

任何网络请求者（无需认证）

#### 输入向量

HTTP Header `X-Forwarded-For`（攻击者完全可控）

#### 完整代码路径

多处代码直接信任 `X-Forwarded-For` 头部获取客户端 IP，用于限流、日志记录等安全相关功能：

**位置 1**: [GlobalRateLimitFilter.java:142](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/common/filter/GlobalRateLimitFilter.java#L142)
```java
String xRealIp = request.getHeader("X-Real-IP");
// ...
return request.getRemoteAddr();
```

**位置 2**: [UserController.java:278](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/system/controller/UserController.java#L278)
```java
String[] headerNames = new String[] { "X-Forwarded-For", "X-Real-IP", "Proxy-Client-IP", ... };
for (String header : headerNames) {
    ip = request.getHeader(header);
    if (isValidIp(ip)) { break; }
}
// 直接信任第一个有效的 X-Forwarded-For 值
```

**位置 3**: [OpenApiController.java:711-716](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src66666/backend/src/main/java/com/fashion/supplychain/integration/openapi/controller/OpenApiController.java#L711-L716)
```java
String ip = request.getHeader("X-Forwarded-For");
if (ip == null || ip.isEmpty()) {
    ip = request.getHeader("X-Real-IP");
}
if (ip == null || ip.isEmpty()) {
    ip = request.getRemoteAddr();
}
// ip 值被记录到日志，但直接信任
```

#### 攻击场景

1. 攻击者在请求中注入 `X-Forwarded-For: 1.2.3.4`
2. 系统将 `1.2.3.4` 记录为客户端 IP（在日志、配额记录中）
3. 绕过基于 IP 的限流：每次请求使用不同伪造 IP 绕过 IP 黑名单/限流阈值
4. 混淆审计日志：真实攻击源 IP 被替换为伪造值，增加溯源难度
5. 配合 S-001 使用：伪造 IP 多次重放被盗凭证的请求，规避基于 IP 的异常检测

#### 影响

- 绕过 IP 限流（DoS 风险增加）
- 审计日志失真（安全事件溯源困难）
- 降低 IP 黑名单有效性
- 不直接影响认证（但降低整体安全监控能力）

#### 建议修复

仅在确认为可信代理（如 nginx）后才信任 `X-Forwarded-For`，否则回退到 `RemoteAddr`：

```java
private String getClientIp(HttpServletRequest request) {
    // 仅在已知可信代理头存在时才信任 X-Forwarded-For
    // 需配合 nginx 配置：proxy_set_header X-Forwarded-For $remote_addr;
    // 且仅第一个 IP（真实客户端）为可信
    String forwarded = request.getHeader("X-Forwarded-For");
    if (forwarded != null && !forwarded.isEmpty()) {
        // X-Forwarded-For 可能包含多个 IP，取第一个（最接近代理的客户端）
        String firstIp = forwarded.split(",")[0].trim();
        if (isValidPublicIp(firstIp)) {
            return firstIp; // 仅接受有效公网IP
        }
    }
    String realIp = request.getHeader("X-Real-IP");
    if (realIp != null && !realIp.isEmpty() && isValidPublicIp(realIp)) {
        return realIp;
    }
    return request.getRemoteAddr();
}

private boolean isValidPublicIp(String ip) {
    if (ip == null || ip.isEmpty()) return false;
    try {
        InetAddress addr = InetAddress.getByName(ip);
        return !addr.isLoopbackAddress()
            && !addr.isLinkLocalAddress()
            && !addr.isSiteLocalAddress()
            && !addr.isAnyLocalAddress();
    } catch (Exception e) {
        return false;
    }
}
```

---

## 审计范围外（已观察但未发现中等以上漏洞）

以下方面经过检查，**未发现**中等及以上漏洞：

| 检查项 | 结果 | 说明 |
|--------|------|------|
| SQL 注入 | ✅ 无 | 全部使用 MyBatis-Plus QueryWrapper/LambdaQueryWrapper 参数化查询 |
| Shell 命令注入 | ✅ 无 | 未发现 `Runtime.exec()` 或 `ProcessBuilder` 的用户可控输入拼接 |
| 路径遍历 | ✅ 无 | `TenantFileController` 和 `OrderShareController` 均使用 `normalize()` + `startsWith()` 校验 |
| 文件上传 | ✅ 规范 | 文件存储使用 COS 或租户隔离目录，无直接文件写入 |
| 密码存储 | ✅ 规范 | 使用 BCrypt 哈希（`UserLoginHelper`） |
| JWT 实现 | ✅ 规范 | 使用 hutool JWT，带过期时间和签名验证 |
| Webhook 签名 | ✅ 规范 | 微信/飞书/钉钉回调均有 HMAC-SHA256 或等效签名校验 |
| SSRF 防护 | ✅ 规范 | `TenantAppOrchestrator.validateExternalUrl()` 阻止内网地址和白名单检查 |
| OpenAPI URL 验证 | ✅ 规范 | 同上 |
| 认证端点 | ✅ 规范 | 登录限流、密码错误锁定、BCrypt 校验 |
| CSRF | ✅ 适用 | REST API + Bearer Token 认证，天然免疫 |
| XSS | ⚠️ 前端负责 | 后端不渲染 HTML，无服务器端 XSS 风险 |
| 多租户隔离 | ✅ 规范 | 所有查询强制加 tenantId 条件，UserContext 从 TokenSubject 提取 |
| 权限模型 | ✅ 规范 | @PreAuthorize + PermissionCalculationEngine 三级权限计算 |

---

## 附录：快速验证命令

```bash
# 验证 S-001（时间戳校验缺失）
# 使用任意旧时间戳调用 OpenAPI，观察是否被接受

# 验证 S-002（IP 欺骗）
curl -X POST https://your-domain.com/openapi/v1/order/list \
  -H "X-App-Key: YOUR_APP_KEY" \
  -H "X-Timestamp: 1700000000" \
  -H "X-Signature: COMPUTED_SIGNATURE" \
  -H "X-Forwarded-For: 1.2.3.4, 5.6.7.8" \
  -d '{}'
```

---

*报告生成工具: 自动安全审计工具*
