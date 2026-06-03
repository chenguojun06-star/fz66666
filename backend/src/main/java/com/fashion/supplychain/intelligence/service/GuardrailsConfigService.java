package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.helper.PromptTemplateLoader;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;

/**
 * P2升级: Guardrails-as-Code — 安全规则外置为YAML配置，支持热更新。
 * 引擎：{@link EvolutionSafetyGuard} 的补充，专注于输出内容过滤。
 */
@Service
@Slf4j
public class GuardrailsConfigService {

    private volatile List<GuardrailRule> outputFilters = List.of();
    private volatile List<QualityRule> qualityRules = List.of();
    private volatile Map<String, Integer> riskLevels = Map.of();

    @Autowired(required = false)
    private PromptTemplateLoader promptTemplateLoader;

    @PostConstruct
    public void init() { loadRules(); }

    @SuppressWarnings("unchecked")
    public synchronized void loadRules() {
        try {
            ClassPathResource res = new ClassPathResource("prompts/guardrails.yaml");
            if (!res.exists()) { log.warn("[Guardrails] 配置文件不存在，使用空规则"); return; }
            String content = new String(res.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            Yaml yaml = new Yaml();
            Map<String, Object> data = yaml.load(content);
            parseFilters((List<Map<String, Object>>) data.get("output_filters"));
            parseQuality((List<Map<String, Object>>) data.get("content_quality"));
            parseRiskLevels((Map<String, Object>) data.get("risk_levels"));
            log.info("[Guardrails] 已加载 {} 条输出过滤规则, {} 条质量规则", outputFilters.size(), qualityRules.size());
        } catch (Exception e) {
            log.warn("[Guardrails] 加载配置失败: {}", e.getMessage());
        }
    }

    /** 检查AI输出是否符合安全规则。返回拦截原因，null表示通过。 */
    public String checkOutput(String aiResponse) {
        if (aiResponse == null || aiResponse.isBlank()) return "回答为空";
        for (GuardrailRule rule : outputFilters) {
            for (String p : rule.patterns) {
                if (Pattern.compile(p, Pattern.CASE_INSENSITIVE).matcher(aiResponse).find()) {
                    return rule.action.equals("block") ? rule.message : null; // mask规则不拦截
                }
            }
            if (rule.keywords != null) {
                String lower = aiResponse.toLowerCase();
                for (String kw : rule.keywords) {
                    if (lower.contains(kw)) return rule.message;
                }
            }
        }
        return null;
    }

    /** 应用屏蔽规则（替换敏感信息） */
    public String applyMasks(String content) {
        if (content == null) return null;
        for (GuardrailRule rule : outputFilters) {
            if (!"mask".equals(rule.action)) continue;
            for (String p : rule.patterns) {
                content = content.replaceAll(p, rule.replacement != null ? rule.replacement : "***");
            }
        }
        return content;
    }

    /** 检查质量规则，返回问题列表 */
    public List<String> checkQuality(String content) {
        List<String> issues = new ArrayList<>();
        if (content == null) { issues.add("回答为空"); return issues; }
        for (QualityRule qr : qualityRules) {
            if ("no_empty_answer".equals(qr.id) && content.length() < qr.minLength) {
                issues.add("回答过短（" + content.length() + "字符）");
            }
            if ("no_repetition".equals(qr.id)) {
                double ratio = calcRepeatRatio(content);
                if (ratio > qr.maxRepeatRatio) issues.add("重复率过高: " + String.format("%.0f%%", ratio * 100));
            }
        }
        return issues;
    }

    private double calcRepeatRatio(String text) {
        if (text.length() < 20) return 0;
        int repeats = 0;
        for (int i = 0; i < text.length() - 10; i += 10) {
            String seg = text.substring(i, Math.min(i + 10, text.length()));
            int idx = text.indexOf(seg, i + 10);
            if (idx > 0) repeats++;
        }
        return (double) repeats / (text.length() / 10.0);
    }

    public Map<String, Object> getRules() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("output_filters", outputFilters.size());
        result.put("quality_rules", qualityRules.size());
        result.put("risk_levels", riskLevels);
        return result;
    }

    public void reload() {
        loadRules();
        if (promptTemplateLoader != null) promptTemplateLoader.reloadTemplate("guardrails");
    }

    // ── 解析 ──

    @SuppressWarnings("unchecked")
    private void parseFilters(List<Map<String, Object>> raw) {
        if (raw == null) return;
        List<GuardrailRule> rules = new ArrayList<>();
        for (Map<String, Object> r : raw) {
            GuardrailRule gr = new GuardrailRule();
            gr.id = (String) r.getOrDefault("id", "");
            gr.description = (String) r.getOrDefault("description", "");
            gr.patterns = (List<String>) r.getOrDefault("patterns", List.of());
            gr.keywords = (List<String>) r.getOrDefault("keywords", List.of());
            gr.action = (String) r.getOrDefault("action", "block");
            gr.message = (String) r.getOrDefault("message", "内容不符合安全规范");
            gr.replacement = (String) r.getOrDefault("replacement", "***");
            rules.add(gr);
        }
        this.outputFilters = List.copyOf(rules);
    }

    @SuppressWarnings("unchecked")
    private void parseQuality(List<Map<String, Object>> raw) {
        if (raw == null) return;
        List<QualityRule> rules = new ArrayList<>();
        for (Map<String, Object> r : raw) {
            QualityRule qr = new QualityRule();
            qr.id = (String) r.getOrDefault("id", "");
            qr.description = (String) r.getOrDefault("description", "");
            qr.minLength = ((Number) r.getOrDefault("min_length", 0)).intValue();
            qr.maxRepeatRatio = ((Number) r.getOrDefault("max_repeat_ratio", 1.0)).doubleValue();
            rules.add(qr);
        }
        this.qualityRules = List.copyOf(rules);
    }

    @SuppressWarnings("unchecked")
    private void parseRiskLevels(Map<String, Object> raw) {
        if (raw == null) return;
        Map<String, Integer> levels = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            Map<String, Object> v = (Map<String, Object>) e.getValue();
            levels.put(e.getKey(), ((Number) v.getOrDefault("max_score", 100)).intValue());
        }
        this.riskLevels = Map.copyOf(levels);
    }

    static class GuardrailRule {
        String id, description, action, message, replacement;
        List<String> patterns = List.of();
        List<String> keywords = List.of();
    }

    static class QualityRule {
        String id, description;
        int minLength;
        double maxRepeatRatio = 1.0;
    }
}