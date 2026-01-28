package com.fashion.supplychain.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@ConditionalOnProperty(prefix = "fashion.db", name = "initializer-enabled", havingValue = "true", matchIfMissing = true)
@Slf4j
public class DataInitializer implements CommandLineRunner {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private Environment environment;

    private boolean tableExists(String tableName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
                Integer.class,
                tableName);
        return count != null && count > 0;
    }

    private boolean columnExists(String tableName, String columnName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
                Integer.class,
                tableName,
                columnName);
        return count != null && count > 0;
    }

    private void execSilently(String sql) {
        if (sql == null || sql.trim().isEmpty()) {
            return;
        }
        try {
            jdbcTemplate.execute(sql);
        } catch (Exception e) {
            log.warn("SQL failed: {}", e.getMessage());
        }
    }

    private boolean waitForDatabaseReady() {
        long waitMs = resolveInitializerWaitMs();
        long deadline = waitMs <= 0 ? 0 : (System.currentTimeMillis() + waitMs);
        while (true) {
            if (pingDatabaseOnce()) {
                return true;
            }
            if (waitMs <= 0 || System.currentTimeMillis() >= deadline) {
                return false;
            }
            try {
                long remaining = deadline - System.currentTimeMillis();
                Thread.sleep(Math.min(1000L, Math.max(1L, remaining)));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
    }

    private boolean pingDatabaseOnce() {
        try {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private long resolveInitializerWaitMs() {
        if (environment == null) {
            return 0;
        }

        String url = environment.getProperty("spring.datasource.url");
        if (url != null && url.toLowerCase().contains("jdbc:h2:")) {
            return 0;
        }

        String[] profiles = environment.getActiveProfiles();
        if (profiles != null && Arrays.stream(profiles).anyMatch(p -> p != null && "test".equalsIgnoreCase(p))) {
            return 0;
        }

        String raw = environment.getProperty("fashion.db.initializer-wait-ms");
        if (raw == null || raw.trim().isEmpty()) {
            return 30000L;
        }
        try {
            long v = Long.parseLong(raw.trim());
            if (v < 0) {
                return 0;
            }
            return Math.min(v, 120000L);
        } catch (Exception e) {
            return 30000L;
        }
    }

    private void ensurePermissionNameByCode(String code, String name) {
        try {
            jdbcTemplate.update(
                    "UPDATE t_permission SET permission_name = ? WHERE permission_code = ? AND (permission_name IS NULL OR permission_name <> ?)",
                    name,
                    code,
                    name);
        } catch (Exception e) {
            log.warn("Failed to ensure permission name by code: code={}, name={}, err={}", code, name, e.getMessage());
        }
    }

    private boolean indexExists(String tableName, String indexName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?",
                Integer.class,
                tableName,
                indexName);
        return count != null && count > 0;
    }

    private void addIndexIfAbsent(String tableName, String indexName, String columnsSql) {
        if (indexExists(tableName, indexName)) {
            return;
        }
        execSilently("ALTER TABLE " + tableName + " ADD INDEX " + indexName + " (" + columnsSql + ")");
    }

    private void addUniqueKeyIfAbsent(String tableName, String keyName, String columnsSql) {
        if (indexExists(tableName, keyName)) {
            return;
        }
        execSilently("ALTER TABLE " + tableName + " ADD UNIQUE KEY " + keyName + " (" + columnsSql + ")");
    }

    private void dropIndexIfExists(String tableName, String indexName) {
        if (!indexExists(tableName, indexName)) {
            return;
        }
        execSilently("ALTER TABLE " + tableName + " DROP INDEX " + indexName);
    }

    private String loadCreateTableStatementFromInitSql(String tableName) {
        try {
            ClassPathResource resource = new ClassPathResource("init.sql");
            if (!resource.exists()) {
                return null;
            }
            String content = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            String marker = "CREATE TABLE IF NOT EXISTS " + tableName;
            int start = content.indexOf(marker);
            if (start < 0) {
                return null;
            }
            int end = content.indexOf(";", start);
            if (end < 0) {
                return null;
            }
            return content.substring(start, end + 1);
        } catch (Exception e) {
            return null;
        }
    }

    private boolean shouldSkipViewInitialization() {
        if (environment == null) {
            return false;
        }

        String url = environment.getProperty("spring.datasource.url");
        if (url != null && url.toLowerCase().contains("jdbc:h2:")) {
            return true;
        }

        String[] profiles = environment.getActiveProfiles();
        return profiles != null && Arrays.stream(profiles).anyMatch(p -> p != null && "test".equalsIgnoreCase(p));
    }

    private boolean viewExists(String viewName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = DATABASE() AND table_name = ?",
                Integer.class,
                viewName);
        return count != null && count > 0;
    }

    private void ensureProductionViewsFallback() {
        if (viewExists("v_production_order_flow_stage_snapshot")
                && viewExists("v_production_order_stage_done_agg")
                && viewExists("v_production_order_procurement_snapshot")) {
            return;
        }

        String flowStageSnapshot = """
                CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
                SELECT
                  sr.order_id AS order_id,
                  MIN(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time,
                  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
                    '|', -1
                  ) AS order_operator_name,
                  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
                    '|', -1
                  ) AS procurement_scan_operator_name,
                  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
                  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
                    '|', -1
                  ) AS cutting_operator_name,
                  SUM(CASE WHEN sr.scan_type = 'cutting' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS cutting_quantity,
                  MIN(CASE WHEN sr.scan_type = 'production'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
                        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
                      THEN sr.scan_time END) AS sewing_start_time,
                  MAX(CASE WHEN sr.scan_type = 'production'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
                        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
                      THEN sr.scan_time END) AS sewing_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'production'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
                        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
                      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
                    '|', -1
                  ) AS sewing_operator_name,
                  -- 车缝环节（新增）
                  MIN(CASE WHEN sr.scan_type = 'production'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
                      THEN sr.scan_time END) AS car_sewing_start_time,
                  MAX(CASE WHEN sr.scan_type = 'production'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
                      THEN sr.scan_time END) AS car_sewing_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'production'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
                      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
                    '|', -1
                  ) AS car_sewing_operator_name,
                  -- 大烫环节（新增）
                  MIN(CASE WHEN sr.scan_type = 'production'
                        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
                      THEN sr.scan_time END) AS ironing_start_time,
                  MAX(CASE WHEN sr.scan_type = 'production'
                        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
                      THEN sr.scan_time END) AS ironing_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'production'
                        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
                      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
                    '|', -1
                  ) AS ironing_operator_name,
                  -- 包装环节（新增）
                  MIN(CASE WHEN sr.scan_type = 'production'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                      THEN sr.scan_time END) AS packaging_start_time,
                  MAX(CASE WHEN sr.scan_type = 'production'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                      THEN sr.scan_time END) AS packaging_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'production'
                        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
                    '|', -1
                  ) AS packaging_operator_name,
                  MIN(CASE WHEN (sr.scan_type = 'quality'
                        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
                      THEN sr.scan_time END) AS quality_start_time,
                  MAX(CASE WHEN (sr.scan_type = 'quality'
                        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
                      THEN sr.scan_time END) AS quality_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN (sr.scan_type = 'quality'
                        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
                      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
                    '|', -1
                  ) AS quality_operator_name,
                  SUM(CASE WHEN (sr.scan_type = 'quality'
                        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
                        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
                      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS quality_quantity,
                  MIN(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_start_time,
                  MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
                    '|', -1
                  ) AS warehousing_operator_name,
                  SUM(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS warehousing_quantity
                FROM t_scan_record sr
                WHERE sr.scan_result = 'success'
                GROUP BY sr.order_id;
                """;

        String stageDoneAgg = """
                CREATE OR REPLACE VIEW v_production_order_stage_done_agg AS
                SELECT
                  t.order_id AS order_id,
                  t.stage_name AS stage_name,
                  SUM(IFNULL(t.quantity, 0)) AS done_quantity,
                  MAX(t.scan_time) AS last_scan_time
                FROM (
                  SELECT
                    sr.order_id,
                    COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) AS stage_name,
                    sr.quantity,
                    sr.scan_time
                  FROM t_scan_record sr
                  WHERE sr.scan_result = 'success'
                    AND sr.quantity > 0
                    AND sr.scan_type IN ('production', 'cutting')
                ) t
                WHERE t.stage_name IS NOT NULL AND t.stage_name <> ''
                GROUP BY t.order_id, t.stage_name;
                """;

        String procurementSnapshot = """
                CREATE OR REPLACE VIEW v_production_order_procurement_snapshot AS
                SELECT
                  p.order_id AS order_id,
                  MIN(p.create_time) AS procurement_start_time,
                  MAX(COALESCE(p.received_time, p.update_time)) AS procurement_end_time,
                  SUBSTRING_INDEX(
                    MAX(CONCAT(LPAD(UNIX_TIMESTAMP(COALESCE(p.received_time, p.update_time)), 20, '0'), LPAD(UNIX_TIMESTAMP(p.update_time), 20, '0'), '|', IFNULL(p.receiver_name, ''))),
                    '|', -1
                  ) AS procurement_operator_name,
                  SUM(IFNULL(p.purchase_quantity, 0)) AS purchase_quantity,
                  SUM(IFNULL(p.arrived_quantity, 0)) AS arrived_quantity
                FROM t_material_purchase p
                WHERE p.delete_flag = 0
                  AND p.order_id IS NOT NULL
                  AND p.order_id <> ''
                GROUP BY p.order_id;
                """;

        try {
            jdbcTemplate.execute(flowStageSnapshot);
            log.info("View v_production_order_flow_stage_snapshot checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create view v_production_order_flow_stage_snapshot: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute(stageDoneAgg);
            log.info("View v_production_order_stage_done_agg checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create view v_production_order_stage_done_agg: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute(procurementSnapshot);
            log.info("View v_production_order_procurement_snapshot checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create view v_production_order_procurement_snapshot: {}", e.getMessage());
        }
    }

    private void ensureProductionViews() {
        if (shouldSkipViewInitialization()) {
            return;
        }
        ensureViewsFromInitSql();
        ensureProductionViewsFallback();
    }

    private void ensureViewsFromInitSql() {
        if (shouldSkipViewInitialization()) {
            return;
        }

        try {
            ClassPathResource resource = new ClassPathResource("init.sql");
            if (!resource.exists()) {
                return;
            }
            String content = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (content.trim().isEmpty()) {
                return;
            }

            Pattern viewPattern = Pattern.compile("(?is)\\bCREATE\\s+OR\\s+REPLACE\\s+VIEW\\b[\\s\\S]*?;");
            Matcher matcher = viewPattern.matcher(content);
            List<String> statements = new ArrayList<>();
            while (matcher.find()) {
                String stmt = matcher.group();
                if (stmt != null && !stmt.trim().isEmpty()) {
                    statements.add(stmt.trim());
                }
            }
            if (statements.isEmpty()) {
                return;
            }

            Pattern namePattern = Pattern
                    .compile("(?is)\\bCREATE\\s+OR\\s+REPLACE\\s+VIEW\\s+(`?)([\\w.]+)\\1");
            for (String stmt : statements) {
                if (stmt == null || stmt.trim().isEmpty()) {
                    continue;
                }
                String viewName = null;
                Matcher nameMatcher = namePattern.matcher(stmt);
                if (nameMatcher.find()) {
                    viewName = nameMatcher.group(2);
                }
                try {
                    jdbcTemplate.execute(stmt);
                    if (viewName != null) {
                        log.info("View {} checked/created.", viewName);
                    } else {
                        log.info("View checked/created.");
                    }
                } catch (Exception e) {
                    if (viewName != null) {
                        log.warn("Failed to create view {}: {}", viewName, e.getMessage());
                    } else {
                        log.warn("Failed to create view from init.sql: {}", e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load init.sql for views: {}", e.getMessage());
        }
    }

    private void ensureDictTable() {
        if (!tableExists("t_dict")) {
            String sqlFromInit = loadCreateTableStatementFromInitSql("t_dict");
            if (sqlFromInit != null) {
                execSilently(sqlFromInit);
            } else {
                execSilently("CREATE TABLE IF NOT EXISTS t_dict (" +
                        "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '字典ID'," +
                        "dict_code VARCHAR(50) NOT NULL COMMENT '字典编码'," +
                        "dict_label VARCHAR(100) NOT NULL COMMENT '字典标签'," +
                        "dict_value VARCHAR(100) NOT NULL COMMENT '字典值'," +
                        "dict_type VARCHAR(50) NOT NULL COMMENT '字典类型'," +
                        "sort INT DEFAULT 0 COMMENT '排序'," +
                        "status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'," +
                        "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                        "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                        "INDEX idx_dict_type (dict_type)" +
                        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典表'");
            }
        }

        try {
            Integer cnt = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM t_dict", Integer.class);
            if (cnt != null && cnt == 0) {
                jdbcTemplate.execute(
                        "INSERT INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES" +
                                "('WOMAN', '女装', 'WOMAN', 'category', 1, 'ENABLED')," +
                                "('MAN', '男装', 'MAN', 'category', 2, 'ENABLED')," +
                                "('KID', '童装', 'KID', 'category', 3, 'ENABLED')," +
                                "('SPRING', '春季', 'SPRING', 'season', 1, 'ENABLED')," +
                                "('SUMMER', '夏季', 'SUMMER', 'season', 2, 'ENABLED')," +
                                "('AUTUMN', '秋季', 'AUTUMN', 'season', 3, 'ENABLED')," +
                                "('WINTER', '冬季', 'WINTER', 'season', 4, 'ENABLED')");
            }
        } catch (Exception e) {
            log.warn("Failed to seed dict table: err={}", e.getMessage());
        }
    }

    private void ensureLoginLogTable() {
        if (!tableExists("t_login_log")) {
            String sqlFromInit = loadCreateTableStatementFromInitSql("t_login_log");
            if (sqlFromInit != null) {
                execSilently(sqlFromInit);
            } else {
                execSilently("CREATE TABLE IF NOT EXISTS t_login_log (" +
                        "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '日志ID'," +
                        "username VARCHAR(50) NOT NULL COMMENT '用户名'," +
                        "login_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间'," +
                        "login_ip VARCHAR(20) NOT NULL COMMENT '登录IP'," +
                        "login_result VARCHAR(20) NOT NULL COMMENT '登录结果：SUCCESS-成功，FAILED-失败'," +
                        "error_message VARCHAR(200) COMMENT '错误信息'" +
                        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录日志表'");
            }
        }

        if (!columnExists("t_login_log", "login_ip") && columnExists("t_login_log", "ip")) {
            execSilently("ALTER TABLE t_login_log CHANGE ip login_ip VARCHAR(20) NOT NULL COMMENT '登录IP'");
        }
        if (!columnExists("t_login_log", "login_ip")) {
            execSilently("ALTER TABLE t_login_log ADD COLUMN login_ip VARCHAR(20) NOT NULL DEFAULT '' COMMENT '登录IP'");
        }
        if (!columnExists("t_login_log", "login_result") && columnExists("t_login_log", "login_status")) {
            execSilently(
                    "ALTER TABLE t_login_log CHANGE login_status login_result VARCHAR(20) NOT NULL COMMENT '登录结果：SUCCESS-成功，FAILED-失败'");
        }
        if (!columnExists("t_login_log", "login_result")) {
            execSilently(
                    "ALTER TABLE t_login_log ADD COLUMN login_result VARCHAR(20) NOT NULL DEFAULT '' COMMENT '登录结果：SUCCESS-成功，FAILED-失败'");
        }
        if (!columnExists("t_login_log", "error_message") && columnExists("t_login_log", "message")) {
            execSilently("ALTER TABLE t_login_log CHANGE message error_message VARCHAR(200) COMMENT '错误信息'");
        }
        if (!columnExists("t_login_log", "error_message")) {
            execSilently("ALTER TABLE t_login_log ADD COLUMN error_message VARCHAR(200) COMMENT '错误信息'");
        }
        if (!columnExists("t_login_log", "login_time")) {
            execSilently(
                    "ALTER TABLE t_login_log ADD COLUMN login_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间'");
        }

        // 添加操作日志相关字段
        if (!columnExists("t_login_log", "log_type")) {
            execSilently("ALTER TABLE t_login_log ADD COLUMN log_type VARCHAR(20) DEFAULT 'LOGIN' COMMENT '日志类型：LOGIN-登录日志，OPERATION-操作日志'");
        }
        if (!columnExists("t_login_log", "biz_type")) {
            execSilently("ALTER TABLE t_login_log ADD COLUMN biz_type VARCHAR(50) COMMENT '业务类型'");
        }
        if (!columnExists("t_login_log", "biz_id")) {
            execSilently("ALTER TABLE t_login_log ADD COLUMN biz_id VARCHAR(64) COMMENT '业务ID'");
        }
        if (!columnExists("t_login_log", "action")) {
            execSilently("ALTER TABLE t_login_log ADD COLUMN action VARCHAR(50) COMMENT '操作动作'");
        }
        if (!columnExists("t_login_log", "remark")) {
            execSilently("ALTER TABLE t_login_log ADD COLUMN remark VARCHAR(500) COMMENT '备注'");
        }

        addIndexIfAbsent("t_login_log", "idx_login_time", "login_time");
        addIndexIfAbsent("t_login_log", "idx_username", "username");
        addIndexIfAbsent("t_login_log", "idx_login_result", "login_result");
        addIndexIfAbsent("t_login_log", "idx_log_type", "log_type");
        addIndexIfAbsent("t_login_log", "idx_biz", "biz_type, biz_id");
        addIndexIfAbsent("t_login_log", "idx_action", "action");
    }

    private void ensureMaterialPurchaseTable() {
        if (tableExists("t_material_purchase")) {
            if (!columnExists("t_material_purchase", "material_id")) {
                execSilently("ALTER TABLE t_material_purchase ADD COLUMN material_id VARCHAR(36) COMMENT '物料ID'");
            }
            if (!columnExists("t_material_purchase", "material_type")) {
                execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料'");
            }
            if (!columnExists("t_material_purchase", "remark")) {
                execSilently("ALTER TABLE t_material_purchase ADD COLUMN remark VARCHAR(500) COMMENT '备注'");
            }
            if (!columnExists("t_material_purchase", "style_id")) {
                execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_id VARCHAR(36) COMMENT '款号ID'");
            }
            if (!columnExists("t_material_purchase", "style_no")) {
                execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
            }
            if (!columnExists("t_material_purchase", "style_name")) {
                execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_name VARCHAR(100) COMMENT '款名'");
            }
            if (!columnExists("t_material_purchase", "style_cover")) {
                execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_cover VARCHAR(500) COMMENT '款式图片'");
            }
            if (!columnExists("t_material_purchase", "delete_flag")) {
                execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
            }

            if (!columnExists("t_material_purchase", "receiver_id")) {
                execSilently("ALTER TABLE t_material_purchase ADD COLUMN receiver_id VARCHAR(36) COMMENT '收货人ID'");
            }
            if (!columnExists("t_material_purchase", "receiver_name")) {
                execSilently("ALTER TABLE t_material_purchase ADD COLUMN receiver_name VARCHAR(100) COMMENT '收货人名称'");
            }
            if (!columnExists("t_material_purchase", "received_time")) {
                execSilently("ALTER TABLE t_material_purchase ADD COLUMN received_time DATETIME COMMENT '收货时间'");
            }

            if (!columnExists("t_material_purchase", "return_confirmed")) {
                execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN return_confirmed INT DEFAULT 0 COMMENT '回料是否确认(0-否,1-是)'");
            }
            if (!columnExists("t_material_purchase", "return_quantity")) {
                execSilently("ALTER TABLE t_material_purchase ADD COLUMN return_quantity INT DEFAULT 0 COMMENT '回料数量'");
            }
            if (!columnExists("t_material_purchase", "return_confirmer_id")) {
                execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN return_confirmer_id VARCHAR(36) COMMENT '回料确认人ID'");
            }
            if (!columnExists("t_material_purchase", "return_confirmer_name")) {
                execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN return_confirmer_name VARCHAR(100) COMMENT '回料确认人名称'");
            }
            if (!columnExists("t_material_purchase", "return_confirm_time")) {
                execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN return_confirm_time DATETIME COMMENT '回料确认时间'");
            }
            return;
        }

        String sqlFromInit = loadCreateTableStatementFromInitSql("t_material_purchase");
        if (sqlFromInit != null) {
            try {
                jdbcTemplate.execute(sqlFromInit);
                log.info("Table t_material_purchase checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_material_purchase table from init.sql: {}", e.getMessage());
            }
        }

        String createMaterialPurchaseTable = "CREATE TABLE IF NOT EXISTS t_material_purchase (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '采购ID'," +
                "purchase_no VARCHAR(50) NOT NULL UNIQUE COMMENT '采购单号'," +
                "material_id VARCHAR(36) COMMENT '物料ID'," +
                "material_code VARCHAR(50) NOT NULL COMMENT '物料编码'," +
                "material_name VARCHAR(100) NOT NULL COMMENT '物料名称'," +
                "material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料'," +
                "specifications VARCHAR(100) COMMENT '规格'," +
                "unit VARCHAR(20) NOT NULL COMMENT '单位'," +
                "purchase_quantity INT NOT NULL DEFAULT 0 COMMENT '采购数量'," +
                "arrived_quantity INT NOT NULL DEFAULT 0 COMMENT '到货数量'," +
                "supplier_id VARCHAR(36) COMMENT '供应商ID'," +
                "supplier_name VARCHAR(100) COMMENT '供应商名称'," +
                "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                "total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'," +
                "receiver_id VARCHAR(36) COMMENT '收货人ID'," +
                "receiver_name VARCHAR(100) COMMENT '收货人名称'," +
                "received_time DATETIME COMMENT '收货时间'," +
                "remark VARCHAR(500) COMMENT '备注'," +
                "order_id VARCHAR(36) COMMENT '生产订单ID'," +
                "order_no VARCHAR(50) COMMENT '生产订单号'," +
                "style_id VARCHAR(36) COMMENT '款号ID'," +
                "style_no VARCHAR(50) COMMENT '款号'," +
                "style_name VARCHAR(100) COMMENT '款名'," +
                "style_cover VARCHAR(500) COMMENT '款式图片'," +
                "return_confirmed INT DEFAULT 0 COMMENT '回料是否确认(0-否,1-是)'," +
                "return_quantity INT DEFAULT 0 COMMENT '回料数量'," +
                "return_confirmer_id VARCHAR(36) COMMENT '回料确认人ID'," +
                "return_confirmer_name VARCHAR(100) COMMENT '回料确认人名称'," +
                "return_confirm_time DATETIME COMMENT '回料确认时间'," +
                "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                "INDEX idx_order_id (order_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料采购表'";

        try {
            jdbcTemplate.execute(createMaterialPurchaseTable);
            log.info("Table t_material_purchase checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create t_material_purchase table: {}", e.getMessage());
        }

        if (!columnExists("t_material_purchase", "material_id")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN material_id VARCHAR(36) COMMENT '物料ID'");
        }

        if (!columnExists("t_material_purchase", "material_type")) {
            execSilently(
                    "ALTER TABLE t_material_purchase ADD COLUMN material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料'");
        }
        if (!columnExists("t_material_purchase", "remark")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN remark VARCHAR(500) COMMENT '备注'");
        }
        if (!columnExists("t_material_purchase", "style_id")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_id VARCHAR(36) COMMENT '款号ID'");
        }
        if (!columnExists("t_material_purchase", "style_no")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
        }
        if (!columnExists("t_material_purchase", "style_name")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_name VARCHAR(100) COMMENT '款名'");
        }
        if (!columnExists("t_material_purchase", "style_cover")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_cover VARCHAR(500) COMMENT '款式图片'");
        }
        if (!columnExists("t_material_purchase", "delete_flag")) {
            execSilently(
                    "ALTER TABLE t_material_purchase ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
        }

        if (!columnExists("t_material_purchase", "receiver_id")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN receiver_id VARCHAR(36) COMMENT '收货人ID'");
        }
        if (!columnExists("t_material_purchase", "receiver_name")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN receiver_name VARCHAR(100) COMMENT '收货人名称'");
        }
        if (!columnExists("t_material_purchase", "received_time")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN received_time DATETIME COMMENT '收货时间'");
        }

        if (!columnExists("t_material_purchase", "return_confirmed")) {
            execSilently(
                    "ALTER TABLE t_material_purchase ADD COLUMN return_confirmed INT DEFAULT 0 COMMENT '回料是否确认(0-否,1-是)'");
        }
        if (!columnExists("t_material_purchase", "return_quantity")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN return_quantity INT DEFAULT 0 COMMENT '回料数量'");
        }
        if (!columnExists("t_material_purchase", "return_confirmer_id")) {
            execSilently(
                    "ALTER TABLE t_material_purchase ADD COLUMN return_confirmer_id VARCHAR(36) COMMENT '回料确认人ID'");
        }
        if (!columnExists("t_material_purchase", "return_confirmer_name")) {
            execSilently(
                    "ALTER TABLE t_material_purchase ADD COLUMN return_confirmer_name VARCHAR(100) COMMENT '回料确认人名称'");
        }
        if (!columnExists("t_material_purchase", "return_confirm_time")) {
            execSilently("ALTER TABLE t_material_purchase ADD COLUMN return_confirm_time DATETIME COMMENT '回料确认时间'");
        }
    }

    private void ensureMaterialDatabaseTable() {
        if (tableExists("t_material_database")) {
            if (!columnExists("t_material_database", "material_type")) {
                execSilently(
                        "ALTER TABLE t_material_database ADD COLUMN material_type VARCHAR(20) DEFAULT 'accessory' COMMENT '物料类型'");
            }
            if (!columnExists("t_material_database", "specifications")) {
                execSilently("ALTER TABLE t_material_database ADD COLUMN specifications VARCHAR(100) COMMENT '规格'");
            }
            if (!columnExists("t_material_database", "unit")) {
                execSilently(
                        "ALTER TABLE t_material_database ADD COLUMN unit VARCHAR(20) NOT NULL DEFAULT '' COMMENT '单位'");
            }
            if (!columnExists("t_material_database", "supplier_name")) {
                execSilently("ALTER TABLE t_material_database ADD COLUMN supplier_name VARCHAR(100) COMMENT '供应商'");
            }
            if (!columnExists("t_material_database", "unit_price")) {
                execSilently(
                        "ALTER TABLE t_material_database ADD COLUMN unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'");
            }
            if (!columnExists("t_material_database", "description")) {
                execSilently("ALTER TABLE t_material_database ADD COLUMN description VARCHAR(255) COMMENT '描述'");
            }
            if (!columnExists("t_material_database", "image")) {
                execSilently("ALTER TABLE t_material_database ADD COLUMN image VARCHAR(500) COMMENT '图片URL'");
            }
            if (!columnExists("t_material_database", "remark")) {
                execSilently("ALTER TABLE t_material_database ADD COLUMN remark VARCHAR(500) COMMENT '备注'");
            }
            if (!columnExists("t_material_database", "status")) {
                execSilently(
                        "ALTER TABLE t_material_database ADD COLUMN status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'");
            }
            if (!columnExists("t_material_database", "completed_time")) {
                execSilently("ALTER TABLE t_material_database ADD COLUMN completed_time DATETIME COMMENT '完成时间'");
            }
            if (!columnExists("t_material_database", "return_reason")) {
                execSilently("ALTER TABLE t_material_database ADD COLUMN return_reason VARCHAR(255) COMMENT '退回原因'");
            }
            if (!columnExists("t_material_database", "delete_flag")) {
                execSilently(
                        "ALTER TABLE t_material_database ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
            }
            return;
        }

        String createTable = "CREATE TABLE IF NOT EXISTS t_material_database (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '物料ID'," +
                "material_code VARCHAR(50) NOT NULL COMMENT '物料编码'," +
                "material_name VARCHAR(100) NOT NULL COMMENT '物料名称'," +
                "style_no VARCHAR(50) COMMENT '款号'," +
                "material_type VARCHAR(20) DEFAULT 'accessory' COMMENT '物料类型'," +
                "specifications VARCHAR(100) COMMENT '规格'," +
                "unit VARCHAR(20) NOT NULL COMMENT '单位'," +
                "supplier_name VARCHAR(100) COMMENT '供应商'," +
                "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                "description VARCHAR(255) COMMENT '描述'," +
                "image VARCHAR(500) COMMENT '图片URL'," +
                "remark VARCHAR(500) COMMENT '备注'," +
                "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'," +
                "completed_time DATETIME COMMENT '完成时间'," +
                "return_reason VARCHAR(255) COMMENT '退回原因'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                "INDEX idx_material_code (material_code)," +
                "INDEX idx_style_no (style_no)," +
                "INDEX idx_supplier_name (supplier_name)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='面辅料数据库';";

        execSilently(createTable);
    }

    private void ensurePermissionTables() {
        String createRoleTable = "CREATE TABLE IF NOT EXISTS t_role (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '角色ID'," +
                "role_name VARCHAR(50) NOT NULL UNIQUE COMMENT '角色名称'," +
                "role_code VARCHAR(50) NOT NULL UNIQUE COMMENT '角色编码'," +
                "description VARCHAR(200) COMMENT '角色描述'," +
                "status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表'";

        String createPermissionTable = "CREATE TABLE IF NOT EXISTS t_permission (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '权限ID'," +
                "permission_name VARCHAR(50) NOT NULL COMMENT '权限名称'," +
                "permission_code VARCHAR(50) NOT NULL UNIQUE COMMENT '权限编码'," +
                "parent_id BIGINT DEFAULT 0 COMMENT '父权限ID'," +
                "parent_name VARCHAR(50) COMMENT '父权限名称'," +
                "permission_type VARCHAR(20) NOT NULL COMMENT '权限类型：MENU-菜单，BUTTON-按钮'," +
                "path VARCHAR(100) COMMENT '访问路径'," +
                "component VARCHAR(100) COMMENT '组件路径'," +
                "icon VARCHAR(50) COMMENT '图标'," +
                "sort INT DEFAULT 0 COMMENT '排序'," +
                "status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表'";

        String createRolePermissionTable = "CREATE TABLE IF NOT EXISTS t_role_permission (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID'," +
                "role_id BIGINT NOT NULL COMMENT '角色ID'," +
                "permission_id BIGINT NOT NULL COMMENT '权限ID'," +
                "UNIQUE KEY uk_role_permission (role_id, permission_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色权限关联表'";

        execSilently(createRoleTable);
        execSilently(createPermissionTable);
        execSilently(createRolePermissionTable);

        if (tableExists("t_permission")) {
            if (!columnExists("t_permission", "parent_id")) {
                execSilently("ALTER TABLE t_permission ADD COLUMN parent_id BIGINT DEFAULT 0 COMMENT '父权限ID'");
            }
            if (!columnExists("t_permission", "parent_name")) {
                execSilently("ALTER TABLE t_permission ADD COLUMN parent_name VARCHAR(50) COMMENT '父权限名称'");
            }
            if (!columnExists("t_permission", "permission_type")) {
                execSilently(
                        "ALTER TABLE t_permission ADD COLUMN permission_type VARCHAR(20) NOT NULL DEFAULT 'MENU' COMMENT '权限类型：MENU-菜单，BUTTON-按钮'");
            }
            if (!columnExists("t_permission", "path")) {
                execSilently("ALTER TABLE t_permission ADD COLUMN path VARCHAR(100) COMMENT '访问路径'");
            }
            if (!columnExists("t_permission", "component")) {
                execSilently("ALTER TABLE t_permission ADD COLUMN component VARCHAR(100) COMMENT '组件路径'");
            }
            if (!columnExists("t_permission", "icon")) {
                execSilently("ALTER TABLE t_permission ADD COLUMN icon VARCHAR(50) COMMENT '图标'");
            }
            if (!columnExists("t_permission", "sort")) {
                execSilently("ALTER TABLE t_permission ADD COLUMN sort INT DEFAULT 0 COMMENT '排序'");
            }
            if (!columnExists("t_permission", "status")) {
                execSilently(
                        "ALTER TABLE t_permission ADD COLUMN status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'");
            }
            if (!columnExists("t_permission", "create_time")) {
                execSilently(
                        "ALTER TABLE t_permission ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
            }
            if (!columnExists("t_permission", "update_time")) {
                execSilently(
                        "ALTER TABLE t_permission ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
            }
        }
    }

    private void seedDefaultAuthData() {
        try {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)",
                    1L, "系统管理员", "admin", "系统管理员", "active");
            jdbcTemplate.update(
                    "INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)",
                    2L, "财务人员", "finance", "财务人员", "active");
            jdbcTemplate.update(
                    "INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)",
                    3L, "生产人员", "production", "生产人员", "active");
            jdbcTemplate.update(
                    "INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)",
                    4L, "普通用户", "user", "普通用户", "active");
        } catch (Exception e) {
            log.warn("Failed to seed default roles: err={}", e.getMessage());
        }

        ensurePermission("仪表盘", "MENU_DASHBOARD", 0L, null, "menu", "/dashboard", null, 0);
        Long basicId = ensurePermission("样衣管理", "MENU_BASIC", 0L, null, "menu", null, null, 10);
        Long productionId = ensurePermission("生产管理", "MENU_PRODUCTION", 0L, null, "menu", null, null, 20);
        Long financeId = ensurePermission("财务管理", "MENU_FINANCE", 0L, null, "menu", null, null, 30);
        Long systemId = ensurePermission("系统设置", "MENU_SYSTEM", 0L, null, "menu", null, null, 40);

        if (basicId != null) {
            ensurePermission("款号资料", "MENU_STYLE_INFO", basicId, "基础资料", "menu", "/style-info", null, 11);
            ensurePermission("下单管理", "MENU_ORDER_MANAGEMENT", basicId, "基础资料", "menu", "/order-management", null, 12);
            ensurePermission("资料中心", "MENU_DATA_CENTER", basicId, "基础资料", "menu", "/data-center", null, 13);
            ensurePermission("模板中心", "MENU_TEMPLATE_CENTER", basicId, "基础资料", "menu", "/basic/template-center", null,
                    14);
        }
        if (productionId != null) {
            ensurePermission("我的订单", "MENU_PRODUCTION_LIST", productionId, "生产管理", "menu", "/production", null, 21);
            ensurePermission("物料采购", "MENU_MATERIAL_PURCHASE", productionId, "生产管理", "menu", "/production/material",
                    null, 22);
            ensurePermission("裁剪管理", "MENU_CUTTING", productionId, "生产管理", "menu", "/production/cutting", null, 23);
            ensurePermission("生产进度", "MENU_PROGRESS", productionId, "生产管理", "menu", "/production/progress-detail", null,
                    24);
            ensurePermission("质检入库", "MENU_WAREHOUSING", productionId, "生产管理", "menu", "/production/warehousing", null,
                    25);
            ensurePermissionNameByCode("MENU_WAREHOUSING", "质检入库");
        }
        if (financeId != null) {
            ensurePermission("物料对账", "MENU_MATERIAL_RECON", financeId, "财务管理", "menu",
                    "/finance/material-reconciliation", null, 32);
            ensurePermission("成品结算", "MENU_SHIPMENT_RECON", financeId, "财务管理", "menu",
                    "/finance/shipment-reconciliation", null, 33);
            ensurePermission("审批付款", "MENU_PAYMENT_APPROVAL", financeId, "财务管理", "menu", "/finance/payment-approval",
                    null, 34);
            ensurePermission("人员工序统计", "MENU_PAYROLL_OPERATOR_SUMMARY", financeId, "财务管理", "menu",
                    "/finance/payroll-operator-summary", null, 35);
        }
        if (systemId != null) {
            ensurePermission("人员管理", "MENU_USER", systemId, "系统设置", "menu", "/system/user", null, 41);
            ensurePermission("角色管理", "MENU_ROLE", systemId, "系统设置", "menu", "/system/role", null, 42);
            ensurePermission("供应商管理", "MENU_FACTORY", systemId, "系统设置", "menu", "/system/factory", null, 43);
            ensurePermission("权限管理", "MENU_PERMISSION", systemId, "系统设置", "menu", "/system/permission", null, 44);
            ensurePermission("登录日志", "MENU_LOGIN_LOG", systemId, "系统设置", "menu", "/system/login-log", null, 45);
        }

        // 功能按钮权限定义
        // 款号资料按钮权限
        ensurePermission("新增款号", "STYLE_CREATE", null, null, "button", null, null, 100);
        ensurePermission("编辑款号", "STYLE_EDIT", null, null, "button", null, null, 101);
        ensurePermission("删除款号", "STYLE_DELETE", null, null, "button", null, null, 102);
        ensurePermission("导入款号", "STYLE_IMPORT", null, null, "button", null, null, 103);
        ensurePermission("导出款号", "STYLE_EXPORT", null, null, "button", null, null, 104);

        // 订单管理按钮权限
        ensurePermission("新增订单", "ORDER_CREATE", null, null, "button", null, null, 110);
        ensurePermission("编辑订单", "ORDER_EDIT", null, null, "button", null, null, 111);
        ensurePermission("删除订单", "ORDER_DELETE", null, null, "button", null, null, 112);
        ensurePermission("取消订单", "ORDER_CANCEL", null, null, "button", null, null, 113);
        ensurePermission("完成订单", "ORDER_COMPLETE", null, null, "button", null, null, 114);
        ensurePermission("导入订单", "ORDER_IMPORT", null, null, "button", null, null, 115);
        ensurePermission("导出订单", "ORDER_EXPORT", null, null, "button", null, null, 116);
        ensurePermission("订单转移", "ORDER_TRANSFER", null, null, "button", null, null, 117);

        // 物料采购按钮权限
        ensurePermission("新增采购单", "PURCHASE_CREATE", null, null, "button", null, null, 120);
        ensurePermission("编辑采购单", "PURCHASE_EDIT", null, null, "button", null, null, 121);
        ensurePermission("删除采购单", "PURCHASE_DELETE", null, null, "button", null, null, 122);
        ensurePermission("领取采购任务", "PURCHASE_RECEIVE", null, null, "button", null, null, 123);
        ensurePermission("回料确认", "PURCHASE_RETURN_CONFIRM", null, null, "button", null, null, 124);
        ensurePermission("生成采购单", "PURCHASE_GENERATE", null, null, "button", null, null, 125);

        // 裁剪管理按钮权限
        ensurePermission("新增裁剪", "CUTTING_CREATE", null, null, "button", null, null, 130);
        ensurePermission("编辑裁剪", "CUTTING_EDIT", null, null, "button", null, null, 131);
        ensurePermission("删除裁剪", "CUTTING_DELETE", null, null, "button", null, null, 132);
        ensurePermission("裁剪扫码", "CUTTING_SCAN", null, null, "button", null, null, 133);

        // 生产进度按钮权限
        ensurePermission("进度扫码", "PROGRESS_SCAN", null, null, "button", null, null, 140);
        ensurePermission("编辑进度", "PROGRESS_EDIT", null, null, "button", null, null, 141);
        ensurePermission("删除进度", "PROGRESS_DELETE", null, null, "button", null, null, 142);

        // 质检入库按钮权限
        ensurePermission("新增入库", "WAREHOUSING_CREATE", null, null, "button", null, null, 150);
        ensurePermission("编辑入库", "WAREHOUSING_EDIT", null, null, "button", null, null, 151);
        ensurePermission("删除入库", "WAREHOUSING_DELETE", null, null, "button", null, null, 152);
        ensurePermission("入库回退", "WAREHOUSING_ROLLBACK", null, null, "button", null, null, 153);

        // 物料对账按钮权限
        ensurePermission("新增对账单", "MATERIAL_RECON_CREATE", null, null, "button", null, null, 160);
        ensurePermission("编辑对账单", "MATERIAL_RECON_EDIT", null, null, "button", null, null, 161);
        ensurePermission("删除对账单", "MATERIAL_RECON_DELETE", null, null, "button", null, null, 162);
        ensurePermission("审核对账单", "MATERIAL_RECON_AUDIT", null, null, "button", null, null, 163);
        ensurePermission("结算对账单", "MATERIAL_RECON_SETTLEMENT", null, null, "button", null, null, 164);

        // 成品结算按钮权限
        ensurePermission("新增结算单", "SHIPMENT_RECON_CREATE", null, null, "button", null, null, 170);
        ensurePermission("编辑结算单", "SHIPMENT_RECON_EDIT", null, null, "button", null, null, 171);
        ensurePermission("删除结算单", "SHIPMENT_RECON_DELETE", null, null, "button", null, null, 172);
        ensurePermission("审核结算单", "SHIPMENT_RECON_AUDIT", null, null, "button", null, null, 173);

        // 审批付款按钮权限
        ensurePermission("审批付款", "PAYMENT_APPROVE", null, null, "button", null, null, 180);
        ensurePermission("拒绝付款", "PAYMENT_REJECT", null, null, "button", null, null, 181);
        ensurePermission("取消付款", "PAYMENT_CANCEL", null, null, "button", null, null, 182);

        // 系统管理按钮权限
        ensurePermission("新增用户", "USER_CREATE", null, null, "button", null, null, 190);
        ensurePermission("编辑用户", "USER_EDIT", null, null, "button", null, null, 191);
        ensurePermission("删除用户", "USER_DELETE", null, null, "button", null, null, 192);
        ensurePermission("重置密码", "USER_RESET_PASSWORD", null, null, "button", null, null, 193);

        ensurePermission("新增角色", "ROLE_CREATE", null, null, "button", null, null, 200);
        ensurePermission("编辑角色", "ROLE_EDIT", null, null, "button", null, null, 201);
        ensurePermission("删除角色", "ROLE_DELETE", null, null, "button", null, null, 202);

        ensurePermission("新增供应商", "FACTORY_CREATE", null, null, "button", null, null, 210);
        ensurePermission("编辑供应商", "FACTORY_EDIT", null, null, "button", null, null, 211);
        ensurePermission("删除供应商", "FACTORY_DELETE", null, null, "button", null, null, 212);

        // 数据导入导出权限
        ensurePermission("数据导入", "DATA_IMPORT", null, null, "button", null, null, 220);
        ensurePermission("数据导出", "DATA_EXPORT", null, null, "button", null, null, 221);

        // 模板中心权限
        ensurePermission("上传模板", "TEMPLATE_UPLOAD", null, null, "button", null, null, 230);
        ensurePermission("删除模板", "TEMPLATE_DELETE", null, null, "button", null, null, 231);

        try {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO t_role_permission (role_id, permission_id) SELECT 1, id FROM t_permission");
        } catch (Exception e) {
            log.warn("Failed to seed role permissions: err={}", e.getMessage());
        }
    }

    private Long ensurePermission(String name, String code, Long parentId, String parentName, String type, String path,
            String component, int sort) {
        try {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO t_permission (permission_name, permission_code, parent_id, parent_name, permission_type, path, component, icon, sort, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    name,
                    code,
                    parentId == null ? 0L : parentId,
                    parentName,
                    type,
                    path,
                    component,
                    null,
                    sort,
                    "active");
        } catch (Exception e) {
            log.warn("Failed to ensure permission: code={}, name={}, err={}", code, name, e.getMessage());
        }

        try {
            return jdbcTemplate.queryForObject("SELECT id FROM t_permission WHERE permission_code = ?", Long.class,
                    code);
        } catch (Exception e) {
            return null;
        }
    }

    private void ensureScanRecordTable() {
        if (tableExists("t_scan_record")) {
            if (columnExists("t_scan_record", "production_order_no")
                    || columnExists("t_scan_record", "production_order_id")) {
                execSilently("DROP TABLE IF EXISTS t_scan_record_bak");
                execSilently("RENAME TABLE t_scan_record TO t_scan_record_bak");
            }
        }

        if (!tableExists("t_scan_record")) {
            String sqlFromInit = loadCreateTableStatementFromInitSql("t_scan_record");
            if (sqlFromInit != null) {
                try {
                    jdbcTemplate.execute(sqlFromInit);
                    log.info("Table t_scan_record checked/created.");
                } catch (Exception e) {
                    log.warn("Failed to create t_scan_record table from init.sql: {}", e.getMessage());
                }
            }
            return;
        }

        execSilently("ALTER TABLE t_scan_record MODIFY COLUMN id VARCHAR(36)");

        if (!columnExists("t_scan_record", "scan_code")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN scan_code VARCHAR(200) COMMENT '扫码内容'");
        } else {
            execSilently("ALTER TABLE t_scan_record MODIFY COLUMN scan_code VARCHAR(200) COMMENT '扫码内容'");
        }
        if (!columnExists("t_scan_record", "request_id")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN request_id VARCHAR(64) COMMENT '幂等请求ID'");
        }
        if (!columnExists("t_scan_record", "order_id")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN order_id VARCHAR(36) COMMENT '订单ID'");
        }
        if (!columnExists("t_scan_record", "order_no")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN order_no VARCHAR(50) COMMENT '订单号'");
        }
        if (!columnExists("t_scan_record", "style_id")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN style_id VARCHAR(36) COMMENT '款号ID'");
        }
        if (!columnExists("t_scan_record", "style_no")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
        }
        if (!columnExists("t_scan_record", "color")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN color VARCHAR(50) COMMENT '颜色'");
        }
        if (!columnExists("t_scan_record", "quantity")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN quantity INT NOT NULL DEFAULT 0 COMMENT '数量'");
        }
        if (!columnExists("t_scan_record", "unit_price")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN unit_price DECIMAL(10,2) COMMENT '单价'");
        }
        if (!columnExists("t_scan_record", "total_amount")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN total_amount DECIMAL(10,2) COMMENT '金额'");
        }
        if (!columnExists("t_scan_record", "settlement_status")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN settlement_status VARCHAR(20) COMMENT '核算状态'");
        }
        if (!columnExists("t_scan_record", "payroll_settlement_id")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN payroll_settlement_id VARCHAR(36) COMMENT '工资结算单ID'");
        }
        if (!columnExists("t_scan_record", "process_code")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN process_code VARCHAR(50) COMMENT '工序编码'");
        }
        if (!columnExists("t_scan_record", "process_name")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN process_name VARCHAR(100) COMMENT '工序名称'");
        }
        if (!columnExists("t_scan_record", "progress_stage")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN progress_stage VARCHAR(100) COMMENT '进度环节'");
        }
        if (!columnExists("t_scan_record", "operator_id")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN operator_id VARCHAR(36) COMMENT '操作员ID'");
        }
        if (!columnExists("t_scan_record", "operator_name")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN operator_name VARCHAR(50) COMMENT '操作员名称'");
        }
        if (!columnExists("t_scan_record", "scan_type")) {
            execSilently(
                    "ALTER TABLE t_scan_record ADD COLUMN scan_type VARCHAR(20) DEFAULT 'production' COMMENT '扫码类型'");
        }
        if (!columnExists("t_scan_record", "scan_result")) {
            execSilently(
                    "ALTER TABLE t_scan_record ADD COLUMN scan_result VARCHAR(20) DEFAULT 'success' COMMENT '扫码结果'");
        }
        if (!columnExists("t_scan_record", "remark")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN remark VARCHAR(255) COMMENT '备注'");
        }
        if (!columnExists("t_scan_record", "cutting_bundle_id")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN cutting_bundle_id VARCHAR(36) COMMENT '裁剪扎号ID'");
        }
        if (!columnExists("t_scan_record", "cutting_bundle_no")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN cutting_bundle_no INT COMMENT '裁剪扎号序号'");
        }
        if (!columnExists("t_scan_record", "cutting_bundle_qr_code")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN cutting_bundle_qr_code VARCHAR(200) COMMENT '裁剪扎号二维码'");
        }
        if (!columnExists("t_scan_record", "size")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN size VARCHAR(50) COMMENT '码数'");
        }
        if (!columnExists("t_scan_record", "scan_time")) {
            execSilently(
                    "ALTER TABLE t_scan_record ADD COLUMN scan_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '扫码时间'");
        }
        if (!columnExists("t_scan_record", "scan_ip")) {
            execSilently("ALTER TABLE t_scan_record ADD COLUMN scan_ip VARCHAR(20) COMMENT '扫码IP'");
        }
        if (!columnExists("t_scan_record", "create_time")) {
            execSilently(
                    "ALTER TABLE t_scan_record ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
        }
        if (!columnExists("t_scan_record", "update_time")) {
            execSilently(
                    "ALTER TABLE t_scan_record ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
        }

        if (columnExists("t_scan_record", "progress_stage") && columnExists("t_scan_record", "process_name")) {
            execSilently(
                    "UPDATE t_scan_record SET progress_stage = process_name WHERE (progress_stage IS NULL OR progress_stage = '') AND process_name IS NOT NULL AND process_name <> ''");
        }

        dropIndexIfExists("t_scan_record", "uk_scan_code_process");
        addUniqueKeyIfAbsent("t_scan_record", "uk_scan_request_id", "request_id");
        addUniqueKeyIfAbsent("t_scan_record", "uk_bundle_stage", "cutting_bundle_id, scan_type, progress_stage");
        addUniqueKeyIfAbsent("t_scan_record", "uk_bundle_stage_progress",
                "cutting_bundle_id, scan_type, progress_stage");
        addIndexIfAbsent("t_scan_record", "idx_request_id", "request_id");
        addIndexIfAbsent("t_scan_record", "idx_payroll_settlement_id", "payroll_settlement_id");
    }

    private void ensurePayrollSettlementTable() {
        if (!tableExists("t_payroll_settlement")) {
            String sqlFromInit = loadCreateTableStatementFromInitSql("t_payroll_settlement");
            if (sqlFromInit != null) {
                try {
                    jdbcTemplate.execute(sqlFromInit);
                    log.info("Table t_payroll_settlement checked/created.");
                } catch (Exception e) {
                    log.warn("Failed to create t_payroll_settlement table from init.sql: {}", e.getMessage());
                }
            }
            return;
        }

        execSilently("ALTER TABLE t_payroll_settlement MODIFY COLUMN id VARCHAR(36)");
        if (!columnExists("t_payroll_settlement", "settlement_no")) {
            execSilently(
                    "ALTER TABLE t_payroll_settlement ADD COLUMN settlement_no VARCHAR(50) NOT NULL COMMENT '结算单号'");
        }
        if (!columnExists("t_payroll_settlement", "order_id")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN order_id VARCHAR(36) COMMENT '订单ID'");
        }
        if (!columnExists("t_payroll_settlement", "order_no")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN order_no VARCHAR(50) COMMENT '订单号'");
        }
        if (!columnExists("t_payroll_settlement", "style_id")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN style_id VARCHAR(36) COMMENT '款号ID'");
        }
        if (!columnExists("t_payroll_settlement", "style_no")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
        }
        if (!columnExists("t_payroll_settlement", "style_name")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN style_name VARCHAR(100) COMMENT '款名'");
        }
        if (!columnExists("t_payroll_settlement", "start_time")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN start_time DATETIME COMMENT '开始时间'");
        }
        if (!columnExists("t_payroll_settlement", "end_time")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN end_time DATETIME COMMENT '结束时间'");
        }
        if (!columnExists("t_payroll_settlement", "total_quantity")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN total_quantity INT DEFAULT 0 COMMENT '总数量'");
        }
        if (!columnExists("t_payroll_settlement", "total_amount")) {
            execSilently(
                    "ALTER TABLE t_payroll_settlement ADD COLUMN total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'");
        }
        if (!columnExists("t_payroll_settlement", "status")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN status VARCHAR(20) COMMENT '状态'");
        }
        if (!columnExists("t_payroll_settlement", "remark")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN remark VARCHAR(255) COMMENT '备注'");
        }
        if (!columnExists("t_payroll_settlement", "create_time")) {
            execSilently(
                    "ALTER TABLE t_payroll_settlement ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
        }
        if (!columnExists("t_payroll_settlement", "update_time")) {
            execSilently(
                    "ALTER TABLE t_payroll_settlement ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
        }
        if (!columnExists("t_payroll_settlement", "create_by")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN create_by VARCHAR(36) COMMENT '创建人'");
        }
        if (!columnExists("t_payroll_settlement", "update_by")) {
            execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN update_by VARCHAR(36) COMMENT '更新人'");
        }

        addUniqueKeyIfAbsent("t_payroll_settlement", "uk_payroll_settlement_no", "settlement_no");
        addIndexIfAbsent("t_payroll_settlement", "idx_payroll_order_no", "order_no");
        addIndexIfAbsent("t_payroll_settlement", "idx_payroll_style_no", "style_no");
        addIndexIfAbsent("t_payroll_settlement", "idx_payroll_create_time", "create_time");
    }

    private void ensurePayrollSettlementItemTable() {
        if (!tableExists("t_payroll_settlement_item")) {
            String sqlFromInit = loadCreateTableStatementFromInitSql("t_payroll_settlement_item");
            if (sqlFromInit != null) {
                try {
                    jdbcTemplate.execute(sqlFromInit);
                    log.info("Table t_payroll_settlement_item checked/created.");
                } catch (Exception e) {
                    log.warn("Failed to create t_payroll_settlement_item table from init.sql: {}", e.getMessage());
                }
            }
            return;
        }

        execSilently("ALTER TABLE t_payroll_settlement_item MODIFY COLUMN id VARCHAR(36)");
        if (!columnExists("t_payroll_settlement_item", "settlement_id")) {
            execSilently(
                    "ALTER TABLE t_payroll_settlement_item ADD COLUMN settlement_id VARCHAR(36) NOT NULL COMMENT '结算单ID'");
        }
        if (!columnExists("t_payroll_settlement_item", "operator_id")) {
            execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN operator_id VARCHAR(36) COMMENT '人员ID'");
        }
        if (!columnExists("t_payroll_settlement_item", "operator_name")) {
            execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN operator_name VARCHAR(50) COMMENT '人员名称'");
        }
        if (!columnExists("t_payroll_settlement_item", "process_name")) {
            execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN process_name VARCHAR(100) COMMENT '工序名称'");
        }
        if (!columnExists("t_payroll_settlement_item", "quantity")) {
            execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN quantity INT DEFAULT 0 COMMENT '数量'");
        }
        if (!columnExists("t_payroll_settlement_item", "unit_price")) {
            execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN unit_price DECIMAL(10,2) COMMENT '单价'");
        }
        if (!columnExists("t_payroll_settlement_item", "total_amount")) {
            execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN total_amount DECIMAL(10,2) COMMENT '总金额'");
        }
        if (!columnExists("t_payroll_settlement_item", "order_id")) {
            execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN order_id VARCHAR(36) COMMENT '订单ID'");
        }
        if (!columnExists("t_payroll_settlement_item", "order_no")) {
            execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN order_no VARCHAR(50) COMMENT '订单号'");
        }
        if (!columnExists("t_payroll_settlement_item", "style_no")) {
            execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
        }
        if (!columnExists("t_payroll_settlement_item", "scan_type")) {
            execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN scan_type VARCHAR(20) COMMENT '扫码类型'");
        }
        if (!columnExists("t_payroll_settlement_item", "create_time")) {
            execSilently(
                    "ALTER TABLE t_payroll_settlement_item ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
        }
        if (!columnExists("t_payroll_settlement_item", "update_time")) {
            execSilently(
                    "ALTER TABLE t_payroll_settlement_item ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
        }

        addIndexIfAbsent("t_payroll_settlement_item", "idx_payroll_item_settlement_id", "settlement_id");
        addIndexIfAbsent("t_payroll_settlement_item", "idx_payroll_item_operator_id", "operator_id");
        addIndexIfAbsent("t_payroll_settlement_item", "idx_payroll_item_order_no", "order_no");
        addIndexIfAbsent("t_payroll_settlement_item", "idx_payroll_item_style_no", "style_no");
    }

    private void ensureCuttingBundleTable() {
        if (!tableExists("t_cutting_bundle")) {
            String sqlFromInit = loadCreateTableStatementFromInitSql("t_cutting_bundle");
            if (sqlFromInit != null) {
                try {
                    jdbcTemplate.execute(sqlFromInit);
                    log.info("Table t_cutting_bundle checked/created.");
                    return;
                } catch (Exception e) {
                    log.warn("Failed to create t_cutting_bundle table from init.sql: {}", e.getMessage());
                }
            }

            String createCuttingBundleTable = "CREATE TABLE IF NOT EXISTS t_cutting_bundle (" +
                    "id VARCHAR(36) PRIMARY KEY COMMENT '扎号ID'," +
                    "production_order_id VARCHAR(36) NOT NULL COMMENT '生产订单ID'," +
                    "production_order_no VARCHAR(50) NOT NULL COMMENT '生产订单号'," +
                    "style_id VARCHAR(36) NOT NULL COMMENT '款号ID'," +
                    "style_no VARCHAR(50) NOT NULL COMMENT '款号'," +
                    "color VARCHAR(50) COMMENT '颜色'," +
                    "size VARCHAR(50) COMMENT '码数'," +
                    "bundle_no INT NOT NULL COMMENT '扎号序号'," +
                    "quantity INT NOT NULL DEFAULT 0 COMMENT '数量'," +
                    "qr_code VARCHAR(200) NOT NULL UNIQUE COMMENT '二维码内容'," +
                    "status VARCHAR(20) DEFAULT 'created' COMMENT '状态'," +
                    "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                    "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                    "INDEX idx_order_id (production_order_id)," +
                    "INDEX idx_order_no (production_order_no)," +
                    "INDEX idx_style_no (style_no)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='裁剪扎号表'";

            try {
                jdbcTemplate.execute(createCuttingBundleTable);
                log.info("Table t_cutting_bundle checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_cutting_bundle table: {}", e.getMessage());
            }

            return;
        }

        if (!columnExists("t_cutting_bundle", "qr_code")) {
            execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN qr_code VARCHAR(200) NOT NULL COMMENT '二维码内容'");
        }
        if (!columnExists("t_cutting_bundle", "production_order_id")) {
            execSilently(
                    "ALTER TABLE t_cutting_bundle ADD COLUMN production_order_id VARCHAR(36) NOT NULL COMMENT '生产订单ID'");
        }
        if (!columnExists("t_cutting_bundle", "production_order_no")) {
            execSilently(
                    "ALTER TABLE t_cutting_bundle ADD COLUMN production_order_no VARCHAR(50) NOT NULL COMMENT '生产订单号'");
        }
        if (!columnExists("t_cutting_bundle", "style_id")) {
            execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN style_id VARCHAR(36) NOT NULL COMMENT '款号ID'");
        }
        if (!columnExists("t_cutting_bundle", "style_no")) {
            execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN style_no VARCHAR(50) NOT NULL COMMENT '款号'");
        }
        if (!columnExists("t_cutting_bundle", "bundle_no")) {
            execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN bundle_no INT NOT NULL COMMENT '扎号序号'");
        }
        if (!columnExists("t_cutting_bundle", "quantity")) {
            execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN quantity INT NOT NULL DEFAULT 0 COMMENT '数量'");
        }
        if (!columnExists("t_cutting_bundle", "status")) {
            execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN status VARCHAR(20) DEFAULT 'created' COMMENT '状态'");
        }
        if (!columnExists("t_cutting_bundle", "create_time")) {
            execSilently(
                    "ALTER TABLE t_cutting_bundle ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
        }
        if (!columnExists("t_cutting_bundle", "update_time")) {
            execSilently(
                    "ALTER TABLE t_cutting_bundle ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
        }
    }

    private void ensureProductionOrderTable() {
        if (!tableExists("t_production_order")) {
            return;
        }
        if (!columnExists("t_production_order", "qr_code")) {
            execSilently("ALTER TABLE t_production_order ADD COLUMN qr_code VARCHAR(100) COMMENT '订单二维码内容'");
        }
        if (!columnExists("t_production_order", "color")) {
            execSilently("ALTER TABLE t_production_order ADD COLUMN color VARCHAR(50) COMMENT '颜色'");
        }
        if (!columnExists("t_production_order", "size")) {
            execSilently("ALTER TABLE t_production_order ADD COLUMN size VARCHAR(50) COMMENT '码数'");
        }
        if (!columnExists("t_production_order", "order_details")) {
            execSilently("ALTER TABLE t_production_order ADD COLUMN order_details LONGTEXT COMMENT '订单明细JSON'");
        }

        if (!columnExists("t_production_order", "progress_workflow_json")) {
            execSilently(
                    "ALTER TABLE t_production_order ADD COLUMN progress_workflow_json LONGTEXT COMMENT '进度节点定义JSON'");
        }
        if (!columnExists("t_production_order", "progress_workflow_locked")) {
            execSilently(
                    "ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked INT NOT NULL DEFAULT 0 COMMENT '进度节点是否锁定：0-否，1-是'");
        }
        if (!columnExists("t_production_order", "progress_workflow_locked_at")) {
            execSilently(
                    "ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_at DATETIME COMMENT '进度节点锁定时间'");
        }
        if (!columnExists("t_production_order", "progress_workflow_locked_by")) {
            execSilently(
                    "ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_by VARCHAR(36) COMMENT '进度节点锁定人ID'");
        }
        if (!columnExists("t_production_order", "progress_workflow_locked_by_name")) {
            execSilently(
                    "ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_by_name VARCHAR(50) COMMENT '进度节点锁定人'");
        }
    }

    private void ensureProductWarehousingTable() {
        if (!tableExists("t_product_warehousing")) {
            String createProductWarehousingTable = "CREATE TABLE IF NOT EXISTS t_product_warehousing (" +
                    "id VARCHAR(36) PRIMARY KEY COMMENT '入库ID'," +
                    "warehousing_no VARCHAR(50) NOT NULL COMMENT '入库单号'," +
                    "order_id VARCHAR(36) NOT NULL COMMENT '生产订单ID'," +
                    "order_no VARCHAR(50) NOT NULL COMMENT '生产订单号'," +
                    "style_id VARCHAR(36) NOT NULL COMMENT '款号ID'," +
                    "style_no VARCHAR(50) NOT NULL COMMENT '款号'," +
                    "style_name VARCHAR(100) NOT NULL COMMENT '款名'," +
                    "warehousing_quantity INT NOT NULL DEFAULT 0 COMMENT '入库数量'," +
                    "qualified_quantity INT NOT NULL DEFAULT 0 COMMENT '合格数量'," +
                    "unqualified_quantity INT NOT NULL DEFAULT 0 COMMENT '不合格数量'," +
                    "warehousing_type VARCHAR(20) DEFAULT 'manual' COMMENT '入库类型'," +
                    "warehouse VARCHAR(50) COMMENT '仓库'," +
                    "quality_status VARCHAR(20) DEFAULT 'qualified' COMMENT '质检状态'," +
                    "cutting_bundle_id VARCHAR(36) COMMENT '裁剪扎号ID'," +
                    "cutting_bundle_no INT COMMENT '裁剪扎号序号'," +
                    "cutting_bundle_qr_code VARCHAR(200) COMMENT '裁剪扎号二维码内容'," +
                    "unqualified_image_urls TEXT COMMENT '不合格图片URL列表'," +
                    "defect_category VARCHAR(64) COMMENT '次品类别'," +
                    "defect_remark VARCHAR(500) COMMENT '次品备注'," +
                    "repair_remark VARCHAR(255) COMMENT '返修备注'," +
                    "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                    "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                    "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                    "INDEX idx_order_id (order_id)," +
                    "INDEX idx_order_no (order_no)," +
                    "INDEX idx_style_no (style_no)," +
                    "INDEX idx_create_time (create_time)," +
                    "INDEX idx_cutting_bundle_id (cutting_bundle_id)," +
                    "INDEX idx_warehousing_no (warehousing_no)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='质检入库表'";

            try {
                jdbcTemplate.execute(createProductWarehousingTable);
                log.info("Table t_product_warehousing checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_product_warehousing table: {}", e.getMessage());
            }

            return;
        }

        if (columnExists("t_product_warehousing", "warehouse_no")
                && !columnExists("t_product_warehousing", "warehousing_no")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing CHANGE warehouse_no warehousing_no VARCHAR(50) NOT NULL COMMENT '入库单号'");
        }
        if (columnExists("t_product_warehousing", "production_order_id")
                && !columnExists("t_product_warehousing", "order_id")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing CHANGE production_order_id order_id VARCHAR(36) NOT NULL COMMENT '生产订单ID'");
        }
        if (columnExists("t_product_warehousing", "production_order_no")
                && !columnExists("t_product_warehousing", "order_no")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing CHANGE production_order_no order_no VARCHAR(50) NOT NULL COMMENT '生产订单号'");
        }
        if (columnExists("t_product_warehousing", "quantity")
                && !columnExists("t_product_warehousing", "warehousing_quantity")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing CHANGE quantity warehousing_quantity INT NOT NULL DEFAULT 0 COMMENT '入库数量'");
        }

        execSilently("ALTER TABLE t_product_warehousing MODIFY COLUMN id VARCHAR(36)");

        if (!columnExists("t_product_warehousing", "warehousing_no")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN warehousing_no VARCHAR(50) NOT NULL COMMENT '入库单号'");
        }

        try {
            java.util.List<java.util.Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT DISTINCT INDEX_NAME FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 't_product_warehousing' AND column_name = 'warehousing_no' AND non_unique = 0");
            if (rows != null) {
                for (java.util.Map<String, Object> r : rows) {
                    if (r == null) {
                        continue;
                    }
                    String idx = r.get("INDEX_NAME") == null ? null : String.valueOf(r.get("INDEX_NAME"));
                    idx = idx == null ? null : idx.trim();
                    if (!org.springframework.util.StringUtils.hasText(idx)) {
                        continue;
                    }
                    if ("PRIMARY".equalsIgnoreCase(idx)) {
                        continue;
                    }
                    execSilently("ALTER TABLE t_product_warehousing DROP INDEX " + idx);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to cleanup warehousing unique indexes: err={}", e.getMessage());
        }
        if (!columnExists("t_product_warehousing", "order_id")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN order_id VARCHAR(36) NOT NULL DEFAULT '' COMMENT '生产订单ID'");
        }
        if (!columnExists("t_product_warehousing", "order_no")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN order_no VARCHAR(50) NOT NULL DEFAULT '' COMMENT '生产订单号'");
        }
        if (!columnExists("t_product_warehousing", "style_id")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN style_id VARCHAR(36) NOT NULL DEFAULT '' COMMENT '款号ID'");
        }
        if (!columnExists("t_product_warehousing", "style_no")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN style_no VARCHAR(50) NOT NULL DEFAULT '' COMMENT '款号'");
        }
        if (!columnExists("t_product_warehousing", "style_name")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN style_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '款名'");
        }
        if (!columnExists("t_product_warehousing", "warehousing_quantity")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN warehousing_quantity INT NOT NULL DEFAULT 0 COMMENT '入库数量'");
        }
        if (!columnExists("t_product_warehousing", "qualified_quantity")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN qualified_quantity INT NOT NULL DEFAULT 0 COMMENT '合格数量'");
        }
        if (!columnExists("t_product_warehousing", "unqualified_quantity")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN unqualified_quantity INT NOT NULL DEFAULT 0 COMMENT '不合格数量'");
        }
        if (!columnExists("t_product_warehousing", "receiver_id")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN receiver_id VARCHAR(36) NULL COMMENT '领取人ID'");
        }
        if (!columnExists("t_product_warehousing", "receiver_name")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN receiver_name VARCHAR(50) NULL COMMENT '领取人名称'");
        }
        if (!columnExists("t_product_warehousing", "received_time")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN received_time DATETIME NULL COMMENT '领取时间'");
        }
        if (!columnExists("t_product_warehousing", "inspection_status")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN inspection_status VARCHAR(20) NULL COMMENT '验收状态'"
                            + " AFTER repair_remark");
        }
        if (!columnExists("t_product_warehousing", "warehousing_type")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN warehousing_type VARCHAR(20) DEFAULT 'manual' COMMENT '入库类型'");
        }
        if (!columnExists("t_product_warehousing", "warehouse")) {
            execSilently("ALTER TABLE t_product_warehousing ADD COLUMN warehouse VARCHAR(50) COMMENT '仓库'");
        }
        if (!columnExists("t_product_warehousing", "quality_status")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN quality_status VARCHAR(20) DEFAULT 'qualified' COMMENT '质检状态'");
        }
        if (!columnExists("t_product_warehousing", "cutting_bundle_id")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN cutting_bundle_id VARCHAR(36) COMMENT '裁剪扎号ID'");
        }
        if (!columnExists("t_product_warehousing", "cutting_bundle_no")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN cutting_bundle_no INT COMMENT '裁剪扎号序号'");
        }
        if (!columnExists("t_product_warehousing", "cutting_bundle_qr_code")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN cutting_bundle_qr_code VARCHAR(200) COMMENT '裁剪扎号二维码内容'");
        }
        if (!columnExists("t_product_warehousing", "unqualified_image_urls")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN unqualified_image_urls TEXT COMMENT '不合格图片URL列表'");
        }
        if (!columnExists("t_product_warehousing", "defect_category")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN defect_category VARCHAR(64) COMMENT '次品类别'");
        }
        if (!columnExists("t_product_warehousing", "defect_remark")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN defect_remark VARCHAR(500) COMMENT '次品备注'");
        }
        if (!columnExists("t_product_warehousing", "repair_remark")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN repair_remark VARCHAR(255) COMMENT '返修备注'");
        }
        if (!columnExists("t_product_warehousing", "create_time")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
        }
        if (!columnExists("t_product_warehousing", "update_time")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
        }
        if (!columnExists("t_product_warehousing", "delete_flag")) {
            execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
        }

        addIndexIfAbsent("t_product_warehousing", "idx_order_id", "order_id");
        addIndexIfAbsent("t_product_warehousing", "idx_order_no", "order_no");
        addIndexIfAbsent("t_product_warehousing", "idx_style_no", "style_no");
        addIndexIfAbsent("t_product_warehousing", "idx_create_time", "create_time");
        addIndexIfAbsent("t_product_warehousing", "idx_cutting_bundle_id", "cutting_bundle_id");
        addIndexIfAbsent("t_product_warehousing", "idx_warehousing_no", "warehousing_no");
    }

    private void ensureProductOutstockTable() {
        if (!tableExists("t_product_outstock")) {
            String createProductOutstockTable = "CREATE TABLE IF NOT EXISTS t_product_outstock (" +
                    "id VARCHAR(36) PRIMARY KEY COMMENT '出库ID'," +
                    "outstock_no VARCHAR(50) NOT NULL UNIQUE COMMENT '出库单号'," +
                    "order_id VARCHAR(36) NOT NULL COMMENT '订单ID'," +
                    "order_no VARCHAR(50) NOT NULL COMMENT '订单号'," +
                    "style_id VARCHAR(36) COMMENT '款号ID'," +
                    "style_no VARCHAR(50) COMMENT '款号'," +
                    "style_name VARCHAR(100) COMMENT '款名'," +
                    "outstock_quantity INT NOT NULL DEFAULT 0 COMMENT '出库数量'," +
                    "outstock_type VARCHAR(20) DEFAULT 'shipment' COMMENT '出库类型'," +
                    "warehouse VARCHAR(50) COMMENT '仓库'," +
                    "remark VARCHAR(255) COMMENT '备注'," +
                    "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                    "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                    "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                    "INDEX idx_order_id (order_id)," +
                    "INDEX idx_order_no (order_no)," +
                    "INDEX idx_style_no (style_no)," +
                    "INDEX idx_create_time (create_time)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成品出库表'";

            try {
                jdbcTemplate.execute(createProductOutstockTable);
                log.info("Table t_product_outstock checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_product_outstock table: {}", e.getMessage());
            }
            return;
        }

        execSilently("ALTER TABLE t_product_outstock MODIFY COLUMN id VARCHAR(36)");
        if (!columnExists("t_product_outstock", "outstock_no")) {
            execSilently(
                    "ALTER TABLE t_product_outstock ADD COLUMN outstock_no VARCHAR(50) NOT NULL UNIQUE COMMENT '出库单号'");
        }
        if (!columnExists("t_product_outstock", "outstock_type")) {
            execSilently(
                    "ALTER TABLE t_product_outstock ADD COLUMN outstock_type VARCHAR(20) DEFAULT 'shipment' COMMENT '出库类型'");
        }
        if (!columnExists("t_product_outstock", "delete_flag")) {
            execSilently(
                    "ALTER TABLE t_product_outstock ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
        }
    }

    private void ensureCuttingTaskTable() {
        if (!tableExists("t_cutting_task")) {
            String createCuttingTaskTable = "CREATE TABLE IF NOT EXISTS t_cutting_task (" +
                    "id VARCHAR(36) PRIMARY KEY COMMENT '裁剪任务ID'," +
                    "production_order_id VARCHAR(36) NOT NULL COMMENT '生产订单ID'," +
                    "production_order_no VARCHAR(50) NOT NULL COMMENT '生产订单号'," +
                    "order_qr_code VARCHAR(100) COMMENT '订单二维码内容'," +
                    "style_id VARCHAR(36) NOT NULL COMMENT '款号ID'," +
                    "style_no VARCHAR(50) NOT NULL COMMENT '款号'," +
                    "style_name VARCHAR(100) COMMENT '款名'," +
                    "color VARCHAR(50) COMMENT '颜色'," +
                    "size VARCHAR(50) COMMENT '码数'," +
                    "order_quantity INT DEFAULT 0 COMMENT '订单数量'," +
                    "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'," +
                    "receiver_id VARCHAR(36) COMMENT '领取人ID'," +
                    "receiver_name VARCHAR(50) COMMENT '领取人'," +
                    "received_time DATETIME COMMENT '领取时间'," +
                    "bundled_time DATETIME COMMENT '生成裁剪单时间'," +
                    "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                    "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                    "UNIQUE KEY uk_order_id (production_order_id)," +
                    "INDEX idx_order_no (production_order_no)," +
                    "INDEX idx_style_no (style_no)," +
                    "INDEX idx_status (status)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='裁剪任务表'";

            try {
                jdbcTemplate.execute(createCuttingTaskTable);
                log.info("Table t_cutting_task checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_cutting_task table: {}", e.getMessage());
            }

            return;
        }

        if (!columnExists("t_cutting_task", "order_qr_code")) {
            execSilently("ALTER TABLE t_cutting_task ADD COLUMN order_qr_code VARCHAR(100) COMMENT '订单二维码内容'");
        }
        if (!columnExists("t_cutting_task", "bundled_time")) {
            execSilently("ALTER TABLE t_cutting_task ADD COLUMN bundled_time DATETIME COMMENT '生成裁剪单时间'");
        }
        if (!columnExists("t_cutting_task", "color")) {
            execSilently("ALTER TABLE t_cutting_task ADD COLUMN color VARCHAR(50) COMMENT '颜色'");
        }
        if (!columnExists("t_cutting_task", "size")) {
            execSilently("ALTER TABLE t_cutting_task ADD COLUMN size VARCHAR(50) COMMENT '码数'");
        }
    }

    private void ensureShipmentReconciliationTable() {
        if (!tableExists("t_shipment_reconciliation")) {
            String createShipmentReconciliationTable = "CREATE TABLE IF NOT EXISTS t_shipment_reconciliation (" +
                    "id VARCHAR(36) PRIMARY KEY COMMENT '对账ID'," +
                    "reconciliation_no VARCHAR(50) NOT NULL UNIQUE COMMENT '对账单号'," +
                    "customer_id VARCHAR(36) COMMENT '客户ID'," +
                    "customer_name VARCHAR(100) NOT NULL COMMENT '客户名称'," +
                    "style_id VARCHAR(36) COMMENT '款号ID'," +
                    "style_no VARCHAR(50) COMMENT '款号'," +
                    "style_name VARCHAR(100) COMMENT '款名'," +
                    "order_id VARCHAR(36) COMMENT '订单ID'," +
                    "order_no VARCHAR(50) COMMENT '订单号'," +
                    "quantity INT DEFAULT 0 COMMENT '数量'," +
                    "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                    "total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'," +
                    "deduction_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '扣款项金额'," +
                    "final_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '最终金额'," +
                    "reconciliation_date DATETIME COMMENT '对账日期'," +
                    "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'," +
                    "remark VARCHAR(255) COMMENT '备注'," +
                    "verified_at DATETIME COMMENT '验证时间'," +
                    "approved_at DATETIME COMMENT '批准时间'," +
                    "paid_at DATETIME COMMENT '付款时间'," +
                    "re_review_at DATETIME COMMENT '重审时间'," +
                    "re_review_reason VARCHAR(255) COMMENT '重审原因'," +
                    "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                    "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                    "create_by VARCHAR(36) COMMENT '创建人'," +
                    "update_by VARCHAR(36) COMMENT '更新人'," +
                    "INDEX idx_status (status)," +
                    "INDEX idx_reconciliation_no (reconciliation_no)," +
                    "INDEX idx_customer_name (customer_name)," +
                    "INDEX idx_style_no (style_no)," +
                    "INDEX idx_order_no (order_no)," +
                    "INDEX idx_create_time (create_time)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成品出货对账单表'";

            try {
                jdbcTemplate.execute(createShipmentReconciliationTable);
                log.info("Table t_shipment_reconciliation checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_shipment_reconciliation table: {}", e.getMessage());
            }

            return;
        }

        if (columnExists("t_shipment_reconciliation", "customer")
                && !columnExists("t_shipment_reconciliation", "customer_name")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation CHANGE customer customer_name VARCHAR(100) NOT NULL COMMENT '客户名称'");
        }

        execSilently("ALTER TABLE t_shipment_reconciliation MODIFY COLUMN id VARCHAR(36)");

        if (!columnExists("t_shipment_reconciliation", "reconciliation_no")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN reconciliation_no VARCHAR(50) NOT NULL UNIQUE COMMENT '对账单号'");
        }
        if (!columnExists("t_shipment_reconciliation", "customer_id")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN customer_id VARCHAR(36) COMMENT '客户ID'");
        }
        if (!columnExists("t_shipment_reconciliation", "customer_name")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN customer_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '客户名称'");
        }
        if (!columnExists("t_shipment_reconciliation", "style_id")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN style_id VARCHAR(36) COMMENT '款号ID'");
        }
        if (!columnExists("t_shipment_reconciliation", "style_no")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
        }
        if (!columnExists("t_shipment_reconciliation", "style_name")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN style_name VARCHAR(100) COMMENT '款名'");
        }
        if (!columnExists("t_shipment_reconciliation", "order_id")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN order_id VARCHAR(36) COMMENT '订单ID'");
        }
        if (!columnExists("t_shipment_reconciliation", "order_no")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN order_no VARCHAR(50) COMMENT '订单号'");
        }
        if (!columnExists("t_shipment_reconciliation", "quantity")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN quantity INT DEFAULT 0 COMMENT '数量'");
        }
        if (!columnExists("t_shipment_reconciliation", "unit_price")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'");
        }
        if (!columnExists("t_shipment_reconciliation", "total_amount")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'");
        }
        if (!columnExists("t_shipment_reconciliation", "deduction_amount")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN deduction_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '扣款项金额'");
        }
        if (!columnExists("t_shipment_reconciliation", "final_amount")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN final_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '最终金额'");
        }
        if (!columnExists("t_shipment_reconciliation", "reconciliation_date")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN reconciliation_date DATETIME COMMENT '对账日期'");
        }
        if (!columnExists("t_shipment_reconciliation", "status")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'");
        }
        if (!columnExists("t_shipment_reconciliation", "remark")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN remark VARCHAR(255) COMMENT '备注'");
        }
        if (!columnExists("t_shipment_reconciliation", "create_time")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
        }
        if (!columnExists("t_shipment_reconciliation", "update_time")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
        }

        if (!columnExists("t_shipment_reconciliation", "create_by")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN create_by VARCHAR(36) COMMENT '创建人'");
        }
        if (!columnExists("t_shipment_reconciliation", "update_by")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN update_by VARCHAR(36) COMMENT '更新人'");
        }

        if (!columnExists("t_shipment_reconciliation", "paid_at")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN paid_at DATETIME COMMENT '付款时间'");
        }
        if (!columnExists("t_shipment_reconciliation", "verified_at")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN verified_at DATETIME COMMENT '验证时间'");
        }
        if (!columnExists("t_shipment_reconciliation", "approved_at")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN approved_at DATETIME COMMENT '批准时间'");
        }
        if (!columnExists("t_shipment_reconciliation", "re_review_at")) {
            execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN re_review_at DATETIME COMMENT '重审时间'");
        }
        if (!columnExists("t_shipment_reconciliation", "re_review_reason")) {
            execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN re_review_reason VARCHAR(255) COMMENT '重审原因'");
        }

        addIndexIfAbsent("t_shipment_reconciliation", "idx_status", "status");
        addIndexIfAbsent("t_shipment_reconciliation", "idx_reconciliation_no", "reconciliation_no");
        addIndexIfAbsent("t_shipment_reconciliation", "idx_customer_name", "customer_name");
        addIndexIfAbsent("t_shipment_reconciliation", "idx_style_no", "style_no");
        addIndexIfAbsent("t_shipment_reconciliation", "idx_order_no", "order_no");
        addIndexIfAbsent("t_shipment_reconciliation", "idx_create_time", "create_time");
    }

    private void ensureMaterialReconciliationTable() {
        if (!tableExists("t_material_reconciliation")) {
            String createMaterialReconciliationTable = "CREATE TABLE IF NOT EXISTS t_material_reconciliation (" +
                    "id VARCHAR(36) PRIMARY KEY COMMENT '对账ID'," +
                    "reconciliation_no VARCHAR(50) NOT NULL UNIQUE COMMENT '对账单号'," +
                    "supplier_id VARCHAR(36) NOT NULL COMMENT '供应商ID'," +
                    "supplier_name VARCHAR(100) NOT NULL COMMENT '供应商名称'," +
                    "material_id VARCHAR(36) NOT NULL COMMENT '物料ID'," +
                    "material_code VARCHAR(50) NOT NULL COMMENT '物料编码'," +
                    "material_name VARCHAR(100) NOT NULL COMMENT '物料名称'," +
                    "purchase_id VARCHAR(36) COMMENT '采购单ID'," +
                    "purchase_no VARCHAR(50) COMMENT '采购单号'," +
                    "order_id VARCHAR(36) COMMENT '订单ID'," +
                    "order_no VARCHAR(50) COMMENT '订单号'," +
                    "style_id VARCHAR(36) COMMENT '款号ID'," +
                    "style_no VARCHAR(50) COMMENT '款号'," +
                    "style_name VARCHAR(100) COMMENT '款名'," +
                    "quantity INT DEFAULT 0 COMMENT '数量'," +
                    "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                    "total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'," +
                    "deduction_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '扣款项'," +
                    "final_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '最终金额'," +
                    "reconciliation_date VARCHAR(20) COMMENT '对账日期'," +
                    "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'," +
                    "remark VARCHAR(255) COMMENT '备注'," +
                    "verified_at DATETIME COMMENT '验证时间'," +
                    "approved_at DATETIME COMMENT '批准时间'," +
                    "paid_at DATETIME COMMENT '付款时间'," +
                    "re_review_at DATETIME COMMENT '重审时间'," +
                    "re_review_reason VARCHAR(255) COMMENT '重审原因'," +
                    "delete_flag INT DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                    "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                    "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                    "create_by VARCHAR(36) COMMENT '创建人'," +
                    "update_by VARCHAR(36) COMMENT '更新人'," +
                    "INDEX idx_mr_order_no (order_no)," +
                    "INDEX idx_mr_style_no (style_no)," +
                    "INDEX idx_mr_create_time (create_time)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料采购对账单表';";

            try {
                jdbcTemplate.execute(createMaterialReconciliationTable);
                log.info("Table t_material_reconciliation checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_material_reconciliation table: {}", e.getMessage());
            }

            return;
        }

        if (!columnExists("t_material_reconciliation", "order_id")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN order_id VARCHAR(36) COMMENT '订单ID'");
        }
        if (!columnExists("t_material_reconciliation", "order_no")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN order_no VARCHAR(50) COMMENT '订单号'");
        }
        if (!columnExists("t_material_reconciliation", "style_id")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN style_id VARCHAR(36) COMMENT '款号ID'");
        }
        if (!columnExists("t_material_reconciliation", "style_no")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
        }
        if (!columnExists("t_material_reconciliation", "style_name")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN style_name VARCHAR(100) COMMENT '款名'");
        }

        if (!columnExists("t_material_reconciliation", "create_by")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN create_by VARCHAR(36) COMMENT '创建人'");
        }
        if (!columnExists("t_material_reconciliation", "update_by")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN update_by VARCHAR(36) COMMENT '更新人'");
        }

        if (!columnExists("t_material_reconciliation", "paid_at")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN paid_at DATETIME COMMENT '付款时间'");
        }
        if (!columnExists("t_material_reconciliation", "verified_at")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN verified_at DATETIME COMMENT '验证时间'");
        }
        if (!columnExists("t_material_reconciliation", "approved_at")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN approved_at DATETIME COMMENT '批准时间'");
        }
        if (!columnExists("t_material_reconciliation", "re_review_at")) {
            execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN re_review_at DATETIME COMMENT '重审时间'");
        }
        if (!columnExists("t_material_reconciliation", "re_review_reason")) {
            execSilently(
                    "ALTER TABLE t_material_reconciliation ADD COLUMN re_review_reason VARCHAR(255) COMMENT '重审原因'");
        }

        addIndexIfAbsent("t_material_reconciliation", "idx_mr_order_no", "order_no");
        addIndexIfAbsent("t_material_reconciliation", "idx_mr_style_no", "style_no");
    }

    private void ensureTemplateLibraryTable() {
        String createTable = "CREATE TABLE IF NOT EXISTS t_template_library (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '模板ID'," +
                "template_type VARCHAR(20) NOT NULL COMMENT '模板类型：bom/size/process/progress'," +
                "template_key VARCHAR(50) NOT NULL COMMENT '模板标识'," +
                "template_name VARCHAR(100) NOT NULL COMMENT '模板名称'," +
                "source_style_no VARCHAR(50) COMMENT '来源款号'," +
                "template_content LONGTEXT NOT NULL COMMENT '模板内容JSON'," +
                "locked INT NOT NULL DEFAULT 1 COMMENT '是否锁定(0:可编辑,1:已锁定)'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "UNIQUE KEY uk_type_key (template_type, template_key)," +
                "INDEX idx_type (template_type)," +
                "INDEX idx_source_style_no (source_style_no)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板库'";

        execSilently(createTable);

        if (!columnExists("t_template_library", "locked")) {
            execSilently(
                    "ALTER TABLE t_template_library ADD COLUMN locked INT NOT NULL DEFAULT 1 COMMENT '是否锁定(0:可编辑,1:已锁定)'");
        }

        seedTemplateIfAbsent("process", "basic", "基础工序",
                "{\"steps\":[{\"processCode\":\"01\",\"processName\":\"裁剪\",\"machineType\":\"\"},{\"processCode\":\"02\",\"processName\":\"缝制\",\"machineType\":\"\"},{\"processCode\":\"03\",\"processName\":\"整烫\",\"machineType\":\"\"},{\"processCode\":\"04\",\"processName\":\"检验\",\"machineType\":\"\"},{\"processCode\":\"05\",\"processName\":\"包装\",\"machineType\":\"\"}]}");
        seedTemplateIfAbsent("process", "knit-top", "针织上衣(常用)",
                "{\"steps\":[{\"processCode\":\"10\",\"processName\":\"上领\",\"machineType\":\"平车\"},{\"processCode\":\"11\",\"processName\":\"上袖\",\"machineType\":\"平车\"},{\"processCode\":\"12\",\"processName\":\"侧缝\",\"machineType\":\"拷边\"},{\"processCode\":\"13\",\"processName\":\"下摆\",\"machineType\":\"绷缝\"},{\"processCode\":\"14\",\"processName\":\"袖口\",\"machineType\":\"绷缝\"}]}");
        seedTemplateIfAbsent("process", "woven-shirt", "梭织衬衫(常用)",
                "{\"steps\":[{\"processCode\":\"20\",\"processName\":\"做领\",\"machineType\":\"平车\"},{\"processCode\":\"21\",\"processName\":\"上领\",\"machineType\":\"平车\"},{\"processCode\":\"22\",\"processName\":\"做门襟\",\"machineType\":\"平车\"},{\"processCode\":\"23\",\"processName\":\"上袖\",\"machineType\":\"平车\"},{\"processCode\":\"24\",\"processName\":\"锁眼\",\"machineType\":\"锁眼机\"},{\"processCode\":\"25\",\"processName\":\"钉扣\",\"machineType\":\"钉扣机\"}]}");

        seedTemplateIfAbsent("size", "top-basic", "上衣常规(国际参考)",
                "{\"sizes\":[\"S\",\"M\",\"L\",\"XL\",\"XXL\"],\"parts\":[{\"partName\":\"衣长\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"S\":66,\"M\":68,\"L\":70,\"XL\":72,\"XXL\":74}},{\"partName\":\"胸围\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"S\":96,\"M\":100,\"L\":104,\"XL\":108,\"XXL\":112}},{\"partName\":\"肩宽\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"S\":41,\"M\":42.5,\"L\":44,\"XL\":45.5,\"XXL\":47}},{\"partName\":\"袖长\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"S\":60,\"M\":61,\"L\":62,\"XL\":63,\"XXL\":64}},{\"partName\":\"袖口\",\"measureMethod\":\"平量\",\"tolerance\":0.3,\"values\":{\"S\":20,\"M\":21,\"L\":22,\"XL\":23,\"XXL\":24}},{\"partName\":\"下摆围\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"S\":92,\"M\":96,\"L\":100,\"XL\":104,\"XXL\":108}}]}");
        seedTemplateIfAbsent("size", "pants-basic", "裤装常规(国际参考)",
                "{\"sizes\":[\"28\",\"29\",\"30\",\"31\",\"32\",\"33\",\"34\"],\"parts\":[{\"partName\":\"裤长\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"28\":98,\"29\":100,\"30\":102,\"31\":104,\"32\":106,\"33\":108,\"34\":110}},{\"partName\":\"腰围\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"28\":72,\"29\":74.5,\"30\":77,\"31\":79.5,\"32\":82,\"33\":84.5,\"34\":87}},{\"partName\":\"臀围\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"28\":94,\"29\":96.5,\"30\":99,\"31\":101.5,\"32\":104,\"33\":106.5,\"34\":109}},{\"partName\":\"大腿围\",\"measureMethod\":\"平量\",\"tolerance\":0.5,\"values\":{\"28\":56,\"29\":57,\"30\":58,\"31\":59,\"32\":60,\"33\":61,\"34\":62}},{\"partName\":\"脚口\",\"measureMethod\":\"平量\",\"tolerance\":0.3,\"values\":{\"28\":34,\"29\":35,\"30\":36,\"31\":37,\"32\":38,\"33\":39,\"34\":40}},{\"partName\":\"前浪\",\"measureMethod\":\"平量\",\"tolerance\":0.3,\"values\":{\"28\":25,\"29\":25.5,\"30\":26,\"31\":26.5,\"32\":27,\"33\":27.5,\"34\":28}},{\"partName\":\"后浪\",\"measureMethod\":\"平量\",\"tolerance\":0.3,\"values\":{\"28\":35,\"29\":35.5,\"30\":36,\"31\":36.5,\"32\":37,\"33\":37.5,\"34\":38}}]}");
        seedTemplateIfAbsent("size", "kids-basic", "童装常规(国际参考)",
                "{\"sizes\":[\"90\",\"100\",\"110\",\"120\",\"130\",\"140\",\"150\"],\"parts\":[{\"partName\":\"衣长\",\"measureMethod\":\"平量\",\"tolerance\":0.7,\"values\":{\"90\":38,\"100\":42,\"110\":46,\"120\":50,\"130\":54,\"140\":58,\"150\":62}},{\"partName\":\"胸围\",\"measureMethod\":\"平量\",\"tolerance\":0.7,\"values\":{\"90\":62,\"100\":66,\"110\":70,\"120\":74,\"130\":78,\"140\":82,\"150\":86}},{\"partName\":\"肩宽\",\"measureMethod\":\"平量\",\"tolerance\":0.7,\"values\":{\"90\":26,\"100\":27.5,\"110\":29,\"120\":30.5,\"130\":32,\"140\":33.5,\"150\":35}},{\"partName\":\"袖长\",\"measureMethod\":\"平量\",\"tolerance\":0.7,\"values\":{\"90\":32,\"100\":35,\"110\":38,\"120\":41,\"130\":44,\"140\":47,\"150\":50}}]}");

        seedTemplateIfAbsent("bom", "market-basic", "通用面辅料模板(市面常用)",
                "{\"rows\":[{\"codePrefix\":\"FAB\",\"materialType\":\"fabricA\",\"materialName\":\"主面料\",\"color\":\"\",\"specification\":\"150\",\"unit\":\"米\",\"usageAmount\":1.25,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"LIN\",\"materialType\":\"liningA\",\"materialName\":\"里料\",\"color\":\"\",\"specification\":\"150\",\"unit\":\"米\",\"usageAmount\":0.85,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"POC\",\"materialType\":\"liningB\",\"materialName\":\"口袋布\",\"color\":\"\",\"specification\":\"90\",\"unit\":\"米\",\"usageAmount\":0.15,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"INT\",\"materialType\":\"liningC\",\"materialName\":\"衬布/粘合衬\",\"color\":\"\",\"specification\":\"112\",\"unit\":\"米\",\"usageAmount\":0.35,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"ZIP\",\"materialType\":\"accessoryA\",\"materialName\":\"拉链\",\"color\":\"\",\"specification\":\"18\",\"unit\":\"条\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"BTN\",\"materialType\":\"accessoryB\",\"materialName\":\"纽扣\",\"color\":\"\",\"specification\":\"1.5\",\"unit\":\"颗\",\"usageAmount\":6,\"lossRate\":2,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"THR\",\"materialType\":\"accessoryC\",\"materialName\":\"缝纫线\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"卷\",\"usageAmount\":0.02,\"lossRate\":5,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"LBL\",\"materialType\":\"accessoryD\",\"materialName\":\"主唛/洗唛/尺码标\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"套\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"PKG\",\"materialType\":\"accessoryE\",\"materialName\":\"包装袋\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"个\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"}]}");
        seedTemplateIfAbsent("bom", "market-knit", "通用面辅料模板(针织/卫衣)",
                "{\"rows\":[{\"codePrefix\":\"FAB\",\"materialType\":\"fabricA\",\"materialName\":\"主面料(针织)\",\"color\":\"\",\"specification\":\"180\",\"unit\":\"米\",\"usageAmount\":1.15,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"RIB\",\"materialType\":\"fabricB\",\"materialName\":\"罗纹(领口/袖口/下摆)\",\"color\":\"\",\"specification\":\"100\",\"unit\":\"米\",\"usageAmount\":0.25,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"THR\",\"materialType\":\"accessoryA\",\"materialName\":\"缝纫线\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"卷\",\"usageAmount\":0.02,\"lossRate\":5,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"LBL\",\"materialType\":\"accessoryB\",\"materialName\":\"主唛/洗唛/尺码标\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"套\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"PKG\",\"materialType\":\"accessoryC\",\"materialName\":\"包装袋\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"个\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"}]}");
        seedTemplateIfAbsent("bom", "market-jacket", "通用面辅料模板(外套/夹克)",
                "{\"rows\":[{\"codePrefix\":\"FAB\",\"materialType\":\"fabricA\",\"materialName\":\"主面料(外套)\",\"color\":\"\",\"specification\":\"260\",\"unit\":\"米\",\"usageAmount\":1.8,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"LIN\",\"materialType\":\"liningA\",\"materialName\":\"里料\",\"color\":\"\",\"specification\":\"150\",\"unit\":\"米\",\"usageAmount\":1.4,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"INT\",\"materialType\":\"liningB\",\"materialName\":\"衬布/粘合衬\",\"color\":\"\",\"specification\":\"112\",\"unit\":\"米\",\"usageAmount\":0.6,\"lossRate\":3,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"ZIP\",\"materialType\":\"accessoryA\",\"materialName\":\"拉链\",\"color\":\"\",\"specification\":\"55\",\"unit\":\"条\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"BTN\",\"materialType\":\"accessoryB\",\"materialName\":\"纽扣\",\"color\":\"\",\"specification\":\"2.0\",\"unit\":\"颗\",\"usageAmount\":4,\"lossRate\":2,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"ELT\",\"materialType\":\"accessoryC\",\"materialName\":\"松紧带\",\"color\":\"\",\"specification\":\"2.0\",\"unit\":\"米\",\"usageAmount\":0.6,\"lossRate\":2,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"THR\",\"materialType\":\"accessoryD\",\"materialName\":\"缝纫线\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"卷\",\"usageAmount\":0.03,\"lossRate\":5,\"unitPrice\":0,\"supplier\":\"\"},{\"codePrefix\":\"PKG\",\"materialType\":\"accessoryE\",\"materialName\":\"包装袋\",\"color\":\"\",\"specification\":\"0\",\"unit\":\"个\",\"usageAmount\":1,\"lossRate\":1,\"unitPrice\":0,\"supplier\":\"\"}]}");

        seedTemplateIfAbsent("progress", "default", "默认生产进度",
                "{\"nodes\":[{\"name\":\"裁剪\"},{\"name\":\"缝制\"},{\"name\":\"整烫\"},{\"name\":\"检验\"},{\"name\":\"包装\"}]}");
    }

    private void seedTemplateIfAbsent(String templateType, String templateKey, String templateName,
            String templateContent) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM t_template_library WHERE template_type = ? AND template_key = ?",
                    Integer.class,
                    templateType,
                    templateKey);
            if (count != null && count > 0) {
                return;
            }
        } catch (Exception e) {
            log.warn("Failed to check template exists: templateType={}, templateKey={}, err={}", templateType,
                    templateKey,
                    e.getMessage());
            return;
        }

        try {
            String id = java.util.UUID.randomUUID().toString();
            jdbcTemplate.update(
                    "INSERT IGNORE INTO t_template_library (id, template_type, template_key, template_name, source_style_no, template_content) VALUES (?,?,?,?,?,?)",
                    id,
                    templateType,
                    templateKey,
                    templateName,
                    null,
                    templateContent);
        } catch (Exception e) {
            log.warn("Failed to seed template: templateType={}, templateKey={}, err={}", templateType, templateKey,
                    e.getMessage());
        }
    }

    @Override
    public void run(String... args) throws Exception {
        log.info("Checking database initialization...");

        if (!waitForDatabaseReady()) {
            log.warn("Database not ready, skip initialization");
            return;
        }

        // 创建用户表
        String createUserTable = "CREATE TABLE IF NOT EXISTS t_user (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID'," +
                "username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名'," +
                "password VARCHAR(100) NOT NULL COMMENT '密码'," +
                "name VARCHAR(50) NOT NULL COMMENT '姓名'," +
                "role_id BIGINT COMMENT '角色ID'," +
                "role_name VARCHAR(50) COMMENT '角色名称'," +
                "permission_range VARCHAR(50) COMMENT '权限范围'," +
                "status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'," +
                "phone VARCHAR(20) COMMENT '电话'," +
                "email VARCHAR(50) COMMENT '邮箱'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "last_login_time DATETIME COMMENT '最后登录时间'," +
                "last_login_ip VARCHAR(20) COMMENT '最后登录IP'" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表'";

        try {
            jdbcTemplate.execute(createUserTable);
            log.info("Table t_user checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create t_user table: {}", e.getMessage());
        }

        ensureLoginLogTable();

        String createFactoryTable = "CREATE TABLE IF NOT EXISTS t_factory (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '加工厂ID'," +
                "factory_code VARCHAR(50) NOT NULL UNIQUE COMMENT '加工厂编码'," +
                "factory_name VARCHAR(100) NOT NULL COMMENT '加工厂名称'," +
                "contact_person VARCHAR(50) COMMENT '联系人'," +
                "contact_phone VARCHAR(30) COMMENT '联系电话'," +
                "address VARCHAR(200) COMMENT '地址'," +
                "business_license VARCHAR(512) COMMENT '营业执照图片URL'," +
                "status VARCHAR(20) DEFAULT 'active' COMMENT '状态'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                "INDEX idx_factory_code (factory_code)," +
                "INDEX idx_factory_name (factory_name)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加工厂表'";

        try {
            jdbcTemplate.execute(createFactoryTable);
            log.info("System tables checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create system tables: {}", e.getMessage());
        }

        if (tableExists("t_factory")) {
            execSilently("ALTER TABLE t_factory MODIFY COLUMN id VARCHAR(36)");
            if (!columnExists("t_factory", "contact_person") && columnExists("t_factory", "contact_name")) {
                execSilently("ALTER TABLE t_factory CHANGE contact_name contact_person VARCHAR(50) COMMENT '联系人'");
            }
            if (!columnExists("t_factory", "contact_person")) {
                execSilently("ALTER TABLE t_factory ADD COLUMN contact_person VARCHAR(50) COMMENT '联系人'");
            }
            if (!columnExists("t_factory", "contact_phone")) {
                execSilently("ALTER TABLE t_factory ADD COLUMN contact_phone VARCHAR(30) COMMENT '联系电话'");
            }
            if (!columnExists("t_factory", "address")) {
                execSilently("ALTER TABLE t_factory ADD COLUMN address VARCHAR(200) COMMENT '地址'");
            }
            if (!columnExists("t_factory", "business_license")) {
                execSilently("ALTER TABLE t_factory ADD COLUMN business_license VARCHAR(512) COMMENT '营业执照图片URL'");
            }
            if (!columnExists("t_factory", "status")) {
                execSilently("ALTER TABLE t_factory ADD COLUMN status VARCHAR(20) DEFAULT 'active' COMMENT '状态'");
            }
            if (!columnExists("t_factory", "create_time")) {
                execSilently(
                        "ALTER TABLE t_factory ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
            }
            if (!columnExists("t_factory", "update_time")) {
                execSilently(
                        "ALTER TABLE t_factory ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
            }
            if (!columnExists("t_factory", "delete_flag")) {
                execSilently(
                        "ALTER TABLE t_factory ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
            }
            addIndexIfAbsent("t_factory", "idx_factory_code", "factory_code");
            addIndexIfAbsent("t_factory", "idx_factory_name", "factory_name");
        }

        String createSystemOperationLogTable = "CREATE TABLE IF NOT EXISTS t_system_operation_log (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '操作日志ID'," +
                "biz_type VARCHAR(50) NOT NULL COMMENT '业务类型'," +
                "biz_id VARCHAR(64) NOT NULL COMMENT '业务ID'," +
                "action VARCHAR(50) NOT NULL COMMENT '操作动作'," +
                "operator VARCHAR(50) COMMENT '操作人'," +
                "remark VARCHAR(255) COMMENT '备注'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "INDEX idx_system_biz (biz_type, biz_id)," +
                "INDEX idx_system_action (action)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统操作日志表'";

        try {
            jdbcTemplate.execute(createSystemOperationLogTable);
        } catch (Exception e) {
            log.warn("Failed to create system operation log table: {}", e.getMessage());
        }

        ensurePermissionTables();
        seedDefaultAuthData();
        ensureTemplateLibraryTable();
        ensureDictTable();

        String createStyleInfoTable = "CREATE TABLE IF NOT EXISTS t_style_info (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '款号ID'," +
                "style_no VARCHAR(50) NOT NULL UNIQUE COMMENT '款号'," +
                "style_name VARCHAR(100) NOT NULL COMMENT '款名'," +
                "category VARCHAR(20) NOT NULL COMMENT '品类：WOMAN-女装，MAN-男装，KID-童装'," +
                "year INT COMMENT '年份'," +
                "month INT COMMENT '月份'," +
                "season VARCHAR(20) COMMENT '季节：SPRING-春季，SUMMER-夏季，AUTUMN-秋季，WINTER-冬季'," +
                "color VARCHAR(20) COMMENT '颜色'," +
                "size VARCHAR(20) COMMENT '码数'," +
                "price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                "cycle INT DEFAULT 0 COMMENT '生产周期(天)'," +
                "cover VARCHAR(200) COMMENT '封面图片'," +
                "description TEXT COMMENT '描述'," +
                "pattern_status VARCHAR(20) COMMENT '纸样状态：IN_PROGRESS/COMPLETED'," +
                "pattern_completed_time DATETIME COMMENT '纸样完成时间'," +
                "sample_status VARCHAR(20) COMMENT '样衣状态：IN_PROGRESS/COMPLETED'," +
                "sample_progress INT DEFAULT 0 COMMENT '样衣进度(%)'," +
                "sample_completed_time DATETIME COMMENT '样衣完成时间'," +
                "status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号信息表'";

        String createStyleBomTable = "CREATE TABLE IF NOT EXISTS t_style_bom (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT 'BOM ID'," +
                "style_id BIGINT NOT NULL COMMENT '款号ID'," +
                "material_code VARCHAR(50) NOT NULL COMMENT '物料编码'," +
                "material_name VARCHAR(100) NOT NULL COMMENT '物料名称'," +
                "material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料'," +
                "color VARCHAR(20) COMMENT '颜色'," +
                "specification VARCHAR(100) COMMENT '规格'," +
                "size VARCHAR(20) COMMENT '尺码/规格'," +
                "unit VARCHAR(20) NOT NULL COMMENT '单位'," +
                "usage_amount DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT '单件用量'," +
                "loss_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT '损耗率(%)'," +
                "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                "total_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '总价'," +
                "supplier VARCHAR(100) COMMENT '供应商'," +
                "remark VARCHAR(200) COMMENT '备注'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_style_id (style_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号BOM表'";

        String createStyleSizeTable = "CREATE TABLE IF NOT EXISTS t_style_size (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '尺寸ID'," +
                "style_id BIGINT NOT NULL COMMENT '款号ID'," +
                "size_name VARCHAR(20) NOT NULL COMMENT '尺码名称'," +
                "part_name VARCHAR(50) NOT NULL COMMENT '部位名称'," +
                "measure_method VARCHAR(50) COMMENT '度量方式'," +
                "standard_value DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '标准数值'," +
                "tolerance DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '公差'," +
                "sort INT NOT NULL DEFAULT 0 COMMENT '排序'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_style_id (style_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号尺寸表'";

        String createStyleProcessTable = "CREATE TABLE IF NOT EXISTS t_style_process (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '工序ID'," +
                "style_id BIGINT NOT NULL COMMENT '款号ID'," +
                "process_code VARCHAR(50) NOT NULL COMMENT '工序编码'," +
                "process_name VARCHAR(100) NOT NULL COMMENT '工序名称'," +
                "machine_type VARCHAR(50) COMMENT '机器类型'," +
                "standard_time INT NOT NULL DEFAULT 0 COMMENT '标准工时(秒)'," +
                "price DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '工价(元)'," +
                "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序号'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_style_id (style_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号工序表'";

        String createStyleQuotationTable = "CREATE TABLE IF NOT EXISTS t_style_quotation (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '报价单ID'," +
                "style_id BIGINT NOT NULL UNIQUE COMMENT '款号ID'," +
                "material_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '物料总成本'," +
                "process_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '工序总成本'," +
                "other_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '其它费用'," +
                "profit_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT '目标利润率(%)'," +
                "total_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '总成本'," +
                "total_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '报价'," +
                "currency VARCHAR(20) COMMENT '币种'," +
                "version VARCHAR(20) COMMENT '版本号'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_style_id (style_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号报价单表'";

        String createStyleAttachmentTable = "CREATE TABLE IF NOT EXISTS t_style_attachment (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '附件ID'," +
                "style_id VARCHAR(36) NOT NULL COMMENT '款号ID'," +
                "file_name VARCHAR(100) NOT NULL COMMENT '文件名'," +
                "file_type VARCHAR(200) NOT NULL COMMENT '文件类型'," +
                "biz_type VARCHAR(20) DEFAULT 'general' COMMENT '业务类型：general/pattern/sample'," +
                "file_size BIGINT NOT NULL COMMENT '文件大小(字节)'," +
                "file_url VARCHAR(200) NOT NULL COMMENT '文件URL'," +
                "uploader VARCHAR(50) COMMENT '上传人'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_style_id (style_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号附件表'";

        String createStyleOperationLogTable = "CREATE TABLE IF NOT EXISTS t_style_operation_log (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '操作日志ID'," +
                "style_id BIGINT NOT NULL COMMENT '款号ID'," +
                "biz_type VARCHAR(20) NOT NULL COMMENT '业务类型：sample/pattern'," +
                "action VARCHAR(50) NOT NULL COMMENT '操作动作'," +
                "operator VARCHAR(50) COMMENT '操作人'," +
                "remark VARCHAR(255) COMMENT '备注'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "INDEX idx_style_id (style_id)," +
                "INDEX idx_biz_type (biz_type)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号操作日志表'";

        String createTemplateOperationLogTable = "CREATE TABLE IF NOT EXISTS t_template_operation_log (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '操作日志ID'," +
                "template_id VARCHAR(36) NOT NULL COMMENT '模板ID'," +
                "action VARCHAR(50) NOT NULL COMMENT '操作动作'," +
                "operator VARCHAR(50) COMMENT '操作人'," +
                "remark VARCHAR(255) COMMENT '备注'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "INDEX idx_template_id (template_id)," +
                "INDEX idx_action (action)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板操作日志表'";

        String createMaterialReconciliationTable = "CREATE TABLE IF NOT EXISTS t_material_reconciliation (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '对账ID'," +
                "reconciliation_no VARCHAR(50) NOT NULL UNIQUE COMMENT '对账单号'," +
                "supplier_id VARCHAR(36) NOT NULL COMMENT '供应商ID'," +
                "supplier_name VARCHAR(100) NOT NULL COMMENT '供应商名称'," +
                "material_id VARCHAR(36) NOT NULL COMMENT '物料ID'," +
                "material_code VARCHAR(50) NOT NULL COMMENT '物料编码'," +
                "material_name VARCHAR(100) NOT NULL COMMENT '物料名称'," +
                "purchase_id VARCHAR(36) COMMENT '采购单ID'," +
                "purchase_no VARCHAR(50) COMMENT '采购单号'," +
                "order_id VARCHAR(36) COMMENT '订单ID'," +
                "order_no VARCHAR(50) COMMENT '订单号'," +
                "style_id VARCHAR(36) COMMENT '款号ID'," +
                "style_no VARCHAR(50) COMMENT '款号'," +
                "style_name VARCHAR(100) COMMENT '款名'," +
                "quantity INT DEFAULT 0 COMMENT '数量'," +
                "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                "total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'," +
                "deduction_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '扣款项'," +
                "final_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '最终金额'," +
                "reconciliation_date VARCHAR(20) COMMENT '对账日期'," +
                "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending-待审核，verified-已验证，approved-已批准，paid-已付款，rejected-已拒绝',"
                +
                "remark VARCHAR(255) COMMENT '备注'," +
                "verified_at DATETIME COMMENT '验证时间'," +
                "approved_at DATETIME COMMENT '批准时间'," +
                "paid_at DATETIME COMMENT '付款时间'," +
                "re_review_at DATETIME COMMENT '重审时间'," +
                "re_review_reason VARCHAR(255) COMMENT '重审原因'," +
                "delete_flag INT DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_mr_order_no (order_no)," +
                "INDEX idx_mr_style_no (style_no)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料采购对账单表';";

        // 创建生产订单表
        String createProductionOrderTable = "CREATE TABLE IF NOT EXISTS t_production_order (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '订单ID'," +
                "order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '订单号'," +
                "qr_code VARCHAR(100) COMMENT '订单二维码内容'," +
                "style_id VARCHAR(36) NOT NULL COMMENT '款号ID'," +
                "style_no VARCHAR(50) NOT NULL COMMENT '款号'," +
                "style_name VARCHAR(100) NOT NULL COMMENT '款名'," +
                "color VARCHAR(50) COMMENT '颜色'," +
                "size VARCHAR(50) COMMENT '码数'," +
                "order_details LONGTEXT COMMENT '订单明细JSON'," +
                "progress_workflow_json LONGTEXT COMMENT '进度节点定义JSON'," +
                "progress_workflow_locked INT NOT NULL DEFAULT 0 COMMENT '进度节点是否锁定：0-否，1-是'," +
                "progress_workflow_locked_at DATETIME COMMENT '进度节点锁定时间'," +
                "progress_workflow_locked_by VARCHAR(36) COMMENT '进度节点锁定人ID'," +
                "progress_workflow_locked_by_name VARCHAR(50) COMMENT '进度节点锁定人'," +
                "factory_id VARCHAR(36) NOT NULL COMMENT '加工厂ID'," +
                "factory_name VARCHAR(100) NOT NULL COMMENT '加工厂名称'," +
                "order_quantity INT DEFAULT 0 COMMENT '订单数量'," +
                "completed_quantity INT DEFAULT 0 COMMENT '完成数量'," +
                "material_arrival_rate INT DEFAULT 0 COMMENT '物料到位率(%)'," +
                "production_progress INT DEFAULT 0 COMMENT '生产进度(%)'," +
                "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending-待生产，production-生产中，completed-已完成，delayed-已逾期',"
                +
                "planned_start_date DATETIME COMMENT '计划开始日期'," +
                "planned_end_date DATETIME COMMENT '计划完成日期'," +
                "actual_start_date DATETIME COMMENT '实际开始日期'," +
                "actual_end_date DATETIME COMMENT '实际完成日期'," +
                "delete_flag INT DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产订单表';";

        try {
            jdbcTemplate.execute(createStyleInfoTable);
            jdbcTemplate.execute(createStyleBomTable);
            jdbcTemplate.execute(createStyleSizeTable);
            jdbcTemplate.execute(createStyleProcessTable);
            jdbcTemplate.execute(createStyleQuotationTable);
            jdbcTemplate.execute(createStyleAttachmentTable);
            jdbcTemplate.execute(createStyleOperationLogTable);
            jdbcTemplate.execute(createTemplateOperationLogTable);
            jdbcTemplate.execute(createMaterialReconciliationTable);
            jdbcTemplate.execute(createProductionOrderTable);
            log.info("Style tables, operation log table, finance tables, and production tables checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create style, finance, and production tables: {}", e.getMessage());
        }

        ensureMaterialPurchaseTable();

        ensureMaterialDatabaseTable();

        ensureScanRecordTable();

        ensurePayrollSettlementTable();

        ensurePayrollSettlementItemTable();

        ensureProductionViews();

        ensureCuttingBundleTable();

        ensureProductionOrderTable();

        ensureProductWarehousingTable();

        ensureProductOutstockTable();

        ensureCuttingTaskTable();

        ensureShipmentReconciliationTable();

        ensureMaterialReconciliationTable();

        if (tableExists("t_style_info")) {
            // 为款号信息表补齐缺失字段
            if (!columnExists("t_style_info", "month")) {
                execSilently("ALTER TABLE t_style_info ADD COLUMN month INT COMMENT '月份'");
            }
            if (!columnExists("t_style_info", "color")) {
                execSilently("ALTER TABLE t_style_info ADD COLUMN color VARCHAR(20) COMMENT '颜色'");
            }
            if (!columnExists("t_style_info", "size")) {
                execSilently("ALTER TABLE t_style_info ADD COLUMN size VARCHAR(20) COMMENT '码数'");
            }
            if (!columnExists("t_style_info", "pattern_status")) {
                execSilently(
                        "ALTER TABLE t_style_info ADD COLUMN pattern_status VARCHAR(20) COMMENT '纸样状态：IN_PROGRESS/COMPLETED'");
            }
            if (!columnExists("t_style_info", "pattern_completed_time")) {
                execSilently("ALTER TABLE t_style_info ADD COLUMN pattern_completed_time DATETIME COMMENT '纸样完成时间'");
            }
            if (!columnExists("t_style_info", "sample_status")) {
                execSilently(
                        "ALTER TABLE t_style_info ADD COLUMN sample_status VARCHAR(20) COMMENT '样衣状态：IN_PROGRESS/COMPLETED'");
            }
            if (!columnExists("t_style_info", "sample_progress")) {
                execSilently("ALTER TABLE t_style_info ADD COLUMN sample_progress INT DEFAULT 0 COMMENT '样衣进度(%)'");
            }
            if (!columnExists("t_style_info", "sample_completed_time")) {
                execSilently("ALTER TABLE t_style_info ADD COLUMN sample_completed_time DATETIME COMMENT '样衣完成时间'");
            }
        }

        if (tableExists("t_style_bom")) {
            execSilently("ALTER TABLE t_style_bom MODIFY COLUMN id VARCHAR(36)");
            if (!columnExists("t_style_bom", "usage_amount") && columnExists("t_style_bom", "consumption")) {
                execSilently(
                        "ALTER TABLE t_style_bom CHANGE consumption usage_amount DECIMAL(10,4) NOT NULL DEFAULT 0");
            } else if (!columnExists("t_style_bom", "usage_amount")) {
                execSilently("ALTER TABLE t_style_bom ADD COLUMN usage_amount DECIMAL(10,4) NOT NULL DEFAULT 0");
            }
            if (!columnExists("t_style_bom", "material_type")) {
                execSilently(
                        "ALTER TABLE t_style_bom ADD COLUMN material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料'");
            }
            if (!columnExists("t_style_bom", "supplier")) {
                execSilently("ALTER TABLE t_style_bom ADD COLUMN supplier VARCHAR(100)");
            }
            if (!columnExists("t_style_bom", "remark")) {
                execSilently("ALTER TABLE t_style_bom ADD COLUMN remark VARCHAR(200)");
            }
            if (!columnExists("t_style_bom", "size")) {
                execSilently("ALTER TABLE t_style_bom ADD COLUMN size VARCHAR(20)");
            }
            if (!columnExists("t_style_bom", "specification")) {
                execSilently("ALTER TABLE t_style_bom ADD COLUMN specification VARCHAR(100)");
            }
        }

        if (tableExists("t_style_size")) {
            execSilently("ALTER TABLE t_style_size MODIFY COLUMN id VARCHAR(36)");
            if (!columnExists("t_style_size", "size_name") && columnExists("t_style_size", "size_code")) {
                execSilently("ALTER TABLE t_style_size CHANGE size_code size_name VARCHAR(20) NOT NULL");
            } else if (!columnExists("t_style_size", "size_name")) {
                execSilently("ALTER TABLE t_style_size ADD COLUMN size_name VARCHAR(20) NOT NULL DEFAULT ''");
            }
            if (!columnExists("t_style_size", "standard_value") && columnExists("t_style_size", "part_value")) {
                execSilently(
                        "ALTER TABLE t_style_size CHANGE part_value standard_value DECIMAL(10,2) NOT NULL DEFAULT 0");
            } else if (!columnExists("t_style_size", "standard_value")) {
                execSilently("ALTER TABLE t_style_size ADD COLUMN standard_value DECIMAL(10,2) NOT NULL DEFAULT 0");
            }
            if (!columnExists("t_style_size", "tolerance")) {
                execSilently("ALTER TABLE t_style_size ADD COLUMN tolerance DECIMAL(10,2) NOT NULL DEFAULT 0");
            }
            if (!columnExists("t_style_size", "sort")) {
                execSilently("ALTER TABLE t_style_size ADD COLUMN sort INT NOT NULL DEFAULT 0");
            }
            if (!columnExists("t_style_size", "measure_method")) {
                execSilently("ALTER TABLE t_style_size ADD COLUMN measure_method VARCHAR(50) COMMENT '度量方式'");
            }
        }

        if (tableExists("t_style_process")) {
            execSilently("ALTER TABLE t_style_process MODIFY COLUMN id VARCHAR(36)");
            if (!columnExists("t_style_process", "sort_order") && columnExists("t_style_process", "process_order")) {
                execSilently("ALTER TABLE t_style_process CHANGE process_order sort_order INT NOT NULL DEFAULT 0");
            } else if (!columnExists("t_style_process", "sort_order")) {
                execSilently("ALTER TABLE t_style_process ADD COLUMN sort_order INT NOT NULL DEFAULT 0");
            }
            if (!columnExists("t_style_process", "price") && columnExists("t_style_process", "unit_price")) {
                execSilently("ALTER TABLE t_style_process CHANGE unit_price price DECIMAL(10,2) NOT NULL DEFAULT 0");
            } else if (!columnExists("t_style_process", "price")) {
                execSilently("ALTER TABLE t_style_process ADD COLUMN price DECIMAL(10,2) NOT NULL DEFAULT 0");
            }
            if (!columnExists("t_style_process", "machine_type")) {
                execSilently("ALTER TABLE t_style_process ADD COLUMN machine_type VARCHAR(50)");
            }
            if (!columnExists("t_style_process", "standard_time")) {
                execSilently("ALTER TABLE t_style_process ADD COLUMN standard_time INT NOT NULL DEFAULT 0");
            }
        }

        if (tableExists("t_style_quotation")) {
            execSilently("ALTER TABLE t_style_quotation MODIFY COLUMN id VARCHAR(36)");
            if (!columnExists("t_style_quotation", "total_price")
                    && columnExists("t_style_quotation", "quoted_price")) {
                execSilently(
                        "ALTER TABLE t_style_quotation CHANGE quoted_price total_price DECIMAL(10,2) NOT NULL DEFAULT 0");
            } else if (!columnExists("t_style_quotation", "total_price")) {
                execSilently("ALTER TABLE t_style_quotation ADD COLUMN total_price DECIMAL(10,2) NOT NULL DEFAULT 0");
            }
            if (!columnExists("t_style_quotation", "currency")) {
                execSilently("ALTER TABLE t_style_quotation ADD COLUMN currency VARCHAR(20)");
            }
            if (!columnExists("t_style_quotation", "version")) {
                execSilently("ALTER TABLE t_style_quotation ADD COLUMN version VARCHAR(20)");
            }
        }

        if (tableExists("t_style_attachment")) {
            execSilently("ALTER TABLE t_style_attachment MODIFY COLUMN id VARCHAR(36)");
            if (columnExists("t_style_attachment", "file_type")) {
                execSilently(
                        "ALTER TABLE t_style_attachment MODIFY COLUMN file_type VARCHAR(200) NOT NULL COMMENT '文件类型'");
            }
            if (!columnExists("t_style_attachment", "uploader")) {
                execSilently("ALTER TABLE t_style_attachment ADD COLUMN uploader VARCHAR(50)");
            }
            if (!columnExists("t_style_attachment", "biz_type")) {
                execSilently(
                        "ALTER TABLE t_style_attachment ADD COLUMN biz_type VARCHAR(20) DEFAULT 'general' COMMENT '业务类型：general/pattern/sample'");
            }
        }

        // 插入管理员账号
        try {
            Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM t_user WHERE username = 'admin'",
                    Integer.class);
            if (count != null && count == 0) {
                jdbcTemplate.execute(
                        "INSERT INTO t_user (username, password, name, role_name, status) VALUES ('admin', 'admin123', 'Admin', 'admin', 'ENABLED')");
                log.info("Admin user created.");
            } else {
                log.info("Admin user already exists.");
            }
        } catch (Exception e) {
            log.warn("Failed to check/insert admin user: {}", e.getMessage());
        }
    }
}
