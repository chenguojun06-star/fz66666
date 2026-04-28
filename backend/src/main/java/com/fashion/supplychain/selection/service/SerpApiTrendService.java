package com.fashion.supplychain.selection.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * SerpApi 趋势数据服务
 *
 * <p>功能：
 * <li>fetchTrendScore(keyword) → Google Trends 近3个月热度均值（0-100）</li>
 * <li>fetchMarketImages(keyword) → Google Shopping 同类商品图片 + 市场价（最多8条）</li>
 * <li>searchAcrossSources(keyword, limit) → Google Shopping / Amazon / eBay / Walmart 多源商品聚合</li>
 *
 * <p>缓存：本地 ConcurrentHashMap + 24h TTL，保护 250次/月 免费配额
 *
 * <p>关键词策略：中文关键词自动映射到英文，不使用 geo=CN（全球数据更稳定）
 */
@Service
@Slf4j
public class SerpApiTrendService {

    private static final class MarketSource {
        final String dataSource;
        final String engine;
        final String label;

        private MarketSource(String dataSource, String engine, String label) {
            this.dataSource = dataSource;
            this.engine = engine;
            this.label = label;
        }
    }

    private static final List<MarketSource> MARKET_SOURCES = List.of(
            new MarketSource("GOOGLE_SHOPPING", "google_shopping", "Google Shopping"),
            new MarketSource("AMAZON_SEARCH", "amazon", "Amazon"),
            new MarketSource("EBAY_SEARCH", "ebay", "eBay"),
            new MarketSource("WALMART_SEARCH", "walmart", "Walmart")
    );

    private static final Map<String, MarketSource> MARKET_SOURCE_INDEX = MARKET_SOURCES.stream()
            .collect(Collectors.toMap(source -> source.dataSource, source -> source));

        private static final Map<String, Double> SOURCE_WEIGHT = Map.of(
            "GOOGLE_SHOPPING", 18D,
            "AMAZON_SEARCH", 16D,
            "EBAY_SEARCH", 14D,
            "WALMART_SEARCH", 12D
        );

    /**
     * 中文→英文关键词映射（Google Trends 中文+geo=CN 经常返回空数据，英文全球查询更稳定）
     */
    private static final Map<String, String> ZH_TO_EN = Map.ofEntries(
        Map.entry("牛仔外套", "denim jacket"),
        Map.entry("牛仔裤", "jeans"),
        Map.entry("连衣裙", "dress"),
        Map.entry("卫衣", "hoodie"),
        Map.entry("西装", "blazer suit"),
        Map.entry("T恤", "t-shirt"),
        Map.entry("衬衫", "shirt"),
        Map.entry("羽绒服", "down jacket"),
        Map.entry("风衣", "trench coat"),
        Map.entry("毛衣", "sweater"),
        Map.entry("裤子", "pants"),
        Map.entry("短裙", "mini skirt"),
        Map.entry("半裙", "skirt"),
        Map.entry("棉衣", "cotton coat"),
        Map.entry("夹克", "jacket"),
        Map.entry("外套", "coat"),
        Map.entry("上衣", "top"),
        Map.entry("裙子", "skirt"),
        Map.entry("短裤", "shorts"),
        Map.entry("运动服", "sportswear"),
        Map.entry("睡衣", "pajamas"),
        Map.entry("内衣", "underwear"),
        Map.entry("皮草", "fur coat"),
        Map.entry("皮衣", "leather jacket"),
        Map.entry("冲锋衣", "outdoor jacket")
    );

    @Value("${serpapi.api-key:}")
    private String apiKey;

    @Value("${serpapi.enabled:false}")
    private boolean enabled;

    private static final String BASE_URL = "https://serpapi.com/search.json";
    private static final long CACHE_TTL_MS = 24 * 60 * 60 * 1000L; // 24h

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    // 统一缓存：key → CachedResult（趋势/购物数据共用）
    private final ConcurrentHashMap<String, CachedResult> cache = new ConcurrentHashMap<>();

    // 账户配额耗尽断路器：检测到429+"run out of searches"后静止24小时
    private volatile boolean accountExhausted = false;
    private volatile long accountExhaustedUntil = 0L;

    @PostConstruct
    void init() {
        boolean keyOk = apiKey != null && !apiKey.isEmpty() && !apiKey.startsWith("{{");
        log.info("[SerpApi] 服务初始化 enabled={} keyConfigured={} keyLen={}",
                enabled, keyOk, apiKey == null ? 0 : apiKey.length());
        if (!keyOk && enabled) {
            log.warn("[SerpApi] SERPAPI_ENABLED=true 但 SERPAPI_KEY 未配置或为占位符，已自动置为不可用");
        }
    }

    // ─────────────── Google Trends ───────────────

    /**
     * 获取关键词近3个月 Google Trends 热度均值（0-100）。
     * 缓存 24h，同一关键词不重复消耗配额。
     * 中文关键词自动翻译为英文再查询（Google Trends geo=CN 对中文支持差）。
     *
     * @param keyword 搜索关键词（支持中文，如"牛仔外套"）
     * @return 0-100 热度均值，-1 表示不可用（服务未启用或请求失败）
     */
    public int fetchTrendScore(String keyword) {
        if (!isReady()) {
            log.debug("[SerpApi] 服务未启用，跳过 Trends 查询: {}", keyword);
            return -1;
        }

        // 中文→英文映射：先精确匹配，再尝试包含匹配
        String searchKeyword = translateToEnglish(keyword);

        String cacheKey = "trend:" + searchKeyword;
        CachedResult cached = cache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            log.debug("[SerpApi] 缓存命中 trend={}, score={}", searchKeyword, cached.intValue);
            return cached.intValue;
        }

        try {
            // 不加 geo 参数，使用全球数据（比 geo=CN 稳定得多）
            String url = BASE_URL
                    + "?engine=google_trends"
                    + "&q=" + URLEncoder.encode(searchKeyword, StandardCharsets.UTF_8)
                    + "&date=today+3-m"
                    + "&data_type=TIMESERIES";

            log.debug("[SerpApi] Trends 查询: 原词={} → 搜索词={}", keyword, searchKeyword);

            String body = doGet(url);
            if (body == null) return -1;

            JsonNode root = objectMapper.readTree(body);
            JsonNode timelineData = root.path("interest_over_time").path("timeline_data");

            if (timelineData.isMissingNode() || !timelineData.isArray() || timelineData.isEmpty()) {
                log.warn("[SerpApi] Trends 无数据，关键词: {} (原: {})", searchKeyword, keyword);
                return -1;
            }

            // 计算所有时间点 extracted_value 均值
            int sum = 0, count = 0;
            for (JsonNode point : timelineData) {
                JsonNode values = point.path("values");
                if (values.isArray() && !values.isEmpty()) {
                    int v = values.get(0).path("extracted_value").asInt(-1);
                    if (v >= 0) { sum += v; count++; }
                }
            }

            int score = count > 0 ? Math.min(100, sum / count) : -1;
            log.info("[SerpApi] Trends 原词={} 搜索词={} 数据点={} 热度均值={}", keyword, searchKeyword, count, score);

            if (score >= 0) cache.put(cacheKey, new CachedResult(score));
            return score;

        } catch (Exception e) {
            log.error("[SerpApi] Trends 请求失败 keyword={}", keyword, e);
            return -1;
        }
    }

    // ─────────────── Google Shopping ───────────────

    /**
     * 获取同类款商品图片列表 + 市场参考价（Google Shopping）。
     * 最多返回 8 条有 thumbnail 的结果，缓存 24h。
     *
     * @param keyword 搜索词（如"女式牛仔外套 2026"）
     * @return List[{ title, price, thumbnail, source, rating }]，空列表表示不可用
     */
    public List<Map<String, Object>> fetchMarketImages(String keyword) {
        if (!isReady()) return List.of();

        String cacheKey = "shopping:" + keyword;
        CachedResult cached = cache.get(cacheKey);
        if (cached != null && !cached.isExpired() && cached.shoppingData != null) {
            log.debug("[SerpApi] 缓存命中 shopping={}, 共{}条", keyword, cached.shoppingData.size());
            return cached.shoppingData;
        }

        try {
            // SerpAPI google_shopping 不支持 gl=cn，使用 gl=us 国际市场（关键词已翻译为英文）
            String url = BASE_URL
                    + "?engine=google_shopping"
                    + "&q=" + URLEncoder.encode(keyword, StandardCharsets.UTF_8)
                    + "&gl=us"
                    + "&hl=en"
                    + "&num=10";

            String body = doGet(url);
            if (body == null) return List.of();

            JsonNode root = objectMapper.readTree(body);
            JsonNode results = root.path("shopping_results");

            List<Map<String, Object>> items = new ArrayList<>();
            if (results.isArray()) {
                for (JsonNode item : results) {
                    String thumbnail = item.path("thumbnail").asText("");
                    if (thumbnail.isEmpty()) continue;

                    Map<String, Object> entry = new HashMap<>();
                    entry.put("title",     item.path("title").asText(""));
                    entry.put("price",     item.path("price").asText(""));
                    entry.put("thumbnail", thumbnail);
                    entry.put("source",    item.path("source").asText(""));
                    entry.put("rating",    item.path("rating").asText(""));
                    items.add(entry);
                    if (items.size() >= 8) break;
                }
            }

            log.info("[SerpApi] Shopping keyword={} 获取到 {} 条商品图片", keyword, items.size());
            cache.put(cacheKey, new CachedResult(items));
            return items;

        } catch (Exception e) {
            log.error("[SerpApi] Shopping 请求失败 keyword={}", keyword, e);
            return List.of();
        }
    }

    // ─────────────── Google Shopping 搜索 ───────────────

    /**
     * 搜索 Google Shopping 商品列表（支持自定义关键词和数量）。
     * 返回真实商品：标题、价格、图片、来源、评分等。
     * 缓存 24h。
     */
    public List<Map<String, Object>> searchShopping(String keyword, int limit) {
        return searchBySource("GOOGLE_SHOPPING", keyword, limit);
    }

    public List<Map<String, Object>> searchBySource(String dataSource, String keyword, int limit) {
        MarketSource source = MARKET_SOURCE_INDEX.get(dataSource);
        if (source == null) {
            log.warn("[SerpApi] 未知数据源 dataSource={}", dataSource);
            return List.of();
        }
        return searchSourceInternal(source, keyword, limit);
    }

    public List<Map<String, Object>> searchAcrossSources(String keyword, int limit) {
        if (!isReady() || keyword == null || keyword.isBlank()) return List.of();
        int realLimit = Math.min(Math.max(limit, 1), 40);
        int perSourceLimit = Math.max(2, (int) Math.ceil(realLimit / (double) MARKET_SOURCES.size()));

        List<Map<String, Object>> merged = new ArrayList<>();
        Set<String> seen = new java.util.HashSet<>();
        for (MarketSource source : MARKET_SOURCES) {
            List<Map<String, Object>> items = searchSourceInternal(source, keyword, perSourceLimit);
            for (Map<String, Object> item : items) {
                String dedupeKey = Objects.toString(item.get("link"), "") + "|" + Objects.toString(item.get("title"), "");
                if (seen.add(dedupeKey)) {
                    merged.add(item);
                }
            }
        }

        merged.sort(Comparator
            .comparing((Map<String, Object> item) -> toComparableDouble(item.get("rankScore"))).reversed()
            .thenComparing(item -> toComparableDouble(item.get("rating")), Comparator.reverseOrder())
            .thenComparing(item -> toComparableInteger(item.get("reviews")), Comparator.reverseOrder()));

        if (merged.size() > realLimit) {
            return new ArrayList<>(merged.subList(0, realLimit));
        }
        return merged;
    }

    public List<Map<String, String>> getMarketSourceSummaries() {
        return MARKET_SOURCES.stream().map(source -> {
            Map<String, String> summary = new LinkedHashMap<>();
            summary.put("dataSource", source.dataSource);
            summary.put("label", source.label);
            return summary;
        }).collect(Collectors.toList());
    }

    private List<Map<String, Object>> searchSourceInternal(MarketSource source, String keyword, int limit) {
        if (!isReady() || keyword == null || keyword.isBlank()) return List.of();
        int realLimit = Math.min(Math.max(limit, 1), 40);

        String cacheKey = "search:" + source.dataSource + ":" + keyword.trim() + ":" + realLimit;
        CachedResult cached = cache.get(cacheKey);
        if (cached != null && !cached.isExpired() && cached.shoppingData != null) {
            log.debug("[SerpApi] 缓存命中 source={} keyword={} 共{}条", source.dataSource, keyword, cached.shoppingData.size());
            return cached.shoppingData;
        }

        try {
            String searchKeyword = translateToEnglish(keyword);
            String url = buildSearchUrl(source, searchKeyword, realLimit);
            String body = doGet(url);
            if (body == null) return List.of();

            JsonNode root = objectMapper.readTree(body);
            JsonNode results = extractResultNodes(root, source);

            List<Map<String, Object>> items = new ArrayList<>();
            if (results.isArray()) {
                for (JsonNode node : results) {
                    Map<String, Object> entry = normalizeMarketItem(node, source);
                    if (entry != null) {
                        items.add(entry);
                    }
                    if (items.size() >= realLimit) break;
                }
            }

            log.info("[SerpApi] source={} keyword={} → en={} 获取到 {} 条", source.dataSource, keyword, searchKeyword, items.size());
            cache.put(cacheKey, new CachedResult(items));
            return items;
        } catch (Exception e) {
            log.error("[SerpApi] source={} search失败 keyword={}", source.dataSource, keyword, e);
            return List.of();
        }
    }

    private String buildSearchUrl(MarketSource source, String searchKeyword, int limit) {
        StringBuilder url = new StringBuilder(BASE_URL)
                .append("?engine=").append(source.engine);

        switch (source.engine) {
            case "amazon":
                url.append("&k=").append(URLEncoder.encode(searchKeyword.trim(), StandardCharsets.UTF_8));
                break;
            case "ebay":
                url.append("&_nkw=").append(URLEncoder.encode(searchKeyword.trim(), StandardCharsets.UTF_8));
                break;
            case "walmart":
                url.append("&query=").append(URLEncoder.encode(searchKeyword.trim(), StandardCharsets.UTF_8));
                break;
            default:
                url.append("&q=").append(URLEncoder.encode(searchKeyword.trim(), StandardCharsets.UTF_8));
                break;
        }

        url.append("&num=").append(Math.max(limit, 10));

        if ("google_shopping".equals(source.engine)) {
            // SerpAPI google_shopping 不支持 gl=cn（Unsupported country - gl parameter）
            url.append("&gl=us&hl=en");
        } else {
            url.append("&hl=en");
        }
        return url.toString();
    }

    private JsonNode extractResultNodes(JsonNode root, MarketSource source) {
        if ("google_shopping".equals(source.engine) && root.path("shopping_results").isArray()) {
            return root.path("shopping_results");
        }
        if (root.path("organic_results").isArray()) {
            return root.path("organic_results");
        }
        if (root.path("shopping_results").isArray()) {
            return root.path("shopping_results");
        }
        if (root.path("results").isArray()) {
            return root.path("results");
        }
        if (root.path("items").isArray()) {
            return root.path("items");
        }
        return objectMapper.createArrayNode();
    }

    private Map<String, Object> normalizeMarketItem(JsonNode node, MarketSource source) {
        String title = firstNonBlank(
                node.path("title").asText(""),
                node.path("name").asText(""),
                node.path("product_title").asText(""));
        if (title.isBlank()) {
            return null;
        }

        String thumbnail = firstNonBlank(
                node.path("thumbnail").asText(""),
                node.path("image").asText(""),
                node.path("image_url").asText(""));
        if (thumbnail.isBlank() && node.path("thumbnails").isArray() && !node.path("thumbnails").isEmpty()) {
            thumbnail = node.path("thumbnails").get(0).asText("");
        }

        Double extractedPrice = null;
        if (node.has("extracted_price") && node.get("extracted_price").isNumber()) {
            extractedPrice = node.get("extracted_price").asDouble();
        } else if (node.has("price") && node.get("price").isNumber()) {
            extractedPrice = node.get("price").asDouble();
        }

        String price = firstNonBlank(
                node.path("price").asText(""),
                node.path("price_string").asText(""),
                extractedPrice != null ? String.valueOf(extractedPrice) : "");

        String sourceText = firstNonBlank(node.path("source").asText(""), source.label);
        String link = firstNonBlank(
                node.path("link").asText(""),
                node.path("product_link").asText(""),
                node.path("product_url").asText(""));

        Double rating = null;
        if (node.has("rating") && node.get("rating").isNumber()) {
            rating = node.get("rating").asDouble();
        } else if (node.has("reviews_rating") && node.get("reviews_rating").isNumber()) {
            rating = node.get("reviews_rating").asDouble();
        }

        Integer reviews = null;
        if (node.has("reviews") && node.get("reviews").isNumber()) {
            reviews = node.get("reviews").asInt();
        } else if (node.has("ratings_total") && node.get("ratings_total").isNumber()) {
            reviews = node.get("ratings_total").asInt();
        }

        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("title", title);
        entry.put("price", price);
        entry.put("extractedPrice", extractedPrice);
        entry.put("thumbnail", thumbnail);
        entry.put("source", sourceText);
        entry.put("sourceLabel", source.label);
        entry.put("dataSource", source.dataSource);
        entry.put("link", link);
        entry.put("rating", rating);
        entry.put("reviews", reviews);
        entry.put("delivery", firstNonBlank(node.path("delivery").asText(""), node.path("shipping").asText("")));
        entry.put("rankScore", calculateRankScore(source, extractedPrice, rating, reviews, entry.get("delivery")));
        return entry;
    }

    private double calculateRankScore(MarketSource source, Double extractedPrice, Double rating, Integer reviews, Object delivery) {
        double sourceWeight = SOURCE_WEIGHT.getOrDefault(source.dataSource, 10D);
        double ratingScore = rating != null ? rating * 12D : 0D;
        double reviewScore = reviews != null ? Math.min(18D, Math.log10(reviews + 1D) * 8D) : 0D;
        double priceScore = extractedPrice != null && extractedPrice > 0 ? 6D : 0D;
        double deliveryScore = delivery != null && !delivery.toString().isBlank() ? 3D : 0D;
        return Math.round((sourceWeight + ratingScore + reviewScore + priceScore + deliveryScore) * 10D) / 10D;
    }

    // ─────────────── 工具方法 ───────────────

    /**
     * 将中文关键词翻译为英文（精确匹配 → 包含匹配 → 原词）
     */
    private String translateToEnglish(String keyword) {
        if (keyword == null || keyword.isEmpty()) return keyword;
        // 1. 精确匹配
        String exact = ZH_TO_EN.get(keyword.trim());
        if (exact != null) return exact;
        // 2. 包含匹配（关键词包含词典键）
        for (Map.Entry<String, String> entry : ZH_TO_EN.entrySet()) {
            if (keyword.contains(entry.getKey())) return entry.getValue();
        }
        // 3. 原词（若已是英文等则直接用）
        return keyword;
    }

    public boolean isReady() {
        // 额外过滤：拒绝 CI 未替换的模板占位符 {{SERPAPI_KEY}}
        if (!enabled || apiKey == null || apiKey.isEmpty() || apiKey.startsWith("{{")) return false;
        // 账户配额耗尽时熔断，等待恢复窗口结束
        if (accountExhausted && System.currentTimeMillis() < accountExhaustedUntil) return false;
        if (accountExhausted && System.currentTimeMillis() >= accountExhaustedUntil) {
            accountExhausted = false; // 恢复窗口结束，重置
        }
        return true;
    }

    /** 清空本地缓存（测试/调试用） */
    public void clearCache() {
        cache.clear();
        log.info("[SerpApi] 缓存已清空");
    }

    private Double toComparableDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return -1D;
    }

    private Integer toComparableInteger(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        return -1;
    }

    private String firstNonBlank(String... candidates) {
        for (String candidate : candidates) {
            if (candidate != null && !candidate.isBlank()) {
                return candidate;
            }
        }
        return "";
    }

    private String doGet(String url) {
        // SerpAPI 要求 api_key 作为 URL 查询参数，不支持 Authorization header
        // 修复：统一在 doGet 层拼接 api_key，调用方无需关心
        String fullUrl = url + "&api_key=" + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(fullUrl))
                    .header("Accept", "application/json")
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();
            HttpResponse<String> resp = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 429) {
                String body = resp.body() != null ? resp.body() : "";
                if (body.contains("run out of searches") || body.contains("quota") || body.contains("exhausted")) {
                    accountExhausted = true;
                    accountExhaustedUntil = System.currentTimeMillis() + CACHE_TTL_MS; // 24h 熔断
                    log.warn("[SerpApi] 账户配额已用尽，将暂停服务 24 小时，避免重复触发 429 日志风暴");
                } else {
                    log.warn("[SerpApi] HTTP 429 — {}", body.substring(0, Math.min(200, body.length())));
                }
                return null;
            }
            if (resp.statusCode() != 200) {
                log.warn("[SerpApi] HTTP {} — {}", resp.statusCode(),
                        resp.body().substring(0, Math.min(200, resp.body().length())));
                return null;
            }
            // SerpAPI 在 key 无效/未配置时返回 200 + {"error": "Invalid API key..."}
            // 必须在此处检测并熔断，否则 DailyHotJob 会对每个关键词都打出一次请求日志风暴
            String body = resp.body();
            if (body != null && body.contains("\"error\"")) {
                try {
                    JsonNode errNode = objectMapper.readTree(body).path("error");
                    if (!errNode.isMissingNode()) {
                        String errMsg = errNode.asText();
                        if (errMsg.contains("Invalid API key") || errMsg.contains("api key")) {
                            // Key 无效：直接禁用服务，避免重复调用刷屏
                            enabled = false;
                            log.error("[SerpApi] API Key 无效（{}），已自动禁用服务。请在环境变量中配置正确的 SERPAPI_KEY。", errMsg);
                        } else {
                            log.warn("[SerpApi] SerpAPI 返回错误: {}", errMsg);
                        }
                        return null;
                    }
                } catch (Exception e) {
                    log.warn("[趋势] JSON解析失败: {}", e.getMessage());
                }
            }
            return body;
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("[SerpApi] HTTP GET 失败 url={}", fullUrl.replaceAll("api_key=[^&]+", "api_key=***"), e);
            return null;
        }
    }

    // ─────────────── 内部缓存类 ───────────────

    private static final class CachedResult {
        final int intValue;
        final List<Map<String, Object>> shoppingData;
        final long expireAt;

        CachedResult(int value) {
            this.intValue = value;
            this.shoppingData = null;
            this.expireAt = Instant.now().toEpochMilli() + CACHE_TTL_MS;
        }

        CachedResult(List<Map<String, Object>> data) {
            this.intValue = -1;
            this.shoppingData = data;
            this.expireAt = Instant.now().toEpochMilli() + CACHE_TTL_MS;
        }

        boolean isExpired() {
            return Instant.now().toEpochMilli() > expireAt;
        }
    }
}
