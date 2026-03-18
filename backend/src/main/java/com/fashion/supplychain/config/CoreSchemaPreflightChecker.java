package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 只读核心表结构预检器。
 *
 * 目标：在应用启动时提前暴露核心表缺列风险，避免等到页面请求命中实体查询才报 500。
 * 约束：只做 INFORMATION_SCHEMA 检查和日志告警，不自动修库，不把服务标记为 down。
 */
@Component
@Order(11)
@Slf4j
public class CoreSchemaPreflightChecker implements ApplicationRunner, HealthIndicator {

    private static final Map<String, List<String>> REQUIRED_COLUMNS;

    static {
        Map<String, List<String>> tableColumns = new LinkedHashMap<>();
        tableColumns.put("t_material_purchase", List.of(
                "tenant_id", "inbound_record_id", "supplier_contact_person", "supplier_contact_phone",
                "color", "size", "return_confirmed", "return_quantity", "return_confirmer_id",
                "return_confirmer_name", "return_confirm_time", "creator_id", "creator_name",
                "updater_id", "updater_name", "expected_arrival_date", "actual_arrival_date",
                "expected_ship_date", "source_type", "pattern_production_id", "evidence_image_urls",
                "fabric_composition", "invoice_urls"
        ));
        tableColumns.put("t_purchase_order_doc", List.of(
            "tenant_id", "order_no", "image_url", "raw_text", "match_count",
            "total_recognized", "uploader_id", "uploader_name", "create_time", "delete_flag"
        ));
        tableColumns.put("t_production_order", List.of(
                "progress_workflow_json", "progress_workflow_locked", "progress_workflow_locked_at",
                "progress_workflow_locked_by", "progress_workflow_locked_by_name", "skc", "org_unit_id",
                "parent_org_unit_id", "parent_org_unit_name", "org_path", "factory_type",
                "factory_contact_person", "factory_contact_phone", "procurement_manually_completed",
                "procurement_confirmed_by", "procurement_confirmed_by_name", "procurement_confirmed_at",
                "procurement_confirm_remark", "urgency_level", "plate_type", "order_biz_type"
        ));
        tableColumns.put("t_pattern_production", List.of(
                "review_status", "receiver_id", "pattern_maker_id", "tenant_id", "has_secondary_process"
        ));
        tableColumns.put("t_factory", List.of("supplier_type"));
        tableColumns.put("t_style_info", List.of(
                "fabric_composition", "wash_instructions", "u_code", "fabric_composition_parts"
        ));
        REQUIRED_COLUMNS = Collections.unmodifiableMap(tableColumns);
    }

    private final DataSource dataSource;

    @Value("${fashion.db.schema-preflight-enabled:true}")
    private boolean enabled;

    private volatile Map<String, List<String>> lastMissingColumns = Collections.emptyMap();

    private volatile long lastNullTenantScanCount;

    private volatile long lastZeroTenantScanCount;

    private volatile LocalDateTime lastCheckedAt;

    public CoreSchemaPreflightChecker(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) {
            log.info("[SchemaPreflight] 已禁用核心表结构预检");
            return;
        }
        checkAndLog();
    }

    @Override
    public Health health() {
        if (!enabled) {
            return Health.up()
                    .withDetail("schemaPreflight", "disabled")
                    .build();
        }

        Map<String, List<String>> snapshot = lastMissingColumns;
        String status = snapshot.isEmpty() ? "OK" : "WARN";
        return Health.up()
                .withDetail("schemaPreflight", status)
                .withDetail("checkedAt", lastCheckedAt == null ? "never" : lastCheckedAt.toString())
                .withDetail("missingSummary", formatSummary(snapshot))
                .withDetail("scanRecordNullTenantCount", lastNullTenantScanCount)
                .withDetail("scanRecordZeroTenantCount", lastZeroTenantScanCount)
                .build();
    }

    private void checkAndLog() {
        Map<String, List<String>> missing = new LinkedHashMap<>();
        LocalDateTime checkedAt = LocalDateTime.now();
        long nullTenantScanCount = 0L;
        long zeroTenantScanCount = 0L;
        try (Connection conn = dataSource.getConnection()) {
            String schema = conn.getCatalog();
            for (Map.Entry<String, List<String>> entry : REQUIRED_COLUMNS.entrySet()) {
                List<String> tableMissing = findMissingColumns(conn, schema, entry.getKey(), entry.getValue());
                if (!tableMissing.isEmpty()) {
                    missing.put(entry.getKey(), tableMissing);
                }
            }
            nullTenantScanCount = countScanRecordTenantAnomalies(conn, "tenant_id IS NULL");
            zeroTenantScanCount = countScanRecordTenantAnomalies(conn, "tenant_id = 0");
        } catch (Exception e) {
            log.error("[SchemaPreflight] 核心表结构预检失败: {}", e.getMessage());
            missing.put("__preflight_error__", List.of(e.getMessage()));
        }
        lastMissingColumns = Collections.unmodifiableMap(new LinkedHashMap<>(missing));
        lastNullTenantScanCount = nullTenantScanCount;
        lastZeroTenantScanCount = zeroTenantScanCount;
        lastCheckedAt = checkedAt;

        if (missing.isEmpty()) {
            log.info("[SchemaPreflight] 核心表结构预检通过：生产/采购/单据/打版/款式核心缺列为 0");
        } else {
            log.warn("[SchemaPreflight] 检测到核心表结构缺口：{}", formatSummary(missing));
            log.warn("[SchemaPreflight] 建议优先运行 deployment/cloud-db-core-schema-preflight-20260318.sql 做云端体检，再按缺列结果补库");
        }

        if (nullTenantScanCount > 0 || zeroTenantScanCount > 0) {
            log.warn("[SchemaPreflight] 检测到扫码记录租户归属异常：tenant_id IS NULL = {}, tenant_id = 0 = {}",
                    nullTenantScanCount, zeroTenantScanCount);
            log.warn("[SchemaPreflight] 建议立即运行 deployment/cloud-db-scan-record-tenant-repair-20260318.sql 排查并回填历史脏数据");
        }
    }

    private List<String> findMissingColumns(Connection conn, String schema, String table, List<String> expectedColumns)
            throws Exception {
        if (expectedColumns == null || expectedColumns.isEmpty()) {
            return List.of();
        }
        Set<String> actualColumns = loadActualColumns(conn, schema, table);
        List<String> missing = new ArrayList<>();
        for (String column : expectedColumns) {
            if (!actualColumns.contains(column)) {
                missing.add(column);
            }
        }
        return missing;
    }

    private Set<String> loadActualColumns(Connection conn, String schema, String table) throws Exception {
        String sql = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?";
        Set<String> columns = new LinkedHashSet<>();
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, table);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    columns.add(rs.getString(1));
                }
            }
        }
        return columns;
    }

    private long countScanRecordTenantAnomalies(Connection conn, String condition) throws Exception {
        String sql = "SELECT COUNT(*) FROM t_scan_record WHERE " + condition;
        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            if (rs.next()) {
                return rs.getLong(1);
            }
        }
        return 0L;
    }

    private String formatSummary(Map<String, List<String>> missing) {
        if (missing == null || missing.isEmpty()) {
            return "none";
        }
        return missing.entrySet().stream()
                .map(entry -> entry.getKey() + ":" + String.join(",", entry.getValue()))
                .collect(Collectors.joining(" | "));
    }
}
