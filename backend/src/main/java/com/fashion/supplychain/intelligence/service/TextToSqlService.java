package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.util.*;
import java.util.concurrent.*;
import jakarta.annotation.PreDestroy;

@Service
@Lazy
@Slf4j
public class TextToSqlService {

    @Autowired(required = false)
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private SchemaVectorManager schemaVectorManager;

    @Autowired
    private SqlSecurityValidator sqlSecurityValidator;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final int MAX_TABLES_FOR_CONTEXT = 6;
    private static final int DISPLAY_ROWS = 50;
    private static final int CACHE_TTL_MINUTES = 5;
    private static final int CACHE_MAX_SIZE = 200;
    private static final int RATE_LIMIT_PER_MINUTE = 10; // 每个租户每分钟最多10次查询

    /** 限流计数: tenantId → [上次重置时间, 当前计数] */
    private final Map<Long, long[]> rateLimitMap = new ConcurrentHashMap<>();

    /** 查询结果缓存: cacheKey → cached response（5分钟TTL，避免重复LLM调用） */
    private final Map<String, CacheEntry> queryCache = new ConcurrentHashMap<>();

    /** 共享线程池（避免每次查询创建新ExecutorService） */
    private final ExecutorService queryExecutor = Executors.newFixedThreadPool(
            4, r -> {
                Thread t = new Thread(r, "text-to-sql-worker");
                t.setDaemon(true);
                return t;
            });

    private static class CacheEntry {
        final NlQueryResponse response;
        final long createdAt;
        CacheEntry(NlQueryResponse response) {
            this.response = response;
            this.createdAt = System.currentTimeMillis();
        }
        boolean isExpired() {
            return System.currentTimeMillis() - createdAt > CACHE_TTL_MINUTES * 60_000L;
        }
    }

    @PreDestroy
    public void destroy() {
        queryExecutor.shutdownNow();
    }

    /** 归一化缓存 key：去除标点和多余空格，小写化 */
    private String normalizeForCache(String question) {
        if (question == null) return "";
        return question.replaceAll("[\\p{Punct}\\s]+", "").toLowerCase();
    }

    /** 检查限流：每租户每分钟最多 RATE_LIMIT_PER_MINUTE 次 */
    private boolean checkRateLimit(Long tenantId) {
        long now = System.currentTimeMillis();
        long[] counter = rateLimitMap.computeIfAbsent(tenantId, k -> new long[]{now, 0});
        synchronized (counter) {
            // 1分钟窗口已过，重置计数
            if (now - counter[0] > 60_000L) {
                counter[0] = now;
                counter[1] = 0;
            }
            if (counter[1] >= RATE_LIMIT_PER_MINUTE) {
                return false;
            }
            counter[1]++;
            return true;
        }
    }

    public NlQueryResponse query(String question, Long tenantId) {
        NlQueryResponse response = new NlQueryResponse();

        // ── 限流检查：每个租户每分钟最多10次查询（防止恶意调用拖垮LLM/DB） ──
        if (tenantId != null && !checkRateLimit(tenantId)) {
            response.setIntent("text_to_sql_rate_limited");
            response.setConfidence(0);
            response.setAnswer("查询频率过高，请稍后再试（每分钟最多 " + RATE_LIMIT_PER_MINUTE + " 次查询）。");
            return response;
        }

        if (aiAdvisorService == null || !aiAdvisorService.isEnabled()) {
            response.setIntent("text_to_sql_disabled");
            response.setConfidence(0);
            response.setAnswer("AI未配置，暂不支持自然语言查询所有数据。请使用现有的查询功能。");
            return response;
        }

        // ── 缓存命中检查（5分钟内相同问题直接返回，跳过LLM调用） ──
        // 归一化缓存 key：去除标点、空格归一化、按中文分词排序
        String cacheKey = tenantId + ":" + normalizeForCache(question);
        CacheEntry cached = queryCache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            log.info("[TextToSql] 缓存命中: {}", question);
            NlQueryResponse cachedResp = cached.response;
            // 深拷贝避免修改共享对象
            NlQueryResponse copy = new NlQueryResponse();
            copy.setIntent(cachedResp.getIntent());
            copy.setConfidence(cachedResp.getConfidence());
            copy.setAnswer(cachedResp.getAnswer() + "\n\n（缓存结果，5分钟内有效）");
            if (cachedResp.getData() != null) {
                copy.setData(new LinkedHashMap<>(cachedResp.getData()));
            }
            return copy;
        }
        if (cached != null && cached.isExpired()) {
            queryCache.remove(cacheKey);
        }
        // 清理过期缓存
        if (queryCache.size() > CACHE_MAX_SIZE) {
            queryCache.entrySet().removeIf(e -> e.getValue().isExpired());
        }

        if (!aiAdvisorService.checkAndConsumeQuota(tenantId)) {
            response.setIntent("quota_exceeded");
            response.setConfidence(0);
            response.setAnswer("今日AI查询配额已用完，请明天再试。");
            return response;
        }

        long startTime = System.currentTimeMillis();

        try {
            String schemaContext = schemaVectorManager.buildSchemaContext(question, MAX_TABLES_FOR_CONTEXT);

            String systemPrompt = buildSystemPrompt(schemaContext, tenantId);

            String aiResponse = aiAdvisorService.chat(systemPrompt, question);

            if (aiResponse == null || aiResponse.isBlank()) {
                response.setIntent("text_to_sql_failed");
                response.setConfidence(0);
                response.setAnswer("AI生成查询失败，请换一种问法试试。");
                return response;
            }

            String sql = extractSql(aiResponse);

            if (sql == null || sql.isEmpty()) {
                response.setIntent("text_to_sql_no_sql");
                response.setConfidence(30);
                response.setAnswer("抱歉，我暂时无法理解这个问题。请尝试用更具体的方式描述，例如：\n"
                        + "• \"查询最近7天的产量统计\"\n"
                        + "• \"查看PO202606010001订单的进度\"\n"
                        + "• \"哪些订单逾期了\"");
                return response;
            }

            SqlSecurityValidator.ValidationResult validation = sqlSecurityValidator.validate(sql, tenantId);
            if (!validation.isValid()) {
                response.setIntent("text_to_sql_security_blocked");
                response.setConfidence(0);
                response.setAnswer("查询被安全拦截：" + validation.getErrorMessage());
                return response;
            }

            String validatedSql = validation.getValidatedSql();
            log.info("[TextToSql] 执行SQL: {}", validatedSql);

            List<Map<String, Object>> resultData = executeQueryWithTimeout(
                    validatedSql,
                    sqlSecurityValidator.getQueryTimeoutSeconds()
            );

            long elapsed = System.currentTimeMillis() - startTime;
            log.info("[TextToSql] 查询完成，耗时={}ms，行数={}", elapsed, resultData.size());

            response.setIntent("text_to_sql_success");
            response.setConfidence(85);

            // ── 限制返回数据量：只返回前50行用于展示 + 汇总统计 ──
            Map<String, Object> responseData = new LinkedHashMap<>();
            responseData.put("sql", validatedSql);
            responseData.put("rowCount", resultData.size());
            responseData.put("displayRows", Math.min(resultData.size(), DISPLAY_ROWS));
            responseData.put("rows", resultData.subList(0, Math.min(resultData.size(), DISPLAY_ROWS)));
            if (resultData.size() > DISPLAY_ROWS) {
                responseData.put("truncated", true);
                responseData.put("totalRows", resultData.size());
            }
            response.setData(responseData);

            String naturalAnswer = formatNaturalAnswer(question, resultData);
            response.setAnswer(naturalAnswer);

            if (resultData.size() >= sqlSecurityValidator.getMaxRows()) {
                response.setAnswer(response.getAnswer()
                        + "\n\n⚠️ 注意：结果已达上限 " + sqlSecurityValidator.getMaxRows() + " 条，可能还有更多数据。");
            }

            // ── 写入缓存 ──
            if (response.getConfidence() > 50) {
                queryCache.put(cacheKey, new CacheEntry(response));
            }

        } catch (Exception e) {
            log.error("[TextToSql] 查询失败: {}", e.getMessage(), e);
            response.setIntent("text_to_sql_error");
            response.setConfidence(0);
            response.setAnswer("查询执行失败：" + e.getMessage() + "。请换一种问法试试。");
        }

        return response;
    }

    private String buildSystemPrompt(String schemaContext, Long tenantId) {
        return "你是一个专业的服装供应链数据库查询助手。将用户的自然语言问题转换为MySQL SELECT语句。\n\n"
                + "【重要规则】\n"
                + "1. 只生成SELECT语句，绝对不生成INSERT/UPDATE/DELETE/DROP/ALTER等修改语句\n"
                + "2. 不要查询password、secret、token、api_key等敏感字段\n"
                + "3. 所有业务表都有tenant_id字段，系统会自动添加租户过滤，你不需要手动写tenant_id条件\n"
                + "4. 查询结果最多返回500行，系统会自动添加LIMIT，你不需要手动写LIMIT\n"
                + "5. 只查询相关的表，不要JOIN无关表，JOIN不要超过3张表\n"
                + "6. 【重要】每张表必须使用别名，例如 FROM t_production_order po, JOIN t_scan_record sr ON po.id = sr.order_id\n"
                + "7. 禁止使用 SELECT *，必须明确列出需要的字段\n"
                + "8. 日期字段使用标准比较，时间范围要合理（默认查最近30天）\n"
                + "9. 如果问题模糊或有歧义，优先返回最常见、最有用的数据\n"
                + "10. 对于大表查询，优先使用聚合函数(COUNT/SUM/AVG)而非返回明细行\n\n"
                + "【数据库表结构参考】\n"
                + schemaContext + "\n"
                + "【输出格式】\n"
                + "将SQL包裹在```sql```代码块中。可以附带1-2句中文解释，但SQL必须在代码块内。\n\n"
                + "示例：\n"
                + "查询最近30天的生产订单数量\n"
                + "```sql\n"
                + "SELECT COUNT(*) as order_count, DATE(po.create_time) as order_date\n"
                + "FROM t_production_order po\n"
                + "WHERE po.create_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)\n"
                + "GROUP BY DATE(po.create_time)\n"
                + "ORDER BY order_date DESC\n"
                + "```";
    }

    private String extractSql(String aiResponse) {
        if (aiResponse == null) return null;

        int codeStart = aiResponse.indexOf("```sql");
        if (codeStart >= 0) {
            int start = codeStart + 6;
            int codeEnd = aiResponse.indexOf("```", start);
            if (codeEnd > start) {
                return aiResponse.substring(start, codeEnd).trim();
            }
        }

        int genericCodeStart = aiResponse.indexOf("```");
        if (genericCodeStart >= 0) {
            int start = genericCodeStart + 3;
            int codeEnd = aiResponse.indexOf("```", start);
            if (codeEnd > start) {
                String code = aiResponse.substring(start, codeEnd).trim();
                if (code.toUpperCase().startsWith("SELECT")) {
                    return code;
                }
            }
        }

        String[] lines = aiResponse.split("\n");
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.toUpperCase().startsWith("SELECT") && trimmed.contains("FROM")) {
                return trimmed;
            }
        }

        return null;
    }

    private List<Map<String, Object>> executeQueryWithTimeout(String sql, int timeoutSeconds) throws Exception {
        Callable<List<Map<String, Object>>> task = new Callable<List<Map<String, Object>>>() {
            @Override
            public List<Map<String, Object>> call() throws Exception {
                return jdbcTemplate.query(sql, new ResultSetExtractor<List<Map<String, Object>>>() {
                    @Override
                    public List<Map<String, Object>> extractData(ResultSet rs) throws java.sql.SQLException {
                        List<Map<String, Object>> result = new ArrayList<>();
                        ResultSetMetaData metaData = rs.getMetaData();
                        int columnCount = metaData.getColumnCount();
                        while (rs.next()) {
                            Map<String, Object> row = new LinkedHashMap<>();
                            for (int i = 1; i <= columnCount; i++) {
                                String colName = metaData.getColumnLabel(i);
                                Object value = rs.getObject(i);
                                if (value instanceof java.sql.Timestamp) {
                                    value = value.toString();
                                } else if (value instanceof java.sql.Date) {
                                    value = value.toString();
                                } else if (value instanceof java.math.BigDecimal) {
                                    value = ((java.math.BigDecimal) value).toPlainString();
                                }
                                row.put(colName, value);
                            }
                            result.add(row);
                        }
                        return result;
                    }
                });
            }
        };
        Future<List<Map<String, Object>>> future = queryExecutor.submit(task);

        try {
            return future.get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new RuntimeException("查询超时（超过" + timeoutSeconds + "秒），请缩小查询范围或增加筛选条件");
        }
    }

    private String formatNaturalAnswer(String question, List<Map<String, Object>> data) {
        if (data == null || data.isEmpty()) {
            return "未找到符合条件的数据。";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("查询到 ").append(data.size()).append(" 条结果：\n\n");

        int displayRows = Math.min(data.size(), DISPLAY_ROWS);

        Map<String, Object> firstRow = data.get(0);
        List<String> columns = new ArrayList<>(firstRow.keySet());

        // 列数少时用紧凑表格格式，列数多时用详情格式
        if (columns.size() <= 4) {
            for (int i = 0; i < displayRows; i++) {
                Map<String, Object> row = data.get(i);
                sb.append(i + 1).append(". ");
                List<String> values = new ArrayList<>();
                for (String col : columns) {
                    Object val = row.get(col);
                    String valStr = val != null ? String.valueOf(val) : "-";
                    if (valStr.length() > 30) valStr = valStr.substring(0, 27) + "...";
                    values.add(col + ": " + valStr);
                }
                sb.append(String.join(" | ", values));
                sb.append("\n");
            }
        } else {
            for (int i = 0; i < displayRows; i++) {
                Map<String, Object> row = data.get(i);
                sb.append("【第").append(i + 1).append("条】\n");
                for (String col : columns) {
                    Object val = row.get(col);
                    String valStr = val != null ? String.valueOf(val) : "-";
                    if (valStr.length() > 50) valStr = valStr.substring(0, 47) + "...";
                    sb.append("  ").append(col).append(": ").append(valStr).append("\n");
                }
                sb.append("\n");
            }
        }

        if (data.size() > displayRows) {
            sb.append("... 还有 ").append(data.size() - displayRows).append(" 条数据未显示\n");
        }

        return sb.toString();
    }
}
