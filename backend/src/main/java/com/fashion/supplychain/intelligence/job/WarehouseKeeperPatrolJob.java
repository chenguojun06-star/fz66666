package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
@Lazy
public class WarehouseKeeperPatrolJob extends AbstractPatrolJob {

    /** 入库差异率阈值（|diffQuantity| / bookQuantity > 此值 视为差异异常） */
    private static final double MATERIAL_DIFF_RATE_THRESHOLD = 0.10;

    @Scheduled(cron = "0 45 */6 * * ?")
    public void patrol() {
        log.info("[WarehouseKeeper] ===== 开始仓库管理员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "warehouse-keeper",
                        "仓库管理员：库存盘点");

                long s1 = System.currentTimeMillis();
                // P0-3 修复：查询入库差异>10%的记录，创建 MATERIAL_DIFF 工单
                List<Map<String, Object>> diffItems = queryMaterialDiffItems(tenantId);
                if (!diffItems.isEmpty() && isPatrolEnabledForTenant(tenantId)) {
                    String itemList = diffItems.stream()
                            .map(i -> String.valueOf(i.getOrDefault("material_code",
                                    i.getOrDefault("material_name", ""))))
                            .filter(s -> !s.isEmpty())
                            .limit(5)
                            .collect(Collectors.joining("、"));
                    String issue = String.format("仓库管理员：发现%d条入库差异>%d%%记录: %s",
                            diffItems.size(), (int)(MATERIAL_DIFF_RATE_THRESHOLD * 100), itemList);
                    withTenantContext(tenantId, () -> patrolOrchestrator.createAction(
                            "WAREHOUSE_KEEPER_JOB", issue, "MATERIAL_DIFF",
                            "MEDIUM", "inventory", itemList,
                            "{\"action\":\"material_diff_alert\"}",
                            BigDecimal.valueOf(0.8), "NEED_APPROVAL"));
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_warehouse_management",
                        String.format("库存盘点完成，发现%d条入库差异记录", diffItems.size()),
                        System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "warehouse-keeper", "仓库管理员",
                        String.format("库存盘点完成，发现%d条入库差异记录", diffItems.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[WarehouseKeeper] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[WarehouseKeeper] ===== 巡检完成 =====");
    }

    /** 查询盘点差异率超过阈值的库存项 */
    private List<Map<String, Object>> queryMaterialDiffItems(Long tenantId) {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT material_code, material_name, book_quantity, actual_quantity, diff_quantity " +
                    "FROM t_inventory_check_item " +
                    "WHERE tenant_id = ? AND delete_flag = 0 " +
                    "AND book_quantity > 0 " +
                    "AND ABS(diff_quantity) / book_quantity > ? " +
                    "LIMIT 20",
                    tenantId, MATERIAL_DIFF_RATE_THRESHOLD);
        } catch (Exception e) {
            log.warn("[WarehouseKeeper] 查询入库差异记录失败: tenant={}, error={}", tenantId, e.getMessage());
            return List.of();
        }
    }
}
