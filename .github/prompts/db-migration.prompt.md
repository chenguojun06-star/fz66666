---
description: "Flyway 数据库变更模板：新增列/表/索引的标准流程"
mode: "agent"
tools: ["grep_search", "file_search", "read_file", "create_file", "run_in_terminal", "get_errors"]
---
# 数据库变更模板

## ⚠️ 铁则（CRITICAL — 违反 = 全系统 500）
- **NEVER 修改已执行过的 V*.sql 文件**（checksum 不匹配 → Flyway 拒绝启动 → 所有 API 500）。
- 发现旧脚本问题 → 创建新版本号脚本补偿，旧文件保持不变。

## 第一步：确认变更内容
- 要操作的表名和列名。
- 列类型、默认值、NULL/NOT NULL 约束。
- 是否需要索引？（高频查询字段组合）
- 是否需要回填数据？

## 第二步：编写 Flyway 脚本

**版本号格式**：`V{YYYYMMDDHHMM}__description.sql`（12 位时间戳，精确到分钟）

**ADD COLUMN 幂等模板**（必须使用，禁止裸 ALTER TABLE）：
```sql
-- 添加 xxx 列到 t_xxx 表
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_xxx' AND COLUMN_NAME='new_col') = 0,
  'ALTER TABLE `t_xxx` ADD COLUMN `new_col` VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```

**CRITICAL 禁止事项**：
- ❌ `SET @s = IF(... 'ALTER TABLE ... COMMENT ''text'''...)` — Flyway 会截断 SQL，列静默不添加。
- ❌ 裸 `ALTER TABLE ADD COLUMN`（不幂等，重复执行报错）。
- ✅ 字段注释写在 `.sql` 文件的行注释 `--` 里。

**CREATE TABLE 模板**：
```sql
CREATE TABLE IF NOT EXISTS `t_xxx` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT NOT NULL,
  -- 业务字段...
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `delete_flag` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

**CREATE INDEX 模板**（MySQL 8.0 不支持 DROP INDEX IF EXISTS）：
```sql
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_xxx' AND INDEX_NAME='idx_xxx') = 0,
  'CREATE INDEX `idx_xxx` ON `t_xxx` (`col1`, `col2`)',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```

## 第三步：同步 Entity
- 在对应 Entity 类添加匹配字段（类型映射正确）。
- 检查是否需要同步更新 `DbColumnRepairRunner`（高频表的新列应加入启动自愈名单）。
- 检查是否需要更新 `CoreSchemaPreflightChecker`（关键列加入预检白名单）。

## 第四步：验证
```bash
# 编译通过
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  /opt/homebrew/bin/mvn clean compile -q
# 确认脚本路径正确
ls -la backend/src/main/resources/db/migration/V*.sql | tail -5
```
- Entity 字段与 Flyway 列双向一致。
- 脚本幂等：可安全重复执行。
