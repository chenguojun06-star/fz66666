-- =====================================================================
-- V202710140001：修复工资打款 SQL 引用不存在列导致的线上报错（P0）
--
-- 背景（2026-10-14 全项目列名核对，生产库实测）：
--   PayrollSettlementMapper.atomicAddPaidAmount 的 UPDATE 写了
--   `settlement_time = CASE ... THEN NOW() ELSE settlement_time END`，
--   但 t_payroll_settlement 从来没有这一列 ——
--   在生产库实跑：ERROR 1054 (42S22) Unknown column 'settlement_time' in 'field list'。
--   该方法在 @Transactional 内且无 try/catch，异常直接冒泡回滚，
--   所以**工资打款一点就 500，功能完全不可用**。
--
-- 根因：这条 SQL 是照着 ProductOutstockMapper.atomicAddPaidAmount 抄的，
--   t_product_outstock 在 V202608031000 里补过 settlement_time，
--   而 t_payroll_settlement 从没补 —— 抄了语句、漏了列。
--
-- 为什么补列而不是改 SQL：
--   列的语义是明确的（结算时间 = 该结算单被全额付清的时刻），
--   且与 t_product_outstock 的 settlement_time 完全同构；
--   把 SQL 改成不带这列会静默丢掉"何时付清"这一信息，
--   payment_status 只能说明"已付清"、说明不了"什么时候付清"。
--   已确认全仓除此之外没有任何地方读写 payroll 的 settlement_time
--   （实体字段也一直没有），补列不会影响既有行为。
-- =====================================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_payroll_settlement'
               AND COLUMN_NAME = 'settlement_time') = 0,
    'ALTER TABLE `t_payroll_settlement` ADD COLUMN `settlement_time` DATETIME DEFAULT NULL COMMENT ''结算时间'' AFTER `payment_status`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
