package com.fashion.supplychain.intelligence.helper;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class PromptTemplateLoader {

    private final Map<String, Map<String, Object>> templates = new ConcurrentHashMap<>();
    private static final String PROMPTS_DIR = "prompts/";

    @PostConstruct
    public void init() {
        loadTemplate("xiaoyun-base-prompt");
    }

    public String getSection(String templateName, String sectionKey) {
        Map<String, Object> template = templates.get(templateName);
        if (template == null) {
            template = loadTemplate(templateName);
        }
        if (template == null) {
            log.warn("[PromptLoader] 模板 {} 不存在", templateName);
            return "";
        }
        Object value = template.get(sectionKey);
        if (value instanceof String s) {
            return s;
        }
        log.warn("[PromptLoader] 模板 {} 中 {} 不是字符串", templateName, sectionKey);
        return "";
    }

    public String getBaseIdentity() {
        return getSection("xiaoyun-base-prompt", "identity");
    }

    public String getBasePrinciples() {
        return getSection("xiaoyun-base-prompt", "principles_text");
    }

    public String getCollaborationRules() {
        return getSection("xiaoyun-base-prompt", "collaboration_text");
    }

    public String getToolStrategy() {
        return getSection("xiaoyun-base-prompt", "tool_strategy_text");
    }

    public String getThinkToolGuide() {
        return getSection("xiaoyun-base-prompt", "think_tool_guide_text");
    }

    public String getOutputRequirements() {
        return getSection("xiaoyun-base-prompt", "output_requirements_text");
    }

    public String getExecutionRules() {
        return getSection("xiaoyun-base-prompt", "execution_rules_text");
    }

    public String getFollowupFormat() {
        return getSection("xiaoyun-base-prompt", "followup_format_text");
    }

    public String getRichMediaFormat() {
        return getSection("xiaoyun-base-prompt", "rich_media_format_text");
    }

    public String getWorkerRestriction() {
        return getSection("xiaoyun-base-prompt", "worker_restriction_text");
    }

    public String getManagerMode() {
        return getSection("xiaoyun-base-prompt", "manager_mode_text");
    }

    public String getSelfCritiqueFeedback() {
        return getSection("xiaoyun-base-prompt", "self_critique_feedback_text");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> loadTemplate(String name) {
        try {
            ClassPathResource resource = new ClassPathResource(PROMPTS_DIR + name + ".yaml");
            if (!resource.exists()) {
                log.warn("[PromptLoader] 模板文件不存在: {}", PROMPTS_DIR + name + ".yaml");
                return null;
            }
            String content = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            Yaml yaml = new Yaml();
            Map<String, Object> data = yaml.load(content);
            templates.put(name, data);
            log.info("[PromptLoader] 已加载模板: {} ({} 个段)", name, data.size());
            return data;
        } catch (Exception e) {
            log.warn("[PromptLoader] 加载模板 {} 失败: {}", name, e.getMessage());
            return null;
        }
    }

    public void reloadTemplate(String name) {
        templates.remove(name);
        loadTemplate(name);
        log.info("[PromptLoader] 已重新加载模板: {}", name);
    }
}
