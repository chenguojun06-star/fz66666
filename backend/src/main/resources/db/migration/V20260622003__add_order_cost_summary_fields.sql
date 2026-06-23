-- 订单成本汇总字段
-- 用于内部工厂面辅料成本汇总

-- 添加面辅料成本字段
SET @dbname = DATABASE();
SET @col_material_cost = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='material_cost');
SET @s1 = IF(@col_material_cost=0, 'ALTER TABLE t_production_order ADD COLUMN material_cost DECIMAL(12,2) DEFAULT 0 COMMENT ''面辅料成本''', 'SELECT 1');
PREPARE stmt1 FROM @s1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- 添加总成本字段
SET @col_total_cost = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='total_cost');
SET @s2 = IF(@col_total_cost=0, 'ALTER TABLE t_production_order ADD COLUMN total_cost DECIMAL(12,2) DEFAULT 0 COMMENT ''订单总成本''', 'SELECT 1');
PREPARE stmt2 FROM @s2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 物料领取记录添加来源类型字段
SET @col_source_type = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='source_type');
SET @s3 = IF(@col_source_type=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN source_type VARCHAR(32) COMMENT ''来源类型'' AFTER pickup_type', 'SELECT 1');
PREPARE stmt3 FROM @s3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- 添加成本归属字段
SET @col_cost_owner = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='cost_owner');
SET @s4 = IF(@col_cost_owner=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN cost_owner VARCHAR(32) COMMENT ''成本归属'' AFTER source_type', 'SELECT 1');
PREPARE stmt4 FROM @s4;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;

-- 添加是否已汇总到订单的标记
SET @col_cost_settled = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='cost_settled');
SET @s5 = IF(@col_cost_settled=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN cost_settled TINYINT DEFAULT 0 COMMENT ''是否已汇总'' AFTER cost_owner', 'SELECT 1');
PREPARE stmt5 FROM @s5;
EXECUTE stmt5;
DEALLOCATE PREPARE stmt5;
