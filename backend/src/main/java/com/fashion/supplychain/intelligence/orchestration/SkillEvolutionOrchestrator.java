package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.SkillTemplate;
import com.fashion.supplychain.intelligence.entity.ConversationReflection;
import com.fashion.supplychain.intelligence.gateway.AiInferenceRouter;
import com.fashion.supplychain.intelligence.mapper.SkillTemplateMapper;
import com.fashion.supplychain.intelligence.mapper.ConversationReflectionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SkillEvolutionOrchestrator {

    private final ConversationReflectionMapper reflectionMapper;
    private final SkillTemplateMapper skillTemplateMapper;
    private final AiInferenceRouter inferenceRouter;

    private static final double EVOLUTION_TRIGGER_SCORE = 0.6;
    private static final int MAX_EVOLUTION_STEPS = 8;

    public Optional<SkillTemplate> tryEvolveSkill(ConversationReflection reflection) {
        if (reflection.getQualityScore() == null
                || reflection.getQualityScore().doubleValue() < EVOLUTION_TRIGGER_SCORE) {
            return Optional.empty();
        }
        if (reflection.getReflectionContent() == null || reflection.getReflectionContent().isBlank()) {
            return Optional.empty();
        }

        try {
            String extractionPrompt = buildSkillExtractionPrompt(reflection);
            String llmResponse = inferenceRouter.chatSimple(extractionPrompt);
            SkillTemplate template = parseSkillFromLlm(llmResponse, reflection);
            if (template == null) return Optional.empty();

            String stepsJson = template.getStepsJson();
            if (stepsJson != null) {
                try {
                    com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    Object[] steps = mapper.readValue(stepsJson, Object[].class);
                    if (steps.length > MAX_EVOLUTION_STEPS) {
                        log.warn("[SkillEvolve] 技能步骤过多({}>{})，丢弃 {}", steps.length, MAX_EVOLUTION_STEPS, template.getSkillName());
                        return Optional.empty();
                    }
                } catch (Exception e) {
                    log.warn("[SkillEvolve] 步骤JSON解析失败: {}", e.getMessage());
                }
            }

            QueryWrapper<SkillTemplate> existingQw = new QueryWrapper<>();
            existingQw.eq("skill_name", template.getSkillName())
                    .eq("tenant_id", reflection.getTenantId())
                    .eq("delete_flag", 0);
            SkillTemplate existing = skillTemplateMapper.selectOne(existingQw);
            if (existing != null) {
                existing.setUseCount(existing.getUseCount() + 1);
                existing.setVersion(existing.getVersion() + 1);
                existing.setStepsJson(template.getStepsJson());
                existing.setDescription(template.getDescription());
                existing.setTriggerPhrases(template.getTriggerPhrases());
                existing.setConfidence(existing.getConfidence().add(new BigDecimal("0.05"))
                        .min(new BigDecimal("1.0")));
                skillTemplateMapper.updateById(existing);
                log.info("[SkillEvolve] 技能 {} 已更新 v{}", existing.getSkillName(), existing.getVersion());
                return Optional.of(existing);
            }

            template.setTenantId(reflection.getTenantId());
            template.setId(UUID.randomUUID().toString().replace("-", "").substring(0, 24));
            template.setSource("auto");
            template.setSourceConversationId(reflection.getConversationId());
            template.setVersion(1);
            template.setUseCount(1);
            template.setSuccessCount(1);
            template.setConfidence(new BigDecimal("0.55"));
            template.setAvgRating(BigDecimal.ZERO);
            template.setEnabled(1);
            template.setDeleteFlag(0);
            template.setCreateTime(LocalDateTime.now());
            template.setUpdateTime(LocalDateTime.now());
            skillTemplateMapper.insert(template);

            reflection.setExtractedSkillId(template.getId());
            reflectionMapper.updateById(reflection);

            log.info("[SkillEvolve] 新技能自动生成: {} ({})", template.getSkillName(), template.getTitle());
            return Optional.of(template);
        } catch (Exception e) {
            log.warn("[SkillEvolve] 技能进化失败: {}", e.getMessage());
            return Optional.empty();
        }
    }

    public void recordSkillExecution(String skillId, boolean success, BigDecimal userRating) {
        SkillTemplate skill = skillTemplateMapper.selectById(skillId);
        if (skill == null) return;

        skill.setUseCount(skill.getUseCount() + 1);
        if (success) {
            skill.setSuccessCount(skill.getSuccessCount() + 1);
            skill.setConfidence(skill.getConfidence().add(new BigDecimal("0.03")).min(new BigDecimal("1.0")));
        } else {
            skill.setConfidence(skill.getConfidence().subtract(new BigDecimal("0.05")).max(new BigDecimal("0.1")));
        }
        if (userRating != null && userRating.compareTo(BigDecimal.ZERO) > 0) {
            int total = skill.getUseCount();
            BigDecimal oldSum = skill.getAvgRating().multiply(new BigDecimal(total - 1));
            skill.setAvgRating(oldSum.add(userRating).divide(new BigDecimal(total), 2, RoundingMode.HALF_UP));
        }
        skillTemplateMapper.updateById(skill);
    }

    public List<SkillTemplate> loadActiveSkills(Long tenantId) {
        QueryWrapper<SkillTemplate> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .eq("enabled", 1)
                .eq("delete_flag", 0)
                .ge("confidence", 0.4)
                .orderByDesc("confidence")
                .last("LIMIT 10");
        return skillTemplateMapper.selectList(qw);
    }

    private String buildSkillExtractionPrompt(ConversationReflection reflection) {
        return String.format("""
                你是一个AI技能提取器。分析以下对话复盘记录，提取可复用的操作流程作为技能模板。
                
                ## 复盘内容
                %s
                
                ## 用户原始问题
                %s
                
                ## 要求
                1. 技能名称：英文简写（如 check_overdue_orders）
                2. 技能分组：production/finance/material/system/custom
                3. 标题：简短中文描述
                4. 描述：这个技能做什么
                5. 触发短语：用户说哪些话时应该激活这个技能（逗号分隔）
                6. 执行步骤JSON：每步包含 action（操作类型）、tool（工具名）、params（参数）、description（人类可读描述）
                7. 前置条件：执行前需要满足的条件
                8. 后置校验：执行后需要确认的事项
                
                如果对话中没有可提取的重复性操作流程，回复 NONE。
                
                格式（JSON）：
                {"skill_name":"...","skill_group":"...","title":"...","description":"...",
                 "trigger_phrases":"...",
                 "steps_json":"[{\"action\":\"...\",\"tool\":\"...\",\"params\":{},\"description\":\"...\"}]",
                 "pre_conditions":"...","post_check":"..."}
                """, reflection.getReflectionContent(), reflection.getUserMessage());
    }

    private SkillTemplate parseSkillFromLlm(String response, ConversationReflection reflection) {
        if (response == null || response.contains("NONE")) return null;
        try {
            String json = response;
            int start = json.indexOf('{');
            int end = json.lastIndexOf('}');
            if (start >= 0 && end > start) json = json.substring(start, end + 1);

            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            @SuppressWarnings("unchecked")
            Map<String, Object> map = mapper.readValue(json, Map.class);

            SkillTemplate t = new SkillTemplate();
            t.setSkillName(getStr(map, "skill_name", "auto_skill_" + reflection.getConversationId().substring(0, 8)));
            t.setSkillGroup(getStr(map, "skill_group", "custom"));
            t.setTitle(getStr(map, "title", "自动生成技能"));
            t.setDescription(getStr(map, "description", ""));
            t.setTriggerPhrases(getStr(map, "trigger_phrases", null));
            t.setStepsJson(getStr(map, "steps_json", "[]"));
            t.setPreConditions(getStr(map, "pre_conditions", null));
            t.setPostCheck(getStr(map, "post_check", null));
            return t;
        } catch (Exception e) {
            log.warn("[SkillEvolve] LLM响应解析失败: {}", e.getMessage());
            return null;
        }
    }

    private String getStr(Map<String, Object> map, String key, String defaultValue) {
        Object v = map.get(key);
        return v != null ? v.toString() : defaultValue;
    }
}
