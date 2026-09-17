-- D-440：t_style_info 补齐参考竞品"编辑商品(款)"字段集
-- 商品品牌/虚拟分类/供应商款号/款级成本价/重量/单位/商品属性/长宽高/备注/是否里布/打扮尺码/标签/数量
-- （市场吊牌价 tag_price、供应商 supplier 等列已存在，不在此列）
-- 幂等：存储过程逐列判断，重复执行跳过。
DELIMITER //
CREATE PROCEDURE safe_add_style_ref_fields()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'brand') THEN
        ALTER TABLE t_style_info ADD COLUMN brand VARCHAR(64) NULL COMMENT '商品品牌';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'virtual_category') THEN
        ALTER TABLE t_style_info ADD COLUMN virtual_category VARCHAR(64) NULL COMMENT '虚拟分类';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'supplier_style_no') THEN
        ALTER TABLE t_style_info ADD COLUMN supplier_style_no VARCHAR(64) NULL COMMENT '供应商款号';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'cost_price') THEN
        ALTER TABLE t_style_info ADD COLUMN cost_price DECIMAL(12,2) NULL COMMENT '成本价(款级默认,SKU级另有成本)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'weight_kg') THEN
        ALTER TABLE t_style_info ADD COLUMN weight_kg DECIMAL(10,2) NULL COMMENT '重量(kg)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'unit') THEN
        ALTER TABLE t_style_info ADD COLUMN unit VARCHAR(16) NULL DEFAULT '件' COMMENT '单位';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'product_nature') THEN
        ALTER TABLE t_style_info ADD COLUMN product_nature VARCHAR(20) NULL DEFAULT 'finished' COMMENT '商品属性:finished成品/semi_finished半成品/raw_material原材料/packaging包材';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'length_cm') THEN
        ALTER TABLE t_style_info ADD COLUMN length_cm DECIMAL(10,1) NULL COMMENT '长(cm)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'width_cm') THEN
        ALTER TABLE t_style_info ADD COLUMN width_cm DECIMAL(10,1) NULL COMMENT '宽(cm)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'height_cm') THEN
        ALTER TABLE t_style_info ADD COLUMN height_cm DECIMAL(10,1) NULL COMMENT '高(cm)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'remark') THEN
        ALTER TABLE t_style_info ADD COLUMN remark VARCHAR(500) NULL COMMENT '备注';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'has_lining') THEN
        ALTER TABLE t_style_info ADD COLUMN has_lining TINYINT(1) NULL COMMENT '是否里布:0否/1是';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'print_size') THEN
        ALTER TABLE t_style_info ADD COLUMN print_size VARCHAR(128) NULL COMMENT '打扮尺码';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'style_tags') THEN
        ALTER TABLE t_style_info ADD COLUMN style_tags VARCHAR(255) NULL COMMENT '标签';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_style_info' AND column_name = 'attr_quantity') THEN
        ALTER TABLE t_style_info ADD COLUMN attr_quantity VARCHAR(64) NULL COMMENT '数量(类目属性)';
    END IF;
END //
DELIMITER ;
CALL safe_add_style_ref_fields();
DROP PROCEDURE IF EXISTS safe_add_style_ref_fields;
