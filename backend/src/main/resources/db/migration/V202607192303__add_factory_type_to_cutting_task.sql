-- V202607192303: t_cutting_task 新增 factory_type 列
-- 彻底解决内外部工厂筛选问题（原先 @TableField(exist=false) 导致每次需要关联查询）
-- 使用 INFORMATION_SCHEMA 幂等模式，安全可重复执行

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_cutting_task'
       AND COLUMN_NAME  = 'factory_type') = 0,
    'ALTER TABLE `t_cutting_task` ADD COLUMN `factory_type` VARCHAR(20) DEFAULT NULL COMMENT ''内外部工厂类型 INTERNAL/EXTERNAL''',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 回填存量数据：优先按 production_order_id 匹配，其次按 production_order_no 匹配
UPDATE t_cutting_task ct
    JOIN t_production_order po
        ON (
            (ct.production_order_id IS NOT NULL AND ct.production_order_id != ''
                AND ct.production_order_id = po.id)
            OR (
                (ct.production_order_id IS NULL OR ct.production_order_id = '')
                AND ct.production_order_no IS NOT NULL AND ct.production_order_no != ''
                AND ct.production_order_no = po.order_no
            )
        )
SET ct.factory_type = po.factory_type
WHERE ct.factory_type IS NULL
  AND po.factory_type IS NOT NULL
  AND po.factory_type != '';
