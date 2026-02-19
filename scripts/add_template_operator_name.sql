-- 添加模板库表缺失的 operator_name 字段
SET NAMES utf8mb4;

ALTER TABLE t_template_library ADD COLUMN operator_name VARCHAR(50) DEFAULT NULL COMMENT '操作人姓名' AFTER locked;

-- 验证结果
SHOW COLUMNS FROM t_template_library;
