-- 为二次工艺表添加领取人和完成时间字段
-- 执行日期: 2026-01-28
-- 描述: 支持二次工艺的领取人和完成时间追踪

USE fashion_supplychain;

-- 添加领取人字段
ALTER TABLE t_secondary_process
ADD COLUMN assignee VARCHAR(100) COMMENT '领取人' AFTER factory_name;

-- 添加完成时间字段
ALTER TABLE t_secondary_process
ADD COLUMN completed_time DATETIME COMMENT '完成时间' AFTER assignee;

-- 为已完成的工艺设置默认完成时间（使用更新时间）
UPDATE t_secondary_process
SET completed_time = updated_at
WHERE status = 'completed' AND completed_time IS NULL;

-- 验证
SELECT
    id,
    process_name,
    assignee,
    completed_time,
    status,
    created_at
FROM t_secondary_process
LIMIT 5;
