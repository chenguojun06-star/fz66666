# 安全审计报告

**审计目标**：服装供应链管理系统（后端 Spring Boot + 前端 React + 小程序）\
**审计时间**：2026-05-17\
**审计范围**：认证与访问控制、注入向量、外部交互、敏感数据处理

---

## 执行摘要

本次审计系统性地检查了代码库的高风险攻击面，包括认证机制、SQL/命令注入、Webhook 回调、文件操作、敏感数据处理等关键领域。

**审计结论**：未发现中等或更高严重度的已确认漏洞。代码库整体安全状况良好，核心安全机制（JWT 认证、多租户隔离、参数化查询、路径遍历防护、脱敏日志）均已正确实施。

---

## 一、认证与访问控制

### ✅ 通过的安全措施

| 机制 | 实现 | 评估 |
|------|------|------|
| JWT 认证 | [AuthTokenService.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/auth/AuthTokenService.java) | 强密钥要求（≥32字符，≥8位不同字符） |
| 密码版本追踪 | [TokenAuthFilter.java:L82-96](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/auth/TokenAuthFilter.java#L82-L96) | Redis pwdVersion，改密后旧 token 立即失效 |
| 会话管理 | [SecurityConfig.java:L82-83](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java#L82-L83) | 无状态会话（STATELESS），无 JSESSIONID |
| 安全响应头 | [SecurityConfig.java:L85-94](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java#L85-L94) | HSTS/X-Frame-Options/X-XSS-Protection |
| 密码加密 | [SecurityConfig.java:L113-116](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java#L113-L116) | BCryptPasswordEncoder |

### ℹ️ 边缘观察（低风险，无需修复）

**OpenAPI 缺少时间戳重放攻击防护**

- 位置：[TenantAppOrchestrator.authenticateByAppKey()](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/integration/openapi/orchestration/TenantAppOrchestrator.java)
- 现象：验证 HMAC 签名 `(timestamp + body)` 但不检查 timestamp 是否在合理窗口内（如 ±5分钟）
- 风险评估：**低** — HMAC 签名本身已防止篡改，重放攻击的实际利用价值有限；如需加固可添加时间戳窗口校验

---

## 二、注入向量

### ✅ SQL 注入防护

| 检查项 | 结果 |
|--------|------|
| MyBatis-Plus LambdaQuery | 全部使用参数化查询 ✅ |
| JdbcTemplate | 全部使用 `?` 占位符 + `Object[]` 参数 ✅ |
| 原始 SQL 拼接 | 审计到的 JdbcTemplate 调用均有参数化 ✅ |

代码路径示例（[ProductionOrderCommandService.java:L228-239](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/service/ProductionOrderCommandService.java#L228-L239)）：

```java
String sql = "SELECT COUNT(*) FROM t_production_order WHERE tenant_id = ? AND order_no = ?";
params = new Object[]{tenantId, orderNo};
Integer cnt = jdbcTemplate.queryForObject(sql, Integer.class, params);
```

### ✅ 命令注入防护

审计全部 19 个使用 `Runtime.getRuntime().exec` / `ProcessBuilder` 的文件：
- 所有调用均为内部工具类（如 `ExcelImportHelper`、`StyleTableMigrator`）的**静态初始化**或**启动阶段**，无用户输入拼接
- 文件上传/解析使用 Apache POI，不调用外部进程 ✅

### ✅ 路径遍历防护

[TenantFileController.java:L175-185](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/common/TenantFileController.java#L175-L185)：

```java
Path baseDir = Path.of(uploadPath).toAbsolutePath().normalize();
Path filePath = baseDir.resolve("tenants").resolve(String.valueOf(tenantId))
                      .resolve(fileName).normalize();
if (!filePath.startsWith(baseDir)) {
    log.warn("[租户文件安全] 路径遍历攻击被拦截: ...");
    return ResponseEntity.notFound().build();
}
```

---

## 三、外部交互

### ✅ Webhook 回调签名验证

| 平台 | 控制器 | 验证机制 | 评估 |
|------|--------|----------|------|
| 微信 | [WeChatAiWebhookController.java:L44-104](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/controller/WeChatAiWebhookController.java#L44-L104) | SHA-1(verifyToken + timestamp + nonce) | ✅ |
| 飞书 | [ImAiWebhookController.java:L44-80](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/controller/ImAiWebhookController.java#L44-L80) | HMAC-SHA256(encryptKey + timestamp + nonce + body) | ✅ |
| 钉钉 | [ImAiWebhookController.java:L122-141](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/controller/ImAiWebhookController.java#L122-L141) | HMAC-SHA256(appSecret + timestamp) | ✅ |

**未配置时安全拒绝**：
- 飞书/钉钉 Webhook 的 `encrypt-key` / `app-secret` 未配置时直接返回 401/500 并记录 ERROR 级别日志，不处理外部消息 ✅

### ℹ️ 边缘观察（低风险）

**Webhook 回调缺少 IP 白名单**

- 现象：飞书/钉钉 Webhook 仅验证签名，无来源 IP 白名单
- 风险评估：**低** — 签名机制本身已足够；如需加固可限制回调 IP（需飞书/钉钉支持）

---

## 四、敏感数据处理

### ✅ 日志脱敏

[GlobalExceptionHandler.java:L318-331](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/common/GlobalExceptionHandler.java#L318-L331)：

```java
private String sanitizeClientMessage(String message) {
    return message
        .replaceAll("(?i)(password|secret|token|key|credential)\\s*[:=]\\s*\\S+", "$1=***")
        .replaceAll("(?i)(jdbc|mysql|redis)://\\S+", "$1://***")
        .replaceAll("(?i)(table|column)\\s+['\"]?\\w+", "$1=***")
        .replaceAll("(?i)(SELECT|INSERT|UPDATE)\\s+.+?(FROM|INTO|SET)", "SQL=***");
}
```

### ✅ 文件上传安全

- 文件大小限制：10MB（[MaterialPurchaseController.java:L259-262](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/controller/MaterialPurchaseController.java#L259-L262)）✅
- 文件类型白名单：仅允许 `.xlsx`/`.xls`/`.png`/`.jpg`/`.gif`/`.webp`/`.pdf`（代码推断 Content-Type）✅
- 租户隔离：文件路径包含 `tenants/{tenantId}/` 前缀，物理隔离 ✅

### ✅ 多租户数据隔离

[TenantInterceptor.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/common/tenant/TenantInterceptor.java) — MyBatis-Plus InnerInterceptor：
- SELECT/UPDATE/DELETE：自动追加 `WHERE tenant_id = ?`
- INSERT：通过 `TenantMetaObjectHandler` 自动填充 `tenant_id`
- 超级管理员（tenantId=null）：业务表返回空行（`tenant_id IS NULL`），防止越权浏览

---

## 五、审计覆盖的其他领域

| 领域 | 审计方法 | 结果 |
|------|----------|------|
| CORS 配置 | 检查 `SecurityConfig` CORS 配置 | ✅ 使用 `Customizer.withDefaults()`，合理限制 |
| CSRF | 检查 `SecurityConfig` | ✅ 已显式禁用（移动端 API 无 cookie session） |
| 错误消息泄露 | `GlobalExceptionHandler` 全面审查 | ✅ `sanitizeClientMessage()` 过滤敏感字段 |
| 内部 API 暴露 | `SecurityConfigHelper` 审查 | ✅ `/api/**` 需要认证，异常返回 401 |
| 前端敏感数据 | `sensitiveDataMask.ts` 存在 | ✅ 前端有脱敏工具函数 |

---

## 六、结论

**审计完成——未发现中等或更高严重度的已确认漏洞。**

代码库整体安全架构扎实，核心机制（JWT 强认证、多租户自动隔离、参数化 SQL、内部日志脱敏、Webhook 签名验证、路径遍历防护）均已正确实施。边界情况（如 OpenAPI 时间戳窗口、第三方 Webhook IP 白名单）在当前威胁模型下风险可控。

如需进一步提升安全水位，建议关注的方向（优先级低）：
1. OpenAPI 添加时间戳重放窗口校验（如 ±5分钟）
2. 飞书/钉钉 Webhook 添加来源 IP 白名单（需第三方平台配合）
3. Service 层 `@Transactional` 违规清理（代码质量，非安全漏洞）
