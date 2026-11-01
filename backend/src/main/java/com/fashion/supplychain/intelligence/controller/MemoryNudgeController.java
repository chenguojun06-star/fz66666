package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.MemoryNudge;
import com.fashion.supplychain.intelligence.orchestration.MemoryNudgeOrchestrator;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 记忆提醒（MemoryNudge）人工响应入口（D-910）。
 *
 * <p>背景：{@link MemoryNudgeOrchestrator} 的 acceptNudge/dismissNudge 全后端零调用，
 * 5 条 PENDING 记录挂起无人处理。本控制器承接人工响应动作。</p>
 *
 * <p>权限：登录即可。</p>
 */
@RestController
@RequestMapping("/api/intelligence/memory-nudge")
@PreAuthorize("isAuthenticated()")
public class MemoryNudgeController {

    @Autowired
    private MemoryNudgeOrchestrator nudgeOrchestrator;

    /** 当前用户未处理的记忆提醒 */
    @GetMapping("/pending")
    public Result<?> pending() {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.username();
        if (tenantId == null || userId == null) {
            return Result.fail("无法获取当前用户");
        }
        List<MemoryNudge> list = nudgeOrchestrator.getPendingNudges(tenantId, userId);
        return Result.success(list);
    }

    /** 确认记忆（采纳） */
    @PostMapping("/{id}/accept")
    public Result<?> accept(@PathVariable String id) {
        nudgeOrchestrator.acceptNudge(id);
        return Result.success(true);
    }

    /** 忽略记忆（驳回） */
    @PostMapping("/{id}/dismiss")
    public Result<?> dismiss(@PathVariable String id) {
        nudgeOrchestrator.dismissNudge(id);
        return Result.success(true);
    }
}
