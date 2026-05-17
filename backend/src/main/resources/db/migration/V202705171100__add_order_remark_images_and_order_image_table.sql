SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_remark' AND COLUMN_NAME = 'image_urls') = 0,
  'ALTER TABLE t_order_remark ADD COLUMN image_urls TEXT',
  'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS t_order_image (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  order_no VARCHAR(64) NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500),
  sort_order INT DEFAULT 0,
  version INT DEFAULT 1,
  operator_id VARCHAR(36),
  operator_name VARCHAR(64),
  tenant_id BIGINT NOT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  delete_flag INT DEFAULT 0,
  INDEX idx_order_no (order_no),
  INDEX idx_tenant_id (tenant_id)
);

CREATE TABLE IF NOT EXISTS t_order_image_snapshot (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(64) NOT NULL,
  snapshot_type VARCHAR(20) NOT NULL,
  before_urls TEXT,
  after_urls TEXT,
  operator_id VARCHAR(36),
  operator_name VARCHAR(64),
  tenant_id BIGINT NOT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_no (order_no),
  INDEX idx_tenant_id (tenant_id)
);
