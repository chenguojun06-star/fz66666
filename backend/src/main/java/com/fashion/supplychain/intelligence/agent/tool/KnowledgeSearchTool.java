package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.service.KnowledgeBaseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * RAG知识库检索工具 — 回答行业术语、系统操作、业务FAQ等问题
 * Skill分类：问答/知识库类 Skill
 */
@Slf4j
@Component
public class KnowledgeSearchTool implements AgentTool {

    @Autowired
    private KnowledgeBaseService knowledgeBaseService;

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_knowledge_search";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> queryProp = new HashMap<>();
        queryProp.put("type", "string");
        queryProp.put("description", "搜索关键词，例如：FOB、菲号、如何建单、工资结算、逾期处理");
        properties.put("query", queryProp);

        Map<String, Object> categoryProp = new HashMap<>();
        categoryProp.put("type", "string");
        categoryProp.put("description", "知识分类（可选）：terminology=行业术语, system_guide=系统操作指南, faq=常见问题, sop=标准操作流程, rule=业务规则");
        properties.put("category", categoryProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("搜索知识库，回答行业术语（FOB/CMT/ODM/菲号等）、系统操作指南（如何建单/扫码/结算）、业务常见问题（面料不足/逾期处理/报价计算）等问题。当用户询问'什么是X'、'如何操作X'、'X怎么算'时调用此工具。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("query"));
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        try {
            JsonNode args = objectMapper.readTree(argumentsJson);
            String query = args.path("query").asText("").trim();
            String category = args.path("category").asText("").trim();

            if (query.isEmpty()) {
                return "{\"error\": \"请提供搜索关键词\"}";
            }

            Long tenantId = UserContext.tenantId();

            // 构建查询：公共知识 OR 当前租户知识，标题/关键词/内容模糊匹配
            QueryWrapper<KnowledgeBase> qw = new QueryWrapper<KnowledgeBase>()
                    .eq("delete_flag", 0)
                    .and(wrapper -> wrapper
                            .isNull("tenant_id")
                            .or()
                            .eq(tenantId != null, "tenant_id", tenantId)
                    )
                    .and(wrapper -> wrapper
                            .like("title", query)
                            .or().like("keywords", query)
                            .or().like("content", query)
                    );

            if (!category.isEmpty()) {
                qw.eq("category", category);
            }

            qw.orderByAsc("category").last("LIMIT 5");

            List<KnowledgeBase> results = knowledgeBaseService.list(qw);

            if (results.isEmpty()) {
                return "{\"message\": \"知识库中未找到关于 '" + query + "' 的相关内容。\"}";
            }

            // 格式化返回
            List<Map<String, Object>> formatted = new ArrayList<>();
            for (KnowledgeBase kb : results) {
                Map<String, Object> item = new HashMap<>();
                item.put("title", kb.getTitle());
                item.put("category", kb.getCategory());
                item.put("content", kb.getContent());
                formatted.add(item);

                // 更新浏览次数（异步/忽略失败）
                try {
                    KnowledgeBase update = new KnowledgeBase();
                    update.setId(kb.getId());
                    update.setViewCount(kb.getViewCount() == null ? 1 : kb.getViewCount() + 1);
                    knowledgeBaseService.updateById(update);
                } catch (Exception ignored) {}
            }

            Map<String, Object> result = new HashMap<>();
            result.put("count", results.size());
            result.put("items", formatted);
            return objectMapper.writeValueAsString(result);

        } catch (Exception e) {
            log.error("[KnowledgeSearchTool] 搜索异常", e);
            return "{\"error\": \"知识库搜索失败: " + e.getMessage() + "\"}";
        }
    }
}
