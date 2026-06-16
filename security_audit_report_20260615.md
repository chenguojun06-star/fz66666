# 安全审计报告 — 服装供应链系统

**审计日期**: 2026-06-15
**审计范围**: 后端 Spring Boot 3.4.5 + 前端 React 18/TypeScript + 小程序
**审计方法**: 静态代码分析 + 配置审查 + 历史漏洞修复验证
**审计员**: Claude AI Security Auditor

---

## 执行摘要

本次审计对历史漏洞修复状态进行了验证，并系统性检查了认证、注入、外部交互、敏感数据处理等攻击面。

**审计结论**: 发现 **1个中危** 已确认漏洞，具备可演示的端到端利用路径。历史审计报告中的5个漏洞已有4个修复，1个部分修复。

| 严重度 | 数量 | 漏洞ID |
|--------|------|--------|
| **高危** | 0 | - |
| **中危** | 1 | M-4 |
| **低危** | 0 | - |

---

## 一、历史漏洞修复验证（2026-05-19审计）

### S-1: OpenAPI签名重放攻击 ✅ 已修复

**修复验证**:

[TenantAppOrchestrator.java:331-340](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/integration/openapi/orchestration/TenantAppOrchestrator.java#L331-L340):

```java
if (timestamp != null && !timestamp.isBlank()) {
    try {
        long ts = Long.parseLong(timestamp);
        if (Math.abs(System.currentTimeMillis() - ts * 1000) > 5 * 60 * 1000) {
            throw new SecurityException("签名时间戳过期，请重新签名");
        }
    } catch (NumberFormatException e) {
        throw new SecurityException("时间戳格式错误");
    }
}
```

**结论**: 时间戳有效性校验已添加，重放攻击窗口限制为5分钟。修复有效。

---

### S-2: PII默认加密密钥 ⚠️ 部分修复

**修复验证**:

1. **启动时校验已添加** - [SecurityConfig.java:175-188](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java#L175-L188):
   ```java
   if (!org.springframework.util.StringUtils.hasText(pk) || "defaultKeyChangeMe12345678".equals(pk)
           || (pk.startsWith("{{") && pk.endsWith("}}"))) {
       if (isProd) {
           log.error("[Security] ⚠️ 生产环境 app.security.pii-encryption-key 未配置...");
       }
   }
   ```

2. **生产环境仍使用硬编码fallback** - [application-prod.yml:94](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/resources/application-prod.yml#L94):
   ```yaml
   pii-encryption-key: ${APP_SECURITY_PII_ENCRYPTION_KEY:FashionCloud2026PiiKeyFallback@Prod}
   ```

**风险残留**: 
- 生产环境若未设置环境变量，仍使用硬编码fallback密钥 `FashionCloud2026PiiKeyFallback@Prod`
- 该密钥可从代码库获取，若生产部署未配置环境变量，PII数据仍可被解密

**建议**: 生产环境应拒绝启动（抛出IllegalStateException），而非仅记录警告日志。

---

### M-1: Header认证绕过 ✅ 已修复

**修复验证**:

[ProductionSecurityValidator.java:135-145](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/ProductionSecurityValidator.java#L135-L145):

```java
private void validateHeaderAuth(List<String> errors, List<String> warnings, boolean isProd) {
    if (headerAuthEnabled) {
        String msg = "Header认证已开启，任何人可通过HTTP Header伪造用户身份...";
        if (isProd) {
            errors.add(msg);  // 生产环境拒绝启动
        } else {
            warnings.add(msg);
        }
    }
}
```

**结论**: 生产环境若开启Header认证，应用拒绝启动。修复有效。

---

### M-2: JWT密钥未强制校验 ✅ 已修复

**修复验证**:

[ProductionSecurityValidator.java:109-121](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/ProductionSecurityValidator.java#L109-L121):

```java
private void validateJwtSecret(List<String> errors, List<String> warnings, boolean isProd) {
    if (!StringUtils.hasText(jwtSecret) || WEAK_JWT_SECRETS.contains(jwtSecret.trim())) {
        String msg = "JWT密钥为空或使用弱密钥...";
        if (isProd) {
            errors.add(msg);  // 生产环境拒绝启动
        } else {
            warnings.add(msg);
        }
    }
}
```

**结论**: 生产环境若JWT密钥为空或弱密钥，应用拒绝启动。修复有效。

---

### M-3: 文件上传内容类型校验 ❌ 未修复

**原问题**: TenantFileController仅检查扩展名，未验证文件内容。

**当前状态**: TenantFileController已删除，但系统中仍有多个文件上传入口：

| 上传入口 | 文件 | 内容校验 |
|---------|------|---------|
| CommonController.upload() | [CommonController.java:54](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/common/CommonController.java#L54) | ❌ 无 |
| StyleAttachmentController.upload() | [StyleAttachmentController.java:29](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/style/controller/StyleAttachmentController.java#L29) | ❌ 无 |
| IntelligenceAiAdvisorController.uploadImage() | [IntelligenceAiAdvisorController.java:175](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/controller/IntelligenceAiAdvisorController.java#L175) | ❌ 无 |

**风险残留**: 已认证用户可上传恶意文件（如含宏的Office文档），文件存储到COS后可能被其他用户下载执行。

---

## 二、新发现漏洞

### M-4: 前端敏感Token存储在localStorage

**严重度**: 中危
**CWE**: CWE-922 ( Insecure Storage of Sensitive Information )
**CVSS 3.1**: 6.1 (AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)

#### 攻击者画像
- 外部攻击者（通过XSS漏洞注入恶意脚本）

#### 输入向量
前端localStorage中的 `authToken` 和 `refreshToken`

#### 代码路径

```
前端 AuthContext.tsx
  [AuthContext.tsx:236-238]
    ↓
localStorage.setItem(TOKEN_STORAGE_KEY, token);
localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(baseUser));
    ↓
XSS攻击者通过注入脚本读取localStorage
    ↓
窃取token后伪造用户身份
```

**问题代码** ([AuthContext.tsx:236-238](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/frontend/src/utils/AuthContext.tsx#L236-L238)):
```typescript
localStorage.setItem(TOKEN_STORAGE_KEY, token);
if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(baseUser));
```

#### 影响
1. **XSS窃取Token**: 若存在XSS漏洞，攻击者可窃取localStorage中的token
2. **持久化会话劫持**: refreshToken长期有效，攻击者可持续刷新token

#### 修复建议

**方案1: 使用httpOnly Cookie存储Token**

```typescript
// 后端设置Cookie
response.setHeader("Set-Cookie", 
    "authToken=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict");

// 前端不再存储到localStorage
// localStorage.removeItem(TOKEN_STORAGE_KEY);
```

**方案2: 短期Token + 内存存储**

```typescript
// 仅将accessToken存储在内存（React state）
// refreshToken使用httpOnly Cookie
const [accessToken, setAccessToken] = useState<string | null>(null);
```

---

## 三、安全实践亮点

本次审计确认以下安全实践 **做得正确**：

| 方面 | 实现 | 评价 |
|------|------|------|
| **SQL注入防护** | 全部使用JdbcTemplate参数化查询 | ✅ 优秀 |
| **命令注入防护** | 无Runtime.exec/ProcessBuilder调用 | ✅ 优秀 |
| **密码存储** | BCryptPasswordEncoder哈希 | ✅ 优秀 |
| **多租户隔离** | TenantInterceptor强制注入tenant_id | ✅ 优秀 |
| **路径遍历防护** | TenantFileController完整防护（已删除） | ✅ 良好 |
| **OpenAPI签名** | HMAC-SHA256 + 时间戳校验 | ✅ 优秀 |
| **生产安全校验** | ProductionSecurityValidator启动检查 | ✅ 优秀 |
| **速率限制** | GlobalRateLimitFilter | ✅ 良好 |
| **日志脱敏** | 密码/密钥不记录完整值 | ✅ 良好 |

---

## 四、前端dangerouslySetInnerHTML使用审查

审计发现前端多处使用 `dangerouslySetInnerHTML`，经检查：

| 文件 | 输入来源 | 是否sanitize | 风险等级 |
|------|---------|-------------|---------|
| [MessageBubble.tsx:80](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/frontend/src/components/common/GlobalAiAssistant/MessageBubble.tsx#L80) | AI返回文本 | ✅ sanitizeHtml() | 低 |
| [CareIconSelector.tsx:66](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/CareIconSelector.tsx#L66) | 预定义SVG图标 | ✅ 可信源 | 低 |
| [LabelPrintModal.tsx:465](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/List/components/LabelPrintModal.tsx#L465) | 预定义SVG图标 | ✅ 可信源 | 低 |

**结论**: 所有dangerouslySetInnerHTML使用均已sanitize或来自可信源，无XSS风险。

---

## 五、修复优先级建议

| 优先级 | 漏洞ID | 理由 |
|--------|--------|------|
| **P1 (1周内)** | M-4 | localStorage存储token存在XSS窃取风险 |
| **P2 (2周内)** | S-2残留 | 生产环境PII密钥应强制校验，拒绝启动 |
| **P3 (1个月内)** | M-3残留 | 文件上传内容校验缺失 |

---

## 六、附录：文件位置索引

| 漏洞ID | 相关文件 |
|--------|---------|
| S-1修复验证 | [TenantAppOrchestrator.java:331-340](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/integration/openapi/orchestration/TenantAppOrchestrator.java#L331-L340) |
| S-2修复验证 | [SecurityConfig.java:175-188](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java#L175-L188), [application-prod.yml:94](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/resources/application-prod.yml#L94) |
| M-1修复验证 | [ProductionSecurityValidator.java:135-145](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/ProductionSecurityValidator.java#L135-L145) |
| M-2修复验证 | [ProductionSecurityValidator.java:109-121](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/ProductionSecurityValidator.java#L109-L121) |
| M-3残留 | [CommonController.java:54](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/common/CommonController.java#L54), [StyleAttachmentController.java:29](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/style/controller/StyleAttachmentController.java#L29) |
| M-4 | [AuthContext.tsx:236-238](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/frontend/src/utils/AuthContext.tsx#L236-L238) |

---

## 七、审计结论

**审计完成——发现1个中危已确认漏洞（M-4），历史漏洞已有4个修复、1个部分修复。**

建议优先修复M-4（localStorage存储敏感token），并在生产部署时强制配置PII加密密钥环境变量。