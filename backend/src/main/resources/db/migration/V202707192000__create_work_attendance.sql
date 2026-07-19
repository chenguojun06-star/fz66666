-- ==================================================================
-- V202707192000: 创建员工打卡表 t_work_attendance
-- ==================================================================
-- 背景：
--   小云 AI「我的」页面本月工时统计原本复用 selectPersonalStats，
--   但后端 SQL 从不返回 workHours 字段（前端兜底 '--'）。
--   方案 C：独立打卡 —— 手机端首页加打卡入口，本月工时 = SUM(clock_out - clock_in)。
--   PC 端不做打卡功能，仅手机端首页 + 我页面消费。
--
-- 策略：CREATE TABLE IF NOT EXISTS，已存在则跳过，无副作用。
-- 多租户安全（P0 铁律4）：
--   表强制 tenant_id NOT NULL + 索引含 tenant_id + uk 含 tenant_id
-- 关联：P0 #1 Flyway 强制幂等；P0 #4 多租户隔离
-- ==================================================================

CREATE TABLE IF NOT EXISTS `t_work_attendance` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `tenant_id`       BIGINT        NOT NULL COMMENT '租户ID（P0铁律4）',
  `user_id`         VARCHAR(64)   NOT NULL COMMENT '员工ID',
  `user_name`       VARCHAR(64)   DEFAULT NULL COMMENT '员工姓名',
  `factory_id`      VARCHAR(64)   DEFAULT NULL COMMENT '工厂ID',
  `clock_in_time`   DATETIME      DEFAULT NULL COMMENT '上班打卡时间',
  `clock_out_time`  DATETIME      DEFAULT NULL COMMENT '下班打卡时间',
  `work_date`       DATE          NOT NULL COMMENT '打卡日期',
  `work_minutes`    INT           DEFAULT 0 COMMENT '当日工时（分钟）',
  `source`          VARCHAR(16)   DEFAULT 'manual' COMMENT 'manual/auto_scan',
  `location`        VARCHAR(128)  DEFAULT NULL COMMENT '打卡位置',
  `remark`          VARCHAR(255)  DEFAULT NULL COMMENT '备注',
  `delete_flag`     TINYINT       NOT NULL DEFAULT 0 COMMENT '0未删 1已删',
  `create_time`     DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `update_time`     DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_user_date` (`tenant_id`, `user_id`, `work_date`),
  KEY `idx_user_date` (`user_id`, `work_date`),
  KEY `idx_tenant_month` (`tenant_id`, `user_id`, `work_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工打卡记录';
