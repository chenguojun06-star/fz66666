-- ==================================================================
-- V202707261000: 导入 5 类 SOP 初始数据到 t_procedural_memory
-- ==================================================================
-- 背景（five-layer-memory-design.md 第四章 P0 任务）：
--   L4 Procedural Memory 基础设施已完整（Entity/Mapper/Service/PromptHelper 注入），
--   但 t_procedural_memory 表为空，AI 检索不到任何 SOP，流程类问题仍靠推理。
--   本迁移导入 5 类核心业务 SOP，让 AI 直接调用而非推理。
--
-- 数据策略：
--   - tenant_id=0 表示全局共享 SOP（所有租户可用，AiAgentMemoryHelper.loadProceduralPatternsFromDb 已查 tenant_id=0）
--   - source='manual' 表示人工编写
--   - confidence=0.85 初始置信度（高置信度确保注入）
--   - enabled=1 启用
--   - steps_json 格式：[{"step":1,"action":"动作","tool":"工具","expected":"预期"}]
--
-- 多租户安全（P0 铁律 4）：
--   - tenant_id=0 是全局共享，不违反多租户隔离（所有租户都能用同一套标准 SOP）
--   - 租户私有 SOP 由 ProceduralMemoryService.createSop 按 tenantId 创建
--
-- 幂等性（P0 铁律 1）：
--   - uk_tenant_sop(tenant_id, sop_name) 保证唯一
--   - 用 INSERT ... ON DUPLICATE KEY UPDATE 实现幂等（重复执行不报错，更新 steps_json）
--   - 禁止 IF NOT EXISTS（MySQL 8.0 不支持）
-- ==================================================================

-- ── 1. 扫码流程 SOP ──
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, usage_count, success_count, version, source, enabled, delete_flag)
VALUES (0, '扫码操作标准流程', 'SCAN_WORKFLOW',
        '[{"step":1,"action":"识别扫码类型","tool":"ask_user","expected":"明确生产扫码/质检扫码/入库扫码"},{"step":2,"action":"查询订单工序流程","tool":"query_order_workflow","expected":"获取工序节点和进度状态"},{"step":3,"action":"校验菲号归属","tool":"verify_bundle_owner","expected":"菲号属于当前操作员且未扫码"},{"step":4,"action":"执行扫码","tool":"scan_record","expected":"扫码成功，进度更新"},{"step":5,"action":"撤回说明","tool":"scan_undo","expected":"工资已结算的扫码禁止撤回"}]',
        '{"operator_id_required":true,"order_not_closed":true}',
        '{"progress_updated":true,"scan_record_logged":true}',
        '扫码,扫描,工序扫码,质检扫码,入库扫码,菲号,扫码撤回,重扫',
        0.85, 0, 0, 1, 'manual', 1, 0)
ON DUPLICATE KEY UPDATE
    steps_json = VALUES(steps_json),
    preconditions = VALUES(preconditions),
    postcheck = VALUES(postcheck),
    trigger_keywords = VALUES(trigger_keywords),
    confidence = VALUES(confidence),
    source = VALUES(source),
    enabled = VALUES(enabled);

-- ── 2. 工资结算 SOP ──
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, usage_count, success_count, version, source, enabled, delete_flag)
VALUES (0, '工资结算标准流程', 'WAGE_SETTLEMENT',
        '[{"step":1,"action":"确认结算周期","tool":"ask_user","expected":"明确结算起止时间"},{"step":2,"action":"校验操作员归属","tool":"verify_operator_tenant","expected":"操作员属于当前租户"},{"step":3,"action":"排除外发任务","tool":"exclude_outsource_tasks","expected":"外发任务不计入本厂工资"},{"step":4,"action":"检查撤回拦截","tool":"check_wage_settled","expected":"工资已结算的扫码禁止撤回"},{"step":5,"action":"生成工资单","tool":"generate_payroll","expected":"工资单生成并推送账单"}]',
        '{"settlement_period_required":true,"operator_verified":true}',
        '{"payroll_generated":true,"bill_pushed":true}',
        '工资,结算,计件,报工,工资单,工钱,工资结算,工资撤回',
        0.85, 0, 0, 1, 'manual', 1, 0)
ON DUPLICATE KEY UPDATE
    steps_json = VALUES(steps_json),
    preconditions = VALUES(preconditions),
    postcheck = VALUES(postcheck),
    trigger_keywords = VALUES(trigger_keywords),
    confidence = VALUES(confidence),
    source = VALUES(source),
    enabled = VALUES(enabled);

-- ── 3. 交期预测 SOP ──
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, usage_count, success_count, version, source, enabled, delete_flag)
VALUES (0, '交期预测标准流程', 'DELIVERY_FORECAST',
        '[{"step":1,"action":"查询订单工序进度","tool":"query_order_progress","expected":"获取6大节点完成率"},{"step":2,"action":"评估供应商准时交付率","tool":"supplier_score","expected":"获取物料到货历史评分"},{"step":3,"action":"检查物料到货状态","tool":"material_arrival","expected":"确认物料是否齐套"},{"step":4,"action":"计算质检返工率","tool":"quality_rework_rate","expected":"获取历史返工率影响"},{"step":5,"action":"输出风险分级","tool":"delivery_forecast","expected":"绿色/黄色/红色分级建议"}]',
        '{"order_id_required":true}',
        '{"risk_level_output":true}',
        '交期,预测,延期,延误,交付风险,排产,排程,产能,瓶颈,工期',
        0.85, 0, 0, 1, 'manual', 1, 0)
ON DUPLICATE KEY UPDATE
    steps_json = VALUES(steps_json),
    preconditions = VALUES(preconditions),
    postcheck = VALUES(postcheck),
    trigger_keywords = VALUES(trigger_keywords),
    confidence = VALUES(confidence),
    source = VALUES(source),
    enabled = VALUES(enabled);

-- ── 4. 供应商评估 SOP ──
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, usage_count, success_count, version, source, enabled, delete_flag)
VALUES (0, '供应商评估标准流程', 'SUPPLIER_EVAL',
        '[{"step":1,"action":"查询准时交付率","tool":"supplier_delivery_rate","expected":"近90天按时交付订单占比"},{"step":2,"action":"查询质量合格率","tool":"supplier_quality_rate","expected":"来料/成品合格率"},{"step":3,"action":"评估价格竞争力","tool":"supplier_price_compare","expected":"同品类市场均价对比"},{"step":4,"action":"评估响应速度","tool":"supplier_response_time","expected":"订单确认/发货平均响应时长"},{"step":5,"action":"输出ABCD风险分级","tool":"supplier_grade","expected":"A级优秀/B级合格/C级观察/D级淘汰"}]',
        '{"supplier_id_required":true}',
        '{"grade_output":true}',
        '供应商,评估,评级,考核,寻源,供应商风险,供应商评分,合格率,交付率',
        0.85, 0, 0, 1, 'manual', 1, 0)
ON DUPLICATE KEY UPDATE
    steps_json = VALUES(steps_json),
    preconditions = VALUES(preconditions),
    postcheck = VALUES(postcheck),
    trigger_keywords = VALUES(trigger_keywords),
    confidence = VALUES(confidence),
    source = VALUES(source),
    enabled = VALUES(enabled);

-- ── 5. 质检流程 SOP ──
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, usage_count, success_count, version, source, enabled, delete_flag)
VALUES (0, '质检操作标准流程', 'QUALITY_CHECK',
        '[{"step":1,"action":"识别质检类型","tool":"ask_user","expected":"明确首件/巡检/末件/入库质检"},{"step":2,"action":"查询质检标准","tool":"query_qc_standard","expected":"获取该款式质检项和合格标准"},{"step":3,"action":"执行质检扫码","tool":"quality_scan","expected":"扫码记录质检结果"},{"step":4,"action":"次品处理","tool":"defect_handle","expected":"次品隔离+返工单生成"},{"step":5,"action":"更新合格率","tool":"update_pass_rate","expected":"合格率自动重算"}]',
        '{"qc_operator_required":true,"order_not_closed":true}',
        '{"qc_record_logged":true,"pass_rate_updated":true}',
        '质检,检验,次品,返工,不合格,合格率,首件,巡检,末件,入库质检,疵点,视觉质检',
        0.85, 0, 0, 1, 'manual', 1, 0)
ON DUPLICATE KEY UPDATE
    steps_json = VALUES(steps_json),
    preconditions = VALUES(preconditions),
    postcheck = VALUES(postcheck),
    trigger_keywords = VALUES(trigger_keywords),
    confidence = VALUES(confidence),
    source = VALUES(source),
    enabled = VALUES(enabled);

-- ── 6. 采购流程 SOP（补充：基于近期采购链路优化） ──
INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence, usage_count, success_count, version, source, enabled, delete_flag)
VALUES (0, '采购操作标准流程', 'SCAN_WORKFLOW',
        '[{"step":1,"action":"创建采购单","tool":"create_purchase","expected":"按BOM生成采购单"},{"step":2,"action":"到货登记","tool":"receive_purchase","expected":"登记到货数量，状态变为received"},{"step":3,"action":"回料确认","tool":"confirm_return","expected":"回料确认后锁定，无法撤回"},{"step":4,"action":"撤回采购","tool":"cancel_receive","expected":"已回料确认或已出库的禁止撤回"},{"step":5,"action":"确认完成","tool":"confirm_complete","expected":"状态变为completed，触发订单采购阶段完成"}]',
        '{"purchase_id_required":true}',
        '{"status_updated":true,"bill_pushed":true}',
        '采购,物料采购,到货,回料,撤回采购,确认完成,采购单,领料,出库',
        0.85, 0, 0, 1, 'manual', 1, 0)
ON DUPLICATE KEY UPDATE
    steps_json = VALUES(steps_json),
    preconditions = VALUES(preconditions),
    postcheck = VALUES(postcheck),
    trigger_keywords = VALUES(trigger_keywords),
    confidence = VALUES(confidence),
    source = VALUES(source),
    enabled = VALUES(enabled);
