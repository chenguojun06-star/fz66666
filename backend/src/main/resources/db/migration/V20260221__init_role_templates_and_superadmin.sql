-- =====================================================================
-- 补齐云端缺失的基础数据：角色模板 + 超管账号
-- 问题：V20260209__role_template_permission_system.sql 在 backend/sql/ 目录
--       未被纳入 Flyway 迁移，导致云端缺失 full_admin 角色模板，
--       审批通过时 createTenantAdminRole 抛出异常，租户账号无法创建。
-- 安全：全部使用幂等写法，已存在则跳过，不影响本地环境。
-- 日期：2026-02-21
-- =====================================================================

-- ----------------------------------------------------------------
-- 1. 确保 t_role 有 is_template 列（旧结构可能没有）
-- ----------------------------------------------------------------
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 't_role'
  AND COLUMN_NAME  = 'is_template';

SET @sql = IF(@col_exists = 0,
    "ALTER TABLE `t_role` ADD COLUMN `is_template` TINYINT(1) DEFAULT 0 COMMENT '是否为角色模板(1=模板,0=租户角色)'",
    "SELECT 'is_template column already exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 2. 确保 t_role 有 source_template_id 列
-- ----------------------------------------------------------------
SET @col2 = 0;
SELECT COUNT(*) INTO @col2
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 't_role'
  AND COLUMN_NAME  = 'source_template_id';

SET @sql2 = IF(@col2 = 0,
    "ALTER TABLE `t_role` ADD COLUMN `source_template_id` BIGINT DEFAULT NULL COMMENT '来源模板角色ID'",
    "SELECT 'source_template_id column already exists'"
);
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 3. 确保 t_user 有 is_super_admin 列
-- ----------------------------------------------------------------
SET @col3 = 0;
SELECT COUNT(*) INTO @col3
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 't_user'
  AND COLUMN_NAME  = 'is_super_admin';

SET @sql3 = IF(@col3 = 0,
    "ALTER TABLE `t_user` ADD COLUMN `is_super_admin` TINYINT(1) DEFAULT 0 COMMENT '是否超级管理员'",
    "SELECT 'is_super_admin column already exists'"
);
PREPARE stmt FROM @sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 4. 确保 t_user 有 is_tenant_owner 列
-- ----------------------------------------------------------------
SET @col4 = 0;
SELECT COUNT(*) INTO @col4
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 't_user'
  AND COLUMN_NAME  = 'is_tenant_owner';

SET @sql4 = IF(@col4 = 0,
    "ALTER TABLE `t_user` ADD COLUMN `is_tenant_owner` TINYINT(1) DEFAULT 0 COMMENT '是否租户主账号'",
    "SELECT 'is_tenant_owner column already exists'"
);
PREPARE stmt FROM @sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 5. 确保 t_user 有 approval_status 列
-- ----------------------------------------------------------------
SET @col5 = 0;
SELECT COUNT(*) INTO @col5
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 't_user'
  AND COLUMN_NAME  = 'approval_status';

SET @sql5 = IF(@col5 = 0,
    "ALTER TABLE `t_user` ADD COLUMN `approval_status` VARCHAR(20) DEFAULT 'approved' COMMENT '审批状态: pending/approved/rejected'",
    "SELECT 'approval_status column already exists'"
);
PREPARE stmt FROM @sql5; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 6. 插入 full_admin 角色模板（已存在则跳过）
--    role_code='full_admin', is_template=1, tenant_id=NULL
-- ----------------------------------------------------------------
INSERT INTO t_role (role_name, role_code, description, status, is_template, tenant_id, sort_order)
SELECT '全能管理', 'full_admin', '全部权限，适用于租户主账号', 'active', 1, NULL, 1
WHERE NOT EXISTS (
    SELECT 1 FROM t_role WHERE role_code = 'full_admin' AND is_template = 1
);

-- ----------------------------------------------------------------
-- 7. 将已有 role_code='full_admin' 但 is_template=0 的记录标记为模板
--    （兼容本地环境通过 V20260209 脚本更新的情况）
-- ----------------------------------------------------------------
UPDATE t_role
SET is_template = 1, tenant_id = NULL
WHERE role_code = 'full_admin'
  AND is_template = 0
  AND tenant_id IS NULL;

-- ----------------------------------------------------------------
-- 8. 为 full_admin 模板批量绑定所有权限（如果尚未绑定）
--    这样新租户审批通过后拥有完整权限
-- ----------------------------------------------------------------
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'full_admin'
  AND r.is_template = 1
  AND p.status = 'ENABLED'
  AND NOT EXISTS (
      SELECT 1 FROM t_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ----------------------------------------------------------------
-- 9. 确保超级管理员账号存在
--    初始密码明文 "admin@2026"（系统首次登录时自动升级为 BCrypt）
--    如果已有 is_super_admin=1 的账号则跳过，不重复创建
-- ----------------------------------------------------------------
INSERT INTO t_user (username, password, name, status, is_super_admin, is_tenant_owner, approval_status, role_name, permission_range)
SELECT
    'superadmin',
    'admin@2026',
    '超级管理员',
    'active',
    1,
    0,
    'approved',
    'superadmin',
    'all'
WHERE NOT EXISTS (
    SELECT 1 FROM t_user WHERE is_super_admin = 1
);
