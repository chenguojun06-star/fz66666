-- 样衣借调功能完善：增加借入人/借入工厂/转借字段
-- 遵循 MySQL 8.0 幂等迁移规范（information_schema + 存储过程）

DROP PROCEDURE IF EXISTS _add_sample_loan_columns;
DELIMITER //
CREATE PROCEDURE _add_sample_loan_columns()
BEGIN
    -- 借入人（借给谁）
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='lend_to') THEN
        ALTER TABLE t_sample_loan ADD COLUMN lend_to VARCHAR(64) DEFAULT NULL COMMENT '借入人姓名' AFTER borrower_id;
    END IF;

    -- 借入人ID
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='lend_to_id') THEN
        ALTER TABLE t_sample_loan ADD COLUMN lend_to_id VARCHAR(64) DEFAULT NULL COMMENT '借入人ID' AFTER lend_to;
    END IF;

    -- 借入类型：person/factory/customer
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='lend_to_type') THEN
        ALTER TABLE t_sample_loan ADD COLUMN lend_to_type VARCHAR(32) DEFAULT NULL COMMENT '借入类型: person/factory/customer' AFTER lend_to_id;
    END IF;

    -- 借入工厂ID
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='lend_to_factory_id') THEN
        ALTER TABLE t_sample_loan ADD COLUMN lend_to_factory_id VARCHAR(64) DEFAULT NULL COMMENT '借入工厂ID' AFTER lend_to_type;
    END IF;

    -- 借入工厂名称
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='lend_to_factory_name') THEN
        ALTER TABLE t_sample_loan ADD COLUMN lend_to_factory_name VARCHAR(128) DEFAULT NULL COMMENT '借入工厂名称' AFTER lend_to_factory_id;
    END IF;

    -- 转借来源记录ID
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='transfer_from_loan_id') THEN
        ALTER TABLE t_sample_loan ADD COLUMN transfer_from_loan_id VARCHAR(64) DEFAULT NULL COMMENT '转借来源记录ID' AFTER lend_to_factory_name;
    END IF;

    -- 剩余未还数量（支持部分归还）
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='remaining_quantity') THEN
        ALTER TABLE t_sample_loan ADD COLUMN remaining_quantity INT DEFAULT NULL COMMENT '剩余未还数量' AFTER quantity;
    END IF;

    -- 借出操作人ID（区别于借用人，操作人可能是仓库管理员代借）
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='operator_id') THEN
        ALTER TABLE t_sample_loan ADD COLUMN operator_id VARCHAR(64) DEFAULT NULL COMMENT '借出操作人ID' AFTER remaining_quantity;
    END IF;

    -- 借出操作人姓名
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='operator_name') THEN
        ALTER TABLE t_sample_loan ADD COLUMN operator_name VARCHAR(64) DEFAULT NULL COMMENT '借出操作人姓名' AFTER operator_id;
    END IF;

END //
DELIMITER ;
CALL _add_sample_loan_columns();
DROP PROCEDURE IF EXISTS _add_sample_loan_columns;
