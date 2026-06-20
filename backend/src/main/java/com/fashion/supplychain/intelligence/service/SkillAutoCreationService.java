package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.entity.SkillTemplate;
import com.fashion.supplychain.intelligence.gateway.AiInferenceRouter;
import com.fashion.supplychain.intelligence.mapper.SkillTemplateMapper;
import com.fashion.supplychain.intelligence.orchestration.SkillEvolutionOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import org.apache.commons.lang3.StringUtils;

@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class SkillAutoCreationService {

    private final SkillTemplateMapper skillTemplateMapper;
    private final AiInferenceRouter inferenceRouter;
    private final MemoryBankService memoryBankService;

    private static final int MIN_TOOL_CALLS_FOR_SKILL = 3;
    private static final double MIN_QUALITY_FOR_AUTO_CREATE = 0.7;
    private static final int MAX_SKILLS_PER_TENANT = 50;

    @Async("aiSelfCriticExecutor")
    public void tryAutoCreateFromTask(Long tenantId, String sessionId,
                                       String userQuestion, String toolCallsLog,
                                       String finalAnswer, double qualityScore) {
        if (qualityScore < MIN_QUALITY_FOR_AUTO_CREATE) return;
        if (toolCallsLog == null || toolCallsLog.isBlank()) return;

        int toolCallCount = countToolCalls(toolCallsLog);
        if (toolCallCount < MIN_TOOL_CALLS_FOR_SKILL) return;

        long existingCount = skillTemplateMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<SkillTemplate>()
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0));
        if (existingCount >= MAX_SKILLS_PER_TENANT) {
            log.debug("[SkillAutoCreate] 租户={} 技能数已达上限{}", tenantId, MAX_SKILLS_PER_TENANT);
            return;
        }

        try {
            String prompt = buildAutoCreationPrompt(userQuestion, toolCallsLog, finalAnswer);
            String llmResponse = inferenceRouter.chatSimple(prompt);
            if (llmResponse == null || llmResponse.contains("NONE")) return;

            SkillTemplate template = parseResponse(llmResponse, tenantId, sessionId);
            if (template == null) return;

            SkillTemplate existing = skillTemplateMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<SkillTemplate>()
                            .eq("skill_name", template.getSkillName())
                            .eq("tenant_id", tenantId)
                            .eq("delete_flag", 0));

            if (existing != null) {
                existing.setUseCount(existing.getUseCount() + 1);
                existing.setVersion(existing.getVersion() + 1);
                existing.setStepsJson(mergeSteps(existing.getStepsJson(), template.getStepsJson()));
                existing.setReferencesJson(mergeReferences(existing.getReferencesJson(), template.getReferencesJson()));
                if (StringUtils.isNotBlank(template.getSkillMd())) {
                    existing.setSkillMd(template.getSkillMd());
                }
                if (StringUtils.isNotBlank(template.getMetadataYaml())) {
                    existing.setMetadataYaml(template.getMetadataYaml());
                }
                existing.setConfidence(existing.getConfidence()
                        .add(new BigDecimal("0.05")).min(new BigDecimal("1.0")));
                skillTemplateMapper.updateById(existing);
                log.info("[SkillAutoCreate] 技能已增强: {} v{}", existing.getSkillName(), existing.getVersion());
            } else {
                template.setId(UUID.randomUUID().toString().replace("-", "").substring(0, 24));
                template.setTenantId(tenantId);
                template.setSource("auto_task");
                template.setSourceConversationId(sessionId);
                template.setVersion(1);
                template.setUseCount(1);
                template.setSuccessCount(1);
                template.setConfidence(new BigDecimal("0.60"));
                template.setAvgRating(BigDecimal.ZERO);
                template.setEnabled(1);
                template.setDeleteFlag(0);
                template.setCreateTime(LocalDateTime.now());
                template.setUpdateTime(LocalDateTime.now());
                fillDefaultDisclosureFields(template);
                skillTemplateMapper.insert(template);
                log.info("[SkillAutoCreate] 新技能自动创建: {} ({})", template.getSkillName(), template.getTitle());
            }

            memoryBankService.onPatternDiscovered(tenantId,
                    String.format("技能模式: %s - %s", template.getSkillName(), template.getTitle()));
        } catch (Exception e) {
            log.warn("[SkillAutoCreate] 自动创建失败: {}", e.getMessage());
        }
    }

    private int countToolCalls(String toolCallsLog) {
        if (toolCallsLog == null) return 0;
        int count = 0;
        int idx = 0;
        while ((idx = toolCallsLog.indexOf("tool_call:", idx)) != -1) {
            count++;
            idx += 10;
        }
        if (count == 0) {
            count = toolCallsLog.split("\n").length;
        }
        return count;
    }

    private String buildAutoCreationPrompt(String question, String toolCalls, String answer) {
        return String.format("""
                你是一个AI技能提取器。分析以下成功的Agent任务执行过程，提取可复用的操作流程作为技能模板。

                ## 用户问题
                %s

                ## 工具调用序列
                %s

                ## 最终回答
                %s

                ## 要求
                1. 只提取涉及3个以上工具调用的复杂流程
                2. 技能名称：英文简写（如 analyze_delivery_risk）
                3. 技能分组：production/finance/material/system/custom
                4. 标题：简短中文描述（如"货期风险分析流程"）
                5. 描述：这个技能解决什么问题
                6. 触发短语：用户说哪些话时应该激活（逗号分隔，如"逾期,货期,交期,延迟"）
                7. 执行步骤JSON：每步包含 action/tool/params/description
                8. 前置条件：执行前需要满足的条件
                9. 后置校验：执行后需要确认的事项

                ## 三层渐进式披露格式要求（必须同时生成）
                10. metadata_yaml（≤50 tokens）：
                    YAML 格式，含 name / description / triggers（逗号分隔）
                    示例：name: analyze_delivery_risk\\ndescription: 货期风险分析\\ntriggers: 逾期,货期,交期
                11. skill_md（≤500 tokens）：
                    Markdown 格式，含 # 角色定位 / ## 执行流程 / ## 检查清单 / ## 反例
                12. references_json（按需，可为空数组 []）：
                    JSON 数组，每项含 title / content / keywords（keywords 为逗号分隔字符串）

                如果任务过于简单或没有可复用模式，回复 NONE。

                格式（JSON）：
                {"skill_name":"...","skill_group":"...","title":"...","description":"...",
                 "trigger_phrases":"...",
                 "steps_json":"[{\"action\":\"...\",\"tool\":\"...\",\"params\":{},\"description\":\"...\"}]",
                 "pre_conditions":"...","post_check":"...",
                 "metadata_yaml":"name: ...\\ndescription: ...\\ntriggers: ...",
                 "skill_md":"# ...\\n## 角色定位\\n...\\n## 执行流程\\n...\\n## 检查清单\\n...\\n## 反例\\n...",
                 "references_json":"[{\"title\":\"...\",\"content\":\"...\",\"keywords\":\"...\"}]"}
                """, truncate(question, 500), truncate(toolCalls, 2000), truncate(answer, 500));
    }

    private SkillTemplate parseResponse(String response, Long tenantId, String sessionId) {
        if (response == null || response.contains("NONE")) return null;
        try {
            String json = response;
            int start = json.indexOf('{');
            int end = json.lastIndexOf('}');
            if (start < 0 || end <= start) return null;
            json = json.substring(start, end + 1);

            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            @SuppressWarnings("unchecked")
            Map<String, Object> map = mapper.readValue(json, Map.class);

            SkillTemplate t = new SkillTemplate();
            t.setSkillName(getStr(map, "skill_name", "auto_" + sessionId.substring(0, 8)));
            t.setSkillGroup(getStr(map, "skill_group", "custom"));
            t.setTitle(getStr(map, "title", "自动生成技能"));
            t.setDescription(getStr(map, "description", ""));
            t.setTriggerPhrases(getStr(map, "trigger_phrases", null));
            t.setStepsJson(getStr(map, "steps_json", "[]"));
            t.setPreConditions(getStr(map, "pre_conditions", null));
            t.setPostCheck(getStr(map, "post_check", null));
            // 三层渐进式披露字段
            t.setMetadataYaml(getStr(map, "metadata_yaml", null));
            t.setSkillMd(getStr(map, "skill_md", null));
            t.setReferencesJson(getStr(map, "references_json", null));
            return t;
        } catch (Exception e) {
            log.warn("[SkillAutoCreate] LLM响应解析失败: {}", e.getMessage());
            return null;
        }
    }

    private String mergeSteps(String existingJson, String newJson) {
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            @SuppressWarnings("unchecked")
            java.util.List<Object> existing = mapper.readValue(existingJson, java.util.List.class);
            @SuppressWarnings("unchecked")
            java.util.List<Object> merged = new java.util.ArrayList<>(existing);
            return mapper.writeValueAsString(merged);
        } catch (Exception e) {
            return existingJson;
        }
    }

    /** 合并 references_json：去重后追加新 references（按 title 去重）。 */
    @SuppressWarnings("unchecked")
    private String mergeReferences(String existingJson, String newJson) {
        if (isBlank(newJson)) return existingJson;
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            java.util.List<Map<String, Object>> existing = isBlank(existingJson)
                    ? new java.util.ArrayList<>()
                    : mapper.readValue(existingJson, java.util.List.class);
            java.util.List<Map<String, Object>> incoming = mapper.readValue(newJson, java.util.List.class);
            java.util.Set<String> existingTitles = new java.util.HashSet<>();
            for (Map<String, Object> ref : existing) {
                Object title = ref.get("title");
                if (title != null) existingTitles.add(title.toString());
            }
            for (Map<String, Object> ref : incoming) {
                Object title = ref.get("title");
                if (title == null || !existingTitles.contains(title.toString())) {
                    existing.add(ref);
                }
            }
            return mapper.writeValueAsString(existing);
        } catch (Exception e) {
            log.warn("[SkillAutoCreate] references 合并失败: {}", e.getMessage());
            return existingJson;
        }
    }

    /** 新建技能时填充默认披露字段（若 LLM 未生成则用默认值）。 */
    private void fillDefaultDisclosureFields(SkillTemplate t) {
        if (t.getTokenBudgetMetadata() == null) t.setTokenBudgetMetadata(50);
        if (t.getTokenBudgetSkillMd() == null) t.setTokenBudgetSkillMd(500);
        if (isBlank(t.getDisclosureLevel())) t.setDisclosureLevel("STANDARD");
    }

    private boolean isNotBlank(String s) {
        return s != null && !s.isBlank();
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private String getStr(Map<String, Object> map, String key, String defaultValue) {
        Object v = map.get(key);
        return v != null ? v.toString() : defaultValue;
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
