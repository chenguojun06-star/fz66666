package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.SkillTemplate;
import com.fashion.supplychain.intelligence.mapper.SkillTemplateMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 技能结晶化服务（借鉴 GenericAgent Skill Crystallization）。
 *
 * <p>核心机制：高频问题自主探索 → 执行路径结晶化 → 记忆存储 → 下次直接复用。
 * 解决痛点：高频问题（"今天多少款要交"/"这个款号进度"）每次从头推理，浪费 token。
 *
 * <p>流程：
 * <ol>
 *   <li>每次高质量对话后调用 {@link #detectAndCrystallize}</li>
 *   <li>用 Redis 计数器统计相似问题出现次数（语义哈希，不调 LLM，避免延迟）</li>
 *   <li>同一语义哈希 ≥3 次触发结晶化：提取工具调用序列 → 存储为 source="crystallized" 技能</li>
 *   <li>下次相同问题到来时，{@link #tryCrystallizedAnswer} 直接复用，跳过 LLM 推理（节约 6 倍 token）</li>
 * </ol>
 *
 * <p>设计原则：
 * <ul>
 *   <li>语义哈希用关键词提取，不调 LLM，避免延迟</li>
 *   <li>结晶化异步执行，不阻塞主流程</li>
 *   <li>复用 t_skill_template 表（source 字段标记），不新建表</li>
 *   <li>confidence 初始 0.8（高于普通 0.6），因为已经验证过多次</li>
 *   <li>多租户隔离：所有查询带 tenant_id（P0 铁律）</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
public class SkillCrystallizationService {

    private static final int CRYSTALLIZE_THRESHOLD = 3;
    private static final long COUNTER_TTL_DAYS = 7L;
    private static final String COUNTER_KEY_PREFIX = "crystallize:counter:";
    private static final String SOURCE_CRYSTALLIZED = "crystallized";
    private static final BigDecimal INITIAL_CONFIDENCE = new BigDecimal("0.80");
    private static final double MIN_QUALITY_FOR_CRYSTALLIZE = 0.75;

    @Autowired private SkillTemplateMapper skillTemplateMapper;
    @Autowired(required = false) private StringRedisTemplate redis;
    @Autowired(required = false) private EvolutionEventLogger eventLogger;

    private static final Pattern ORDER_NO_PATTERN = Pattern.compile("PO\\d{10,}|ORD\\d{6,}");
    private static final Pattern STYLE_NO_PATTERN = Pattern.compile("[A-Z]{2,4}-?\\d{4,6}");
    private static final Pattern DATE_PATTERN = Pattern.compile("\\d{4}-\\d{2}-\\d{2}|今天|明天|昨天|本周|下周");

    /**
     * 检测高频问题并结晶化（异步，不阻塞主流程）。
     */
    @Async("aiSelfCriticExecutor")
    public void detectAndCrystallize(Long tenantId, String sessionId, String userQuestion,
                                      String toolCallsLog, String finalAnswer, double qualityScore) {
        if (qualityScore < MIN_QUALITY_FOR_CRYSTALLIZE) return;
        if (tenantId == null || userQuestion == null || userQuestion.isBlank()) return;

        String semanticHash = computeSemanticHash(userQuestion);
        if (semanticHash == null) return;

        long count = incrementCounter(tenantId, semanticHash);
        if (count != CRYSTALLIZE_THRESHOLD) return;

        boolean success = doCrystallize(tenantId, sessionId, userQuestion, toolCallsLog, semanticHash);
        if (success && eventLogger != null) {
            eventLogger.log(EvolutionEventLogger.EvolutionEvent.of(
                    tenantId, "SKILL_CRYSTALLIZED",
                    Map.of("semanticHash", semanticHash, "sessionId", String.valueOf(sessionId), "count", count)));
        }
    }

    /**
     * 尝试用结晶化技能直接回答（命中则跳过 LLM 推理）。
     */
    public Optional<String> tryCrystallizedAnswer(Long tenantId, String userQuestion) {
        if (tenantId == null || userQuestion == null) return Optional.empty();
        String semanticHash = computeSemanticHash(userQuestion);
        if (semanticHash == null) return Optional.empty();

        SkillTemplate skill = findCrystallizedSkill(tenantId, semanticHash);
        if (skill == null) return Optional.empty();

        skill.setUseCount(skill.getUseCount() + 1);
        skillTemplateMapper.updateById(skill);
        log.debug("[Crystallize] 命中结晶化技能 {} (useCount={})", skill.getSkillName(), skill.getUseCount());
        return Optional.of(buildCachedAnswer(skill, userQuestion));
    }

    // ==================== 私有方法 ====================

    private long incrementCounter(Long tenantId, String semanticHash) {
        if (redis == null) return 0L;
        try {
            String key = COUNTER_KEY_PREFIX + tenantId + ":" + semanticHash;
            Long count = redis.opsForValue().increment(key);
            redis.expire(key, COUNTER_TTL_DAYS, TimeUnit.DAYS);
            return count != null ? count : 0L;
        } catch (Exception e) {
            log.debug("[Crystallize] Redis 计数失败: {}", e.getMessage());
            return 0L;
        }
    }

    private boolean doCrystallize(Long tenantId, String sessionId, String userQuestion,
                                   String toolCallsLog, String semanticHash) {
        if (findCrystallizedSkill(tenantId, semanticHash) != null) return false;
        try {
            SkillTemplate skill = buildCrystallizedSkill(tenantId, sessionId, userQuestion, toolCallsLog, semanticHash);
            skillTemplateMapper.insert(skill);
            log.info("[Crystallize] 新结晶化技能已存储: {} (hash={})", skill.getSkillName(), semanticHash);
            return true;
        } catch (Exception e) {
            log.warn("[Crystallize] 结晶化失败: {}", e.getMessage());
            return false;
        }
    }

    private SkillTemplate buildCrystallizedSkill(Long tenantId, String sessionId,
                                                  String userQuestion, String toolCallsLog, String semanticHash) {
        SkillTemplate skill = new SkillTemplate();
        skill.setId(UUID.randomUUID().toString().replace("-", "").substring(0, 24));
        skill.setTenantId(tenantId);
        skill.setSkillName("crystal_" + Math.abs(semanticHash.hashCode()));
        skill.setSkillGroup("crystallized");
        skill.setTitle("结晶化技能: " + extractIntent(userQuestion));
        skill.setDescription("高频问题自动结晶化: " + truncate(userQuestion, 200));
        skill.setTriggerPhrases(extractIntent(userQuestion));
        skill.setStepsJson(crystallizeSteps(toolCallsLog));
        skill.setPreConditions("语义哈希匹配: " + semanticHash);
        skill.setPostCheck("工具调用结果非空");
        skill.setSource(SOURCE_CRYSTALLIZED);
        skill.setSourceConversationId(sessionId);
        skill.setVersion(1);
        skill.setUseCount(0);
        skill.setSuccessCount(0);
        skill.setAvgRating(BigDecimal.ZERO);
        skill.setConfidence(INITIAL_CONFIDENCE);
        skill.setEnabled(1);
        skill.setDeleteFlag(0);
        skill.setCreateTime(LocalDateTime.now());
        skill.setUpdateTime(LocalDateTime.now());
        return skill;
    }

    private SkillTemplate findCrystallizedSkill(Long tenantId, String semanticHash) {
        QueryWrapper<SkillTemplate> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .eq("source", SOURCE_CRYSTALLIZED)
          .eq("delete_flag", 0)
          .likeRight("pre_conditions", "语义哈希匹配: " + semanticHash)
          .last("LIMIT 1");
        return skillTemplateMapper.selectOne(qw);
    }

    private String buildCachedAnswer(SkillTemplate skill, String userQuestion) {
        return String.format("[结晶化技能命中] %s\n问题: %s\n建议执行步骤: %s",
                skill.getTitle(), userQuestion, truncate(skill.getStepsJson(), 500));
    }

    /**
     * 计算语义哈希（不调 LLM，纯关键词提取 + 顺序归一化）。
     * 格式：intent:查询订单进度:entity:PO12345678901234
     */
    String computeSemanticHash(String userQuestion) {
        String intent = extractIntent(userQuestion);
        if (intent == null) return null;
        return "intent:" + intent + ":entity:" + extractEntities(userQuestion);
    }

    private String extractIntent(String question) {
        String lower = question.toLowerCase();
        if (lower.matches(".*(交期|逾期|延期|延迟).*")) return "查询交期风险";
        if (lower.matches(".*(进度|状态|到哪|怎么样).*")) return "查询订单进度";
        if (lower.matches(".*(多少|几|数量|统计|汇总).*")) return "统计数量";
        if (lower.matches(".*(库存|仓库|存货).*")) return "查询库存";
        if (lower.matches(".*(工厂|产能|排产).*")) return "查询工厂产能";
        if (lower.matches(".*(工资|计件|薪资).*")) return "查询工资";
        if (lower.matches(".*(质检|次品|不合格).*")) return "查询质检";
        if (lower.matches(".*(对比|排名|排行).*")) return "对比排名";
        return "通用查询";
    }

    private String extractEntities(String question) {
        Set<String> entities = new TreeSet<>();
        collectMatches(ORDER_NO_PATTERN, question, entities);
        collectMatches(STYLE_NO_PATTERN, question, entities);
        collectMatches(DATE_PATTERN, question, entities);
        return entities.isEmpty() ? "none" : String.join(",", entities);
    }

    private void collectMatches(Pattern pattern, String text, Set<String> target) {
        Matcher m = pattern.matcher(text);
        while (m.find()) target.add(m.group());
    }

    private String crystallizeSteps(String toolCallsLog) {
        if (toolCallsLog == null || toolCallsLog.isBlank()) return "[]";
        String[] lines = toolCallsLog.split("\n");
        List<String> tools = new ArrayList<>();
        for (String line : lines) {
            String toolName = extractToolName(line);
            if (toolName != null && !tools.contains(toolName)) tools.add(toolName);
        }
        return tools.isEmpty() ? "[]" : String.join("->", tools);
    }

    private String extractToolName(String line) {
        String trimmed = line.trim();
        if (!trimmed.startsWith("tool_call:") && !trimmed.contains("tool:")) return null;
        String toolName = trimmed.replaceAll(".*tool_call:\\s*", "")
                .replaceAll(".*tool:\\s*", "")
                .replaceAll("[^a-zA-Z0-9_]", "");
        return toolName.isEmpty() ? null : toolName;
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
