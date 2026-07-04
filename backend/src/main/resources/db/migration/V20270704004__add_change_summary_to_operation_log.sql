-- 操作日志增加变更摘要字段（人类可读的 before->after 对比）
DELIMITER $$
DROP PROCEDURE IF EXISTS add_change_summary_to_operation_log $$

CREATE PROCEDURE add_change_summary_to_operation_log()
BEGIN
    DECLARE col_exists INT;
    SELECT COUNT(*) INTO col_exists FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_operation_log' AND COLUMN_NAME = 'change_summary';
    IF col_exists = 0 THEN
        ALTER TABLE t_operation_log ADD COLUMN change_summary TEXT COMMENT '人类可读变更摘要：字段名：旧值->新值；...';
    END IF;
END $$

CALL add_change_summary_to_operation_log() $$
DROP PROCEDURE IF EXISTS add_change_summary_to_operation_log $$

-- 增加索引：按目标ID查询操作历史
DROP PROCEDURE IF EXISTS add_target_id_index $$
CREATE PROCEDURE add_target_id_index()
BEGIN
    DECLARE idx_exists INT;
    SELECT COUNT(*) INTO idx_exists FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_operation_log' AND INDEX_NAME = 'idx_target_id';
    IF idx_exists = 0 THEN
        ALTER TABLE t_operation_log ADD INDEX idx_target_id (target_id);
    END IF;
END $$
CALL add_target_id_index() $$
DROP PROCEDURE IF EXISTS add_target_id_index $$

-- 增加索引：按目标名称模糊查询
DROP PROCEDURE IF EXISTS add_target_name_index $$
CREATE PROCEDURE add_target_name_index()
BEGIN
    DECLARE idx_exists INT;
    SELECT COUNT(*) INTO idx_exists FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_operation_log' AND INDEX_NAME = 'idx_target_name';
    IF idx_exists = 0 THEN
        ALTER TABLE t_operation_log ADD INDEX idx_target_name (target_name(64));
    END IF;
END $$
CALL add_target_name_index() $$
DROP PROCEDURE IF EXISTS add_target_name_index $$

DELIMITER ;
