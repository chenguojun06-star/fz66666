-- =====================================================
-- 样板生产扫码记录表
-- 用于记录车板师、跟单员等对样板生产的扫码操作
-- =====================================================

CREATE TABLE IF NOT EXISTS `t_pattern_scan_record` (
  `id` varchar(36) NOT NULL COMMENT '主键ID',
  `pattern_production_id` varchar(36) NOT NULL COMMENT '样板生产ID',
  `style_id` varchar(36) DEFAULT NULL COMMENT '款号ID',
  `style_no` varchar(50) DEFAULT NULL COMMENT '款号',
  `color` varchar(50) DEFAULT NULL COMMENT '颜色',
  `operation_type` varchar(32) NOT NULL COMMENT '操作类型：RECEIVE(领取), PLATE(车板), FOLLOW_UP(跟单), COMPLETE(完成), WAREHOUSE_IN(入库), WAREHOUSE_OUT(出库), WAREHOUSE_RETURN(归还)',
  `operator_id` varchar(36) DEFAULT NULL COMMENT '操作员ID',
  `operator_name` varchar(50) DEFAULT NULL COMMENT '操作员名称',
  `operator_role` varchar(20) DEFAULT NULL COMMENT '操作员角色：PLATE_WORKER(车板师), MERCHANDISER(跟单员), WAREHOUSE(仓管)',
  `scan_time` datetime NOT NULL COMMENT '扫码时间',
  `warehouse_code` varchar(64) DEFAULT NULL COMMENT '仓位编码（样衣入库/出库）',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `delete_flag` tinyint(1) DEFAULT 0 COMMENT '删除标记（0=未删除，1=已删除）',
  PRIMARY KEY (`id`),
  KEY `idx_pattern_production_id` (`pattern_production_id`),
  KEY `idx_style_id` (`style_id`),
  KEY `idx_operator_id` (`operator_id`),
  KEY `idx_scan_time` (`scan_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样板生产扫码记录表';
