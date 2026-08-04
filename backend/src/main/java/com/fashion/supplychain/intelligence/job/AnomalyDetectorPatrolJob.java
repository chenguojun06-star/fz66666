package com.fashion.supplychain.intelligence.job;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@Lazy
public class AnomalyDetectorPatrolJob extends AbstractPatrolJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 跨模块读取扫码记录（只读）。
     * required=false：扫码服务未注入时跳过节点级超期检测。
     */
    @Autowired(required = false)
    private ScanRecordService scanRecordService;

    @Scheduled(cron = "0 20 */4 * * ?")
    public void patrol() {
        log.info("[AnomalyDetector] ===== 开始异常检测器巡检 =====");
        List<Long> tenants = getActiveTenantIds();
        int totalFindings = 0;

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "anomaly-detector",
                        "异常检测器：对账异常+工厂瓶颈+物料短缺检测");
                int findings = 0;

                long s1 = System.currentTimeMillis();
                List<ProductionOrder> activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .last("LIMIT 500")
                        .list();

                int anomalyCount = 0;
                boolean patrolEnabled = isPatrolEnabledForTenant(tenantId);
                for (ProductionOrder o : activeOrders) {
                    if (o.getPlannedEndDate() != null) {
                        long hoursSinceUpdate = ChronoUnit.HOURS.between(
                                o.getUpdateTime() != null ? o.getUpdateTime() : o.getCreateTime(),
                                LocalDateTime.now());
                        
                        if (hoursSinceUpdate > 48 && o.getProductionProgress() != null && o.getProductionProgress() < 80) {
                            anomalyCount++;
                            if (patrolEnabled) {
                                String issue = String.format("异常检测：订单[%s]超过48小时未更新(进度%d%%)",
                                        o.getOrderNo(), o.getProductionProgress());
                                patrolOrchestrator.createAction("ANOMALY_DETECTOR_JOB", issue, "STAGNANT_ORDER",
                                        "MEDIUM", "order", o.getOrderNo(),
                                        "{\"action\":\"stagnant_alert\"}",
                                        BigDecimal.valueOf(0.7), "NEED_APPROVAL");
                                findings++;
                            }
                        }
                    }
                }
                if (!patrolEnabled && anomalyCount > 0) {
                    log.debug("[AnomalyDetector] 租户 {} 巡检自动执行开关未开启，跳过创建 {} 个工单", tenantId, anomalyCount);
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_anomaly_detection",
                        String.format("停滞检测：扫描%d单，发现%d个停滞订单", activeOrders.size(), anomalyCount),
                        System.currentTimeMillis() - s1, true);

                long s2 = System.currentTimeMillis();
                List<ProductionOrder> materialIssues = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getMaterialArrivalRate)
                        .lt(ProductionOrder::getMaterialArrivalRate, 80)
                        .last("LIMIT 200")
                        .list();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_calculation",
                        String.format("物料检测：发现%d个物料到料率不足80%%的订单", materialIssues.size()),
                        System.currentTimeMillis() - s2, true);

                // ── 3. 节点级超期检测（NODE_STAGNANT）：生产中订单超过 48 小时无扫码 ──
                long s3 = System.currentTimeMillis();
                int nodeStagnantCount = 0;
                if (scanRecordService != null) {
                    for (ProductionOrder o : activeOrders) {
                        try {
                            if (!"production".equalsIgnoreCase(o.getStatus())) continue;
                            LocalDateTime lastScan = queryLatestScanTime(tenantId, o.getOrderNo());
                            // lastScan 为 null 时，用订单创建时间兜底（生产中却从未扫码也是停滞）
                            LocalDateTime baseline = lastScan != null ? lastScan : o.getCreateTime();
                            if (baseline == null) continue;
                            long hoursSinceScan = ChronoUnit.HOURS.between(baseline, LocalDateTime.now());
                            if (hoursSinceScan <= 48) continue;
                            if (!patrolEnabled) {
                                nodeStagnantCount++;
                                continue;
                            }
                            String issue = String.format("订单[%s] 生产中已 %d 小时无扫码（节点停滞）",
                                    o.getOrderNo(), hoursSinceScan);
                            patrolOrchestrator.createAction("ANOMALY_DETECTOR_JOB", issue, "NODE_STAGNANT",
                                    "MEDIUM", "order", o.getOrderNo(),
                                    "{\"action\":\"node_stagnant_alert\"}",
                                    BigDecimal.valueOf(0.7), "NEED_APPROVAL");
                            nodeStagnantCount++;
                            findings++;
                        } catch (Exception ex) {
                            log.debug("[AnomalyDetector] 订单 {} 节点停滞检测异常: {}",
                                    o.getOrderNo(), ex.getMessage());
                        }
                    }
                }
                if (!patrolEnabled && nodeStagnantCount > 0) {
                    log.debug("[AnomalyDetector] 租户 {} 巡检自动执行开关未开启，跳过创建 {} 个节点停滞工单",
                            tenantId, nodeStagnantCount);
                }
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_node_stagnant",
                        String.format("节点停滞检测：扫描%d单，发现%d个停滞订单", activeOrders.size(), nodeStagnantCount),
                        System.currentTimeMillis() - s3, true);

                totalFindings += findings;
                finishAndSnapshot(tenantId, commandId, "anomaly-detector", "异常检测器",
                        String.format("异常检测完成：发现%d个停滞订单", findings),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[AnomalyDetector] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[AnomalyDetector] ===== 巡检完成，发现 {} 个异常 =====", totalFindings);
    }

    /**
     * 查询订单最近一次扫码时间（多租户隔离）。
     * t_scan_record 表无 delete_flag 字段，与 AiPatrolJob 现有查询风格一致。
     */
    @SuppressWarnings("unchecked")
    private LocalDateTime queryLatestScanTime(Long tenantId, String orderNo) {
        if (orderNo == null || orderNo.isBlank()) return null;
        try {
            QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
            qw.select("MAX(scan_time) AS last_scan")
              .eq("tenant_id", tenantId)
              .eq("order_no", orderNo);
            List<Map<String, Object>> rows = (List<Map<String, Object>>) (Object) scanRecordService.listMaps(qw);
            if (rows == null || rows.isEmpty()) return null;
            Object v = rows.get(0).get("last_scan");
            if (v == null) return null;
            if (v instanceof LocalDateTime) return (LocalDateTime) v;
            if (v instanceof java.sql.Timestamp) return ((java.sql.Timestamp) v).toLocalDateTime();
            if (v instanceof java.util.Date) {
                return new java.util.Date(((java.util.Date) v).getTime()).toInstant()
                        .atZone(java.time.ZoneId.systemDefault()).toLocalDateTime();
            }
            return null;
        } catch (Exception e) {
            log.debug("[AnomalyDetector] 查询最近扫码时间失败 orderNo={}: {}", orderNo, e.getMessage());
            return null;
        }
    }
}