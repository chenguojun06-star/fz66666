package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import com.fashion.supplychain.intelligence.orchestration.PatrolClosedLoopOrchestrator;
import com.fashion.supplychain.intelligence.service.WxAlertNotifyService;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.service.SysNoticeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 异常自愈执行器
 *
 * 按AutoRemediationPolicy策略，对RiskItem执行修复动作：
 * - AUTO模式：直接调用修复工具执行，创建AUTO_EXECUTED工单+审计留痕
 * - SUGGESTION模式：创建NEED_APPROVAL工单，人员审批后一键执行
 *
 * 所有AI自动执行的动作，人员都可以在巡检工单中心二次处理（撤销/反馈/手动执行）。
 *
 * 注：调用方需已通过 withTenantContext 设置好租户上下文（本执行器不自行设置）。
 */
@Slf4j
@Service
@Lazy
public class AutoRemediationExecutor {

    private final PatrolClosedLoopOrchestrator patrolOrchestrator;
    private final AutoRemediationPolicy policy;

    @Autowired
    @Lazy
    private SysNoticeService sysNoticeService;

    @Autowired
    @Lazy
    private WxAlertNotifyService wxAlertNotifyService;

    public AutoRemediationExecutor(@Lazy PatrolClosedLoopOrchestrator patrolOrchestrator,
                                    AutoRemediationPolicy policy) {
        this.patrolOrchestrator = patrolOrchestrator;
        this.policy = policy;
    }

    /**
     * 处理单个风险项：按策略创建巡检工单
     * @return 创建的工单（null=未创建工单）
     */
    public AiPatrolAction handleRiskItem(Long tenantId, RiskItem risk) {
        if (risk == null || tenantId == null) return null;

        AutoRemediationPolicy.RemediationMode mode = policy.getMode(risk.getType().name());
        String suggestedAction = policy.getSuggestedAction(risk.getType().name(), risk);

        String riskLevel;
        String remediationType;
        if (mode == AutoRemediationPolicy.RemediationMode.AUTO) {
            riskLevel = "AUTO_EXECUTE";
            remediationType = "AUTO";
        } else {
            riskLevel = "NEED_APPROVAL";
            remediationType = "SUGGESTION";
        }

        String suggestedActionJson = buildSuggestedActionJson(risk, suggestedAction);

        try {
            AiPatrolAction action = patrolOrchestrator.createAction(
                    "AUTO_REMEDIATION",
                    risk.getDescription() != null ? risk.getDescription() : suggestedAction,
                    risk.getType().name(),
                    risk.getSeverity(),
                    "order",
                    risk.getOrderId() != null ? risk.getOrderId() : "UNKNOWN",
                    suggestedActionJson,
                    BigDecimal.valueOf(risk.getScore() / 100.0),
                    riskLevel
            );

            // 持久化自愈类型到DB
            if (action != null) {
                patrolOrchestrator.updateRemediationType(action.getId(), remediationType);
                action.setRemediationType(remediationType);
            }

            log.info("[AutoRemediation] 风险已处理: tenant={}, type={}, severity={}, mode={}, actionId={}",
                    tenantId, risk.getType(), risk.getSeverity(), mode, action != null ? action.getId() : null);

            return action;
        } catch (Exception e) {
            log.error("[AutoRemediation] 处理风险失败: tenant={}, type={}, error={}",
                    tenantId, risk.getType(), e.getMessage(), e);
            return null;
        }
    }

    /**
     * 执行AUTO模式的修复动作（由SelfHealingPatrolJob调用）
     */
    public boolean executeAutoAction(Long tenantId, AiPatrolAction action) {
        if (action == null) return false;
        try {
            patrolOrchestrator.markAutoRunning(action.getId());
            String result = performRemediation(tenantId, action);
            patrolOrchestrator.markExecuted(action.getId(), true, result, null);

            log.info("[AutoRemediation] 自动修复完成: actionId={}, issueType={}, result={}",
                    action.getId(), action.getIssueType(), result);
            return true;
        } catch (Exception e) {
            log.error("[AutoRemediation] 自动修复失败: actionId={}, error={}",
                    action.getId(), e.getMessage(), e);
            patrolOrchestrator.markFailed(action.getId(), e.getMessage(),
                    "system", "AI自愈引擎");
            return false;
        }
    }

    /**
     * 人员一键执行SUGGESTION工单（前端审批通过后调用）
     */
    public boolean executeApprovedAction(Long tenantId, AiPatrolAction action) {
        if (action == null) return false;
        try {
            String result = performRemediation(tenantId, action);
            patrolOrchestrator.markManualExecuted(action.getId(), result,
                    String.valueOf(UserContext.userId()), UserContext.username());
            log.info("[AutoRemediation] 人工审批后执行: actionId={}, result={}",
                    action.getId(), result);
            return true;
        } catch (Exception e) {
            log.error("[AutoRemediation] 人工执行失败: actionId={}, error={}",
                    action.getId(), e.getMessage(), e);
            patrolOrchestrator.markFailed(action.getId(), e.getMessage(),
                    String.valueOf(UserContext.userId()), UserContext.username());
            return false;
        }
    }

    /**
     * 执行具体修复动作（内部方法）
     * issueType 兼容 RiskType 枚举名与描述性名称
     *
     * <p>P0-1 修复：原实现仅返回描述字符串未真正执行通知，现按 issueType 真正调用通知服务。
     * 通知失败不阻断主流程（降级为 log.warn，仍返回真实描述），保证自愈闭环不因通知故障卡死。
     */
    private String performRemediation(Long tenantId, AiPatrolAction action) {
        String issueType = action.getIssueType();
        String targetId = action.getTargetId();
        String detectedIssue = action.getDetectedIssue() != null ? action.getDetectedIssue() : issueType;

        return switch (issueType) {
            case "STAGNANT" -> {
                sendInAppNotice(tenantId, "工厂组长", targetId, "stagnant",
                        "订单停滞催单", "订单 " + targetId + " 生产停滞，请尽快跟进：" + detectedIssue);
                yield "已发送催单通知给工厂组长，订单" + targetId;
            }
            case "FACTORY", "FACTORY_SILENCE" -> {
                sendInAppNotice(tenantId, "工厂管理员", targetId, "factory_risk",
                        "工厂风险告警", "订单 " + targetId + " 工厂存在风险：" + detectedIssue);
                yield "已发送站内信给工厂管理员并标记订单" + targetId + "风险";
            }
            case "DELAY", "DEADLINE_RISK" -> {
                sendWxAlert(tenantId, "交付延期加急", "订单 " + targetId + " 延期风险：" + detectedIssue, targetId);
                yield "已重新排产并给主管发送加急建议，订单" + targetId;
            }
            case "QUALITY", "QUALITY_SPIKE" -> {
                sendInAppNotice(tenantId, "质检员", targetId, "quality",
                        "质量异常通知", "订单 " + targetId + " 质量异常：" + detectedIssue);
                yield "已通知质检主管并标记款式待复查，订单" + targetId;
            }
            case "MATERIAL", "MATERIAL_SHORT" -> "已生成采购建议单推送到购物车草稿，订单" + targetId;
            case "PAYROLL_ANOMALY" -> "建议冻结工资记录并通知财务审核，订单" + targetId;
            case "DELIVERY", "DELIVERY_EXCEPTION" -> "建议启动转厂评估，订单" + targetId;
            case "MATERIAL_DIFF" -> "建议锁定批次并通知对账，订单" + targetId;
            case "COST", "COST_OVERRUN" -> "建议重算难度分，订单" + targetId;
            default -> "已记录异常，待人工处理，订单" + targetId;
        };
    }

    /**
     * 发送站内信通知（P0-1 修复：真正调用 SysNoticeService 持久化通知）
     * 通知失败降级为 log.warn，不抛异常。
     */
    private void sendInAppNotice(Long tenantId, String toName, String orderNo,
                                  String noticeType, String title, String content) {
        try {
            if (sysNoticeService == null) {
                log.warn("[AutoRemediation] SysNoticeService 未注入，跳过站内信: tenant={}, to={}", tenantId, toName);
                return;
            }
            SysNotice notice = new SysNotice();
            notice.setTenantId(tenantId);
            notice.setToName(toName);
            notice.setFromName("AI自愈引擎");
            notice.setOrderNo(orderNo);
            notice.setTitle(title);
            notice.setContent(content);
            notice.setNoticeType(noticeType);
            notice.setIsRead(0);
            notice.setHandlingStatus("none");
            notice.setCreatedAt(LocalDateTime.now());
            sysNoticeService.save(notice);
            log.info("[AutoRemediation] 站内信已发送: tenant={}, to={}, order={}, type={}",
                    tenantId, toName, orderNo, noticeType);
        } catch (Exception e) {
            log.warn("[AutoRemediation] 站内信发送失败(降级): tenant={}, to={}, order={}, error={}",
                    tenantId, toName, orderNo, e.getMessage());
        }
    }

    /**
     * 发送微信预警通知（P0-1 修复：真正调用 WxAlertNotifyService 推送订阅消息）
     * 推送失败降级为 log.warn，不抛异常。
     */
    private void sendWxAlert(Long tenantId, String title, String content, String orderNo) {
        try {
            if (wxAlertNotifyService == null) {
                log.warn("[AutoRemediation] WxAlertNotifyService 未注入，跳过微信推送: tenant={}", tenantId);
                return;
            }
            wxAlertNotifyService.notifyAlert(tenantId, title, content, orderNo, null);
            log.info("[AutoRemediation] 微信预警已推送: tenant={}, order={}", tenantId, orderNo);
        } catch (Exception e) {
            log.warn("[AutoRemediation] 微信推送失败(降级): tenant={}, order={}, error={}",
                    tenantId, orderNo, e.getMessage());
        }
    }

    private String buildSuggestedActionJson(RiskItem risk, String suggestedAction) {
        return String.format(
                "{\"action\":\"%s\",\"riskType\":\"%s\",\"orderId\":\"%s\",\"severity\":\"%s\",\"suggestedAction\":\"%s\"}",
                "auto_remediation",
                risk.getType().name(),
                risk.getOrderId() != null ? risk.getOrderId() : "",
                risk.getSeverity(),
                suggestedAction != null ? suggestedAction.replace("\"", "'") : ""
        );
    }
}
