-- V202606191001__create_material_color_card_tables.sql
-- 物料资料色卡系统表（母卡+子条目结构）
-- 母卡: 以供应商为维度组织物料资料（一张母卡 = 一家供应商）
-- 子条目: 具体的物料资料（来自 t_material_database）

DROP PROCEDURE IF EXISTS _create_material_color_card_tables;
DELIMITER //
CREATE PROCEDURE _create_material_color_card_tables()
BEGIN
    -- 1. 创建物料色卡母卡表 (t_material_color_card)
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_color_card') THEN
        CREATE TABLE t_material_color_card (
            id VARCHAR(64) PRIMARY KEY COMMENT '主键ID',
            tenant_id BIGINT NOT NULL COMMENT '租户ID',
            card_code VARCHAR(100) NOT NULL COMMENT '母卡编号（如 MCC2026061901）',
            card_name VARCHAR(200) NOT NULL COMMENT '母卡名称（如 某某纺织-春夏面料色卡）',
            supplier_id VARCHAR(64) COMMENT '供应商ID（关联 t_factory）',
            supplier_name VARCHAR(200) COMMENT '供应商名称',
            supplier_contact_person VARCHAR(100) COMMENT '供应商联系人',
            supplier_contact_phone VARCHAR(50) COMMENT '供应商联系电话',
            material_type VARCHAR(50) COMMENT '主要物料类型（fabric/lining/accessory）',
            fabric_width VARCHAR(50) COMMENT '幅宽(cm)',
            specifications VARCHAR(200) COMMENT '规格',
            fabric_weight VARCHAR(50) COMMENT '克重(GSM)',
            fabric_composition VARCHAR(500) COMMENT '成分含量',
            unit VARCHAR(50) COMMENT '单位',
            cover_image VARCHAR(500) COMMENT '封面图片URL',
            remark TEXT COMMENT '备注',
            status VARCHAR(20) DEFAULT 'pending' COMMENT '状态',
            material_count INT DEFAULT 0 COMMENT '子物料数量',
            delete_flag TINYINT(1) DEFAULT 0 COMMENT '删除标志(0=未删除,1=已删除)',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
            KEY idx_mcc_tenant_id (tenant_id),
            KEY idx_mcc_card_code (card_code),
            KEY idx_mcc_supplier_id (supplier_id),
            KEY idx_mcc_material_type (material_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物料色卡母卡主表';
    END IF;

    -- 2. 创建物料色卡条目表 (t_material_color_card_item)
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_color_card_item') THEN
        CREATE TABLE t_material_color_card_item (
            id VARCHAR(64) PRIMARY KEY COMMENT '主键ID',
            tenant_id BIGINT NOT NULL COMMENT '租户ID',
            material_color_card_id VARCHAR(64) NOT NULL COMMENT '母卡ID（关联 t_material_color_card）',
            material_id VARCHAR(64) COMMENT '关联的物料资料ID（t_material_database）',
            material_code VARCHAR(100) COMMENT '物料编号（冗余，便于检索）',
            material_name VARCHAR(200) COMMENT '物料名称（冗余）',
            material_type VARCHAR(50) COMMENT '物料类型（冗余）',
            color VARCHAR(100) COMMENT '颜色（冗余）',
            fabric_width VARCHAR(50) COMMENT '幅宽（冗余）',
            fabric_weight VARCHAR(50) COMMENT '克重（冗余）',
            fabric_composition VARCHAR(500) COMMENT '成分（冗余）',
            specifications VARCHAR(200) COMMENT '规格（冗余）',
            unit VARCHAR(50) COMMENT '单位（冗余）',
            unit_price DECIMAL(12,4) DEFAULT 0 COMMENT '单价',
            image VARCHAR(500) COMMENT '物料图片URL',
            remark TEXT COMMENT '备注',
            sort_order INT DEFAULT 0 COMMENT '排序',
            delete_flag TINYINT(1) DEFAULT 0 COMMENT '删除标志(0=未删除,1=已删除)',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
            KEY idx_mcci_card_id (material_color_card_id),
            KEY idx_mcci_tenant_id (tenant_id),
            KEY idx_mcci_material_id (material_id),
            KEY idx_mcci_material_code (material_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物料色卡子条目表';
    END IF;
END //
DELIMITER ;
CALL _create_material_color_card_tables();
DROP PROCEDURE IF EXISTS _create_material_color_card_tables;
