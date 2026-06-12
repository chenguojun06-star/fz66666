package com.fashion.supplychain.intelligence.engine.multiint;

import com.fashion.supplychain.intelligence.entity.IntentCompositionTemplateEntity;
import com.fashion.supplychain.intelligence.mapper.IntentCompositionTemplateMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class IntentCompositionTemplateService {

    private final IntentCompositionTemplateMapper templateMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public List<MatchedTemplate> match(Long tenantId, String query) {
        if (tenantId == null || query == null || query.isBlank()) return new ArrayList<>();
        List<MatchedTemplate> matched = new ArrayList<>();
        try {
            List<IntentCompositionTemplateEntity> templates = templateMapper.findEnabledByTenant(tenantId);
            for (IntentCompositionTemplateEntity t : templates) {
                if (t.getTriggerPattern() == null || t.getTriggerPattern().isBlank()) continue;
                try {
                    Pattern p = Pattern.compile(t.getTriggerPattern(),
                            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
                    if (p.matcher(query).find()) {
                        List<String> seq = parseIntentSequence(t.getIntentSequence());
                        if (!seq.isEmpty()) {
                            matched.add(new MatchedTemplate(t.getId(), t.getTemplateName(), seq, t.getPriority()));
                            try {
                                templateMapper.incrementHit(t.getId());
                            } catch (Exception e) {
                                log.debug("[IntentTemplate] incrementHit failed: {}", e.getMessage());
                            }
                        }
                    }
                } catch (Exception e) {
                    log.debug("[IntentTemplate] regex compile failed id={}: {}", t.getId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("[IntentTemplate] match failed tenant={}: {}", tenantId, e.getMessage());
        }
        matched.sort((a, b) -> Integer.compare(b.priority, a.priority));
        return matched;
    }

    public IntentCompositionTemplateEntity saveTemplate(Long tenantId, String name, String trigger,
                                                          List<String> intentSequence, String strategy,
                                                          int priority, String description) {
        if (tenantId == null || name == null) return null;
        try {
            IntentCompositionTemplateEntity t = new IntentCompositionTemplateEntity();
            t.setTenantId(tenantId);
            t.setTemplateName(name);
            t.setTriggerPattern(trigger);
            t.setIntentSequence(objectMapper.writeValueAsString(intentSequence));
            t.setCompositionStrategy(strategy == null ? "sequential" : strategy);
            t.setPriority(priority);
            t.setEnabled(1);
            t.setHitCount(0L);
            t.setDescription(description);
            t.setCreateTime(LocalDateTime.now());
            t.setUpdateTime(LocalDateTime.now());
            templateMapper.insert(t);
            return t;
        } catch (Exception e) {
            log.warn("[IntentTemplate] save failed: {}", e.getMessage());
            return null;
        }
    }

    public int totalTemplates(Long tenantId) {
        if (tenantId == null) return 0;
        try {
            return templateMapper.findEnabledByTenant(tenantId).size();
        } catch (Exception e) {
            return 0;
        }
    }

    private List<String> parseIntentSequence(String json) {
        if (json == null || json.isBlank()) return new ArrayList<>();
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            List<String> fallback = new ArrayList<>();
            for (String s : json.split(",")) {
                String t = s.trim();
                if (!t.isEmpty()) fallback.add(t);
            }
            return fallback;
        }
    }

    public record MatchedTemplate(Long templateId, String templateName, List<String> intentSequence, int priority) {}
}
