package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.entity.AgentCard;
import com.fashion.supplychain.intelligence.orchestration.AgentCardService;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.lang.reflect.Field;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * MCP 工具扫描器 — 自动发现所有标注了 {@link McpToolAnnotation} 的工具。
 * <p>
 * 在 Bean 初始化后扫描 Spring 容器中所有 AgentTool 实例，
 * 收集注解元数据，注册到 MCP 端点、工具发现 RAG、A2A AgentCard。
 * </p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class McpToolScanner {

    private final ApplicationContext applicationContext;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 名称 → 注解元数据 */
    private final Map<String, McpToolMeta> toolMetaIndex = new ConcurrentHashMap<>();
    /** 名称 → AgentTool 实例 */
    private final Map<String, AgentTool> toolInstanceIndex = new ConcurrentHashMap<>();

    @Autowired(required = false)
    private AgentCardService agentCardService;

    @Autowired(required = false)
    private AiAgentToolAccessService toolAccessService;

    /**
     * 工具元数据，从注解和类中提取
     */
    public record McpToolMeta(
            String name,
            String description,
            String domain,
            boolean readOnly,
            int timeoutSeconds,
            boolean requiresConfirmation,
            String version,
            String[] tags,
            String className,
            String jsonSchema
    ) {}

    @PostConstruct
    public void scanAndRegister() {
        log.info("[McpScanner] 开始扫描 @McpToolAnnotation 工具...");

        Map<String, AgentTool> allTools = applicationContext.getBeansOfType(AgentTool.class);
        int scanned = 0, annotated = 0;

        for (Map.Entry<String, AgentTool> entry : allTools.entrySet()) {
            AgentTool tool = entry.getValue();
            String beanName = entry.getKey();
            scanned++;

            McpToolAnnotation annotation = tool.getClass().getAnnotation(McpToolAnnotation.class);
            if (annotation == null) {
                log.debug("[McpScanner] 跳过未注解工具: {} ({})", beanName, tool.getClass().getSimpleName());
                continue;
            }
            annotated++;

            // 构建 JSON Schema（从 execute 参数和类字段推断）
            String jsonSchema = buildJsonSchema(tool, annotation);

            McpToolMeta meta = new McpToolMeta(
                    annotation.name(),
                    annotation.description(),
                    annotation.domain().name(),
                    annotation.readOnly(),
                    annotation.timeoutSeconds(),
                    annotation.requiresConfirmation(),
                    annotation.version(),
                    annotation.tags(),
                    tool.getClass().getName(),
                    jsonSchema
            );

            toolMetaIndex.put(annotation.name(), meta);
            toolInstanceIndex.put(annotation.name(), tool);

            log.info("[McpScanner] ✓ 注册工具: {} (domain={}, readOnly={}, tags={})",
                    annotation.name(), annotation.domain(), annotation.readOnly(),
                    Arrays.toString(annotation.tags()));
        }

        log.info("[McpScanner] 扫描完成: {}/{} 个工具已注解注册", annotated, scanned);
    }

    /**
     * 从工具类推断 JSON Schema。
     * 优先使用 getToolDefinition() 中已定义的 schema，否则生成基础 schema。
     */
    private String buildJsonSchema(AgentTool tool, McpToolAnnotation annotation) {
        try {
            // 优先使用已有的 tool definition
            var def = tool.getToolDefinition();
            if (def != null && def.getFunction() != null && def.getFunction().getParameters() != null) {
                return def.getFunction().getParameters();
            }
        } catch (Exception e) {
            log.debug("[McpScanner] getToolDefinition 不可用，使用自动生成 schema: {}", e.getMessage());
        }

        // 回退：生成基础 schema
        return "{\"type\":\"object\",\"properties\":{},\"additionalProperties\":false}";
    }

    /**
     * 获取所有已注册的 MCP 工具元数据列表（供 MCP tools/list 使用）
     */
    public List<McpToolMeta> getAllToolMetas() {
        return List.copyOf(toolMetaIndex.values());
    }

    /**
     * 按名称查找工具元数据
     */
    public McpToolMeta getToolMeta(String name) {
        return toolMetaIndex.get(name);
    }

    /**
     * 按名称查找工具实例
     */
    public AgentTool getToolInstance(String name) {
        return toolInstanceIndex.get(name);
    }

    /**
     * 按域过滤工具
     */
    public List<McpToolMeta> getToolsByDomain(String domain) {
        return toolMetaIndex.values().stream()
                .filter(m -> m.domain.equalsIgnoreCase(domain))
                .toList();
    }

    /**
     * 按标签搜索工具（用于 RAG 工具发现）
     */
    public List<McpToolMeta> searchByTags(List<String> queryTags) {
        return toolMetaIndex.values().stream()
                .filter(m -> {
                    for (String tag : m.tags) {
                        for (String qt : queryTags) {
                            if (tag.toLowerCase().contains(qt.toLowerCase())) return true;
                        }
                    }
                    return false;
                })
                .toList();
    }

    /**
     * 构建工具描述文本（用于向量化存入 Qdrant，支持工具发现 RAG）
     */
    public String buildToolDescriptionText(McpToolMeta meta) {
        StringBuilder sb = new StringBuilder();
        sb.append("工具: ").append(meta.name).append("\n");
        sb.append("描述: ").append(meta.description).append("\n");
        sb.append("域: ").append(meta.domain).append("\n");
        sb.append("标签: ").append(String.join(", ", meta.tags)).append("\n");
        return sb.toString();
    }

    /**
     * 刷新工具索引（用于热更新场景）
     */
    public void refresh() {
        toolMetaIndex.clear();
        toolInstanceIndex.clear();
        scanAndRegister();
    }

    /**
     * 工具数量统计
     */
    public int getToolCount() {
        return toolMetaIndex.size();
    }

    /**
     * 各域工具分布
     */
    public Map<String, Long> getDomainDistribution() {
        Map<String, Long> dist = new LinkedHashMap<>();
        for (McpToolMeta meta : toolMetaIndex.values()) {
            dist.merge(meta.domain, 1L, Long::sum);
        }
        return dist;
    }
}
