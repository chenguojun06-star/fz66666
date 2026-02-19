-- ==========================================
-- 超级管理员体系初始化
-- 1. 创建平台租户"云裳智链"
-- 2. 添加 is_super_admin 字段
-- 3. 设置 admin 为超级管理员
-- ==========================================

-- Step 1: 创建云裳智链平台租户
INSERT INTO t_tenant (tenant_name, tenant_code, status, paid_status, max_users, create_time, update_time)
VALUES ('云裳智链', 'YUNSHANG_PLATFORM', 'active', 'paid', 9999, NOW(), NOW());

-- Step 2: 添加 is_super_admin 列
ALTER TABLE t_user ADD COLUMN is_super_admin TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否平台超级管理员(跨租户全局权限)' AFTER is_tenant_owner;

-- Step 3: 设置 admin 账号
UPDATE t_user
SET tenant_id       = (SELECT id FROM t_tenant WHERE tenant_code = 'YUNSHANG_PLATFORM'),
    is_tenant_owner = 1,
    is_super_admin  = 1
WHERE username = 'admin';

-- 验证
SELECT id, username, name, tenant_id, is_tenant_owner, is_super_admin FROM t_user WHERE username = 'admin';
SELECT id, tenant_name, tenant_code, status FROM t_tenant WHERE tenant_code = 'YUNSHANG_PLATFORM';
