package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.SmartNotification;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 命令生成编排器
 *
 * 职责：
 *   1. 把 AI 的"建议" (SmartNotification) 转换成"结构化命令" (ExecutableCommand)
 *   2. 从自然语言推荐中提取可执行的操作
 *   3. 设置合理的风险等级
 *
 * 示例流程：
 *   输入 SmartNotification:
 *     - title: "订单已逾期"
 *     - recommendedAction: "建议暂停订单 PO202603001 或加快生产速度"
 *
 *   输出 List<ExecutableCommand>:
 *     1. action="order:hold", targetId="PO202603001", riskLevel=3
 *     2. action="order:expedite", targetId="PO202603001", riskLevel=4
 *
 * @author Intelligence Engine v1.0
 * @date 2026-03-08
 */
@Slf4j
@Service
public class CommandGeneratorOrchestrator {

    /**
     * 核心方法：把通知转换成可执行的命令列表
     *
     * @param notification AI 生成的智能通知
     * @return 需要执行的命令列表
     */
    public List<ExecutableCommand> generateCommands(SmartNotification notification) {
        List<ExecutableCommand> commands = new ArrayList<>();

        if (notification == null || notification.getRecommendedAction() == null) {
            return commands;
        }

        String action = notification.getRecommendedAction().toLowerCase();
        Long tenantId = notification.getTenantId();
        String orderId = notification.getOrderId();

        log.info("[CommandGenerator] 解析通知: orderId={}, action={}", orderId, action);

        // 模式1：暂停订单
        if (action.contains("暂停订单") || action.contains("hold") || action.contains("pause")) {
            commands.add(createOrderHoldCommand(orderId, tenantId, notification));
        }

        // 模式2：加快订单
        if (action.contains("加快") || action.contains("加速") || action.contains("expedite")) {
            commands.add(createOrderExpediteCommand(orderId, tenantId, notification));
        }

        // 模式3：恢复订单
        if (action.contains("恢复") || action.contains("resume") || action.contains("激活")) {
            commands.add(createOrderResumeCommand(orderId, tenantId, notification));
        }

        // 模式4：审核通过订单
        if (action.contains("审核通过") || action.contains("approve") || action.contains("批准订单")) {
            commands.add(createOrderApproveCommand(orderId, tenantId, notification));
        }

        // 模式5：退回订单
        if (action.contains("退回订单") || action.contains("reject") || action.contains("驳回订单")) {
            commands.add(createOrderRejectCommand(orderId, tenantId, notification));
        }

        // 模式6：款式审核通过
        if (action.contains("款式通过") || action.contains("样衣通过") || action.contains("style approve")
                || action.contains("批准款式")) {
            commands.add(createStyleApproveCommand(orderId, tenantId, notification));
        }

        // 模式7：退回款式重新开发
        if (action.contains("退回款式") || action.contains("款式返工") || action.contains("样衣退回")
                || action.contains("style return")) {
            commands.add(createStyleReturnCommand(orderId, tenantId, notification));
        }

        // 模式8：质检不合格退回
        if (action.contains("质检不合格") || action.contains("质检退回") || action.contains("quality reject")
                || action.contains("质量不合格")) {
            commands.add(createQualityRejectCommand(orderId, tenantId, notification));
        }

        // 模式9：对账/结算审批
        if (action.contains("结算审批") || action.contains("对账审批") || action.contains("工资审批")
                || action.contains("settlement approve")) {
            commands.add(createSettlementApproveCommand(orderId, tenantId, notification));
        }

        // 模式10：自动创建采购单
        if (action.contains("创建采购") || action.contains("自动采购") || action.contains("补货")
                || action.contains("purchase create")) {
            commands.add(createPurchaseCreateCommand(orderId, tenantId, notification));
        }

        log.info("[CommandGenerator] 生成了 {} 个命令", commands.size());
        return commands;
    }

    /**
     * 创建"暂停订单"命令
     */
    private ExecutableCommand createOrderHoldCommand(
        String orderId,
        Long tenantId,
        SmartNotification notification
    ) {
        return ExecutableCommand.builder()
            .action("order:hold")
            .targetId(orderId)
            .tenantId(tenantId)
            .reason("AI自动检测: " + notification.getTitle())
            .riskLevel(3)  // 改订单状态，中等风险
            .requiresApproval(true)
            .source("ai_notification")
            .params(Map.of(
                "holdReason", extractDuration(notification.getRecommendedAction()),
                "notifyTeams", new String[]{"production", "finance"}
            ))
            .createdAt(System.currentTimeMillis())
            .expiresAt(System.currentTimeMillis() + 24 * 3600 * 1000)  // 24小时过期
            .build();
    }

    /**
     * 创建"加快订单"命令
     */
    private ExecutableCommand createOrderExpediteCommand(
        String orderId,
        Long tenantId,
        SmartNotification notification
    ) {
        return ExecutableCommand.builder()
            .action("order:expedite")
            .targetId(orderId)
            .tenantId(tenantId)
            .reason("AI自动建议加快生产")
            .riskLevel(4)  // 高风险，需要多部门协调
            .requiresApproval(true)
            .source("ai_notification")
            .params(Map.of(
                "expediteLevel", "high",  // urgent / high / medium
                "targetDays", 3
            ))
            .createdAt(System.currentTimeMillis())
            .expiresAt(System.currentTimeMillis() + 12 * 3600 * 1000)  // 12小时过期
            .build();
    }

    /**
     * 创建"恢复订单"命令
     */
    private ExecutableCommand createOrderResumeCommand(
        String orderId,
        Long tenantId,
        SmartNotification notification
    ) {
        return ExecutableCommand.builder()
            .action("order:resume")
            .targetId(orderId)
            .tenantId(tenantId)
            .reason("暂停原因已解决")
            .riskLevel(2)  // 相对低风险
            .requiresApproval(false)  // 可自动执行
            .source("ai_notification")
            .createdAt(System.currentTimeMillis())
            .expiresAt(System.currentTimeMillis() + 48 * 3600 * 1000)
            .build();
    }

    /**
     * 创建"审核通过订单"命令
     */
    private ExecutableCommand createOrderApproveCommand(String orderId, Long tenantId, SmartNotification notification) {
        return ExecutableCommand.builder()
            .action("order:approve")
            .targetId(orderId)
            .tenantId(tenantId)
            .reason("AI建议审核通过: " + notification.getTitle())
            .riskLevel(3)
            .requiresApproval(true)
            .source("ai_notification")
            .params(Map.of("approveNote", notification.getRecommendedAction()))
            .createdAt(System.currentTimeMillis())
            .expiresAt(System.currentTimeMillis() + 24 * 3600 * 1000)
            .build();
    }

    /**
     * 创建"退回订单"命令
     */
    private ExecutableCommand createOrderRejectCommand(String orderId, Long tenantId, SmartNotification notification) {
        return ExecutableCommand.builder()
            .action("order:reject")
            .targetId(orderId)
            .tenantId(tenantId)
            .reason("AI建议退回: " + notification.getTitle())
            .riskLevel(3)
            .requiresApproval(true)
            .source("ai_notification")
            .params(Map.of("rejectReason", notification.getRecommendedAction()))
            .createdAt(System.currentTimeMillis())
            .expiresAt(System.currentTimeMillis() + 24 * 3600 * 1000)
            .build();
    }

    /**
     * 创建"款式审核通过"命令
     */
    private ExecutableCommand createStyleApproveCommand(String targetId, Long tenantId, SmartNotification notification) {
        return ExecutableCommand.builder()
            .action("style:approve")
            .targetId(targetId)
            .tenantId(tenantId)
            .reason("AI建议款式通过: " + notification.getTitle())
            .riskLevel(2)
            .requiresApproval(true)
            .source("ai_notification")
            .params(Map.of("reviewComment", notification.getRecommendedAction()))
            .createdAt(System.currentTimeMillis())
            .expiresAt(System.currentTimeMillis() + 48 * 3600 * 1000)
            .build();
    }

    /**
     * 创建"退回款式"命令
     */
    private ExecutableCommand createStyleReturnCommand(String targetId, Long tenantId, SmartNotification notification) {
        return ExecutableCommand.builder()
            .action("style:return")
            .targetId(targetId)
            .tenantId(tenantId)
            .reason("AI建议退回返工: " + notification.getTitle())
            .riskLevel(3)
            .requiresApproval(true)
            .source("ai_notification")
            .params(Map.of("returnReason", notification.getRecommendedAction()))
            .createdAt(System.currentTimeMillis())
            .expiresAt(System.currentTimeMillis() + 24 * 3600 * 1000)
            .build();
    }

    /**
     * 创建"质检退回"命令
     */
    private ExecutableCommand createQualityRejectCommand(String orderId, Long tenantId, SmartNotification notification) {
        return ExecutableCommand.builder()
            .action("quality:reject")
            .targetId(orderId)
            .tenantId(tenantId)
            .reason("AI质检判定不合格: " + notification.getTitle())
            .riskLevel(4)
            .requiresApproval(true)
            .source("ai_notification")
            .params(Map.of("qualityIssue", notification.getRecommendedAction()))
            .createdAt(System.currentTimeMillis())
            .expiresAt(System.currentTimeMillis() + 12 * 3600 * 1000)
            .build();
    }

    /**
     * 创建"结算审批"命令
     */
    private ExecutableCommand createSettlementApproveCommand(String targetId, Long tenantId, SmartNotification notification) {
        return ExecutableCommand.builder()
            .action("settlement:approve")
            .targetId(targetId)
            .tenantId(tenantId)
            .reason("AI建议审批通过结算: " + notification.getTitle())
            .riskLevel(3)
            .requiresApproval(true)
            .source("ai_notification")
            .params(Map.of("approveNote", notification.getRecommendedAction()))
            .createdAt(System.currentTimeMillis())
            .expiresAt(System.currentTimeMillis() + 24 * 3600 * 1000)
            .build();
    }

    /**
     * 创建"自动采购"命令
     */
    private ExecutableCommand createPurchaseCreateCommand(String orderId, Long tenantId, SmartNotification notification) {
        return ExecutableCommand.builder()
            .action("purchase:create")
            .targetId(orderId)
            .tenantId(tenantId)
            .reason("AI检测到物料短缺，自动创建采购单: " + notification.getTitle())
            .riskLevel(4)
            .requiresApproval(true)
            .source("ai_notification")
            .params(Map.of(
                "materialName", notification.getTitle(),
                "quantity", 100
            ))
            .createdAt(System.currentTimeMillis())
            .expiresAt(System.currentTimeMillis() + 24 * 3600 * 1000)
            .build();
    }

    /**
     * 从文本中提取时间（辅助方法）
     */
    private String extractDuration(String text) {
        Pattern pattern = Pattern.compile("(\\d+)\\s*(小时|天|小时内|天内)");
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            return matcher.group(0);
        }
        return "24小时";  // 默认
    }
}
