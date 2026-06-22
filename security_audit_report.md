# 安全审计报告

> 审计日期：2026-06-22
> 审计范围：服装供应链系统（后端 Spring Boot + 前端 React + 小程序 + H5）
> 审计方法：代码审查 + 架构分析

---

## 执行摘要

本审计发现了 **2 个高严重度问题**、**3 个中严重度问题** 和若干低严重度问题。经过深入分析，大多数问题已有缓解措施或存在于非关键路径。核心认证、SQL注入、XSS防护机制设计良好。

---

## 高严重度发现

### H-001：JWT密钥使用不安全默认值

**位置：** `backend/src/main/resources/application.yml` 第198行

```yaml
jwt-secret: ${APP_AUTH_JWT_SECRET:ThisIsA_LocalJwtSecret_OnlyForDev_0123456789}
```

**问题描述：**
应用程序配置了硬编码的默认JWT密钥 `ThisIsA_LocalJwtSecret_OnlyForDev_0123456789`。虽然 `SecurityConfig.java` 第143-148行有启动时校验禁止使用 `"dev-secret-change-me"`，但**未校验此具体默认值**。

**攻击者画像：** 外部攻击者或恶意内部用户

**利用路径：**
1. 攻击者发现生产环境未配置 `APP_AUTH_JWT_SECRET` 环境变量
2. 使用硬编码密钥签名伪造JWT token
3. 设置任意 userId、tenantId、roleId、permissionRange 为 `all`
4. 获取管理员权限访问所有租户数据

**影响：** 完整的认证绕过 → 跨租户数据泄露 + 权限提升

**修复建议：**
```yaml
jwt-secret: ${APP_AUTH_JWT_SECRET:}  # 移除默认值，强制要求配置
```
并在 `SecurityConfig.startupValidation()` 中添加：
```java
if ("ThisIsA_LocalJwtSecret_OnlyForDev_0123456789".equals(s)) {
    throw new IllegalStateException("app.auth.jwt-secret 不能使用开发默认值");
}
```

---

### H-002：PII加密使用不安全默认值

**位置：** `backend/src/main/resources/application.yml` 第218行

```yaml
pii-encryption-key: ${APP_PII_ENCRYPTION_KEY:defaultKeyChangeMe12345678}
```

**问题描述：**
应用程序配置了硬编码的默认PII加密密钥。`SecurityConfig.java` 第175行校验了 `"defaultKeyChangeMe12345678"` 值，但仅在生产环境输出警告日志，不阻止启动。

**攻击者画像：** 能访问数据库的外部攻击者或恶意内部人员

**利用路径：**
1. 攻击者获取数据库访问权限或备份
2. 发现使用的是默认密钥加密的PII字段
3. 使用默认密钥解密用户敏感信息（手机号、地址等）

**影响：** PII数据泄露

**修复建议：**
```yaml
pii-encryption-key: ${APP_PII_ENCRYPTION_KEY:}  # 移除默认值
```
并在 `SecurityConfig.startupValidation()` 中将警告改为异常：
```java
if (isProd && ("defaultKeyChangeMe12345678".equals(pk) || pk.length() < 24)) {
    throw new IllegalStateException("生产环境 app.security.pii-encryption-key 未配置或长度不足");
}
```

---

## 中严重度发现

### M-001：订单分享存在开放重定向

**位置：** `backend/.../production/controller/OrderShareController.java` 第94-95行

```java
if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return ResponseEntity.status(302).location(URI.create(fileUrl)).build();
}
```

**问题描述：**
`/api/public/share/order/{token}/style-cover` 端点允许从数据库中的 `fileUrl` 字段重定向到任意HTTP/HTTPS URL。虽然需要有效的分享令牌，但攻击者可以通过枚举或预测令牌值进行钓鱼攻击。

**攻击者画像：** 外部用户（无需认证）

**利用路径：**
1. 攻击者获取或预测有效分享令牌
2. 修改关联的 fileUrl 为恶意网站
3. 诱导原始用户点击分享链接
4. 用户被重定向到钓鱼网站，泄露凭据

**影响：** 网络钓鱼攻击、凭据盗窃

**缓解因素：** 令牌为UUID且有30天有效期，攻击难度较高

**修复建议：**
```java
// 添加URL白名单校验
private static final Set<String> ALLOWED_DOMAINS = Set.of("your-cdn.com", "your-domain.com");
URI targetUri = URI.create(fileUrl);
if (!ALLOWED_DOMAINS.contains(targetUri.getHost())) {
    log.warn("[安全] 尝试重定向到未授权域名: {}", fileUrl);
    return ResponseEntity.notFound().build();
}
```

---

### M-002：CORS配置过于宽松

**位置：** `backend/src/main/resources/application.yml` 第228行

```yaml
cors:
  allowed-origin-patterns: ${APP_CORS_ALLOWED_ORIGIN_PATTERNS:https://webyszl.cn,https://*.webyszl.cn,http://localhost:*,http://127.0.0.1:*,http://192.168.*:*,http://10.*:*}
```

**问题描述：**
CORS允许 `http://192.168.*:*` 和 `http://10.*:*` 等私有IP范围，攻击者可利用内网恶意网站发起跨域请求。

**攻击者画像：** 内网攻击者

**利用路径：**
1. 攻击者在内网中部署恶意网站
2. 诱使用户访问（需在同一网络）
3. 从浏览器发起跨域请求到应用程序API
4. 利用已登录用户会话执行操作

**影响：** 有限（需用户已在内网访问恶意网站）

**修复建议：**
```yaml
cors:
  allowed-origin-patterns: ${APP_CORS_ALLOWED_ORIGIN_PATTERNS:https://webyszl.cn,https://*.webyszl.cn}
```
移除所有私有IP范围和localhost模式。

---

### M-003：Header认证Filter存在潜在绕过风险

**位置：** `backend/.../config/SecurityConfig.java` 第213-248行

```java
private class HeaderAuthFilter extends OncePerRequestFilter {
    if (!headerAuthEnabled || !isLocalRequest(request)) {
        // ...
        if (username != null && !username.isBlank()) {
            // 直接设置用户身份，无额外验证
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                username, userId, authorities);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
    }
}
```

**问题描述：**
当 `headerAuthEnabled=true` 且请求来自"可信IP"时，应用程序直接从HTTP Header设置用户身份。如果 `X-Forwarded-For` 被欺骗或 `trustedIpPrefixes` 配置过于宽松，攻击者可以伪造任意用户身份。

**攻击者画像：** 能控制请求来源IP的攻击者（如在同一网络的中间人）

**利用路径：**
1. 攻击者设置 `X-Forwarded-For: 127.0.0.1` 或 `X-Real-IP: 127.0.0.1`
2. 设置 `X-User-Id`、`X-User-Name`、`X-User-Role` Header
3. 应用程序错误地将请求识别为本地可信请求
4. 攻击者以任意用户身份访问系统

**影响：** 完整的认证绕过（如果headerAuthEnabled误开启）

**缓解因素：**
- `headerAuthEnabled` 默认为 `false`
- `isLocalRequest()` 检查 `X-Forwarded-For` 但依赖 `request.getRemoteAddr()`，在有可信代理时可能不可靠

**修复建议：**
1. 生产环境确保 `headerAuthEnabled=false`
2. 不要依赖 X-Forwarded-For 判断本地请求
3. 如果必须启用，添加额外的签名验证机制

---

## 低严重度发现

### L-001：数据库密码默认为空

**位置：** `backend/src/main/resources/application.yml` 第56行

```yaml
password: ${DB_PASSWORD:}
```

**问题描述：** 数据库密码默认为空字符串。虽然 `SecurityConfig.java` 第155-161行有生产环境警告，但开发环境会用空密码连接数据库。

**影响：** 仅影响开发环境安全性

**建议：** 添加更强的默认值检查或使用Docker Secrets机制。

---

## 已验证为安全的区域

### 认证与授权
- ✅ JWT使用 `cn.hutool.jwt` 库，签名验证正确实现
- ✅ 密码使用 BCrypt 加密存储
- ✅ `@PreAuthorize` 注解正确使用在Controller层
- ✅ 多租户隔离通过 `tenantId` 检查实现
- ✅ 密码版本号机制确保改密后旧token立即失效

### SQL注入防护
- ✅ MyBatis Plus QueryWrapper 使用参数化查询
- ✅ XML Mapper使用 `#{param}` 绑定参数
- ✅ 无发现字符串拼接SQL

### XSS防护
- ✅ 前端DOMPurify配置严格，白名单标签和属性
- ✅ Spring Security配置了 `X-XSS-Protection: 1; mode=block`
- ✅ Cookie配置了 `http-only` 和 `secure` 标记

### 文件操作
- ✅ 路径遍历防护正确实现 (`filePath.startsWith(baseDir)`)
- ✅ 文件上传到租户隔离目录

### Webhook安全
- ✅ 微信/支付宝回调使用签名验证
- ✅ WeChat AI Webhook使用SHA-1签名验证

### 命令注入
- ✅ 无发现 `Runtime.exec()` 或类似危险调用

### 敏感数据处理
- ✅ 密码从不记录到日志
- ✅ Redis密码仅记录是否设置（布尔值）

---

## 总体评估

| 类别 | 评估 |
|------|------|
| 认证与访问控制 | 中等风险（H-001如被利用可完全绕过） |
| SQL注入 | 低风险（防护良好） |
| XSS | 低风险（防护良好） |
| 敏感数据 | 中等风险（H-002如被利用可泄露PII） |
| 外部交互 | 中等风险（M-001, M-002） |
| 基础设施 | 中等风险（配置默认值问题） |

**结论：** 建议优先修复 H-001 和 H-002，因为它们直接影响认证和数据安全。M-001 和 M-002 属于防御纵深，可作为第二优先级。

---

## 附录：验证方法

1. **JWT密钥检查**
   ```bash
   grep -n "jwt-secret" backend/src/main/resources/application.yml
   # 如果输出包含默认值，则存在漏洞
   ```

2. **PII密钥检查**
   ```bash
   grep -n "pii-encryption-key" backend/src/main/resources/application.yml
   # 如果输出包含默认值，则存在漏洞
   ```

3. **CORS配置检查**
   ```bash
   grep -A2 "allowed-origin-patterns" backend/src/main/resources/application.yml
   # 如果包含 192.168.* 或 10.* 则过于宽松
   ```

4. **数据库连接测试（勿在生产环境执行）**
   ```bash
   # 检查是否使用空密码
   env | grep DB_PASSWORD
   ```
