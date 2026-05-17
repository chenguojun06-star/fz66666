# 安全审计报告

**审计目标**：服装供应链系统（Fashion Supply Chain）
**审计日期**：2026-05-16
**审计范围**：后端 Spring Boot / 前端 React / 小程序 / H5
**审计方法**：代码路径追踪 + 攻击面分析

---

## 执行摘要

本次审计**确认发现 3 个中等严重度漏洞**，未发现高危或严重漏洞。所有发现均具备可论证的端到端利用路径。

| 严重度 | 数量 | 漏洞ID |
|--------|------|--------|
| 严重（Critical） | 0 | — |
| 高危（High） | 0 | — |
| **中等（Medium）** | **3** | **M-1、M-2、M-3** |

---

## 中等严重度漏洞（M）

### M-1: 生产环境允许使用占位符 PII 加密密钥

**严重程度**：Medium（CVSS 6.8）

**发现位置**：
- [SecurityConfig.java:L148-166](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java#L148-L166)

**攻击者画像**：外部攻击者（若能访问数据库备份或密钥泄露）

**可控输入向量**：配置环境变量 `APP_SECURITY_PII_ENCRYPTION_KEY`

**完整攻击路径**：

1. 生产环境部署时，运维人员未配置 `APP_SECURITY_PII_ENCRYPTION_KEY` 环境变量
2. 系统使用默认密钥 `defaultKeyChangeMe12345678` 初始化 `AesEncryptor`
3. 租户的企业微信回调密钥（`t_tenant.work_webhook_url` 包含 auth key）、应用密钥（`t_tenant_app.app_secret`）均以 AES-GCM 加密存储
4. 若数据库备份泄露，攻击者用同一默认密钥解密即可获取所有第三方集成凭据
5. 利用解密后的 webhook URL 可向企业微信群推送伪造告警，或调用聚水潭/抖音等平台 API

**代码路径**：

```java
// SecurityConfig.java:L24
public AesEncryptor(@Value("${app.security.pii-encryption-key:defaultKeyChangeMe12345678}") String key)

// SecurityConfig.java:L153-157
if (!org.springframework.util.StringUtils.hasText(pk) || "defaultKeyChangeMe12345678".equals(pk)) {
    if (isProd) {
        log.error("[Security] ⚠️ 生产环境 app.security.pii-encryption-key 未配置或使用占位值！...");
        // 仅记录 ERROR，不阻止启动
    }
}
```

**影响**：
- 加密的第三方 API 凭据可被解密
- 企业微信告警可被劫持
- 攻击者可在电商平台以受害者身份下单/查询

**修复建议**：
1. 生产环境启动时，若检测到占位密钥，应**拒绝启动**（而非仅记录 ERROR）
2. 生成密钥时强制校验最小熵（≥24 字符，区分大小写+数字+特殊字符）
3. 建议使用 Vault 或云 KMS 管理密钥，不在环境变量中明文存储

---

### M-2: Redis 不可用时密码版本校验熔断 60 秒，允许旧 Token 在改密后继续使用

**严重程度**：Medium（CVSS 6.2）

**发现位置**：
- [TokenAuthFilter.java:L77-96](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/auth/TokenAuthFilter.java#L77-L96)

**攻击者画像**：已获取有效 Token 的内部恶意用户（同事/前员工）

**可控输入向量**：持有受害者的 JWT Token

**完整攻击路径**：

1. 用户 A（工厂员工）持有有效 JWT Token（有效期 4 小时）
2. 管理员发现用户 A 行为异常，在系统中强制修改其密码
3. 系统将 `pwd:ver:{userId}` 在 Redis 中递增（使旧 Token 的 `pwdVer` 与 Redis 不匹配）
4. 此时恰好 Redis 连接超时/不可用（高并发下常见）
5. `TokenAuthFilter` 触发熔断：`redisFailedSince` 被设置为当前时间戳
6. 接下来 **60 秒内**，所有带用户 A 旧 Token 的请求跳过密码版本校验
7. 用户 A 的旧 Token 仍然有效，可继续操作

```java
// TokenAuthFilter.java:L77-96
try {
    String storedVer = stringRedisTemplate.opsForValue().get(PWD_VER_KEY_PREFIX + subject.getUserId());
    long expected = storedVer == null ? 0L : Long.parseLong(storedVer);
    Long tokenVer = subject.getPwdVersion();
    if (tokenVer == null || tokenVer < expected) {
        log.warn("[TokenAuthFilter] token已失效（密码版本不匹配）...");
        subject = null; // 标记为未认证
    }
    redisFailedSince.set(0L);
} catch (Exception e) {
    // Redis 不可用时熔断 60s
    if (redisFailedSince.compareAndSet(0L, System.currentTimeMillis())) {
        log.warn("[TokenAuthFilter] Redis 不可用，pwdVersion 校验已熔断 60s");
    }
}
```

**根因**：熔断保护了可用性，但**安全降级窗口（60 秒）内 Token 撤销机制失效**。

**影响**：
- 员工离职后，管理员改密，旧 Token 在 60 秒内仍可使用
- 安全事件响应期间，攻击者可利用熔断窗口维持访问

**修复建议**：
1. **Fail-Closed 策略**：Redis 不可用时，**拒绝所有带 Token 的请求**（而非跳过校验）
2. 或：将密码版本号直接写入 JWT Payload，验证时不依赖 Redis
3. 若必须熔断，窗口上限应 ≤ 10 秒，并在 JWT 中携带版本号作为最后防线

---

### M-3: SSRF 校验的 DNS 解析失败时绕过安全检查

**严重程度**：Medium（CVSS 5.3）

**发现位置**：
- [TenantAppOrchestrator.java:L676-682](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/integration/openapi/orchestration/TenantAppOrchestrator.java#L676-L682)

**攻击者画像**：已认证的租户管理员（可在"客户应用管理"中配置 webhook URL）

**可控输入向量**：客户应用配置中的 `callbackUrl` / `externalApiUrl`

**完整攻击路径**：

1. 攻击者（租户管理员）在客户应用管理中配置 webhook URL
2. 尝试配置内网地址 `http://169.254.169.254/latest/meta-data/`（云元数据端点）
3. 系统检测到 `169.254.169.254` 在 BLOCKED_HOSTS 中，拒绝保存 ✅
4. 攻击者换一个 DNS 无法解析的域名：`http://internal.corp.local/api/webhook`
5. `InetAddress.getByName("internal.corp.local")` 抛出 `UnknownHostException`
6. catch 块捕获异常，记录警告日志，**放行该 URL** ✅

```java
// TenantAppOrchestrator.java:L676-682
try {
    InetAddress resolved = InetAddress.getByName(host);
    if (resolved.isLoopbackAddress() || resolved.isLinkLocalAddress()
            || resolved.isSiteLocalAddress()) {
        throw new IllegalArgumentException("..."); // 拒绝
    }
} catch (java.net.UnknownHostException e) {
    log.warn("[TenantApp] {} 主机名解析失败，放行但需关注: host={}", fieldName, host);
    return url.trim(); // ❌ 绕过安全检查放行
}
```

**影响**：
- 攻击者可配置内网 IP（如 `10.0.0.1`）的域名，当 DNS 污染或未配置时绕过 SSRF 检查
- 利用业务 webhook 推送功能探测内网服务，或读取云元数据（配合 DNS 重绑定攻击）

**修复建议**：
1. DNS 解析失败时应**拒绝 URL**，而非放行
2. 添加 DNS Rebinding 保护：对同一域名，多次请求返回不同 IP 时告警或拒绝
3. 维护可信 IP 段列表，超出范围时强制拒绝

---

## 审计通过项（已确认安全）

以下安全控制经审计验证有效，不作为问题报告：

| 安全控制 | 验证结果 |
|---------|---------|
| JWT Token 签名验证 | ✅ `jwt.verify()` + `jwt.validate(0)` 双重校验 |
| JWT Token 过期校验 | ✅ `exp` payload 由 Hutool JWT 库强制校验 |
| SQL 注入防护 | ✅ MyBatis-Plus 参数化查询，无字符串拼接 SQL |
| Shell 命令注入 | ✅ 全代码库未发现 `Runtime.exec` 或 `ProcessBuilder` |
| XSS 防护（普通请求） | ✅ `XssHttpServletRequestWrapper` 对 Query 参数 HTML 转义 |
| XSS 防护（JSON POST） | ✅ `XssFilter.containsXssPattern()` 检测常见 XSS 模式 |
| 文件上传白名单 | ✅ 38 种扩展名白名单 + UUID 重命名 |
| 路径遍历防护 | ✅ `baseDir.resolve().normalize()` + `startsWith()` 校验 |
| 多租户数据隔离 | ✅ `TenantInterceptor` 自动追加 `tenant_id` 条件 |
| 支付回调签名验证 | ✅ `PaymentManager.verifyCallback()` 验签 |
| 微信 AI Webhook 验签 | ✅ SHA-1 三元组（token+timestamp+nonce）校验 |
| 开放 API HMAC 验签 | ✅ `HMAC-SHA256(timestamp + body)` 校验 |
| API 限流 | ✅ Redis Lua 脚本原子计数，fail-closed |
| 凭证不写入日志 | ✅ 密码/token/密钥未出现在任何日志语句中 |
| PII 加密算法 | ✅ AES-256-GCM（认证加密，含随机 IV） |
| CORS 配置 | ✅ 仅允许配置的模式，credentials 正确设置 |
| HSTS 安全头 | ✅ `maxAgeInSeconds=31536000`（1 年） |

---

## 已验证的架构安全优势

1. **无状态 JWT**：不依赖服务端 Session，消除 Session 劫持风险
2. **密码版本号**：改密后旧 Token 自动失效（Redis 可用时）
3. **权限计算引擎**：三级权限体系（角色权限 ∩ 天花板 ∪ GRANT - REVOKE）
4. **限流熔断（DoS 防护）**：Redis 不可用时 fail-closed（拒绝请求）
5. **Webhook 签名验证**：所有第三方回调均有 HMAC 签名校验
6. **租户数据隔离**：MyBatis-Plus 拦截器强制追加 `tenant_id`

---

## 修复优先级建议

| 优先级 | 漏洞 | 理由 |
|--------|------|------|
| **P1（立即修复）** | M-1：占位符密钥放行生产 | 数据泄露直接风险，修复成本低 |
| **P2（本周内修复）** | M-2：Redis 熔断绕过 Token 撤销 | 内部威胁利用窗口，需改逻辑 |
| **P3（ sprint 修复）** | M-3：DNS 解析失败绕过 SSRF | 需配合 DNS 安全策略，攻击门槛较高 |

---

*本报告由自动化安全审计工具生成，所有发现均附有可验证的代码路径。*
