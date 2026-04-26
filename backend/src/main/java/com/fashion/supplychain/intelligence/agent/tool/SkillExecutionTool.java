package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.SkillChainDef;
import com.fashion.supplychain.intelligence.orchestration.SkillChainExecutionOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 技能执行工具：通过工具名调用预定义多步工作流（技能链）。
 * <p>
 * 示例对话：
 * - "帮我执行月底财务结算" → AI 调用 tool_skill_execute，skillName=月底财务结算
 * - "执行逾期风险订单巡检" → AI 调用 tool_skill_execute，skillName=逾期风险订单巡检
 * <p>
 * 与直接调用多个工具的区别：技能链按固定顺序逐步执行，结果汇总后一次性返回。
 */
@Slf4j
@Component
public class SkillExecutionTool extends AbstractAgentTool {

    @Autowired
    private SkillChainExecutionOrchestrator skillChainOrchestrator;

    @Override
    public String getName() {
        return "tool_skill_execute";
    }

    @Override
    public AiTool getToolDefinition() {
        return buildToolDef(
            "执行预定义技能工作流：一句话触发多步工具链。" +
            "可用技能：月底财务结算、质检异常批量处理、逾期风险订单巡检、新订单开工准备。" +
            "适用场景：用户说'帮我执行月底结算'、'批量处理质检'、'风险订单巡检'等。",
            Map.of(
                "skillName", stringProp("技能名称或技能ID，如：月底财务结算、qc_batch_handle"),
                "context", stringProp("（可选）执行上下文，如款号、时间范围、备注等")
            ),
            List.of("skillName")
        );
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String skillName = requireString(args, "skillName");
        String context = optionalString(args, "context");

        log.info("[SkillExec] 触发技能链执行: skillName={}, context={}", skillName, context);

        // 如果提供了 context，作为所有步骤的默认上下文参数
        Map<String, String> stepArgs = null;
        if (context != null && !context.isBlank()) {
            // 把 context 注入到所有步骤参数
            String contextJson = MAPPER.writeValueAsString(Map.of("context", context));
            List<SkillChainDef> skills = skillChainOrchestrator.listAvailableSkills();
            SkillChainDef matched = skills.stream()
                .filter(s -> s.getId().equalsIgnoreCase(skillName) || s.getName().equals(skillName))
                .findFirst().orElse(null);
            if (matched != null) {
                stepArgs = matched.getSteps().stream()
                    .collect(Collectors.toMap(
                        SkillChainDef.SkillChainStep::getToolName,
                        step -> {
                            // 合并默认参数提示与 context
                            String base = step.getDefaultArgsHint() != null ? step.getDefaultArgsHint() : "{}";
                            if (base.equals("{}")) return contextJson;
                            try {
                                // 把 context 追加到原有参数中
                                @SuppressWarnings("unchecked")
                                Map<String, Object> baseMap = MAPPER.readValue(base, Map.class);
                                baseMap.put("context", context);
                                return MAPPER.writeValueAsString(baseMap);
                            } catch (Exception e) {
                                return base;
                            }
                        },
                        (a, b) -> a
                    ));
            }
        }

        return skillChainOrchestrator.executeSkill(skillName, stepArgs);
    }
}
