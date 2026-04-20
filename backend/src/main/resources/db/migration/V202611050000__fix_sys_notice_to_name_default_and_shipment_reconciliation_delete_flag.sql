-- ================================================================
-- 修复1: t_sys_notice.to_name 无默认值导致 INSERT 报错
-- 根因：V202609031000（含此修复）因版本号回退被 Flyway 永久跳过（outOfOrder=false）
-- 错误：Field 'to_name' doesn't have a default value
-- 触发场景：MindPushOrchestrator 发送通知时，to_name 字段未显式赋值
-- ================================================================
-- 仅当 to_name 存在且无默认值时才执行（幂等：若已有 DEFAULT '' 则跳过）
SET @to_name_needs_fix = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_sys_notice'
      AND COLUMN_NAME = 'to_name'
      AND COLUMN_DEFAULT IS NULL
);
SET @s = IF(@to_name_needs_fix > 0,
    'ALTER TABLE `t_sys_notice` MODIFY COLUMN `to_name` VARCHAR(100) NOT NULL DEFAULT \'\'',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ================================================================
-- 修复2: t_shipment_reconciliation 缺少 delete_flag 列
-- 根因：该列在 Entity 中有映射，但从未写入 Flyway 脚本 → 云端/本地均缺失
-- 错误：Unknown column 'delete_flag' in 'where clause'
-- 触发接口：GET /api/finance/shipment-reconciliation/list (逻辑删除过滤条件)
-- ================================================================
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_shipment_reconciliation'
       AND COLUMN_NAME = 'delete_flag') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `delete_flag` TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
