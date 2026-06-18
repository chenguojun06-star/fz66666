-- V202606181003: 为 t_scan_record 和 t_cutting_task 添加缺失列
--
-- 问题链：
-- 1. V20260618001 的索引（idx_sr_order_time/idx_sr_operator_time/idx_sr_process_time）
--    引用了 t_scan_record 的 order_id、operator_id、process_name 列，但这些列不存在
-- 2. V20260618001 的索引（idx_ct_order_time）引用 t_cutting_task.order_id，但列不存在
-- 3. V20260618001 的索引（idx_ct_tenant_received）引用 t_cutting_task.received，但列不存在
-- 4. V20260618006 尝试添加 tenant_id 到 t_scan_record，但可能因前置迁移失败而未执行
--
-- 解决方案：
-- - 幂等添加所有缺失列
-- - 执行 V20260618001 未能完成的索引创建
-- - V20260618001 将在 Flyway repair 后重试（会成功，因为列已存在）

-- =============================================
-- t_scan_record 缺失列
-- =============================================

-- 1. tenant_id（可能被 V20260618006 部分添加）
SET @c_sr_tid = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @s_sr_tid = IF(@c_sr_tid=0,
    'ALTER TABLE t_scan_record ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER status',
    'SELECT 1');
PREPARE stmt_sr_tid FROM @s_sr_tid; EXECUTE stmt_sr_tid; DEALLOCATE PREPARE stmt_sr_tid;

-- 2. order_id（关联生产订单）
SET @c_sr_oid = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='order_id');
SET @s_sr_oid = IF(@c_sr_oid=0,
    'ALTER TABLE t_scan_record ADD COLUMN order_id VARCHAR(64) DEFAULT NULL COMMENT ''关联生产订单ID'' AFTER tenant_id',
    'SELECT 1');
PREPARE stmt_sr_oid FROM @s_sr_oid; EXECUTE stmt_sr_oid; DEALLOCATE PREPARE stmt_sr_oid;

-- 3. operator_id（操作员ID）
SET @c_sr_opid = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='operator_id');
SET @s_sr_opid = IF(@c_sr_opid=0,
    'ALTER TABLE t_scan_record ADD COLUMN operator_id VARCHAR(64) DEFAULT NULL COMMENT ''操作员ID'' AFTER order_id',
    'SELECT 1');
PREPARE stmt_sr_opid FROM @s_sr_opid; EXECUTE stmt_sr_opid; DEALLOCATE PREPARE stmt_sr_opid;

-- 4. process_name（工序名称）
SET @c_sr_pn = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='process_name');
SET @s_sr_pn = IF(@c_sr_pn=0,
    'ALTER TABLE t_scan_record ADD COLUMN process_name VARCHAR(100) DEFAULT NULL COMMENT ''工序名称'' AFTER operator_id',
    'SELECT 1');
PREPARE stmt_sr_pn FROM @s_sr_pn; EXECUTE stmt_sr_pn; DEALLOCATE PREPARE stmt_sr_pn;

-- =============================================
-- t_cutting_task 缺失列
-- =============================================

-- 5. order_id（关联生产订单）
SET @c_ct_oid = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='order_id');
SET @s_ct_oid = IF(@c_ct_oid=0,
    'ALTER TABLE t_cutting_task ADD COLUMN order_id VARCHAR(64) DEFAULT NULL COMMENT ''关联生产订单ID'' AFTER tenant_id',
    'SELECT 1');
PREPARE stmt_ct_oid FROM @s_ct_oid; EXECUTE stmt_ct_oid; DEALLOCATE PREPARE stmt_ct_oid;

-- 6. received（接收状态）
SET @c_ct_rcv = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='received');
SET @s_ct_rcv = IF(@c_ct_rcv=0,
    'ALTER TABLE t_cutting_task ADD COLUMN received TINYINT(1) DEFAULT 0 COMMENT ''是否接收(0=未接收,1=已接收)'' AFTER order_id',
    'SELECT 1');
PREPARE stmt_ct_rcv FROM @s_ct_rcv; EXECUTE stmt_ct_rcv; DEALLOCATE PREPARE stmt_ct_rcv;

-- =============================================
-- V20260618001 未能完成的索引（t_scan_record）
-- =============================================

-- idx_sr_order_time: (order_id, create_time)
SET @idx_sr_ot = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_order_time');
SET @si_sr_ot = IF(@idx_sr_ot=0,
    'CREATE INDEX idx_sr_order_time ON t_scan_record(order_id, create_time)',
    'SELECT 1');
PREPARE stmt_si_sr_ot FROM @si_sr_ot; EXECUTE stmt_si_sr_ot; DEALLOCATE PREPARE stmt_si_sr_ot;

-- idx_sr_operator_time: (operator_id, create_time)
SET @idx_sr_opt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_operator_time');
SET @si_sr_opt = IF(@idx_sr_opt=0,
    'CREATE INDEX idx_sr_operator_time ON t_scan_record(operator_id, create_time)',
    'SELECT 1');
PREPARE stmt_si_sr_opt FROM @si_sr_opt; EXECUTE stmt_si_sr_opt; DEALLOCATE PREPARE stmt_si_sr_opt;

-- idx_sr_process_time: (process_name, create_time)
SET @idx_sr_pt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_process_time');
SET @si_sr_pt = IF(@idx_sr_pt=0,
    'CREATE INDEX idx_sr_process_time ON t_scan_record(process_name, create_time)',
    'SELECT 1');
PREPARE stmt_si_sr_pt FROM @si_sr_pt; EXECUTE stmt_si_sr_pt; DEALLOCATE PREPARE stmt_si_sr_pt;

-- =============================================
-- V20260618001 未能完成的索引（t_cutting_task）
-- =============================================

-- idx_ct_order_time: (order_id, create_time)
SET @idx_ct_ot = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND INDEX_NAME='idx_ct_order_time');
SET @si_ct_ot = IF(@idx_ct_ot=0,
    'CREATE INDEX idx_ct_order_time ON t_cutting_task(order_id, create_time)',
    'SELECT 1');
PREPARE stmt_si_ct_ot FROM @si_ct_ot; EXECUTE stmt_si_ct_ot; DEALLOCATE PREPARE stmt_si_ct_ot;

-- idx_ct_tenant_received: (tenant_id, received, create_time)
SET @idx_ct_tr = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND INDEX_NAME='idx_ct_tenant_received');
SET @si_ct_tr = IF(@idx_ct_tr=0,
    'CREATE INDEX idx_ct_tenant_received ON t_cutting_task(tenant_id, received, create_time)',
    'SELECT 1');
PREPARE stmt_si_ct_tr FROM @si_ct_tr; EXECUTE stmt_si_ct_tr; DEALLOCATE PREPARE stmt_si_ct_tr;
