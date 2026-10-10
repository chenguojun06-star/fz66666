-- D-800：出库台账补销量趋势查询索引 + 销售渠道字段注释
--
-- 背景：新增「下单时看销量趋势」功能，需要按 tenant_id + style_no/color/size + 时间
-- 聚合 t_product_outstock。生产库该表当前仅 12 条，但订单/库存一旦跑量，
-- 无索引的按日聚合会退化成全表扫描。
--
-- ⚠️ 本脚本**只加索引、不动任何历史数据**：
--   · 全部使用 ADD INDEX IF NOT EXISTS 语义（先查 INFORMATION_SCHEMA 再建）保证幂等；
--   · 不 UPDATE 任何业务列、不 DELETE、不改表结构语义；
--   · 对 12 行的表建索引耗时可忽略，不会锁表阻塞线上请求。
--
-- 索引设计依据（真实查询形态）：
--   ① 趋势按款式聚合：tenant_id + style_no + create_time
--   ② 色码矩阵：tenant_id + style_id + color + size + create_time（按 SKU 粒度出趋势）
--   ③ 渠道拆分：tenant_id + platform_code + create_time
--   ④ 销售口径过滤：outstock_type 参与上述查询的 WHERE 条件

SET @schema = DATABASE();

-- ① 款式级销量趋势：WHERE tenant_id=? AND delete_flag=0 AND outstock_type IN (...) AND create_time BETWEEN ...
SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_product_outstock'
    AND INDEX_NAME = 'idx_outstock_trend_style'
);
SET @ddl := IF(@idx_exists = 0,
  'ALTER TABLE `t_product_outstock` ADD INDEX `idx_outstock_trend_style` (`tenant_id`, `style_no`, `create_time`)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② SKU（款+色+码）级销量趋势：下单页矩阵按色码出图的主查询
--
-- ⚠️ 为什么 color/size 必须用前缀索引（V202708202000 把两列扩到了 VARCHAR(500)）：
--   InnoDB utf8mb4 单列上限 3072 字节，而 500 字符 × 4 字节 = 2000 字节，
--   加上 tenant_id(8) + style_id(36×4=144) + create_time(8) 后**超出上限**，
--   实测报 `Error Code 1071 Specified key was too long; max key length is 3072 bytes`，
--   导致整个迁移失败（Flyway 已自动清理失败记录并回退，服务未受影响，但迁移没生效）。
--   颜色/尺码实际取值（「象牙白」「L(170/84A)」等）远短于 64 字符，
--   取前 64 字符足以区分，且索引体积小得多。
SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_product_outstock'
    AND INDEX_NAME = 'idx_outstock_trend_sku'
);
SET @ddl := IF(@idx_exists = 0,
  'ALTER TABLE `t_product_outstock` ADD INDEX `idx_outstock_trend_sku` (`tenant_id`, `style_id`, `color`(64), `size`(64), `create_time`)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ③ 渠道维度销量：WHERE tenant_id=? AND platform_code IS NOT NULL AND create_time BETWEEN ...
SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_product_outstock'
    AND INDEX_NAME = 'idx_outstock_channel'
);
SET @ddl := IF(@idx_exists = 0,
  'ALTER TABLE `t_product_outstock` ADD INDEX `idx_outstock_channel` (`tenant_id`, `platform_code`, `create_time`)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ④ 冲销排查：按 reversal_id 找冲销记录（冲销数量已改为负数，此索引便于对账）
SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_product_outstock'
    AND INDEX_NAME = 'idx_outstock_reversal_id'
);
SET @ddl := IF(@idx_exists = 0,
  'ALTER TABLE `t_product_outstock` ADD INDEX `idx_outstock_reversal_id` (`reversal_id`)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;