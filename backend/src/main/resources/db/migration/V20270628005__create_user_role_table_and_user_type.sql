-- ================================================================
-- V20270628005: 一人多角色支持 + 外部账号统一标识
--
-- 背景：
--   P0 缺陷修复：
--   1. 用户只支持单一角色（User.roleId 单字段）→ 引入 t_user_role 关联表
--   2. 外部账号体系分裂（工厂在 t_user，供应商在 t_supplier_user）→ t_user 加 user_type 统一标识
--
-- 策略：
--   1. 新建 t_user_role 关联表（支持一人多角色）
--   2. 给 t_user 加 user_type 字段（INTERNAL/EXTERNAL_FACTORY/SUPPLIER），默认 INTERNAL
--   3. 给 t_user 加 employment_status 字段（ACTIVE/TRANSFERRED/RESIGNED/ARCHIVED）兜底
--   4. 数据回填：现有 factory_id 非空的用户 → EXTERNAL_FACTORY
--   5. 不破坏现有 roleId 字段（向后兼容，过渡期双轨）
--
-- 幂等性：所有操作前用 INFORMATION_SCHEMA 检查
-- ================================================================

SET @dbname = DATABASE();

-- ----------------------------------------------------------------
-- 1. 新建 t_user_role 关联表（一人多角色）
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_user_role (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）',
    user_id BIGINT NOT NULL COMMENT '用户ID（t_user.id）',
    role_id BIGINT NOT NULL COMMENT '角色ID（t_role.id）',
    is_primary TINYINT(1) DEFAULT 0 COMMENT '是否主角色（1=主，0=兼）',
    effective_from DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '生效时间',
    expire_time DATETIME DEFAULT NULL COMMENT '失效时间（NULL=永久，临时角色必填）',
    source VARCHAR(32) DEFAULT 'manual' COMMENT '授权来源：manual/jit/template',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag TINYINT(1) DEFAULT 0 COMMENT '软删除：0正常1已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_role (tenant_id, user_id, role_id),
    KEY idx_user_role_user (tenant_id, user_id),
    KEY idx_user_role_role (tenant_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户-角色关联表（一人多角色）';

-- ----------------------------------------------------------------
-- 2. t_user 加 user_type 字段（内部/外发工厂/供应商 统一标识）
--    说明：动态 SQL 内禁止字符串字面量（P0 铁律 #1 Flyway 会截断）
--    因此先加无 DEFAULT 无 COMMENT 的列，再独立 UPDATE 回填默认值
-- ----------------------------------------------------------------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_user' AND COLUMN_NAME='user_type');
SET @s = IF(@c=0, 'ALTER TABLE t_user ADD COLUMN user_type VARCHAR(20) AFTER factory_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 3. t_user 加 employment_status 字段（在职/调岗/离职/归档 状态机兜底）
--    注：t_user 已有 employment_status 字段（V202705141000 等历史迁移可能已加），
--    这里仅兜底确保存在；若已存在则跳过
--    说明：动态 SQL 内禁止字符串字面量，先加无 DEFAULT 无 COMMENT 的列
-- ----------------------------------------------------------------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_user' AND COLUMN_NAME='employment_status');
SET @s = IF(@c=0, 'ALTER TABLE t_user ADD COLUMN employment_status VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 4. 数据回填：现有 factory_id 非空的用户标记为 EXTERNAL_FACTORY
-- ----------------------------------------------------------------
UPDATE t_user SET user_type = 'EXTERNAL_FACTORY'
WHERE factory_id IS NOT NULL AND factory_id != ''
AND (user_type IS NULL OR user_type = 'INTERNAL' OR user_type = '');

-- ----------------------------------------------------------------
-- 5. 数据回填：将现有 t_user.roleId 迁移到 t_user_role（保持主角色标记）
--    这样过渡期 roleId 字段和 t_user_role 表双轨并行，向后兼容
-- ----------------------------------------------------------------
INSERT INTO t_user_role (tenant_id, user_id, role_id, is_primary, source)
SELECT tenant_id, id, role_id, 1, 'manual'
FROM t_user
WHERE role_id IS NOT NULL
AND delete_flag = 0
AND NOT EXISTS (
    SELECT 1 FROM t_user_role ur
    WHERE ur.user_id = t_user.id AND ur.role_id = t_user.role_id
    AND ur.delete_flag = 0
);

-- ----------------------------------------------------------------
-- 6. 兜底：所有未设置 user_type 的用户标记为 INTERNAL
-- ----------------------------------------------------------------
UPDATE t_user SET user_type = 'INTERNAL'
WHERE user_type IS NULL OR user_type = '';

-- ----------------------------------------------------------------
-- 7. 兜底：所有未设置 employment_status 的用户标记为 ACTIVE
-- ----------------------------------------------------------------
UPDATE t_user SET employment_status = 'ACTIVE'
WHERE employment_status IS NULL OR employment_status = '';
