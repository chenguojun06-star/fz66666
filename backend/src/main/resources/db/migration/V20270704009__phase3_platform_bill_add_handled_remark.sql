-- ============================================================
-- Phase 3 修复：t_ec_platform_bill 增加 handled_remark 列
-- 原 V20270704008 中 t_ec_logistics_anomaly 有 handled_remark，
-- 但 t_ec_platform_bill 缺失，导致 Service.markHandled 的 remark 参数无法落库。
-- 幂等：INFORMATION_SCHEMA 检查
-- ============================================================

DROP PROCEDURE IF EXISTS proc_add_handled_remark_to_platform_bill;
DELIMITER //
CREATE PROCEDURE proc_add_handled_remark_to_platform_bill()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_ec_platform_bill'
                     AND COLUMN_NAME = 'handled_remark') THEN
        ALTER TABLE t_ec_platform_bill
            ADD COLUMN handled_remark VARCHAR(512) COMMENT '处理备注' AFTER handled_time;
    END IF;
END //
DELIMITER ;
CALL proc_add_handled_remark_to_platform_bill();
DROP PROCEDURE IF EXISTS proc_add_handled_remark_to_platform_bill;
