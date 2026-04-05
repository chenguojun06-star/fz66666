-- 报价单审核功能：添加审核状态和审核意见字段
-- audit_status: 0=待审核（默认）, 1=审核通过, 2=审核驳回
-- audit_remark: 审核意见文本

SET @s1 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_quotation'
       AND COLUMN_NAME  = 'audit_status') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `audit_status` INT NOT NULL DEFAULT 0 AFTER `audit_time`',
    'SELECT 1'
);
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @s2 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_quotation'
       AND COLUMN_NAME  = 'audit_remark') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `audit_remark` VARCHAR(500) DEFAULT NULL AFTER `audit_status`',
    'SELECT 1'
);
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
