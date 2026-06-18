package com.fashion.supplychain.intelligence.agent.resource;

import com.fashion.supplychain.intelligence.service.MemoryBankService;
import com.fashion.supplychain.intelligence.service.MemoryBankService.Category;
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
 * MemoryBank MCP Resource Provider — 暴露 5 类项目记忆为 MCP resources。
 *
 * <p>URI 格式：{@code memory://{category-key}}
 * <ul>
 *   <li>{@code memory://product-context} — 项目全景</li>
 *   <li>{@code memory://active-context} — 当前会话快照</li>
 *   <li>{@code memory://system-patterns} — 编码/架构模式</li>
 *   <li>{@code memory://decision-log} — 决策记录</li>
 *   <li>{@code memory://progress} — 任务看板</li>
 * </ul>
 *
 * <p>多租户隔离：复用 {@link MemoryBankService#read(Long, Category)} 的 tenant_id 过滤。
 */
@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class MemoryBankResourceProvider implements McpResourceProvider {

    private static final String URI_PREFIX = "memory://";
    private static final String MIME_TYPE = "text/markdown";

    private final MemoryBankService memoryBankService;

    @Override
    public boolean supports(String uri) {
        return uri != null && uri.startsWith(URI_PREFIX);
    }

    @Override
    public List<McpResource> listResources(Long tenantId) {
        List<McpResource> resources = new ArrayList<>();
        for (Category cat : Category.values()) {
            McpResource r = new McpResource();
            r.setUri(URI_PREFIX + cat.getKey());
            r.setName(cat.getKey());
            r.setDescription(cat.getDescription());
            r.setMimeType(MIME_TYPE);
            resources.add(r);
        }
        return resources;
    }

    @Override
    public McpResourceReadResult readResource(String uri, Long tenantId) {
        McpResourceReadResult result = new McpResourceReadResult();
        try {
            String categoryKey = uri.substring(URI_PREFIX.length());
            Category cat = parseCategory(categoryKey);
            if (cat == null) {
                result.setContents(List.of(Map.of(
                        "uri", uri,
                        "mimeType", "text/plain",
                        "text", "未知记忆类别：" + categoryKey
                )));
                return result;
            }

            String content = memoryBankService.read(tenantId, cat);
            result.setContents(List.of(Map.of(
                    "uri", uri,
                    "mimeType", MIME_TYPE,
                    "text", content != null ? content : ""
            )));
        } catch (Exception e) {
            log.warn("[MemoryBankResource] 读取失败 uri={} tenant={} err={}", uri, tenantId, e.getMessage());
            result.setContents(List.of(Map.of(
                    "uri", uri,
                    "mimeType", "text/plain",
                    "text", "读取失败：" + e.getMessage()
            )));
        }
        return result;
    }

    private Category parseCategory(String key) {
        for (Category cat : Category.values()) {
            if (cat.getKey().equals(key)) return cat;
        }
        return null;
    }
}
