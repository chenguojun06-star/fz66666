package com.fashion.supplychain.intelligence.agent.skill;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.entity.SkillTemplate;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Skill 三层渐进式披露加载器（借鉴 Claude Agent SDK 2026-01 Skills 规范）。
 *
 * <p>三层结构：
 * <ul>
 *   <li>metadata 层（~50 tokens） — 常驻上下文，name/description/triggers</li>
 *   <li>SKILL.md 层（~500 tokens） — 命中后加载，完整技能文档</li>
 *   <li>references 层（按需） — 深度查询时加载，详细参考</li>
 * </ul>
 *
 * <p>设计原则：
 * <ul>
 *   <li>旧数据兼容：metadataYaml/skillMd/referencesJson 为空时，从现有字段降级生成</li>
 *   <li>token 估算：中文 ~1.5 字/token，英文 ~4 字符/token，取折中 chars/3</li>
 *   <li>无状态：所有方法纯函数式，不持有可变状态</li>
 * </ul>
 */
@Slf4j
@Component
@Lazy
public class SkillDisclosureLoader {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final int DEFAULT_TOKEN_BUDGET_METADATA = 50;
    private static final int DEFAULT_TOKEN_BUDGET_SKILL_MD = 500;
    private static final int CHARS_PER_TOKEN_ESTIMATE = 3;

    /** metadata 层：始终返回（~50 tokens），用于常驻上下文。 */
    public String loadMetadata(SkillTemplate skill) {
        if (skill == null) return "";

        if (isNotBlank(skill.getMetadataYaml())) {
            return truncateToTokenBudget(skill.getMetadataYaml(),
                    resolveBudget(skill.getTokenBudgetMetadata(), DEFAULT_TOKEN_BUDGET_METADATA));
        }
        return generateMetadataFromLegacy(skill);
    }

    /** SKILL.md 层：命中后返回（~500 tokens），完整技能文档。 */
    public String loadSkillMd(SkillTemplate skill) {
        if (skill == null) return "";

        if (isNotBlank(skill.getSkillMd())) {
            return truncateToTokenBudget(skill.getSkillMd(),
                    resolveBudget(skill.getTokenBudgetSkillMd(), DEFAULT_TOKEN_BUDGET_SKILL_MD));
        }
        return generateSkillMdFromLegacy(skill);
    }

    /**
     * references 层：深度查询时返回。
     *
     * @param skill 技能模板
     * @param query 用户查询关键词（用于过滤相关 references；为空则返回全部）
     * @return 过滤后的 references 内容（JSON 字符串），无内容返回空串
     */
    public String loadReferences(SkillTemplate skill, String query) {
        if (skill == null || isBlank(skill.getReferencesJson())) return "";

        List<Map<String, Object>> refs = parseReferences(skill.getReferencesJson());
        if (refs.isEmpty()) return "";

        if (isBlank(query)) return serializeRefs(refs);

        List<Map<String, Object>> filtered = filterRefsByQuery(refs, query);
        return serializeRefs(filtered);
    }

    /** 估算字符串 token 数（中文 ~1.5 字/token，英文 ~4 字符/token，取折中 chars/3）。 */
    public int estimateTokens(String text) {
        if (isBlank(text)) return 0;
        return text.length() / CHARS_PER_TOKEN_ESTIMATE;
    }

    // ============================================================
    // 降级生成（从现有字段生成三层内容，兼容旧数据）
    // ============================================================

    private String generateMetadataFromLegacy(SkillTemplate skill) {
        StringBuilder sb = new StringBuilder();
        sb.append("name: ").append(safe(skill.getSkillName())).append("\n");
        sb.append("description: ").append(safe(skill.getTitle())).append("\n");
        sb.append("triggers: ").append(safe(skill.getTriggerPhrases())).append("\n");
        return truncateToTokenBudget(sb.toString(), DEFAULT_TOKEN_BUDGET_METADATA);
    }

    private String generateSkillMdFromLegacy(SkillTemplate skill) {
        StringBuilder sb = new StringBuilder();
        sb.append("# ").append(safe(skill.getTitle())).append("\n\n");
        sb.append("## 角色定位\n").append(safe(skill.getDescription())).append("\n\n");
        if (isNotBlank(skill.getPreConditions())) {
            sb.append("## 前置条件\n").append(skill.getPreConditions()).append("\n\n");
        }
        if (isNotBlank(skill.getStepsJson())) {
            sb.append("## 执行流程\n```json\n")
              .append(skill.getStepsJson()).append("\n```\n\n");
        }
        if (isNotBlank(skill.getPostCheck())) {
            sb.append("## 后置校验\n").append(skill.getPostCheck()).append("\n");
        }
        return truncateToTokenBudget(sb.toString(), DEFAULT_TOKEN_BUDGET_SKILL_MD);
    }

    // ============================================================
    // references 解析与过滤
    // ============================================================

    private List<Map<String, Object>> parseReferences(String json) {
        try {
            List<Map<String, Object>> list = MAPPER.readValue(json, new TypeReference<>() {});
            return list != null ? list : new ArrayList<>();
        } catch (Exception e) {
            log.warn("[SkillDisclosure] references_json 解析失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> filterRefsByQuery(List<Map<String, Object>> refs, String query) {
        String lowerQuery = query.toLowerCase();
        List<String> keywords = splitKeywords(lowerQuery);
        List<Map<String, Object>> matched = new ArrayList<>();
        for (Map<String, Object> ref : refs) {
            if (matchesRef(ref, keywords)) {
                matched.add(ref);
            }
        }
        return matched.isEmpty() ? refs : matched;
    }

    private boolean matchesRef(Map<String, Object> ref, List<String> keywords) {
        String title = strVal(ref.get("title")).toLowerCase();
        String content = strVal(ref.get("content")).toLowerCase();
        Object keywordsObj = ref.get("keywords");
        String refKeywords = keywordsObj != null ? keywordsObj.toString().toLowerCase() : "";
        for (String kw : keywords) {
            if (title.contains(kw) || content.contains(kw) || refKeywords.contains(kw)) {
                return true;
            }
        }
        return false;
    }

    private List<String> splitKeywords(String query) {
        List<String> kws = new ArrayList<>();
        for (String kw : query.split("[\\s,，;；]+")) {
            if (!kw.isBlank()) kws.add(kw.trim());
        }
        return kws;
    }

    private String serializeRefs(List<Map<String, Object>> refs) {
        try {
            return MAPPER.writeValueAsString(refs);
        } catch (Exception e) {
            log.warn("[SkillDisclosure] references 序列化失败: {}", e.getMessage());
            return "[]";
        }
    }

    // ============================================================
    // 工具方法
    // ============================================================

    private int resolveBudget(Integer budget, int defaultBudget) {
        return (budget != null && budget > 0) ? budget : defaultBudget;
    }

    private String truncateToTokenBudget(String text, int tokenBudget) {
        if (text == null) return "";
        int maxChars = tokenBudget * CHARS_PER_TOKEN_ESTIMATE;
        if (text.length() <= maxChars) return text;
        return text.substring(0, maxChars) + "\n... (truncated)";
    }

    private boolean isNotBlank(String s) {
        return s != null && !s.isBlank();
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private String safe(String s) {
        return s != null ? s : "";
    }

    private String strVal(Object o) {
        return o != null ? o.toString() : "";
    }
}
