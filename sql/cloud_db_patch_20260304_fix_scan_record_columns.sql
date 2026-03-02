-- ============================================================
-- 云端补丁：t_scan_record 缺失列修复
-- 适用：微信云托管（FLYWAY_ENABLED=false，Flyway 不自动执行）
-- 执行方式：在微信云托管控制台数据库面板逐条执行
-- 背景：Flyway V20/V21/V26/V37/V20260225b 添加的列未在云端执行
-- 日期：2026-03-04
-- ============================================================

-- 第1步：先查哪些列已存在（执行这条确认）
SELECT COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_scan_record'
  AND COLUMN_NAME IN (
    'receive_time','confirm_time',
    'delegate_target_type','delegate_target_id','delegate_target_name',
    'payroll_settlement_id',
    'current_progress_stage','progress_node_unit_prices',
    'total_piece_cost','average_piece_cost',
    'assignment_id','assigned_operator_name'
  )
ORDER BY COLUMN_NAME;

-- ============================================================
-- 第2步：以下 ALTER TABLE 逐条执行，已存在的列会报错 Duplicate column
-- 直接跳过报错继续执行其余语句即可
-- ============================================================

-- 来自 V20260225b / V37（入库时间）
ALTER TABLE t_scan_record ADD COLUMN receive_time     DATETIME     DEFAULT NULL COMMENT '领取/接收时间';
ALTER TABLE t_scan_record ADD COLUMN confirm_time     DATETIME     DEFAULT NULL COMMENT '确认时间';

-- 来自 V26（委托相关）
ALTER TABLE t_scan_record ADD COLUMN delegate_target_type VARCHAR(50)  DEFAULT NULL COMMENT '委托目标类型';
ALTER TABLE t_scan_record ADD COLUMN delegate_target_id   VARCHAR(64)  DEFAULT NULL COMMENT '委托目标ID';
ALTER TABLE t_scan_record ADD COLUMN delegate_target_name VARCHAR(100) DEFAULT NULL COMMENT '委托目标名称';

-- 来自 V26（工资结算）
ALTER TABLE t_scan_record ADD COLUMN payroll_settlement_id VARCHAR(64) DEFAULT NULL COMMENT '工资结算单ID';

-- 来自 V26（进度阶段与成本）
ALTER TABLE t_scan_record ADD COLUMN current_progress_stage  VARCHAR(100) DEFAULT NULL COMMENT '当前进度阶段';
ALTER TABLE t_scan_record ADD COLUMN progress_node_unit_prices JSON         DEFAULT NULL COMMENT '进度节点单价JSON';
ALTER TABLE t_scan_record ADD COLUMN total_piece_cost         DECIMAL(10,2) DEFAULT NULL COMMENT '本次总件成本';
ALTER TABLE t_scan_record ADD COLUMN average_piece_cost       DECIMAL(10,4) DEFAULT NULL COMMENT '平均件成本';

-- 来自 V26（指派信息）
ALTER TABLE t_scan_record ADD COLUMN assignment_id            VARCHAR(64)  DEFAULT NULL COMMENT '指派记录ID';
ALTER TABLE t_scan_record ADD COLUMN assigned_operator_name   VARCHAR(100) DEFAULT NULL COMMENT '指派操作员名称';

-- ============================================================
-- 第3步：验证（执行后确认行数 >= 预期值）
SELECT COUNT(*) AS total_columns
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_scan_record';
-- ============================================================
