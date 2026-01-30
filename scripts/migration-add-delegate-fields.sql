-- 工序指派工资结算方案 - 数据库迁移脚本
-- 执行时间: 2026-01-31
-- 说明: 为 t_scan_record 表添加指派相关字段

USE fashion_supplychain;

-- 1. 添加指派目标相关字段
ALTER TABLE t_scan_record
ADD COLUMN delegate_target_type VARCHAR(20) DEFAULT 'none' COMMENT '指派目标类型: internal=内部员工, external=外部工厂, none=未指派',
ADD COLUMN delegate_target_id VARCHAR(64) DEFAULT NULL COMMENT '指派目标ID（员工ID或工厂ID）',
ADD COLUMN delegate_target_name VARCHAR(100) DEFAULT NULL COMMENT '指派目标名称（员工名或工厂名）';

-- 2. 添加实际操作员字段（追溯用）
ALTER TABLE t_scan_record
ADD COLUMN actual_operator_id VARCHAR(64) DEFAULT NULL COMMENT '实际操作员ID（谁扫的码）',
ADD COLUMN actual_operator_name VARCHAR(100) DEFAULT NULL COMMENT '实际操作员名称';

-- 3. 添加索引优化查询
ALTER TABLE t_scan_record
ADD INDEX idx_delegate_target (delegate_target_id),
ADD INDEX idx_actual_operator (actual_operator_id),
ADD INDEX idx_delegate_target_type (delegate_target_type);

-- 4. 迁移现有数据
-- 将现有记录标记为"未指派"，实际操作员=结算对象
UPDATE t_scan_record
SET
    delegate_target_type = 'none',
    actual_operator_id = operator_id,
    actual_operator_name = operator_name
WHERE delegate_target_type IS NULL;

-- 5. 验证数据
SELECT
    '迁移完成' AS status,
    COUNT(*) AS total_records,
    SUM(CASE WHEN delegate_target_type = 'none' THEN 1 ELSE 0 END) AS none_count,
    SUM(CASE WHEN delegate_target_type = 'internal' THEN 1 ELSE 0 END) AS internal_count,
    SUM(CASE WHEN delegate_target_type = 'external' THEN 1 ELSE 0 END) AS external_count,
    SUM(CASE WHEN actual_operator_id IS NOT NULL THEN 1 ELSE 0 END) AS with_actual_operator
FROM t_scan_record;

-- 6. 检查字段状态
SHOW FULL COLUMNS FROM t_scan_record WHERE Field IN (
    'delegate_target_type',
    'delegate_target_id',
    'delegate_target_name',
    'actual_operator_id',
    'actual_operator_name'
);
