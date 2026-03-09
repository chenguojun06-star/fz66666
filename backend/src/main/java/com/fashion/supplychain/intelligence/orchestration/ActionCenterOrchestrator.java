package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ActionCenterResponse;
import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskResponse;
import com.fashion.supplychain.intelligence.dto.FinanceAuditResponse;
import com.fashion.supplychain.intelligence.dto.HealthIndexResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceBrainSnapshotResponse;
import com.fashion.supplychain.intelligence.dto.LivePulseResponse;
import com.fashion.supplychain.intelligence.dto.SmartNotificationResponse;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 动作中心编排器。
 *
 * <p>职责：聚合多域风险，并通过独立升级策略与任务编排，生成统一动作列表。</p>
 */
@Service
@Slf4j
public class ActionCenterOrchestrator {

    @Autowired
    private OrderDeliveryRiskOrchestrator orderDeliveryRiskOrchestrator;

    @Autowired
    private LivePulseOrchestrator livePulseOrchestrator;

    @Autowired
    private AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;

    @Autowired
    private SmartNotificationOrchestrator smartNotificationOrchestrator;

    @Autowired
    private HealthIndexOrchestrator healthIndexOrchestrator;

    @Autowired
    private FinanceAuditOrchestrator financeAuditOrchestrator;

    @Autowired
    private SmartEscalationOrchestrator smartEscalationOrchestrator;

    @Autowired
    private FollowupTaskOrchestrator followupTaskOrchestrator;

    public ActionCenterResponse getCenter() {
        HealthIndexResponse health = safeHealth();
        LivePulseResponse pulse = safePulse();
        DeliveryRiskResponse risks = safeRisks();
        AnomalyDetectionResponse anomalies = safeAnomalies();
        SmartNotificationResponse notifications = safeNotifications();
        FinanceAuditResponse financeAudit = safeFinanceAudit();

        ActionCenterResponse response = new ActionCenterResponse();
        response.setTasks(buildTasks(health, pulse, risks, anomalies, notifications, financeAudit));
        fillSummary(response);
        return response;
    }

    public List<IntelligenceBrainSnapshotResponse.BrainAction> buildBrainActions(HealthIndexResponse health,
                                                                                  LivePulseResponse pulse,
                                                                                  DeliveryRiskResponse risks,
                                                                                  AnomalyDetectionResponse anomalies,
                                                                                  SmartNotificationResponse notifications,
                                                                                  FinanceAuditResponse financeAudit) {
        List<IntelligenceBrainSnapshotResponse.BrainAction> actions = new ArrayList<>();
        for (ActionCenterResponse.ActionTask task : buildTasks(health, pulse, risks, anomalies, notifications, financeAudit)) {
            actions.add(followupTaskOrchestrator.toBrainAction(task));
        }
        return actions;
    }

    private List<ActionCenterResponse.ActionTask> buildTasks(HealthIndexResponse health,
                                                             LivePulseResponse pulse,
                                                             DeliveryRiskResponse risks,
                                                             AnomalyDetectionResponse anomalies,
                                                             SmartNotificationResponse notifications,
                                                             FinanceAuditResponse financeAudit) {
        List<ActionCenterResponse.ActionTask> tasks = new ArrayList<>();

        for (DeliveryRiskResponse.DeliveryRiskItem item : topRiskOrders(risks, 3)) {
            String escalation = smartEscalationOrchestrator.escalationByRisk(item.getRiskLevel());
            tasks.add(followupTaskOrchestrator.buildTask(
                    "follow-order",
                    "production",
                    priorityByEscalation(escalation),
                    escalation,
                    "manager",
                    String.format("跟进高风险订单 %s", item.getOrderNo()),
                    item.getRiskDescription(),
                    "交付风险已进入高优先级区间，建议立即核查卡点、产能与物料状态",
                    "/production/progress-detail",
                    item.getOrderNo(),
                    smartEscalationOrchestrator.dueHintByEscalation(escalation),
                    false));
        }

        if (pulse != null && pulse.getStagnantFactories() != null) {
            for (LivePulseResponse.StagnantFactory factory : pulse.getStagnantFactories().stream().limit(2).toList()) {
                String escalation = smartEscalationOrchestrator.escalationBySilentMinutes(factory.getMinutesSilent());
                tasks.add(followupTaskOrchestrator.buildTask(
                        "wake-factory",
                        "factory",
                        priorityByEscalation(escalation),
                        escalation,
                        "factory",
                        String.format("核查停滞工厂 %s", factory.getFactoryName()),
                        String.format("已超过 %d 分钟无新扫码", factory.getMinutesSilent()),
                        "建议先检查班组、设备、网络与工序堵点，再决定是否调度订单",
                        "/production/list",
                        null,
                        smartEscalationOrchestrator.dueHintByEscalation(escalation),
                        false));
            }
        }

        if (anomalies != null && anomalies.getAnomalies() != null) {
            for (AnomalyDetectionResponse.AnomalyItem item : anomalies.getAnomalies().stream().limit(2).toList()) {
                String escalation = smartEscalationOrchestrator.escalationByRisk(item.getSeverity());
                tasks.add(followupTaskOrchestrator.buildTask(
                        "check-anomaly",
                        "production",
                        priorityByEscalation(escalation),
                        escalation,
                        "manager",
                        "处理异常行为告警",
                        item.getTitle(),
                        item.getDescription(),
                        "/intelligence",
                        null,
                        smartEscalationOrchestrator.dueHintByEscalation(escalation),
                        false));
            }
        }

        if (financeAudit != null && financeAudit.getFindings() != null) {
            for (FinanceAuditResponse.AuditFinding finding : financeAudit.getFindings().stream().limit(2).toList()) {
                String escalation = smartEscalationOrchestrator.escalationByRisk(finding.getRiskLevel());
                tasks.add(followupTaskOrchestrator.buildTask(
                        "finance-review",
                        "finance",
                        priorityByEscalation(escalation),
                        escalation,
                        "manager",
                        "处理财务审核异常",
                        finding.getDescription(),
                        finding.getAction(),
                        "/finance",
                        finding.getOrderNo(),
                        smartEscalationOrchestrator.dueHintByEscalation(escalation),
                        false));
            }
        }

        if (health != null && health.getSuggestion() != null && !health.getSuggestion().isBlank()) {
            String escalation = smartEscalationOrchestrator.escalationByRisk(health.getGrade());
            tasks.add(followupTaskOrchestrator.buildTask(
                    "optimize-health",
                    "system",
                    priorityByEscalation(escalation),
                    escalation,
                    "manager",
                    "执行系统健康优化建议",
                    health.getSuggestion(),
                    "健康指数已给出首要改善方向，建议优先处理该项",
                    "/dashboard",
                    null,
                    smartEscalationOrchestrator.dueHintByEscalation(escalation),
                    false));
        }

        if (notifications != null && notifications.getPendingCount() > 0) {
            String escalation = notifications.getPendingCount() >= 5 ? "L2" : "L1";
            tasks.add(followupTaskOrchestrator.buildTask(
                    "review-notifications",
                    "system",
                    priorityByEscalation(escalation),
                    escalation,
                    "manager",
                    "处理待发送智能通知",
                    String.format("当前有 %d 条高优先级通知待处理", notifications.getPendingCount()),
                    "高优先级通知未处理会降低闭环速度",
                    "/intelligence",
                    null,
                    smartEscalationOrchestrator.dueHintByEscalation(escalation),
                    false));
        }

        tasks.sort((left, right) -> priorityOrder(left.getPriority()) - priorityOrder(right.getPriority()));
        if (tasks.size() > 8) {
            return new ArrayList<>(tasks.subList(0, 8));
        }
        return tasks;
    }

    private void fillSummary(ActionCenterResponse response) {
        ActionCenterResponse.Summary summary = response.getSummary();
        summary.setTotalTasks(response.getTasks().size());
        for (ActionCenterResponse.ActionTask task : response.getTasks()) {
            if ("high".equalsIgnoreCase(task.getPriority())) {
                summary.setHighPriorityTasks(summary.getHighPriorityTasks() + 1);
            }
            if ("production".equalsIgnoreCase(task.getDomain())) {
                summary.setProductionTasks(summary.getProductionTasks() + 1);
            }
            if ("finance".equalsIgnoreCase(task.getDomain())) {
                summary.setFinanceTasks(summary.getFinanceTasks() + 1);
            }
            if ("factory".equalsIgnoreCase(task.getDomain())) {
                summary.setFactoryTasks(summary.getFactoryTasks() + 1);
            }
        }
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

    private String priorityByEscalation(String escalation) {
        if ("L3".equalsIgnoreCase(escalation)) {
            return "high";
        }
        if ("L2".equalsIgnoreCase(escalation)) {
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

    private HealthIndexResponse safeHealth() {
        try {
            return healthIndexOrchestrator.calculate();
        } catch (Exception e) {
            log.warn("[ActionCenter] health-index 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private LivePulseResponse safePulse() {
        try {
            return livePulseOrchestrator.pulse();
        } catch (Exception e) {
            log.warn("[ActionCenter] live-pulse 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private DeliveryRiskResponse safeRisks() {
        try {
            return orderDeliveryRiskOrchestrator.assess(null);
        } catch (Exception e) {
            log.warn("[ActionCenter] delivery-risk 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private AnomalyDetectionResponse safeAnomalies() {
        try {
            return anomalyDetectionOrchestrator.detect();
        } catch (Exception e) {
            log.warn("[ActionCenter] anomaly 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private SmartNotificationResponse safeNotifications() {
        try {
            return smartNotificationOrchestrator.generateNotifications();
        } catch (Exception e) {
            log.warn("[ActionCenter] smart-notification 聚合失败: {}", e.getMessage());
            return null;
        }
    }

    private FinanceAuditResponse safeFinanceAudit() {
        try {
            return financeAuditOrchestrator.audit();
        } catch (Exception e) {
            log.warn("[ActionCenter] finance-audit 聚合失败 tenantId={}: {}", UserContext.tenantId(), e.getMessage());
            return null;
        }
    }
}
