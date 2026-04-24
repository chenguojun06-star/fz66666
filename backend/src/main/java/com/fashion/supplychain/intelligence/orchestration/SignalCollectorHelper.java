package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskRequest;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceSignalResponse.SignalItem;
import com.fashion.supplychain.intelligence.dto.MaterialShortageResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleProcessService;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 信号采集辅助类 — 从 IntelligenceSignalOrchestrator 拆分而来。
 * 包含：异常检测、交付风险、物料短缺、服装专属信号（BOM/跳序/停滞/未启动）。
 */
@Component
@Slf4j
public class SignalCollectorHelper {

    private static final int PRIORITY_CRITICAL = 92;
    private static final int PRIORITY_WARNING = 65;
    private static final int PRIORITY_INFO = 40;

    private static final String[][] GARMENT_STAGE_RULES = {
        {"车缝", "裁剪"},
        {"质检", "车缝"},
        {"入库", "质检"},
    };

    @Autowired
    private AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;
    @Autowired
    private OrderDeliveryRiskOrchestrator orderDeliveryRiskOrchestrator;
    @Autowired
    private MaterialShortageOrchestrator materialShortageOrchestrator;
    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private StyleProcessService styleProcessService;
    @Autowired
    private ScanRecordService scanRecordService;

    // ── 异常检测 ──
    public List<SignalItem> collectAnomalies(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        try {
            AnomalyDetectionResponse resp = anomalyDetectionOrchestrator.detect();
            if (resp == null || resp.getAnomalies() == null) return items;
            for (AnomalyDetectionResponse.AnomalyItem a : resp.getAnomalies()) {
                SignalItem s = new SignalItem();
                s.setSignalType("anomaly");
                s.setSignalCode(a.getType());
                s.setSignalLevel(toLevel(a.getSeverity()));
                s.setSourceDomain("production");
                s.setSignalTitle(buildAnomalyTitle(a));
                s.setSignalDetail(a.getDescription());
                s.setPriorityScore(calcPriority(s.getSignalLevel(), a.getDeviationRatio()));
                s.setStatus("open");
                items.add(s);
            }
        } catch (Exception e) {
            log.warn("[信号采集] 异常检测器失败，已跳过: {}", e.getMessage());
        }
        return items;
    }

    // ── 交付风险 ──
    public List<SignalItem> collectDeliveryRisks(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        try {
            DeliveryRiskRequest req = new DeliveryRiskRequest();
            DeliveryRiskResponse resp = orderDeliveryRiskOrchestrator.assess(req);
            if (resp == null || resp.getOrders() == null) return items;
            for (DeliveryRiskResponse.DeliveryRiskItem r : resp.getOrders()) {
                if (r.getRiskLevel() == null) continue;
                SignalItem s = new SignalItem();
                s.setSignalType("delivery_risk");
                s.setSignalCode("order_delay_risk");
                s.setSignalLevel(toLevel(r.getRiskLevel()));
                s.setSourceDomain("production");
                s.setSourceId(r.getOrderId());
                s.setSignalTitle("订单 " + r.getOrderNo() + " 存在逾期风险");
                s.setSignalDetail(r.getRiskDescription());
                s.setPriorityScore(calcPriority(s.getSignalLevel(), 0));
                s.setStatus("open");
                items.add(s);
            }
        } catch (Exception e) {
            log.warn("[信号采集] 交付风险检测器失败，已跳过: {}", e.getMessage());
        }
        return items;
    }

    // ── 物料短缺 ──
    public List<SignalItem> collectMaterialShortages(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        try {
            MaterialShortageResponse resp = materialShortageOrchestrator.predict();
            if (resp == null || resp.getShortageItems() == null) return items;
            for (MaterialShortageResponse.ShortageItem m : resp.getShortageItems()) {
                boolean urgent = "high".equals(m.getRiskLevel()) || "critical".equals(m.getRiskLevel());
                SignalItem s = new SignalItem();
                s.setSignalType("material_shortage");
                s.setSignalCode("stock_below_safety");
                s.setSignalLevel(urgent ? "critical" : "warning");
                s.setSourceDomain("warehouse");
                s.setSignalTitle("面料 " + m.getMaterialName() + " 库存不足");
                s.setSignalDetail("当前库存: " + m.getCurrentStock() + m.getUnit()
                        + "，需求量: " + m.getDemandQuantity() + m.getUnit());
                s.setPriorityScore(urgent ? PRIORITY_CRITICAL : PRIORITY_WARNING);
                s.setStatus("open");
                items.add(s);
            }
        } catch (Exception e) {
            log.warn("[信号采集] 物料短缺检测器失败，已跳过: {}", e.getMessage());
        }
        return items;
    }

    // ── 服装专属信号总入口 ──
    public List<SignalItem> collectGarmentSignals(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        try { items.addAll(collectBomMissingSignals(tenantId)); }
        catch (Exception e) { log.warn("[服装信号] BOM工序缺失检测失败: {}", e.getMessage()); }
        try { items.addAll(collectScanSequenceAnomalies(tenantId)); }
        catch (Exception e) { log.warn("[服装信号] 扫码跳序检测失败: {}", e.getMessage()); }
        try { items.addAll(collectStagnantOrderSignals(tenantId)); }
        catch (Exception e) { log.warn("[服装信号] 停滞订单检测失败: {}", e.getMessage()); }
        try { items.addAll(collectNeverStartedSignals(tenantId)); }
        catch (Exception e) { log.warn("[服装信号] 未启动订单检测失败: {}", e.getMessage()); }
        return items;
    }

    // ── BOM工序缺失 ──
    private List<SignalItem> collectBomMissingSignals(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .in(ProductionOrder::getStatus, List.of("production", "delayed"))
                .isNotNull(ProductionOrder::getStyleId)
                .last("LIMIT 80").list();

        for (ProductionOrder order : orders) {
            try {
                long processCount = styleProcessService.lambdaQuery()
                        .eq(StyleProcess::getStyleId, Long.parseLong(order.getStyleId())).count();
                if (processCount == 0) {
                    String styleName = order.getStyleName() != null ? order.getStyleName() : order.getStyleNo();
                    SignalItem s = new SignalItem();
                    s.setSignalType("garment_risk");
                    s.setSignalCode("bom_missing");
                    s.setSignalLevel("warning");
                    s.setSourceDomain("style");
                    s.setSourceId(order.getOrderNo());
                    s.setSignalTitle("款式未配置工序单价，结算将缺失");
                    s.setSignalDetail("订单 " + order.getOrderNo() + " 款式[" + styleName
                            + "]未配置任何工序，工资结算时将无法核算工价。建议IE工艺员立即补录工序流程与单价。");
                    s.setPriorityScore(PRIORITY_WARNING);
                    s.setStatus("open");
                    items.add(s);
                }
            } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
        }
        return items;
    }

    // ── 扫码跳序 ──
    private List<SignalItem> collectScanSequenceAnomalies(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getStatus, "production")
                .last("LIMIT 80").list();

        for (ProductionOrder order : orders) {
            try {
                List<ScanRecord> scans = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getOrderId, order.getId().toString())
                        .eq(ScanRecord::getScanResult, "success").list();
                if (scans.isEmpty()) continue;

                Set<String> stages = scans.stream()
                        .map(ScanRecord::getProgressStage)
                        .filter(stage -> stage != null && !stage.isBlank())
                        .collect(Collectors.toSet());

                for (String[] rule : GARMENT_STAGE_RULES) {
                    boolean hasDown = stages.stream().anyMatch(s -> s.contains(rule[0]));
                    boolean hasUp = stages.stream().anyMatch(s -> s.contains(rule[1]));
                    if (hasDown && !hasUp) {
                        SignalItem s = new SignalItem();
                        s.setSignalType("garment_risk");
                        s.setSignalCode("scan_skip_sequence");
                        s.setSignalLevel("warning");
                        s.setSourceDomain("production");
                        s.setSourceId(order.getId().toString());
                        s.setSignalTitle("订单 " + order.getOrderNo() + " 工序扫码顺序异常");
                        s.setSignalDetail("检测到[" + rule[0] + "]工序已有扫码，但前道[" + rule[1]
                                + "]工序无扫码记录。建议跟单员确认后补录或撤销异常扫码。");
                        s.setPriorityScore(PRIORITY_WARNING);
                        s.setStatus("open");
                        items.add(s);
                        break;
                    }
                }
            } catch (Exception e) {
                log.debug("[服装信号] 跳序检查订单 {} 失败: {}", order.getOrderNo(), e.getMessage());
            }
        }
        return items;
    }

    // ── 停滞订单 ──
    private List<SignalItem> collectStagnantOrderSignals(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        LocalDateTime threshold = LocalDateTime.now().minusDays(3);

        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .in(ProductionOrder::getStatus, List.of("production", "delayed"))
                .last("LIMIT 100").list();

        for (ProductionOrder order : orders) {
            try {
                ScanRecord lastScan = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getOrderId, order.getId().toString())
                        .eq(ScanRecord::getScanResult, "success")
                        .orderByDesc(ScanRecord::getScanTime).last("LIMIT 1").one();
                if (lastScan != null && lastScan.getScanTime() != null
                        && lastScan.getScanTime().isBefore(threshold)) {
                    long days = ChronoUnit.DAYS.between(lastScan.getScanTime(), LocalDateTime.now());
                    SignalItem s = new SignalItem();
                    s.setSignalType("garment_risk");
                    s.setSignalCode("order_stagnant");
                    s.setSignalLevel(days >= 5 ? "critical" : "warning");
                    s.setSourceDomain("production");
                    s.setSourceId(order.getId().toString());
                    s.setSignalTitle("订单 " + order.getOrderNo() + " 持续 " + days + " 天无扫码生产");
                    s.setSignalDetail("最后扫码：" + lastScan.getScanTime().toLocalDate() + "，停滞 " + days + " 天。"
                            + (order.getPlannedEndDate() != null
                                ? "交期：" + order.getPlannedEndDate().toLocalDate() + "，请确认异常原因。"
                                : "建议跟单员跟进生产进度。"));
                    s.setPriorityScore(days >= 5 ? PRIORITY_CRITICAL : PRIORITY_WARNING);
                    s.setStatus("open");
                    items.add(s);
                }
            } catch (Exception e) {
                log.debug("[服装信号] 停滞检查订单 {} 失败: {}", order.getOrderNo(), e.getMessage());
            }
        }
        return items;
    }

    // ── 未启动订单 ──
    private List<SignalItem> collectNeverStartedSignals(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        LocalDateTime startThreshold = LocalDateTime.now().minusDays(1);

        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .in(ProductionOrder::getStatus, List.of("production", "delayed"))
                .lt(ProductionOrder::getCreateTime, startThreshold)
                .last("LIMIT 100").list();

        for (ProductionOrder order : orders) {
            try {
                long scanCount = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getOrderId, order.getId().toString()).count();
                if (scanCount == 0) {
                    long hours = ChronoUnit.HOURS.between(order.getCreateTime(), LocalDateTime.now());
                    SignalItem s = new SignalItem();
                    s.setSignalType("garment_risk");
                    s.setSignalCode("order_not_started");
                    s.setSignalLevel(hours >= 48 ? "critical" : "warning");
                    s.setSourceDomain("production");
                    s.setSourceId(order.getId().toString());
                    s.setSignalTitle("订单 " + order.getOrderNo() + " 下单后 " + (hours / 24) + " 天未开始生产");
                    s.setSignalDetail("创建已 " + hours + " 小时，工厂「"
                            + (order.getFactoryName() != null ? order.getFactoryName() : "未指定")
                            + "」从未扫码。"
                            + (order.getPlannedEndDate() != null
                                ? "交期：" + order.getPlannedEndDate().toLocalDate() + "。"
                                : "建议跟单员联系工厂排产。"));
                    s.setPriorityScore(hours >= 48 ? PRIORITY_CRITICAL : PRIORITY_WARNING);
                    s.setStatus("open");
                    items.add(s);
                }
            } catch (Exception e) {
                log.debug("[服装信号] 未启动检查订单 {} 失败: {}", order.getOrderNo(), e.getMessage());
            }
        }
        return items;
    }

    // ── 工具方法 ──
    public String toLevel(String severity) {
        if (severity == null) return "info";
        return switch (severity.toLowerCase()) {
            case "critical", "high", "urgent" -> "critical";
            case "warning", "medium", "warn" -> "warning";
            default -> "info";
        };
    }

    public int calcPriority(String level, Object rawScore) {
        int base = switch (level) {
            case "critical" -> PRIORITY_CRITICAL;
            case "warning" -> PRIORITY_WARNING;
            default -> PRIORITY_INFO;
        };
        if (rawScore instanceof Number number) {
            int score = number.intValue();
            if (score > 0 && score <= 100) return Math.min(100, (base + score) / 2);
        }
        return base;
    }

    private String buildAnomalyTitle(AnomalyDetectionResponse.AnomalyItem a) {
        return switch (a.getType()) {
            case "output_spike" -> "工人 " + a.getTargetName() + " 今日产量异常偏高";
            case "quality_spike" -> "工人 " + a.getTargetName() + " 今日质检失败率异常";
            case "idle_worker" -> "工人 " + a.getTargetName() + " 连续多日无扫码";
            case "night_scan" -> "检测到非工作时间扫码记录";
            default -> a.getDescription();
        };
    }
}
