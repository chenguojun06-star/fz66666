-- V20260617003__create_color_card_tables.sql
-- 创建色卡本系统表（母卡+子卡结构）
-- 必须在 V20260617002 之前执行

DROP PROCEDURE IF EXISTS _create_color_card_tables;
DELIMITER //
CREATE PROCEDURE _create_color_card_tables()
BEGIN
    -- 1. 创建色卡本表 (t_color_card)
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_color_card') THEN
        CREATE TABLE t_color_card (
            id VARCHAR(64) PRIMARY KEY COMMENT '主键ID',
            tenant_id BIGINT NOT NULL COMMENT '租户ID',
            color_card_code VARCHAR(100) NOT NULL COMMENT '色卡本编号',
            color_card_name VARCHAR(200) NOT NULL COMMENT '色卡本名称',
            supplier_id VARCHAR(64) COMMENT '供应商ID',
            supplier_name VARCHAR(200) COMMENT '供应商名称',
            material_type VARCHAR(50) COMMENT '物料类型（面料/辅料/里料）',
            fabric_width VARCHAR(50) COMMENT '幅宽(cm)',
            fabric_weight VARCHAR(50) COMMENT '克重(GSM)',
            fabric_composition VARCHAR(500) COMMENT '成分含量',
            remark TEXT COMMENT '备注',
            material_id VARCHAR(64) DEFAULT NULL COMMENT '关联的物料ID',
            delete_flag TINYINT(1) DEFAULT 0 COMMENT '删除标志(0=未删除,1=已删除)',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
            create_by VARCHAR(64) COMMENT '创建人',
            update_by VARCHAR(64) COMMENT '更新人',
            KEY idx_color_card_tenant_id (tenant_id),
            KEY idx_color_card_code (color_card_code),
            KEY idx_color_card_material_type (material_type),
            KEY idx_cc_material_id (material_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='色卡本主表';
    END IF;

    -- 2. 创建色卡条目表 (t_color_card_item)
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_color_card_item') THEN
        CREATE TABLE t_color_card_item (
            id VARCHAR(64) PRIMARY KEY COMMENT '主键ID',
            tenant_id BIGINT NOT NULL COMMENT '租户ID',
            color_card_id VARCHAR(64) NOT NULL COMMENT '色卡本ID',
            color_no VARCHAR(50) COMMENT '颜色编号',
            color_name VARCHAR(100) COMMENT '颜色名称',
            color_code VARCHAR(50) COMMENT '色号(如Pantone编号)',
            color_value VARCHAR(20) COMMENT '色值(如#FF5733)',
            unit_price DECIMAL(12,4) DEFAULT 0 COMMENT '单价(元/单位)',
            unit VARCHAR(50) DEFAULT '元/米' COMMENT '单位',
            image_url VARCHAR(500) COMMENT '颜色图片URL',
            remark TEXT COMMENT '备注',
            delete_flag TINYINT(1) DEFAULT 0 COMMENT '删除标志(0=未删除,1=已删除)',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
            create_by VARCHAR(64) COMMENT '创建人',
            update_by VARCHAR(64) COMMENT '更新人',
            KEY idx_color_card_item_card_id (color_card_id),
            KEY idx_color_card_item_color_no (color_no),
            KEY idx_color_card_item_tenant_id (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='色卡本颜色条目表';
    END IF;
END //
DELIMITER ;
CALL _create_color_card_tables();
DROP PROCEDURE IF EXISTS _create_color_card_tables;
