CREATE TABLE IF NOT EXISTS `t_sample_stock` (
  `id` varchar(64) NOT NULL COMMENT '主键ID',
  `style_id` varchar(64) DEFAULT NULL COMMENT '关联款式ID',
  `style_no` varchar(64) DEFAULT NULL COMMENT '款号',
  `style_name` varchar(128) DEFAULT NULL COMMENT '款式名称',
  `sample_type` varchar(32) DEFAULT 'development' COMMENT '样衣类型: development(开发样), pre_production(产前样), shipment(大货样), sales(销售样)',
  `color` varchar(64) DEFAULT NULL COMMENT '颜色',
  `size` varchar(64) DEFAULT NULL COMMENT '尺码',
  `quantity` int(11) DEFAULT '0' COMMENT '库存总数',
  `loaned_quantity` int(11) DEFAULT '0' COMMENT '借出数量',
  `location` varchar(128) DEFAULT NULL COMMENT '存放位置',
  `image_url` varchar(512) DEFAULT NULL COMMENT '样衣图片',
  `remark` varchar(512) DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `delete_flag` int(11) DEFAULT '0' COMMENT '删除标记',
  PRIMARY KEY (`id`),
  KEY `idx_style_id` (`style_id`),
  KEY `idx_style_no` (`style_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样衣库存表';

CREATE TABLE IF NOT EXISTS `t_sample_loan` (
  `id` varchar(64) NOT NULL COMMENT '主键ID',
  `sample_stock_id` varchar(64) NOT NULL COMMENT '样衣库存ID',
  `borrower` varchar(64) DEFAULT NULL COMMENT '借用人',
  `borrower_id` varchar(64) DEFAULT NULL COMMENT '借用人ID',
  `loan_date` datetime DEFAULT NULL COMMENT '借出时间',
  `expected_return_date` datetime DEFAULT NULL COMMENT '预计归还时间',
  `return_date` datetime DEFAULT NULL COMMENT '实际归还时间',
  `quantity` int(11) DEFAULT '1' COMMENT '借用数量',
  `status` varchar(32) DEFAULT 'borrowed' COMMENT '状态: borrowed(借出中), returned(已归还), lost(丢失)',
  `remark` varchar(512) DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `delete_flag` int(11) DEFAULT '0' COMMENT '删除标记',
  PRIMARY KEY (`id`),
  KEY `idx_sample_stock_id` (`sample_stock_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样衣借还记录表';
