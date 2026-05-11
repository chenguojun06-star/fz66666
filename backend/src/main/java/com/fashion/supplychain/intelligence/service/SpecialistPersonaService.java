package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.helper.PromptTemplateLoader;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class SpecialistPersonaService {

    private final PromptTemplateLoader promptTemplateLoader;

    private final Map<String, SpecialistPersona> personaCache = new ConcurrentHashMap<>();

    private static final String[] SPECIALIST_ROUTES = {
            "production", "sourcing", "delivery_risk", "cost", "logistics", "compliance"
    };

    private static final Map<String, String> ROUTE_TO_FILE = Map.of(
            "production", "prompts/specialist-production.yaml",
            "sourcing", "prompts/specialist-sourcing.yaml",
            "delivery_risk", "prompts/specialist-delivery.yaml",
            "cost", "prompts/specialist-cost.yaml",
            "logistics", "prompts/specialist-logistics.yaml",
            "compliance", "prompts/specialist-compliance.yaml"
    );

    @PostConstruct
    public void loadAll() {
        Yaml yaml = new Yaml();
        for (Map.Entry<String, String> entry : ROUTE_TO_FILE.entrySet()) {
            try {
                ClassPathResource resource = new ClassPathResource(entry.getValue());
                if (!resource.exists()) {
                    log.warn("[SpecialistPersona] 文件不存在: {}", entry.getValue());
                    continue;
                }
                try (InputStream is = resource.getInputStream()) {
                    Map<String, Object> data = yaml.load(is);
                    SpecialistPersona persona = parsePersona(data);
                    personaCache.put(entry.getKey(), persona);
                    log.info("[SpecialistPersona] 已加载: route={} name={}", entry.getKey(), persona.name);
                }
            } catch (Exception e) {
                log.warn("[SpecialistPersona] 加载失败: {} - {}", entry.getValue(), e.getMessage());
            }
        }
        log.info("[SpecialistPersona] 共加载 {} 个人设", personaCache.size());
    }

    public SpecialistPersona getPersona(String route) {
        return personaCache.get(route);
    }

    public String buildSystemPrompt(String route) {
        SpecialistPersona persona = personaCache.get(route);
        if (persona == null) return "";
        return persona.identity;
    }

    public String buildFullPrompt(String route) {
        SpecialistPersona persona = personaCache.get(route);
        if (persona == null) return "";
        StringBuilder sb = new StringBuilder();
        sb.append(persona.identity).append("\n\n");
        sb.append("【核心使命】\n");
        if (persona.missions != null) {
            for (Map<String, Object> mission : persona.missions) {
                sb.append("- ").append(mission.get("name")).append(": ")
                  .append(mission.get("description")).append("\n");
            }
        }
        sb.append("\n【关键规则】\n");
        if (persona.rules != null) {
            for (Map<String, Object> rule : persona.rules) {
                sb.append("- ").append(rule.get("rule")).append(": ")
                  .append(rule.get("detail")).append("\n");
            }
        }
        sb.append("\n【成功指标】\n");
        if (persona.metrics != null) {
            for (Map<String, Object> metric : persona.metrics) {
                sb.append("- ").append(metric.get("metric")).append(": ")
                  .append(metric.get("target")).append("\n");
            }
        }
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private SpecialistPersona parsePersona(Map<String, Object> data) {
        SpecialistPersona p = new SpecialistPersona();
        p.name = (String) data.getOrDefault("name", "");
        p.identity = (String) data.getOrDefault("identity", "");
        p.missions = (java.util.List<Map<String, Object>>) data.get("core_missions");
        p.rules = (java.util.List<Map<String, Object>>) data.get("key_rules");
        p.metrics = (java.util.List<Map<String, Object>>) data.get("success_metrics");
        return p;
    }

    public static class SpecialistPersona {
        public String name;
        public String identity;
        public java.util.List<Map<String, Object>> missions;
        public java.util.List<Map<String, Object>> rules;
        public java.util.List<Map<String, Object>> metrics;
    }
}
