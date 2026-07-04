-- ================================================================
-- V20270704001: 多租户字段配置系统 + 用户统一偏好表
--
-- 背景：
--   全系统多端适配不同租户的字段/显示定制需求（P0 落地）
--   - 租户管理员可配置业务对象的字段显隐/顺序/标签/必填
--   - 用户可保存表格列显隐/排序/分页大小等显示偏好
--   - 三端（PC/H5/小程序）共享同一份字段配置 schema
--
-- 策略：
--   1. 建 t_field_config（字段元数据配置表，每租户每业务每字段一行）
--   2. 建 t_user_preference（用户统一偏好表，替代散落的 localStorage）
--   3. 给 t_style_info 加 ext_json 列（试点业务表，承载自定义字段值）
--
-- 设计要点：
--   - 多租户隔离：两表均带 tenant_id（P0 铁律 4）
--   - 字段级权限：visible_roles/editable_roles JSON 数组
--   - 三端覆盖：pc_widget/h5_widget/mp_widget 一行配置三端用
--   - ext_json：MySQL 8.0 函数索引可过滤，单行读取快
--
-- 幂等性：所有操作前用 INFORMATION_SCHEMA 检查
-- ================================================================

SET @dbname = DATABASE();

-- ----------------------------------------------------------------
-- 1. 新建 t_field_config（字段配置元数据表）
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_field_config (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）',
    biz_type VARCHAR(32) NOT NULL COMMENT '业务对象类型：style/order/production/scan/customer/supplier',
    field_key VARCHAR(64) NOT NULL COMMENT '字段唯一键，如 sample_dev_cost',
    label VARCHAR(64) NOT NULL COMMENT '字段显示名',
    field_type VARCHAR(20) NOT NULL COMMENT '字段类型：text/number/date/select/multiselect/textarea/switch',
    options_json TEXT DEFAULT NULL COMMENT 'select/multiselect 选项 JSON 数组',
    validations_json VARCHAR(512) DEFAULT NULL COMMENT '校验规则 JSON：required/pattern/min/max',
    pc_widget VARCHAR(32) DEFAULT NULL COMMENT 'PC 端 widget：input/inputnumber/datepicker/select/switch/textarea',
    h5_widget VARCHAR(32) DEFAULT NULL COMMENT 'H5 端 widget（同上枚举）',
    mp_widget VARCHAR(32) DEFAULT NULL COMMENT '小程序端 widget（同上枚举）',
    pc_col_span INT DEFAULT 24 COMMENT 'PC 端栅格占比（24栅格制）',
    h5_col_span INT DEFAULT 24 COMMENT 'H5 端栅格占比',
    sort_order INT DEFAULT 0 COMMENT '排序（升序）',
    is_system TINYINT(1) DEFAULT 0 COMMENT '1=系统字段（不可删，可改显隐/标签）0=租户自定义字段',
    enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用（租户管理员可关）',
    visible_roles VARCHAR(512) DEFAULT NULL COMMENT '可见角色 ID 数组 JSON（null=全部可见）',
    editable_roles VARCHAR(512) DEFAULT NULL COMMENT '可编辑角色 ID 数组 JSON（null=全部可编辑）',
    remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag TINYINT(1) DEFAULT 0 COMMENT '软删除：0正常1已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_biz_field (tenant_id, biz_type, field_key),
    KEY idx_tenant_biz (tenant_id, biz_type, enabled, sort_order),
    KEY idx_tenant_field_key (tenant_id, field_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字段配置元数据表（多租户字段定制）';

-- ----------------------------------------------------------------
-- 2. 新建 t_user_preference（用户统一偏好表）
--    替代散落的 localStorage（pageSizeStore/列顺序/列显隐）
--    key 设计：biz_type:page_key:preference_type，如 style:list:visible_columns
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_user_preference (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）',
    user_id VARCHAR(64) NOT NULL COMMENT '用户ID（与 UserContext.userId() 类型一致，String）',
    biz_type VARCHAR(32) NOT NULL COMMENT '业务对象类型',
    page_key VARCHAR(64) NOT NULL COMMENT '页面标识，如 style-list / production-detail',
    preference_type VARCHAR(32) NOT NULL COMMENT '偏好类型：visible_columns/column_order/page_size/sort_settings/filter_settings',
    preference_value TEXT NOT NULL COMMENT '偏好值 JSON',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_pref (tenant_id, user_id, page_key, preference_type),
    KEY idx_tenant_user (tenant_id, user_id, biz_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户统一偏好表（替代散落 localStorage）';

-- ----------------------------------------------------------------
-- 3. 给 t_style_info 加 ext_json 列（试点业务表）
--    P0铁律1：禁止动态SQL字符串字面量，改用存储过程方式
-- ----------------------------------------------------------------
DROP PROCEDURE IF EXISTS add_ext_json_to_style_info;
DELIMITER //
CREATE PROCEDURE add_ext_json_to_style_info()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_style_info'
          AND COLUMN_NAME = 'ext_json'
    ) THEN
        ALTER TABLE t_style_info ADD COLUMN ext_json JSON DEFAULT NULL;
    END IF;
END //
DELIMITER ;
CALL add_ext_json_to_style_info();
DROP PROCEDURE IF EXISTS add_ext_json_to_style_info;
