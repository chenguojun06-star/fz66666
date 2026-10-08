-- D-769：店铺服务承诺改为商家可配置
--
-- 背景：顾客端详情页与列表页**写死**展示「7 天无理由」「现货速发」
-- （ShopPublic 页面 index.html 第 498/501 行），商家既不能配置，
-- 系统里也没有任何退货/换货政策数据支撑这两句话 ——
-- 属于典型的「空头承诺」：写了就要兑现，兑现不了就是纠纷与投诉。
--
-- 做法：不默认承诺，改为商家显式开关。
--   1. 三项承诺默认**全部关闭**，顾客端不再凭空出现；
--   2. 商家在店铺配置里按自身能力开启；
--   3. 开启无理由退货时**必须填天数**（不填天数就不能开），
--      因为「7 天」这种具体承诺必须有实际规则支撑。
--
-- 幂等：全部按 information_schema 判断，避免重复执行报 Duplicate column。

SET @schema = DATABASE();

-- 1. 7 天无理由（天数为 0 表示不承诺；有值才对外展示）
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_shop_config'
      AND COLUMN_NAME = 'return_days') > 0,
  'DO 0',
  'ALTER TABLE `t_shop_config` ADD COLUMN `return_days` INT NOT NULL DEFAULT 0 COMMENT ''无理由退货天数，0=不承诺；开启时必须填写实际天数'''
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 现货速发
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_shop_config'
      AND COLUMN_NAME = 'promise_in_stock') > 0,
  'DO 0',
  'ALTER TABLE `t_shop_config` ADD COLUMN `promise_in_stock` TINYINT NOT NULL DEFAULT 0 COMMENT ''现货速发承诺开关，0=不承诺'''
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 正品保障
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_shop_config'
      AND COLUMN_NAME = 'promise_authentic') > 0,
  'DO 0',
  'ALTER TABLE `t_shop_config` ADD COLUMN `promise_authentic` TINYINT NOT NULL DEFAULT 0 COMMENT ''正品保障承诺开关，0=不承诺'''
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. 其他承诺的自定义补充（如「支持一件代发」「当天打样」）
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_shop_config'
      AND COLUMN_NAME = 'promise_extra') > 0,
  'DO 0',
  'ALTER TABLE `t_shop_config` ADD COLUMN `promise_extra` VARCHAR(255) NULL COMMENT ''其它服务承诺，自由文本（逗号分隔），为空则不展示'''
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;