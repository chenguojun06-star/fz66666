-- D-136: 扣款项增加结算标记，支撑工厂结算差额滚存
-- 扣款项被纳入某次工厂终审推送后置 settle_flag=1，未抵扣完的扣款（扣款>加工费的差额、
-- 或本月手动取消勾选的）保持 0，下月汇总时自动出现在抵扣清单里 → 天然滚存。
-- 幂等：存储过程包裹 ADD COLUMN，重复执行跳过。
DELIMITER //
CREATE PROCEDURE safe_add_settle_flag()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 't_deduction_item'
        AND column_name = 'settle_flag'
    ) THEN
        ALTER TABLE t_deduction_item ADD COLUMN settle_flag TINYINT(1) DEFAULT 0 COMMENT '是否已纳入工厂结算抵扣: 0=未抵扣 1=已抵扣';
    END IF;
END //
DELIMITER ;
CALL safe_add_settle_flag();
DROP PROCEDURE IF EXISTS safe_add_settle_flag;
