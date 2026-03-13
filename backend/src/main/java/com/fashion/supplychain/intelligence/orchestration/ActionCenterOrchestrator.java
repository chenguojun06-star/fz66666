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
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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

    @Autowired
    private ActionTaskFeedbackOrchestrator actionTaskFeedbackOrchestrator;

    public ActionCenterResponse getCenter() {
        HealthIndexResponse health = safeHealth();
        LivePulseResponse pulse = safePulse();
        DeliveryRiskResponse risks = safeRisks();
        AnomalyDetectionResponse anomalies = safeAnomalies();
        SmartNotificationResponse notifications = safeNotifications();
        FinanceAuditResponse financeAudit = safeFinanceAudit();

        ActionCenterResponse response = new ActionCenterResponse();
        List<ActionCenterResponse.ActionTask> tasks = new ArrayList<>();
        try {
            tasks = buildTasks(health, pulse, risks, anomalies, notifications, financeAudit);
        } catch (Exception e) {
            log.warn("[ActionCenter] buildTasks 失败: {}", e.getMessage());
        }
        try {
            actionTaskFeedbackOrchestrator.applyTaskFeedbackState(tasks);
        } catch (Exception e) {
            log.warn("[ActionCenter] applyTaskFeedbackState 失败（表可能不存在）: {}", e.getMessage());
        }
        try {
            appendOverdueReviewTasks(tasks);
        } catch (Exception e) {
            log.warn("[ActionCenter] appendOverdueReviewTasks 失败: {}", e.getMessage());
        }
        rankTasks(tasks);
        if (tasks.size() > 8) {
            tasks = new ArrayList<>(tasks.subList(0, 8));
        }
        response.setTasks(tasks);
        try {
            fillSummary(response);
        } catch (Exception e) {
            log.warn("[ActionCenter] fillSummary 失败: {}", e.getMessage());
        }
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

        rankTasks(tasks);
        if (tasks.size() > 8) {
            return new ArrayList<>(tasks.subList(0, 8));
        }
        return tasks;
    }

    private void rankTasks(List<ActionCenterResponse.ActionTask> tasks) {
        for (ActionCenterResponse.ActionTask task : tasks) {
            int score = calcCoordinationScore(task);
            task.setCoordinationScore(score);
            if (task.getNextReviewAt() == null || task.getNextReviewAt().isBlank()) {
                task.setNextReviewAt(defaultReviewAt(task.getEscalationLevel()));
            }
        }
        tasks.sort((left, right) -> {
            int scoreCompare = Integer.compare(
                    right.getCoordinationScore() == null ? 0 : right.getCoordinationScore(),
                    left.getCoordinationScore() == null ? 0 : left.getCoordinationScore());
            if (scoreCompare != 0) {
                return scoreCompare;
            }
            return priorityOrder(left.getPriority()) - priorityOrder(right.getPriority());
        });
    }

    private int calcCoordinationScore(ActionCenterResponse.ActionTask task) {
        int score = 0;
        String priority = safeUpper(task.getPriority());
        String escalation = safeUpper(task.getEscalationLevel());
        String domain = safeUpper(task.getDomain());
        String taskCode = safeUpper(task.getTaskCode());

        score += switch (priority) {
            case "HIGH" -> 45;
            case "MEDIUM" -> 28;
            default -> 14;
        };
        score += switch (escalation) {
            case "L3" -> 35;
            case "L2" -> 22;
            default -> 10;
        };
        score += switch (domain) {
            case "PRODUCTION" -> 12;
            case "FACTORY" -> 10;
            case "FINANCE" -> 8;
            default -> 5;
        };
        if (task.getRelatedOrderNo() != null && !task.getRelatedOrderNo().isBlank()) {
            score += 8;
        }
        if (taskCode.contains("RISK") || taskCode.contains("FOLLOW") || taskCode.contains("ANOMALY")) {
            score += 6;
        }
        return score;
    }

    private String defaultReviewAt(String escalationLevel) {
        LocalDateTime reviewAt = switch (safeUpper(escalationLevel)) {
            case "L3" -> LocalDateTime.now().plusHours(1);
            case "L2" -> LocalDateTime.now().plusHours(4);
            default -> LocalDateTime.now().plusHours(24);
        };
        return reviewAt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
    }

    private String safeUpper(String value) {
        return value == null ? "" : value.toUpperCase();
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
            String feedbackStatus = safeUpper(task.getFeedbackStatus());
            if ("PROCESSING".equals(feedbackStatus)) {
                summary.setProcessingTasks(summary.getProcessingTasks() + 1);
                if (isReviewOverdue(task.getNextReviewAt())) {
                    summary.setOverdueReviewTasks(summary.getOverdueReviewTasks() + 1);
                }
            } else if ("COMPLETED".equals(feedbackStatus)) {
                summary.setCompletedTasks(summary.getCompletedTasks() + 1);
            } else if ("REJECTED".equals(feedbackStatus)) {
                summary.setRejectedTasks(summary.getRejectedTasks() + 1);
            }
        }

        int feedbackTotal = summary.getProcessingTasks() + summary.getCompletedTasks() + summary.getRejectedTasks();
        if (feedbackTotal > 0) {
            summary.setClosureRate((summary.getCompletedTasks() + summary.getRejectedTasks()) * 100 / feedbackTotal);
        } else {
            summary.setClosureRate(0);
        }

        int decisionTotal = summary.getCompletedTasks() + summary.getRejectedTasks();
        if (decisionTotal > 0) {
            summary.setAdoptionRate(summary.getCompletedTasks() * 100 / decisionTotal);
        } else {
            summary.setAdoptionRate(0);
        }
    }

    private void appendOverdueReviewTasks(List<ActionCenterResponse.ActionTask> tasks) {
        List<ActionCenterResponse.ActionTask> escalations = new ArrayList<>();
        for (ActionCenterResponse.ActionTask task : tasks) {
            if (!"PROCESSING".equalsIgnoreCase(task.getFeedbackStatus())) {
                continue;
            }
            if (!isReviewOverdue(task.getNextReviewAt())) {
                continue;
            }
            ActionCenterResponse.ActionTask escalation = followupTaskOrchestrator.buildTask(
                    "feedback-review-overdue",
                    task.getDomain(),
                    "high",
                    "L3",
                    task.getOwnerRole(),
                    "复核超时任务：" + task.getTitle(),
                    "该任务已超过复盘时点仍未闭环，需立即复核处理状态",
                    "回执状态为处理中，但 nextReviewAt 已超时，需升级跟进避免风险扩散",
                    task.getRoutePath(),
                    task.getRelatedOrderNo(),
                    "30分钟内复核",
                    false
            );
            escalation.setSourceSignal("feedback_review_overdue");
            escalation.setFeedbackStatus(task.getFeedbackStatus());
            escalation.setFeedbackReason(task.getFeedbackReason());
            escalation.setCompletionNote(task.getCompletionNote());
            escalation.setFeedbackTime(task.getFeedbackTime());
            escalation.setNextReviewAt(task.getNextReviewAt());
            escalations.add(escalation);
        }
        tasks.addAll(escalations);
    }

    private boolean isReviewOverdue(String nextReviewAt) {
        if (nextReviewAt == null || nextReviewAt.isBlank()) {
            return false;
        }
        try {
            LocalDateTime reviewAt = LocalDateTime.parse(nextReviewAt, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
            return reviewAt.isBefore(LocalDateTime.now());
        } catch (Exception ignored) {
            return false;
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
            return new HealthIndexResponse();
        }
    }

    private LivePulseResponse safePulse() {
        try {
            return livePulseOrchestrator.pulse();
        } catch (Exception e) {
            log.warn("[ActionCenter] live-pulse 聚合失败: {}", e.getMessage());
            return new LivePulseResponse();
        }
    }

    private DeliveryRiskResponse safeRisks() {
        try {
            return orderDeliveryRiskOrchestrator.assess(null);
        } catch (Exception e) {
            log.warn("[ActionCenter] delivery-risk 聚合失败: {}", e.getMessage());
            return new DeliveryRiskResponse();
        }
    }

    private AnomalyDetectionResponse safeAnomalies() {
        try {
            return anomalyDetectionOrchestrator.detect();
        } catch (Exception e) {
            log.warn("[ActionCenter] anomaly 聚合失败: {}", e.getMessage());
            return new AnomalyDetectionResponse();
        }
    }

    private SmartNotificationResponse safeNotifications() {
        try {
            return smartNotificationOrchestrator.generateNotifications();
        } catch (Exception e) {
            log.warn("[ActionCenter] smart-notification 聚合失败: {}", e.getMessage());
            return new SmartNotificationResponse();
        }
    }

    private FinanceAuditResponse safeFinanceAudit() {
        try {
            return financeAuditOrchestrator.audit();
        } catch (Exception e) {
            log.warn("[ActionCenter] finance-audit 聚合失败 tenantId={}: {}", UserContext.tenantId(), e.getMessage());
            return new FinanceAuditResponse();
        }
    }
}
