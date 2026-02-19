-- 添加用户工厂关联字段
-- 用于实现多工厂数据隔离

-- 1. 为用户表添加 factory_id 字段
ALTER TABLE t_user
ADD COLUMN factory_id VARCHAR(50) COMMENT '所属工厂ID' AFTER role_name;

-- 2. 为用户表添加索引
ALTER TABLE t_user
ADD INDEX idx_factory_id (factory_id);

-- 3. 示例：将现有用户分配到工厂
-- UPDATE t_user SET factory_id = '工厂A的ID' WHERE username IN ('user1', 'user2');
-- UPDATE t_user SET factory_id = '工厂B的ID' WHERE username IN ('user3', 'user4');

-- 4. 创建数据权限级别说明
-- t_role.data_scope 字段值：
--   'ALL'          - 全局数据（总部管理员，查看所有工厂）
--   'FACTORY_ONLY' - 工厂数据（工厂管理员，只看本工厂）
--   'TEAM'         - 团队数据（组长，只看本团队）
--   'OWN'          - 个人数据（普通员工，只看自己）

-- 5. 更新角色数据权限示例
UPDATE t_role SET data_scope = 'ALL' WHERE role_code = 'ADMIN';           -- 总部管理员
UPDATE t_role SET data_scope = 'FACTORY_ONLY' WHERE role_code LIKE '%FACTORY%'; -- 工厂角色
UPDATE t_role SET data_scope = 'TEAM' WHERE role_code LIKE '%LEADER%';    -- 组长
UPDATE t_role SET data_scope = 'OWN' WHERE role_code LIKE '%WORKER%';     -- 普通员工
