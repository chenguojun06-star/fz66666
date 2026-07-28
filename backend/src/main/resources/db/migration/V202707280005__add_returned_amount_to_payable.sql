-- 为 Payable 表新增 returned_amount 字段
-- 修复漏洞 #2：PurchaseReturnStockHelper.decreasePayable 应付冲减语义错误
-- 原实现：退货金额作为负数写入 paid_amount，导致"已付款金额"虚高/虚低
-- 修复方案：新增 returned_amount 字段单独记录退货冲减金额
-- 关联铁律：P0 #1 Flyway迁移必须幂等 / D-022 财务数据链路闭环

-- 1. 新增 returned_amount 字段（SET @s 内禁止 COMMENT ''xxx''，避免 Flyway 静默失败）
SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payable' AND COLUMN_NAME='returned_amount'),
  'ALTER TABLE t_payable ADD COLUMN returned_amount DECIMAL(18,2) DEFAULT 0.00',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 独立 ALTER MODIFY 追加注释（参照 V202707221000 安全模板）
SET @cmt = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payable' AND COLUMN_NAME='returned_amount'
  AND COLUMN_COMMENT != '退货冲减金额（采购退货时累计）');
SET @s_cmt = IF(@cmt>0,
  'ALTER TABLE t_payable MODIFY COLUMN returned_amount DECIMAL(18,2) DEFAULT 0.00 COMMENT ''退货冲减金额（采购退货时累计）''',
  'SELECT 1');
PREPARE stmt FROM @s_cmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 回填默认值（历史数据 returned_amount = 0）
UPDATE t_payable SET returned_amount = 0 WHERE returned_amount IS NULL;

-- 4. 新增 returned_amount 索引（按供应商+退货状态查询）
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payable' AND INDEX_NAME='idx_returned_amount');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_payable ADD INDEX idx_returned_amount (returned_amount)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;
