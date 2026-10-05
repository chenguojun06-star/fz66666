package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.context.annotation.Lazy;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@Lazy
public class AiAgentToolAccessService {

    private static final LinkedHashMap<String, ToolRule> TOOL_RULES = new LinkedHashMap<>();
    private static final Map<String, Integer> TOOL_ORDER = new LinkedHashMap<>();

    static {
        // ── ANALYSIS 领域 ──
        register("tool_system_overview", "系统全局总览：订单、风险、今日动态与重点事项，适合\u201c系统状态、今天怎么样、最该关注什么\u201d", false, ToolDomain.ANALYSIS);
        register("tool_smart_report", "智能报告生成：日报、周报、月报，适合经营汇总与正式报告输出", false, ToolDomain.ANALYSIS);
        register("tool_deep_analysis", "深度分析：工厂排名、瓶颈、交期风险、成本结构，适合经营诊断", false, ToolDomain.ANALYSIS);
        register("tool_whatif", "推演沙盘：提前交货、换厂、加人、延期开工等方案测算", false, ToolDomain.ANALYSIS);
        // ── PRODUCTION 领域 ──
        register("tool_query_production_progress", "生产进度查询：按订单/款号查6大工序进度、工人数量、出货预测(80-90%)，支持菲号进度和工人统计", true, ToolDomain.PRODUCTION);
        register("tool_action_executor", "动作执行：紧急标记、备注、通知等轻量写操作，适合对象明确的直接处理", false, ToolDomain.PRODUCTION);
        register("tool_scan_undo", "扫码撤回：撤销错误扫码，受时效和业务规则限制", false, ToolDomain.PRODUCTION);
        register("tool_cutting_task_create", "裁剪单创建：按款号和颜色尺码数量直接开裁剪单", false, ToolDomain.PRODUCTION);
        register("tool_order_edit", "订单编辑：修改备注、紧急程度、工厂、客户、交期等", false, ToolDomain.PRODUCTION);
        register("tool_order_batch_close", "批量关单：关闭一个或多个生产订单，支持正常关单和特需关单", false, ToolDomain.PRODUCTION);
        register("tool_bundle_split_transfer", "拆菲转派：拆分菲号、转派执行人、查询拆分族谱、撤回拆分", false, ToolDomain.PRODUCTION);
        register("tool_order_learning", "下单学习：分析历史同款、推荐工厂与单价策略、解释成本偏高原因", false, ToolDomain.PRODUCTION);
        register("tool_query_order_remarks", "订单备注历史：查询指定订单的所有人工与系统自动备注（采购入库/裁剪领取/质检入库），适合'这单有什么问题''备注里写了什么'", false, ToolDomain.PRODUCTION);
        register("tool_order_comparison", "订单对比分析：对比异常订单与同款正常订单差异，定位异常根因，适合'为什么这单异常''跟正常单比'", false, ToolDomain.PRODUCTION);
        // ── FINANCE 领域 ──
        register("tool_query_financial_payroll", "本人计件工资查询：自己的扫码计件记录与已结算金额（工人仅限本人数据，管理员可查全员）", true, ToolDomain.FINANCE);
        register("tool_payroll_approve", "工资结算审批：通过或取消工资结算", false, ToolDomain.FINANCE);
        register("tool_material_reconciliation", "物料对账：查询对账状态、解释异常、推进处理", false, ToolDomain.FINANCE);
        register("tool_finance_workflow", "财务工作流：查看待付款待审批、执行付款与审批动作", false, ToolDomain.FINANCE);
        // ── WAREHOUSE 领域 ──
        register("tool_query_warehouse_stock", "面辅料库存查询：按材料、颜色、供应商查看库存与可用量", false, ToolDomain.WAREHOUSE);
        register("tool_finished_product_stock", "成品库存查询：按款号、颜色、尺码、SKU 查看大货库存", false, ToolDomain.WAREHOUSE);
        // ── STYLE 领域 ──
        register("tool_query_style_info", "款式资料查询：BOM、工价、开发进度、样衣阶段等款式信息", false, ToolDomain.STYLE);
        register("tool_sample_stock", "样衣库存查询：开发样、产前样、销售样等样衣库存与借出情况", false, ToolDomain.STYLE);
        // ── WAREHOUSE 补充 ──
        register("tool_material_audit", "面辅料审核：查看待审、发起审核、通过或驳回", false, ToolDomain.WAREHOUSE);
        register("tool_material_receive", "面辅料收货：智能收货预览、登记到货、直接入库、一键收货", false, ToolDomain.WAREHOUSE);
        register("tool_material_doc_receive", "采购单据自动收货：按识别单据回放结果直接执行收货或入库", false, ToolDomain.WAREHOUSE);
        register("tool_warehouse_op_log", "仓库操作日志：追溯样衣借调、归还、大货出库等审计轨迹", false, ToolDomain.WAREHOUSE);
        // ── STYLE 补充 ──
        register("tool_sample_workflow", "样衣与样板流程：启动阶段、更新进度、审核、推到下单管理", false, ToolDomain.STYLE);
        register("tool_sample_loan", "样衣借调归还：处理样衣借出、归还与库存回补", false, ToolDomain.STYLE);
        register("tool_style_template", "模板库与多码单价：生成模板、套模板、同步工序单价", false, ToolDomain.STYLE);
        // ── SYSTEM / GENERAL 领域 ──
        register("tool_knowledge_search", "知识库问答：行业术语、系统操作、业务规则与 FAQ", true, ToolDomain.GENERAL);
        register("tool_team_dispatch", "协同派单：把任务分配给跟单、采购、财务、仓库、主管等岗位", false, ToolDomain.SYSTEM);
        register("tool_create_production_order", "AI完整建单：按正式链路创建生产订单（仅管理员）", false, ToolDomain.PRODUCTION);
        register("tool_procurement", "采购管理：查询/创建采购单、确认到货入库（写操作仅管理员）", false, ToolDomain.WAREHOUSE);
        register("tool_org_query", "组织架构查询：部门树、部门列表、成员分布", false, ToolDomain.SYSTEM);
        // ── ANALYSIS 补充 ──
        register("tool_management_dashboard", "管理层经营仪表盘：实时KPI快照、风险等级、利润排名", false, ToolDomain.ANALYSIS);
        register("tool_ai_accuracy_query", "AI准确率查询：交期命中率、建议采纳率、平均偏差天数、自优化洞察", false, ToolDomain.ANALYSIS);
        register("tool_root_cause_analysis", "根因分析：深入分析问题根因，适合\u201c为什么\u201d\u201c根因是什么\u201d", false, ToolDomain.ANALYSIS);
        register("tool_pattern_discovery", "模式发现：识别数据规律与异常模式", false, ToolDomain.ANALYSIS);
        register("tool_delay_trend", "延期趋势分析：延期率走势、延期集中领域", false, ToolDomain.ANALYSIS);
        register("tool_sample_delay_analysis", "样板延期分析：样板开发延期原因与影响", false, ToolDomain.ANALYSIS);
        register("tool_personnel_delay_analysis", "人员延期分析：跟单员/岗位延期分布", false, ToolDomain.ANALYSIS);
        register("tool_supplier_scorecard", "供应商评分卡：工厂综合评分与对比", false, ToolDomain.ANALYSIS);
        register("tool_simulate_new_order", "新单模拟：模拟新订单对产能和交期的影响", false, ToolDomain.ANALYSIS);
        // ── PRODUCTION 补充 ──
        register("tool_defective_board", "次品看板：次品分布、返修/报废操作", false, ToolDomain.PRODUCTION);
        register("tool_production_exception", "生产异常：上报/查看生产异常事件", false, ToolDomain.PRODUCTION);
        register("tool_secondary_process", "二次工序：创建/更新二次加工工序", false, ToolDomain.PRODUCTION);
        register("tool_order_factory_transfer", "订单转厂：将订单从一家工厂转到另一家", false, ToolDomain.PRODUCTION);
        register("tool_order_factory_transfer_undo", "撤回转厂：撤销订单转厂操作", false, ToolDomain.PRODUCTION);
        register("tool_order_contact_urge", "催单通知：向跟单员/工厂发送催单提醒", false, ToolDomain.PRODUCTION);
        register("tool_quality_inbound", "成品质检入库：质检通过后登记入库", false, ToolDomain.PRODUCTION);
        register("tool_pattern_production", "样板生产：查看样板生产进度与状态", false, ToolDomain.PRODUCTION);
        // ── FINANCE 补充 ──
        register("tool_shipment_reconciliation", "出货对账查询：出货单与结算对账状态", false, ToolDomain.FINANCE);
        register("tool_payroll_anomaly_detector", "工资异常检测：识别计件工资异常波动", false, ToolDomain.FINANCE);
        // ── WAREHOUSE 补充 ──
        register("tool_finished_outbound", "成品出库：登记成品出库记录", false, ToolDomain.WAREHOUSE);
        register("tool_material_calculation", "物料计算：根据BOM计算物料需求量", false, ToolDomain.WAREHOUSE);
        register("tool_material_picking", "领料单：创建面辅料领料记录", false, ToolDomain.WAREHOUSE);
        // ── STYLE 补充 ──
        register("tool_query_style_difficulty", "款式难度查询：评估款式生产难度系数", false, ToolDomain.STYLE);
        // ── SYSTEM 补充 ──
        register("tool_change_approval", "变更审批：查看/通过/驳回变更申请", false, ToolDomain.SYSTEM);
        register("tool_query_crm_customer", "CRM客户查询：客户信息与交易记录", false, ToolDomain.SYSTEM);
        register("tool_query_system_user", "系统用户查询：用户账号与角色信息", false, ToolDomain.SYSTEM);
        // ── GENERAL 补充 ──
        register("tool_think", "内部推理：复杂问题分步思考，无副作用", true, ToolDomain.GENERAL);
        // ── FINANCE 新增 ──
        register("tool_invoice", "发票管理：查询/创建/开票/作废发票，发票统计", false, ToolDomain.FINANCE);
        register("tool_financial_report", "财务报表：利润表/资产负债表/现金流量表", false, ToolDomain.FINANCE);
        register("tool_ec_sales_revenue", "电商营收：查看电商渠道营收记录与统计", false, ToolDomain.FINANCE);
        register("tool_tax_config", "税务配置：查看税率列表、当前生效税率、计算税费", false, ToolDomain.FINANCE);
        // ── PRODUCTION 新增 ──
        register("tool_ecommerce_order", "电商订单：查看电商渠道订单列表与统计", false, ToolDomain.PRODUCTION);
        register("tool_order_transfer", "订单转单：查看/创建/接受/拒绝转单", false, ToolDomain.PRODUCTION);
        // ── STYLE 新增 ──
        register("tool_style_quotation", "款式报价：查询/创建/审核/解锁报价", false, ToolDomain.STYLE);
        register("tool_pattern_revision", "样衣改版：查看/创建/审批改版记录", false, ToolDomain.STYLE);
        // ── WAREHOUSE 新增 ──
        register("tool_material_roll", "物料卷：查看物料卷列表/详情/扫码", false, ToolDomain.WAREHOUSE);
        register("tool_material_quality_issue", "物料质量问题：查看/统计/解决质量问题", false, ToolDomain.WAREHOUSE);
        register("tool_inventory_check", "盘点管理：查看/创建/确认/取消盘点", false, ToolDomain.WAREHOUSE);
        register("tool_supplier", "供应商查询：查看供应商列表与详情", false, ToolDomain.WAREHOUSE);
        // ── SYSTEM 新增 ──
        register("tool_dict", "数据字典：查看字典列表、按类型查询字典项", false, ToolDomain.SYSTEM);
        // ── GENERAL 新增 ── 技能链
        register("tool_skill_execute", "执行预定义技能工作流：一句话触发多步操作，如月底财务结算、质检批量处理、风险订单巡检", false, ToolDomain.GENERAL);
        // ── ANALYSIS 新增 ── 顾问
        register("tool_hyper_advisor", "高级供应链AI顾问：风险量化、延期推演、产能模拟、策略建议，适合深度分析与专业建议", false, ToolDomain.ANALYSIS);
        // ── 2026-05-17 补注册之前遗漏的工具 ──
        register("tool_sourcing_expert", "采购供应商专家：评估供应商资质、成本、交期（通常由采购顾问触发）", false, ToolDomain.WAREHOUSE);
        register("tool_logistics_expert", "物流专家：查询订单物流状态、运输进度（通常由物流顾问触发）", false, ToolDomain.PRODUCTION);
        register("tool_compliance_expert", "合规专家：检查订单是否含违规内容、被审核拒绝原因（通常由合规顾问触发）", false, ToolDomain.PRODUCTION);
        register("tool_order_timeline", "订单操作时间线：查询订单从创建到当前各节点操作记录与时间线", false, ToolDomain.PRODUCTION);
        register("bargain_price_tool", "还价记录查询：订单/款式/工序的还价历史与最新还价单价", false, ToolDomain.FINANCE);
        register("tool_unit_price_query", "开发单价查询：查询开发阶段设定的工价单价", false, ToolDomain.FINANCE);
        register("tool_inventory_summary", "库存价值汇总：按仓库/品类统计库存总值、均价、数量分布", false, ToolDomain.WAREHOUSE);
        register("tool_avg_completion_time", "历史完工周期分析：按工厂/品类统计平均完成天数、中位数、准时率", false, ToolDomain.ANALYSIS);
        register("tool_quality_statistics", "质量统计：按工厂/类型统计质量缺陷分布与趋势", false, ToolDomain.WAREHOUSE);
        // ── 2026-07-22 新增：L4 程序性记忆自编辑工具 ──
        register("procedural_memory_tool", "SOP记忆编辑：AI自编辑SOP流程记忆，创建/更新/删除/启用/禁用/搜索SOP", false, ToolDomain.SYSTEM);

        // ── D-702 补注册：15 个「已实现但未注册」的工具 ──
        //
        // 审计发现（生产实证）：这些工具都有 @Component + extends AbstractAgentTool，
        // 会被 Spring 注入进 toolMap（生产日志「已注册工具」103 条印证），
        // **执行能力是有的**；但没进 TOOL_RULES，导致：
        //   · 权限：isWorkerVisible 返回 false（rule==null），工人永远看不到 —— 这项是安全的；
        //   · 领域：getDomainForTool 回落 ToolDomain.GENERAL，而 GENERAL 在 filterByDomains 里
        //     被显式豁免，所以不会被领域路由滤掉；
        //   · **引导语**：resolveGuide 走 resolveFallbackDescription 截断到 100 字符，
        //     system prompt 里拿到的是劣质描述。
        // 真正的致命点在最后一关：它们既不在 INTENT_TOOLS 意图映射表里，
        // 排序又是 TOOL_ORDER 的 MAX_VALUE（排最后），于是
        //   · 意图匹配成功 → 被 filter(advisedToolNames) 滤掉；
        //   · 意图匹配失败 → 领域集被 capTools 取 subList(0,12) 截断，它们排在最后仍被截掉。
        // 结果：**63% 的工具（62/99）在正常提问时 LLM 永远看不到**，
        // 用户问「有没有异常」「交期能不能赶上」时，模型想调也调不到。
        // 本组注册解决元数据缺失；「同域补齐」逻辑在 AiAgentToolAdvisor#advise 中实现可达性。
        register("tool_anomaly_detection", "异常检测：基于z-score检测产量飙升/质量异常/工人闲置/夜间扫码4类风险信号，适合「有没有异常」「今天有什么问题」「生产风险」", true, ToolDomain.ANALYSIS);
        register("tool_delivery_prediction", "交期预测：基于历史进度预测订单完工/出货时间与延期风险，适合「能不能按时交」「什么时候能出货」「交期有风险吗」", true, ToolDomain.PRODUCTION);
        register("tool_nl_query", "自然语言查询：把口语化问题翻译成结构化数据查询并返回真实数据，适合各类兜底式数据问答", true, ToolDomain.GENERAL);
        register("tool_finance_anomaly", "财务异常检测：识别工资/费用/对账中的异常波动与可疑记录，适合「财务有没有问题」「哪笔费用异常」", false, ToolDomain.FINANCE);
        register("tool_multi_agent_debate", "多智能体辩论：让 PMC/财务/品控/厂长四路视角就同一订单辩论并给结论，适合复杂订单的跨部门决策", false, ToolDomain.ANALYSIS);
        register("tool_scheduling_suggestion", "排产建议：基于产能与订单交期给出排产调整建议", false, ToolDomain.PRODUCTION);
        register("tool_standard_action", "标准动作：执行系统预定义的标准作业动作", false, ToolDomain.GENERAL);
        register("tool_digital_employee", "数字员工：把重复作业交给数字员工自动执行", false, ToolDomain.GENERAL);
        register("tool_visual_style_search", "以图搜款：上传款式图片，从向量库检索相似款，适合「找相似款」「这个款有没有近似的」", true, ToolDomain.STYLE);
        register("tool_vision_analyze", "款式图像分析：识别款式图片的品类、颜色、细节特征", true, ToolDomain.STYLE);
        register("tool_vision_style_identify", "款式识别：识别图片中的具体款号与款式归属", true, ToolDomain.STYLE);
        register("tool_vision_defect_detect", "次品识别：从图片中识别缺陷/瑕疵，适合车间现场拍照质检", true, ToolDomain.STYLE);
        register("tool_vision_color_check", "颜色核对：比对手工标注颜色与图片实际颜色的差异", true, ToolDomain.STYLE);
        // 运维/开发类：仅超管可用。刻意不放 workerVisible，避免车间用户误触数据库结构检查
        register("tool_db_health_check", "数据库健康检查：表膨胀、慢查询、连接数诊断（仅超管）", false, ToolDomain.SYSTEM);
        register("tool_flyway_safety_check", "Flyway 迁移安全检查：校验数据库迁移脚本合规性（仅超管，开发诊断用）", false, ToolDomain.SYSTEM);

        // ── D-702：补登记两个由 McpToolScanner 扫描注册、但未进本表的能力 ──
        //
        // 二者都会进 toolMap（具备执行能力），但不登记就没有引导语与领域标签：
        // 引导语走 resolveFallbackDescription 截断到 100 字符，领域回落 GENERAL。
        // 结果是管理员能用但描述劣质、工人永远不可见，属于「半接入」状态。
        // 与其靠"漏登记"让它处于半接入，不如显式登记并给出正确定义。
        register("external_search", "外部信息搜索：检索行业政策、市场行情、原料价格等外部资料，"
                + "适合「查一下最新棉价」「有什么新政策」这类需要外部信息的问题", true, ToolDomain.GENERAL);
        // 代码图谱检索：与业务数据无关，只对管理员开放，避免业务用户误用它查业务问题
        register("code_index_search", "代码图谱检索：查询代码结构与依赖关系（仅管理侧，开发诊断用）",
                false, ToolDomain.SYSTEM);
    }

    private static final Set<String> HIGH_RISK_TOOLS = Set.of(
            "tool_scan_undo", "tool_cutting_task_create", "tool_order_edit",
            "tool_order_batch_close",
            "tool_payroll_approve", "tool_action_executor", "tool_bundle_split_transfer",
            "tool_create_production_order",
            "tool_change_approval", "tool_order_factory_transfer", "tool_order_factory_transfer_undo",
            "tool_finance_workflow", "tool_quality_inbound", "tool_finished_outbound",
            "tool_sample_workflow", "tool_style_template", "tool_team_dispatch",
            "tool_material_doc_receive", "tool_material_receive", "tool_material_audit",
            "tool_material_reconciliation", "tool_defective_board",
            "tool_invoice", "tool_financial_report", "tool_style_quotation",
            "tool_order_transfer", "tool_pattern_revision", "tool_inventory_check",
            "tool_sample_loan", "tool_order_contact_urge", "tool_production_exception",
            "tool_secondary_process", "tool_material_picking", "tool_material_quality_issue"
    );

    private static final Set<String> WRITE_OPERATION_TOOLS = Set.of(
            "tool_procurement",
            "tool_order_factory_transfer_undo",
            "tool_sample_loan",
            "tool_order_contact_urge",
            "tool_defective_board",
            "tool_material_quality_issue"
    );

    public enum ConfirmLevel { READ_ONLY, WRITE, HIGH_RISK }

    public static boolean isHighRisk(String toolName) {
        return toolName != null && HIGH_RISK_TOOLS.contains(toolName);
    }

    public static boolean isWriteOperation(String toolName) {
        if (toolName == null) return false;
        return HIGH_RISK_TOOLS.contains(toolName) || WRITE_OPERATION_TOOLS.contains(toolName);
    }

    public static ConfirmLevel getConfirmLevel(String toolName) {
        if (toolName == null) return ConfirmLevel.READ_ONLY;
        if (HIGH_RISK_TOOLS.contains(toolName)) return ConfirmLevel.HIGH_RISK;
        if (WRITE_OPERATION_TOOLS.contains(toolName)) return ConfirmLevel.WRITE;
        return ConfirmLevel.READ_ONLY;
    }

    private static final Map<String, String> TOOL_CONFIRM_LABELS = Map.ofEntries(
            Map.entry("tool_sample_loan", "样衣借调"),
            Map.entry("tool_scan_undo", "扫码撤回"),
            Map.entry("tool_cutting_task_create", "裁剪单创建"),
            Map.entry("tool_order_edit", "订单编辑"),
            Map.entry("tool_order_batch_close", "批量关单"),
            Map.entry("tool_payroll_approve", "工资审批"),
            Map.entry("tool_action_executor", "操作执行"),
            Map.entry("tool_bundle_split_transfer", "拆菲转派"),
            Map.entry("tool_create_production_order", "创建订单"),
            Map.entry("tool_change_approval", "变更审批"),
            Map.entry("tool_order_factory_transfer", "订单转厂"),
            Map.entry("tool_order_factory_transfer_undo", "撤回转厂"),
            Map.entry("tool_finance_workflow", "财务操作"),
            Map.entry("tool_quality_inbound", "质检入库"),
            Map.entry("tool_finished_outbound", "成品出库"),
            Map.entry("tool_sample_workflow", "样衣流程"),
            Map.entry("tool_style_template", "模板操作"),
            Map.entry("tool_team_dispatch", "协同派单"),
            Map.entry("tool_material_doc_receive", "单据收货"),
            Map.entry("tool_material_receive", "面辅料收货"),
            Map.entry("tool_material_audit", "面辅料审核"),
            Map.entry("tool_material_reconciliation", "物料对账"),
            Map.entry("tool_invoice", "发票操作"),
            Map.entry("tool_financial_report", "财务报表"),
            Map.entry("tool_style_quotation", "款式报价"),
            Map.entry("tool_order_transfer", "订单转单"),
            Map.entry("tool_pattern_revision", "样衣改版"),
            Map.entry("tool_inventory_check", "盘点操作"),
            Map.entry("tool_order_contact_urge", "催单通知"),
            Map.entry("tool_production_exception", "生产异常"),
            Map.entry("tool_secondary_process", "二次工序"),
            Map.entry("tool_material_picking", "领料操作"),
            Map.entry("tool_material_quality_issue", "质量问题"),
            Map.entry("tool_procurement", "采购操作"),
            Map.entry("tool_defective_board", "次品操作"),
            Map.entry("procedural_memory_tool", "确认编辑 SOP 记忆")
    );

    public static String getConfirmLabel(String toolName) {
        if (toolName == null) return "操作";
        return TOOL_CONFIRM_LABELS.getOrDefault(toolName, "操作");
    }

    private static final long APPROVAL_TOKEN_TTL_MS = 30 * 60 * 1000L;
    private final Map<String, ApprovalEntry> approvalTokens = new ConcurrentHashMap<>();

    public boolean isHighRiskTool(String toolName) {
        return isHighRisk(toolName);
    }

    public String generateApprovalToken(String toolName, Map<String, Object> args) {
        String token = UUID.randomUUID().toString().replace("-", "");
        approvalTokens.put(token, new ApprovalEntry(toolName, System.currentTimeMillis()));
        return token;
    }

    public boolean validateApprovalToken(String toolName, String token) {
        ApprovalEntry entry = approvalTokens.remove(token);
        if (entry == null) return false;
        if (!entry.toolName.equals(toolName)) return false;
        if (System.currentTimeMillis() - entry.createdAt > APPROVAL_TOKEN_TTL_MS) return false;
        return true;
    }

    @lombok.AllArgsConstructor
    @lombok.Data
    private static class ApprovalEntry {
        private final String toolName;
        private final long createdAt;
    }

    public static ToolDomain getDomainForTool(String toolName) {
        ToolRule rule = TOOL_RULES.get(toolName);
        return rule != null ? rule.domain : ToolDomain.GENERAL;
    }

    /**
     * D-702：该工具是否已登记（用于验收与自检）。
     *
     * <p>未登记的��具仍会被 Spring 注入 {@code toolMap}（具备执行能力），
     * 但拿不到引导语与领域标签，且不会被纳入任何意图映射 ——
     * 属于「建了却选不到」。运维/测试需要能主动查出这类工具，故公开此查询。
     */
    public static boolean isRegistered(String toolName) {
        return TOOL_RULES.containsKey(toolName);
    }

    /** D-702：已登记的工具名集合（只读副本）。 */
    public static Set<String> registeredToolNames() {
        return java.util.Collections.unmodifiableSet(TOOL_RULES.keySet());
    }

    public List<AgentTool> filterByDomains(List<AgentTool> tools, Set<ToolDomain> domains) {
        if (domains == null || domains.isEmpty()) {
            return tools;
        }
        return tools.stream()
                .filter(t -> {
                    ToolDomain d = getDomainForTool(t.getName());
                    return domains.contains(d) || d == ToolDomain.SYSTEM || d == ToolDomain.GENERAL || d == ToolDomain.ANALYSIS;
                })
                .collect(Collectors.toList());
    }

    public boolean hasManagerAccess() {
        if (UserContext.isSuperAdmin() || UserContext.isTenantOwner() || UserContext.isSupervisorOrAbove()) {
            return true;
        }

        String role = UserContext.role();
        if (!StringUtils.hasText(role)) {
            return false;
        }

        String normalized = role.trim().toLowerCase(Locale.ROOT);
        return normalized.contains("merchandiser")
                || normalized.contains("director")
                || normalized.contains("owner")
                || normalized.contains("boss")
                || normalized.contains("chief")
                || normalized.contains("head")
                || role.contains("跟单")
                || role.contains("主管")
                || role.contains("管理")
                || role.contains("组长")
                || role.contains("班长")
                || role.contains("厂长")
                || role.contains("老板");
    }

    private static final Set<ToolDomain> FACTORY_BLOCKED_DOMAINS = Set.of(
            ToolDomain.FINANCE, ToolDomain.STYLE
    );

    private static final Set<String> FACTORY_BLOCKED_TOOLS = Set.of(
            "tool_shipment_reconciliation",
            "tool_material_reconciliation",
            "tool_sample_workflow",
            "tool_sample_loan",
            "tool_sample_stock",
            "tool_style_template",
            "tool_query_style_info",
            "tool_query_style_difficulty",
            "tool_style_quotation",
            "tool_pattern_revision",
            "tool_order_learning",
            "tool_procurement",
            "tool_invoice",
            "tool_financial_report",
            "tool_ec_sales_revenue",
            "tool_tax_config",
            "tool_ecommerce_order",
            "tool_payroll_anomaly_detector"
    );

    private static final List<String> SUPER_ADMIN_ONLY_TOOLS = List.of();

    public List<AgentTool> resolveVisibleTools(List<AgentTool> registeredTools) {
        if (registeredTools == null || registeredTools.isEmpty()) {
            return List.of();
        }

        boolean managerAccess = hasManagerAccess();
        boolean superAdmin = UserContext.isSuperAdmin();
        boolean factoryUser = UserContext.factoryId() != null;
        return registeredTools.stream()
                .filter(tool -> {
                    if (SUPER_ADMIN_ONLY_TOOLS.contains(tool.getName())) {
                        return superAdmin;
                    }
                    if (factoryUser && isFactoryBlocked(tool.getName())) {
                        return false;
                    }
                    return managerAccess || isWorkerVisible(tool.getName());
                })
                .sorted(Comparator
                        .comparingInt((AgentTool tool) -> TOOL_ORDER.getOrDefault(tool.getName(), Integer.MAX_VALUE))
                        .thenComparing(AgentTool::getName))
                .collect(Collectors.toList());
    }

    public List<AiTool> toApiTools(List<AgentTool> visibleTools) {
        if (visibleTools == null || visibleTools.isEmpty()) {
            return List.of();
        }
        return visibleTools.stream()
                .map(AgentTool::getToolDefinition)
                .collect(Collectors.toList());
    }

    public boolean canUseTool(String toolName) {
        if (SUPER_ADMIN_ONLY_TOOLS.contains(toolName)) {
            return UserContext.isSuperAdmin();
        }
        if (UserContext.factoryId() != null && isFactoryBlocked(toolName)) {
            return false;
        }
        return hasManagerAccess() || isWorkerVisible(toolName);
    }

    private boolean isFactoryBlocked(String toolName) {
        if (FACTORY_BLOCKED_TOOLS.contains(toolName)) {
            return true;
        }
        ToolRule rule = TOOL_RULES.get(toolName);
        return rule != null && FACTORY_BLOCKED_DOMAINS.contains(rule.domain);
    }

    private java.util.Map<String, String> toolGuideCache = new java.util.concurrent.ConcurrentHashMap<>();
    private java.util.Map<String, Long> toolGuideCacheTime = new java.util.concurrent.ConcurrentHashMap<>();
    private static final long TOOL_GUIDE_CACHE_TTL_MS = 5 * 60 * 1000L;

    public String buildToolGuide(List<AgentTool> visibleTools) {
        String cacheKey = buildToolCacheKey(visibleTools);
        Long cachedTime = toolGuideCacheTime.get(cacheKey);
        if (cachedTime != null && (System.currentTimeMillis() - cachedTime) < TOOL_GUIDE_CACHE_TTL_MS) {
            return toolGuideCache.get(cacheKey);
        }
        StringBuilder builder = new StringBuilder();
        builder.append("【当前会话可用工具】\n");
        if (visibleTools == null || visibleTools.isEmpty()) {
            builder.append("当前账号未开放任何业务工具，本轮只能基于已有上下文回答。\n\n");
            String result = builder.toString();
            toolGuideCache.put(cacheKey, result);
            toolGuideCacheTime.put(cacheKey, System.currentTimeMillis());
            return result;
        }
        int index = 1;
        for (AgentTool tool : visibleTools) {
            String label = com.fashion.supplychain.intelligence.helper.PromptToolLabelMapper.toolNameToLabel(tool.getName());
            builder.append(index++)
                    .append(". ")
                    .append(label)
                    .append(" — ")
                    .append(resolveGuide(tool))
                    .append("\n");
        }
        if (!hasManagerAccess()) {
            builder.append("当前账号开放本人直接相关的查询：工序跟进、本人计件工资明细、系统知识库；管理、审批、财务总览、跨部门协同类工具已自动隐藏。\n");
        }
        builder.append("\n");
        String result = builder.toString();
        toolGuideCache.put(cacheKey, result);
        toolGuideCacheTime.put(cacheKey, System.currentTimeMillis());
        return result;
    }

    private String buildToolCacheKey(List<AgentTool> tools) {
        if (tools == null || tools.isEmpty()) return "empty";
        // P1 修复（铁律4 多租户隔离）：缓存键含 tenantId，避免跨租户共享工具可见性配置
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        StringBuilder sb = new StringBuilder();
        sb.append("t").append(tenantId == null ? 0 : tenantId).append(':');
        sb.append(hasManagerAccess() ? "M" : "W");
        for (AgentTool t : tools) sb.append('|').append(t.getName());
        return sb.toString();
    }

    private boolean isWorkerVisible(String toolName) {
        ToolRule rule = TOOL_RULES.get(toolName);
        return rule != null && rule.workerVisible;
    }

    private String resolveGuide(AgentTool tool) {
        ToolRule rule = TOOL_RULES.get(tool.getName());
        if (rule != null) {
            return rule.guide;
        }
        return truncate(resolveFallbackDescription(tool), 100);
    }

    private String resolveFallbackDescription(AgentTool tool) {
        AiTool toolDefinition = tool.getToolDefinition();
        if (toolDefinition == null || toolDefinition.getFunction() == null) {
            return "通用业务工具";
        }
        String description = toolDefinition.getFunction().getDescription();
        if (!StringUtils.hasText(description)) {
            return "通用业务工具";
        }
        return description.replace("\n", " ").replace("\r", " ").trim();
    }

    private String truncate(String text, int maxLength) {
        if (!StringUtils.hasText(text) || text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, Math.max(0, maxLength - 1)) + "…";
    }

    private static void register(String toolName, String guide, boolean workerVisible, ToolDomain domain) {
        TOOL_RULES.put(toolName, new ToolRule(guide, workerVisible, domain));
        TOOL_ORDER.put(toolName, TOOL_ORDER.size());
    }

    static final class ToolRule {
        final String guide;
        final boolean workerVisible;
        final ToolDomain domain;

        ToolRule(String guide, boolean workerVisible, ToolDomain domain) {
            this.guide = guide;
            this.workerVisible = workerVisible;
            this.domain = domain;
        }
    }
}
