package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.AiAgentTokenBudgetService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 租户 AI 日配额管理接口（小云"今日回答次数用完"的查看与恢复入口）。
 *
 * <p>背景：租户级日 token 配额（Redis key ai:budget:{tenantId}:{date}:tokens）用完时，
 * 小云所有 AI 场景被拦截且此前无任何自助恢复手段（只能等次日 0 点自动重置）。
 *
 * <p>权限：租户主账号（isTopAdmin，含租户老板）或平台超管。仅能查看/重置**自己租户**的配额。
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence/ai-budget")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated() and (T(com.fashion.supplychain.common.UserContext).isTopAdmin() "
        + "or T(com.fashion.supplychain.common.UserContext).isSuperAdmin())")
public class AiBudgetController {

    private final AiAgentTokenBudgetService budgetService;

    /** 查看当前租户今日配额状态：已用 / 上限 / 剩余 */
    @GetMapping("/status")
    public Result<Map<String, Object>> status() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("缺少租户上下文，请重新登录");
        }
        long usage = budgetService.getTodayUsage();
        long limit = budgetService.getDailyLimit();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tenantId", tenantId);
        data.put("usage", usage);
        data.put("limit", limit);
        data.put("remaining", Math.max(0, limit - usage));
        return Result.success(data);
    }

    /** 重置当前租户今日配额（立即恢复小云可用），返回释放的 token 数 */
    @PostMapping("/reset")
    public Result<Map<String, Object>> reset() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("缺少租户上下文，请重新登录");
        }
        long released = budgetService.resetToday();
        if (released < 0) {
            return Result.fail("重置失败，请稍后重试");
        }
        log.info("[AiBudget] 租户 {} 配额被主账号/超管手动重置, released={}", tenantId, released);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tenantId", tenantId);
        data.put("released", released);
        return Result.success(data);
    }
}
