package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.skill.SkillDisclosureLoader;
import com.fashion.supplychain.intelligence.dto.SkillChainDef;
import com.fashion.supplychain.intelligence.entity.SkillTemplate;
import com.fashion.supplychain.intelligence.mapper.SkillTemplateMapper;
import com.fashion.supplychain.intelligence.orchestration.SkillChainExecutionOrchestrator;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

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
 * <p>
 * 三层渐进式披露（P1-1 改造）：
 * - 执行前从 SkillTemplate 加载 SKILL.md 层，注入到执行上下文（context 字段）
 * - 若 SkillTemplate 不存在（仅 SkillChainDef），降级为原行为
 */
@Slf4j
@Component
@Lazy
public class SkillExecutionTool extends AbstractAgentTool {

    @Autowired
    private SkillChainExecutionOrchestrator skillChainOrchestrator;

    @Autowired
    private SkillTemplateMapper skillTemplateMapper;

    @Autowired
    private SkillDisclosureLoader skillDisclosureLoader;

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

        // 三层渐进式披露：执行前加载 SKILL.md 层注入到 context
        String enrichedContext = enrichContextWithSkillMd(skillName, context);

        // 如果提供了 context，作为所有步骤的默认上下文参数
        Map<String, String> stepArgs = null;
        if (enrichedContext != null && !enrichedContext.isBlank()) {
            // 把 context 注入到所有步骤参数
            String contextJson = MAPPER.writeValueAsString(Map.of("context", enrichedContext));
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
                                baseMap.put("context", enrichedContext);
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

    /**
     * 三层渐进式披露：按 skillName 查找 SkillTemplate，
     * 若存在则加载 SKILL.md 层注入到 context（用于执行时上下文增强）。
     * 若不存在 SkillTemplate（仅 SkillChainDef），返回原 context。
     */
    private String enrichContextWithSkillMd(String skillName, String originalContext) {
        try {
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) return originalContext;
            SkillTemplate skill = skillTemplateMapper.selectOne(
                    new QueryWrapper<SkillTemplate>()
                            .eq("skill_name", skillName)
                            .eq("tenant_id", tenantId)
                            .eq("delete_flag", 0)
                            .last("LIMIT 1"));
            if (skill == null) return originalContext;
            String skillMd = skillDisclosureLoader.loadSkillMd(skill);
            if (skillMd == null || skillMd.isBlank()) return originalContext;
            StringBuilder sb = new StringBuilder();
            if (originalContext != null && !originalContext.isBlank()) {
                sb.append(originalContext).append("\n\n");
            }
            sb.append("[技能文档]\n").append(skillMd);
            return sb.toString();
        } catch (Exception e) {
            log.warn("[SkillExec] 加载 SKILL.md 失败，降级使用原 context: {}", e.getMessage());
            return originalContext;
        }
    }
}
