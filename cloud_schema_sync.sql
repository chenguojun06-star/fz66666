-- ============================================================
-- 云端数据库 Schema 同步脚本
-- 功能：对比 Entity 定义，补齐云端缺少的列
-- 执行方式：全部复制到云端数据库查询窗口一次性执行
-- ============================================================

-- Step 1: 检查当前状态
SELECT '开始检查 t_style_info...' as step;
SELECT COUNT(*) as current_columns FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info';

-- Step 2: t_style_info 补列
DROP PROCEDURE IF EXISTS sync_style_info_columns;

DELIMITER //

CREATE PROCEDURE sync_style_info_columns()
BEGIN
    -- skc
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'skc') THEN
        ALTER TABLE t_style_info ADD COLUMN skc VARCHAR(64) COMMENT 'SKC号';
    END IF;

    -- source_type
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'source_type') THEN
        ALTER TABLE t_style_info ADD COLUMN source_type VARCHAR(32) COMMENT '来源类型';
    END IF;

    -- source_detail
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'source_detail') THEN
        ALTER TABLE t_style_info ADD COLUMN source_detail VARCHAR(64) COMMENT '来源明细';
    END IF;

    -- fabric_composition
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'fabric_composition') THEN
        ALTER TABLE t_style_info ADD COLUMN fabric_composition VARCHAR(500) COMMENT '面料成分';
    END IF;

    -- wash_instructions
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'wash_instructions') THEN
        ALTER TABLE t_style_info ADD COLUMN wash_instructions VARCHAR(500) COMMENT '洗涤说明';
    END IF;

    -- u_code
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'u_code') THEN
        ALTER TABLE t_style_info ADD COLUMN u_code VARCHAR(100) COMMENT 'U编码';
    END IF;

    -- fabric_composition_parts
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'fabric_composition_parts') THEN
        ALTER TABLE t_style_info ADD COLUMN fabric_composition_parts TEXT COMMENT '多部位面料成分JSON';
    END IF;

    -- wash_temp_code
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'wash_temp_code') THEN
        ALTER TABLE t_style_info ADD COLUMN wash_temp_code VARCHAR(20) COMMENT '洗涤温度代码';
    END IF;

    -- bleach_code
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'bleach_code') THEN
        ALTER TABLE t_style_info ADD COLUMN bleach_code VARCHAR(20) COMMENT '漂白代码';
    END IF;

    -- tumble_dry_code
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'tumble_dry_code') THEN
        ALTER TABLE t_style_info ADD COLUMN tumble_dry_code VARCHAR(20) COMMENT '烘干代码';
    END IF;

    -- iron_code
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'iron_code') THEN
        ALTER TABLE t_style_info ADD COLUMN iron_code VARCHAR(20) COMMENT '熨烫代码';
    END IF;

    -- dry_clean_code
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'dry_clean_code') THEN
        ALTER TABLE t_style_info ADD COLUMN dry_clean_code VARCHAR(20) COMMENT '干洗代码';
    END IF;

    -- design_images
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'design_images') THEN
        ALTER TABLE t_style_info ADD COLUMN design_images TEXT COMMENT '设计图片';
    END IF;

    -- thumbnail_urls
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'thumbnail_urls') THEN
        ALTER TABLE t_style_info ADD COLUMN thumbnail_urls TEXT COMMENT '缩略图URLs';
    END IF;

    -- reference_images
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'reference_images') THEN
        ALTER TABLE t_style_info ADD COLUMN reference_images TEXT COMMENT '参考图片';
    END IF;

    -- style_source
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'style_source') THEN
        ALTER TABLE t_style_info ADD COLUMN style_source VARCHAR(50) COMMENT '款式来源';
    END IF;

    -- status
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'status') THEN
        ALTER TABLE t_style_info ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE' COMMENT '状态';
    END IF;

    -- delete_flag
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'delete_flag') THEN
        ALTER TABLE t_style_info ADD COLUMN delete_flag INT DEFAULT 0 COMMENT '删除标记';
    END IF;

    -- create_time
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'create_time') THEN
        ALTER TABLE t_style_info ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
    END IF;

    -- update_time
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'update_time') THEN
        ALTER TABLE t_style_info ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';
    END IF;

    -- creator_id
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'creator_id') THEN
        ALTER TABLE t_style_info ADD COLUMN creator_id BIGINT COMMENT '创建人ID';
    END IF;

    -- creator_name
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'creator_name') THEN
        ALTER TABLE t_style_info ADD COLUMN creator_name VARCHAR(100) COMMENT '创建人姓名';
    END IF;

    -- tenant_id
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'tenant_id') THEN
        ALTER TABLE t_style_info ADD COLUMN tenant_id BIGINT COMMENT '租户ID';
    END IF;

    SELECT 't_style_info sync completed' as result;
END//

DELIMITER ;

CALL sync_style_info_columns();

-- Step 3: 检查 t_production_order 当前状态
SELECT 'Checking t_production_order...' as step;
SELECT COUNT(*) as current_columns FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order';

-- Step 4: t_production_order 补列
DROP PROCEDURE IF EXISTS sync_production_order_columns;

DELIMITER //

CREATE PROCEDURE sync_production_order_columns()
BEGIN
    -- qr_code
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'qr_code') THEN
        ALTER TABLE t_production_order ADD COLUMN qr_code VARCHAR(100) COMMENT '订单二维码内容';
    END IF;

    -- color
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'color') THEN
        ALTER TABLE t_production_order ADD COLUMN color VARCHAR(50) COMMENT '颜色';
    END IF;

    -- size
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'size') THEN
        ALTER TABLE t_production_order ADD COLUMN size VARCHAR(50) COMMENT '码数';
    END IF;

    -- order_details
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'order_details') THEN
        ALTER TABLE t_production_order ADD COLUMN order_details LONGTEXT COMMENT '订单明细JSON';
    END IF;

    -- progress_workflow_json
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'progress_workflow_json') THEN
        ALTER TABLE t_production_order ADD COLUMN progress_workflow_json LONGTEXT COMMENT '进度节点定义JSON';
    END IF;

    -- progress_workflow_locked
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'progress_workflow_locked') THEN
        ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked INT NOT NULL DEFAULT 0 COMMENT '进度节点是否锁定：0-否，1-是';
    END IF;

    -- progress_workflow_locked_at
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'progress_workflow_locked_at') THEN
        ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_at DATETIME COMMENT '进度节点锁定时间';
    END IF;

    -- progress_workflow_locked_by
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'progress_workflow_locked_by') THEN
        ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_by VARCHAR(36) COMMENT '进度节点锁定人ID';
    END IF;

    -- progress_workflow_locked_by_name
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'progress_workflow_locked_by_name') THEN
        ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_by_name VARCHAR(50) COMMENT '进度节点锁定人';
    END IF;

    -- remarks
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'remarks') THEN
        ALTER TABLE t_production_order ADD COLUMN remarks VARCHAR(500) COMMENT '备注';
    END IF;

    -- expected_ship_date
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'expected_ship_date') THEN
        ALTER TABLE t_production_order ADD COLUMN expected_ship_date DATE COMMENT '预计出货日期';
    END IF;

    -- node_operations
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'node_operations') THEN
        ALTER TABLE t_production_order ADD COLUMN node_operations JSON COMMENT '节点操作记录';
    END IF;

    -- created_by_id
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'created_by_id') THEN
        ALTER TABLE t_production_order ADD COLUMN created_by_id VARCHAR(50) COMMENT '创建人ID';
    END IF;

    -- created_by_name
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'created_by_name') THEN
        ALTER TABLE t_production_order ADD COLUMN created_by_name VARCHAR(100) COMMENT '创建人姓名';
    END IF;

    -- version
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'version') THEN
        ALTER TABLE t_production_order ADD COLUMN version INT DEFAULT 0 COMMENT '乐观锁版本';
    END IF;

    -- tenant_id
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'tenant_id') THEN
        ALTER TABLE t_production_order ADD COLUMN tenant_id BIGINT COMMENT '租户ID';
    END IF;

    -- factory_contact_person
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'factory_contact_person') THEN
        ALTER TABLE t_production_order ADD COLUMN factory_contact_person VARCHAR(50) COMMENT '工厂联系人';
    END IF;

    -- factory_contact_phone
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'factory_contact_phone') THEN
        ALTER TABLE t_production_order ADD COLUMN factory_contact_phone VARCHAR(20) COMMENT '工厂联系电话';
    END IF;

    -- plate_type
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'plate_type') THEN
        ALTER TABLE t_production_order ADD COLUMN plate_type VARCHAR(20) NOT NULL DEFAULT 'FIRST' COMMENT '订单类型:FIRST=首单,REORDER=翻单';
    END IF;

    -- order_biz_type
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'order_biz_type') THEN
        ALTER TABLE t_production_order ADD COLUMN order_biz_type VARCHAR(32) COMMENT '订单业务类型';
    END IF;

    -- skc
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'skc') THEN
        ALTER TABLE t_production_order ADD COLUMN skc VARCHAR(64) COMMENT 'SKC号';
    END IF;

    -- notify_time_start
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'notify_time_start') THEN
        ALTER TABLE t_production_order ADD COLUMN notify_time_start VARCHAR(10) COMMENT '通知开始时间';
    END IF;

    -- notify_time_end
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'notify_time_end') THEN
        ALTER TABLE t_production_order ADD COLUMN notify_time_end VARCHAR(10) COMMENT '通知结束时间';
    END IF;

    -- customer_id
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'customer_id') THEN
        ALTER TABLE t_production_order ADD COLUMN customer_id VARCHAR(36) COMMENT 'CRM客户ID';
    END IF;

    -- factory_unit_price
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'factory_unit_price') THEN
        ALTER TABLE t_production_order ADD COLUMN factory_unit_price DECIMAL(10,2) COMMENT '下单锁定单价（元/件）';
    END IF;

    -- pricing_mode
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'pricing_mode') THEN
        ALTER TABLE t_production_order ADD COLUMN pricing_mode VARCHAR(20) COMMENT '下单单价模式：PROCESS/SIZE/MANUAL';
    END IF;

    -- scatter_pricing_mode
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'scatter_pricing_mode') THEN
        ALTER TABLE t_production_order ADD COLUMN scatter_pricing_mode VARCHAR(20) COMMENT '散剪单价模式：FOLLOW_ORDER/MANUAL';
    END IF;

    -- scatter_cutting_unit_price
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'scatter_cutting_unit_price') THEN
        ALTER TABLE t_production_order ADD COLUMN scatter_cutting_unit_price DECIMAL(10,2) COMMENT '散剪单价快照（元/件）';
    END IF;

    SELECT 't_production_order sync completed' as result;
END//

DELIMITER ;

CALL sync_production_order_columns();

-- Step 5: 检查结果
SELECT 'Final verification:' as step;
SELECT 't_style_info' as tbl, COUNT(*) as columns FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info'
UNION ALL
SELECT 't_production_order', COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order'
UNION ALL
SELECT 't_scan_record', COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record'
UNION ALL
SELECT 't_style_bom', COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_bom';
