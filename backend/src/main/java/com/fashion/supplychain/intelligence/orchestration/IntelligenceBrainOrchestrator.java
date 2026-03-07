package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskResponse;
import com.fashion.supplychain.intelligence.dto.FinanceAuditResponse;
import com.fashion.supplychain.intelligence.dto.HealthIndexResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceBrainSnapshotResponse;
import com.fashion.supplychain.intelligence.dto.LearningReportResponse;
import com.fashion.supplychain.intelligence.dto.LivePulseResponse;
import com.fashion.supplychain.intelligence.dto.SmartNotificationResponse;
import com.fashion.supplychain.system.orchestration.TenantSmartFeatureOrchestrator;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 智能中枢编排器
 *
 * <p>职责：复用现有智能编排器，把健康度、风险、脉搏、异常、学习状态
 * 统一聚合为一个可直接消费的“大脑快照”。</p>
 */
@Service
@Slf4j
public class IntelligenceBrainOrchestrator {

    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired
    private TenantSmartFeatureOrchestrator tenantSmartFeatureOrchestrator;

    @Autowired
    private HealthIndexOrchestrator healthIndexOrchestrator;

    @Autowired
    private LivePulseOrchestrator livePulseOrchestrator;

    @Autowired
    private OrderDeliveryRiskOrchestrator orderDeliveryRiskOrchestrator;

    @Autowired
    private AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;

    @Autowired
    private SmartNotificationOrchestrator smartNotificationOrchestrator;

    @Autowired
    private LearningReportOrchestrator learningReportOrchestrator;

    @Autowired
    private IntelligenceModelGatewayOrchestrator intelligenceModelGatewayOrchestrator;

    @Autowired
    private IntelligenceObservabilityOrchestrator intelligenceObservabilityOrchestrator;

    @Autowired
    private ActionCenterOrchestrator actionCenterOrchestrator;

    @Autowired
    private FinanceAuditOrchestrator financeAuditOrchestrator;

    public IntelligenceBrainSnapshotResponse snapshot() {
        IntelligenceBrainSnapshotResponse response = new IntelligenceBrainSnapshotResponse();
        response.setTenantId(UserContext.tenantId());
        response.setGeneratedAt(LocalDateTime.now().format(TS_FMT));
        response.setFeatureFlags(loadFeatureFlags());
        response.setModelGateway(intelligenceModelGatewayOrchestrator.getGatewaySummary());
        response.setObservability(intelligenceObservabilityOrchestrator.getObservabilitySummary());

        HealthIndexResponse health = safeHealth();
        LivePulseResponse pulse = safePulse();
        DeliveryRiskResponse risks = safeRisks();
        AnomalyDetectionResponse anomalies = safeAnomalies();
        SmartNotificationResponse notifications = safeNotifications();
        LearningReportResponse learning = safeLearning();
        FinanceAuditResponse financeAudit = safeFinanceAudit();

        fillSummary(response, health, pulse, risks, anomalies, notifications);
        fillLearning(response, learning);
        fillSignals(response, health, pulse, risks, anomalies, notifications);
        fillActions(response, health, pulse, risks, anomalies, notifications, financeAudit);
        response.getActions().sort((left, right) -> priorityOrder(left.getPriority()) - priorityOrder(right.getPriority()));
        response.getSignals().sort((left, right) -> priorityOrder(left.getLevel()) - priorityOrder(right.getLevel()));
        response.getActions().subList(Math.min(6, response.getActions().size()), response.getActions().size()).clear();
        response.getSignals().subList(Math.min(8, response.getSignals().size()), response.getSignals().size()).clear();
        response.getSummary().setSuggestedActions(response.getActions().size());
        return response;
    }

    private void fillSummary(IntelligenceBrainSnapshotResponse response,
                             HealthIndexResponse health,
                             LivePulseResponse pulse,
                             DeliveryRiskResponse risks,
                             AnomalyDetectionResponse anomalies,
                             SmartNotificationResponse notifications) {
        IntelligenceBrainSnapshotResponse.BrainSummary summary = response.getSummary();
        summary.setHealthIndex(health != null ? health.getHealthIndex() : 0);
        summary.setHealthGrade(health != null ? health.getGrade() : "unknown");
        summary.setTopRisk(health != null ? health.getTopRisk() : null);
        summary.setHighRiskOrders(countHighRiskOrders(risks));
        summary.setAnomalyCount(anomalies != null ? anomalies.getAnomalies().size() : 0);
        summary.setStagnantFactories(pulse != null && pulse.getStagnantFactories() != null ? pulse.getStagnantFactories().size() : 0);
        summary.setActiveFactories(pulse != null ? pulse.getActiveFactories() : 0);
        summary.setActiveWorkers(pulse != null ? pulse.getActiveWorkers() : 0);
        summary.setTodayScanQty(pulse != null ? pulse.getTodayScanQty() : 0L);
        summary.setPendingNotifications(notifications != null ? notifications.getPendingCount() : 0);
    }

    private void fillLearning(IntelligenceBrainSnapshotResponse response, LearningReportResponse learning) {
        IntelligenceBrainSnapshotResponse.LearningSummary summary = response.getLearning();
        if (learning == null) {
            return;
        }
        summary.setTotalSamples(learning.getTotalSamples());
        summary.setStageCount(learning.getStageCount());
        summary.setFeedbackCount(learning.getFeedbackCount());
        summary.setAccuracyRate(learning.getAccuracyRate());
        summary.setLastLearnTime(learning.getLastLearnTime());
    }

    private void fillSignals(IntelligenceBrainSnapshotResponse response,
                             HealthIndexResponse health,
                             LivePulseResponse pulse,
                             DeliveryRiskResponse risks,
                             AnomalyDetectionResponse anomalies,
                             SmartNotificationResponse notifications) {
        if (health != null && health.getTopRisk() != null && !health.getTopRisk().isBlank()) {
            response.getSignals().add(buildSignal("health", levelByHealth(health.getGrade()),
                    "系统健康风险", health.getTopRisk(), "health-index", null, "manager"));
        }

        for (DeliveryRiskResponse.DeliveryRiskItem item : topRiskOrders(risks, 3)) {
            response.getSignals().add(buildSignal("delivery-risk", levelByRisk(item.getRiskLevel()),
                    "订单交付风险", item.getRiskDescription(), "delivery-risk",
                    item.getOrderNo(), "manager"));
        }

        if (pulse != null && pulse.getStagnantFactories() != null) {
            for (LivePulseResponse.StagnantFactory factory : pulse.getStagnantFactories().stream().limit(2).toList()) {
                response.getSignals().add(buildSignal("factory-stagnant", "medium",
                        "工厂停滞预警",
                        String.format("%s 已静默 %d 分钟", factory.getFactoryName(), factory.getMinutesSilent()),
                        "live-pulse", null, "factory"));
            }
        }

        if (anomalies != null && anomalies.getAnomalies() != null) {
            for (AnomalyDetectionResponse.AnomalyItem item : anomalies.getAnomalies().stream().limit(2).toList()) {
                response.getSignals().add(buildSignal("anomaly", normalizeLevel(item.getSeverity()),
                        item.getTitle(), item.getDescription(), "anomaly-detect", null, "manager"));
            }
        }

        if (notifications != null && notifications.getNotifications() != null) {
            for (SmartNotificationResponse.NotificationItem item : notifications.getNotifications().stream().limit(1).toList()) {
                response.getSignals().add(buildSignal("notification", normalizeLevel(item.getPriority()),
                        item.getTitle(), item.getContent(), "smart-notification",
                        item.getOrderNo(), item.getTargetRole()));
            }
        }

        if (!intelligenceModelGatewayOrchestrator.isGatewayReady()) {
            response.getSignals().add(buildSignal("model-gateway", "low",
                    "模型网关未接入",
                    "当前仍以直连模式工作，尚未启用统一模型路由与降级治理",
                    "brain-gateway", null, "manager"));
        }

        if (!intelligenceObservabilityOrchestrator.isObservationReady()) {
            response.getSignals().add(buildSignal("ai-observability", "low",
                    "AI 观测未接通",
                    "当前未形成统一的 AI 调用追踪、评估与采纳闭环",
                    "brain-observability", null, "manager"));
        }
    }

    private void fillActions(IntelligenceBrainSnapshotResponse response,
                             HealthIndexResponse health,
                             LivePulseResponse pulse,
                             DeliveryRiskResponse risks,
                             AnomalyDetectionResponse anomalies,
                             SmartNotificationResponse notifications,
                             FinanceAuditResponse financeAudit) {
        response.getActions().addAll(actionCenterOrchestrator.buildBrainActions(
                health, pulse, risks, anomalies, notifications, financeAudit));

        if (!intelligenceModelGatewayOrchestrator.isGatewayReady()) {
            response.getActions().add(buildAction("setup-model-gateway", "low", "manager",
                    "接入统一模型网关",
                    "为后续多模型路由、降级与成本治理准备统一出口",
                    "当前智能能力已开始集中，但模型调用仍缺少统一神经总线",
                    "/system/settings", false));
        }

        if (!intelligenceObservabilityOrchestrator.isObservationReady()) {
            response.getActions().add(buildAction("setup-ai-observability", "low", "manager",
                    "开启 AI 观测与评估",
                    "补齐提示词、调用链路、采纳率、误报率的可观测闭环",
                    "没有 AI 观测层，系统很难持续变聪明",
                    "/system/settings", false));
        }
    }

    private IntelligenceBrainSnapshotResponse.BrainSignal buildSignal(String signalType,
                                                                       String level,
                                                                       String title,
                                                                       String summary,
                                                                       String source,
                                                                       String relatedOrderNo,
                                                                       String ownerRole) {
        IntelligenceBrainSnapshotResponse.BrainSignal signal = new IntelligenceBrainSnapshotResponse.BrainSignal();
        signal.setSignalType(signalType);
        signal.setLevel(level);
        signal.setTitle(title);
        signal.setSummary(summary);
        signal.setSource(source);
        signal.setRelatedOrderNo(relatedOrderNo);
        signal.setOwnerRole(ownerRole);
        return signal;
    }

    private IntelligenceBrainSnapshotResponse.BrainAction buildAction(String actionType,
                                                                       String priority,
                                                                       String ownerRole,
                                                                       String title,
                                                                       String summary,
                                                                       String reason,
                                                                       String routePath,
                                                                       boolean autoExecutable) {
        IntelligenceBrainSnapshotResponse.BrainAction action = new IntelligenceBrainSnapshotResponse.BrainAction();
        action.setActionType(actionType);
        action.setPriority(priority);
        action.setOwnerRole(ownerRole);
        action.setTitle(title);
        action.setSummary(summary);
        action.setReason(reason);
        action.setRoutePath(routePath);
        action.setAutoExecutable(autoExecutable);
        return action;
    }

    private int countHighRiskOrders(DeliveryRiskResponse risks) {
        return topRiskOrders(risks, Integer.MAX_VALUE).size();
    }

    private List<DeliveryRiskResponse.DeliveryRiskItem> topRiskOrders(DeliveryRiskResponse risks, int limit) {
        if (risks == null || risks.getOrders() == null) {
            return Collections.emptyList();
        }
        List<DeliveryRiskResponse.DeliveryRiskItem> items = new ArrayList<>();
        for (DeliveryRiskResponse.DeliveryRiskItem item : risks.getOrders()) {
            if ("danger".equalsIgnoreCase(item.getRiskLevel()) || "overdue".equalsIgnoreCase(item.getRiskLevel())) {
                items.add(item);
            }
            if (items.size() >= limit) {
                break;
            }
        }
        return items;
    }

    private String levelByRisk(String riskLevel) {
        if ("overdue".equalsIgnoreCase(riskLevel) || "danger".equalsIgnoreCase(riskLevel)) {
            return "high";
        }
        if ("warning".equalsIgnoreCase(riskLevel)) {
            return "medium";
        }
        return "low";
    }

    private String levelByHealth(String grade) {
        if ("critical".equalsIgnoreCase(grade) || "warning".equalsIgnoreCase(grade)) {
            return "high";
        }
        if ("good".equalsIgnoreCase(grade)) {
            return "medium";
        }
        return "low";
    }

    private String normalizeLevel(String raw) {
        if (raw == null || raw.isBlank()) {
            return "medium";
        }
        String value = raw.trim().toLowerCase();
        if ("critical".equals(value) || "high".equals(value)) {
            return "high";
        }
        if ("warning".equals(value) || "medium".equals(value) || "normal".equals(value)) {
            return "medium";
        }
        return "low";
    }

    private int priorityOrder(String value) {
        if ("high".equalsIgnoreCase(value)) {
            return 0;
        }
        if ("medium".equalsIgnoreCase(value)) {
            return 1;
        }
        return 2;
    }

    private Map<String, Boolean> loadFeatureFlags() {
        try {
            return tenantSmartFeatureOrchestrator.listCurrentTenantFeatures();
        } catch (Exception e) {
            log.warn("[IntelligenceBrain] 读取租户智能开关失败: {}", e.getMessage());
            return Collections.emptyMap();
        }
    }

    private HealthIndexResponse safeHealth() {
        try {
            return healthIndexOrchestrator.calculate();
        } catch (Exception e) {
            log.warn("[IntelligenceBrain] health-index 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private LivePulseResponse safePulse() {
        try {
            return livePulseOrchestrator.pulse();
        } catch (Exception e) {
            log.warn("[IntelligenceBrain] live-pulse 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private DeliveryRiskResponse safeRisks() {
        try {
            return orderDeliveryRiskOrchestrator.assess(null);
        } catch (Exception e) {
            log.warn("[IntelligenceBrain] delivery-risk 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private AnomalyDetectionResponse safeAnomalies() {
        try {
            return anomalyDetectionOrchestrator.detect();
        } catch (Exception e) {
            log.warn("[IntelligenceBrain] anomaly 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private SmartNotificationResponse safeNotifications() {
        try {
            return smartNotificationOrchestrator.generateNotifications();
        } catch (Exception e) {
            log.warn("[IntelligenceBrain] smart-notification 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private LearningReportResponse safeLearning() {
        try {
            return learningReportOrchestrator.getReport();
        } catch (Exception e) {
            log.warn("[IntelligenceBrain] learning-report 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private FinanceAuditResponse safeFinanceAudit() {
        try {
            return financeAuditOrchestrator.audit();
        } catch (Exception e) {
            log.warn("[IntelligenceBrain] finance-audit 聚合失败: {}", e.getMessage());
            return null;
        }
    }
}
