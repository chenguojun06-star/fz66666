-- ============================================================
-- V20260618001__create_color_card_tables.sql
-- 色卡本表（母卡）+ 色卡条目表（子卡）
-- 使用存储过程 + information_schema 检查实现幂等
-- ============================================================

DROP PROCEDURE IF EXISTS _create_color_card_tables;

DELIMITER //

CREATE PROCEDURE _create_color_card_tables()
BEGIN
    -- 1. 创建色卡本表 (t_color_card)
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_color_card') THEN
        CREATE TABLE t_color_card (
            id VARCHAR(64) NOT NULL COMMENT '主键ID',
            color_card_code VARCHAR(100) NOT NULL COMMENT '色卡本编号',
            color_card_name VARCHAR(200) NOT NULL COMMENT '色卡本名称',
            material_type VARCHAR(50) DEFAULT NULL COMMENT '物料类型 fabric/lining/accessory',
            fabric_width VARCHAR(100) DEFAULT NULL COMMENT '幅宽',
            specifications VARCHAR(200) DEFAULT NULL COMMENT '规格',
            fabric_weight VARCHAR(100) DEFAULT NULL COMMENT '克重',
            fabric_composition VARCHAR(200) DEFAULT NULL COMMENT '成分',
            unit VARCHAR(50) DEFAULT NULL COMMENT '单位',
            supplier_id VARCHAR(64) DEFAULT NULL COMMENT '供应商ID',
            supplier_name VARCHAR(200) DEFAULT NULL COMMENT '供应商名称',
            supplier_contact_person VARCHAR(100) DEFAULT NULL COMMENT '供应商联系人',
            supplier_contact_phone VARCHAR(100) DEFAULT NULL COMMENT '供应商联系电话',
            image VARCHAR(500) DEFAULT NULL COMMENT '色卡本封面图片',
            remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
            status VARCHAR(20) DEFAULT 'pending' COMMENT '状态 pending/completed',
            color_count INT DEFAULT 0 COMMENT '颜色数量',
            tenant_id BIGINT DEFAULT NULL COMMENT '租户ID',
            delete_flag INT DEFAULT 0,
            create_time DATETIME DEFAULT NULL,
            update_time DATETIME DEFAULT NULL,
            PRIMARY KEY (id),
            KEY idx_color_card_tenant_id (tenant_id),
            KEY idx_color_card_code (color_card_code),
            KEY idx_color_card_material_type (material_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='色卡本/母卡表';
    END IF;

    -- 2. 创建色卡条目表 (t_color_card_item)
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_color_card_item') THEN
        CREATE TABLE t_color_card_item (
            id VARCHAR(64) NOT NULL COMMENT '主键ID',
            color_card_id VARCHAR(64) NOT NULL COMMENT '色卡本ID',
            color_no VARCHAR(100) NOT NULL COMMENT '颜色编号',
            color_name VARCHAR(200) DEFAULT NULL COMMENT '颜色名称',
            unit_price DECIMAL(12,2) DEFAULT NULL COMMENT '单价',
            image VARCHAR(500) DEFAULT NULL COMMENT '颜色图片',
            remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
            sort_order INT DEFAULT 0 COMMENT '排序',
            tenant_id BIGINT DEFAULT NULL COMMENT '租户ID',
            delete_flag INT DEFAULT 0,
            create_time DATETIME DEFAULT NULL,
            update_time DATETIME DEFAULT NULL,
            PRIMARY KEY (id),
            KEY idx_color_card_item_card_id (color_card_id),
            KEY idx_color_card_item_color_no (color_no),
            KEY idx_color_card_item_tenant_id (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='色卡条目/子卡表';
    END IF;
END //

DELIMITER ;

CALL _create_color_card_tables();
DROP PROCEDURE IF EXISTS _create_color_card_tables;
