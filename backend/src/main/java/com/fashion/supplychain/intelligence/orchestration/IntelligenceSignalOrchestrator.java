package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskRequest;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceSignalResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceSignalResponse.SignalItem;
import com.fashion.supplychain.intelligence.dto.MaterialShortageResponse;
import com.fashion.supplychain.intelligence.entity.IntelligenceSignal;
import com.fashion.supplychain.intelligence.mapper.IntelligenceSignalMapper;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 统一信号采集编排器 — 感知即分析
 *
 * <p>职责：
 * <ol>
 *   <li>并发调用所有检测器（异常、交付风险、物料短缺）</li>
 *   <li>统一计算优先级得分（critical=90, warning=65, info=40）</li>
 *   <li>可选：调用 AI 为每条信号生成一段类人化分析</li>
 *   <li>持久化到 t_intelligence_signal</li>
 *   <li>返回 IntelligenceSignalResponse</li>
 * </ol>
 *
 * <p>降级：上游任何检测器失败均跳过，不影响整体响应。
 */
@Service
@Slf4j
public class IntelligenceSignalOrchestrator {

    // 优先级分值常量
    private static final int PRIORITY_CRITICAL = 92;
    private static final int PRIORITY_WARNING = 65;
    private static final int PRIORITY_INFO = 40;

    @Autowired
    private AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;

    @Autowired
    private OrderDeliveryRiskOrchestrator orderDeliveryRiskOrchestrator;

    @Autowired
    private MaterialShortageOrchestrator materialShortageOrchestrator;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private IntelligenceSignalMapper signalMapper;

    // ── 服装专属信号检测所需服务 ───────────────────────────────────────
    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private ScanRecordService scanRecordService;

    // ──────────────────────────────────────────────────────────────
    //  公开接口
    // ──────────────────────────────────────────────────────────────

    /**
     * 执行一次全域信号采集与分析，结果持久化后返回。
     */
    @Transactional(rollbackFor = Exception.class)
    public IntelligenceSignalResponse collectAndAnalyze() {
        Long tenantId = UserContext.tenantId();
        IntelligenceSignalResponse response = new IntelligenceSignalResponse();
        boolean aiEnabled = aiAdvisorService.isEnabled();
        response.setAiAnalysisEnabled(aiEnabled);

        List<SignalItem> allSignals = new ArrayList<>();

        // ① 异常检测
        allSignals.addAll(collectAnomalies(tenantId));

        // ② 交付风险
        allSignals.addAll(collectDeliveryRisks(tenantId));

        // ③ 物料短缺
        allSignals.addAll(collectMaterialShortages(tenantId));
        // ⑤① 服装专属信号（BOM工序缺失 + 扫码跳序 + 订单停滞）
        allSignals.addAll(collectGarmentSignals(tenantId));
        // ④ AI 批量分析（优先分析 critical 的前5条）
        if (aiEnabled && aiAdvisorService.checkAndConsumeQuota(tenantId)) {
            enrichWithAiAnalysis(allSignals, tenantId);
        }

        // ⑤ 批量持久化
        persistSignals(allSignals, tenantId);

        // ⑥ 统计汇总
        AtomicInteger critical = new AtomicInteger(0);
        AtomicInteger warning = new AtomicInteger(0);
        AtomicInteger info = new AtomicInteger(0);
        allSignals.forEach(s -> {
            if ("critical".equals(s.getSignalLevel())) critical.incrementAndGet();
            else if ("warning".equals(s.getSignalLevel())) warning.incrementAndGet();
            else info.incrementAndGet();
        });

        response.setTotalSignals(allSignals.size());
        response.setCriticalCount(critical.get());
        response.setWarningCount(warning.get());
        response.setInfoCount(info.get());
        response.setSignals(allSignals);

        log.info("[信号采集] tenantId={} 发现信号 {}条（critical={}, warning={}, info={}）",
                tenantId, allSignals.size(), critical.get(), warning.get(), info.get());
        return response;
    }

    /**
     * 查询未解决的高优先级信号（priority >= threshold）。
     */
    public List<IntelligenceSignal> getOpenSignals(Long tenantId, int minPriority) {
        return signalMapper.selectList(new QueryWrapper<IntelligenceSignal>()
                .eq("tenant_id", tenantId)
                .eq("status", "open")
                .eq("delete_flag", 0)
                .ge("priority_score", minPriority)
                .orderByDesc("priority_score")
                .last("LIMIT 50"));
    }

    /** 将信号标记为已处理 */
    @Transactional(rollbackFor = Exception.class)
    public void resolveSignal(Long signalId, Long tenantId) {
        signalMapper.resolveSignal(signalId, tenantId);
    }

    // ──────────────────────────────────────────────────────────────
    //  私有：各检测器采集
    // ──────────────────────────────────────────────────────────────

    private List<SignalItem> collectAnomalies(Long tenantId) {
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

    private List<SignalItem> collectDeliveryRisks(Long tenantId) {
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

    private List<SignalItem> collectMaterialShortages(Long tenantId) {
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

    // ──────────────────────────────────────────────────────────────
    //  私有：AI 分析
    // ──────────────────────────────────────────────────────────────

    private void enrichWithAiAnalysis(List<SignalItem> signals, Long tenantId) {
        // 只分析 critical 的前 5 条，节省 quota
        signals.stream()
                .filter(s -> "critical".equals(s.getSignalLevel()))
                .limit(5)
                .forEach(s -> {
                    try {
                        String prompt = "你是供应链智慧大脑，用2-3句话分析这个生产信号。"
                                + "格式：①为什么 ②可能影响 ③首选建议。信号：" + s.getSignalTitle()
                                + "。详情：" + s.getSignalDetail();
                        String analysis = aiAdvisorService.chat(
                                "你是一个专业的服装供应链分析师，给出简洁准确的信号分析。", prompt);
                        if (analysis != null) s.setSignalAnalysis(analysis);
                    } catch (Exception e) {
                        log.debug("[信号采集] AI 分析单条信号失败: {}", e.getMessage());
                    }
                });
    }

    // ──────────────────────────────────────────────────────────────
    //  私有：持久化
    // ──────────────────────────────────────────────────────────────

    private void persistSignals(List<SignalItem> items, Long tenantId) {
        for (SignalItem item : items) {
            try {
                IntelligenceSignal entity = new IntelligenceSignal();
                entity.setTenantId(tenantId);
                entity.setSignalType(item.getSignalType());
                entity.setSignalCode(item.getSignalCode());
                entity.setSignalLevel(item.getSignalLevel());
                entity.setSourceDomain(item.getSourceDomain());
                entity.setSourceId(item.getSourceId());
                entity.setSignalTitle(item.getSignalTitle());
                entity.setSignalDetail(item.getSignalDetail());
                entity.setSignalAnalysis(item.getSignalAnalysis());
                entity.setPriorityScore(item.getPriorityScore());
                entity.setStatus("open");
                entity.setCreateTime(LocalDateTime.now());
                entity.setUpdateTime(LocalDateTime.now());
                entity.setDeleteFlag(0);
                signalMapper.insert(entity);
                item.setId(entity.getId());
            } catch (Exception e) {
                log.warn("[信号采集] 信号持久化失败: {}", e.getMessage());
            }
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  私有：工具方法
    // ──────────────────────────────────────────────────────────────

    private String toLevel(String severity) {
        if (severity == null) return "info";
        return switch (severity.toLowerCase()) {
            case "critical", "high", "urgent" -> "critical";
            case "warning", "medium", "warn" -> "warning";
            default -> "info";
        };
    }

    private int calcPriority(String level, Object rawScore) {
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

    // ──────────────────────────────────────────────────────────────
    //  服装专属信号采集（Phase A：统一感知基础层）
    //  四类信号：BOM工序缺失 / 工序扫码跳序 / 订单停滞无进展 / 下单后未启动
    // ──────────────────────────────────────────────────────────────

    /**
     * 总入口：统一捕获服装供应链专属异常信号。
     * 每类检测独立 try-catch，任一失败不影响其他。
     */
    private List<SignalItem> collectGarmentSignals(Long tenantId) {
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

    /**
     * 服装信号①：BOM工序缺失风险
     * 场景：款式有生产订单（进行中），但未配置任何工序单价 → 结算时将无法读取工价，导致工资核算缺失
     * 根因关联：StyleProcess 表无该 styleId 记录 → 跟单员或IE工艺员漏录
     */
    private List<SignalItem> collectBomMissingSignals(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .in(ProductionOrder::getStatus, List.of("production", "delayed"))
                .isNotNull(ProductionOrder::getStyleId)
                .last("LIMIT 80")
                .list();

        for (ProductionOrder order : orders) {
            try {
                long processCount = styleProcessService.lambdaQuery()
                        .eq(StyleProcess::getStyleId, Long.parseLong(order.getStyleId()))
                        .count();
                if (processCount == 0) {
                    SignalItem s = new SignalItem();
                    s.setSignalType("garment_risk");
                    s.setSignalCode("bom_missing");
                    s.setSignalLevel("warning");
                    s.setSourceDomain("style");
                    s.setSourceId(order.getOrderNo());
                    String styleName = order.getStyleName() != null ? order.getStyleName() : order.getStyleNo();
                    s.setSignalTitle("款式未配置工序单价，结算将缺失");
                    s.setSignalDetail("订单 " + order.getOrderNo() + " 款式["
                            + styleName + "]未配置任何工序，工资结算时将无法核算工价。"
                            + "建议IE工艺员立即补录工序流程与单价。");
                    s.setPriorityScore(PRIORITY_WARNING);
                    s.setStatus("open");
                    items.add(s);
                }
            } catch (NumberFormatException ignored) {
                // styleId 非数字时跳过
            }
        }
        return items;
    }

    /**
     * 服装信号②：扫码工序跳序异常
     * 场景：订单中发现下游工序已有扫码，但上道工序无扫码记录
     * 例：车缝已扫码但裁剪从未扫码 → 疑似工人操作失误或漏扫
     * 意义：提前发现工序顺序异常，而非等到质检返工时才暴露问题
     */
    // 服装标准工序链：裁剪 → 车缝 → 质检 → 入库（每组：下游工序名、必须存在的上游工序名）
    private static final String[][] GARMENT_STAGE_RULES = {
        {"车缝", "裁剪"},
        {"质检", "车缝"},
        {"入库", "质检"},
    };

    private List<SignalItem> collectScanSequenceAnomalies(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getStatus, "production")
                .last("LIMIT 80")
                .list();

        for (ProductionOrder order : orders) {
            try {
                List<ScanRecord> scans = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getOrderId, order.getId().toString())
                        .eq(ScanRecord::getScanResult, "success")
                        .list();
                if (scans.isEmpty()) continue;

                Set<String> stages = scans.stream()
                        .map(ScanRecord::getProgressStage)
                        .filter(stage -> stage != null && !stage.isBlank())
                        .collect(Collectors.toSet());

                for (String[] rule : GARMENT_STAGE_RULES) {
                    String downstream = rule[0]; // 下游（如"车缝"）
                    String upstream   = rule[1]; // 必须先完成（如"裁剪"）
                    boolean hasDownstream = stages.stream().anyMatch(s -> s.contains(downstream));
                    boolean hasUpstream   = stages.stream().anyMatch(s -> s.contains(upstream));
                    if (hasDownstream && !hasUpstream) {
                        SignalItem s = new SignalItem();
                        s.setSignalType("garment_risk");
                        s.setSignalCode("scan_skip_sequence");
                        s.setSignalLevel("warning");
                        s.setSourceDomain("production");
                        s.setSourceId(order.getId().toString());
                        s.setSignalTitle("订单 " + order.getOrderNo() + " 工序扫码顺序异常");
                        s.setSignalDetail("检测到[" + downstream + "]工序已有扫码，但前道[" + upstream
                                + "]工序无扫码记录。可能原因：①工人误扫工序 ②漏录上道扫码。"
                                + "建议跟单员确认后补录或撤销异常扫码。");
                        s.setPriorityScore(PRIORITY_WARNING);
                        s.setStatus("open");
                        items.add(s);
                        break; // 同一订单只报一条跳序信号
                    }
                }
            } catch (Exception e) {
                log.debug("[服装信号] 跳序检查订单 {} 失败: {}", order.getOrderNo(), e.getMessage());
            }
        }
        return items;
    }

    /**
     * 服装信号③：订单停滞（有扫码记录但 3 天无新进展）
     * 承接 SmartNotifyJob 的通知逻辑，在驾驶舱信号层面也感知并记录
     * 区别：SmartNotifyJob → 推送给跟单员；此处 → 写入 t_intelligence_signal 供驾驶舱展示
     */
    private List<SignalItem> collectStagnantOrderSignals(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        LocalDateTime stagnantThreshold = LocalDateTime.now().minusDays(3);

        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .in(ProductionOrder::getStatus, List.of("production", "delayed"))
                .last("LIMIT 100")
                .list();

        for (ProductionOrder order : orders) {
            try {
                ScanRecord lastScan = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getOrderId, order.getId().toString())
                        .eq(ScanRecord::getScanResult, "success")
                        .orderByDesc(ScanRecord::getScanTime)
                        .last("LIMIT 1")
                        .one();
                if (lastScan != null && lastScan.getScanTime() != null
                        && lastScan.getScanTime().isBefore(stagnantThreshold)) {
                    long days = ChronoUnit.DAYS.between(lastScan.getScanTime(), LocalDateTime.now());
                    SignalItem s = new SignalItem();
                    s.setSignalType("garment_risk");
                    s.setSignalCode("order_stagnant");
                    s.setSignalLevel(days >= 5 ? "critical" : "warning");
                    s.setSourceDomain("production");
                    s.setSourceId(order.getId().toString());
                    s.setSignalTitle("订单 " + order.getOrderNo() + " 持续 " + days + " 天无扫码生产");
                    s.setSignalDetail("最后一次扫码时间：" + lastScan.getScanTime().toLocalDate()
                            + "，已停滞 " + days + " 天。"
                            + (order.getPlannedEndDate() != null
                                ? "预计交期：" + order.getPlannedEndDate().toLocalDate() + "，请跟单员确认生产异常原因。"
                                : "建议跟单员立即跟进工厂生产进度。"));
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

    /**
     * 服装信号⑤：下单后未启动警告（创建1天后尚无任何扫码记录）
     * 场景：订单已创建超过1天，生产状态为进行中，但工厂从未开始扫码。
     * 与「停滞订单」区别：停滞 = 扫过后没动；未启动 = 从未扫过一次。
     */
    private List<SignalItem> collectNeverStartedSignals(Long tenantId) {
        List<SignalItem> items = new ArrayList<>();
        LocalDateTime startThreshold = LocalDateTime.now().minusDays(1);

        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .in(ProductionOrder::getStatus, List.of("production", "delayed"))
                .lt(ProductionOrder::getCreateTime, startThreshold)
                .last("LIMIT 100")
                .list();

        for (ProductionOrder order : orders) {
            try {
                long scanCount = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getOrderId, order.getId().toString())
                        .count();
                if (scanCount == 0) {
                    long hours = ChronoUnit.HOURS.between(order.getCreateTime(), LocalDateTime.now());
                    SignalItem s = new SignalItem();
                    s.setSignalType("garment_risk");
                    s.setSignalCode("order_not_started");
                    s.setSignalLevel(hours >= 48 ? "critical" : "warning");
                    s.setSourceDomain("production");
                    s.setSourceId(order.getId().toString());
                    s.setSignalTitle("订单 " + order.getOrderNo() + " 下单后 " + (hours / 24) + " 天未开始生产");
                    s.setSignalDetail("订单创建已 " + hours + " 小时，工厂「"
                            + (order.getFactoryName() != null ? order.getFactoryName() : "未指定工厂")
                            + "」从未开始扫码。"
                            + (order.getPlannedEndDate() != null
                                ? "订单交期：" + order.getPlannedEndDate().toLocalDate() + "，应立即跨单。"
                                : "建议跟单员立即联系工厂排产。"));
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
}
