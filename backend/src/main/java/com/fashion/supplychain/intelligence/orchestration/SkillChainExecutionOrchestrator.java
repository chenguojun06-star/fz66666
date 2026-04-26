package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.AgentModeContext;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.SkillChainDef;
import com.fashion.supplychain.intelligence.dto.SkillChainDef.SkillChainStep;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 技能链执行编排器：提供预定义多步工具工作流（技能）的注册与执行能力。
 * <p>
 * 与 AiAgentOrchestrator 的关系：
 * - AiAgentOrchestrator：LLM 自主规划工具调用（动态）
 * - SkillChainExecutionOrchestrator：固定工作流模板顺序执行（确定性）
 * <p>
 * 支持 PLAN 模式：描述执行方案而不实际调用工具。
 * 技能名称触发关键词由前端展示，后端通过 id 或 name 精确匹配。
 */
@Slf4j
@Service
public class SkillChainExecutionOrchestrator {

    // ── 内置技能注册表（未来可扩展为数据库） ─────────────────────────────────

    private static final List<SkillChainDef> BUILT_IN_SKILLS = List.of(

        SkillChainDef.builder()
            .id("monthly_finance_close")
            .name("月底财务结算")
            .description("自动执行工资核发 → 财务对账 → 报表生成，适用于月末关账场景")
            .triggers(List.of("月底财务", "月末关账", "工资结算", "财务对账"))
            .steps(List.of(
                SkillChainStep.builder()
                    .toolName("tool_payroll_approve")
                    .description("批量审批待确认工资结算单")
                    .defaultArgsHint("{\"action\":\"approve\"}")
                    .build(),
                SkillChainStep.builder()
                    .toolName("tool_financial_report")
                    .description("生成当月财务汇总报表")
                    .defaultArgsHint("{\"reportType\":\"monthly\"}")
                    .build()
            ))
            .build(),

        SkillChainDef.builder()
            .id("qc_batch_handle")
            .name("质检异常批量处理")
            .description("批量处理待质检任务并完成入库确认，适用于尾期质检清单")
            .triggers(List.of("质检异常", "批量质检", "质检入库", "质量处理"))
            .steps(List.of(
                SkillChainStep.builder()
                    .toolName("tool_query_production_progress")
                    .description("查询待质检订单列表")
                    .defaultArgsHint("{\"status\":\"quality_pending\"}")
                    .build(),
                SkillChainStep.builder()
                    .toolName("tool_action_executor")
                    .description("标记质检完成并触发入库流程")
                    .defaultArgsHint("{\"action\":\"quality_confirm\"}")
                    .build()
            ))
            .build(),

        SkillChainDef.builder()
            .id("order_risk_review")
            .name("逾期风险订单巡检")
            .description("扫描逾期和高风险订单，生成催单计划，适用于每日早会准备")
            .triggers(List.of("风险订单", "逾期巡检", "催单", "早会准备", "订单风险"))
            .steps(List.of(
                SkillChainStep.builder()
                    .toolName("tool_deep_analysis")
                    .description("分析当前订单交期风险与生产瓶颈")
                    .defaultArgsHint("{\"analysisType\":\"delivery_risk\"}")
                    .build(),
                SkillChainStep.builder()
                    .toolName("tool_smart_report")
                    .description("生成今日风险订单简报")
                    .defaultArgsHint("{\"reportType\":\"daily_risk\"}")
                    .build()
            ))
            .build(),

        SkillChainDef.builder()
            .id("new_order_kickoff")
            .name("新订单开工准备")
            .description("查询款式难度 → 建裁剪单 → 通知工厂，一句话完成开工准备三步")
            .triggers(List.of("开工准备", "新订单开工", "建裁剪", "开工流程"))
            .steps(List.of(
                SkillChainStep.builder()
                    .toolName("tool_query_style_difficulty")
                    .description("评估款式生产难度系数")
                    .defaultArgsHint("{}")
                    .build(),
                SkillChainStep.builder()
                    .toolName("tool_cutting_task_create")
                    .description("按款号和数量创建裁剪单")
                    .defaultArgsHint("{}")
                    .build(),
                SkillChainStep.builder()
                    .toolName("tool_action_executor")
                    .description("发送开工通知给工厂")
                    .defaultArgsHint("{\"action\":\"notify_factory\"}")
                    .build()
            ))
            .build()
    );

    // ── 工具名 → Bean 索引（启动时构建，O(1) 查找） ─────────────────────────

    private Map<String, AgentTool> toolIndex;

    @Autowired
    public void buildToolIndex(List<AgentTool> tools) {
        this.toolIndex = tools.stream()
            .collect(Collectors.toMap(AgentTool::getName, Function.identity(), (a, b) -> a));
        log.info("[SkillChain] 工具索引构建完成，共 {} 个工具", this.toolIndex.size());
    }

    // ── 公开 API ──────────────────────────────────────────────────────────────

    /**
     * 列出所有可用技能（前端展示、AI 工具描述使用）。
     */
    public List<SkillChainDef> listAvailableSkills() {
        return BUILT_IN_SKILLS;
    }

    /**
     * 执行指定技能链。
     *
     * @param skillIdOrName 技能 id 或 name
     * @param stepArgs      各步骤参数覆盖，key = toolName，value = JSON 参数字符串（可为空）
     * @return 执行结果 Markdown 字符串
     */
    public String executeSkill(String skillIdOrName, Map<String, String> stepArgs) {
        SkillChainDef skill = findSkill(skillIdOrName);
        if (skill == null) {
            return "❌ 未找到技能：" + skillIdOrName + "。可用技能：" + listSkillNames();
        }

        // PLAN 模式：描述方案，不实际执行
        if (AgentModeContext.isPlan()) {
            return buildPlanOutput(skill);
        }

        log.info("[SkillChain] 开始执行技能: id={}, name={}, steps={}",
            skill.getId(), skill.getName(), skill.getSteps().size());

        StringBuilder sb = new StringBuilder("🔗 **技能执行：").append(skill.getName()).append("**\n\n");
        sb.append("> ").append(skill.getDescription()).append("\n\n");

        int successCount = 0;
        for (int i = 0; i < skill.getSteps().size(); i++) {
            SkillChainStep step = skill.getSteps().get(i);
            sb.append("**步骤 ").append(i + 1).append("：").append(step.getDescription()).append("**\n");

            AgentTool tool = toolIndex.get(step.getToolName());
            if (tool == null) {
                sb.append("⚠️ 工具 `").append(step.getToolName()).append("` 未注册，跳过本步骤。\n\n");
                log.warn("[SkillChain] 工具未注册，跳过: step={}, tool={}", i + 1, step.getToolName());
                continue;
            }

            // 优先使用调用方覆盖参数，其次用技能默认提示参数
            String args = stepArgs != null && stepArgs.containsKey(step.getToolName())
                ? stepArgs.get(step.getToolName())
                : (step.getDefaultArgsHint() != null ? step.getDefaultArgsHint() : "{}");

            try {
                log.info("[SkillChain] 执行步骤 {}/{}: tool={}, args={}",
                    i + 1, skill.getSteps().size(), step.getToolName(), args);
                String result = tool.execute(args);
                sb.append("✅ ").append(result).append("\n\n");
                successCount++;
            } catch (Exception e) {
                sb.append("❌ 步骤执行失败：").append(e.getMessage()).append("\n\n");
                log.error("[SkillChain] 步骤 {} 执行失败: tool={}, error={}",
                    i + 1, step.getToolName(), e.getMessage());
                // 步骤失败不中断后续步骤，继续执行
            }
        }

        sb.append("---\n");
        sb.append(String.format("技能执行完成：%d/%d 步骤成功。",
            successCount, skill.getSteps().size()));

        log.info("[SkillChain] 技能执行完成: id={}, success={}/{}", skill.getId(), successCount, skill.getSteps().size());
        return sb.toString();
    }

    // ── 内部辅助方法 ──────────────────────────────────────────────────────────

    private SkillChainDef findSkill(String idOrName) {
        if (idOrName == null || idOrName.isBlank()) return null;
        return BUILT_IN_SKILLS.stream()
            .filter(s -> s.getId().equalsIgnoreCase(idOrName) || s.getName().equals(idOrName))
            .findFirst()
            .orElse(null);
    }

    private String listSkillNames() {
        return BUILT_IN_SKILLS.stream()
            .map(s -> s.getName() + "（" + s.getId() + "）")
            .collect(Collectors.joining("、"));
    }

    private String buildPlanOutput(SkillChainDef skill) {
        StringBuilder sb = new StringBuilder("📋 **技能执行方案（plan 模式，未实际执行）**\n\n");
        sb.append("**技能名称：**").append(skill.getName()).append("\n");
        sb.append("**说明：**").append(skill.getDescription()).append("\n\n");
        sb.append("计划执行以下步骤：\n\n");
        for (int i = 0; i < skill.getSteps().size(); i++) {
            SkillChainStep step = skill.getSteps().get(i);
            sb.append(String.format("**步骤 %d**：`%s` — %s\n", i + 1, step.getToolName(), step.getDescription()));
        }
        sb.append("\n> 当前处于 **plan（计划）模式**，切换至默认模式后可实际执行。");
        return sb.toString();
    }
}
