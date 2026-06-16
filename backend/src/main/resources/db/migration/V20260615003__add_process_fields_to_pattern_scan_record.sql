-- 给 t_pattern_scan_record 增加 process_name / progress_stage / process_code 字段
-- 解决前端样衣工序完成度匹配问题：operationType 是英文大写，前端按中文名匹配

DROP PROCEDURE IF EXISTS _add_pattern_scan_record_process_fields;
DELIMITER //
CREATE PROCEDURE _add_pattern_scan_record_process_fields()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_scan_record' AND COLUMN_NAME='process_name') THEN
        ALTER TABLE t_pattern_scan_record ADD COLUMN process_name VARCHAR(100) DEFAULT NULL COMMENT '工序名称(中文)' AFTER operation_type;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_scan_record' AND COLUMN_NAME='progress_stage') THEN
        ALTER TABLE t_pattern_scan_record ADD COLUMN progress_stage VARCHAR(100) DEFAULT NULL COMMENT '进度阶段(中文)' AFTER process_name;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_scan_record' AND COLUMN_NAME='process_code') THEN
        ALTER TABLE t_pattern_scan_record ADD COLUMN process_code VARCHAR(100) DEFAULT NULL COMMENT '工序编码' AFTER progress_stage;
    END IF;

    -- 回填历史数据
    UPDATE t_pattern_scan_record SET
        process_name = CASE operation_type
            WHEN 'RECEIVE' THEN '领取样板'
            WHEN 'PLATE' THEN '车板扫码'
            WHEN 'FOLLOW_UP' THEN '跟单确认'
            WHEN 'COMPLETE' THEN '完成确认'
            WHEN 'REWORK' THEN '返修完成'
            WHEN 'WAREHOUSE_IN' THEN '样衣入库'
            WHEN 'WAREHOUSE_OUT' THEN '样衣出库'
            WHEN 'WAREHOUSE_RETURN' THEN '样衣归还'
            WHEN 'CUTTING' THEN '裁剪'
            WHEN 'SEWING' THEN '车缝'
            WHEN 'TAIL' THEN '尾部'
            WHEN 'SECONDARY' THEN '二次工艺'
            WHEN 'PROCUREMENT' THEN '采购'
            ELSE operation_type
        END,
        progress_stage = CASE operation_type
            WHEN 'RECEIVE' THEN '采购'
            WHEN 'PROCUREMENT' THEN '采购'
            WHEN 'CUTTING' THEN '裁剪'
            WHEN 'SECONDARY' THEN '二次工艺'
            WHEN 'SEWING' THEN '车缝'
            WHEN 'TAIL' THEN '尾部'
            WHEN 'WAREHOUSE_IN' THEN '入库'
            WHEN 'WAREHOUSE_OUT' THEN '出库'
            WHEN 'WAREHOUSE_RETURN' THEN '归还'
            WHEN 'IRONING' THEN '整烫'
            WHEN 'QUALITY' THEN '质检'
            WHEN 'PACKAGING' THEN '包装'
            WHEN 'PLATE' THEN '车板'
            WHEN 'FOLLOW_UP' THEN '跟单确认'
            WHEN 'COMPLETE' THEN '完成确认'
            WHEN 'REWORK' THEN '返修'
            ELSE operation_type
        END,
        process_code = operation_type
    WHERE process_name IS NULL AND operation_type IS NOT NULL;
END //
DELIMITER ;
CALL _add_pattern_scan_record_process_fields();
DROP PROCEDURE IF EXISTS _add_pattern_scan_record_process_fields;
