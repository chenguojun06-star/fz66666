-- 添加完整的角色数据

-- 更新现有角色的中文名称
UPDATE t_role SET role_name = '管理员' WHERE role_code = 'admin';
UPDATE t_role SET role_name = '财务人员' WHERE role_code = 'finance';
UPDATE t_role SET role_name = '生产人员' WHERE role_code = 'production';
UPDATE t_role SET role_name = '普通用户' WHERE role_code = 'user';

-- 插入主管角色
INSERT IGNORE INTO t_role (role_name, role_code, description, status) 
VALUES ('主管', 'supervisor', '主管角色，拥有全部权限', 'ENABLED');

-- 插入采购员角色
INSERT IGNORE INTO t_role (role_name, role_code, description, status) 
VALUES ('采购员', 'purchaser', '采购员角色，负责物料采购', 'ENABLED');

-- 插入裁剪员角色
INSERT IGNORE INTO t_role (role_name, role_code, description, status) 
VALUES ('裁剪员', 'cutter', '裁剪员角色，负责裁剪任务', 'ENABLED');

-- 插入车缝员角色
INSERT IGNORE INTO t_role (role_name, role_code, description, status) 
VALUES ('车缝员', 'sewing', '车缝员角色，负责车缝生产', 'ENABLED');

-- 插入包装员角色
INSERT IGNORE INTO t_role (role_name, role_code, description, status) 
VALUES ('包装员', 'packager', '包装员角色，负责包装任务', 'ENABLED');

-- 插入质检员角色
INSERT IGNORE INTO t_role (role_name, role_code, description, status) 
VALUES ('质检员', 'quality', '质检员角色，负责质量检查', 'ENABLED');

-- 插入仓管员角色
INSERT IGNORE INTO t_role (role_name, role_code, description, status) 
VALUES ('仓管员', 'warehouse', '仓管员角色，负责仓库管理', 'ENABLED');

