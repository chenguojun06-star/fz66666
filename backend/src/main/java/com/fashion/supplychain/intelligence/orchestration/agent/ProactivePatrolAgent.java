package com.fashion.supplychain.intelligence.orchestration.agent;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.SmartNotification;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.common.lock.DistributedLockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
public class ProactivePatrolAgent {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MultiAgentDebateOrchestrator debateOrchestrator;

    @Autowired
    private com.fashion.supplychain.websocket.service.WebSocketService webSocketService;

    @Autowired
    private com.fashion.supplychain.intelligence.service.WxAlertNotifyService wxAlertNotifyService;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator traceOrchestrator;

    @Scheduled(cron = "0 0 * * * ?")
    public void runPatrolTask() {
        if (distributedLockService != null) {
            String lockValue = distributedLockService.tryLock("job:proactive-patrol", 50, TimeUnit.MINUTES);
            if (lockValue == null) {
                log.debug("[ProactivePatrol] 其他实例正在执行，跳过");
                return;
            }
            try {
                doPatrol();
            } finally {
                distributedLockService.unlock("job:proactive-patrol", lockValue);
            }
        } else {
            doPatrol();
        }
    }

    private void doPatrol() {
        log.info("[ProactivePatrol] 启动供应链全局主动巡检...");

        List<ProductionOrder> activeOrders = productionOrderService.lambdaQuery()
                .in(ProductionOrder::getStatus, "IN_PRODUCTION", "MATERIAL_PREPARATION")
                .list();

        if (activeOrders == null || activeOrders.isEmpty()) {
            log.info("[ProactivePatrol] 无活跃订单，跳过");
            return;
        }

        java.util.Map<Long, List<ProductionOrder>> byTenant = new java.util.LinkedHashMap<>();
        for (ProductionOrder o : activeOrders) {
            byTenant.computeIfAbsent(o.getTenantId(), k -> new java.util.ArrayList<>()).add(o);
        }

        int totalDiagnosed = 0;
        for (java.util.Map.Entry<Long, List<ProductionOrder>> entry : byTenant.entrySet()) {
            Long tenantId = entry.getKey();
            List<ProductionOrder> tenantOrders = entry.getValue();
            UserContext ctx = new UserContext();
            ctx.setTenantId(tenantId);
            ctx.setUserId("SYSTEM");
            UserContext.set(ctx);
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "proactive-patrol",
                        "主动巡检Agent：高危订单多智能体会诊");
                int diagnosed = 0;
                for (ProductionOrder order : tenantOrders) {
                    try {
                        String context = buildOrderGlobalContext(order);
                        if (isAtRisk(order, context)) {
                            log.info("[ProactivePatrol] 发现高危订单: {}, 移交多智能体进行会诊", order.getOrderNo());
                            SmartNotification notification = debateOrchestrator.diagnoseOrderWithMultiAgent(order, context);
                            pushToMessageCenter(notification);
                            diagnosed++;
                        }
                    } catch (Exception e) {
                        log.error("[ProactivePatrol] 巡检订单 {} 时发生异常", order.getOrderNo(), e);
                    }
                }
                totalDiagnosed += diagnosed;
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "proactiveDiagnose",
                        "扫描" + tenantOrders.size() + "个活跃订单，" + diagnosed + "个高危已推送",
                        System.currentTimeMillis() - start, true);
                traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                        diagnosed + "个高危已推送建议", null, System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.error("[ProactivePatrol] 租户{}巡检异常", tenantId, e);
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            } finally {
                UserContext.clear();
            }
        }
        log.info("[ProactivePatrol] 巡检完成，共 {} 个活跃订单，{} 个高危已推送建议", activeOrders.size(), totalDiagnosed);
    }

    private String buildOrderGlobalContext(ProductionOrder order) {
        StringBuilder sb = new StringBuilder();
        sb.append("订单号：").append(order.getOrderNo());
        sb.append(", 状态：").append(order.getStatus());
        sb.append(", 进度：").append(order.getProductionProgress() != null ? order.getProductionProgress() + "%" : "未知");

        if (order.getPlannedEndDate() != null) {
            long daysToDeadline = ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate());
            sb.append(", 距交期：").append(daysToDeadline).append("天");
            if (daysToDeadline < 0) {
                sb.append("（已逾期").append(Math.abs(daysToDeadline)).append("天）");
            }
        }

        if (order.getFactoryName() != null) {
            sb.append(", 工厂：").append(order.getFactoryName());
        }
        if (order.getMerchandiser() != null) {
            sb.append(", 跟单员：").append(order.getMerchandiser());
        }

        return sb.toString();
    }

    private boolean isAtRisk(ProductionOrder order, String context) {
        if (order.getProductionProgress() != null && order.getPlannedEndDate() != null) {
            long daysToDeadline = ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate());
            if (daysToDeadline < 0) return true;
            if (daysToDeadline <= 3 && order.getProductionProgress() < 50) return true;
            if (daysToDeadline <= 7 && order.getProductionProgress() < 20) return true;
        }
        return false;
    }

    private void pushToMessageCenter(SmartNotification notification) {
        com.fashion.supplychain.intelligence.dto.TraceableAdvice advice = com.fashion.supplychain.intelligence.dto.TraceableAdvice.builder()
                .traceId(notification.getNotificationId())
                .title("🚨 " + notification.getTitle())
                .summary(notification.getContent())
                .reasoningChain(java.util.List.of(
                        "基于系统后台数据主动巡检",
                        "PMC、财务、品控多智能体联合诊断得出结论",
                        "⚠️ 此建议仅供参考，需人工确认后才可执行"
                ))
                .proposedActions(java.util.List.of(
                        com.fashion.supplychain.intelligence.dto.TraceableAdvice.ProposedAction.builder()
                                .label("采纳建议并执行")
                                .actionCommand(notification.getRecommendedAction())
                                .riskWarning("执行前请确认，此操作会影响生产排期")
                                .build(),
                        com.fashion.supplychain.intelligence.dto.TraceableAdvice.ProposedAction.builder()
                                .label("暂时忽略")
                                .actionCommand("IGNORE")
                                .build()
                ))
                .confidenceScore(notification.getPriority() != null && notification.getPriority().equals("high") ? 5 : 3)
                .build();

        webSocketService.broadcastTraceableAdvice(notification.getTenantId(), advice);
        log.info("[ProactivePatrol] 已推送智能预警至小云聊天窗口：{}", notification.getTitle());

        if ("high".equals(notification.getPriority())) {
            try {
                wxAlertNotifyService.notifyAlert(
                    notification.getTenantId(),
                    "高危异常预警",
                    notification.getContent(),
                    notification.getOrderId(),
                    "/pages/intelligence/index"
                );
            } catch (Exception e) {
                log.warn("[ProactivePatrol] 微信通知发送失败: {}", e.getMessage());
            }
        }
    }
}
