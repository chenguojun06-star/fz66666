-- V20260420001: 补全 t_production_order 云端缺失的 3 列
-- 根因：这 3 列在开发机是手动 ALTER 添加的，从未有 Flyway 脚本 → 云端 DB 缺失 → 下单 HTTP 500
-- qr_code 在 ProductionOrderServiceImpl:116 中【始终】设为 orderNo（非null），cloud INSERT 必失败
-- 幂等写法：先查 INFORMATION_SCHEMA，列不存在才执行 ALTER TABLE，安全可重入

-- ① qr_code — 订单二维码（始终写入，是 buildWorkflowJson 500 的真正元凶）
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 't_production_order'
     AND COLUMN_NAME  = 'qr_code') = 0,
  'ALTER TABLE `t_production_order` ADD COLUMN `qr_code` VARCHAR(100) DEFAULT NULL COMMENT ''订单二维码''',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② factory_contact_person — 工厂联系人快照（下单时从工厂记录复制）
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 't_production_order'
     AND COLUMN_NAME  = 'factory_contact_person') = 0,
  'ALTER TABLE `t_production_order` ADD COLUMN `factory_contact_person` VARCHAR(50) DEFAULT NULL COMMENT ''工厂联系人快照''',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ③ factory_contact_phone — 工厂联系电话快照（下单时从工厂记录复制）
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 't_production_order'
     AND COLUMN_NAME  = 'factory_contact_phone') = 0,
  'ALTER TABLE `t_production_order` ADD COLUMN `factory_contact_phone` VARCHAR(20) DEFAULT NULL COMMENT ''工厂联系电话快照''',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
