-- 添加工厂表缺失的 delete_flag 字段
SET NAMES utf8mb4;

ALTER TABLE t_factory ADD COLUMN delete_flag TINYINT(1) DEFAULT 0 COMMENT '删除标记: 0-未删除, 1-已删除';

-- 验证结果
SHOW COLUMNS FROM t_factory;
