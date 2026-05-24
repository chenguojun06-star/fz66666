-- 模板库多租户隔离修复
-- 1. 将现有 tenant_id IS NULL 的种子模板复制给每个租户
-- 2. 删除旧的 tenant_id IS NULL 种子模板
-- 3. 修复唯一索引：从 (template_type, template_key) 改为 (tenant_id, template_type, template_key)

-- Step 1: 为每个租户复制种子模板（仅复制 tenant_id IS NULL 且 source_style_no IS NULL 的通用种子模板）
INSERT INTO t_template_library (id, template_type, template_key, template_name, source_style_no, template_content, locked, tenant_id, operator_name, create_time, update_time)
SELECT
    UUID() AS id,
    src.template_type,
    CONCAT(src.template_key, '_t', t.id) AS template_key,
    src.template_name,
    src.source_style_no,
    src.template_content,
    src.locked,
    t.id AS tenant_id,
    'system' AS operator_name,
    NOW() AS create_time,
    NOW() AS update_time
FROM t_template_library src
CROSS JOIN t_tenant t
WHERE src.tenant_id IS NULL
  AND src.source_style_no IS NULL
  AND (t.delete_flag = 0 OR t.delete_flag IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM t_template_library existing
    WHERE existing.template_type = src.template_type
      AND existing.template_key = CONCAT(src.template_key, '_t', t.id)
      AND existing.tenant_id = t.id
  );

-- Step 2: 为每个租户复制款号关联模板（source_style_no 非空的模板，按款号归属租户分配）
INSERT INTO t_template_library (id, template_type, template_key, template_name, source_style_no, template_content, locked, tenant_id, operator_name, create_time, update_time)
SELECT
    UUID() AS id,
    src.template_type,
    CONCAT(src.template_key, '_t', si.tenant_id) AS template_key,
    src.template_name,
    src.source_style_no,
    src.template_content,
    src.locked,
    si.tenant_id,
    'system' AS operator_name,
    NOW() AS create_time,
    NOW() AS update_time
FROM t_template_library src
JOIN t_style_info si ON si.style_no = src.source_style_no AND si.delete_flag = 0
WHERE src.tenant_id IS NULL
  AND src.source_style_no IS NOT NULL
  AND src.source_style_no != ''
  AND si.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM t_template_library existing
    WHERE existing.template_type = src.template_type
      AND existing.source_style_no = src.source_style_no
      AND existing.tenant_id = si.tenant_id
  );

-- Step 3: 删除旧的 tenant_id IS NULL 模板
DELETE FROM t_template_library WHERE tenant_id IS NULL;

-- Step 4: 修复唯一索引
-- 先删除旧的唯一索引（如果存在）
SET @exist_uk := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_template_library' AND INDEX_NAME = 'uk_type_key');
SET @sql_drop_uk = IF(@exist_uk > 0, 'ALTER TABLE t_template_library DROP INDEX uk_type_key', 'SELECT 1');
PREPARE stmt FROM @sql_drop_uk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 创建新的唯一索引（包含 tenant_id）
SET @exist_new_uk := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_template_library' AND INDEX_NAME = 'uk_tenant_type_key');
SET @sql_add_uk = IF(@exist_new_uk = 0, 'ALTER TABLE t_template_library ADD UNIQUE KEY uk_tenant_type_key (tenant_id, template_type, template_key)', 'SELECT 1');
PREPARE stmt FROM @sql_add_uk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
