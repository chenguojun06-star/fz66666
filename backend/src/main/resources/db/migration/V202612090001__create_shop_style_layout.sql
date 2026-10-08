-- D-770：店铺详情页「模块化布局」—— 用户可自定义上到下的模块顺序与开关
--
-- 背景（用户诉求）：专业电商平台（淘宝/1688/拼多多）的商品详情不是固定版式，
-- 而是「模块化装修」——提供一组固定模块（图片轮播/价格/标题/服务承诺/颜色/尺码/
-- 参数/详情/洗涤说明/购买），商家可**勾选启用哪些、并调整上到下顺序**。
-- 我们此前是写死的线性 HTML，商家无法调整，与主流做法差距明显。
--
-- 设计取舍（重要）：
--   做「模块开关 + 上下排序」，**不做无限自由拖拽**。
--   理由：① 移动端自由拖拽体验差、保存易错；
--         ② 主流平台实际也是模块化模板而非无限画布；
--         ③ 自由拖拽会导致顾客端加载慢、结构不可控。
--
-- 存储策略：**不预置行**。没有布局配置的款式渲染时用默认顺序（见前端 DEFAULT_MODULES），
-- 避免给 112 款逐个插 11 行数据；商家第一次保存时才写入该款的完整布局快照。
--
-- 幂等：information_schema 判断 + INSERT IGNORE 思路，避免重复执行报错。

SET @schema = DATABASE();

CREATE TABLE IF NOT EXISTS `t_shop_style_layout` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `tenant_id`   BIGINT       NOT NULL                COMMENT '租户ID',
  `style_id`    BIGINT       NOT NULL                COMMENT '款式ID',
  `module_key`  VARCHAR(32)  NOT NULL                COMMENT '模块标识：gallery/price/title/promise/color/size/params/detail/wash/quantity/purchase',
  `sort_order`  INT          NOT NULL DEFAULT 0      COMMENT '排序号，越小越靠上（从上到下）',
  `enabled`     TINYINT      NOT NULL DEFAULT 1      COMMENT '是否启用：1=启用 0=隐藏',
  `module_title` VARCHAR(64)  NULL                    COMMENT '模块标题覆盖（为空用默认文案）',
  `create_time` DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shop_style_module` (`tenant_id`, `style_id`, `module_key`),
  KEY `idx_tenant_style` (`tenant_id`, `style_id`, `sort_order`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '店铺商品详情页模块布局（模块开关 + 上到下顺序）';

-- 幂等补列（防止表已存在但列缺失的场景）
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema
     AND TABLE_NAME='t_shop_style_layout' AND COLUMN_NAME='module_title') > 0,
  'DO 0',
  'ALTER TABLE `t_shop_style_layout` ADD COLUMN `module_title` VARCHAR(64) NULL COMMENT ''模块标题覆盖'''));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;