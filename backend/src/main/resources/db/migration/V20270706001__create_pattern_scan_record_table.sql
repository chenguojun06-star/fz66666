-- ============================================================
-- 标题：t_pattern_scan_record 初始建表（补齐历史 ALTER 迁移依赖）
-- 背景：该表历史上通过多次 ALTER TABLE 累积建表，缺少初始 CREATE TABLE，
--      导致新环境首次部署时所有依赖该表的 ALTER 迁移都会失败。
-- 策略：CREATE TABLE IF NOT EXISTS，生产环境已有该表则跳过，无副作用。
-- 关联：P0 #1 Flyway 强制幂等；P0 #4 多租户隔离
-- ============================================================

CREATE TABLE IF NOT EXISTS `t_pattern_scan_record` (
    `id`                     VARCHAR(64)   NOT NULL,
    `pattern_production_id`  VARCHAR(64)   DEFAULT NULL COMMENT '样板生产单ID',
    `style_id`               VARCHAR(64)   DEFAULT NULL COMMENT '款式ID',
    `style_no`               VARCHAR(64)   DEFAULT NULL COMMENT '款号',
    `style_name`             VARCHAR(255)  DEFAULT NULL COMMENT '款名',
    `color`                  VARCHAR(50)   DEFAULT NULL COMMENT '颜色',
    `size`                   VARCHAR(32)   DEFAULT NULL COMMENT '尺码',
    `quantity`               INT           DEFAULT NULL COMMENT '本次扫码数量',
    `operation_type`         VARCHAR(32)   DEFAULT NULL COMMENT '操作类型(RECEIVE/PLATE/COMPLETE/WAREHOUSE_IN...)',
    `process_name`           VARCHAR(100)  DEFAULT NULL COMMENT '工序名称',
    `progress_stage`         VARCHAR(100)  DEFAULT NULL COMMENT '进度阶段',
    `process_code`           VARCHAR(50)   DEFAULT NULL COMMENT '工序编码',
    `operator_id`            VARCHAR(64)   DEFAULT NULL COMMENT '操作员ID',
    `operator_name`          VARCHAR(100)  DEFAULT NULL COMMENT '操作员姓名',
    `operator_role`          VARCHAR(32)   DEFAULT NULL COMMENT '操作员角色',
    `scan_time`              DATETIME      DEFAULT NULL COMMENT '扫码时间',
    `warehouse_code`         VARCHAR(64)   DEFAULT NULL COMMENT '仓库编码',
    `warehouse_area_id`      VARCHAR(64)   DEFAULT NULL COMMENT '库区ID',
    `warehouse_location_code` VARCHAR(64)  DEFAULT NULL COMMENT '库位编码',
    `remark`                 VARCHAR(500)  DEFAULT NULL COMMENT '备注',
    `create_time`            DATETIME      DEFAULT CURRENT_TIMESTAMP,
    `delete_flag`            INT           DEFAULT 0,
    `tenant_id`              BIGINT        DEFAULT NULL COMMENT '租户ID',
    PRIMARY KEY (`id`),
    INDEX `idx_psr_tenant_id`        (`tenant_id`),
    INDEX `idx_psr_production_id`    (`pattern_production_id`),
    INDEX `idx_psr_operator_id`      (`operator_id`),
    INDEX `idx_psr_scan_time`        (`scan_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样衣扫码记录表';
