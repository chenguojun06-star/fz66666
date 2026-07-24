package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Pattern;

@Component
@Slf4j
public class SqlSecurityValidator {

    private static final int MAX_ROWS = 500;
    private static final int QUERY_TIMEOUT_SECONDS = 15;

    private static final List<String> FORBIDDEN_KEYWORDS = Arrays.asList(
            "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
            "REPLACE", "MERGE", "UPSERT", "EXEC", "EXECUTE", "CALL",
            "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "SAVEPOINT",
            "SET ", "SHOW ", "USE ", "INFORMATION_SCHEMA", "mysql.",
            "INTO OUTFILE", "LOAD_FILE", "SLEEP", "BENCHMARK",
            "--", "/*", "*/", "xp_cmdshell", "1=1", "OR 1"
    );

    private static final List<String> SENSITIVE_COLUMNS = Arrays.asList(
            "password", "passwd", "secret", "token", "api_key", "apikey",
            "private_key", "salt", "credential"
    );

    /** 预编译的 forbidden 关键词 Pattern（避免每次调用都编译正则） */
    private static final List<Pattern> FORBIDDEN_PATTERNS = new ArrayList<>();
    /** 预编译的敏感列名 Pattern */
    private static final List<Pattern> SENSITIVE_PATTERNS = new ArrayList<>();

    static {
        for (String kw : FORBIDDEN_KEYWORDS) {
            if (kw.contains(" ")) {
                FORBIDDEN_PATTERNS.add(Pattern.compile(Pattern.quote(kw.toUpperCase())));
            } else {
                FORBIDDEN_PATTERNS.add(Pattern.compile("\\b" + Pattern.quote(kw.toUpperCase()) + "\\b"));
            }
        }
        for (String col : SENSITIVE_COLUMNS) {
            SENSITIVE_PATTERNS.add(Pattern.compile("\\b" + Pattern.quote(col.toUpperCase()) + "\\b"));
        }
    }

    private static final Set<String> TABLES_WITH_TENANT_ID = new HashSet<>(Arrays.asList(
            "t_user", "t_style_info", "t_production_order", "t_scan_record",
            "t_scan_record_ext", "t_cutting_bundle", "t_cutting_task",
            "t_quality_inspection", "t_quality_defect", "t_warehouse_in",
            "t_warehouse_out", "t_material_info", "t_material_stock",
            "t_material_inbound", "t_supplier", "t_purchase_order",
            "t_purchase_order_item", "t_finance_settlement",
            "t_finance_salary", "t_finance_invoice", "t_factory_info",
            "t_ec_order", "t_ec_order_item", "t_ec_platform_config",
            "t_crm_customer", "t_crm_contact", "t_order_remark",
            "t_bill_record", "t_material_reconciliation",
            "t_style_bom", "t_style_process", "t_sample_order",
            "t_sample_task", "t_process_template",
            "t_knowledge_base", "t_intelligence_memory",
            "t_ai_conversation_memory", "t_ai_long_memory",
            "t_memory_bank_entry", "t_agent_memory_archival",
            "t_ai_skill_node", "t_skill_template",
            "t_collaboration_task", "t_patrol_action",
            "t_ai_accuracy_stat", "t_quick_answer",
            "t_crew_session", "t_operation_log",
            "t_purchase_cart", "t_purchase_cart_item",
            "t_bargain_price_record", "t_employee_advance",
            "t_backend_action_flag", "t_tenant_smart_feature",
            "t_warehouse_area", "t_sku_tracking",
            "t_finished_product_stock", "t_semi_finished_stock",
            "t_material_roll", "t_material_doc_receive",
            "t_material_quality_issue", "t_material_audit",
            "t_bundle_split_transfer", "t_secondary_process",
            "t_finished_outbound", "t_warehouse_op_log",
            "t_sample_stock", "t_sample_loan",
            "t_order_factory_transfer", "t_pattern_revision",
            "t_style_difficulty", "t_style_quotation",
            "t_supplier_scorecard", "t_compliance_record",
            "t_logistics_record", "t_production_exception",
            "t_anomaly_record", "t_delay_trend",
            "t_production_schedule", "t_delivery_prediction",
            "t_inventory_check", "t_order_comparison",
            "t_defective_board", "t_rca_analysis",
            "t_payroll_anomaly", "t_crm_follow_up"
    ));

    public static class ValidationResult {
        private final boolean valid;
        private final String errorMessage;
        private final String validatedSql;

        public ValidationResult(boolean valid, String errorMessage, String validatedSql) {
            this.valid = valid;
            this.errorMessage = errorMessage;
            this.validatedSql = validatedSql;
        }

        public boolean isValid() { return valid; }
        public String getErrorMessage() { return errorMessage; }
        public String getValidatedSql() { return validatedSql; }
    }

    public ValidationResult validate(String sql, Long tenantId) {
        if (sql == null || sql.trim().isEmpty()) {
            return new ValidationResult(false, "SQL不能为空", null);
        }

        String trimmed = sql.trim();

        if (!trimmed.toUpperCase().startsWith("SELECT")) {
            return new ValidationResult(false, "只允许SELECT查询，禁止其他SQL操作", null);
        }

        String upperSql = trimmed.toUpperCase();

        for (int i = 0; i < FORBIDDEN_PATTERNS.size(); i++) {
            if (FORBIDDEN_PATTERNS.get(i).matcher(upperSql).find()) {
                return new ValidationResult(false,
                        "SQL包含禁止的关键字：" + FORBIDDEN_KEYWORDS.get(i), null);
            }
        }

        for (int i = 0; i < SENSITIVE_PATTERNS.size(); i++) {
            if (SENSITIVE_PATTERNS.get(i).matcher(upperSql).find()) {
                return new ValidationResult(false,
                        "SQL包含敏感字段：" + SENSITIVE_COLUMNS.get(i) + "，禁止查询", null);
            }
        }

        String sqlWithLimit = addRowLimit(trimmed, MAX_ROWS);

        if (tenantId != null && requiresTenantFilter(sqlWithLimit)) {
            sqlWithLimit = injectTenantFilter(sqlWithLimit, tenantId);
        }

        log.debug("[SqlSecurityValidator] SQL验证通过: {}", sqlWithLimit);
        return new ValidationResult(true, null, sqlWithLimit);
    }

    private String addRowLimit(String sql, int maxRows) {
        String upper = sql.toUpperCase();
        if (upper.contains("LIMIT")) {
            int limitIdx = upper.lastIndexOf("LIMIT");
            String afterLimit = sql.substring(limitIdx + 5).trim();
            try {
                int existingLimit = Integer.parseInt(afterLimit.split("[ ,;]")[0].trim());
                if (existingLimit <= maxRows) {
                    return sql;
                }
            } catch (NumberFormatException e) {
            }
        }

        String noSemicolon = sql.endsWith(";") ? sql.substring(0, sql.length() - 1) : sql;
        return noSemicolon + " LIMIT " + maxRows;
    }

    private boolean requiresTenantFilter(String sql) {
        String upper = sql.toUpperCase();
        for (String table : TABLES_WITH_TENANT_ID) {
            if (upper.contains(table.toUpperCase())) {
                return true;
            }
        }
        return false;
    }

    private String injectTenantFilter(String sql, Long tenantId) {
        String upper = sql.toUpperCase();

        // 找出 SQL 中涉及的所有带 tenant_id 的表及其别名
        List<TableRef> tableRefs = extractTableRefs(sql, upper);
        if (tableRefs.isEmpty()) return sql;

        // 构建 tenant_id 条件：对每个表使用 别名.tenant_id 或 表名.tenant_id
        List<String> conditions = new ArrayList<>();
        for (TableRef ref : tableRefs) {
            String prefix = ref.alias != null ? ref.alias : ref.tableName;
            conditions.add(prefix + ".tenant_id = " + tenantId);
        }
        String tenantCondition = String.join(" AND ", conditions);

        int whereIdx = findKeywordIndex(upper, "WHERE");
        int groupIdx = findKeywordIndex(upper, "GROUP BY");
        int orderIdx = findKeywordIndex(upper, "ORDER BY");
        int havingIdx = findKeywordIndex(upper, "HAVING");
        int limitIdx = findKeywordIndex(upper, "LIMIT");

        int insertPos = sql.length();
        if (limitIdx >= 0) insertPos = limitIdx;
        else if (orderIdx >= 0) insertPos = orderIdx;
        else if (groupIdx >= 0) insertPos = groupIdx;
        else if (havingIdx >= 0) insertPos = havingIdx;

        if (whereIdx >= 0 && whereIdx < insertPos) {
            int whereEnd = whereIdx + "WHERE".length();
            return sql.substring(0, whereEnd)
                    + " " + tenantCondition + " AND "
                    + sql.substring(whereEnd).trim();
        }

        String before = sql.substring(0, insertPos).trim();
        String after = sql.substring(insertPos);

        return before + " WHERE " + tenantCondition + " " + after.trim();
    }

    /** 从 SQL 中提取表名和别名（仅匹配 TABLES_WITH_TENANT_ID 中的表） */
    private List<TableRef> extractTableRefs(String sql, String upper) {
        List<TableRef> refs = new ArrayList<>();
        for (String table : TABLES_WITH_TENANT_ID) {
            String tableUpper = table.toUpperCase();
            int idx = upper.indexOf(tableUpper);
            while (idx >= 0) {
                // 检查后面是否跟着别名（如 "t_order o" 或 "t_order AS o"）
                int afterTable = idx + tableUpper.length();
                String alias = null;
                if (afterTable < sql.length()) {
                    String rest = sql.substring(afterTable).trim();
                    // 跳过 AS 关键字
                    if (rest.toUpperCase().startsWith("AS ")) {
                        rest = rest.substring(3).trim();
                    }
                    // 提取别名（第一个单词）
                    if (!rest.isEmpty()) {
                        String[] parts = rest.split("[\\s,)]", 2);
                        if (parts.length > 0 && parts[0].length() > 0) {
                            String candidate = parts[0].trim();
                            // 确保不是 SQL 关键字
                            if (!isSqlKeyword(candidate.toUpperCase())) {
                                alias = candidate;
                            }
                        }
                    }
                }
                refs.add(new TableRef(table, alias));
                idx = upper.indexOf(tableUpper, afterTable);
            }
        }
        return refs;
    }

    private boolean isSqlKeyword(String word) {
        return word.equals("WHERE") || word.equals("JOIN") || word.equals("LEFT")
                || word.equals("RIGHT") || word.equals("INNER") || word.equals("OUTER")
                || word.equals("ON") || word.equals("AND") || word.equals("OR")
                || word.equals("GROUP") || word.equals("ORDER") || word.equals("LIMIT")
                || word.equals("HAVING") || word.equals("UNION") || word.equals("SELECT")
                || word.equals("FROM") || word.equals("SET") || word.equals("AS")
                || word.equals("INNER") || word.equals("CROSS");
    }

    private static class TableRef {
        final String tableName;
        final String alias;
        TableRef(String tableName, String alias) {
            this.tableName = tableName;
            this.alias = alias;
        }
    }

    private int findKeywordIndex(String upperSql, String keyword) {
        Pattern pattern = Pattern.compile("\\b" + Pattern.quote(keyword) + "\\b");
        java.util.regex.Matcher matcher = pattern.matcher(upperSql);
        if (matcher.find()) {
            return matcher.start();
        }
        return -1;
    }

    public int getMaxRows() {
        return MAX_ROWS;
    }

    public int getQueryTimeoutSeconds() {
        return QUERY_TIMEOUT_SECONDS;
    }
}
