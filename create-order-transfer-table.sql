CREATE TABLE IF NOT EXISTS order_transfer (
  id bigint NOT NULL AUTO_INCREMENT,
  order_id varchar(64) NOT NULL,
  from_user_id bigint NOT NULL,
  to_user_id bigint NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  message varchar(500) DEFAULT NULL,
  bundle_ids text DEFAULT NULL,
  process_codes varchar(500) DEFAULT NULL,
  reject_reason varchar(500) DEFAULT NULL,
  created_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  handled_time datetime DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_order_id (order_id),
  KEY idx_from_user_id (from_user_id),
  KEY idx_to_user_id (to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
