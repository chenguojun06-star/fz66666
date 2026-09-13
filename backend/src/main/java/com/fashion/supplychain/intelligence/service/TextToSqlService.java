package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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

    /**
     * 【P0-1 安全说明】当前使用主数据源 JdbcTemplate（root 账号）执行 Text-to-SQL 生成的查询。
     *
     * <p>风险：若 SqlSecurityValidator 校验存在漏洞（如未拦截的写操作），root 权限可绕过只读限制。
     *
     * <p>当前缓解措施（已实现）：
     * <ul>
     *   <li>SqlSecurityValidator 强制白名单：仅允许 SELECT，拦截 INSERT/UPDATE/DELETE/DROP/ALTER
     *       等所有写操作关键字（P0-1 增强后覆盖 RENAME/LOAD DATA/HANDLER/FLUSH/KILL 等）</li>
     *   <li>拒绝 UNION / 子查询：避免 tenant_id 注入绕过（P0-2 / P0-3）</li>
     *   <li>敏感字段黑名单：拦截 password/token/phone/id_card 等 PII 字段</li>
     *   <li>审计日志：query 方法记录 tenantId/userId/question/generatedSql/validatedSql/rowCount/elapsedMs（P0-4）</li>
     *   <li>行数限制 + 查询超时：最多 500 行、15 秒超时</li>
     *   <li>执行前 EXPLAIN 预校验：语法错误/表字段不存在/权限不足在执行前拦下，不执行真实查询</li>
     * </ul>
     *
     * <p>建议（未实施，避免影响其他模块）：为 Text-to-SQL 配置专用只读数据源，
     * 使用 mcp_readonly 账号（仅 SELECT 权限），从数据库账号层面彻底杜绝写操作。
     * 详见 dev-mcp-design.md 第二章 db-query-mcp 的只读账号设计。
     */
    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final int MAX_TABLES_FOR_CONTEXT = 6;
    private static final int DISPLAY_ROWS = 50;
    private static final int CACHE_TTL_MINUTES = 5;
    private static final int CACHE_MAX_SIZE = 200;
    private static final int RATE_LIMIT_PER_MINUTE = 10; // 每个租户每分钟最多10次查询

    /**
     * EXPLAIN 预校验自身的超时（秒）。预校验只做语法解析与元数据检查，
     * 远快于真实查询；设上限是为了避免 DB 异常时长期占用请求线程。
     */
    private static final int PRECHECK_TIMEOUT_SECONDS = 5;

    /** 预校验失败/执行失败时，返回给用户的错误信息最大长度 */
    private static final int MAX_ERROR_MESSAGE_LEN = 200;

    /** 执行前是否先跑 EXPLAIN 预校验（语法/表字段/权限错误直接拒绝执行） */
    @Value("${xiaoyun.text-to-sql.precheck-enabled:true}")
    private boolean precheckEnabled;

    /** 执行失败后回喂 LLM 自修正的重试次数（0 = 关闭重试） */
    @Value("${xiaoyun.text-to-sql.max-retry-attempts:1}")
    private int maxRetryAttempts;

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

        // P0-4 审计日志：记录查询发起方信息（tenantId/userId/question）
        String auditUserId = UserContext.userId();
        log.info("[TextToSql-Audit] START tenantId={} userId={} question=\"{}\"",
                tenantId, auditUserId, question);

        try {
            String schemaContext = schemaVectorManager.buildSchemaContext(question, MAX_TABLES_FOR_CONTEXT);

            String systemPrompt = buildSystemPrompt(schemaContext, tenantId);

            String aiResponse = aiAdvisorService.chat(systemPrompt, question);

            if (aiResponse == null || aiResponse.isBlank()) {
                log.info("[TextToSql-Audit] END status=ai_empty tenantId={} userId={} elapsedMs={}",
                        tenantId, auditUserId, System.currentTimeMillis() - startTime);
                response.setIntent("text_to_sql_failed");
                response.setConfidence(0);
                response.setAnswer("AI生成查询失败，请换一种问法试试。");
                return response;
            }

            String sql = extractSql(aiResponse);

            if (sql == null || sql.isEmpty()) {
                log.info("[TextToSql-Audit] END status=no_sql tenantId={} userId={} elapsedMs={}",
                        tenantId, auditUserId, System.currentTimeMillis() - startTime);
                response.setIntent("text_to_sql_no_sql");
                response.setConfidence(30);
                response.setAnswer("抱歉，我暂时无法理解这个问题。请尝试用更具体的方式描述，例如：\n"
                        + "• \"查询最近7天的产量统计\"\n"
                        + "• \"查看PO202606010001订单的进度\"\n"
                        + "• \"哪些订单逾期了\"");
                return response;
            }

            // P0-4 审计日志：记录 LLM 生成的原始 SQL（未校验）
            log.info("[TextToSql-Audit] GENERATED tenantId={} userId={} generatedSql=\"{}\"",
                    tenantId, auditUserId, sql);

            SqlSecurityValidator.ValidationResult validation = sqlSecurityValidator.validate(sql, tenantId);
            if (!validation.isValid()) {
                // P0-4 审计日志：记录安全拦截事件（含原始SQL便于追溯）
                log.warn("[TextToSql-Audit] END status=blocked tenantId={} userId={} reason=\"{}\" generatedSql=\"{}\" elapsedMs={}",
                        tenantId, auditUserId, validation.getErrorMessage(), sql,
                        System.currentTimeMillis() - startTime);
                response.setIntent("text_to_sql_security_blocked");
                response.setConfidence(0);
                response.setAnswer("查询被安全拦截：" + validation.getErrorMessage());
                return response;
            }

            String validatedSql = validation.getValidatedSql();
            log.info("[TextToSql-Audit] VALIDATED tenantId={} userId={} validatedSql=\"{}\"",
                    tenantId, auditUserId, validatedSql);

            // ── 执行前 EXPLAIN 预校验 ──
            // 目的：在 root 数据源上再加一道闸。即使 SqlSecurityValidator 有漏网之鱼，
            // EXPLAIN 阶段也能拦下语法错误、表/字段不存在、权限不足等问题，且不执行真实查询。
            if (precheckEnabled) {
                PrecheckResult precheck = precheckWithExplain(validatedSql);
                if (!precheck.passed) {
                    log.warn("[TextToSql-Audit] END status=precheck_failed tenantId={} userId={} reason=\"{}\" validatedSql=\"{}\" elapsedMs={}",
                            tenantId, auditUserId, precheck.errorMessage, validatedSql,
                            System.currentTimeMillis() - startTime);
                    response.setIntent("text_to_sql_precheck_failed");
                    response.setConfidence(0);
                    response.setAnswer("SQL 预校验未通过，已阻止执行：" + precheck.errorMessage
                            + "\n\n请换一种问法试试。");
                    return response;
                }
            }

            // ── 执行 + 失败自修正重试 ──
            // 失败时把「原始SQL + 数据库错误信息」回喂 LLM，修正后重新走一遍
            // SqlSecurityValidator + EXPLAIN 预校验（重试不豁免任何校验），再执行。
            List<Map<String, Object>> resultData = null;
            String executedSql = validatedSql;
            String lastError = null;
            boolean retried = false;
            int maxAttempts = 1 + Math.max(0, maxRetryAttempts);

            for (int attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    resultData = executeQueryWithTimeout(executedSql, sqlSecurityValidator.getQueryTimeoutSeconds());
                    break;
                } catch (Exception ex) {
                    lastError = ex.getMessage() != null ? ex.getMessage() : ex.toString();

                    if (attempt >= maxAttempts) {
                        break;
                    }

                    // 1) LLM 自修正
                    String fixedSql = requestSelfCorrection(question, schemaContext, executedSql, lastError);
                    if (fixedSql == null) {
                        log.warn("[TextToSql] 自修正未产出SQL，放弃重试 tenantId={} attempt={} failedSql=\"{}\" error=\"{}\"",
                                tenantId, attempt, executedSql, lastError);
                        break;
                    }

                    // 2) 重试前重新过安全校验（不因为是重试就跳过）
                    SqlSecurityValidator.ValidationResult revalidation = sqlSecurityValidator.validate(fixedSql, tenantId);
                    if (!revalidation.isValid()) {
                        log.warn("[TextToSql] 自修正SQL被安全拦截，放弃重试 tenantId={} attempt={} reason=\"{}\" failedSql=\"{}\" fixedSql=\"{}\"",
                                tenantId, attempt, revalidation.getErrorMessage(), executedSql, fixedSql);
                        lastError = "修正后的SQL未通过安全校验：" + revalidation.getErrorMessage();
                        break;
                    }

                    // 3) 重试前重新过 EXPLAIN 预校验
                    String reSql = revalidation.getValidatedSql();
                    if (precheckEnabled) {
                        PrecheckResult rePrecheck = precheckWithExplain(reSql);
                        if (!rePrecheck.passed) {
                            log.warn("[TextToSql] 自修正SQL未通过EXPLAIN预校验，放弃重试 tenantId={} attempt={} reason=\"{}\" fixedSql=\"{}\"",
                                    tenantId, attempt, rePrecheck.errorMessage, reSql);
                            lastError = "修正后的SQL未通过预校验：" + rePrecheck.errorMessage;
                            break;
                        }
                    }

                    log.info("[TextToSql] 自修正重试 attempt={}/{} tenantId={} failedSql=\"{}\" error=\"{}\" fixedSql=\"{}\"",
                            attempt, maxRetryAttempts, tenantId, executedSql, lastError, reSql);
                    executedSql = reSql;
                    retried = true;
                }
            }

            if (resultData == null) {
                log.error("[TextToSql-Audit] END status=error tenantId={} userId={} retried={} elapsedMs={} error=\"{}\" failedSql=\"{}\"",
                        tenantId, auditUserId, retried, System.currentTimeMillis() - startTime, lastError, executedSql);
                response.setIntent("text_to_sql_error");
                response.setConfidence(0);
                response.setAnswer("查询执行失败：" + truncateErrorMessage(lastError) + "。请换一种问法试试。");
                return response;
            }

            long elapsed = System.currentTimeMillis() - startTime;
            // P0-4 审计日志：记录查询执行结果（rowCount/elapsedMs/executedSql 便于事后追溯）
            // retried + elapsedMs 同时用于统计 SQL 一次成功率
            log.info("[TextToSql-Audit] END status=success tenantId={} userId={} rowCount={} elapsedMs={} retried={} executedSql=\"{}\"",
                    tenantId, auditUserId, resultData.size(), elapsed, retried, executedSql);

            response.setIntent("text_to_sql_success");
            response.setConfidence(85);

            // ── 限制返回数据量：只返回前50行用于展示 + 汇总统计 ──
            Map<String, Object> responseData = new LinkedHashMap<>();
            responseData.put("sql", executedSql);
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
            // P0-4 审计日志：记录执行异常（含 tenantId/userId/elapsedMs 便于定位问题）
            log.error("[TextToSql-Audit] END status=error tenantId={} userId={} elapsedMs={} error=\"{}\"",
                    tenantId, auditUserId, System.currentTimeMillis() - startTime, e.getMessage(), e);
            response.setIntent("text_to_sql_error");
            response.setConfidence(0);
            response.setAnswer("查询执行失败：" + e.getMessage() + "。请换一种问法试试。");
        }

        return response;
    }

    /** EXPLAIN 预校验结果 */
    private static class PrecheckResult {
        final boolean passed;
        final String errorMessage;
        PrecheckResult(boolean passed, String errorMessage) {
            this.passed = passed;
            this.errorMessage = errorMessage;
        }
    }

    /**
     * 执行前用 EXPLAIN 预校验 SQL：只做语法解析与元数据检查，不会执行真实查询、不返回业务数据。
     * 语法错误、表/字段不存在、权限不足都会在此暴露，从而在真正执行前拦下。
     */
    private PrecheckResult precheckWithExplain(String sql) {
        try {
            Future<List<Map<String, Object>>> future = queryExecutor.submit(
                    (Callable<List<Map<String, Object>>>) () -> jdbcTemplate.queryForList("EXPLAIN " + sql));
            future.get(PRECHECK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return new PrecheckResult(true, null);
        } catch (Exception e) {
            // ExecutionException 会包住真实的 SQLException，取 cause 才能拿到数据库原始报错
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            String message = cause.getMessage() != null ? cause.getMessage() : cause.toString();
            return new PrecheckResult(false, truncateErrorMessage(message));
        }
    }

    /**
     * 执行失败时把「原始SQL + 数据库错误信息」回喂 LLM，让其产出修正后的 SQL。
     * 返回 null 表示没有拿到可用 SQL（调用方应放弃重试）。
     */
    private String requestSelfCorrection(String question, String schemaContext, String failedSql, String errorMessage) {
        if (aiAdvisorService == null || !aiAdvisorService.isEnabled()) {
            return null;
        }

        String systemPrompt = "你是MySQL SQL纠错专家。下面这条SQL执行失败了，请根据数据库错误信息修正它。\n\n"
                + "【修正规则】\n"
                + "1. 只输出一条可执行的SELECT语句，禁止INSERT/UPDATE/DELETE/DDL等写操作\n"
                + "2. 禁止UNION与子查询，禁止SELECT *，不要查询password/token/phone等敏感字段\n"
                + "3. 不要手写tenant_id条件，也不要手写LIMIT，系统会自动添加\n"
                + "4. 每张表必须使用别名\n"
                + "5. 表名与字段名只能取自下面给出的表结构，不要臆造\n\n"
                + "【数据库表结构参考】\n"
                + schemaContext + "\n\n"
                + "【输出格式】\n"
                + "只输出一个 ```sql 代码块，不要输出其他内容。\n";

        String userPrompt = "原始问题：" + question + "\n\n"
                + "执行失败的SQL：\n```sql\n" + failedSql + "\n```\n\n"
                + "数据库错误信息：\n" + truncateErrorMessage(errorMessage) + "\n\n"
                + "请输出修正后的SQL。";

        try {
            return extractSql(aiAdvisorService.chat(systemPrompt, userPrompt));
        } catch (Exception e) {
            log.warn("[TextToSql] 自修正LLM调用失败: {}", e.getMessage());
            return null;
        }
    }

    /** 压缩错误信息：折叠换行、截断长度，避免把数据库原始堆栈直接透给用户 */
    private String truncateErrorMessage(String message) {
        if (message == null || message.isBlank()) {
            return "未知错误";
        }
        String flat = message.replaceAll("\\s+", " ").trim();
        return flat.length() <= MAX_ERROR_MESSAGE_LEN
                ? flat
                : flat.substring(0, MAX_ERROR_MESSAGE_LEN) + "...";
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
