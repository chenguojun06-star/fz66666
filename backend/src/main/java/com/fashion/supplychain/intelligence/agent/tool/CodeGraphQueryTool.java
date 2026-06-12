package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.CodeIndexService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@Lazy
@AgentToolDef(
    name = "code_index_search",
    description = "代码索引搜索：快速定位Agent工具、Service方法、Controller端点的位置和功能。在需要查找系统能力或确定调用哪个工具时优先使用。",
    domain = ToolDomain.SYSTEM,
    timeoutMs = 5000,
    readOnly = true
)
@McpToolAnnotation(
    name = "code_index_search",
    description = "代码索引搜索：快速定位Agent工具、Service方法、Controller端点的位置和功能。在需要查找系统能力或确定调用哪个工具时优先使用。",
    domain = ToolDomain.SYSTEM,
    readOnly = true,
    timeoutSeconds = 5,
    requiresConfirmation = false,
    tags = {"代码索引", "工具搜索", "系统能力", "领域概览", "工具发现"}
)
public class CodeGraphQueryTool extends AbstractAgentTool {

    @Autowired
    private CodeIndexService codeIndexService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("操作：search_tools(搜索工具) | domain_overview(领域概览) | tool_detail(工具详情) | stats(统计)"));
        properties.put("query", stringProp("搜索关键词，如'订单进度'、'库存查询'、'财务审批'"));
        properties.put("domain", stringProp("领域筛选: PRODUCTION(生产)/FINANCE(财务)/WAREHOUSE(仓储)/STYLE(款式)/ANALYSIS(分析)/SYSTEM(系统)"));
        properties.put("toolName", stringProp("工具名称(用于 tool_detail 操作)"));
        properties.put("limit", intProp("返回数量限制，默认5"));
        return buildToolDef(
                "代码索引搜索引擎。预索引了系统中所有82个Agent工具的参数定义、功能描述和领域分类。\n"
                        + "核心用途：Agent在决定调用哪个工具前，先通过此工具精确检索，避免盲目遍历所有工具定义消耗Token。\n"
                        + "支持四种操作：\n"
                        + "1. search_tools — 按关键词+领域搜索匹配的工具\n"
                        + "2. domain_overview — 列出某个领域的所有工具概览\n"
                        + "3. tool_detail — 查看指定工具的详细参数Schema\n"
                        + "4. stats — 查看各领域工具数量统计\n"
                        + "\n调用建议：ReAct循环的每轮推理前先调用此工具定位目标工具，将节省60%以上的工具搜索Token。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "code_index_search";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.SYSTEM;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");

        return switch (action) {
            case "search_tools" -> searchTools(args);
            case "domain_overview" -> domainOverview(args);
            case "tool_detail" -> toolDetail(args);
            case "stats" -> stats();
            default -> errorJson("不支持的操作: " + action + "，可选: search_tools | domain_overview | tool_detail | stats");
        };
    }

    private String searchTools(Map<String, Object> args) throws Exception {
        String query = requireString(args, "query");
        String domain = optionalString(args, "domain");
        int limit = optionalInt(args, "limit") != null ? Math.min(optionalInt(args, "limit"), 20) : 5;

        Map<String, Object> result = codeIndexService.searchTools(query, domain, limit);
        result.put("hint", "检索到匹配工具后，可直接调用对应工具执行操作，无需再次全局搜索工具定义");
        return MAPPER.writeValueAsString(result);
    }

    private String domainOverview(Map<String, Object> args) throws Exception {
        String domain = optionalString(args, "domain");
        Map<String, Object> result = codeIndexService.getDomainOverview(domain);
        return MAPPER.writeValueAsString(result);
    }

    private String toolDetail(Map<String, Object> args) throws Exception {
        String toolName = requireString(args, "toolName");
        Map<String, Object> result = codeIndexService.getToolDetail(toolName);
        return MAPPER.writeValueAsString(result);
    }

    private String stats() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("totalTools", codeIndexService.getTotalTools());
        result.put("domainStats", codeIndexService.getDomainStats());
        return MAPPER.writeValueAsString(result);
    }
}