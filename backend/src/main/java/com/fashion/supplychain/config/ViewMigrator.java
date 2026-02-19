package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 视图迁移器
 * 负责: v_production_order_flow_stage_snapshot / v_production_order_stage_done_agg / v_production_order_procurement_snapshot
 */
@Component
@Slf4j
public class ViewMigrator {

    @Autowired
    private DatabaseMigrationHelper dbHelper;

    public void initialize() {
        ensureProductionViews();
    }

    private void ensureProductionViews() {
        if (dbHelper.shouldSkipViewInitialization()) {
            return;
        }
        ensureViewsFromInitSql();
        ensureProductionViewsFallback();
    }

    /* ---------- 从 init.sql 加载视图定义 ---------- */

    private void ensureViewsFromInitSql() {
        if (dbHelper.shouldSkipViewInitialization()) {
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
            JdbcTemplate jdbc = dbHelper.getJdbcTemplate();
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
                    jdbc.execute(stmt);
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

    /* ---------- 内联 SQL 兜底视图 ---------- */

    private void ensureProductionViewsFallback() {
        if (dbHelper.viewExists("v_production_order_flow_stage_snapshot")
                && dbHelper.viewExists("v_production_order_stage_done_agg")
                && dbHelper.viewExists("v_production_order_procurement_snapshot")) {
            return;
        }

        String flowStageSnapshot = """
                CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
                SELECT
                  sr.order_id AS order_id,
                  sr.tenant_id AS tenant_id,
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
                GROUP BY sr.order_id, sr.tenant_id;
                """;

        String stageDoneAgg = """
                CREATE OR REPLACE VIEW v_production_order_stage_done_agg AS
                SELECT
                  t.order_id AS order_id,
                  t.tenant_id AS tenant_id,
                  t.stage_name AS stage_name,
                  SUM(IFNULL(t.quantity, 0)) AS done_quantity,
                  MAX(t.scan_time) AS last_scan_time
                FROM (
                  SELECT
                    sr.order_id,
                    sr.tenant_id,
                    COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) AS stage_name,
                    sr.quantity,
                    sr.scan_time
                  FROM t_scan_record sr
                  WHERE sr.scan_result = 'success'
                    AND sr.quantity > 0
                    AND sr.scan_type IN ('production', 'cutting')
                ) t
                WHERE t.stage_name IS NOT NULL AND t.stage_name <> ''
                GROUP BY t.order_id, t.tenant_id, t.stage_name;
                """;

        String procurementSnapshot = """
                CREATE OR REPLACE VIEW v_production_order_procurement_snapshot AS
                SELECT
                  p.order_id AS order_id,
                  p.tenant_id AS tenant_id,
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
                GROUP BY p.order_id, p.tenant_id;
                """;

        JdbcTemplate jdbc = dbHelper.getJdbcTemplate();
        try {
            jdbc.execute(flowStageSnapshot);
            log.info("View v_production_order_flow_stage_snapshot checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create view v_production_order_flow_stage_snapshot: {}", e.getMessage());
        }
        try {
            jdbc.execute(stageDoneAgg);
            log.info("View v_production_order_stage_done_agg checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create view v_production_order_stage_done_agg: {}", e.getMessage());
        }
        try {
            jdbc.execute(procurementSnapshot);
            log.info("View v_production_order_procurement_snapshot checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create view v_production_order_procurement_snapshot: {}", e.getMessage());
        }
    }
}
