-- 修复用户表中的乱码数据
SET NAMES utf8mb4;

UPDATE t_user SET name = '系统管理员' WHERE username = 'admin';

-- 验证修复结果
SELECT username, name, role_name FROM t_user WHERE username = 'admin';
