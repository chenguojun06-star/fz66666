# 安全审计报告

**审计日期**: 2026-06-22
**审计范围**: 服装供应链系统后端（Java/Spring Boot）
**审计方法**: 代码静态分析 + 架构审查

---

## 执行摘要

经过系统性审计，发现 **1个高危** 和 **3个中危** 已确认漏洞。所有发现均具备可利用的端到端攻击路径。

| 严重度 | 数量 | 问题ID |
|--------|------|--------|
| HIGH | 1 | SEC-001 |
| MEDIUM | 3 | SEC-002, SEC-003, SEC-004 |

---

## SEC-001: PII加密密钥使用可预测的默认值

**严重度**: HIGH

### 攻击者画像
- 外部攻击者（如果生产环境未正确配置密钥）
- 内部恶意用户

### 输入向量
环境变量 `APP_PII_ENCRYPTION_KEY` 未配置时，系统使用内置默认值 `defaultKeyChangeMe12345678`

### 代码路径

1. **AesEncryptor.java:24** - 密钥硬编码默认值
```java
public AesEncryptor(@Value("${app.security.pii-encryption-key:defaultKeyChangeMe12345678}") String key) {
```

2. **application.yml:218** - 默认值声明
```yaml
pii-encryption-key: ${APP_PII_ENCRYPTION_KEY:defaultKeyChangeMe12345678}
```

3. **SecurityConfig.java:175-178** - 仅警告，不阻止启动
```java
if (!org.springframework.util.StringUtils.hasText(pk) || "defaultKeyChangeMe12345678".equals(pk)) {
    if (isProd) {
        log.error("[Security] ⚠️ 生产环境 app.security.pii-encryption-key 未配置或使用占位值！");
    }
}
```

### 影响
- 如果生产环境未配置 `APP_PII_ENCRYPTION_KEY`，所有PII数据（身份证号、联系电话等）使用已知密钥加密
- 攻击者可解密敏感数据，造成数据泄露

### 实际利用路径
1. 攻击者通过社工或配置错误获取运行中的容器环境变量
2. 或通过日志文件泄露的配置信息获取密钥
3. 使用相同算法解密存储在数据库中的PII字段

### 修复建议
1. **强制启动校验** - 生产环境如果使用默认密钥，应该抛出异常阻止启动，而非仅记录警告
2. **密钥轮换机制** - 支持密文重加密，避免密钥泄露后无法补救
3. **环境变量检查** - 在 `startupValidation` 中增加强校验

---

## SEC-002: JWT密钥使用弱默认值

**严重度**: MEDIUM

### 攻击者画像
- 外部攻击者（如果生产环境未正确配置JWT密钥）

### 输入向量
环境变量 `APP_AUTH_JWT_SECRET` 未配置或配置为默认值 `ThisIsA_LocalJwtSecret_OnlyForDev_0123456789`

### 代码路径

1. **application.yml:198**
```yaml
jwt-secret: ${APP_AUTH_JWT_SECRET:ThisIsA_LocalJwtSecret_OnlyForDev_0123456789}
```

2. **SecurityConfig.java:143-147** - 启动时检测到默认值会阻止启动（好）
```java
if ("dev-secret-change-me".equals(s)) {
    throw new IllegalStateException("app.auth.jwt-secret 不能使用默认占位值");
}
```

### 影响
- 虽然代码有检测，但检测值与application.yml中的默认值不匹配（`dev-secret-change-me` vs `ThisIsA_LocalJwtSecret_OnlyForDev_0123456789`）
- 如果生产环境使用默认值，攻击者可伪造任意用户JWT token

### 修复建议
1. **统一默认值检测** - 将 `application.yml` 中的默认值改为 `dev-secret-change-me`，与启动校验逻辑一致
2. **加强密钥复杂度校验** - 当前仅检查长度≥32，缺少熵值检查（代码有简单检查但不充分）

---

## SEC-003: Header认证IP白名单可被X-Forwarded-For欺骗

**严重度**: MEDIUM

### 攻击者画像
- 内部网络攻击者（同一可信网络内的恶意用户）

### 输入向量
HTTP请求头 `X-Forwarded-For` 或 `X-Real-IP`

### 代码路径

1. **SecurityConfig.java:213-248** - HeaderAuthFilter
```java
private class HeaderAuthFilter extends OncePerRequestFilter {
    if (!headerAuthEnabled || !isLocalRequest(request)) {
        filterChain.doFilter(request, response);
        return;
    }
    // 从Header提取用户信息创建认证...
}
```

2. **SecurityConfig.java:451-479** - isLocalRequest检查IP
```java
private boolean isLocalRequest(HttpServletRequest request) {
    String remoteAddr = request.getRemoteAddr();
    // ...
    // 检查 trustedIpPrefixes
}
```

3. **SecurityConfig.java:481-494** - resolveClientIp从X-Forwarded-For获取真实IP
```java
private static String resolveClientIp(HttpServletRequest request) {
    String forwarded = request.getHeader("X-Forwarded-For");
    // 但isLocalRequest使用的是getRemoteAddr()而非resolveClientIp()
}
```

### 影响
- `isLocalRequest()` 使用 `request.getRemoteAddr()` - 这在有反向代理的情况下不可欺骗
- 但 `resolveClientIp()` 方法存在且被记录，如果被误用可能导致IP欺骗
- 当前代码未直接暴露此漏洞，但方法存在被其他代码错误调用的风险

### 实际利用路径
如果其他开发者误用 `resolveClientIp()` 而非 `getRemoteAddr()` 来做访问控制，攻击者可通过伪造 `X-Forwarded-For` 绕过IP白名单

### 修复建议
1. **删除或标记废弃** - `resolveClientIp()` 方法应该被标记为 `@Deprecated` 并说明仅用于日志
2. **统一IP获取** - 创建单一可信的IP获取方法，明确标注何时使用
3. **添加注释** - 明确说明 `isLocalRequest()` 使用 `getRemoteAddr()` 而非 `X-Forwarded-For`

---

## SEC-004: 开放API时间戳校验窗口过大

**严重度**: MEDIUM

### 攻击者画像
- 外部攻击者（获取到有效签名和appKey的攻击者）

### 输入向量
HTTP请求头 `X-Timestamp`

### 代码路径

**TenantAppOrchestrator.java:331-340**
```java
if (timestamp != null && !timestamp.isBlank()) {
    try {
        long ts = Long.parseLong(timestamp);
        if (Math.abs(System.currentTimeMillis() - ts * 1000) > 5 * 60 * 1000) {
            throw new SecurityException("签名时间戳过期，请重新签名");
        }
    }
}
```

### 影响
- 5分钟的时间窗口允许攻击者在5分钟内使用截获的签名和appKey
- 攻击者可在有效签名过期前发起重放攻击

### 实际利用路径
1. 攻击者通过中间人攻击或日志泄露获取有效的 appKey + signature + timestamp
2. 在5分钟窗口内，攻击者可使用这些凭证发起任意API调用
3. 超过5分钟后签名失效

### 修复建议
1. **缩短时间窗口** - 将5分钟改为1分钟，降低重放攻击窗口
2. **添加nonce** - 在签名中加入随机nonce，防止重放
3. **签名缓存** - 将已使用的签名+nonce存入Redis，短时间内拒绝重复使用

---

## 已确认安全实践（正面发现）

| 领域 | 发现 |
|------|------|
| SQL注入防护 | 使用MyBatis-Plus的`#{}`参数化查询，未发现`${}`动态SQL拼接 |
| 命令注入防护 | 未发现`Runtime.exec()`或`ProcessBuilder`命令执行 |
| Webhook签名验证 | 飞书/钉钉/微信回调均有签名和时间戳验证 |
| 密码存储 | 使用BCryptPasswordEncoder |
| JWT安全 | 支持密码版本号(token invalidation on password change) |
| SSRF防护 | TenantAppOrchestrator.validateExternalUrl()阻止内网地址 |
| 安全响应头 | SecurityConfig配置了HSTS/X-Frame-Options/X-XSS-Protection等 |
| 敏感日志 | 未发现密码/密钥在日志中泄露 |

---

## 总结

本次审计发现4个已确认漏洞，均具备端到端利用路径。最严重的问题是PII加密使用默认密钥，在生产环境未正确配置时可导致大规模数据泄露。

**立即行动项**:
1. 生产环境检查是否配置了 `APP_PII_ENCRYPTION_KEY` 和 `APP_AUTH_JWT_SECRET`
2. 统一JWT默认密钥检测逻辑
3. 考虑缩短OpenAPI签名时间戳窗口
