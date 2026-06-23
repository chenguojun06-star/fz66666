-- ==========================================================================
-- t_scan_record 多租户索引优化
--
-- 背景：
--   t_scan_record 是系统核心大表，几乎所有查询都带 tenant_id 过滤条件，
--   但现有索引大多不以 tenant_id 开头，导致索引利用率低，全表扫描频繁。
--
-- 优化策略：
--   1. 为所有高频查询添加 tenant_id 前缀的联合索引
--   2. 遵循最左前缀原则，tenant_id 始终放在最左
--   3. 防御式执行：索引不存在且列都存在时才创建
--
-- 高频查询场景（对应索引）：
--   1. 个人扫码历史/统计:   idx_sr_tenant_operator_time (tenant_id, operator_id, scan_time)
--   2. 订单扫码记录查询:    idx_sr_tenant_order_time (tenant_id, order_id, scan_time)
--   3. 按订单号查询:        idx_sr_tenant_order_no (tenant_id, order_no)
--   4. 按款号查询:          idx_sr_tenant_style_no (tenant_id, style_no)
--   5. 菲号级查询:          idx_sr_tenant_bundle_type (tenant_id, cutting_bundle_id, scan_type)
--   6. 按扫码类型+时间:     idx_sr_tenant_scantype_time (tenant_id, scan_type, scan_time)
--   7. 外发工厂查询:        idx_sr_tenant_factory_time (tenant_id, factory_id, scan_time)
--   8. 工资结算查询:        idx_sr_tenant_settlement (tenant_id, settlement_status, scan_time)
--   9. 工资结算单查询:      idx_sr_tenant_payroll_id (tenant_id, payroll_settlement_id)
-- ==========================================================================

-- 1. idx_sr_tenant_operator_time (tenant_id, operator_id, scan_time)
--    用途：个人扫码历史、个人产量统计、工资明细查询
SET @idx1 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_tenant_operator_time');
SET @col1a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @col1b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='operator_id');
SET @col1c = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='scan_time');
SET @s1 = IF(@idx1=0 AND @col1a>0 AND @col1b>0 AND @col1c>0,
    'CREATE INDEX idx_sr_tenant_operator_time ON t_scan_record(tenant_id, operator_id, scan_time)',
    'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

-- 2. idx_sr_tenant_order_time (tenant_id, order_id, scan_time)
--    用途：订单扫码记录、订单进度查询
SET @idx2 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_tenant_order_time');
SET @col2a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @col2b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='order_id');
SET @col2c = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='scan_time');
SET @s2 = IF(@idx2=0 AND @col2a>0 AND @col2b>0 AND @col2c>0,
    'CREATE INDEX idx_sr_tenant_order_time ON t_scan_record(tenant_id, order_id, scan_time)',
    'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 3. idx_sr_tenant_order_no (tenant_id, order_no)
--    用途：按订单号搜索扫码记录
SET @idx3 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_tenant_order_no');
SET @col3a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @col3b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='order_no');
SET @s3 = IF(@idx3=0 AND @col3a>0 AND @col3b>0,
    'CREATE INDEX idx_sr_tenant_order_no ON t_scan_record(tenant_id, order_no)',
    'SELECT 1');
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- 4. idx_sr_tenant_style_no (tenant_id, style_no)
--    用途：按款号查询扫码记录
SET @idx4 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_tenant_style_no');
SET @col4a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @col4b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='style_no');
SET @s4 = IF(@idx4=0 AND @col4a>0 AND @col4b>0,
    'CREATE INDEX idx_sr_tenant_style_no ON t_scan_record(tenant_id, style_no)',
    'SELECT 1');
PREPARE stmt4 FROM @s4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

-- 5. idx_sr_tenant_bundle_type (tenant_id, cutting_bundle_id, scan_type)
--    用途：菲号级扫码查询、质检/入库状态检查
SET @idx5 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_tenant_bundle_type');
SET @col5a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @col5b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='cutting_bundle_id');
SET @col5c = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='scan_type');
SET @s5 = IF(@idx5=0 AND @col5a>0 AND @col5b>0 AND @col5c>0,
    'CREATE INDEX idx_sr_tenant_bundle_type ON t_scan_record(tenant_id, cutting_bundle_id, scan_type)',
    'SELECT 1');
PREPARE stmt5 FROM @s5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

-- 6. idx_sr_tenant_scantype_time (tenant_id, scan_type, scan_time)
--    用途：按扫码类型+时间范围统计
SET @idx6 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_tenant_scantype_time');
SET @col6a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @col6b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='scan_type');
SET @col6c = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='scan_time');
SET @s6 = IF(@idx6=0 AND @col6a>0 AND @col6b>0 AND @col6c>0,
    'CREATE INDEX idx_sr_tenant_scantype_time ON t_scan_record(tenant_id, scan_type, scan_time)',
    'SELECT 1');
PREPARE stmt6 FROM @s6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

-- 7. idx_sr_tenant_factory_time (tenant_id, factory_id, scan_time)
--    用途：外发工厂扫码记录查询、工厂隔离
SET @idx7 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_tenant_factory_time');
SET @col7a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @col7b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='factory_id');
SET @col7c = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='scan_time');
SET @s7 = IF(@idx7=0 AND @col7a>0 AND @col7b>0 AND @col7c>0,
    'CREATE INDEX idx_sr_tenant_factory_time ON t_scan_record(tenant_id, factory_id, scan_time)',
    'SELECT 1');
PREPARE stmt7 FROM @s7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;

-- 8. idx_sr_tenant_settlement (tenant_id, settlement_status, scan_time)
--    用途：待结算扫码记录查询、工资结算筛选
SET @idx8 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_tenant_settlement');
SET @col8a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @col8b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='settlement_status');
SET @col8c = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='scan_time');
SET @s8 = IF(@idx8=0 AND @col8a>0 AND @col8b>0 AND @col8c>0,
    'CREATE INDEX idx_sr_tenant_settlement ON t_scan_record(tenant_id, settlement_status, scan_time)',
    'SELECT 1');
PREPARE stmt8 FROM @s8; EXECUTE stmt8; DEALLOCATE PREPARE stmt8;

-- 9. idx_sr_tenant_payroll_id (tenant_id, payroll_settlement_id)
--    用途：按工资结算单查询扫码明细
SET @idx9 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_tenant_payroll_id');
SET @col9a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @col9b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='payroll_settlement_id');
SET @s9 = IF(@idx9=0 AND @col9a>0 AND @col9b>0,
    'CREATE INDEX idx_sr_tenant_payroll_id ON t_scan_record(tenant_id, payroll_settlement_id)',
    'SELECT 1');
PREPARE stmt9 FROM @s9; EXECUTE stmt9; DEALLOCATE PREPARE stmt9;
