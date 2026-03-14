-- V20260314002: 修复云端 t_material_database 表缺失问题
-- 问题根因: FinanceTableMigrator 在云端被禁用 (FASHION_DB_INITIALIZER_ENABLED=false)
--           导致 t_material_database 从未在云端创建，所有相关接口返回 500
-- 修复策略:  ① CREATE TABLE IF NOT EXISTS 包含所有历史累计字段（一次性建完整表）
--           ② 幂等 ADD COLUMN 补丁，保证已存在的旧表也补齐全部新列

-- ① 完整建表（涵盖：基础字段 + V47 供应商字段 + V20260221b tenant_id + V20260314001 面料属性）
CREATE TABLE IF NOT EXISTS `t_material_database` (
  `id`                      VARCHAR(36)     NOT NULL                                         COMMENT '物料ID',
  `material_code`           VARCHAR(50)     NOT NULL                                         COMMENT '物料编码',
  `material_name`           VARCHAR(100)    NOT NULL                                         COMMENT '物料名称',
  `style_no`                VARCHAR(50)     DEFAULT NULL                                     COMMENT '款号',
  `material_type`           VARCHAR(20)     DEFAULT 'accessory'                              COMMENT '物料类型(fabric/lining/accessory)',
  `color`                   VARCHAR(100)    DEFAULT NULL                                     COMMENT '颜色',
  `fabric_width`            VARCHAR(50)     DEFAULT NULL                                     COMMENT '幅宽',
  `fabric_weight`           VARCHAR(50)     DEFAULT NULL                                     COMMENT '克重',
  `fabric_composition`      VARCHAR(100)    DEFAULT NULL                                     COMMENT '面料成分',
  `specifications`          VARCHAR(100)    DEFAULT NULL                                     COMMENT '规格',
  `unit`                    VARCHAR(20)     NOT NULL DEFAULT ''                              COMMENT '单位',
  `supplier_id`             VARCHAR(50)     DEFAULT NULL                                     COMMENT '供应商ID',
  `supplier_name`           VARCHAR(100)    DEFAULT NULL                                     COMMENT '供应商名称',
  `supplier_contact_person` VARCHAR(50)     DEFAULT NULL                                     COMMENT '供应商联系人',
  `supplier_contact_phone`  VARCHAR(20)     DEFAULT NULL                                     COMMENT '供应商联系电话',
  `unit_price`              DECIMAL(10,2)   DEFAULT 0.00                                     COMMENT '单价',
  `description`             VARCHAR(255)    DEFAULT NULL                                     COMMENT '描述',
  `image`                   VARCHAR(500)    DEFAULT NULL                                     COMMENT '图片URL',
  `remark`                  VARCHAR(500)    DEFAULT NULL                                     COMMENT '备注',
  `status`                  VARCHAR(20)     DEFAULT 'pending'                                COMMENT '状态',
  `completed_time`          DATETIME        DEFAULT NULL                                     COMMENT '完成时间',
  `return_reason`           VARCHAR(255)    DEFAULT NULL                                     COMMENT '退回原因',
  `create_time`             DATETIME        DEFAULT CURRENT_TIMESTAMP                        COMMENT '创建时间',
  `update_time`             DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `delete_flag`             INT             NOT NULL DEFAULT 0                               COMMENT '删除标识：0-未删除，1-已删除',
  `tenant_id`               BIGINT          DEFAULT NULL                                     COMMENT '租户ID',
  PRIMARY KEY (`id`),
  INDEX `idx_material_code`   (`material_code`),
  INDEX `idx_style_no`        (`style_no`),
  INDEX `idx_supplier_name`   (`supplier_name`),
  INDEX `idx_md_supplier_id`  (`supplier_id`),
  INDEX `idx_md_tenant_id`    (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='面辅料数据库';

-- ② 幂等补丁：为已存在但缺少新列的旧表逐列补齐（全部使用 INFORMATION_SCHEMA 守卫，安全重复执行）

-- color
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='color')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `color` VARCHAR(100) DEFAULT NULL COMMENT ''颜色''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fabric_width
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='fabric_width')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `fabric_width` VARCHAR(50) DEFAULT NULL COMMENT ''幅宽''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fabric_weight
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='fabric_weight')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `fabric_weight` VARCHAR(50) DEFAULT NULL COMMENT ''克重''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fabric_composition
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='fabric_composition')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `fabric_composition` VARCHAR(100) DEFAULT NULL COMMENT ''面料成分''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='supplier_id')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `supplier_id` VARCHAR(50) DEFAULT NULL COMMENT ''供应商ID''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_contact_person
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='supplier_contact_person')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `supplier_contact_person` VARCHAR(50) DEFAULT NULL COMMENT ''供应商联系人''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_contact_phone
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='supplier_contact_phone')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `supplier_contact_phone` VARCHAR(20) DEFAULT NULL COMMENT ''供应商联系电话''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- completed_time
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='completed_time')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `completed_time` DATETIME DEFAULT NULL COMMENT ''完成时间''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- return_reason
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='return_reason')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `return_reason` VARCHAR(255) DEFAULT NULL COMMENT ''退回原因''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tenant_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT ''租户ID''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_md_supplier_id（兼容已建表但缺少索引的情况）
SET @i = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND INDEX_NAME='idx_md_supplier_id');
SET @s = IF(@i=0, 'CREATE INDEX `idx_md_supplier_id` ON `t_material_database` (`supplier_id`)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_md_tenant_id
SET @i = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND INDEX_NAME='idx_md_tenant_id');
SET @s = IF(@i=0, 'CREATE INDEX `idx_md_tenant_id` ON `t_material_database` (`tenant_id`)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
