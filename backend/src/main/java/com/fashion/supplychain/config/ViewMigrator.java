package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@ConditionalOnProperty(name = "fashion.db.repair-enabled", havingValue = "true", matchIfMissing = true)
@Component
@Order(5)
@Slf4j
public class ViewMigrator implements ApplicationRunner {

    @Autowired
    private DatabaseMigrationHelper dbHelper;

    @Override
    public void run(ApplicationArguments args) {
        initialize();
    }

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
        // 不再做 "视图存在就跳过" 的早返回！
        // 必须每次都执行 CREATE OR REPLACE VIEW，确保视图内容与代码保持同步。
        // 历史上的早返回导致：视图内容有 bug 时，后端重启永远无法自动修复。

        String flowStageSnapshot = """
                CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
                SELECT
                  sr.order_id AS order_id,
                  sr.tenant_id AS tenant_id,
                  MIN(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time,
                  MAX(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '') ) USING binary) END),
                    '|', -1
                  ) AS order_operator_name,
                  MIN(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_start_time,
                  MAX(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '') ) USING binary) END),
                    '|', -1
                  ) AS procurement_scan_operator_name,
                  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
                  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '') ) USING binary) END),
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
                      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '') ) USING binary) END),
                    '|', -1
                  ) AS sewing_operator_name,
                  MIN(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
                      THEN sr.scan_time END) AS car_sewing_start_time,
                  MAX(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
                      THEN sr.scan_time END) AS car_sewing_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
                      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '') ) USING binary) END),
                    '|', -1
                  ) AS car_sewing_operator_name,
                  SUM(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
                      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS car_sewing_quantity,
                  -- ★ ironing_* 列实际存「尾部」父节点聚合（大烫/整烫/剪线/质检/包装均归尾部）
                  MIN(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
                      THEN sr.scan_time END) AS ironing_start_time,
                  MAX(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
                      THEN sr.scan_time END) AS ironing_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
                      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '') ) USING binary) END),
                    '|', -1
                  ) AS ironing_operator_name,
                  SUM(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
                      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS ironing_quantity,
                  MIN(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
                             OR EXISTS (SELECT 1 FROM t_process_parent_mapping pm WHERE pm.parent_node = '二次工艺' AND TRIM(sr.process_name) LIKE CONCAT('%', TRIM(pm.process_keyword), '%')))
                      THEN sr.scan_time END) AS secondary_process_start_time,
                  MAX(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
                             OR EXISTS (SELECT 1 FROM t_process_parent_mapping pm WHERE pm.parent_node = '二次工艺' AND TRIM(sr.process_name) LIKE CONCAT('%', TRIM(pm.process_keyword), '%')))
                      THEN sr.scan_time END) AS secondary_process_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
                             OR EXISTS (SELECT 1 FROM t_process_parent_mapping pm WHERE pm.parent_node = '二次工艺' AND TRIM(sr.process_name) LIKE CONCAT('%', TRIM(pm.process_keyword), '%')))
                      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '') ) USING binary) END),
                    '|', -1
                  ) AS secondary_process_operator_name,
                  SUM(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
                             OR EXISTS (SELECT 1 FROM t_process_parent_mapping pm WHERE pm.parent_node = '二次工艺' AND TRIM(sr.process_name) LIKE CONCAT('%', TRIM(pm.process_keyword), '%')))
                      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS secondary_process_quantity,
                  -- ★ packaging_* 列实际存「尾部」父节点聚合（与 ironing_* 值相同）
                  MIN(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
                      THEN sr.scan_time END) AS packaging_start_time,
                  MAX(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
                      THEN sr.scan_time END) AS packaging_end_time,
                  SUBSTRING_INDEX(
                    MAX(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
                      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '') ) USING binary) END),
                    '|', -1
                  ) AS packaging_operator_name,
                  SUM(CASE WHEN sr.scan_type = 'production'
                        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
                             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
                      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS packaging_quantity,
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
                      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '') ) USING binary) END),
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
                    MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '') ) USING binary) END),
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
                    AND sr.scan_type IN ('production', 'cutting', 'quality', 'warehouse', 'pattern')
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
                    MAX(CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(COALESCE(p.received_time, p.update_time)), 20, '0'), LPAD(UNIX_TIMESTAMP(p.update_time), 20, '0'), '|', IFNULL(p.receiver_name, '') ) USING binary)),
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
        executeViewWithFallback(jdbc, "v_production_order_flow_stage_snapshot", flowStageSnapshot);
        executeViewWithFallback(jdbc, "v_production_order_stage_done_agg", stageDoneAgg);
        executeViewWithFallback(jdbc, "v_production_order_procurement_snapshot", procurementSnapshot);
    }

    private void executeViewWithFallback(JdbcTemplate jdbc, String viewName, String createSql) {
        try {
            jdbc.execute(createSql);
            log.info("View {} checked/created.", viewName);
        } catch (Exception e) {
            log.warn("Failed to create view {}: {}", viewName, e.getMessage());
        }

        if (!verifyViewColumns(jdbc, viewName, createSql)) {
            log.warn("[ViewMigrator] 视图 {} 列不完整，强制重建...", viewName);
            try {
                jdbc.execute("DROP VIEW IF EXISTS " + viewName);
                jdbc.execute(createSql);
                log.info("[ViewMigrator] 视图 {} 重建成功", viewName);
            } catch (Exception retryEx) {
                log.error("[ViewMigrator] FATAL: 视图 {} 重建失败: {}", viewName, retryEx.getMessage());
            }
        }
    }

    private boolean verifyViewColumns(JdbcTemplate jdbc, String viewName, String createSql) {
        try {
            List<String> actualCols = jdbc.queryForList(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
                    + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
                    String.class, viewName);
            if (actualCols.isEmpty()) {
                log.error("[ViewMigrator] 视图 {} 不存在（0列）", viewName);
                return false;
            }
            List<String> expectedCols = extractExpectedColumns(createSql);
            for (String expected : expectedCols) {
                if (!actualCols.contains(expected)) {
                    log.error("[ViewMigrator] 视图 {} 缺列: 期望={}, 实际有={}", viewName, expected, actualCols);
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            log.warn("[ViewMigrator] 视图 {} 列验证失败: {}", viewName, e.getMessage());
            return true;
        }
    }

    // SQL 关键字集合：防止 extractExpectedColumns 把 SELECT/FROM 等误识别为列别名
    // （复现场景：selectStart 正则因格式偏差未能匹配时，aliasPattern 会抓到 "AS SELECT\n"）
    private static final java.util.Set<String> SQL_KEYWORDS = java.util.Set.of(
            "select", "from", "where", "group", "order", "having", "join",
            "inner", "outer", "left", "right", "cross", "on", "and", "or", "not",
            "as", "in", "by", "null", "case", "when", "then", "else", "end",
            "distinct", "all", "union", "intersect", "except", "binary", "using",
            "convert", "concat", "lpad", "ifnull", "coalesce", "nullif",
            "trim", "max", "min", "sum", "count", "substring_index");

    private List<String> extractExpectedColumns(String createSql) {
        // 跳过 "CREATE VIEW xxx AS" 前缀（AS 和 SELECT 之间可能有换行），只解析列别名
        java.util.regex.Pattern selectStart = java.util.regex.Pattern.compile(
                "(?i)\\bAS\\s+SELECT\\b");
        java.util.regex.Matcher sm = selectStart.matcher(createSql);
        String selectPart = sm.find() ? createSql.substring(sm.end()) : createSql;

        List<String> cols = new ArrayList<>();
        Pattern aliasPattern = Pattern.compile("(?i)\\bAS\\s+(`?)([a-z_][a-z0-9_]*)\\1\\s*(?:,|\\n|\\r|$)");
        Matcher m = aliasPattern.matcher(selectPart);
        while (m.find()) {
            String col = m.group(2);
            // 过滤 SQL 关键字，避免把 SELECT/FROM/WHERE 等误识别为期望列名
            if (col != null && !cols.contains(col) && !SQL_KEYWORDS.contains(col.toLowerCase())) {
                cols.add(col);
            }
        }
        return cols;
    }
}
