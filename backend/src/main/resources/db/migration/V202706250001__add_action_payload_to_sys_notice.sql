-- 给 t_sys_notice 增加 action_payload 字段，用于存储一键处理的参数（JSON格式）
-- 幂等：用存储过程 + information_schema 判断

DROP PROCEDURE IF EXISTS add_sys_notice_action_payload;

DELIMITER $$
CREATE PROCEDURE add_sys_notice_action_payload()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_sys_notice'
          AND COLUMN_NAME = 'action_payload'
    ) THEN
        ALTER TABLE t_sys_notice ADD COLUMN action_payload TEXT COMMENT '一键处理参数JSON（如orderId、actionType等）';
    END IF;
END$$
DELIMITER ;

CALL add_sys_notice_action_payload();
DROP PROCEDURE IF EXISTS add_sys_notice_action_payload;
