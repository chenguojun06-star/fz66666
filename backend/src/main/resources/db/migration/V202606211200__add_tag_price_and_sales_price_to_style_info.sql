-- =====================================================
-- 样衣资料表添加吊牌价和销售价字段
-- 执行时间: 2026-06-21
-- 用途: 样衣开发过程中记录吊牌价与销售价，用于报价、结算和打印模板
-- 注意: MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，使用存储过程实现幂等
-- =====================================================

-- 幂等添加列的存储过程
DROP PROCEDURE IF EXISTS _add_style_price_columns;
DELIMITER //
CREATE PROCEDURE _add_style_price_columns()
BEGIN
    -- 1. 吊牌价
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='tag_price') THEN
        ALTER TABLE t_style_info ADD COLUMN tag_price DECIMAL(12,2) DEFAULT NULL COMMENT '吊牌价（选填）' AFTER price;
    END IF;
    -- 2. 销售价
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='sales_price') THEN
        ALTER TABLE t_style_info ADD COLUMN sales_price DECIMAL(12,2) DEFAULT NULL COMMENT '销售价（选填）' AFTER tag_price;
    END IF;
END //
DELIMITER ;
CALL _add_style_price_columns();
DROP PROCEDURE IF EXISTS _add_style_price_columns;
