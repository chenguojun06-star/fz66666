-- D-823：裁剪用料台账 + 余料回库闭环
-- 背景：采购侧「到货-已用-剩余」账目齐全（t_material_purchase.usedQuantity），
--   裁剪侧只有件数/扎数（t_cutting_task.cutting_quantity），面料「真正吃掉多少、
--   剩多少、剩下去哪了」完全断档——余料全仓无概念（关键词仅命中电商库存差异模块）。
-- 本迁移建「裁剪任务 × 物料」台账，打通：计划（BOM）→ 领出 → 实际消耗 → 余料 → 回库。
--
-- 口径定义（与采购侧口径衔接，用户业务口径：采购总数量 vs 裁剪实际使用数量）：
--   planned_amount  计划用量 = BOM单件用量 × 裁剪件数 × (1 + 损耗率)（与 MaterialStockOrchestrator 预警公式同源）
--   issued_amount   领出量（默认=计划量，用户可按实际领料改）
--   actual_used     实际消耗（裁剪完工时按物料录入）
--   remnant_amount  余料 = issued_amount - actual_used
--   remnant_status  NONE(无余料) / PENDING(待回库) / INBOUNDED(已回库)

CREATE TABLE `t_cutting_material_usage` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `cutting_task_id` VARCHAR(64) NOT NULL COMMENT '裁剪任务ID（t_cutting_task.id）',
  `production_order_id` VARCHAR(64) DEFAULT NULL COMMENT '生产订单ID',
  `production_order_no` VARCHAR(64) DEFAULT NULL COMMENT '生产订单号',
  `style_no` VARCHAR(64) DEFAULT NULL COMMENT '款号',
  `material_code` VARCHAR(128) NOT NULL COMMENT '物料编码',
  `material_name` VARCHAR(255) DEFAULT NULL COMMENT '物料名称',
  `material_type` VARCHAR(64) DEFAULT NULL COMMENT '物料类型：面料/辅料',
  `color` VARCHAR(64) DEFAULT NULL COMMENT '颜色',
  `size` VARCHAR(64) DEFAULT NULL COMMENT '规格/尺码',
  `unit` VARCHAR(32) DEFAULT NULL COMMENT '单位（米/件/kg）',
  `planned_amount` DECIMAL(14,4) DEFAULT 0 COMMENT '计划用量（BOM×件数×(1+损耗率)）',
  `issued_amount` DECIMAL(14,4) DEFAULT NULL COMMENT '领出量（默认=计划量，可改）',
  `actual_used` DECIMAL(14,4) DEFAULT NULL COMMENT '实际消耗（完工登记）',
  `remnant_amount` DECIMAL(14,4) DEFAULT 0 COMMENT '余料 = 领出 - 实际',
  `remnant_status` VARCHAR(32) DEFAULT 'NONE' COMMENT '余料状态：NONE/PENDING/INBOUNDED',
  `remnant_inbound_no` VARCHAR(64) DEFAULT NULL COMMENT '余料回库入库单号（t_material_inbound.inbound_no）',
  `unit_price` DECIMAL(14,2) DEFAULT 0 COMMENT '单价快照（元）',
  `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID',
  `create_time` DATETIME DEFAULT NULL COMMENT '创建时间',
  `update_time` DATETIME DEFAULT NULL COMMENT '更新时间',
  `delete_flag` TINYINT DEFAULT 0 COMMENT '软删除',
  PRIMARY KEY (`id`),
  KEY `idx_cmu_task` (`cutting_task_id`),
  KEY `idx_cmu_tenant_material` (`tenant_id`, `material_code`),
  KEY `idx_cmu_order_material` (`production_order_no`, `material_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='裁剪用料台账（计划-领出-实际-余料-回库）';

-- t_cutting_task 冗余两个汇总字段：列表页免 join 即可展示登记状态与余料合计
ALTER TABLE `t_cutting_task`
  ADD COLUMN `usage_confirmed` TINYINT DEFAULT 0 COMMENT '用料台账是否已登记（D-823）',
  ADD COLUMN `remnant_total` DECIMAL(14,4) DEFAULT 0 COMMENT '余料合计（各物料行的最大值汇总，D-823）';
