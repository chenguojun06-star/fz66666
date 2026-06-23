-- 订单成本汇总字段
-- 用于内部工厂面辅料成本汇总

-- 添加面辅料成本字段
SET @dbname = DATABASE();
SET @col_material_cost = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='material_cost');
SET @s1 = IF(@col_material_cost=0, 'ALTER TABLE t_production_order ADD COLUMN material_cost DECIMAL(12,2) DEFAULT 0.00 COMMENT ''面辅料成本汇总（内部工厂采购成本）''', 'SELECT 1');
PREPARE stmt1 FROM @s1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- 添加总成本字段
SET @col_total_cost = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='total_cost');
SET @s2 = IF(@col_total_cost=0, 'ALTER TABLE t_production_order ADD COLUMN total_cost DECIMAL(12,2) DEFAULT 0.00 COMMENT ''订单总成本 = 加工费 + 面辅料成本''', 'SELECT 1');
PREPARE stmt2 FROM @s2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 物料领取记录添加来源类型字段
SET @col_source_type = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='source_type');
-- source_type 字段已存在，检查是否有足够的类型选项
-- 如果不存在则添加
SET @s3 = IF(@col_source_type=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN source_type VARCHAR(32) DEFAULT ''PICKUP'' COMMENT ''来源类型：PURCHASE=采购，PICKUP=领取，SELF_PURCHASE=自采'' AFTER pickup_type', 'SELECT 1');
PREPARE stmt3 FROM @s3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- 添加成本归属字段（用于区分内部/外部成本）
SET @col_cost_owner = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='cost_owner');
SET @s4 = IF(@col_cost_owner=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN cost_owner VARCHAR(32) DEFAULT NULL COMMENT ''成本归属：INTERNAL=内部工厂平账，EXTERNAL=外部工厂扣款'' AFTER source_type', 'SELECT 1');
PREPARE stmt4 FROM @s4;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;

-- 添加是否已汇总到订单的标记
SET @col_cost_settled = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='cost_settled');
SET @s5 = IF(@col_cost_settled=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN cost_settled TINYINT DEFAULT 0 COMMENT ''成本是否已汇总到订单：0=未汇总，1=已汇总'' AFTER cost_owner', 'SELECT 1');
PREPARE stmt5 FROM @s5;
EXECUTE stmt5;
DEALLOCATE PREPARE stmt5;