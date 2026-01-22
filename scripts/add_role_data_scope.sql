-- 添加角色表缺失的 data_scope 字段
SET NAMES utf8mb4;

-- 检查字段是否存在，如果不存在则添加
ALTER TABLE t_role ADD COLUMN data_scope VARCHAR(20) DEFAULT 'ALL' COMMENT '数据权限范围';

-- 更新现有角色的数据权限
UPDATE t_role SET data_scope = 'ALL' WHERE data_scope IS NULL;

-- 验证结果
SELECT id, role_name, role_code, data_scope FROM t_role;
