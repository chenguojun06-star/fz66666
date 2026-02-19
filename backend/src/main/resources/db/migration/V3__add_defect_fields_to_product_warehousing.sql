ALTER TABLE t_product_warehousing
  ADD COLUMN defect_category VARCHAR(64) NULL COMMENT '次品类别' AFTER unqualified_image_urls,
  ADD COLUMN defect_remark VARCHAR(500) NULL COMMENT '次品备注' AFTER defect_category;
