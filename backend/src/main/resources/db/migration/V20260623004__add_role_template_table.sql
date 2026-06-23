-- 角色模板表（幂等创建）
-- 通过 information_schema 判断表是否存在

SET @tb_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_role_template');
SET @s = IF(@tb_exists = 0, 'CREATE TABLE t_role_template (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_code VARCHAR(64) NOT NULL UNIQUE,
  template_name VARCHAR(128) NOT NULL,
  template_desc VARCHAR(512),
  category VARCHAR(32) DEFAULT ''CUSTOM'',
  is_default TINYINT DEFAULT 0,
  permissions_json TEXT,
  permission_range VARCHAR(32) DEFAULT ''team'',
  sort_order INT DEFAULT 0,
  enabled TINYINT DEFAULT 1,
  delete_flag TINYINT DEFAULT 0,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_category (category),
  KEY idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
