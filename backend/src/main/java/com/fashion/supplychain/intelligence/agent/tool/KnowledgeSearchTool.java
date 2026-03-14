package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.service.KnowledgeBaseService;
import com.fashion.supplychain.intelligence.service.QdrantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * RAG知识库检索工具 — 回答行业术语、系统操作、业务FAQ等问题
 * Skill分类：问答/知识库类 Skill
 */
@Slf4j
@Component
public class KnowledgeSearchTool implements AgentTool {

    @Autowired
    private KnowledgeBaseService knowledgeBaseService;

    /** 向量检索引擎 — Qdrant不可用时自动降级为纯SQL检索 */
    @Autowired(required = false)
    private QdrantService qdrantService;

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

            // ── STEP 1: Qdrant语义检索（向量引擎可用时优先）──
            List<String> semanticHitIds = new ArrayList<>();
            boolean qdrantEnabled = qdrantService != null && qdrantService.isAvailable();
            if (qdrantEnabled) {
                try {
                    List<QdrantService.ScoredPoint> hits = qdrantService.search(tenantId, query, 6);
                    for (QdrantService.ScoredPoint hit : hits) {
                        String pid = hit.getPointId();
                        if (pid != null && pid.startsWith("kb_")) {
                            semanticHitIds.add(pid.substring(3)); // 去掉"kb_"前缀得到UUID
                        }
                    }
                    if (!semanticHitIds.isEmpty()) {
                        log.debug("[KnowledgeSearch] Qdrant语义命中 {} 条", semanticHitIds.size());
                    }
                } catch (Exception e) {
                    log.debug("[KnowledgeSearch] Qdrant语义检索跳过: {}", e.getMessage());
                }
            }

            // ── STEP 2: MySQL全文搜索（回退 + 补充语义结果）──
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
            if (!category.isEmpty()) qw.eq("category", category);
            qw.orderByAsc("category").last("LIMIT 5");
            List<KnowledgeBase> sqlResults = knowledgeBaseService.list(qw);

            // ── STEP 3: 语义命中的KB条目（按UUID in查询）──
            List<KnowledgeBase> semanticKbList = new ArrayList<>();
            if (!semanticHitIds.isEmpty()) {
                QueryWrapper<KnowledgeBase> semanticQw = new QueryWrapper<KnowledgeBase>()
                        .eq("delete_flag", 0)
                        .in("id", semanticHitIds)
                        .and(w -> w.isNull("tenant_id").or().eq(tenantId != null, "tenant_id", tenantId));
                semanticKbList = knowledgeBaseService.list(semanticQw);
            }

            // ── STEP 4: 合并（语义结果优先），去重，最多5条 ──
            List<KnowledgeBase> finalList = new ArrayList<>(semanticKbList);
            Set<String> seenIds = finalList.stream().map(KnowledgeBase::getId).collect(Collectors.toSet());
            for (KnowledgeBase kb : sqlResults) {
                if (!seenIds.contains(kb.getId())) finalList.add(kb);
            }
            if (finalList.size() > 5) finalList = finalList.subList(0, 5);

            if (finalList.isEmpty()) {
                return "{\"message\": \"知识库中未找到关于 '" + query + "' 的相关内容。\"}";
            }

            // ── STEP 5: 异步将SQL结果索引到Qdrant（渐进式自建知识向量库）──
            if (qdrantEnabled && !sqlResults.isEmpty()) {
                for (KnowledgeBase kb : sqlResults) {
                    try {
                        Long kbTenantId = kb.getTenantId() != null ? kb.getTenantId()
                                : (tenantId != null ? tenantId : 0L);
                        String kbContent = kb.getTitle() + "\n"
                                + (kb.getKeywords() != null ? kb.getKeywords() + "\n" : "")
                                + kb.getContent();
                        qdrantService.upsertVector("kb_" + kb.getId(), kbTenantId, kbContent,
                                Map.of("type", "kb", "category",
                                        kb.getCategory() != null ? kb.getCategory() : "general"));
                    } catch (Exception ignored) {} // 非关键路径，失败不影响主流程
                }
            }

            // ── STEP 6: 格式化返回 ──
            List<Map<String, Object>> formatted = new ArrayList<>();
            for (KnowledgeBase kb : finalList) {
                Map<String, Object> item = new HashMap<>();
                item.put("title", kb.getTitle());
                item.put("category", kb.getCategory());
                item.put("content", kb.getContent());
                formatted.add(item);
                try {
                    KnowledgeBase update = new KnowledgeBase();
                    update.setId(kb.getId());
                    update.setViewCount(kb.getViewCount() == null ? 1 : kb.getViewCount() + 1);
                    knowledgeBaseService.updateById(update);
                } catch (Exception ignored) {}
            }

            Map<String, Object> result = new HashMap<>();
            result.put("count", finalList.size());
            result.put("items", formatted);
            result.put("semantic", !semanticKbList.isEmpty()); // 告知LLM本次是否为语义检索
            return objectMapper.writeValueAsString(result);

        } catch (Exception e) {
            log.error("[KnowledgeSearchTool] 搜索异常", e);
            return "{\"error\": \"知识库搜索失败: " + e.getMessage() + "\"}";
        }
    }
}
