-- V20260617005: 为 t_scan_record 和 t_cutting_task 添加高频索引所需的列
-- 必须在 V20260618001 之前执行，否则 V20260618001 的索引引用不存在的列会失败

-- =============================================
-- t_scan_record 列
-- =============================================

-- tenant_id
SET @c_sr_tid = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @s_sr_tid = IF(@c_sr_tid=0,
    'ALTER TABLE t_scan_record ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID''',
    'SELECT 1');
PREPARE stmt_sr_tid FROM @s_sr_tid; EXECUTE stmt_sr_tid; DEALLOCATE PREPARE stmt_sr_tid;

-- order_id
SET @c_sr_oid = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='order_id');
SET @s_sr_oid = IF(@c_sr_oid=0,
    'ALTER TABLE t_scan_record ADD COLUMN order_id VARCHAR(64) DEFAULT NULL COMMENT ''关联生产订单ID''',
    'SELECT 1');
PREPARE stmt_sr_oid FROM @s_sr_oid; EXECUTE stmt_sr_oid; DEALLOCATE PREPARE stmt_sr_oid;

-- operator_id
SET @c_sr_opid = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='operator_id');
SET @s_sr_opid = IF(@c_sr_opid=0,
    'ALTER TABLE t_scan_record ADD COLUMN operator_id VARCHAR(64) DEFAULT NULL COMMENT ''操作员ID''',
    'SELECT 1');
PREPARE stmt_sr_opid FROM @s_sr_opid; EXECUTE stmt_sr_opid; DEALLOCATE PREPARE stmt_sr_opid;

-- process_name
SET @c_sr_pn = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='process_name');
SET @s_sr_pn = IF(@c_sr_pn=0,
    'ALTER TABLE t_scan_record ADD COLUMN process_name VARCHAR(100) DEFAULT NULL COMMENT ''工序名称''',
    'SELECT 1');
PREPARE stmt_sr_pn FROM @s_sr_pn; EXECUTE stmt_sr_pn; DEALLOCATE PREPARE stmt_sr_pn;

-- =============================================
-- t_cutting_task 列
-- =============================================

-- order_id
SET @c_ct_oid = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='order_id');
SET @s_ct_oid = IF(@c_ct_oid=0,
    'ALTER TABLE t_cutting_task ADD COLUMN order_id VARCHAR(64) DEFAULT NULL COMMENT ''关联生产订单ID''',
    'SELECT 1');
PREPARE stmt_ct_oid FROM @s_ct_oid; EXECUTE stmt_ct_oid; DEALLOCATE PREPARE stmt_ct_oid;

-- received
SET @c_ct_rcv = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='received');
SET @s_ct_rcv = IF(@c_ct_rcv=0,
    'ALTER TABLE t_cutting_task ADD COLUMN received TINYINT(1) DEFAULT 0 COMMENT ''是否接收(0=未接收,1=已接收)''',
    'SELECT 1');
PREPARE stmt_ct_rcv FROM @s_ct_rcv; EXECUTE stmt_ct_rcv; DEALLOCATE PREPARE stmt_ct_rcv;
