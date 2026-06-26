package com.fashion.supplychain.intelligence.routing;

import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.orchestration.ProcessRewardOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@Lazy
public class AiAgentToolAdvisor {

    /**
     * P1: PRM 反馈闭环 — 用户历史点赞的工具，在同意图下优先展示给 LLM。
     * required=false 防止启动失败，PRM 不可用时静默降级为静态排序。
     */
    @Autowired(required = false)
    private ProcessRewardOrchestrator processRewardOrchestrator;

    private static final Map<String, List<Pattern>> INTENT_TOOL_MAP = new LinkedHashMap<>();

    static {
        INTENT_TOOL_MAP.put("query_progress", compileAll(
                "进度", "跟进", "查询进度", "做到哪了", "完成多少", "扫码记录", "工序进度",
                "出货", "多久", "什么时候", "菲号进度", "几个人", "几个工人", "还要多久",
                "能出货吗", "预计完成", "交期", "生产进度", "订单进度", "做到哪",
                "做了多少", "做了几件", "多少人在做", "多少人在生产", "几个人在做",
                "什么时候做好", "什么时候完成", "什么时候交货", "还要几天",
                "完成情况", "生产情况", "进展", "做完了没有", "能按时交吗",
                "延期了吗", "会延期吗", "赶得上吗", "到哪一步了", "到哪步了",
                "还没好吗", "好了没有", "什么时候好", "还有几天", "还有多久",
                "生产到哪了", "货好了吗", "能发了吗", "什么时候发货", "什么时候出货",
                "什么时候能出", "什么时候能好", "快好了吗", "差不多了吗",
                "看一下进度", "查一下进度", "帮我查进度", "帮我看进度", "进度怎么样"));
        INTENT_TOOL_MAP.put("query_payroll", compileAll(
                "工资", "计件", "薪资", "结算金额", "我的工资", "多少钱",
                "工资多少", "发工资", "算工资", "工资条", "工资单",
                "收入多少", "赚了多少", "工钱", "劳务费", "工资结算",
                "这个月工资", "上个月工资", "计件工资", "工资怎么算",
                "能拿多少", "能拿多少钱", "工资明细", "工资详情"));
        INTENT_TOOL_MAP.put("query_stock", compileAll(
                "库存", "还有多少", "可用量", "库存量", "剩余",
                "有货吗", "没货了", "缺货吗", "库存够吗", "不够了",
                "还有货吗", "剩多少", "剩了多少", "还有多少货", "有多少库存",
                "查一下库存", "看下库存", "帮我查库存", "库存多少",
                "原料库存", "面料库存", "辅料库存", "成品库存", "仓库有多少",
                "仓库还有多少", "仓库存量", "库存查询", "查库存"));
        INTENT_TOOL_MAP.put("query_style", compileAll(
                "款式", "BOM", "工价", "样衣", "开发进度",
                "款号", "款式信息", "款式详情", "什么款式", "哪个款式",
                "样衣好了吗", "样衣进度", "打样进度", "样衣开发",
                "款式工价", "工序工价", "工价多少", "工价表",
                "BOM表", "物料清单", "用料清单", "款式资料"));
        INTENT_TOOL_MAP.put("action_hold", compileAll(
                "暂停", "挂起", "hold", "停一下",
                "先停一下", "停下来", "暂时停", "暂停生产",
                "暂停订单", "先不要做", "等一下", "等通知",
                "先放一放", "搁置", "暂缓"));
        INTENT_TOOL_MAP.put("action_expedite", compileAll(
                "加快", "加急", "催", "紧急", "expedite",
                "赶一下", "赶工", "快点", "快一点", "抓紧",
                "赶紧做", "赶快", "急单", "加急单", "优先做",
                "先做这个", "这个急", "比较急", "很急", "特急",
                "催一下", "帮我催", "催货", "催单"));
        INTENT_TOOL_MAP.put("action_scan_undo", compileAll(
                "撤回扫码", "撤销扫码", "扫码撤回", "撤销扫描", "扫错了",
                "扫错", "扫多了", "扫重了", "重复扫了", "扫错了怎么办",
                "取消扫码", "取消扫描", "扫码取消", "扫描取消",
                "刚才扫错了", "多扫了一件", "扫多了一件", "退回去"));
        INTENT_TOOL_MAP.put("query_cutting", compileAll(
                "裁剪数量", "裁剪多少", "裁了多少", "裁剪进度", "裁了几个", "裁了几件",
                "菲号数量", "几个菲", "菲号进度", "扎了多少", "分菲情况",
                "裁剪好了吗", "裁完了吗", "裁床进度", "裁床情况",
                "开裁了吗", "开始裁了吗", "裁剪车间", "裁了多少件",
                "裁片", "裁片数量", "裁了多少扎", "分了多少扎"));
        INTENT_TOOL_MAP.put("action_cutting", compileAll(
                "创建裁剪", "开裁", "裁床", "新建裁剪", "添加裁剪", "建裁剪单",
                "开裁单", "做裁剪", "安排裁剪", "排裁剪", "排单裁剪",
                "裁片开裁", "开始裁剪", "裁剪排单", "裁剪制单",
                "开个裁剪单", "做个裁剪单", "新建裁剪单", "新增裁剪"));
        INTENT_TOOL_MAP.put("action_edit_order", compileAll(
                "编辑订单", "修改订单", "改订单", "改交期", "改备注",
                "改一下订单", "修改一下订单", "订单修改", "订单编辑",
                "改数量", "改价格", "改地址", "改联系人",
                "更新订单", "订单更新", "调整订单", "订单调整"));
        INTENT_TOOL_MAP.put("action_approve", compileAll(
                "审批", "通过", "批准", "approve",
                "审核", "审核通过", "审批通过", "同意",
                "批一下", "帮我批", "请审批", "请批准",
                "过审", "过一下", "审一下", "帮我审核",
                "审批一下", "批准一下", "核准"));
        INTENT_TOOL_MAP.put("action_reconcile", compileAll(
                "对账", "核销", "出货对账", "物料对账",
                "对一下账", "算一下账", "账目", "账目核对",
                "往来对账", "对账单", "对账表", "核对账目",
                "核销一下", "销账", "冲账", "结算对账"));
        INTENT_TOOL_MAP.put("action_receive", compileAll(
                "收货", "到货", "入库", "登记到货",
                "收货了", "到货了", "到了一批货", "来了一批货",
                "入库了", "进库", "入库登记", "收货登记",
                "物料到货", "原料到货", "面料到了", "辅料到了",
                "货到了", "货收到了", "签收", "收货确认"));
        INTENT_TOOL_MAP.put("action_outbound", compileAll(
                "出库", "发货", "成品出库",
                "出货", "发货了", "出库了", "发货登记",
                "成品发货", "成衣发货", "发货单", "出库单",
                "安排发货", "安排出库", "可以发货了", "可以出库了",
                "发货通知", "出库通知", "发走", "发了"));
        INTENT_TOOL_MAP.put("action_picking", compileAll(
                "领料", "备料", "领料单",
                "领物料", "领料了", "去领料", "物料领用",
                "备料了", "准备物料", "配料", "配齐物料",
                "开领料单", "做领料单", "领料申请", "申请领料",
                "原料领用", "辅料领用", "面料领用"));
        INTENT_TOOL_MAP.put("analysis_report", compileAll(
                "日报", "周报", "月报", "报告", "汇总",
                "统计", "报表", "统计表", "数据报表",
                "今日数据", "本周数据", "本月数据",
                "产量统计", "生产统计", "数据统计",
                "汇总一下", "统计一下", "出个报表",
                "做个报告", "生成报表", "生成报告"));
        INTENT_TOOL_MAP.put("analysis_deep", compileAll(
                "深度分析", "根因", "为什么", "原因分析", "瓶颈",
                "分析一下", "什么原因", "为啥", "怎么回事",
                "什么问题", "问题在哪", "根本原因", "问题分析",
                "找出原因", "找找原因", "分析原因", "原因在哪",
                "生产瓶颈", "效率低", "为什么慢", "为什么出问题"));
        INTENT_TOOL_MAP.put("analysis_whatif", compileAll(
                "推演", "沙盘", "如果", "假设", "模拟",
                "如果加人", "如果增加", "如果减少", "如果调整",
                "模拟一下", "推演一下", "算一下如果", "假设一下",
                "要是", "假如", "万一", "如果这样的话",
                "如果那样的话", "会怎么样", "会怎样", "结果会怎样"));
        INTENT_TOOL_MAP.put("analysis_overview", compileAll(
                "总览", "概览", "今天怎么样", "系统状态", "经营状况",
                "整体情况", "总体情况", "大盘", "全局",
                "看一下整体", "整体数据", "总体数据", "整体状况",
                "运行情况", "运营情况", "经营情况", "整体表现",
                "怎么样了", "还好吗", "正常吗", "一切正常吗"));
        INTENT_TOOL_MAP.put("analysis_ai_accuracy", compileAll(
                "准确率", "命中率", "采纳率", "AI效果", "几成准", "预测准", "AI准不准", "交期命中"));
        INTENT_TOOL_MAP.put("action_create_order", compileAll(
                "下单", "建单", "创建订单", "新建订单", "新增订单", "帮我下单", "我要下单", "下给",
                "下个订单", "下个单", "帮我下个订单", "帮我下个单", "给我下个订单", "给我下单",
                "开个订单", "开单", "开个单", "做个订单", "做个单", "安排下单", "安排个订单"));
        INTENT_TOOL_MAP.put("action_sample_loan", compileAll(
                "借调", "借样衣", "样衣借出", "借出样衣", "归还样衣", "样衣归还"));
        INTENT_TOOL_MAP.put("action_sample_workflow", compileAll(
                "样衣开发", "样衣流程", "打样", "推送到下单", "样板领取", "样板入库"));
        INTENT_TOOL_MAP.put("knowledge_search", compileAll(
                "什么是", "怎么操作", "如何", "帮助", "教程", "规则"));
    }

    private static final Map<String, List<String>> INTENT_TO_TOOLS = Map.ofEntries(
            Map.entry("query_progress", List.of("tool_query_production_progress", "tool_think")),
            Map.entry("query_payroll", List.of("tool_query_financial_payroll", "tool_think")),
            Map.entry("query_stock", List.of("tool_query_warehouse_stock", "tool_finished_product_stock", "tool_think")),
            Map.entry("query_style", List.of("tool_query_style_info", "tool_sample_stock", "tool_think")),
            Map.entry("action_hold", List.of("tool_action_executor", "tool_order_edit", "tool_think")),
            Map.entry("action_expedite", List.of("tool_action_executor", "tool_order_contact_urge", "tool_think")),
            Map.entry("action_scan_undo", List.of("tool_scan_undo", "tool_think")),
            Map.entry("action_cutting", List.of("tool_cutting_task_create", "tool_think")),
            Map.entry("query_cutting", List.of("tool_query_production_progress", "tool_cutting_task_create", "tool_think")),
            Map.entry("action_edit_order", List.of("tool_order_edit", "tool_query_order_remarks", "tool_think")),
            Map.entry("action_approve", List.of("tool_change_approval", "tool_payroll_approve", "tool_finance_workflow", "tool_think")),
            Map.entry("action_reconcile", List.of("tool_material_reconciliation", "tool_shipment_reconciliation", "tool_think")),
            Map.entry("action_receive", List.of("tool_material_receive", "tool_material_doc_receive", "tool_quality_inbound", "tool_think")),
            Map.entry("action_outbound", List.of("tool_finished_outbound", "tool_think")),
            Map.entry("action_picking", List.of("tool_material_picking", "tool_material_calculation", "tool_think")),
            Map.entry("analysis_report", List.of("tool_smart_report", "tool_management_dashboard", "tool_think")),
            Map.entry("analysis_deep", List.of("tool_deep_analysis", "tool_root_cause_analysis", "tool_pattern_discovery", "tool_think")),
            Map.entry("analysis_whatif", List.of("tool_whatif", "tool_simulate_new_order", "tool_think")),
            Map.entry("analysis_overview", List.of("tool_system_overview", "tool_management_dashboard", "tool_think")),
            Map.entry("knowledge_search", List.of("tool_knowledge_search", "tool_think")),
            Map.entry("action_create_order", List.of("tool_create_production_order", "tool_query_style_info", "tool_think")),
            Map.entry("action_sample_loan", List.of("tool_sample_loan", "tool_sample_stock", "tool_think")),
            Map.entry("action_sample_workflow", List.of("tool_sample_workflow", "tool_sample_stock", "tool_sample_loan", "tool_think")),
            Map.entry("analysis_ai_accuracy", List.of("tool_ai_accuracy_query", "tool_think"))
    );

    private static final Set<String> ALWAYS_INCLUDE = Set.of(
            "tool_knowledge_search", "tool_think", "tool_team_dispatch"
    );

    public List<AgentTool> advise(List<AgentTool> domainFilteredTools, String userMessage) {
        if (userMessage == null || userMessage.isBlank() || domainFilteredTools.size() <= 8) {
            return domainFilteredTools;
        }

        String text = userMessage.toLowerCase(Locale.ROOT);
        Set<String> advisedToolNames = new LinkedHashSet<>();

        for (Map.Entry<String, List<Pattern>> entry : INTENT_TOOL_MAP.entrySet()) {
            for (Pattern p : entry.getValue()) {
                if (p.matcher(text).find()) {
                    List<String> tools = INTENT_TO_TOOLS.get(entry.getKey());
                    if (tools != null) {
                        advisedToolNames.addAll(tools);
                    }
                    break;
                }
            }
        }

        advisedToolNames.addAll(ALWAYS_INCLUDE);

        if (advisedToolNames.size() <= ALWAYS_INCLUDE.size()) {
            log.debug("[ToolAdvisor] 未匹配到明确意图，保留全部领域工具 (匹配到: {})", advisedToolNames);
            return domainFilteredTools;
        }

        Set<String> finalNames = advisedToolNames;
        List<AgentTool> advised = domainFilteredTools.stream()
                .filter(t -> finalNames.contains(t.getName()))
                .collect(Collectors.toList());

        if (advised.size() <= ALWAYS_INCLUDE.size()) {
            log.debug("[ToolAdvisor] 预选工具过少({})，回退到领域工具集", advised.size());
            return domainFilteredTools;
        }

        // ── P1: PRM 反馈闭环 ──
        // 用本租户过去 30 天的工具平均评分，将高分工具（avgScore > 0.5）提前到列表头部。
        // 原理：用户点赞越多的工具，在相同意图下越早被 LLM 看到并优先选用。
        advised = applyPrmBoost(advised);

        log.info("[ToolAdvisor] 工具预选(+PRM): {} → {} 个工具 (原 {} 个)", advisedToolNames, advised.size(), domainFilteredTools.size());
        return advised;
    }

    /**
     * 将本租户 PRM 高分工具（avgScore > 0.5）移到列表前半段。
     * 低分工具（avgScore < -0.3）后置。其余保持原顺序。
     * 失败时静默降级，不影响主流程。
     */
    private List<AgentTool> applyPrmBoost(List<AgentTool> tools) {
        if (processRewardOrchestrator == null) return tools;
        try {
            Map<String, Double> prmScores = processRewardOrchestrator.getHighScoreToolsForCurrentTenant(30);
            if (prmScores.isEmpty()) return tools;

            List<AgentTool> boosted  = new ArrayList<>();
            List<AgentTool> normal   = new ArrayList<>();
            List<AgentTool> penalised = new ArrayList<>();

            for (AgentTool t : tools) {
                Double avg = prmScores.get(t.getName());
                if (avg != null && avg > 0.5) {
                    boosted.add(t);   // 用户历史点赞：前置
                } else if (avg != null && avg < -0.3) {
                    penalised.add(t); // 用户历史点踩：后置
                } else {
                    normal.add(t);
                }
            }

            if (!boosted.isEmpty()) {
                log.debug("[ToolAdvisor-PRM] 高分工具前置: {}", boosted.stream().map(AgentTool::getName).toList());
            }

            List<AgentTool> result = new ArrayList<>(boosted.size() + normal.size() + penalised.size());
            result.addAll(boosted);
            result.addAll(normal);
            result.addAll(penalised);
            return result;
        } catch (Exception e) {
            log.debug("[ToolAdvisor-PRM] PRM 提升跳过: {}", e.getMessage());
            return tools;
        }
    }

    private static List<Pattern> compileAll(String... keywords) {
        List<Pattern> patterns = new ArrayList<>(keywords.length);
        for (String kw : keywords) {
            patterns.add(Pattern.compile(Pattern.quote(kw), Pattern.CASE_INSENSITIVE));
        }
        return patterns;
    }
}
