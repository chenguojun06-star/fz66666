package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.entity.IntelligenceFeedbackReason;
import com.fashion.supplychain.intelligence.entity.IntelligencePainPoint;
import com.fashion.supplychain.intelligence.service.IntelligenceFeedbackReasonService;
import com.fashion.supplychain.intelligence.service.IntelligencePainPointService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PainPointAggregationOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private IntelligenceFeedbackReasonService intelligenceFeedbackReasonService;

    @Autowired
    private IntelligencePainPointService intelligencePainPointService;

    @Transactional(rollbackFor = Exception.class)
    public int refreshCurrentTenantPainPoints() {
        Long tenantId = TenantAssert.requireTenantId();
        List<ProductionOrder> orders = productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getTenantId, tenantId)
                .and(wrapper -> wrapper.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                .last("LIMIT 1000"));
        List<ScanRecord> scanRecords = scanRecordService.list(new LambdaQueryWrapper<ScanRecord>()
                .eq(ScanRecord::getTenantId, tenantId)
                .orderByDesc(ScanRecord::getScanTime)
                .last("LIMIT 2000"));
        List<IntelligenceFeedbackReason> feedbackReasons = intelligenceFeedbackReasonService.list(new LambdaQueryWrapper<IntelligenceFeedbackReason>()
                .eq(IntelligenceFeedbackReason::getTenantId, tenantId)
                .orderByDesc(IntelligenceFeedbackReason::getCreateTime)
                .last("LIMIT 500"));

        List<IntelligencePainPoint> next = new ArrayList<>();
        addDelayedPainPoint(next, tenantId, orders);
        addFactoryPainPoint(next, tenantId, orders, feedbackReasons);
        addScanPainPoint(next, tenantId, scanRecords);
        addCashflowPainPoint(next, tenantId, scanRecords, feedbackReasons);
        addMaterialPainPoint(next, tenantId, orders);

        intelligencePainPointService.remove(new LambdaQueryWrapper<IntelligencePainPoint>()
                .eq(IntelligencePainPoint::getTenantId, tenantId));
        if (!next.isEmpty()) {
            intelligencePainPointService.saveBatch(next);
        }
        return next.size();
    }

    private void addDelayedPainPoint(List<IntelligencePainPoint> points, Long tenantId, List<ProductionOrder> orders) {
        List<ProductionOrder> delayedOrders = orders.stream()
                .filter(order -> "delayed".equalsIgnoreCase(order.getStatus()))
                .toList();
        if (delayedOrders.isEmpty()) {
            return;
        }
        points.add(buildPainPoint(
                tenantId,
                "DELAY_REPEAT",
                "同类拖期反复出现",
                delayedOrders.size() >= 5 ? "HIGH" : "MEDIUM",
                "PRODUCTION",
                delayedOrders.size(),
                delayedOrders.size(),
                null,
                delayedOrders.stream().map(ProductionOrder::getPlannedEndDate).filter(java.util.Objects::nonNull).max(LocalDateTime::compareTo).orElse(LocalDateTime.now()),
                "近期延期订单持续出现，说明跟单推进和工厂协同存在重复性问题"
        ));
    }

    private void addFactoryPainPoint(List<IntelligencePainPoint> points, Long tenantId, List<ProductionOrder> orders,
                                     List<IntelligenceFeedbackReason> feedbackReasons) {
        long unstableFactoryVotes = feedbackReasons.stream()
                .filter(item -> "FACTORY_UNCONTROLLABLE".equalsIgnoreCase(item.getReasonCode()))
                .count();
        long delayedWithFactory = orders.stream()
                .filter(order -> "delayed".equalsIgnoreCase(order.getStatus()))
                .filter(order -> order.getFactoryName() != null && !order.getFactoryName().isBlank())
                .count();
        if (unstableFactoryVotes == 0 && delayedWithFactory < 2) {
            return;
        }
        points.add(buildPainPoint(
                tenantId,
                "FACTORY_UNSTABLE",
                "工厂执行不稳定",
                unstableFactoryVotes >= 3 || delayedWithFactory >= 4 ? "HIGH" : "MEDIUM",
                "FACTORY",
                (int) (unstableFactoryVotes + delayedWithFactory),
                (int) delayedWithFactory,
                null,
                LocalDateTime.now(),
                "存在工厂不可控反馈，且延期订单明显集中在外发执行环节"
        ));
    }

    private void addScanPainPoint(List<IntelligencePainPoint> points, Long tenantId, List<ScanRecord> scanRecords) {
        List<ScanRecord> failed = scanRecords.stream()
                .filter(record -> !"success".equalsIgnoreCase(record.getScanResult()))
                .toList();
        if (failed.isEmpty()) {
            return;
        }
        points.add(buildPainPoint(
                tenantId,
                "SCAN_EXCEPTION_REPEAT",
                "扫码异常重复发生",
                failed.size() >= 10 ? "HIGH" : "MEDIUM",
                "PRODUCTION",
                failed.size(),
                (int) failed.stream().map(ScanRecord::getOrderId).filter(java.util.Objects::nonNull).distinct().count(),
                null,
                failed.stream().map(ScanRecord::getScanTime).filter(java.util.Objects::nonNull).max(LocalDateTime::compareTo).orElse(LocalDateTime.now()),
                "异常扫码在多个订单和工序重复出现，说明执行标准与现场校验存在缺口"
        ));
    }

    private void addCashflowPainPoint(List<IntelligencePainPoint> points, Long tenantId, List<ScanRecord> scanRecords,
                                      List<IntelligenceFeedbackReason> feedbackReasons) {
        long successCount = scanRecords.stream().filter(record -> "success".equalsIgnoreCase(record.getScanResult())).count();
        long unsettledCount = scanRecords.stream()
                .filter(record -> "success".equalsIgnoreCase(record.getScanResult()))
                .filter(record -> record.getPayrollSettlementId() == null || record.getPayrollSettlementId().isBlank())
                .count();
        long cashflowVotes = feedbackReasons.stream()
                .filter(item -> "CASHFLOW_FIRST".equalsIgnoreCase(item.getReasonCode()))
                .count();
        if (successCount == 0 || (unsettledCount * 1.0D / successCount < 0.5D && cashflowVotes == 0)) {
            return;
        }
        points.add(buildPainPoint(
                tenantId,
                "CASHFLOW_PRESSURE",
                "回款压力偏高",
                cashflowVotes >= 2 || unsettledCount * 1.0D / successCount >= 0.7D ? "HIGH" : "MEDIUM",
                "FINANCE",
                (int) (cashflowVotes + unsettledCount),
                (int) unsettledCount,
                null,
                LocalDateTime.now(),
                "已完工未结算扫码记录占比偏高，且租户反馈倾向优先保障回款节奏"
        ));
    }

    private void addMaterialPainPoint(List<IntelligencePainPoint> points, Long tenantId, List<ProductionOrder> orders) {
        List<ProductionOrder> lowMaterialOrders = orders.stream()
                .filter(order -> safeInt(order.getMaterialArrivalRate()) > 0)
                .filter(order -> safeInt(order.getMaterialArrivalRate()) < 40)
                .toList();
        if (lowMaterialOrders.isEmpty()) {
            return;
        }
        points.add(buildPainPoint(
                tenantId,
                "MATERIAL_SHORTAGE_REPEAT",
                "物料短缺反复发生",
                lowMaterialOrders.size() >= 4 ? "HIGH" : "MEDIUM",
                "WAREHOUSE",
                lowMaterialOrders.size(),
                lowMaterialOrders.size(),
                null,
                lowMaterialOrders.stream().map(ProductionOrder::getUpdateTime).filter(java.util.Objects::nonNull).max(LocalDateTime::compareTo).orElse(LocalDateTime.now()),
                "多张订单物料到位率持续偏低，说明采购与开工节奏匹配不足"
        ));
    }

    private IntelligencePainPoint buildPainPoint(Long tenantId, String painCode, String painName, String painLevel,
                                                 String businessDomain, int triggerCount, int affectedOrderCount,
                                                 BigDecimal affectedAmount, LocalDateTime latestTriggerTime,
                                                 String rootReasonSummary) {
        IntelligencePainPoint entity = new IntelligencePainPoint();
        entity.setTenantId(tenantId);
        entity.setPainCode(painCode);
        entity.setPainName(painName);
        entity.setPainLevel(painLevel);
        entity.setBusinessDomain(businessDomain);
        entity.setTriggerCount(triggerCount);
        entity.setAffectedOrderCount(affectedOrderCount);
        entity.setAffectedAmount(affectedAmount);
        entity.setLatestTriggerTime(latestTriggerTime);
        entity.setRootReasonSummary(rootReasonSummary);
        entity.setCurrentStatus("OPEN");
        entity.setCreateTime(LocalDateTime.now());
        entity.setUpdateTime(LocalDateTime.now());
        return entity;
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : value;
    }
}
