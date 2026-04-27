package com.fashion.supplychain.intelligence.orchestration.report;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
public class ReportDataCollector {

    @Autowired
    private ScanRecordService scanRecordService;
    @Autowired
    private ProductionOrderService productionOrderService;

    public record ReportContext(Long tenantId, String factoryId, String scopeUserId,
                                String scopeUsername, boolean isManager,
                                ReportFormatHelper.TimeRange range, LocalDate baseDate) {
    }

    public ReportContext resolveContext(String reportType, LocalDate baseDate) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();
        if (baseDate == null) baseDate = LocalDate.now();

        boolean isManager = UserContext.canViewAll();
        String currentUserId = UserContext.userId();
        String currentUsername = UserContext.username();
        String scopeUserId = isManager ? null : currentUserId;
        String scopeUsername = isManager ? null : currentUsername;

        ReportFormatHelper.TimeRange range = ReportFormatHelper.calcTimeRange(reportType, baseDate);

        if (baseDate.equals(LocalDate.now())) {
            long todayScans = countScans(tenantId, range.start(), range.end(), scopeUserId, factoryId);
            long todayOrders = countNewOrders(tenantId, range.start(), range.end(), scopeUserId, scopeUsername, factoryId);
            if (todayScans == 0 && todayOrders == 0) {
                LocalDate fallbackDate = findLatestDataDate(tenantId, scopeUserId, scopeUsername, factoryId);
                if (fallbackDate != null) {
                    baseDate = fallbackDate;
                    range = ReportFormatHelper.calcTimeRange(reportType, baseDate);
                    log.info("[ProfessionalReport] 智能报表兜底：{}今日无数据，自动回溯至最近有效日期 {}", reportType, baseDate);
                }
            }
        }

        return new ReportContext(tenantId, factoryId, scopeUserId, scopeUsername, isManager, range, baseDate);
    }

    private LocalDate findLatestDataDate(Long tenantId, String scopeUserId, String scopeUsername, String factoryId) {
        LocalDate fallbackDate = null;

        QueryWrapper<ScanRecord> sq = new QueryWrapper<>();
        sq.eq("tenant_id", tenantId);
        if (scopeUserId != null) sq.eq("operator_id", scopeUserId);
        if (factoryId != null && !factoryId.isBlank()) sq.eq("factory_id", factoryId);
        sq.eq("scan_result", "success").ne("scan_type", "orchestration").orderByDesc("scan_time").last("LIMIT 1").select("scan_time");
        ScanRecord latestScan = scanRecordService.getOne(sq);
        if (latestScan != null && latestScan.getScanTime() != null) {
            fallbackDate = latestScan.getScanTime().toLocalDate();
        }

        QueryWrapper<ProductionOrder> oq = baseOrderQuery(tenantId, scopeUserId, scopeUsername, factoryId);
        oq.orderByDesc("create_time").last("LIMIT 1").select("create_time");
        ProductionOrder latestOrder = productionOrderService.getOne(oq);
        if (latestOrder != null && latestOrder.getCreateTime() != null) {
            LocalDate orderDate = latestOrder.getCreateTime().toLocalDate();
            if (fallbackDate == null || orderDate.isAfter(fallbackDate)) {
                fallbackDate = orderDate;
            }
        }

        return fallbackDate;
    }

    public long countScans(Long tenantId, LocalDateTime start, LocalDateTime end, String userId, String factoryId) {
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId, userId, factoryId);
        q.ge("scan_time", start).le("scan_time", end);
        return scanRecordService.count(q);
    }

    public long sumScanQty(Long tenantId, LocalDateTime start, LocalDateTime end, String userId, String factoryId) {
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId, userId, factoryId);
        q.ge("scan_time", start).le("scan_time", end);
        q.select("IFNULL(SUM(quantity), 0) as quantity");
        try {
            ScanRecord result = scanRecordService.getOne(q, false);
            return result != null && result.getQuantity() != null ? result.getQuantity() : 0;
        } catch (Exception e) {
            log.warn("[ReportDataCollector] sumScanQty聚合查询失败: {}", e.getMessage());
            return 0;
        }
    }

    public long countScansByType(Long tenantId, LocalDateTime start, LocalDateTime end,
                                  String scanType, String userId, String factoryId) {
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId, userId, factoryId);
        q.ge("scan_time", start).le("scan_time", end).eq("scan_type", scanType);
        return scanRecordService.count(q);
    }

    public long countNewOrders(Long tenantId, LocalDateTime start, LocalDateTime end,
                                String userId, String username, String factoryId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId, userId, username, factoryId);
        q.ge("create_time", start).le("create_time", end);
        return productionOrderService.count(q);
    }

    public long countCompletedOrders(Long tenantId, LocalDateTime start, LocalDateTime end,
                                      String userId, String username, String factoryId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId, userId, username, factoryId);
        q.ge("update_time", start).le("update_time", end).eq("status", "COMPLETED");
        return productionOrderService.count(q);
    }

    public long countOrdersByStatus(Long tenantId, String status, String userId, String username, String factoryId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId, userId, username, factoryId);
        q.eq("status", status);
        return productionOrderService.count(q);
    }

    public List<ProductionOrder> getOverdueOrders(Long tenantId, String userId, String username, String factoryId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId, userId, username, factoryId);
        q.lt("delivery_date", LocalDate.now()).ne("status", "COMPLETED").ne("status", "CANCELLED");
        q.last("LIMIT 5000");
        return productionOrderService.list(q);
    }

    public List<ProductionOrder> getHighRiskOrders(Long tenantId, String userId, String username, String factoryId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId, userId, username, factoryId);
        q.ne("status", "COMPLETED").ne("status", "CANCELLED");
        q.and(w -> w.likeRight("order_no", "URGENT").or().like("remark", "紧急").or().like("remark", "加急"));
        q.last("LIMIT 5000");
        return productionOrderService.list(q);
    }

    public long countStagnantOrders(Long tenantId, String userId, String username, String factoryId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId, userId, username, factoryId);
        q.ne("status", "COMPLETED").ne("status", "CANCELLED");
        q.lt("update_time", LocalDateTime.now().minusDays(3));
        return productionOrderService.count(q);
    }

    public List<ReportFormatHelper.FactoryRank> buildFactoryRankings(Long tenantId, LocalDateTime start,
                                                                      LocalDateTime end, String userId,
                                                                      String username, String factoryId) {
        QueryWrapper<ScanRecord> sq = baseScanQuery(tenantId, userId, factoryId);
        sq.ge("scan_time", start).le("scan_time", end);
        sq.last("LIMIT 5000");
        List<ScanRecord> scans = scanRecordService.list(sq);

        QueryWrapper<ProductionOrder> fq = baseOrderQuery(tenantId, userId, username, factoryId);
        fq.last("LIMIT 5000");
        List<ProductionOrder> orders = productionOrderService.list(fq);

        java.util.Map<String, long[]> factoryData = new java.util.LinkedHashMap<>();
        for (ScanRecord s : scans) {
            String fn = s.getProcessName() != null ? s.getProcessName() : "未知工厂";
            factoryData.computeIfAbsent(fn, k -> new long[2]);
            factoryData.get(fn)[0]++;
            factoryData.get(fn)[1] += s.getQuantity() != null ? s.getQuantity() : 0;
        }

        return factoryData.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]))
                .map(e -> new ReportFormatHelper.FactoryRank(e.getKey(), e.getValue()[0], e.getValue()[1]))
                .toList();
    }

    public List<ScanRecord> getScansInRange(Long tenantId, LocalDateTime start, LocalDateTime end,
                                             String userId, String factoryId) {
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId, userId, factoryId);
        q.ge("scan_time", start).le("scan_time", end);
        q.last("LIMIT 5000");
        return scanRecordService.list(q);
    }

    public BigDecimal sumScanCost(List<ScanRecord> scans) {
        return scans.stream()
                .map(s -> s.getScanCost() != null ? s.getScanCost() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public QueryWrapper<ScanRecord> baseScanQuery(Long tenantId, String userId, String factoryId) {
        QueryWrapper<ScanRecord> q = new QueryWrapper<>();
        q.eq("tenant_id", tenantId);
        q.eq("scan_result", "success");
        q.ne("scan_type", "orchestration");
        if (userId != null) q.eq("operator_id", userId);
        if (factoryId != null && !factoryId.isBlank()) q.eq("factory_id", factoryId);
        return q;
    }

    public QueryWrapper<ProductionOrder> baseOrderQuery(Long tenantId, String userId,
                                                         String username, String factoryId) {
        QueryWrapper<ProductionOrder> q = new QueryWrapper<>();
        q.eq("tenant_id", tenantId);
        q.eq("delete_flag", 0);
        if (userId != null) {
            q.and(w -> {
                w.eq("created_by", userId);
                if (username != null) {
                    w.or().like("merchandiser_name", username);
                }
            });
        }
        if (factoryId != null && !factoryId.isBlank()) {
            q.eq("factory_id", factoryId);
        }
        return q;
    }
}
