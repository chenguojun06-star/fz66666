-- 云端组织架构与链路字段补库脚本
-- 适用环境：微信云托管 / FLYWAY_ENABLED=false
-- 执行原则：可重复执行；仅补结构，不写入任何本地 smoke 数据

-- 0. 前置依赖：t_factory.factory_type
SET @factory_type_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_factory'
      AND COLUMN_NAME = 'factory_type'
);
SET @sql := IF(
    @factory_type_exists = 0,
    "ALTER TABLE t_factory ADD COLUMN factory_type VARCHAR(20) NOT NULL DEFAULT 'EXTERNAL' COMMENT '工厂类型: INTERNAL=本厂内部按人员结算, EXTERNAL=外部工厂按工厂结算'",
    "SELECT 'SKIP: t_factory.factory_type already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1. 前置依赖：t_factory.supplier_type
SET @supplier_type_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_factory'
      AND COLUMN_NAME = 'supplier_type'
);
SET @sql := IF(
    @supplier_type_exists = 0,
    "ALTER TABLE t_factory ADD COLUMN supplier_type VARCHAR(20) NULL COMMENT '供应商类型：MATERIAL-面辅料供应商，OUTSOURCE-外发厂' AFTER factory_type",
    "SELECT 'SKIP: t_factory.supplier_type already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 创建组织架构表
CREATE TABLE IF NOT EXISTS t_organization_unit (
    id VARCHAR(64) NOT NULL COMMENT '组织节点ID',
    parent_id VARCHAR(64) DEFAULT NULL COMMENT '父节点ID',
    node_name VARCHAR(128) NOT NULL COMMENT '节点名称',
    node_type VARCHAR(32) NOT NULL COMMENT '节点类型：DEPARTMENT/FACTORY',
    owner_type VARCHAR(32) DEFAULT NULL COMMENT '内外标签：INTERNAL/EXTERNAL/NONE',
    factory_id VARCHAR(64) DEFAULT NULL COMMENT '绑定工厂ID，部门节点为空',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
    status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态：active/inactive',
    path_ids VARCHAR(1000) DEFAULT NULL COMMENT '节点ID路径',
    path_names VARCHAR(1000) DEFAULT NULL COMMENT '节点名称路径',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    delete_flag TINYINT NOT NULL DEFAULT 0 COMMENT '删除标记',
    tenant_id BIGINT DEFAULT NULL COMMENT '租户ID',
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组织架构节点表';

-- 3. 组织表索引
SET @org_idx_parent_exists := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_organization_unit'
      AND INDEX_NAME = 'idx_org_unit_parent'
);
SET @sql := IF(
    @org_idx_parent_exists = 0,
    'CREATE INDEX idx_org_unit_parent ON t_organization_unit (parent_id)',
    "SELECT 'SKIP: idx_org_unit_parent already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @org_idx_factory_exists := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_organization_unit'
      AND INDEX_NAME = 'idx_org_unit_factory'
);
SET @sql := IF(
    @org_idx_factory_exists = 0,
    'CREATE INDEX idx_org_unit_factory ON t_organization_unit (factory_id)',
    "SELECT 'SKIP: idx_org_unit_factory already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @org_idx_tenant_type_exists := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_organization_unit'
      AND INDEX_NAME = 'idx_org_unit_tenant_type'
);
SET @sql := IF(
    @org_idx_tenant_type_exists = 0,
    'CREATE INDEX idx_org_unit_tenant_type ON t_organization_unit (tenant_id, node_type, delete_flag)',
    "SELECT 'SKIP: idx_org_unit_tenant_type already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. t_factory 组织字段
SET @factory_org_unit_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_factory' AND COLUMN_NAME = 'org_unit_id'
);
SET @sql := IF(
    @factory_org_unit_exists = 0,
    "ALTER TABLE t_factory ADD COLUMN org_unit_id VARCHAR(64) NULL COMMENT '工厂对应的组织节点ID' AFTER supplier_type",
    "SELECT 'SKIP: t_factory.org_unit_id already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @factory_parent_org_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_factory' AND COLUMN_NAME = 'parent_org_unit_id'
);
SET @sql := IF(
    @factory_parent_org_exists = 0,
    "ALTER TABLE t_factory ADD COLUMN parent_org_unit_id VARCHAR(64) NULL COMMENT '归属部门节点ID' AFTER org_unit_id",
    "SELECT 'SKIP: t_factory.parent_org_unit_id already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @factory_parent_name_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_factory' AND COLUMN_NAME = 'parent_org_unit_name'
);
SET @sql := IF(
    @factory_parent_name_exists = 0,
    "ALTER TABLE t_factory ADD COLUMN parent_org_unit_name VARCHAR(128) NULL COMMENT '归属部门名称' AFTER parent_org_unit_id",
    "SELECT 'SKIP: t_factory.parent_org_unit_name already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @factory_org_path_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_factory' AND COLUMN_NAME = 'org_path'
);
SET @sql := IF(
    @factory_org_path_exists = 0,
    "ALTER TABLE t_factory ADD COLUMN org_path VARCHAR(1000) NULL COMMENT '组织路径（名称）' AFTER parent_org_unit_name",
    "SELECT 'SKIP: t_factory.org_path already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. t_production_order 组织快照与业务类型字段
SET @order_org_unit_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'org_unit_id'
);
SET @sql := IF(
    @order_org_unit_exists = 0,
    "ALTER TABLE t_production_order ADD COLUMN org_unit_id VARCHAR(64) NULL COMMENT '生产组织节点ID快照' AFTER factory_name",
    "SELECT 'SKIP: t_production_order.org_unit_id already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_parent_org_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'parent_org_unit_id'
);
SET @sql := IF(
    @order_parent_org_exists = 0,
    "ALTER TABLE t_production_order ADD COLUMN parent_org_unit_id VARCHAR(64) NULL COMMENT '归属部门节点ID快照' AFTER org_unit_id",
    "SELECT 'SKIP: t_production_order.parent_org_unit_id already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_parent_name_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'parent_org_unit_name'
);
SET @sql := IF(
    @order_parent_name_exists = 0,
    "ALTER TABLE t_production_order ADD COLUMN parent_org_unit_name VARCHAR(128) NULL COMMENT '归属部门名称快照' AFTER parent_org_unit_id",
    "SELECT 'SKIP: t_production_order.parent_org_unit_name already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_org_path_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'org_path'
);
SET @sql := IF(
    @order_org_path_exists = 0,
    "ALTER TABLE t_production_order ADD COLUMN org_path VARCHAR(1000) NULL COMMENT '组织路径快照' AFTER parent_org_unit_name",
    "SELECT 'SKIP: t_production_order.org_path already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_factory_type_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'factory_type'
);
SET @sql := IF(
    @order_factory_type_exists = 0,
    "ALTER TABLE t_production_order ADD COLUMN factory_type VARCHAR(32) NULL COMMENT '内外工厂标签快照' AFTER org_path",
    "SELECT 'SKIP: t_production_order.factory_type already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_biz_type_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'order_biz_type'
);
SET @sql := IF(
    @order_biz_type_exists = 0,
    "ALTER TABLE t_production_order ADD COLUMN order_biz_type VARCHAR(20) NULL COMMENT '下单业务类型：FOB/ODM/OEM/CMT' AFTER factory_name",
    "SELECT 'SKIP: t_production_order.order_biz_type already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6. t_user 组织字段
SET @user_org_unit_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_user' AND COLUMN_NAME = 'org_unit_id'
);
SET @sql := IF(
    @user_org_unit_exists = 0,
    "ALTER TABLE t_user ADD COLUMN org_unit_id VARCHAR(64) NULL COMMENT '所属组织节点ID' AFTER factory_id",
    "SELECT 'SKIP: t_user.org_unit_id already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @user_org_name_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_user' AND COLUMN_NAME = 'org_unit_name'
);
SET @sql := IF(
    @user_org_name_exists = 0,
    "ALTER TABLE t_user ADD COLUMN org_unit_name VARCHAR(128) NULL COMMENT '所属组织节点名称' AFTER org_unit_id",
    "SELECT 'SKIP: t_user.org_unit_name already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @user_org_path_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_user' AND COLUMN_NAME = 'org_path'
);
SET @sql := IF(
    @user_org_path_exists = 0,
    "ALTER TABLE t_user ADD COLUMN org_path VARCHAR(1000) NULL COMMENT '所属组织路径' AFTER org_unit_name",
    "SELECT 'SKIP: t_user.org_path already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 7. t_tenant 租户类型字段
SET @tenant_type_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_tenant' AND COLUMN_NAME = 'tenant_type'
);
SET @sql := IF(
    @tenant_type_exists = 0,
    "ALTER TABLE t_tenant ADD COLUMN tenant_type VARCHAR(30) NOT NULL DEFAULT 'HYBRID' COMMENT '租户类型: SELF_FACTORY=自建工厂 HYBRID=自有+外发 BRAND=纯外发品牌' AFTER remark",
    "SELECT 'SKIP: t_tenant.tenant_type already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE t_tenant
SET tenant_type = 'HYBRID'
WHERE tenant_type IS NULL OR tenant_type = '';

-- 8. t_factory 日产能字段
SET @factory_daily_capacity_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_factory' AND COLUMN_NAME = 'daily_capacity'
);
SET @sql := IF(
    @factory_daily_capacity_exists = 0,
    "ALTER TABLE t_factory ADD COLUMN daily_capacity INT DEFAULT 500 COMMENT '工厂日产能（件/天），用于AI排产建议'",
    "SELECT 'SKIP: t_factory.daily_capacity already exists' AS message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'cloud-db-org-upgrade-20260307 finished' AS message;
