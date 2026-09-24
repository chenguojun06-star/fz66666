-- D-529：组合商品（套装）——把任意两个及以上不同款式的 SKU 组合成一个"组合SKU"上架销售。
-- 销售/出库时销售记录关联组合SKU（t_product_outstock.combo_id/combo_code/combo_name），
-- 实际库存按子SKU逐个扣减（每个子SKU一行出库记录，共一张出库单号）。
-- 组合SKU本身不占库存：可用库存 = min(子SKU可用库存 / 子SKU数量)。

CREATE TABLE IF NOT EXISTS t_combo_product (
  id bigint NOT NULL AUTO_INCREMENT,
  combo_code varchar(64) NOT NULL COMMENT '组合商品编码（租户内唯一）',
  combo_name varchar(100) NOT NULL COMMENT '组合商品名称',
  short_code varchar(64) DEFAULT NULL COMMENT '组合款式编码（简码）',
  color_size_desc varchar(200) DEFAULT NULL COMMENT '颜色及规格（套装描述）',
  category varchar(100) DEFAULT NULL COMMENT '商品分类',
  tags varchar(255) DEFAULT NULL COMMENT '商品标签',
  sale_price decimal(12,2) DEFAULT NULL COMMENT '组合基本售价（NULL=按子SKU售价）',
  cost_price decimal(12,2) DEFAULT NULL COMMENT '组合成本价（自动=子SKU成本×数量之和）',
  auto_sale_price tinyint DEFAULT 1 COMMENT '售价自动计算（按子SKU售价求和）',
  auto_cost_price tinyint DEFAULT 1 COMMENT '成本自动计算',
  cover_url varchar(512) DEFAULT NULL COMMENT '组合图片',
  remark varchar(500) DEFAULT NULL COMMENT '备注',
  status varchar(20) DEFAULT 'ENABLED' COMMENT 'ENABLED=启用, DISABLED=停用',
  tenant_id bigint NOT NULL,
  delete_flag tinyint DEFAULT 0,
  create_by varchar(64) DEFAULT NULL COMMENT '创建人',
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tenant_status (tenant_id, status),
  KEY idx_tenant_code (tenant_id, combo_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组合商品（套装）主表';

CREATE TABLE IF NOT EXISTS t_combo_product_item (
  id bigint NOT NULL AUTO_INCREMENT,
  combo_id bigint NOT NULL COMMENT '组合商品ID',
  sku_id bigint NOT NULL COMMENT '子商品SKU ID（t_product_sku.id）',
  style_id bigint DEFAULT NULL,
  style_no varchar(64) DEFAULT NULL COMMENT '款号快照',
  style_name varchar(100) DEFAULT NULL COMMENT '款名快照',
  sku_code varchar(64) NOT NULL COMMENT '商品编码快照',
  color varchar(64) DEFAULT NULL,
  size varchar(64) DEFAULT NULL,
  quantity int DEFAULT 1 COMMENT '单套数量',
  sort int DEFAULT 0,
  tenant_id bigint NOT NULL,
  delete_flag tinyint DEFAULT 0,
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_combo (combo_id),
  KEY idx_tenant_sku (tenant_id, sku_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组合商品子项明细';

-- 出库记录挂组合来源：销售记录关联组合SKU、实际按子SKU出库的组合溯源三列
-- 幂等：先查 information_schema 再 ADD COLUMN（与 V202709200001 同一写法，重复执行安全）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_product_outstock'
               AND COLUMN_NAME  = 'combo_id') = 0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `combo_id` bigint DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_product_outstock'
               AND COLUMN_NAME  = 'combo_code') = 0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `combo_code` varchar(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_product_outstock'
               AND COLUMN_NAME  = 'combo_name') = 0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `combo_name` varchar(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 菜单权限：挂在「商品仓储」同一父级下（成品管理组）
SET @combo_menu_exists = (SELECT COUNT(*) FROM t_permission WHERE permission_code = 'MENU_COMBINED_PRODUCT');
SET @combo_parent_id = COALESCE((SELECT parent_id FROM t_permission WHERE permission_code = 'MENU_FINISHED_INVENTORY' LIMIT 1), 0);
SET @combo_parent_name = COALESCE((SELECT parent_name FROM t_permission WHERE permission_code = 'MENU_FINISHED_INVENTORY' LIMIT 1), '成品管理');

INSERT INTO t_permission (permission_code, permission_name, permission_type, parent_id, parent_name, path, sort, status)
SELECT 'MENU_COMBINED_PRODUCT', '组合商品', 'MENU', @combo_parent_id, @combo_parent_name, '/warehouse/combined-product',
  COALESCE((SELECT MAX(sort) + 1 FROM t_permission WHERE parent_id = @combo_parent_id), 51), 'ENABLED'
FROM DUAL WHERE @combo_menu_exists = 0;

-- 授权：full_admin 模板 + 各租户克隆实例
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'full_admin'
  AND r.is_template = 1
  AND p.permission_code = 'MENU_COMBINED_PRODUCT'
  AND NOT EXISTS (
      SELECT 1 FROM t_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'full_admin'
  AND r.is_template = 0
  AND r.tenant_id IS NOT NULL
  AND p.permission_code = 'MENU_COMBINED_PRODUCT'
  AND p.status = 'ENABLED'
  AND NOT EXISTS (
      SELECT 1 FROM t_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
