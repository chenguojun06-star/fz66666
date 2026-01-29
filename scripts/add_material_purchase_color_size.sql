-- 为物料采购表添加颜色和尺码字段
-- 用于从样衣生产同步颜色和尺码信息

ALTER TABLE `t_material_purchase`
ADD COLUMN `color` VARCHAR(50) COMMENT '颜色（从样衣同步）' AFTER `style_cover`,
ADD COLUMN `size` VARCHAR(100) COMMENT '尺码（从样衣同步）' AFTER `color`;
