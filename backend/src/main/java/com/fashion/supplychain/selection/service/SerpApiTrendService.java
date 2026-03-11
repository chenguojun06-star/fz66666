package com.fashion.supplychain.selection.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SerpApi 趋势数据服务
 *
 * <p>功能：
 * <li>fetchTrendScore(keyword) → Google Trends 近3个月热度均值（0-100）</li>
 * <li>fetchMarketImages(keyword) → Google Shopping 同类商品图片 + 市场价（最多8条）</li>
 *
 * <p>缓存：本地 ConcurrentHashMap + 24h TTL，保护 250次/月 免费配额
 */
@Service
@Slf4j
public class SerpApiTrendService {

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

    // ─────────────── Google Trends ───────────────

    /**
     * 获取关键词近3个月 Google Trends 热度均值（0-100）。
     * 缓存 24h，同一关键词不重复消耗配额。
     *
     * @param keyword 搜索关键词（建议中文+品类，如"牛仔外套"）
     * @return 0-100 热度均值，-1 表示不可用（服务未启用或请求失败）
     */
    public int fetchTrendScore(String keyword) {
        if (!isReady()) {
            log.debug("[SerpApi] 服务未启用，跳过 Trends 查询: {}", keyword);
            return -1;
        }

        String cacheKey = "trend:" + keyword;
        CachedResult cached = cache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            log.debug("[SerpApi] 缓存命中 trend={}, score={}", keyword, cached.intValue);
            return cached.intValue;
        }

        try {
            String url = BASE_URL
                    + "?engine=google_trends"
                    + "&q=" + URLEncoder.encode(keyword, StandardCharsets.UTF_8)
                    + "&geo=CN"
                    + "&hl=zh-CN"
                    + "&date=today+3-m"
                    + "&data_type=TIMESERIES"
                    + "&api_key=" + apiKey;

            String body = doGet(url);
            if (body == null) return -1;

            JsonNode root = objectMapper.readTree(body);
            JsonNode timelineData = root.path("interest_over_time").path("timeline_data");

            if (timelineData.isMissingNode() || !timelineData.isArray() || timelineData.isEmpty()) {
                log.warn("[SerpApi] Trends 无数据，关键词: {}", keyword);
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
            log.info("[SerpApi] Trends keyword={} 数据点={} 热度均值={}", keyword, count, score);

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
            String url = BASE_URL
                    + "?engine=google_shopping"
                    + "&q=" + URLEncoder.encode(keyword, StandardCharsets.UTF_8)
                    + "&gl=cn"
                    + "&hl=zh-cn"
                    + "&num=10"
                    + "&api_key=" + apiKey;

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

    // ─────────────── 工具方法 ───────────────

    public boolean isReady() {
        return enabled && apiKey != null && !apiKey.isEmpty();
    }

    /** 清空本地缓存（测试/调试用） */
    public void clearCache() {
        cache.clear();
        log.info("[SerpApi] 缓存已清空");
    }

    private String doGet(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Accept", "application/json")
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();
            HttpResponse<String> resp = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.warn("[SerpApi] HTTP {} — {}", resp.statusCode(),
                        resp.body().substring(0, Math.min(200, resp.body().length())));
                return null;
            }
            return resp.body();
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("[SerpApi] HTTP GET 失败 url={}", url.replaceAll("api_key=[^&]+", "api_key=***"), e);
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
