CREATE TABLE IF NOT EXISTS `t_material_picking` (
  `id` varchar(36) NOT NULL COMMENT '主键ID',
  `picking_no` varchar(50) NOT NULL COMMENT '领料单号',
  `order_id` varchar(36) DEFAULT NULL COMMENT '生产订单ID',
  `order_no` varchar(50) DEFAULT NULL COMMENT '生产订单号',
  `style_id` varchar(36) DEFAULT NULL COMMENT '款式ID',
  `style_no` varchar(50) DEFAULT NULL COMMENT '款号',
  `picker_id` varchar(36) DEFAULT NULL COMMENT '领料人ID',
  `picker_name` varchar(50) DEFAULT NULL COMMENT '领料人姓名',
  `pick_time` datetime DEFAULT NULL COMMENT '领料时间',
  `status` varchar(20) DEFAULT 'completed' COMMENT '状态',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `delete_flag` int(11) DEFAULT '0' COMMENT '删除标记',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_picking_no` (`picking_no`),
  KEY `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产领料单';

CREATE TABLE IF NOT EXISTS `t_material_picking_item` (
  `id` varchar(36) NOT NULL COMMENT '主键ID',
  `picking_id` varchar(36) NOT NULL COMMENT '领料单ID',
  `material_stock_id` varchar(36) DEFAULT NULL COMMENT '库存ID',
  `material_id` varchar(36) DEFAULT NULL COMMENT '物料ID',
  `material_code` varchar(50) DEFAULT NULL COMMENT '物料编码',
  `material_name` varchar(100) DEFAULT NULL COMMENT '物料名称',
  `color` varchar(50) DEFAULT NULL COMMENT '颜色',
  `size` varchar(50) DEFAULT NULL COMMENT '规格/尺码',
  `quantity` int(11) NOT NULL DEFAULT '0' COMMENT '领料数量',
  `unit` varchar(20) DEFAULT NULL COMMENT '单位',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_picking_id` (`picking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产领料明细';
