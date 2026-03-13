-- V46: Stage5预测引擎日志表 + Stage7视觉AI日志表 + Stage8跨租户基准快照表
-- 幂等建表，重复执行安全

-- ① t_forecast_log：成本/需求/物料用量预测日志
CREATE TABLE IF NOT EXISTS `t_forecast_log` (
  `id`             BIGINT       NOT NULL AUTO_INCREMENT,
  `tenant_id`      BIGINT       NOT NULL,
  `forecast_type`  VARCHAR(32)  NOT NULL COMMENT 'COST/DEMAND/MATERIAL',
  `subject_id`     VARCHAR(64)  DEFAULT NULL COMMENT '关联对象ID(订单ID/款式ID/物料编码)',
  `subject_type`   VARCHAR(32)  DEFAULT NULL COMMENT 'ORDER/STYLE/MATERIAL',
  `predicted_value` DECIMAL(14,2) DEFAULT NULL COMMENT '预测值（金额/件数/用量）',
  `confidence`     INT          DEFAULT NULL COMMENT '置信度 0-100',
  `horizon_label`  VARCHAR(32)  DEFAULT NULL COMMENT '预测地平线（本单/下月/下季）',
  `algorithm`      VARCHAR(64)  DEFAULT NULL COMMENT '算法标识',
  `extra_data`     TEXT         DEFAULT NULL COMMENT '补充JSON（区间、明细、偏差等）',
  `create_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_forecast_tenant_type` (`tenant_id`, `forecast_type`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能预测引擎日志（成本/需求/物料）';

-- ② t_visual_ai_log：视觉AI分析日志
CREATE TABLE IF NOT EXISTS `t_visual_ai_log` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `tenant_id`     BIGINT       NOT NULL,
  `order_id`      VARCHAR(64)  DEFAULT NULL,
  `image_url`     TEXT         NOT NULL COMMENT 'COS图片URL',
  `task_type`     VARCHAR(32)  NOT NULL COMMENT 'DEFECT_DETECT/STYLE_IDENTIFY/COLOR_CHECK',
  `detected_items` TEXT        DEFAULT NULL COMMENT '检测结果JSON数组',
  `confidence`    INT          DEFAULT NULL COMMENT '平均置信度 0-100',
  `severity`      VARCHAR(16)  DEFAULT NULL COMMENT 'NONE/LOW/MEDIUM/HIGH/CRITICAL',
  `status`        VARCHAR(16)  NOT NULL DEFAULT 'DONE' COMMENT 'DONE/FAILED',
  `operator_id`   VARCHAR(64)  DEFAULT NULL,
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_visual_log_tenant` (`tenant_id`, `task_type`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='视觉AI分析日志';

-- ③ t_benchmark_snapshot：跨租户匿名基准快照（每日计算一次）
CREATE TABLE IF NOT EXISTS `t_benchmark_snapshot` (
  `id`                   BIGINT     NOT NULL AUTO_INCREMENT,
  `tenant_id`            BIGINT     NOT NULL,
  `snapshot_date`        DATE       NOT NULL,
  `overdue_rate`         DECIMAL(5,2) DEFAULT NULL COMMENT '逾期率(%)',
  `avg_completion_rate`  DECIMAL(5,2) DEFAULT NULL COMMENT '平均完成率(%)',
  `on_time_delivery_rate` DECIMAL(5,2) DEFAULT NULL COMMENT '准时交货率(%)',
  `defect_rate`          DECIMAL(5,2) DEFAULT NULL COMMENT '次品率(%)',
  `efficiency_score`     DECIMAL(5,2) DEFAULT NULL COMMENT '综合效率分(0-100)',
  `percentile_rank`      INT        DEFAULT NULL COMMENT '行业百分位排名(越高越好)',
  `peer_count`           INT        DEFAULT NULL COMMENT '参与对标的租户总数',
  `industry_median`      DECIMAL(5,2) DEFAULT NULL COMMENT '行业中位效率分',
  `create_time`          DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_snapshot_tenant_date` (`tenant_id`, `snapshot_date`),
  INDEX `idx_snapshot_date` (`snapshot_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='跨租户匿名基准快照（每日）';
