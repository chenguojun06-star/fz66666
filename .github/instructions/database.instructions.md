---
applyTo: "backend/src/main/resources/db/migration/**"
---

# 数据库迁移域指令（Flyway V*.sql）

> 仅在编辑 `db/migration/` 下 Flyway 脚本时激活。

---

## 🔴 铁则：禁止修改已执行过的脚本

Flyway 对 `flyway_schema_history` 做 checksum 校验。改一个空格 → checksum 不匹配 → Spring Boot 不启动 → **全 API 500**。

- ✅ 发现问题 → 创建**新版本号**补偿脚本。
- ❌ 禁止编辑任何已推送到 main 且部署过的 `V*.sql`。

---

## 版本号命名（强制，2026-05 起）

```
V{YYYYMMDDHHMM}__description.sql
```

示例：`V202605101430__add_style_tags.sql`（2026-05-10 14:30 创建）

- 12 位时间戳精确到分钟，天然唯一。
- ❌ 旧格式 `V{YYYYMMDDNNN}`（日期 + 3 位序号）禁止新增。

---

## 幂等写法（强制）

### CREATE TABLE

```sql
CREATE TABLE IF NOT EXISTS `t_xxx` (...);
```

### ADD COLUMN（MySQL 8.0 无 IF NOT EXISTS 语法）

```sql
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_xxx' AND COLUMN_NAME='col_name') = 0,
  'ALTER TABLE `t_xxx` ADD COLUMN `col_name` VARCHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```

### 🚨 禁止在 SET @s 动态 SQL 中使用 COMMENT

```sql
-- ❌ Flyway 会把 '' 当作字符串结束符，导致 ALTER TABLE 被截断（Silent failure!）
SET @s = IF(..., 'ALTER TABLE `t_xxx` ADD COLUMN `col` VARCHAR(64) COMMENT ''说明''', 'SELECT 1');

-- ✅ 字段注释写在文件行注释里
-- col: 说明
SET @s = IF(..., 'ALTER TABLE `t_xxx` ADD COLUMN `col` VARCHAR(64) NULL', 'SELECT 1');
```

---

## Entity 同步核查（双向）

- ✅ 新增 Entity 字段 → 必须有对应 Flyway ADD COLUMN。
- ✅ 新增 Flyway 列 → 必须有对应 Entity 字段。
- push 前必须 grep Entity 与 migration 目录交叉核对。

---

## 云端部署

- `FLYWAY_ENABLED=true`（cloudbaserc.json）。
- push 到 main → Flyway 自动执行，无需手动控制台 SQL。
- 脚本失败 → Spring Boot 不启动 → 新接口 404（旧容器继续服务）。

---

## NOT NULL 约束

- `NOT NULL` 列必须指定 `DEFAULT` 值。
- 否则 MySQL STRICT_TRANS_TABLES 下 INSERT NULL → 500。
