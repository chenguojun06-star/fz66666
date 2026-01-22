-- 添加质检操作人字段到 t_product_warehousing 表
ALTER TABLE `t_product_warehousing`
ADD COLUMN `quality_operator_id` VARCHAR(64) NULL COMMENT '质检操作人ID' AFTER `delete_flag`,
ADD COLUMN `quality_operator_name` VARCHAR(128) NULL COMMENT '质检操作人姓名' AFTER `quality_operator_id`;
