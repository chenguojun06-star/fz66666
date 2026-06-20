package com.fashion.supplychain.intelligence.agent.resource;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.service.KnowledgeBaseService;
import com.fashion.supplychain.intelligence.service.McpProtocolService.McpResource;
import com.fashion.supplychain.intelligence.service.McpProtocolService.McpResourceReadResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * KnowledgeBase MCP Resource Provider — 暴露知识库条目为 MCP resources。
 *
 * <p>URI 格式：
 * <ul>
 *   <li>{@code knowledge://list} — 列出所有知识条目（元数据）</li>
 *   <li>{@code knowledge://{id}} — 读取单条知识全文</li>
 * </ul>
 *
 * <p>多租户隔离：查询带 {@code tenant_id = ? OR tenant_id IS NULL}（含公共知识）。
 */
@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class KnowledgeBaseResourceProvider implements McpResourceProvider {

    private static final String URI_PREFIX = "knowledge://";
    private static final String LIST_KEY = "list";
    private static final String MIME_TYPE = "text/markdown";
    private static final int MAX_LIST_RESOURCES = 100;

    private final KnowledgeBaseService knowledgeBaseService;

    @Override
    public boolean supports(String uri) {
        return uri != null && uri.startsWith(URI_PREFIX);
    }

    /** ATBA：知识库读取为查询类，5s 预算 */
    @Override
    public String toolType() {
        return McpTimeoutBudget.QUERY;
    }

    @Override
    public List<McpResource> listResources(Long tenantId) {
        List<McpResource> resources = new ArrayList<>();
        try {
            List<KnowledgeBase> entries = queryEntries(tenantId, MAX_LIST_RESOURCES);
            for (KnowledgeBase kb : entries) {
                McpResource r = new McpResource();
                r.setUri(URI_PREFIX + kb.getId());
                r.setName(kb.getTitle() != null ? kb.getTitle() : kb.getId());
                // 安全修复：sanitize description 防 prompt injection
                r.setDescription(McpResourceSanitizer.sanitizeDescription(buildDescription(kb)));
                r.setMimeType(MIME_TYPE);
                resources.add(r);
            }
        } catch (Exception e) {
            log.warn("[KnowledgeBaseResource] list 失败 tenant={} err={}", tenantId, e.getMessage());
        }
        return resources;
    }

    @Override
    public McpResourceReadResult readResource(String uri, Long tenantId) {
        McpResourceReadResult result = new McpResourceReadResult();
        try {
            String key = uri.substring(URI_PREFIX.length());

            if (LIST_KEY.equalsIgnoreCase(key)) {
                // knowledge://list 返回所有条目的摘要
                List<KnowledgeBase> entries = queryEntries(tenantId, MAX_LIST_RESOURCES);
                StringBuilder sb = new StringBuilder("# 知识库条目列表\n\n");
                for (KnowledgeBase kb : entries) {
                    sb.append("- **").append(kb.getTitle()).append("** (")
                            .append(kb.getCategory()).append(") — `")
                            .append(URI_PREFIX).append(kb.getId()).append("`\n");
                }
                result.setContents(List.of(Map.of(
                        "uri", uri,
                        "mimeType", MIME_TYPE,
                        "text", sb.toString()
                )));
                return result;
            }

            // knowledge://{id} 返回单条知识全文
            KnowledgeBase kb = knowledgeBaseService.getById(key);
            if (kb == null || !belongsToTenant(kb, tenantId)) {
                // 跨租户访问或资源不存在 → SERF 结构化错误
                result.setError(kb == null
                        ? McpToolError.notFound(uri)
                        : McpToolError.tenantMismatch());
                result.setContents(List.of(Map.of(
                        "uri", uri,
                        "mimeType", "text/plain",
                        "text", "知识条目不存在或无权访问：" + key
                )));
                return result;
            }

            StringBuilder content = new StringBuilder();
            content.append("# ").append(kb.getTitle()).append("\n\n");
            content.append("**分类**：").append(kb.getCategory()).append("\n");
            if (kb.getKeywords() != null && !kb.getKeywords().isBlank()) {
                content.append("**关键词**：").append(kb.getKeywords()).append("\n");
            }
            if (kb.getSource() != null && !kb.getSource().isBlank()) {
                content.append("**来源**：").append(kb.getSource()).append("\n");
            }
            content.append("\n---\n\n").append(kb.getContent());

            result.setContents(List.of(Map.of(
                    "uri", uri,
                    "mimeType", MIME_TYPE,
                    "text", content.toString()
            )));
        } catch (Exception e) {
            log.warn("[KnowledgeBaseResource] read 失败 uri={} tenant={} err={}", uri, tenantId, e.getMessage());
            result.setError(McpToolError.internal(e.getMessage()));
            result.setContents(List.of(Map.of(
                    "uri", uri,
                    "mimeType", "text/plain",
                    "text", "读取失败：" + e.getMessage()
            )));
        }
        return result;
    }

    private List<KnowledgeBase> queryEntries(Long tenantId, int limit) {
        return knowledgeBaseService.list(new LambdaQueryWrapper<KnowledgeBase>()
                .eq(KnowledgeBase::getDeleteFlag, 0)
                .and(w -> w.eq(KnowledgeBase::getTenantId, tenantId)
                        .or().isNull(KnowledgeBase::getTenantId))
                .orderByDesc(KnowledgeBase::getUpdateTime)
                .last("LIMIT " + limit));
    }

    private boolean belongsToTenant(KnowledgeBase kb, Long tenantId) {
        // tenant_id 为 null 表示公共知识，所有租户可读
        return kb.getTenantId() == null || kb.getTenantId().equals(tenantId);
    }

    private String buildDescription(KnowledgeBase kb) {
        String cat = kb.getCategory() != null ? kb.getCategory() : "unknown";
        String title = kb.getTitle() != null ? kb.getTitle() : "";
        return "[" + cat + "] " + title;
    }
}
