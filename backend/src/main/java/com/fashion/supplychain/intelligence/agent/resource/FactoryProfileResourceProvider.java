package com.fashion.supplychain.intelligence.agent.resource;

import com.fashion.supplychain.intelligence.service.FactoryProfileLearningService;
import com.fashion.supplychain.intelligence.service.McpProtocolService.McpResource;
import com.fashion.supplychain.intelligence.service.McpProtocolService.McpResourceReadResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * FactoryProfile MCP Resource Provider — 暴露工厂画像为 MCP resources。
 *
 * <p>URI 格式：{@code factory://profile}
 *
 * <p>多租户隔离：复用 {@link FactoryProfileLearningService#buildFactoryProfileContext} 的 tenant_id 过滤。
 */
@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class FactoryProfileResourceProvider implements McpResourceProvider {

    private static final String URI_PREFIX = "factory://";
    private static final String PROFILE_URI = "factory://profile";
    private static final String MIME_TYPE = "text/markdown";

    private final FactoryProfileLearningService factoryProfileLearningService;

    @Override
    public boolean supports(String uri) {
        return uri != null && uri.startsWith(URI_PREFIX);
    }

    /** ATBA：工厂画像读取为查询类，5s 预算 */
    @Override
    public String toolType() {
        return McpTimeoutBudget.QUERY;
    }

    @Override
    public List<McpResource> listResources(Long tenantId) {
        McpResource r = new McpResource();
        r.setUri(PROFILE_URI);
        r.setName("factory-profile");
        // 安全修复：sanitize description 防 prompt injection
        r.setDescription(McpResourceSanitizer.sanitizeDescription("工厂画像：产能、绩效、专长、历史交付表现"));
        r.setMimeType(MIME_TYPE);
        return List.of(r);
    }

    @Override
    public McpResourceReadResult readResource(String uri, Long tenantId) {
        McpResourceReadResult result = new McpResourceReadResult();
        try {
            if (!PROFILE_URI.equals(uri)) {
                result.setError(McpToolError.notFound(uri));
                result.setContents(List.of(Map.of(
                        "uri", uri,
                        "mimeType", "text/plain",
                        "text", "未知工厂画像 URI：" + uri + "（仅支持 factory://profile）"
                )));
                return result;
            }

            String content = factoryProfileLearningService.buildFactoryProfileContext(tenantId, null);
            result.setContents(List.of(Map.of(
                    "uri", uri,
                    "mimeType", MIME_TYPE,
                    "text", content != null ? content : "暂无工厂画像数据"
            )));
        } catch (Exception e) {
            log.warn("[FactoryProfileResource] read 失败 uri={} tenant={} err={}", uri, tenantId, e.getMessage());
            result.setError(McpToolError.internal(e.getMessage()));
            result.setContents(List.of(Map.of(
                    "uri", uri,
                    "mimeType", "text/plain",
                    "text", "读取失败：" + e.getMessage()
            )));
        }
        return result;
    }
}
