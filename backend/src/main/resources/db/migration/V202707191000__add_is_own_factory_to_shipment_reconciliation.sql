-- ==================================================================
-- V202707191000: 为 t_shipment_reconciliation 补 is_own_factory 列 + 历史数据回填
-- ==================================================================
-- 背景（P0 字段化修复 - 数据链路闭环）：
--   ShipmentReconciliation.java 已声明 @TableField("is_own_factory")
--   private Integer isOwnFactory; 但 DB 表从未通过 Flyway 添加该列。
--   DbColumnDefinitions 第 541 行仅有声明（Preflight 自检），不执行 ALTER。
--
-- 后果：
--   1) MyBatis-Plus INSERT 时 is_own_factory 静默丢失
--   2) SELECT 回来 isOwnFactory=null
--   3) pushReceivableBill 三态判定退化为 null 分支（销售出货方向）
--   4) BillAggregation uk_source 幂等约束 → 方向不可纠正
--   5) 外发工厂对账错推 RECEIVABLE+SHIPMENT+CUSTOMER
--
-- 修复策略：
--   1) 幂等添加 is_own_factory INT DEFAULT NULL 列
--   2) 按 order_id 关联 t_production_order.factory_type 回填历史数据
--      - factory_type='INTERNAL' → 1（本厂）
--      - factory_type='EXTERNAL' → 0（外发工厂）
--      - 其他/NULL → NULL（销售出货方向，保持原语义）
--
-- 安全模板参考：V202705020001__add_shipment_reconciliation_base_columns_and_pattern_production_table.sql
--   不在 SET @s 中包含 COMMENT / DEFAULT '字符串字面量'
-- 多租户安全（P0 铁律4）：
--   UPDATE 带 tenant_id 匹配 + WHERE 限制，避免跨租户污染
-- ==================================================================

-- ── 1. 幂等添加 is_own_factory 列 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'is_own_factory') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `is_own_factory` INT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. 历史数据回填：按 order_id 关联 t_production_order.factory_type ──
-- 多租户安全：JOIN 条件包含 tenant_id 匹配
-- 仅回填 is_own_factory IS NULL 的记录（幂等，可重复执行）
UPDATE `t_shipment_reconciliation` sr
LEFT JOIN `t_production_order` po
       ON sr.`order_id`   = po.`id`
      AND sr.`tenant_id`  = po.`tenant_id`
SET sr.`is_own_factory` = CASE
    WHEN po.`factory_type` = 'INTERNAL' THEN 1
    WHEN po.`factory_type` = 'EXTERNAL' THEN 0
    ELSE NULL
END
WHERE sr.`is_own_factory` IS NULL
  AND sr.`delete_flag` = 0
  AND sr.`order_id` IS NOT NULL;
