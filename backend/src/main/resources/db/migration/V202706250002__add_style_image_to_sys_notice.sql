-- 给 t_sys_notice 增加 style_image 字段，通知里显示款式图
-- 幂等：用存储过程 + information_schema 判断

DROP PROCEDURE IF EXISTS add_sys_notice_style_image;

DELIMITER $$
CREATE PROCEDURE add_sys_notice_style_image()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_sys_notice'
          AND COLUMN_NAME = 'style_image'
    ) THEN
        ALTER TABLE t_sys_notice ADD COLUMN style_image VARCHAR(512) COMMENT '款式图片URL';
    END IF;
END$$
DELIMITER ;

CALL add_sys_notice_style_image();
DROP PROCEDURE IF EXISTS add_sys_notice_style_image;
