package com.fashion.supplychain.intelligence.orchestration.agent;

import com.fashion.supplychain.intelligence.dto.SmartNotification;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 主动式智能巡检智能体 (Proactive Patrol Agent)
 *
 * 核心思想：
 * 真正的智能化不应仅仅是“你问我答”的被动工具，而应该像一个 24 小时不知疲倦的厂长。
 * 它会在后台自动巡检所有活跃订单、库存、排期状态。
 * 当发现潜在的涟漪效应（如：供应商A延期 -> 面料B短缺 -> 订单C将延期 -> 影响VIP客户D）时，
 * 主动拉起多智能体联合诊断，并向系统推入 SmartNotification。
 *
 * 【这完全复用了现有的前端 UI（消息中心/看板），但赋予了系统极其强大的主动感知能力】
 */
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

    /**
     * 每天凌晨 2 点，或者每隔 N 小时执行一次主动巡检（这里以 1 小时为例作演示）
     * 实际生产中可根据服务器压力调整 cron 表达式
     */
    // @Scheduled(cron = "0 0 * * * ?") 
    public void runPatrolTask() {
        log.info("[ProactivePatrol] 启动供应链全局主动巡检...");

        // 1. 抓取所有处于“生产中”且“非停用”的活跃订单
        // 这里伪代码演示逻辑，实际可走生产服务的查询接口
        List<ProductionOrder> activeOrders = productionOrderService.lambdaQuery()
                .in(ProductionOrder::getStatus, "IN_PRODUCTION", "MATERIAL_PREPARATION")
                .list();

        if (activeOrders == null || activeOrders.isEmpty()) {
            return;
        }

        for (ProductionOrder order : activeOrders) {
            try {
                // 2. 收集该订单的全局上下文：包括工序进度、缺料情况、当前良品率等
                String context = buildOrderGlobalContext(order);

                // 3. 简单的规则初筛：如果进度严重滞后或缺料，才启动昂贵的多智能体辩论
                if (isAtRisk(order, context)) {
                    log.info("[ProactivePatrol] 发现高危订单: {}, 移交多智能体进行会诊", order.getOrderNo());
                    
                    // 4. 拉起多智能体辩论（PMC、财务、QC）得出最终结论
                    SmartNotification notification = debateOrchestrator.diagnoseOrderWithMultiAgent(order, context);
                    
                    // 5. 将诊断结果写入消息中心/智能建议流（UI层会自动展示）
                    pushToMessageCenter(notification);
                }
            } catch (Exception e) {
                log.error("[ProactivePatrol] 巡检订单 {} 时发生异常", order.getOrderNo(), e);
            }
        }
        log.info("[ProactivePatrol] 供应链全局主动巡检完成！");
    }

    private String buildOrderGlobalContext(ProductionOrder order) {
        // 实际开发中：这里需要调多个 Service 把物料状态、工人打卡状态拼装成 JSON 或文本
        return String.format("订单号：%s, 当前状态：%s", 
                order.getOrderNo(), order.getStatus());
    }

    private boolean isAtRisk(ProductionOrder order, String context) {
        // 实际开发中：可以写一些轻量级的规则预判，例如 "距离交期<3天且进度<50%"
        return true; 
    }

    private void pushToMessageCenter(SmartNotification notification) {
        // 【升级】：这里不再是普通的系统通知，而是推送到 "AI小云" 的专属消息流中
        // 构建带有"评估依据"和"操作卡片"的 TraceableAdvice，通过 WebSocket 或 SSE 推送给对应租户/用户的聊天窗口
        
        com.fashion.supplychain.intelligence.dto.TraceableAdvice advice = com.fashion.supplychain.intelligence.dto.TraceableAdvice.builder()
                .traceId(notification.getNotificationId())
                .title("🚨 " + notification.getTitle())
                .summary(notification.getContent())
                .reasoningChain(java.util.List.of(
                        "基于系统后台数据主动巡检",
                        "PMC、财务、品控多智能体联合诊断得出结论"
                ))
                .proposedActions(java.util.List.of(
                        com.fashion.supplychain.intelligence.dto.TraceableAdvice.ProposedAction.builder()
                                .label("采纳建议并执行")
                                .actionCommand(notification.getRecommendedAction())
                                .riskWarning("可能会对现有生产排期产生影响")
                                .build(),
                        com.fashion.supplychain.intelligence.dto.TraceableAdvice.ProposedAction.builder()
                                .label("忽略")
                                .actionCommand("IGNORE")
                                .build()
                ))
                .confidenceScore(notification.getPriority().equals("high") ? 5 : 3)
                .build();

        webSocketService.broadcastTraceableAdvice(notification.getTenantId(), advice);
        log.info("[ProactivePatrol] 已生成智能预警策略，封装为 TraceableAdvice 推送至小云聊天窗口：{}", notification.getTitle());

        // 如果是高风险，通过企业微信/小程序 webhook 发送给负责人
        if ("high".equals(notification.getPriority())) {
            // 通过现有的微信订阅消息通道发送给全厂关注人
            wxAlertNotifyService.notifyAlert(
                notification.getTenantId(),
                "高危异常预警",
                notification.getContent(),
                notification.getOrderId(), // orderNo
                "/pages/intelligence/index"
            );
        }
    }
}
