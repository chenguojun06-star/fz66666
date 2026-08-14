-- =====================================================================
-- 样衣详情页 - 基础信息 Tab 重构：补齐 t_style_info 扩展字段
-- 新增字段：product_type / theme / designer / supplier / supplier_id /
--          supplier_contact_person / supplier_contact_phone
-- 注意: MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS（MariaDB 专有语法），
--       使用存储过程 + information_schema 实现幂等（参照 V20260615001 模式）
-- 兼容旧库：列已存在时静默跳过
-- =====================================================================

DROP PROCEDURE IF EXISTS _add_style_basic_info_ext_columns;
DELIMITER //
CREATE PROCEDURE _add_style_basic_info_ext_columns()
BEGIN
    -- 1. 商品类型
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='product_type') THEN
        ALTER TABLE t_style_info ADD COLUMN product_type VARCHAR(32) DEFAULT NULL COMMENT '商品类型：FINISHED=成品，SEMI_FINISHED=半成品' AFTER season;
    END IF;
    -- 2. 商品主题
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='theme') THEN
        ALTER TABLE t_style_info ADD COLUMN theme VARCHAR(128) DEFAULT NULL COMMENT '商品主题（字典 dict_type=style_theme）' AFTER product_type;
    END IF;
    -- 3. 设计师
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='designer') THEN
        ALTER TABLE t_style_info ADD COLUMN designer VARCHAR(64) DEFAULT NULL COMMENT '设计师（独立字段，原 sampleNo 保留向后兼容）' AFTER theme;
    END IF;
    -- 4. 供应商名称
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='supplier') THEN
        ALTER TABLE t_style_info ADD COLUMN supplier VARCHAR(128) DEFAULT NULL COMMENT '供应商名称（冗余存储）' AFTER customer;
    END IF;
    -- 5. 供应商ID
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='supplier_id') THEN
        ALTER TABLE t_style_info ADD COLUMN supplier_id VARCHAR(64) DEFAULT NULL COMMENT '供应商ID（关联 t_factory.id）' AFTER supplier;
    END IF;
    -- 6. 供应商联系人
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='supplier_contact_person') THEN
        ALTER TABLE t_style_info ADD COLUMN supplier_contact_person VARCHAR(64) DEFAULT NULL COMMENT '供应商联系人' AFTER supplier_id;
    END IF;
    -- 7. 供应商联系电话
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='supplier_contact_phone') THEN
        ALTER TABLE t_style_info ADD COLUMN supplier_contact_phone VARCHAR(32) DEFAULT NULL COMMENT '供应商联系电话' AFTER supplier_contact_person;
    END IF;
    -- 8. 索引：供应商ID查询使用
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND INDEX_NAME='idx_style_info_supplier_id') THEN
        ALTER TABLE t_style_info ADD INDEX idx_style_info_supplier_id (supplier_id);
    END IF;
END //
DELIMITER ;
CALL _add_style_basic_info_ext_columns();
DROP PROCEDURE IF EXISTS _add_style_basic_info_ext_columns;
