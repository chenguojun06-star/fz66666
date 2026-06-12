package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

@Slf4j
@Component
@Lazy
@AgentToolDef(
    name = "external_search",
    description = "搜索外部互联网信息：行业政策、市场行情、竞品动态、供应链资讯等。当用户问题超出系统内部数据范围时调用。",
    domain = ToolDomain.SYSTEM,
    timeoutMs = 30000,
    readOnly = true
)
@McpToolAnnotation(
    name = "external_search",
    description = "搜索外部互联网信息：行业政策、市场行情、竞品动态、供应链资讯等。当用户问题超出系统内部数据范围时调用。",
    domain = ToolDomain.SYSTEM,
    readOnly = true,
    timeoutSeconds = 30,
    requiresConfirmation = false,
    tags = {"外部搜索", "互联网搜索", "行业政策", "市场行情", "竞品动态", "供应链资讯"}
)
public class ExternalSearchTool extends AbstractAgentTool {

    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Value("${ai.external-search.enabled:true}")
    private boolean searchEnabled;

    @Value("${ai.external-search.base-url:https://api.anysearch.ai}")
    private String searchBaseUrl;

    @Value("${ai.external-search.api-key:}")
    private String apiKey;

    @Value("${ai.external-search.sources:web,news,industry}")
    private String defaultSources;

    @Value("${ai.external-search.max-results:8}")
    private int maxResults;

    private static final Set<String> BLOCKED_DOMAINS = Set.of(
            "internal.corp", "admin.local", "backoffice.internal"
    );

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("query", stringProp("搜索关键词，支持中文和英文。如'2026年服装出口关税政策'、'纺织行业碳排放新规'"));
        properties.put("source", stringProp("搜索来源，可选: web(全网)/news(新闻)/industry(行业垂直)/academic(学术论文)。不填默认全网搜索"));
        properties.put("limit", intProp("返回结果数量，默认5，最大10"));
        properties.put("language", stringProp("结果语言偏好，如 zh/en。不填自动识别"));
        return buildToolDef(
                "外部互联网搜索工具。搜索行业政策、市场行情、竞品动态、供应链最新资讯等外部信息。"
                        + "支持多来源：web（全网搜索）、news（新闻资讯）、industry（行业垂直、含服装纺织专业源）、"
                        + "academic（学术论文/研究报告）。\n"
                        + "调用时机：用户问题涉及外部世界信息（政策法规、市场趋势、行业标准、竞争对手）时必须调用。\n"
                        + "结果标记：返回的每一条结果均附带 source 字段标注来源，供 DataTruthGuard 交叉验证。",
                properties, List.of("query"));
    }

    @Override
    public String getName() {
        return "external_search";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.SYSTEM;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        if (!searchEnabled) {
            return errorJson("外部搜索功能未启用，请联系管理员在配置中开启 ai.external-search.enabled");
        }

        Map<String, Object> args = parseArgs(argumentsJson);
        String query = requireString(args, "query");
        String source = optionalString(args, "source");
        int limit = optionalInt(args, "limit") != null ? Math.min(optionalInt(args, "limit"), maxResults) : 5;
        String language = optionalString(args, "language");

        if (query.length() > 500) {
            return errorJson("搜索关键词过长，请精简至500字以内");
        }

        List<Map<String, Object>> results = executeSearch(query, source, limit, language);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("query", query);
        result.put("source", source != null ? source : defaultSources);
        result.put("totalResults", results.size());
        result.put("results", results);
        result.put("evidence", true);
        result.put("searchTimestamp", System.currentTimeMillis());

        String summary = buildSummary(query, results);
        result.put("summary", summary);

        return MAPPER.writeValueAsString(result);
    }

    private List<Map<String, Object>> executeSearch(String query, String source, int limit, String language) {
        List<Map<String, Object>> results = new ArrayList<>();

        try {
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            String sourceParam = (source != null && !source.isBlank()) ? source : defaultSources;
            String langParam = (language != null && !language.isBlank()) ? language : "auto";

            String url = String.format("%s/v1/search?q=%s&source=%s&limit=%d&lang=%s",
                    searchBaseUrl, encodedQuery, sourceParam, limit, langParam);

            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(25))
                    .header("Accept", "application/json")
                    .header("User-Agent", "XiaoYunHermes/4.1");

            if (apiKey != null && !apiKey.isBlank()) {
                requestBuilder.header("Authorization", "Bearer " + apiKey);
            }

            HttpRequest request = requestBuilder.GET().build();
            HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                Map<String, Object> body = MAPPER.readValue(response.body(), new TypeReference<>() {});
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> rawResults = (List<Map<String, Object>>) body.getOrDefault("results", List.of());
                results = filterAndNormalize(rawResults);
                log.info("[ExternalSearch] query='{}' → {} results from {}", query, results.size(), sourceParam);
            } else if (response.statusCode() == 429) {
                log.warn("[ExternalSearch] 速率限制，query='{}'", query);
                results.add(rateLimitFallback(query));
            } else {
                log.warn("[ExternalSearch] HTTP {} for query='{}'", response.statusCode(), query);
                results.add(serviceUnavailableFallback(query));
            }
        } catch (Exception e) {
            log.error("[ExternalSearch] 搜索异常 query='{}': {}", query, e.getMessage());
            results.add(serviceUnavailableFallback(query));
        }

        return results;
    }

    private List<Map<String, Object>> filterAndNormalize(List<Map<String, Object>> raw) {
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> item : raw) {
            String itemUrl = item.getOrDefault("url", "").toString();
            boolean blocked = BLOCKED_DOMAINS.stream().anyMatch(itemUrl::contains);
            if (blocked) continue;

            Map<String, Object> normalized = new LinkedHashMap<>();
            normalized.put("title", item.getOrDefault("title", "无标题"));
            normalized.put("url", itemUrl);
            normalized.put("snippet", item.getOrDefault("snippet", item.getOrDefault("content", "")));
            normalized.put("source", item.getOrDefault("source", "web"));
            normalized.put("date", item.getOrDefault("date", item.getOrDefault("published", "")));
            normalized.put("relevance", item.getOrDefault("relevance", item.getOrDefault("score", 0.0)));
            filtered.add(normalized);
        }
        return filtered;
    }

    private Map<String, Object> rateLimitFallback(String query) {
        Map<String, Object> fallback = new LinkedHashMap<>();
        fallback.put("title", "搜索频率限制");
        fallback.put("snippet", "外部搜索请求过于频繁，请稍后重试。建议：1) 精简搜索关键词 2) 等待30秒后重试 3) 先尝试内部知识库搜索");
        fallback.put("source", "system");
        fallback.put("query", query);
        return fallback;
    }

    private Map<String, Object> serviceUnavailableFallback(String query) {
        Map<String, Object> fallback = new LinkedHashMap<>();
        fallback.put("title", "外部搜索服务暂不可用");
        fallback.put("snippet", "外部搜索引擎当前不可用，可能原因：网络波动、服务升级中。建议先使用系统内部工具查询相关数据");
        fallback.put("source", "system");
        fallback.put("query", query);
        return fallback;
    }

    private String buildSummary(String query, List<Map<String, Object>> results) {
        if (results.isEmpty()) {
            return "未找到与 '" + query + "' 相关的外部信息";
        }
        long systemResults = results.stream()
                .filter(r -> "system".equals(r.get("source")))
                .count();
        if (systemResults == results.size()) {
            return "外部搜索暂不可用";
        }
        return "关于 '" + query + "' 共找到 " + results.size() + " 条外部信息";
    }
}