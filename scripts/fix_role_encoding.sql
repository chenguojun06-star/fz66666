-- 修复角色表中的乱码数据
SET NAMES utf8mb4;

UPDATE t_role SET role_name = '管理员' WHERE role_code = 'admin';
UPDATE t_role SET role_name = '普通用户' WHERE role_code = 'user';
UPDATE t_role SET role_name = '主管' WHERE role_code = 'supervisor';
UPDATE t_role SET role_name = '采购员' WHERE role_code = 'purchaser';
UPDATE t_role SET role_name = '裁剪员' WHERE role_code = 'cutter';
UPDATE t_role SET role_name = '车缝员' WHERE role_code = 'sewing';
UPDATE t_role SET role_name = '质检员' WHERE role_code = 'quality';
UPDATE t_role SET role_name = '包装员' WHERE role_code = 'packing';
UPDATE t_role SET role_name = '仓管员' WHERE role_code = 'warehouse';

-- 验证结果
SELECT id, role_name, role_code, data_scope FROM t_role;
