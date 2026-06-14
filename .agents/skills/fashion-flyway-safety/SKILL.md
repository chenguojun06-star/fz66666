---
name: fashion-flyway-safety
description: 服装供应链系统数据库迁移安全规范。当新增/修改 Flyway 迁移脚本（V*.sql）、新增 Entity 字段、修改表结构时必须遵循。违反会导致启动失败或云端数据不一致。
version: 1.0.0
---

# Flyway 迁移安全铁律

> 本 skill 浓缩自多次 Flyway 事故教训。改任何数据库结构前必须遵守。

## 1. 命名规范

```
V{yyyyMMdd}{序号}__{描述}.sql
```

**合法格式**：
- ✅ `V20260222__add_sample_status.sql` — 纯数字
- ✅ `V20260222.01__add_sample_status.sql` — 点号分隔
- ✅ `V1__init_schema.sql` — 简单数字

**禁止格式**（Flyway 10.x BigInteger 解析失败 → 迁移被跳过）：
- ❌ `V20260222b__add_sample_status.sql` — 字母后缀
- ❌ `V20260222_01__add_sample_status.sql` — 下划线分隔版本号

**注意**：`sql-migration-version-format` 属性已被 Flyway 10.x 移除，配置无效。

## 2. 幂等性（必须）

```sql
-- ✅ 正确：CREATE TABLE IF NOT EXISTS
CREATE TABLE IF NOT EXISTS t_new_table (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    ...
);

-- ✅ 正确：ADD COLUMN 用存储过程包裹（MySQL 不原生支持 IF NOT EXISTS）
DELIMITER //
CREATE PROCEDURE safe_add_column()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 't_order'
        AND column_name = 'new_field'
    ) THEN
        ALTER TABLE t_order ADD COLUMN new_field VARCHAR(100) DEFAULT NULL;
    END IF;
END //
DELIMITER ;
CALL safe_add_column();
DROP PROCEDURE IF EXISTS safe_add_column;
```

**为什么必须幂等**：
- 本地和云端各跑一次 Flyway，非幂等 SQL 第二次执行会报错
- 回滚重部署时，已执行的迁移会再次执行

## 3. 禁止修改已执行的 V*.sql

> **P0 铁律**：Flyway 用 checksum 校验文件完整性

```
修改已执行的 V*.sql
  → checksum 不匹配
  → Flyway 报 ValidateException
  → 应用启动失败
  → 全站不可用
```

**正确做法**：新增一个迁移脚本（如 `V20260614__fix_xxx.sql`），不要修改旧脚本。

## 4. SET @s 动态 SQL 陷阱

> **Flyway 静默失败**：不报错，但 SQL 不执行

```sql
-- ❌ 禁止：SET @s 动态 SQL 内包含字符串字面量
SET @s = CONCAT('ALTER TABLE t_order ADD COLUMN remark VARCHAR(200) COMMENT ''备注''');
-- Flyway 解析 COMMENT ''备注'' 时静默失败，列添加不成功

-- ❌ 禁止：DEFAULT 后跟字符串字面量
SET @s = CONCAT('ALTER TABLE t_order ADD COLUMN status VARCHAR(20) DEFAULT ''ACTIVE''');
-- 同样静默失败

-- ✅ 正确：字符串字面量用变量替代
SET @col_comment = '备注';
SET @default_val = 'ACTIVE';
SET @s = CONCAT('ALTER TABLE t_order ADD COLUMN remark VARCHAR(200)');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

## 5. PREPARE + DEFAULT NULL 陷阱

> **MySQL 8.0 报 ERROR 1064**

```sql
-- ❌ 禁止：PREPARE + DEFAULT NULL（MySQL 8.0 语法错误）
SET @s = 'ALTER TABLE t_order ADD COLUMN new_field VARCHAR(100) DEFAULT NULL';
PREPARE stmt FROM @s;
EXECUTE stmt;

-- ✅ 正确：不加 DEFAULT NULL（MySQL 默认就是 NULL）
SET @s = 'ALTER TABLE t_order ADD COLUMN new_field VARCHAR(100)';
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

## 6. Entity 字段 ↔ DB 列必须一一对应

```java
// ❌ 禁止：Entity 有字段但 DB 无对应列
@TableField("sample_review_status")
private String sampleReviewStatus;
// 如果 t_order 表没有 sample_review_status 列 → 云端 Unknown column → 500

// ✅ 正确：每个 @TableField 必须有对应 Flyway 迁移
// 1. 先写 V20260614__add_sample_review_status.sql
// 2. 再加 Entity 字段
```

**推送前验证**：
```bash
grep -r "${新列名}" db/migration/  # 必须有结果
```

## 7. VIEW 修改必须走 Flyway

| 路径 | 云端执行 | 本地执行 |
|------|:--:|:--:|
| Flyway V*.sql `CREATE OR REPLACE VIEW` | ✅ | ✅ |
| ViewMigrator.java | ❌ 不跑 | ✅ |
| DbViewRepairHelper.java | ❌ 不跑 | ✅ |

**结论**：VIEW 修改必须走 Flyway `CREATE OR REPLACE VIEW`，不能只改 ViewMigrator/DbViewRepair。

**原因**：云端只跑 Flyway，ViewMigrator 和 DbViewRepair 在云端不执行。只改这两个文件 → 云端 VIEW 不更新 → 数据不一致。

## 8. 推送前必须跑校验脚本

```bash
python3 scripts/check-flyway-sql.py
```

**校验内容**：
- 版本号格式是否合法（无字母后缀）
- 是否有 SET @s + 字符串字面量
- 是否有 PREPARE + DEFAULT NULL
- 是否有重复版本号
- 是否修改了已执行的迁移

## 9. 云端兼容：TINYINT(1) 驱动类型差异

> **本地正常，云端 ClassCastException**

```java
// ❌ 云端 Connector/J 8.x 返回 Boolean 而非 Integer
Integer success = (Integer) row.get("success");

// ✅ 兼容所有驱动版本
Object successObj = row.get("success");
Integer success = null;
if (successObj instanceof Boolean) { success = ((Boolean) successObj) ? 1 : 0; }
else if (successObj instanceof Integer) { success = (Integer) successObj; }
else if (successObj instanceof Number) { success = ((Number) successObj).intValue(); }
```

**原因**：MySQL Connector/J 8.x 将 `TINYINT(1)` 映射为 `Boolean`，而非 `Integer`。本地可能用旧版驱动正常，云端新版驱动报错。

## 10. 改 Flyway 代码前自检清单

- [ ] 迁移脚本命名是否合法？（纯数字或点号分隔，无字母后缀）
- [ ] SQL 是否幂等？（CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS）
- [ ] 是否修改了已执行的 V*.sql？（绝对禁止）
- [ ] SET @s 动态 SQL 中是否有字符串字面量？（禁止 COMMENT ''xxx'' / DEFAULT ''字符串''）
- [ ] PREPARE + DEFAULT NULL？（MySQL 8.0 报错，去掉 DEFAULT NULL）
- [ ] 新增 Entity 字段是否有对应 Flyway 迁移？
- [ ] VIEW 修改是否走了 Flyway？（不能只改 ViewMigrator）
- [ ] 是否涉及 TINYINT(1) 类型？（需 instanceof 多分支处理）
- [ ] 推送前是否跑了 `python3 scripts/check-flyway-sql.py`？
- [ ] 本地 ALTER TABLE 是否走了 Flyway？（禁止手动 docker exec 改生产库）
