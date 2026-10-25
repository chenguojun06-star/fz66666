package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.OrderRiskTrackingOrchestrator;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 订单风险跟踪（D-879）。
 *
 * <p>背景：`OrderRiskTrackingOrchestrator` 的「处理 / 升级 / 撤销 / 重开」四个方法
 * 全后端零调用——风险由交期评估引擎写入后，**没有任何出口**，人看不到也处理不了，
 * 表只增不减、统计恒 0。D-879 把自动闭环放在评估引擎里（去重/复现重开/自动解除），
 * 人工动作由本控制器承接。
 *
 * <p>权限：登录即可（与 `PainPointController` 一致）。风险处理是业务日常操作，
 * 不额外加权限码——避免「页面看得见、点开全 403」的旧坑（D-749 同族）。
 */
@RestController
@RequestMapping("/api/intelligence/risk-tracking")
@PreAuthorize("isAuthenticated()")
public class OrderRiskTrackingController {

    @Autowired
    private OrderRiskTrackingOrchestrator riskTrackingOrchestrator;

    /** 未闭环风险列表（pending / escalated），按创建时间倒序 */
    @GetMapping("/list")
    public Result<?> list() {
        return Result.success(riskTrackingOrchestrator.listOpenRisks());
    }

    /** 风险统计（近 N 天）：总量 / 待处理 / 已处理 / 已升级 / 高危 / 处理率 */
    @GetMapping("/stats")
    public Result<?> stats(@RequestParam(defaultValue = "30") int days) {
        return Result.success(riskTrackingOrchestrator.getRiskStats(days));
    }

    /** 处理风险（记录处理动作与结果） */
    @PostMapping("/{id}/resolve")
    public Result<?> resolve(@PathVariable Long id,
                             @RequestBody(required = false) Map<String, String> body) {
        String action = body == null ? null : body.get("handlingAction");
        String handlingResult = body == null ? null : body.get("handlingResult");
        return Result.success(riskTrackingOrchestrator.resolveRisk(
                id,
                action == null || action.isBlank() ? "人工处理" : action,
                handlingResult == null ? "" : handlingResult));
    }

    /** 升级风险（必须指定新处理人，否则升级后没人接） */
    @PostMapping("/{id}/escalate")
    public Result<?> escalate(@PathVariable Long id,
                              @RequestBody(required = false) Map<String, String> body) {
        String assignedTo = body == null ? null : body.get("assignedTo");
        if (assignedTo == null || assignedTo.isBlank()) {
            return Result.fail("升级必须指定新的处理人（assignedTo）");
        }
        return Result.success(riskTrackingOrchestrator.escalateRisk(id, assignedTo));
    }

    /** 撤销风险（AI 误标记时清除） */
    @PostMapping("/{id}/clear")
    public Result<?> clear(@PathVariable Long id,
                           @RequestBody(required = false) Map<String, String> body) {
        String reason = body == null ? null : body.get("reason");
        return Result.success(riskTrackingOrchestrator.clearRisk(
                id, reason == null || reason.isBlank() ? "AI 误判" : reason));
    }

    /** 重开风险（误处理后纠正） */
    @PostMapping("/{id}/reopen")
    public Result<?> reopen(@PathVariable Long id,
                            @RequestBody(required = false) Map<String, String> body) {
        String reason = body == null ? null : body.get("reason");
        return Result.success(riskTrackingOrchestrator.reopenRisk(
                id, reason == null || reason.isBlank() ? "误处理，重新打开" : reason));
    }
}
