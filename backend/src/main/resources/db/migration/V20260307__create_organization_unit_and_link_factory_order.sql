CREATE TABLE IF NOT EXISTS `t_organization_unit` (
    `id` VARCHAR(64) NOT NULL COMMENT '组织节点ID',
    `parent_id` VARCHAR(64) DEFAULT NULL COMMENT '父节点ID',
    `node_name` VARCHAR(128) NOT NULL COMMENT '节点名称',
    `node_type` VARCHAR(32) NOT NULL COMMENT '节点类型：DEPARTMENT/FACTORY',
    `owner_type` VARCHAR(32) DEFAULT NULL COMMENT '内外标签：INTERNAL/EXTERNAL/NONE',
    `factory_id` VARCHAR(64) DEFAULT NULL COMMENT '绑定工厂ID，部门节点为空',
    `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序值',
    `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态：active/inactive',
    `path_ids` VARCHAR(1000) DEFAULT NULL COMMENT '节点ID路径',
    `path_names` VARCHAR(1000) DEFAULT NULL COMMENT '节点名称路径',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `delete_flag` TINYINT NOT NULL DEFAULT 0 COMMENT '删除标记',
    `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID',
    PRIMARY KEY (`id`),
    KEY `idx_org_unit_parent` (`parent_id`),
    KEY `idx_org_unit_factory` (`factory_id`),
    KEY `idx_org_unit_tenant_type` (`tenant_id`, `node_type`, `delete_flag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组织架构节点表';

ALTER TABLE `t_factory`
    ADD COLUMN `org_unit_id` VARCHAR(64) NULL COMMENT '工厂对应的组织节点ID' AFTER `supplier_type`,
    ADD COLUMN `parent_org_unit_id` VARCHAR(64) NULL COMMENT '归属部门节点ID' AFTER `org_unit_id`,
    ADD COLUMN `parent_org_unit_name` VARCHAR(128) NULL COMMENT '归属部门名称' AFTER `parent_org_unit_id`,
    ADD COLUMN `org_path` VARCHAR(1000) NULL COMMENT '组织路径（名称）' AFTER `parent_org_unit_name`;

ALTER TABLE `t_production_order`
    ADD COLUMN `org_unit_id` VARCHAR(64) NULL COMMENT '生产组织节点ID快照' AFTER `factory_name`,
    ADD COLUMN `parent_org_unit_id` VARCHAR(64) NULL COMMENT '归属部门节点ID快照' AFTER `org_unit_id`,
    ADD COLUMN `parent_org_unit_name` VARCHAR(128) NULL COMMENT '归属部门名称快照' AFTER `parent_org_unit_id`,
    ADD COLUMN `org_path` VARCHAR(1000) NULL COMMENT '组织路径快照' AFTER `parent_org_unit_name`,
    ADD COLUMN `factory_type` VARCHAR(32) NULL COMMENT '内外工厂标签快照' AFTER `org_path`;

ALTER TABLE `t_user`
    ADD COLUMN `org_unit_id` VARCHAR(64) NULL COMMENT '所属组织节点ID' AFTER `factory_id`,
    ADD COLUMN `org_unit_name` VARCHAR(128) NULL COMMENT '所属组织节点名称' AFTER `org_unit_id`,
    ADD COLUMN `org_path` VARCHAR(1000) NULL COMMENT '所属组织路径' AFTER `org_unit_name`;
