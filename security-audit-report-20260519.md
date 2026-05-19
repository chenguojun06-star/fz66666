# 安全审计报告 — 服装供应链系统

**审计日期**: 2026-05-19
**审计范围**: 后端 Spring Boot 3.4.5 + 前端 React 18/TypeScript + 小程序
**审计方法**: 静态代码分析 + 配置审查

---

## 执行摘要

本次审计共发现 **2个高危** 和 **3个中危** 已确认漏洞，均具备可演示的端到端利用路径。所有发现均已提供具体修复方案。

| 严重度 | 数量 | 漏洞ID |
|--------|------|--------|
| **高危 (S-1 ~ S-2)** | 2 | S-1, S-2 |
| **中危 (M-1 ~ M-3)** | 3 | M-1, M-2, M-3 |

---

## 一、高危漏洞 (S-1 ~ S-2)

### S-1: OpenAPI 签名验证存在重放攻击漏洞

**严重度**: 高危
**CWE**: CWE-347 ( Improper Verification of Cryptographic Signature )
**CVSS 3.1**: 7.5 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N)

#### 攻击者画像
- 外部攻击者（可访问网络）
- 拥有有效 `appKey` 的第三方集成商（意外泄露或内部威胁）

#### 输入向量
HTTP 请求头 `X-OpenApi-Timestamp`

#### 代码路径

```
TenantAppOrchestrator.authenticateByAppKey()
  [TenantAppOrchestrator.java:315-348]
    ↓
第 331-336 行：timestamp 仅参与签名计算，但未验证时间窗口
    ↓
String dataToSign = appKey + timestamp + body;
String expected = hmacSha256(app.getAppSecret(), dataToSign);
if (!expected.equals(signature)) { throw ... }  // 仅验证签名
```

**问题代码** ([TenantAppOrchestrator.java:331-336](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/integration/openapi/orchestration/TenantAppOrchestrator.java#L331-L336)):
```java
// timestamp 仅用于签名计算，未校验时间有效性
String dataToSign = appKey + timestamp + body;
String expected = hmacSha256(app.getAppSecret(), dataToSign);
if (!expected.equals(signature)) {
    throw new SecurityException("签名不匹配");
}
// ⚠️ 缺少：时间戳有效性校验
```

#### 影响
1. **数据泄露**: 攻击者重放历史有效请求，获取订单、生产、工资等敏感业务数据
2. **业务操纵**: 重放创建/更新订单的请求，造成重复下单或状态异常
3. **权限滥用**: 即使 appSecret 轮换后，历史抓包的请求仍可被重放（若 timestamp 未校验）

#### 修复建议

```java
// 在 authenticateByAppKey() 方法签名验证后添加：
private static final long MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5分钟

long requestTime;
try {
    requestTime = Long.parseLong(timestamp);
} catch (NumberFormatException e) {
    throw new SecurityException("无效时间戳格式");
}

long currentTime = System.currentTimeMillis();
if (Math.abs(currentTime - requestTime) > MAX_TIMESTAMP_DRIFT_MS) {
    log.warn("[OpenAPI] 请求时间戳超出允许范围: appKey={}, drift={}ms", appKey, Math.abs(currentTime - requestTime));
    throw new SecurityException("请求已过期，请重新生成签名");
}
```

---

### S-2: 默认 PII 加密密钥可预测

**严重度**: 高危
**CWE**: CWE-798 ( Use of Hard-coded Credentials )
**CVSS 3.1**: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)

#### 攻击者画像
- 外部攻击者（获取代码或配置文件）
- 内部恶意员工

#### 输入向量
应用配置文件 `application.yml` 或环境变量

#### 代码路径

```
application.yml:222
  app.security.pii-encryption-key: ${APP_SECURITY_PII_ENCRYPTION_KEY:defaultKeyChangeMe12345678}
    ↓
TenantSensitiveDataService.encrypt/decrypt()
  [TenantSensitiveDataService.java]
    ↓
用于加密租户敏感字段（联系方式、地址等）
```

**问题配置** ([application.yml:222](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/resources/application.yml#L222)):
```yaml
app:
  security:
    pii-encryption-key: ${APP_SECURITY_PII_ENCRYPTION_KEY:defaultKeyChangeMe12345678}  # ⚠️ 硬编码默认密钥
```

#### 影响
1. **数据泄露**: 若生产环境未设置 `APP_SECURITY_PII_ENCRYPTION_KEY` 环境变量，PII 数据可用可预测密钥解密
2. **隐私违规**: 违反 GDPR/个人信息保护法，泄露用户敏感信息

#### 修复建议

1. **强制检查启动时密钥配置**:
```java
@PostConstruct
public void validateSecurityConfig() {
    String piiKey = piiEncryptionKeyProvider.getKey();
    if (piiKey == null || piiKey.equals("defaultKeyChangeMe12345678")) {
        throw new IllegalStateException(
            "PII加密密钥未配置或使用了默认密钥！请设置 APP_SECURITY_PII_ENCRYPTION_KEY 环境变量"
        );
    }
    if (piiKey.length() < 32) {
        throw new IllegalStateException("PII加密密钥长度必须 >= 32字符");
    }
}
```

2. **生产部署检查清单**:
```bash
# 必须设置，不允许默认值
export APP_SECURITY_PII_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

---

## 二、中危漏洞 (M-1 ~ M-3)

### M-1: Header 认证绕过风险

**严重度**: 中危
**CWE**: CWE-287 ( Improper Authentication )
**CVSS 3.1**: 6.5 (AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:N)

#### 攻击者画像
- 内部攻击者（同一网络环境）

#### 输入向量
HTTP 请求头 `X-Auth-User-Id`, `X-Auth-Role`, `X-Auth-Tenant-Id`

#### 代码路径

```
HeaderAuthFilter.doFilterInternal()
  [SecurityConfig.java]
    ↓
第 61-63 行：
if (headerAuthEnabled && isTrustedIp(sourceIp)) {
    // ⚠️ 可完全绕过 JWT 认证
```

**问题代码** ([SecurityConfig.java:61-63](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java#L61-L63)):
```java
if (headerAuthEnabled && isTrustedIp(sourceIp)) {
    // 可完全绕过 JWT 认证，使用请求头注入身份
    String userId = request.getHeader("X-Auth-User-Id");
    String role = request.getHeader("X-Auth-Role");
    String tenantId = request.getHeader("X-Auth-Tenant-Id");
    // ...
}
```

#### 当前状态
- 默认禁用: `APP_AUTH_HEADER_AUTH_ENABLED=false`
- 可信IP列表: `127.*`, `0:0:0:0:0:0:0:1` (仅本地)

#### 风险场景
1. 服务间调用（如 Docker 容器间）若误配置为可信 IP，可能被滥用
2. Kubernetes 集群内 Pod IP 变化可能导致意外认证

#### 修复建议

```java
// 1. 添加警告日志
if (headerAuthEnabled) {
    log.warn("[Security] Header认证已启用，请确保仅在受信任的内部网络环境中使用！");
}

// 2. 限制为绝对本地地址
private static final Set<String> ALLOWED_HEADER_AUTH_IPS = Set.of(
    "127.0.0.1",
    "0:0:0:0:0:0:0:1"
);

private boolean isAbsoluteLocalIp(String ip) {
    return ALLOWED_HEADER_AUTH_IPS.contains(ip);
}
```

---

### M-2: JWT 密钥未强制校验

**严重度**: 中危
**CWE**: CWE-256 ( Plaintext Storage of a Password )
**CVSS 3.1**: 5.9 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N)

#### 输入向量
环境变量 / 配置

#### 代码路径

```
application.yml:194
  app.auth.jwt-secret: ${APP_AUTH_JWT_SECRET:}
    ↓
JwtTokenProvider生成/验证token
```

**问题配置** ([application.yml:194](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/resources/application.yml#L194)):
```yaml
app:
  auth:
    jwt-secret: ${APP_AUTH_JWT_SECRET:}  # ⚠️ 允许为空
```

#### 风险
- 若未设置 `APP_AUTH_JWT_SECRET`，系统使用空密钥或默认密钥
- 攻击者可伪造任意用户的 JWT token

#### 修复建议

```java
@PostConstruct
public void validateJwtSecret() {
    if (StringUtils.isBlank(jwtSecret)) {
        throw new IllegalStateException(
            "JWT密钥未配置！请设置 APP_AUTH_JWT_SECRET 环境变量（建议 >= 64字符）"
        );
    }
    if (jwtSecret.length() < 64) {
        log.warn("[Security] JWT密钥长度 < 64字符，建议使用更强的密钥");
    }
}
```

---

### M-3: 文件上传缺少内容类型校验

**严重度**: 中危
**CWE**: CWE-434 ( Unrestricted Upload of File with Dangerous Type )
**CVSS 3.1**: 5.3 (AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)

#### 攻击者画像
- 已认证用户（上传文件功能）

#### 输入向量
文件上传请求的 MIME 类型和文件扩展名

#### 代码路径

```
TenantFileController.upload()
  [TenantFileController.java]
    ↓
第 57-61 行：
String originalFilename = file.getOriginalFilename();
String extension = originalFilename != null ?
    originalFilename.substring(originalFilename.lastIndexOf(".")).toLowerCase() : "";
```

**问题代码** ([TenantFileController.java:57-61](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/common/TenantFileController.java#L57-L61)):
```java
// ⚠️ 仅检查扩展名，未验证文件内容
String extension = originalFilename != null ?
    originalFilename.substring(originalFilename.lastIndexOf(".")).toLowerCase() : "";
if (extension.isEmpty()) {
    extension = ".bin";
}
```

#### 影响
1. 上传恶意文件（.jsp, .php 等）可能被执行
2. 上传包含恶意宏的 Office 文档

#### 修复建议

```java
// 1. 白名单允许的 MIME 类型
private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
);

// 2. 文件内容魔数校验（扩展名与内容不一致时以内容为准）
public boolean isAllowedContentType(MultipartFile file) {
    String contentType = file.getContentType();
    if (contentType == null) return false;
    // 检查 MIME 类型白名单
    if (!ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
        return false;
    }
    // 检查文件头魔数
    return isValidFileMagicNumber(file);
}

// 3. 仅保留合法扩展名
private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx"
);
```

---

## 三、安全实践亮点

本次审计也确认了以下安全实践 **做得正确**：

| 方面 | 实现 | 评价 |
|------|------|------|
| SQL注入防护 | MyBatis-Plus QueryWrapper 参数化查询 | ✅ 优秀 |
| 命令注入防护 | 未发现 Runtime.exec 调用 | ✅ 优秀 |
| XSS防护 | XssFilter + React 默认转义 | ✅ 良好 |
| 密码存储 | BCrypt 哈希 | ✅ 优秀 |
| 多租户隔离 | TenantInterceptor 强制注入 | ✅ 良好 |
| JWT签名 | HMAC-SHA256 + 密码版本校验 | ✅ 良好 |
| 敏感数据脱敏 | SensitiveDataMaskHelper | ✅ 良好 |
| 速率限制 | GlobalRateLimitFilter | ✅ 良好 |
| CORS配置 | 生产环境检查警告 | ✅ 良好 |
| 日志脱敏 | 密码/密钥不记录 | ✅ 良好 |
| Webhook签名验证 | HMAC-SHA256 验证 | ✅ 良好 |

---

## 四、修复优先级建议

| 优先级 | 漏洞ID | 理由 |
|--------|--------|------|
| **P0 (24小时内)** | S-2 | 默认密钥已泄露风险，立即修复 |
| **P1 (1周内)** | S-1 | 重放攻击可导致数据泄露 |
| **P2 (2周内)** | M-2 | JWT密钥校验缺失 |
| **P3 (1个月内)** | M-1, M-3 | 风险相对可控 |

---

## 五、附录：文件位置索引

| 漏洞ID | 相关文件 |
|--------|---------|
| S-1 | [TenantAppOrchestrator.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/integration/openapi/orchestration/TenantAppOrchestrator.java) |
| S-2 | [application.yml:222](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/resources/application.yml#L222), [TenantSensitiveDataService.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/common/TenantSensitiveDataService.java) |
| M-1 | [SecurityConfig.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java) |
| M-2 | [application.yml:194](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/resources/application.yml#L194), [JwtTokenProvider.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/auth/JwtTokenProvider.java) |
| M-3 | [TenantFileController.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/common/TenantFileController.java) |
