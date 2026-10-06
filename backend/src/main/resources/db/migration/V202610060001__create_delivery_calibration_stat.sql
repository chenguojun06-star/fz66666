-- D-754 P3：交期偏差回扫自校准统计表
--
-- 【背景】
--   DeliveryDateSuggestionOrchestrator 目前给新订单建议交期时，只用
--   「工厂日均产量 + 在制负荷 + 固定缓冲 5 天」。固定的 5 天缓冲对谁都一样，
--   既没有回看「这家厂过去到底迟没迟过」，也没有回看「平均迟几天 / 迟几倍」。
--   结果：建议值永远乐观或永远保守，不会随真实交付表现自我校正。
--
-- 【本表作用】
--   每天回扫近 N 天已完工订单，按 工厂 / 品类 / 工厂×品类 三个维度计算：
--     准交率 on_time_rate、平均偏差天数 avg_deviation_days、
--     偏差倍数 deviation_multiple（实际周期 ÷ 计划周期）、平均实际周期 avg_lead_days。
--   交期建议器读取本表，用真实偏差自动修正缓冲天数与建议值，实现「越用越准」。
--
-- 【维度键约定】
--   FACTORY            dimension_key = factory_name
--   CATEGORY           dimension_key = product_category
--   FACTORY_CATEGORY   dimension_key = factory_name + '|' + product_category
--
-- 幂等：CREATE TABLE IF NOT EXISTS（MySQL 8.0 支持），重复执行安全。

CREATE TABLE IF NOT EXISTS `t_delivery_calibration_stat` (
    `id`                 BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `tenant_id`          BIGINT       NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）',
    `dimension_type`     VARCHAR(32)  NOT NULL COMMENT '维度类型 FACTORY/CATEGORY/FACTORY_CATEGORY',
    `dimension_key`      VARCHAR(255) NOT NULL COMMENT '维度键（工厂名/品类/工厂|品类）',
    `sample_count`       INT          NOT NULL DEFAULT 0 COMMENT '样本订单数（已完工且计划/实际日期齐全）',
    `on_time_count`      INT          NOT NULL DEFAULT 0 COMMENT '准交订单数（实际完工 ≤ 承诺交期）',
    `on_time_rate`       DECIMAL(5,2) DEFAULT NULL COMMENT '准交率（%）',
    `avg_deviation_days` DECIMAL(6,2) DEFAULT NULL COMMENT '平均偏差天数（正=延期，负=提前）',
    `deviation_multiple` DECIMAL(6,3) DEFAULT NULL COMMENT '偏差倍数=实际生产周期÷计划生产周期',
    `avg_lead_days`      DECIMAL(6,2) DEFAULT NULL COMMENT '平均实际生产周期（天）',
    `last_calc_time`     DATETIME     DEFAULT NULL COMMENT '最近校准时间',
    `create_time`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_delivery_calib` (`tenant_id`, `dimension_type`, `dimension_key`),
    KEY `idx_delivery_calib_tenant` (`tenant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '交期偏差回扫自校准统计';