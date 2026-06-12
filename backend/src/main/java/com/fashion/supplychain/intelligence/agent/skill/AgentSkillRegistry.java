package com.fashion.supplychain.intelligence.agent.skill;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Component
@Lazy
public class AgentSkillRegistry {

    private final Map<String, AgentSkill> skills = new ConcurrentHashMap<>();
    private final ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());

    @Value("${xiaoyun.skills.path:classpath:skills/*.yaml}")
    private String skillsPath;

    @Value("${xiaoyun.skills.enabled:true}")
    private boolean skillsEnabled;

    @PostConstruct
    public void loadSkills() {
        if (!skillsEnabled) {
            log.info("[SkillRegistry] Skills system disabled");
            return;
        }
        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources(skillsPath);
            for (Resource resource : resources) {
                try (InputStream is = resource.getInputStream()) {
                    AgentSkill skill = yamlMapper.readValue(is, AgentSkill.class);
                    skill.setLoadedAt(System.currentTimeMillis());
                    skills.put(skill.getId(), skill);
                    log.info("[SkillRegistry] Loaded skill: {} (triggers: {})", skill.getName(), skill.getTriggers());
                } catch (Exception e) {
                    log.warn("[SkillRegistry] Failed to load skill {}: {}", resource.getFilename(), e.getMessage());
                }
            }
            log.info("[SkillRegistry] Total skills loaded: {}", skills.size());
        } catch (Exception e) {
            log.warn("[SkillRegistry] No skill files found at {}, using empty registry", skillsPath);
        }
    }

    public List<AgentSkill> matchSkills(String userMessage) {
        if (!skillsEnabled || skills.isEmpty()) return List.of();

        String lower = userMessage.toLowerCase();
        List<AgentSkill> matched = new ArrayList<>();

        for (AgentSkill skill : skills.values()) {
            if (!skill.isActive()) continue;
            for (String trigger : skill.getTriggers()) {
                if (Pattern.compile(Pattern.quote(trigger), Pattern.CASE_INSENSITIVE)
                        .matcher(lower).find()) {
                    matched.add(skill);
                    break;
                }
            }
        }

        matched.sort(Comparator.comparingInt(AgentSkill::getPriority).reversed());
        return matched;
    }

    public String buildSkillInjection(String userMessage) {
        List<AgentSkill> matched = matchSkills(userMessage);
        if (matched.isEmpty()) return "";

        StringBuilder sb = new StringBuilder();
        sb.append("\n\n【已激活的专业技能包】\n");
        sb.append("以下技能已根据用户问题自动加载，请优先参考这些领域的知识和工具：\n\n");
        for (int i = 0; i < Math.min(matched.size(), 3); i++) {
            AgentSkill skill = matched.get(i);
            sb.append("--- ").append(skill.getName()).append(" ---\n");
            sb.append(skill.getPromptInjection()).append("\n");
        }
        return sb.toString();
    }

    public List<String> getRecommendedTools(String userMessage) {
        return matchSkills(userMessage).stream()
                .flatMap(s -> s.getToolNames().stream())
                .distinct()
                .collect(Collectors.toList());
    }

    public List<AgentSkill> getAllSkills() {
        return new ArrayList<>(skills.values());
    }

    public void reloadSingle(String skillId) {
        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources(skillsPath);
            for (Resource resource : resources) {
                try (InputStream is = resource.getInputStream()) {
                    AgentSkill skill = yamlMapper.readValue(is, AgentSkill.class);
                    if (skill.getId().equals(skillId)) {
                        skill.setLoadedAt(System.currentTimeMillis());
                        skills.put(skillId, skill);
                        log.info("[SkillRegistry] Reloaded skill: {}", skill.getName());
                        return;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[SkillRegistry] Failed to reload skill {}: {}", skillId, e.getMessage());
        }
    }
}