package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.MindPushRuleDTO;
import com.fashion.supplychain.intelligence.dto.MindPushStatusResponse;
import com.fashion.supplychain.intelligence.orchestration.MindPushOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * MindPush 主动推送中枢 Controller
 * 管理推送规则配置、查看推送状态、手动触发检测
 */
@RestController
@RequestMapping("/api/intelligence/mind-push")
@PreAuthorize("isAuthenticated()")
public class MindPushController {

    @Autowired
    private MindPushOrchestrator mindPushOrchestrator;

    /**
     * 获取推送规则配置和最近推送日志
     */
    @GetMapping("/status")
    public Result<MindPushStatusResponse> getStatus() {
        return Result.success(mindPushOrchestrator.getStatus());
    }

    /**
     * 保存/更新推送规则（启停、阈值调整）
     */
    @PostMapping("/rule")
    public Result<String> saveRule(@RequestBody MindPushRuleDTO dto) {
        mindPushOrchestrator.saveRule(dto);
        return Result.success("规则已保存");
    }

    /**
     * 手动触发当前租户的推送检测，返回本次触发的推送条数
     */
    @PostMapping("/check")
    public Result<Integer> runCheck() {
        Long tenantId = UserContext.tenantId();
        int count = mindPushOrchestrator.runPushCheck(tenantId);
        return Result.success(count);
    }
}
