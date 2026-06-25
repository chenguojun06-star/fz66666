-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 【P1升级】L4程序性记忆：SOP结构化存储
-- 目的：将SOP从"知识库检索"升级为"直接调用"，流程类问题准确率→95%+
-- 来源：参考 five-layer-memory-design.md (D-022)
-- 幂等：INSERT IGNORE（已有数据则忽略，避免重复执行报错）
-- MySQL版本：MySQL 5.7+（不使用 JSON_ARRAY/JSON_OBJECT 函数）
-- 公共SOP：tenant_id=0，所有租户可命中（参考公共记忆模式）
-- ══════════════════════════════════════════════════════════════════════════════════════════════

-- 表结构
CREATE TABLE IF NOT EXISTS t_procedural_memory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）',
  sop_name VARCHAR(128) NOT NULL COMMENT 'SOP名称',
  sop_type VARCHAR(32) NOT NULL COMMENT 'SCAN_WORKFLOW/WAGE_SETTLEMENT/DELIVERY_FORECAST/SUPPLIER_EVAL/QUALITY_CHECK',
  steps_json TEXT NOT NULL COMMENT '步骤数组JSON：[{step,action,tool,expected}]',
  preconditions TEXT COMMENT '前置条件JSON',
  postcheck TEXT COMMENT '后置校验JSON',
  trigger_keywords VARCHAR(512) COMMENT '触发关键词，逗号分隔',
  confidence DECIMAL(5,2) DEFAULT 0.80 COMMENT '置信度0-100',
  usage_count INT DEFAULT 0 COMMENT '调用次数',
  success_count INT DEFAULT 0 COMMENT '成功次数',
  version INT DEFAULT 1 COMMENT '版本号',
  source VARCHAR(32) DEFAULT 'manual' COMMENT 'manual/crystallized',
  enabled TINYINT DEFAULT 1 COMMENT '是否启用',
  delete_flag TINYINT DEFAULT 0 COMMENT '软删除标记',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tenant_sop (tenant_id, sop_name),
  KEY idx_sop_type (tenant_id, sop_type),
  KEY idx_trigger (tenant_id, trigger_keywords(64)),
  KEY idx_enabled (tenant_id, enabled, delete_flag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='L4程序性记忆：SOP/流程/技能';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 初始SOP数据（公共：tenant_id=0，所有租户可命中）
-- 注意：使用 INSERT IGNORE 确保幂等性，避免重复执行报错
-- 注意：不使用 JSON_ARRAY/JSON_OBJECT，确保 MySQL 5.7 兼容
-- ══════════════════════════════════════════════════════════════════════════════════════════════

-- 【SOP-1】工序扫码流程
INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, source)
VALUES (0, '工序扫码标准流程', 'SCAN_WORKFLOW',
  '[{\"step\":1,\"action\":\"选择生产单\",\"tool\":\"query_production_order\",\"expected\":\"获取到生产单信息\"},{\"step\":2,\"action\":\"进入工序列表\",\"tool\":\"list_production_processes\",\"expected\":\"显示所有待扫工序\"},{\"step\":3,\"action\":\"扫描工序二维码\",\"tool\":\"scan_barcode\",\"expected\":\"识别工序编号\"},{\"step\":4,\"action\":\"确认工人/班组\",\"tool\":\"select_operator\",\"expected\":\"关联计件人员\"},{\"step\":5,\"action\":\"输入数量\",\"tool\":\"input_quantity\",\"expected\":\"数量≥1\"},{\"step\":6,\"action\":\"提交扫码\",\"tool\":\"submit_scan\",\"expected\":\"返回成功\"},{\"step\":7,\"action\":\"更新生产进度\",\"tool\":\"update_progress\",\"expected\":\"进度节点前移\"}]',
  '{\"hasProductionOrder\":true,\"hasOperator\":true,\"hasProcessList\":true}',
  '{\"verifyScan\":true,\"verifyProgress\":true}',
  '工序扫码,扫码,扫工序,计件,报工,生产扫码,扫菲',
  0.95, 'manual');

-- 【SOP-2】质检扫码流程
INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, source)
VALUES (0, '质检扫码标准流程', 'SCAN_WORKFLOW',
  '[{\"step\":1,\"action\":\"扫描质检二维码\",\"tool\":\"scan_barcode\",\"expected\":\"识别质检单编号\"},{\"step\":2,\"action\":\"选择质检类型\",\"tool\":\"select_qc_type\",\"expected\":\"首检/巡检/末检/入库检\"},{\"step\":3,\"action\":\"AI视觉检测（如有）\",\"tool\":\"ai_defect_detection\",\"expected\":\"返回疵点列表\"},{\"step\":4,\"action\":\"人工复核\",\"tool\":\"manual_review\",\"expected\":\"确认最终结果\"},{\"step\":5,\"action\":\"记录次品（如有）\",\"tool\":\"record_defect\",\"expected\":\"关联次品原因\"},{\"step\":6,\"action\":\"提交质检\",\"tool\":\"submit_qc\",\"expected\":\"更新质检状态\"},{\"step\":7,\"action\":\"触发后续流程\",\"tool\":\"trigger_next_flow\",\"expected\":\"自动流转到下一节点\"}]',
  '{\"hasQcOrder\":true,\"hasQcType\":true}',
  '{\"verifyQuality\":true,\"verifyDefect\":true,\"verifyFlow\":true}',
  '质检扫码,扫码质检,质量检查,QC扫码,品质检验',
  0.92, 'manual');

-- 【SOP-3】入库扫码流程
INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, source)
VALUES (0, '入库扫码标准流程', 'SCAN_WORKFLOW',
  '[{\"step\":1,\"action\":\"扫描入库单二维码\",\"tool\":\"scan_barcode\",\"expected\":\"识别入库单编号\"},{\"step\":2,\"action\":\"确认仓库\",\"tool\":\"select_warehouse\",\"expected\":\"选择目标仓库\"},{\"step\":3,\"action\":\"扫描商品条码\",\"tool\":\"scan_product_barcode\",\"expected\":\"识别SKU\"},{\"step\":4,\"action\":\"输入数量\",\"tool\":\"input_quantity\",\"expected\":\"数量≥0\"},{\"step\":5,\"action\":\"质检确认（如需）\",\"tool\":\"quality_confirm\",\"expected\":\"获取质检报告\"},{\"step\":6,\"action\":\"提交入库\",\"tool\":\"submit_warehousing\",\"expected\":\"更新库存\"},{\"step\":7,\"action\":\"打印入库单\",\"tool\":\"print_receipt\",\"expected\":\"完成入库\"}]',
  '{\"hasInboundOrder\":true,\"hasWarehouse\":true}',
  '{\"verifyStock\":true,\"verifyReceipt\":true}',
  '入库扫码,扫码入库,入库,仓库入库,商品入库',
  0.90, 'manual');

-- 【SOP-4】扫码撤回流程
INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, source)
VALUES (0, '扫码撤回标准流程', 'SCAN_WORKFLOW',
  '[{\"step\":1,\"action\":\"进入扫码记录\",\"tool\":\"list_scan_records\",\"expected\":\"显示最近扫码记录\"},{\"step\":2,\"action\":\"选择要撤回的记录\",\"tool\":\"select_record\",\"expected\":\"选中记录\"},{\"step\":3,\"action\":\"检查撤回条件\",\"tool\":\"check_undo_conditions\",\"expected\":\"未结算/未审核/未后续引用\"},{\"step\":4,\"action\":\"确认撤回原因\",\"tool\":\"input_undo_reason\",\"expected\":\"填写原因\"},{\"step\":5,\"action\":\"执行撤回\",\"tool\":\"execute_undo\",\"expected\":\"回滚数据\"},{\"step\":6,\"action\":\"更新关联数据\",\"tool\":\"update_related\",\"expected\":\"同步进度/库存等\"}]',
  '{\"hasScanRecord\":true,\"hasUndoReason\":true}',
  '{\"verifyUndo\":true,\"verifyRelated\":true}',
  '撤回扫码,撤销扫码,扫码撤回,取消扫码,扫码错误',
  0.88, 'manual');

-- 【SOP-5】工资结算流程
INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, source)
VALUES (0, '工资结算标准流程', 'WAGE_SETTLEMENT',
  '[{\"step\":1,\"action\":\"选择结算周期\",\"tool\":\"select_period\",\"expected\":\"月结/周结/日结\"},{\"step\":2,\"action\":\"选择工厂/班组\",\"tool\":\"select_factory\",\"expected\":\"确定结算范围\"},{\"step\":3,\"action\":\"汇总计件数据\",\"tool\":\"sum_wage_data\",\"expected\":\"汇总所有计件记录\"},{\"step\":4,\"action\":\"检查是否有未完成的工序\",\"tool\":\"check_pending_process\",\"expected\":\"无进行中的工序\"},{\"step\":5,\"action\":\"计算工资明细\",\"tool\":\"calculate_wage\",\"expected\":\"生成工资条\"},{\"step\":6,\"action\":\"主管审核\",\"tool\":\"supervisor_approve\",\"expected\":\"审核通过\"},{\"step\":7,\"action\":\"确认发放\",\"tool\":\"confirm_payment\",\"expected\":\"更新状态为已结算\"},{\"step\":8,\"action\":\"锁定计件数据\",\"tool\":\"lock_wage_data\",\"expected\":\"禁止撤回已结算数据\"}]',
  '{\"hasPeriod\":true,\"hasFactory\":true,\"hasWageData\":true}',
  '{\"verifyWage\":true,\"verifyLock\":true}',
  '工资结算,计件工资,工资单,发工资,工资发放,结算工资',
  0.93, 'manual');

-- 【SOP-6】质检流程
INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, source)
VALUES (0, '质检全流程标准', 'QUALITY_CHECK',
  '[{\"step\":1,\"action\":\"首件检验\",\"tool\":\"first_article_qc\",\"expected\":\"大货前第一件检验\"},{\"step\":2,\"action\":\"AI视觉初筛\",\"tool\":\"ai_vision_screening\",\"expected\":\"快速识别明显缺陷\"},{\"step\":3,\"action\":\"人工巡检\",\"tool\":\"patrol_qc\",\"expected\":\"按比例抽检\"},{\"step\":4,\"action\":\"末件检验\",\"tool\":\"last_article_qc\",\"expected\":\"批次结束前最后一件\"},{\"step\":5,\"action\":\"记录疵点\",\"tool\":\"record_defect\",\"expected\":\"归类疵点原因\"},{\"step\":6,\"action\":\"出具质检报告\",\"tool\":\"generate_qc_report\",\"expected\":\"PDF报告\"},{\"step\":7,\"action\":\"决定是否返工\",\"tool\":\"decide_rework\",\"expected\":\"不合格率>阈值则返工\"}]',
  '{\"hasProductionBatch\":true}',
  '{\"verifyReport\":true,\"verifyRework\":true}',
  '质检流程,质量检验,QC流程,品质管控,次品处理,返工',
  0.91, 'manual');

-- 【SOP-7】交期预测流程
INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, source)
VALUES (0, '交期预测与风险评估流程', 'DELIVERY_FORECAST',
  '[{\"step\":1,\"action\":\"获取订单信息\",\"tool\":\"query_order\",\"expected\":\"订单详情\"},{\"step\":2,\"action\":\"分析工序进度\",\"tool\":\"analyze_process_progress\",\"expected\":\"各工序完成率\"},{\"step\":3,\"action\":\"评估物料状态\",\"tool\":\"evaluate_material_status\",\"expected\":\"物料到位率\"},{\"step\":4,\"action\":\"计算工厂产能\",\"tool\":\"calculate_factory_capacity\",\"expected\":\"日产能/剩余产能\"},{\"step\":5,\"action\":\"预测交期\",\"tool\":\"predict_delivery\",\"expected\":\"预计完成日期\"},{\"step\":6,\"action\":\"识别风险点\",\"tool\":\"identify_risk\",\"expected\":\"红色/黄色/绿色分级\"},{\"step\":7,\"action\":\"生成建议\",\"tool\":\"generate_suggestion\",\"expected\":\"如加急/催料/调整排产\"}]',
  '{\"hasOrder\":true,\"hasProduction\":true}',
  '{\"verifyForecast\":true,\"verifyRisk\":true}',
  '交期预测,交期,延期,什么时候好,交货时间,生产周期,排产',
  0.85, 'manual');

-- 【SOP-8】供应商评估流程
INSERT IGNORE INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, source)
VALUES (0, '供应商评估标准流程', 'SUPPLIER_EVAL',
  '[{\"step\":1,\"action\":\"选择供应商\",\"tool\":\"select_supplier\",\"expected\":\"确定评估对象\"},{\"step\":2,\"action\":\"统计准时交付率\",\"tool\":\"stat_on_time_rate\",\"expected\":\"近3-6个月数据\"},{\"step\":3,\"action\":\"统计质量合格率\",\"tool\":\"stat_quality_rate\",\"expected\":\"来料合格率/退货率\"},{\"step\":4,\"action\":\"评估价格竞争力\",\"tool\":\"eval_price\",\"expected\":\"与市场均价对比\"},{\"step\":5,\"action\":\"评估响应速度\",\"tool\":\"eval_response\",\"expected\":\"报价/交期响应平均时长\"},{\"step\":6,\"action\":\"综合评分\",\"tool\":\"calculate_score\",\"expected\":\"A/B/C/D 四级\"},{\"step\":7,\"action\":\"生成评估报告\",\"tool\":\"generate_eval_report\",\"expected\":\"PDF报告\"},{\"step\":8,\"action\":\"决定合作策略\",\"tool\":\"decide_strategy\",\"expected\":\"维持/优化/替换\"}]',
  '{\"hasSupplier\":true,\"hasHistoricalData\":true}',
  '{\"verifyReport\":true,\"verifyStrategy\":true}',
  '供应商评估,供应商评级,供应商考核,寻源,供应商风险,供应商评分,供应商管理',
  0.87, 'manual');
