-- V20260501002: 外发工厂发货明细增加质检/收货闭环字段
-- 背景：外发工厂收发货闭环需要颜色×尺码级别的收货/质检/返修追踪
-- 以前只有 quantity（发货数量），缺少收货/质检/返修数量

SET @col1 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment_detail'
    AND COLUMN_NAME='received_quantity');
SET @sql1 = IF(@col1=0,
    'ALTER TABLE t_factory_shipment_detail ADD COLUMN received_quantity INT DEFAULT NULL COMMENT ''本厂实际收货件数'' AFTER quantity',
    'SELECT 1');
PREPARE stmt1 FROM @sql1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @col2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment_detail'
    AND COLUMN_NAME='qualified_quantity');
SET @sql2 = IF(@col2=0,
    'ALTER TABLE t_factory_shipment_detail ADD COLUMN qualified_quantity INT DEFAULT NULL COMMENT ''质检合格件数'' AFTER received_quantity',
    'SELECT 1');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @col3 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment_detail'
    AND COLUMN_NAME='defective_quantity');
SET @sql3 = IF(@col3=0,
    'ALTER TABLE t_factory_shipment_detail ADD COLUMN defective_quantity INT DEFAULT NULL COMMENT ''质检次品件数'' AFTER qualified_quantity',
    'SELECT 1');
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SET @col4 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment_detail'
    AND COLUMN_NAME='returned_quantity');
SET @sql4 = IF(@col4=0,
    'ALTER TABLE t_factory_shipment_detail ADD COLUMN returned_quantity INT DEFAULT NULL COMMENT ''已退回返修件数'' AFTER defective_quantity',
    'SELECT 1');
PREPARE stmt4 FROM @sql4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;
