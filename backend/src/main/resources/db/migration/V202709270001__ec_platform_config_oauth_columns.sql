-- D-587 电商平台店铺 OAuth 授权基建：t_ec_platform_config 增加授权令牌与店铺标识字段
-- 幂等：每列存在性判断后新增，本地/云端可重复执行

DELIMITER //
CREATE PROCEDURE safe_add_ec_oauth_column(IN col_name VARCHAR(64), IN col_def TEXT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 't_ec_platform_config'
        AND column_name = col_name
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE t_ec_platform_config ADD COLUMN ', col_name, ' ', col_def);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

CALL safe_add_ec_oauth_column('shop_code', 'VARCHAR(128) DEFAULT NULL');
CALL safe_add_ec_oauth_column('auth_mode', 'VARCHAR(16) DEFAULT NULL');
CALL safe_add_ec_oauth_column('access_token', 'VARCHAR(1024) DEFAULT NULL');
CALL safe_add_ec_oauth_column('refresh_token', 'VARCHAR(1024) DEFAULT NULL');
CALL safe_add_ec_oauth_column('token_expires_at', 'DATETIME DEFAULT NULL');
CALL safe_add_ec_oauth_column('refresh_expires_at', 'DATETIME DEFAULT NULL');
CALL safe_add_ec_oauth_column('authorized_at', 'DATETIME DEFAULT NULL');
CALL safe_add_ec_oauth_column('auth_state', 'VARCHAR(64) DEFAULT NULL');

DROP PROCEDURE IF EXISTS safe_add_ec_oauth_column;
