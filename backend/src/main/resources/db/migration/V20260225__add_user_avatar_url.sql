-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V20260225__add_user_avatar_url`;
DELIMITER $$
CREATE PROCEDURE `__mig_V20260225__add_user_avatar_url`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    -- 给 t_user 表添加头像 URL 字段
    ALTER TABLE t_user ADD COLUMN avatar_url VARCHAR(500) DEFAULT NULL COMMENT '用户头像URL（COS存储路径）';

END$$
DELIMITER ;
CALL `__mig_V20260225__add_user_avatar_url`();
DROP PROCEDURE IF EXISTS `__mig_V20260225__add_user_avatar_url`;
