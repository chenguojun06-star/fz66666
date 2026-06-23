-- ========================================================================
-- L4 Procedural Memory 表 - SOP/流程/技能显式存储
-- 设计参考：five-layer-memory-design.md
-- 用途：AI 直接调用而非推理，解决流程类问题回答不稳定
-- ========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS t_procedural_memory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）',
  sop_name VARCHAR(128) NOT NULL COMMENT 'SOP名称',
  sop_type VARCHAR(32) NOT NULL COMMENT 'SCAN_WORKFLOW/WAGE_SETTLEMENT/QUALITY_CHECK/DELIVERY_FORECAST/SUPPLIER_EVAL',
  steps_json TEXT NOT NULL COMMENT '步骤数组JSON：[{"step":1,"action":"...","tool":"...","expected":"..."},...]',
  preconditions TEXT COMMENT '前置条件JSON',
  postcheck TEXT COMMENT '后置校验JSON',
  trigger_keywords VARCHAR(512) COMMENT '触发关键词，逗号分隔',
  confidence DECIMAL(5,2) DEFAULT 0.80 COMMENT '置信度0-100',
  usage_count INT DEFAULT 0 COMMENT '调用次数',
  success_count INT DEFAULT 0 COMMENT '成功次数',
  version INT DEFAULT 1 COMMENT '版本号（SOP过期时升级）',
  source VARCHAR(32) DEFAULT 'manual' COMMENT 'manual/crystallized',
  enabled TINYINT DEFAULT 1 COMMENT '是否启用',
  delete_flag TINYINT DEFAULT 0 COMMENT '删除标记',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_tenant_sop (tenant_id, sop_name),
  KEY idx_sop_type (tenant_id, sop_type),
  KEY idx_trigger (tenant_id, trigger_keywords(64))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='L4程序性记忆：SOP/流程/技能';

-- 插入初始 SOP 数据

-- 1. 扫码流程 SOP
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
(0, '工序扫码流程', 'SCAN_WORKFLOW', 
'[{"step":1,"action":"打开扫码页面","tool":"scan_page","expected":"显示扫码界面"},{"step":2,"action":"扫描工单号/条码","tool":"scan_barcode","expected":"识别成功显示订单信息"},{"step":3,"action":"确认工序信息","tool":"confirm_process","expected":"显示当前工序详情"},{"step":4,"action":"点击确认完成","tool":"submit_complete","expected":"提示扫码成功"}]',
'扫码,工序扫码,扫描,打卡', 0.95);

-- 2. 质检扫码流程
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
(0, '质检扫码流程', 'SCAN_WORKFLOW', 
'[{"step":1,"action":"进入质检扫码页面","tool":"quality_scan_page","expected":"显示质检扫码界面"},{"step":2,"action":"扫描质检单条码","tool":"scan_quality_barcode","expected":"显示质检任务"},{"step":3,"action":"选择质检结果","tool":"select_result","expected":"可选合格/不合格/返工"},{"step":4,"action":"填写备注（如不合格）","tool":"fill_note","expected":"备注输入框"},{"step":5,"action":"提交质检结果","tool":"submit_quality","expected":"提交成功"}]',
'质检扫码,质检,检验,不合格,次品', 0.92);

-- 3. 入库扫码流程
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
(0, '成品入库扫码流程', 'SCAN_WORKFLOW', 
'[{"step":1,"action":"进入入库页面","tool":"warehousing_page","expected":"入库界面"},{"step":2,"action":"扫描装箱条码","tool":"scan_box_barcode","expected":"显示装箱信息"},{"step":3,"action":"确认入库数量","tool":"confirm_qty","expected":"显示待入库数量"},{"step":4,"action":"选择库位","tool":"select_location","expected":"库位选择"},{"step":5,"action":"确认入库","tool":"confirm_warehousing","expected":"入库成功"}]',
'入库,入库扫码,成品入库', 0.93);

-- 4. 工资结算流程
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
(0, '工资结算流程', 'WAGE_SETTLEMENT', 
'[{"step":1,"action":"进入工资结算页面","tool":"wage_page","expected":"工资结算列表"},{"step":2,"action":"选择结算周期","tool":"select_period","expected":"选择日期范围"},{"step":3,"action":"确认结算订单","tool":"confirm_orders","expected":"显示待结算订单"},{"step":4,"action":"发起结算","tool":"start_settlement","expected":"结算中..."},{"step":5,"action":"查看结算结果","tool":"view_result","expected":"结算完成显示工资单"}]',
'工资,结算,工资结算,计件工资', 0.94);

-- 5. 质检流程
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
(0, '首件质检流程', 'QUALITY_CHECK', 
'[{"step":1,"action":"创建质检单","tool":"create_quality_order","expected":"质检单创建成功"},{"step":2,"action":"选择质检类型（首件/巡检/末件）","tool":"select_check_type","expected":"选择类型"},{"step":3,"action":"扫描待检物料","tool":"scan_material","expected":"识别物料"},{"step":4,"action":"执行检验","tool":"execute_check","expected":"记录检验结果"},{"step":5,"action":"判定合格/不合格","tool":"judge_result","expected":"判定完成"}]',
'首件,巡检,末件,质检流程', 0.90);

-- 6. 交期预测查询
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
(0, '交期预测查询', 'DELIVERY_FORECAST', 
'[{"step":1,"action":"进入订单详情","tool":"order_detail","expected":"订单信息"},{"step":2,"action":"查看进度看板","tool":"progress_board","expected":"各工序进度"},{"step":3,"action":"查看交期预测","tool":"delivery_prediction","expected":"显示预测交期"},{"step":4,"action":"如有延期风险，查看原因","tool":"risk_analysis","expected":"风险分析"}]',
'交期,延期,预测,排产,产能', 0.88);

-- 7. 供应商评估流程
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, trigger_keywords, confidence) VALUES
(0, '供应商评估流程', 'SUPPLIER_EVAL', 
'[{"step":1,"action":"进入供应商管理","tool":"supplier_page","expected":"供应商列表"},{"step":2,"action":"选择供应商","tool":"select_supplier","expected":"供应商详情"},{"step":3,"action":"查看评估指标","tool":"view_metrics","expected":"准时交付率/质量合格率/价格竞争力"},{"step":4,"action":"查看评级结果","tool":"view_rating","expected":"A/B/C/D评级"},{"step":5,"action":"导出评估报告","tool":"export_report","expected":"生成报告"}]',
'供应商,评估,评级,供应商评估', 0.85);

SET FOREIGN_KEY_CHECKS = 1;

-- 验证数据插入
SELECT COUNT(*) AS procedural_memory_count FROM t_procedural_memory WHERE delete_flag = 0;
