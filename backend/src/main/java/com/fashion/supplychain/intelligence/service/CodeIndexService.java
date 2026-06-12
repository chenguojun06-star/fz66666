package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AbstractAgentTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentToolDef;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@Lazy
public class CodeIndexService {

    @Autowired
    private ApplicationContext applicationContext;

    private final Map<String, String> toolNameIndex = new ConcurrentHashMap<>();
    private final Map<String, String> toolDescriptionIndex = new ConcurrentHashMap<>();
    private final Map<String, String> toolParamIndex = new ConcurrentHashMap<>();
    private final Map<String, ToolDomain> toolDomainIndex = new ConcurrentHashMap<>();
    private final Map<String, String> domainToolListCache = new ConcurrentHashMap<>();

    private volatile int totalTools = 0;
    private volatile long lastIndexTime = 0;

    @PostConstruct
    public void init() {
        rebuildIndex();
    }

    @Scheduled(cron = "0 5 3 * * ?")
    public void scheduledRebuild() {
        log.info("[CodeIndex] 定时重建代码索引...");
        rebuildIndex();
    }

    public synchronized void rebuildIndex() {
        long start = System.currentTimeMillis();
        toolNameIndex.clear();
        toolDescriptionIndex.clear();
        toolParamIndex.clear();
        toolDomainIndex.clear();
        domainToolListCache.clear();

        Map<String, AbstractAgentTool> tools = applicationContext.getBeansOfType(AbstractAgentTool.class);
        for (Map.Entry<String, AbstractAgentTool> entry : tools.entrySet()) {
            AbstractAgentTool tool = entry.getValue();
            String name = tool.getName();
            ToolDomain domain = tool.getDomain();

            AgentToolDef def = tool.getClass().getAnnotation(AgentToolDef.class);
            String description = def != null ? def.description() : "无描述";

            AiTool toolDef = tool.getToolDefinition();
            String paramSchema = "";
            if (toolDef != null && toolDef.getFunction() != null && toolDef.getFunction().getParameters() != null) {
                AiTool.AiParameters params = toolDef.getFunction().getParameters();
                paramSchema = buildParamSchema(params);
            }

            toolNameIndex.put(name, description);
            toolDescriptionIndex.put(name, description);
            toolParamIndex.put(name, paramSchema);
            toolDomainIndex.put(name, domain);

            totalTools++;
        }

        for (ToolDomain domain : ToolDomain.values()) {
            StringBuilder sb = new StringBuilder();
            for (Map.Entry<String, ToolDomain> e : toolDomainIndex.entrySet()) {
                if (e.getValue() == domain) {
                    sb.append(e.getKey()).append(": ").append(toolDescriptionIndex.getOrDefault(e.getKey(), "")).append("\n");
                }
            }
            if (sb.length() > 0) {
                domainToolListCache.put(domain.name(), sb.toString());
            }
        }

        lastIndexTime = System.currentTimeMillis();
        log.info("[CodeIndex] 索引重建完成，共 {} 个工具，{} 个领域，耗时 {}ms",
                totalTools, domainToolListCache.size(), lastIndexTime - start);
    }

    public Map<String, Object> searchTools(String query, String domainFilter, int limit) {
        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> matches = new ArrayList<>();

        String lowerQuery = query.toLowerCase();
        for (Map.Entry<String, String> entry : toolDescriptionIndex.entrySet()) {
            String name = entry.getKey();
            String desc = entry.getValue();
            ToolDomain domain = toolDomainIndex.get(name);

            if (domainFilter != null && !domainFilter.isBlank()) {
                try {
                    if (domain != ToolDomain.valueOf(domainFilter.toUpperCase())) continue;
                } catch (IllegalArgumentException ignored) {}
            }

            int score = 0;
            if (name.toLowerCase().contains(lowerQuery)) score += 10;
            String lowerDesc = desc.toLowerCase();
            for (String token : lowerQuery.split("\\s+")) {
                if (lowerDesc.contains(token)) score += 2;
                if (name.toLowerCase().contains(token)) score += 5;
            }

            if (score > 0) {
                Map<String, Object> match = new LinkedHashMap<>();
                match.put("toolName", name);
                match.put("description", desc);
                match.put("domain", domain != null ? domain.getLabel() : "GENERAL");
                match.put("score", score);
                match.put("paramSchema", toolParamIndex.get(name));
                matches.add(match);
            }
        }

        matches.sort((a, b) -> ((Integer) b.get("score")).compareTo((Integer) a.get("score")));

        if (matches.size() > limit) {
            matches = matches.subList(0, limit);
        }

        result.put("success", true);
        result.put("query", query);
        result.put("domainFilter", domainFilter);
        result.put("totalMatches", matches.size());
        result.put("tools", matches);
        return result;
    }

    public Map<String, Object> getDomainOverview(String domainName) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (domainName == null || domainName.isBlank()) {
            for (String domain : domainToolListCache.keySet()) {
                result.put(domain, domainToolListCache.get(domain));
            }
        } else {
            String cache = domainToolListCache.get(domainName.toUpperCase());
            result.put(domainName, cache != null ? cache : "未找到该领域的工具");
        }
        result.put("totalDomains", domainToolListCache.size());
        result.put("totalTools", totalTools);
        result.put("lastIndexTime", lastIndexTime);
        return result;
    }

    public Map<String, Object> getToolDetail(String toolName) {
        Map<String, Object> detail = new LinkedHashMap<>();
        if (!toolNameIndex.containsKey(toolName)) {
            detail.put("success", false);
            detail.put("error", "工具 " + toolName + " 不存在");
            return detail;
        }
        detail.put("success", true);
        detail.put("toolName", toolName);
        detail.put("description", toolDescriptionIndex.get(toolName));
        detail.put("paramSchema", toolParamIndex.get(toolName));
        detail.put("domain", toolDomainIndex.get(toolName) != null ? toolDomainIndex.get(toolName).getLabel() : "GENERAL");
        return detail;
    }

    private String buildParamSchema(AiTool.AiParameters params) {
        if (params == null) return "";
        Map<String, Object> props = params.getProperties();
        List<String> required = params.getRequired();
        if (props == null || props.isEmpty()) return "无参数";
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Object> entry : props.entrySet()) {
            String name = entry.getKey();
            String type = "string";
            String desc = "";
            if (entry.getValue() instanceof Map<?, ?> propDef) {
                Object typeObj = propDef.get("type");
                if (typeObj != null) type = typeObj.toString();
                Object descObj = propDef.get("description");
                if (descObj != null) desc = descObj.toString();
            }
            boolean isRequired = required != null && required.contains(name);
            sb.append(isRequired ? "*" : " ").append(name).append("(").append(type).append(")");
            if (!desc.isEmpty()) sb.append(": ").append(desc);
            sb.append("\n");
        }
        return sb.toString();
    }

    public int getTotalTools() {
        return totalTools;
    }

    public Map<String, Integer> getDomainStats() {
        Map<String, Integer> stats = new LinkedHashMap<>();
        for (ToolDomain domain : ToolDomain.values()) {
            int count = 0;
            for (ToolDomain td : toolDomainIndex.values()) {
                if (td == domain) count++;
            }
            if (count > 0) stats.put(domain.getLabel(), count);
        }
        return stats;
    }
}