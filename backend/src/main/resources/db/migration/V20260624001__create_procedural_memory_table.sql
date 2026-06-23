-- ========================================================================
-- L4 Procedural Memory 表（新增）
-- 用途：AI 直接调用SOP而非推理，解决流程类问题回答不稳定
-- ========================================================================

SET NAMES utf8mb4;

-- 1. 创建表（幂等）
CREATE TABLE IF NOT EXISTS t_procedural_memory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  sop_name VARCHAR(128) NOT NULL,
  sop_type VARCHAR(32) NOT NULL,
  steps_json TEXT NOT NULL,
  preconditions TEXT,
  postcheck TEXT,
  trigger_keywords VARCHAR(512),
  confidence DECIMAL(5,2) DEFAULT 0.80,
  usage_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  version INT DEFAULT 1,
  source VARCHAR(32) DEFAULT 'manual',
  enabled TINYINT DEFAULT 1,
  delete_flag TINYINT DEFAULT 0,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tenant_sop (tenant_id, sop_name),
  KEY idx_sop_type (tenant_id, sop_type),
  KEY idx_trigger (tenant_id, trigger_keywords(64))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='L4程序性记忆：SOP/流程/技能';

-- 2. 幂等插入初始SOP数据
DROP PROCEDURE IF EXISTS init_pm09;
DELIMITER //
CREATE PROCEDURE init_pm09()
BEGIN
    INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
    (0, '工序扫码流程', 'SCAN_WORKFLOW', '[{"step":1,"action":"打开扫码页面","tool":"scan_page","expected":"显示扫码界面"},{"step":2,"action":"扫描工单号/条码","tool":"scan_barcode","expected":"识别成功"},{"step":3,"action":"确认工序信息","tool":"confirm_process","expected":"显示工序详情"},{"step":4,"action":"点击确认完成","tool":"submit_complete","expected":"扫码成功"}]', '扫码,工序扫码,扫描,打卡', 0.95);
    INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
    (0, '质检扫码流程', 'SCAN_WORKFLOW', '[{"step":1,"action":"进入质检扫码页面","tool":"quality_scan_page"},{"step":2,"action":"扫描质检单条码","tool":"scan_quality_barcode"},{"step":3,"action":"选择质检结果","tool":"select_result"},{"step":4,"action":"提交质检结果","tool":"submit_quality"}]', '质检扫码,质检,检验,不合格,次品', 0.92);
    INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
    (0, '成品入库扫码流程', 'SCAN_WORKFLOW', '[{"step":1,"action":"进入入库页面","tool":"warehousing_page"},{"step":2,"action":"扫描装箱条码","tool":"scan_box_barcode"},{"step":3,"action":"确认入库数量","tool":"confirm_qty"},{"step":4,"action":"选择库位","tool":"select_location"},{"step":5,"action":"确认入库","tool":"confirm_warehousing"}]', '入库,入库扫码,成品入库', 0.93);
    INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
    (0, '工资结算流程', 'WAGE_SETTLEMENT', '[{"step":1,"action":"进入工资结算页面","tool":"wage_page"},{"step":2,"action":"选择结算周期","tool":"select_period"},{"step":3,"action":"确认结算订单","tool":"confirm_orders"},{"step":4,"action":"发起结算","tool":"start_settlement"},{"step":5,"action":"查看结算结果","tool":"view_result"}]', '工资,结算,工资结算,计件工资', 0.94);
    INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
    (0, '首件质检流程', 'QUALITY_CHECK', '[{"step":1,"action":"创建质检单","tool":"create_quality_order"},{"step":2,"action":"选择质检类型","tool":"select_check_type"},{"step":3,"action":"扫描待检物料","tool":"scan_material"},{"step":4,"action":"执行检验","tool":"execute_check"},{"step":5,"action":"判定合格/不合格","tool":"judge_result"}]', '首件,巡检,末件,质检流程', 0.90);
    INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
    (0, '交期预测查询', 'DELIVERY_FORECAST', '[{"step":1,"action":"进入订单详情","tool":"order_detail"},{"step":2,"action":"查看进度看板","tool":"progress_board"},{"step":3,"action":"查看交期预测","tool":"delivery_prediction"},{"step":4,"action":"如有延期风险，查看原因","tool":"risk_analysis"}]', '交期,延期,预测,排产,产能', 0.88);
    INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
    (0, '供应商评估流程', 'SUPPLIER_EVAL', '[{"step":1,"action":"进入供应商管理","tool":"supplier_page"},{"step":2,"action":"选择供应商","tool":"select_supplier"},{"step":3,"action":"查看评估指标","tool":"view_metrics"},{"step":4,"action":"查看评级结果","tool":"view_rating"},{"step":5,"action":"导出评估报告","tool":"export_report"}]', '供应商,评估,评级,供应商评估', 0.85);
END //
DELIMITER ;
CALL init_pm09();
DROP PROCEDURE IF EXISTS init_pm09;
