-- V20270626006__cleanup_redundant_indexes_v2.sql
-- 第二轮冗余索引清理：前缀被复合索引覆盖的单列索引
-- 幂等：使用存储过程判断索引存在才删除

DELIMITER $$

DROP PROCEDURE IF EXISTS drop_index_if_exists $$

CREATE PROCEDURE drop_index_if_exists(
    IN p_table_name VARCHAR(128),
    IN p_index_name VARCHAR(128)
)
BEGIN
    DECLARE index_exists INT DEFAULT 0;

    SELECT COUNT(*) INTO index_exists
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = p_table_name
      AND index_name = p_index_name;

    IF index_exists > 0 THEN
        SET @sql = CONCAT('ALTER TABLE ', p_table_name, ' DROP INDEX ', p_index_name);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$

DELIMITER ;

-- ============================================
-- t_scan_record (30个索引 → 清理12个冗余前缀索引)
-- 单列索引被复合索引前缀覆盖的，删除单列索引
-- ============================================

-- idx_order_id 被以下复合索引覆盖（首列都是order_id）：
-- idx_scan_record_order_bundle_result, idx_scan_record_order_bundle_type,
-- idx_sr_order_scantype_result, idx_sr_order_time
CALL drop_index_if_exists('t_scan_record', 'idx_order_id');

-- idx_scan_record_operator_id 被以下复合索引覆盖（首列都是operator_id）：
-- idx_scan_record_operator_stats, idx_sr_operator_time
CALL drop_index_if_exists('t_scan_record', 'idx_scan_record_operator_id');

-- idx_scan_record_scan_type 被以下复合索引覆盖（首列是scan_type）：
-- idx_scan_record_scan_type_result, idx_sr_result_type_order
CALL drop_index_if_exists('t_scan_record', 'idx_scan_record_scan_type');

-- idx_sr_tenant_id 被以下复合索引覆盖（首列都是tenant_id）：
-- idx_sr_tenant_order, idx_tenant_scan_time
CALL drop_index_if_exists('t_scan_record', 'idx_sr_tenant_id');

-- idx_scan_record_process 和 idx_current_progress_stage 功能重复
CALL drop_index_if_exists('t_scan_record', 'idx_scan_record_process');

-- idx_scan_time 被 idx_sr_scan_time_tenant 和 idx_tenant_scan_time 覆盖
CALL drop_index_if_exists('t_scan_record', 'idx_scan_time');

-- idx_scan_stats(order_no, scan_result, color, size) 冗余，
-- 已有idx_order_no(order_no) + 其他索引组合覆盖
CALL drop_index_if_exists('t_scan_record', 'idx_scan_stats');

-- idx_sr_result_type_order(scan_result, scan_type, order_id, quantity)
-- 与 idx_scan_record_scan_type_result(scan_type, scan_result) 部分重叠
-- 保留更具体的 idx_sr_result_type_order，删除 idx_scan_record_scan_type_result
CALL drop_index_if_exists('t_scan_record', 'idx_scan_record_scan_type_result');

-- idx_sr_process_time(process_name, create_time) 与 current_progress_stage 类似但用process_name
CALL drop_index_if_exists('t_scan_record', 'idx_sr_process_time');

-- idx_delegate_target_type 单列，使用频率低
CALL drop_index_if_exists('t_scan_record', 'idx_delegate_target_type');

-- idx_sr_order_scantype_result 与 idx_scan_record_order_bundle_type 部分重叠
-- 保留更具体的 idx_scan_record_order_bundle_type
CALL drop_index_if_exists('t_scan_record', 'idx_sr_order_scantype_result');

-- idx_sr_order_time 与 idx_scan_time + idx_order_id 组合功能重叠
CALL drop_index_if_exists('t_scan_record', 'idx_sr_order_time');

-- ============================================
-- t_production_order (清理更多冗余索引)
-- ============================================

-- idx_po_tenant_id 被其他复合索引覆盖
CALL drop_index_if_exists('t_production_order', 'idx_po_tenant_id');

-- ============================================
-- t_cutting_bundle (清理冗余索引)
-- ============================================

-- idx_cb_tenant_id 被 idx_cutting_bundle_tenant_bed 等复合索引覆盖
CALL drop_index_if_exists('t_cutting_bundle', 'idx_cb_tenant_id');

-- ============================================
-- t_ai_job_run_log (清理重复的tenant_id索引)
-- ============================================

-- idx_ajrl_tenant 与 idx_ai_job_run_log_tenant_id 完全重复
CALL drop_index_if_exists('t_ai_job_run_log', 'idx_ajrl_tenant');

-- idx_ai_job_run_log_tenant_id 被 idx_job_start(tenant_id, ...) 等覆盖
CALL drop_index_if_exists('t_ai_job_run_log', 'idx_ai_job_run_log_tenant_id');

-- idx_start_time 与 idx_job_start 部分重叠
CALL drop_index_if_exists('t_ai_job_run_log', 'idx_start_time');

-- ============================================
-- t_intelligence_audit_log (大表索引优化)
-- ============================================

-- 单列tenant_id索引被复合索引覆盖的，删除单列
CALL drop_index_if_exists('t_intelligence_audit_log', 'idx_ial_tenant_id');

-- 清理存储过程
DROP PROCEDURE IF EXISTS drop_index_if_exists;
