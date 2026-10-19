-- D-826：料卷级用料登记 —— t_material_roll 增加裁剪台账关联与实际消耗
--
-- 背景：D-823 建了「裁剪任务 × 物料」台账（任务级总账），但车间实际是按卷管理的：
--   一批料领若干卷，裁剪后有的卷用完、有的卷剩一段，剩的这段要精确知道是哪卷剩的。
-- 本迁移给料卷补两个可空字段，支撑卷级登记；存量卷 NULL 不受任何影响。
--
-- 口径：
--   cutting_usage_id  关联 t_cutting_material_usage 行（登记实际消耗时回写）
--   used_quantity     本卷实际消耗（登记时回写）；本卷剩余 = quantity - used_quantity
--
-- 状态机不动：发料/退回仍走 scanRoll（IN_STOCK→ISSUED→RETURNED），
-- 卷级登记只回写这两个字段 + 生成余料卷，不改卷状态——避免动仓管在用的扫码链路。

SET @schema = DATABASE();

-- 1) cutting_usage_id（幂等：information_schema 判断后补列）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_material_roll' AND COLUMN_NAME = 'cutting_usage_id');
SET @ddl = IF(@col_exists = 0,
  'ALTER TABLE `t_material_roll` ADD COLUMN `cutting_usage_id` VARCHAR(64) NULL COMMENT ''D-826 关联裁剪用料台账行ID''',
  'SELECT ''cutting_usage_id already exists''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) used_quantity
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_material_roll' AND COLUMN_NAME = 'used_quantity');
SET @ddl = IF(@col_exists = 0,
  'ALTER TABLE `t_material_roll` ADD COLUMN `used_quantity` DECIMAL(14,4) NULL COMMENT ''D-826 本卷实际消耗（登记时回写），剩余=quantity-used_quantity''',
  'SELECT ''used_quantity already exists''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) 索引：按台账行反查卷
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_material_roll' AND INDEX_NAME = 'idx_roll_cutting_usage');
SET @ddl = IF(@idx_exists = 0,
  'CREATE INDEX `idx_roll_cutting_usage` ON `t_material_roll` (`cutting_usage_id`)',
  'SELECT ''idx_roll_cutting_usage already exists''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
