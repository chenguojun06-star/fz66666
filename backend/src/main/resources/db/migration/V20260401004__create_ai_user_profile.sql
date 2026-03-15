-- AI 用户长程事实与习惯画像表
CREATE TABLE IF NOT EXISTS t_ai_user_profile (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    behavior_summary TEXT COMMENT '工作习惯文字描述摘要',
    preferences_json TEXT COMMENT '结构化偏好',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_tenant_user (tenant_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI用户长程习惯画像表';
