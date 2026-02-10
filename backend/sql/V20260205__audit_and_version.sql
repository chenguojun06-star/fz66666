-- =====================================================
-- 操作审计日志表 + 乐观锁版本字段
-- 执行方式: docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < backend/sql/V20260205__audit_and_version.sql
-- =====================================================

-- 1. 操作审计日志表
CREATE TABLE IF NOT EXISTS `t_operation_log` (
  `id` varchar(64) NOT NULL COMMENT '主键ID',
  `user_id` varchar(64) DEFAULT NULL COMMENT '操作用户ID',
  `username` varchar(100) DEFAULT NULL COMMENT '操作用户名',
  `module` varchar(100) DEFAULT NULL COMMENT '业务模块',
  `action` varchar(200) DEFAULT NULL COMMENT '操作类型',
  `method` varchar(10) DEFAULT NULL COMMENT '请求方法',
  `request_url` varchar(500) DEFAULT NULL COMMENT '请求URL',
  `request_params` text COMMENT '请求参数',
  `response_result` text COMMENT '响应结果',
  `client_ip` varchar(50) DEFAULT NULL COMMENT '客户端IP',
  `status` varchar(20) DEFAULT NULL COMMENT '操作状态: success/error',
  `error_message` varchar(500) DEFAULT NULL COMMENT '错误信息',
  `duration` bigint DEFAULT NULL COMMENT '耗时(ms)',
  `operation_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_module_action` (`module`, `action`),
  KEY `idx_operation_time` (`operation_time`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='操作审计日志表';

-- 2. 为关键业务表添加乐观锁 version 字段（忽略已存在错误）
ALTER TABLE `t_material_stock` ADD COLUMN `version` int DEFAULT 0 COMMENT '乐观锁版本号';
ALTER TABLE `t_production_order` ADD COLUMN `version` int DEFAULT 0 COMMENT '乐观锁版本号';

-- 3. 为生产订单表添加数据隔离索引（加速按创建人/工厂查询）
-- 这些索引也许已存在，忽略错误即可
ALTER TABLE `t_production_order` ADD INDEX `idx_created_by_id` (`created_by_id`);
ALTER TABLE `t_production_order` ADD INDEX `idx_factory_id` (`factory_id`);
ALTER TABLE `t_material_purchase` ADD INDEX `idx_creator_id` (`creator_id`);
ALTER TABLE `t_cutting_task` ADD INDEX `idx_creator_id` (`creator_id`);
