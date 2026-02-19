-- 修复角色表描述字段的乱码
SET NAMES utf8mb4;

UPDATE t_role SET description = '系统管理员，拥有所有权限' WHERE role_code = 'admin';
UPDATE t_role SET description = '普通用户，基本权限' WHERE role_code = 'user';
UPDATE t_role SET description = '主管角色，拥有全部数据查看权限' WHERE role_code = 'supervisor';
UPDATE t_role SET description = '采购员角色，负责物料采购' WHERE role_code = 'purchaser';
UPDATE t_role SET description = '裁剪员角色，负责裁剪任务' WHERE role_code = 'cutter';
UPDATE t_role SET description = '车缝员角色，负责车缝工序' WHERE role_code = 'sewing';
UPDATE t_role SET description = '包装员角色，负责成品包装' WHERE role_code = 'packager';
UPDATE t_role SET description = '质检员角色，负责质量检查' WHERE role_code = 'quality';
UPDATE t_role SET description = '仓管员角色，负责仓库管理' WHERE role_code = 'warehouse';

-- 验证结果
SELECT id, role_name, role_code, description FROM t_role ORDER BY id;
