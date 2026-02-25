-- ========================================================
-- ScanRecord Phase 3-6 字段新增
-- 创建时间: 2026-02-01
-- 说明: 为扫码记录表添加Phase 3-6阶段的新字段
-- ========================================================

-- 检查表是否存在
SET @table_exists = (SELECT COUNT(*) FROM information_schema.tables 
                     WHERE table_schema = DATABASE() 
                     AND table_name = 't_scan_record');

-- 添加Phase 3字段（进度相关）
ALTER TABLE t_scan_record
    ADD COLUMN current_progress_stage VARCHAR(64) DEFAULT NULL COMMENT '当前工序阶段（Phase 3新增）',
    ADD COLUMN progress_node_unit_prices TEXT DEFAULT NULL COMMENT '工序节点单价列表，JSON格式（Phase 3新增）',
    ADD COLUMN cumulative_scan_count INT DEFAULT 0 COMMENT '累计扫码次数（Phase 3新增）',
    ADD COLUMN total_scan_count INT DEFAULT 0 COMMENT '总扫码次数（Phase 3新增）',
    ADD COLUMN progress_percentage DECIMAL(5,2) DEFAULT NULL COMMENT '进度百分比（Phase 3新增）';

-- 添加Phase 4字段（成本相关）
ALTER TABLE t_scan_record
    ADD COLUMN total_piece_cost DECIMAL(12,2) DEFAULT NULL COMMENT '总成本（Phase 4新增）',
    ADD COLUMN average_piece_cost DECIMAL(12,2) DEFAULT NULL COMMENT '平均成本（Phase 4新增）';

-- 添加Phase 5-6字段（指派相关）
ALTER TABLE t_scan_record
    ADD COLUMN assignment_id BIGINT DEFAULT NULL COMMENT '工序指派ID（Phase 5-6新增）',
    ADD COLUMN assigned_operator_name VARCHAR(64) DEFAULT NULL COMMENT '指派操作员名称（Phase 5-6新增）';

-- 添加索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_current_progress_stage ON t_scan_record(current_progress_stage);
CREATE INDEX IF NOT EXISTS idx_assignment_id ON t_scan_record(assignment_id);
