---
name: fashion-cloud-traps
description: 服装供应链系统云端部署兼容性陷阱集。当编写涉及环境变量读取、MySQL 类型转换、JWT 配置、Java 静态初始化的代码时必须检查。这些陷阱本地正常但云端必崩。
version: 1.0.0
---

# 云端兼容性陷阱

> 本 skill 收录所有"本地正常、云端必崩"的陷阱。写任何可能涉及云端运行的代码前必须检查。

## 1. System.getenv() 云端返回 null

> **本地正常，云端 NPE**

```java
// ❌ 错误写法：System.getenv() 返回的 Map 在云端可能不含该 key
// Map.getOrDefault() 在 key 不存在时返回默认值，但 System.getenv() 本身可能返回 null
String apiUrl = System.getenv().getOrDefault("API_URL", "http://localhost:8088");
// 云端：System.getenv() 返回的 Map 中无 "API_URL" → 返回默认值 ✓
// 但如果 System.getenv() 返回 null → NPE ✗

// ❌ 更危险的写法
Map<String, String> env = System.getenv();
String apiUrl = env.get("API_URL");  // 云端可能返回 null

// ✅ 正确写法：null 安全
String value = System.getenv("API_URL");
String apiUrl = value != null ? value : "http://localhost:8088";

// ✅ 或使用 Optional
String apiUrl = Optional.ofNullable(System.getenv("API_URL"))
    .orElse("http://localhost:8088");
```

**规则**：所有环境变量读取必须做 null 检查，不能假设环境变量一定存在。

## 2. MySQL TINYINT(1) 驱动类型差异

> **本地正常，云端 ClassCastException**

```java
// ❌ 错误写法：云端 Connector/J 8.x 将 TINYINT(1) 映射为 Boolean
Integer success = (Integer) row.get("success");
// 云端：ClassCastException: class java.lang.Boolean cannot be cast to class java.lang.Integer

// ✅ 正确写法：instanceof 多分支处理
Object successObj = row.get("success");
Integer success = null;
if (successObj instanceof Boolean) {
    success = ((Boolean) successObj) ? 1 : 0;
} else if (successObj instanceof Integer) {
    success = (Integer) successObj;
} else if (successObj instanceof Number) {
    success = ((Number) successObj).intValue();
}
```

**原因**：MySQL Connector/J 8.x 配置 `tinyInt1isBit=true`（默认），将 `TINYINT(1)` 映射为 `Boolean`。本地可能用旧版驱动正常，云端新版驱动报错。

**影响范围**：所有直接从 `Map<String, Object>` 读取 `TINYINT(1)` 列的代码（如原生 SQL 查询结果）。

## 3. jwt-secret 无默认值导致启动失败

> **本地有环境变量正常，云端未设置 → 启动失败**

```yaml
# ❌ 错误写法：空默认值
jwt:
  secret: ${JWT_SECRET:}
# 云端 JWT_SECRET 未设置 → secret 为空字符串 → 签名失败 → 启动失败

# ✅ 正确写法：有开发环境默认值
jwt:
  secret: ${JWT_SECRET:ThisIsA_LocalJwtSecret_OnlyForDev_0123456789}
```

**规则**：所有 Spring Boot 配置中引用环境变量的地方，必须提供非空默认值。

## 4. Java 静态 Map 重复 key

> **本地可能不报错（取决于 JVM），云端类初始化失败 → 启动失败**

```java
// ❌ 错误写法：Map.of() 重复 key → IllegalArgumentException
private static final Map<String, String> STAGE_MAP = Map.of(
    "裁床", "cutting",
    "裁床", "cutting_table"  // 重复 key "裁床"
);
// 运行时：IllegalArgumentException: duplicate key: 裁床
// 类初始化失败 → Bean 创建失败 → 应用启动失败

// ✅ 正确写法：每个 key 唯一
private static final Map<String, String> STAGE_MAP = Map.of(
    "裁床", "cutting",
    "裁床台", "cutting_table"  // 不同 key
);

// ✅ 或使用 Map.ofEntries
private static final Map<String, String> STAGE_MAP = Map.ofEntries(
    Map.entry("裁床", "cutting"),
    Map.entry("裁床台", "cutting_table")
);
```

## 5. Flyway 版本号格式

> **本地可能跳过不报错，云端迁移被跳过 → 数据不一致**

```sql
-- ✅ 正确：纯数字
V1__init_schema.sql
V20260222__add_sample_status.sql

-- ✅ 正确：点号分隔
V20260222.01__add_sample_status.sql

-- ❌ 错误：字母后缀（Flyway 10.x BigInteger 解析失败）
V20260222b__add_sample_status.sql
-- Flyway 尝试将 "20260222b" 解析为 BigInteger → 失败 → 迁移被跳过
-- 不报错，但 SQL 不执行 → 表结构不完整

-- ❌ 错误：sql-migration-version-format 配置无效
-- Flyway 10.x 已移除该属性，配置无效
```

## 6. VIEW 修改只改 ViewMigrator 不改 Flyway

> **本地正常（ViewMigrator 执行），云端 VIEW 不更新**

| 路径 | 云端执行 | 本地执行 |
|------|:--:|:--:|
| Flyway V*.sql `CREATE OR REPLACE VIEW` | ✅ | ✅ |
| ViewMigrator.java | ❌ 不跑 | ✅ |
| DbViewRepairHelper.java | ❌ 不跑 | ✅ |

```sql
-- ❌ 只改 ViewMigrator.java → 云端 VIEW 不更新
-- ✅ 必须走 Flyway
CREATE OR REPLACE VIEW v_order_progress AS
SELECT ...
```

## 7. 本地 ALTER TABLE 无 Flyway

> **本地手动改了表结构，云端 Unknown column → 500**

```bash
# ❌ 禁止：手动改生产库
docker exec mysql -e "ALTER TABLE t_order ADD COLUMN new_field VARCHAR(100);"

# ✅ 正确：通过 Flyway 迁移
# 创建 V20260614__add_order_new_field.sql
# 推送后 Flyway 自动执行
```

**后果**：本地正常（字段存在），云端报 `Unknown column 'new_field'` → 500 错误。

## 8. 部署后全站 404 白屏

> **SPA 路由 + CDN 缓存 = 白屏**

```html
<!-- ✅ 正确：错误恢复代码必须内联在 index.html <head> 中 -->
<head>
  <script>
    // 内联错误恢复：检测 JS 加载失败，自动刷新
    window.addEventListener('error', function(e) {
      if (e.target && e.target.tagName === 'SCRIPT') {
        localStorage.setItem('js_load_error', Date.now());
        location.reload();
      }
    }, true);
  </script>
</head>
```

**nginx 配置**：
```nginx
# ✅ JS/CSS 返回 404，不返回 index.html
location @spa_fallback {
    if ($uri ~* \.(js|css)$) { return 404; }
    try_files /index.html =404;
    add_header Cache-Control "no-cache, no-store";
}
```

## 9. JacksonConfig Long→String 计数拼接

> **Long 类型序列化为 String 后，前端拼接计数出错**

```java
// ❌ JacksonConfig 将 Long 序列化为 String
// 后端返回：{ "total": "123" }  // String
// 前端拼接：total + 1 = "1231"  // 字符串拼接，不是数字加法

// ✅ 正确：计数类字段返回 int
public class PageResult<T> {
    private int total;  // 用 int，不用 Long
    private List<T> records;
}

// ✅ 前端防御：Number() 包裹
const total = Number(response.total);
```

## 10. 陷阱速查表

| # | 陷阱 | 本地表现 | 云端表现 | 预防 |
|---|------|---------|---------|------|
| 1 | System.getenv() 返回 null | 正常（有环境变量） | NPE | null 检查 |
| 2 | TINYINT(1) 类型差异 | 正常（旧驱动） | ClassCastException | instanceof 多分支 |
| 3 | jwt-secret 无默认值 | 正常（有环境变量） | 启动失败 | 非空默认值 |
| 4 | 静态 Map 重复 key | 可能不报错 | 启动失败 | 每个 key 唯一 |
| 5 | Flyway 字母后缀 | 可能跳过 | 迁移被跳过 | 纯数字/点号分隔 |
| 6 | VIEW 只改 ViewMigrator | 正常（本地执行） | VIEW 不更新 | 走 Flyway |
| 7 | 本地 ALTER 无 Flyway | 正常（字段存在） | Unknown column 500 | Flyway 迁移 |
| 8 | 部署后白屏 | 正常 | 404 白屏 | 内联错误恢复 |
| 9 | Long→String 计数拼接 | 正常 | 计数错误 | 用 int / Number() |
