-- ============================================================
-- V20270626004：L4 程序性记忆表（t_procedural_memory）
-- 目的：显式存储 SOP/流程/技能，AI 直接调用而非推理
-- 关联：五层记忆模型设计文档（five-layer-memory-design.md）
-- P0 铁律 #4：tenant_id 必填
-- ============================================================

CREATE TABLE IF NOT EXISTS t_procedural_memory (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）',
    sop_name VARCHAR(128) NOT NULL COMMENT 'SOP名称',
    sop_type VARCHAR(32) NOT NULL COMMENT 'SCAN_WORKFLOW/WAGE_SETTLEMENT/DELIVERY_FORECAST/SUPPLIER_EVAL/QUALITY_CHECK',
    steps_json TEXT NOT NULL COMMENT '步骤数组JSON：[{step,action,tool,expected}]',
    preconditions TEXT COMMENT '前置条件JSON',
    postcheck TEXT COMMENT '后置校验JSON',
    trigger_keywords VARCHAR(512) COMMENT '触发关键词，逗号分隔',
    confidence DECIMAL(5,2) DEFAULT 0.80 COMMENT '置信度0-100',
    usage_count INT DEFAULT 0 COMMENT '调用次数',
    success_count INT DEFAULT 0 COMMENT '成功次数',
    version INT DEFAULT 1 COMMENT '版本号（SOP过期时升级）',
    source VARCHAR(32) DEFAULT 'manual' COMMENT 'manual/crystallized',
    enabled TINYINT DEFAULT 1,
    delete_flag TINYINT DEFAULT 0,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_sop (tenant_id, sop_name),
    KEY idx_sop_type (tenant_id, sop_type),
    KEY idx_trigger (tenant_id, trigger_keywords(64))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='L4程序性记忆：SOP/流程/技能';

-- ============================================================
-- 初始化 5 类 SOP（每个租户一份通用模板，tenant_id=0 代表通用模板）
-- ============================================================

INSERT INTO t_procedural_memory (tenant_id, sop_name, sop_type, steps_json, preconditions, postcheck, trigger_keywords, confidence)
VALUES
(0, '扫码流程SOP', 'SCAN_WORKFLOW',
'[{"step":1,"action":"扫描款号/菲号","tool":"scan_qrcode","expected":"进入扫码详情页"},{"step":2,"action":"校验订单/裁剪任务状态","tool":"check_order_status","expected":"订单状态非终态"},{"step":3,"action":"选择工序","tool":"select_process","expected":"工序列表展示"},{"step":4,"action":"提交扫码记录","tool":"submit_scan","expected":"记录保存成功"},{"step":5,"action":"更新订单进度","tool":"update_progress","expected":"进度+1"}]',
'{"condition":"用户已登录，当前用户非只读角色","params":["styleNo或bundleId"]}',
'{"check":"scan_record表中新增记录+订单进度更新","must":true}',
'扫码,工序扫码,质检扫码,入库扫码,扫一扫,scan,qrcode,二维码',
85.00),

(0, '工资结算SOP', 'WAGE_SETTLEMENT',
'[{"step":1,"action":"选择结算周期","tool":"select_period","expected":"周期内扫码记录汇总"},{"step":2,"action":"校验计件数量","tool":"verify_quantity","expected":"数量与扫码一致"},{"step":3,"action":"计算工价","tool":"calc_wage","expected":"工价=数量×单价"},{"step":4,"action":"生成工资单","tool":"create_payroll","expected":"工资单保存"},{"step":5,"action":"提交审核","tool":"submit_review","expected":"状态变为PENDING_REVIEW"}]',
'{"condition":"当前用户为财务或管理员","params":["period"]}',
'{"check":"t_wage_payment新增记录+状态正确","must":true}',
'工资,结算,计件,工资单,工价,wage,payment,payroll',
85.00),

(0, '交期预测SOP', 'DELIVERY_FORECAST',
'[{"step":1,"action":"查询订单当前工序","tool":"get_current_process","expected":"返回当前工序名+剩余工序数"},{"step":2,"action":"查询历史工序耗时","tool":"get_avg_duration","expected":"返回各工序平均耗时"},{"step":3,"action":"计算预计完成时间","tool":"calc_eta","expected":"返回ETA+置信区间"},{"step":4,"action":"判断是否延期","tool":"check_delayed","expected":"布尔值+延期天数"}]',
'{"condition":"订单存在且状态非终态","params":["orderId"]}',
'{"check":"返回ETA+状态标记","must":true}',
'交期,延期,排产,产能,delivery,schedule,eta,产能',
85.00),

(0, '供应商评估SOP', 'SUPPLIER_EVAL',
'[{"step":1,"action":"查询供应商历史订单","tool":"get_supplier_orders","expected":"返回订单列表+交付数据"},{"step":2,"action":"计算准时交付率","tool":"calc_otd","expected":"返回百分比"},{"step":3,"action":"计算质量合格率","tool":"calc_qpr","expected":"返回百分比"},{"step":4,"action":"综合评分（A/B/C/D）","tool":"grade_supplier","expected":"返回等级"}]',
'{"condition":"供应商存在且有历史订单","params":["supplierId"]}',
'{"check":"返回等级+评分明细","must":true}',
'供应商,评估,评级,A级,B级,C级,supplier,grade,risk',
85.00),

(0, '质检流程SOP', 'QUALITY_CHECK',
'[{"step":1,"action":"扫码定位到工序","tool":"scan_to_process","expected":"进入质检扫码页"},{"step":2,"action":"选择质检结果（合格/次品）","tool":"select_result","expected":"弹出次品描述框（若次品）"},{"step":3,"action":"填写次品原因+数量","tool":"fill_defect","expected":"次品记录保存"},{"step":4,"action":"生成质检报告","tool":"create_qc","expected":"报告保存+合格品可入库"}]',
'{"condition":"当前工序有扫码记录","params":["scanRecordId"]}',
'{"check":"t_qc_record新增+合格品扫码记录生效","must":true}',
'质检,次品,返工,不合格,quality,defect,rework',
85.00)
ON DUPLICATE KEY UPDATE update_time=CURRENT_TIMESTAMP;
