package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 站内通知 Controller（跟单员收件箱）
 *
 * POST /api/production/notice/send          — 发送通知给跟单员
 * GET  /api/production/notice/my            — 获取当前用户的通知列表
 * GET  /api/production/notice/unread-count  — 获取未读数（用于铃铛角标）
 * POST /api/production/notice/{id}/read     — 标记单条已读
 */
@Slf4j
@RestController
@RequestMapping("/api/production/notice")
@PreAuthorize("isAuthenticated()")
public class SysNoticeController {

    @Autowired
    private SysNoticeOrchestrator sysNoticeOrchestrator;

    /**
     * 发送通知给跟单员
     * body: { "orderNo": "PO...", "noticeType": "stagnant" }
     */
    @PostMapping("/send")
    public Result<Void> send(@RequestBody Map<String, String> body) {
        String orderNo     = body.get("orderNo");
        String noticeType  = body.getOrDefault("noticeType", "manual");
        if (orderNo == null || orderNo.isBlank()) {
            return Result.fail("orderNo 不能为空");
        }
        sysNoticeOrchestrator.send(orderNo, noticeType);
        return Result.success(null);
    }

    /**
     * 获取当前登录用户的通知列表（最近30条，倒序）
     */
    @GetMapping("/my")
    public Result<List<SysNotice>> my() {
        try {
            return Result.success(sysNoticeOrchestrator.getMyNotices());
        } catch (Exception e) {
            log.warn("[SysNotice] getMyNotices 异常，返回空列表: {}", e.getMessage());
            return Result.success(java.util.Collections.emptyList());
        }
    }

    /**
     * 获取当前用户未读通知数（用于铃铛角标合并显示）
     */
    @GetMapping("/unread-count")
    public Result<Map<String, Long>> unreadCount() {
        try {
            long count = sysNoticeOrchestrator.getUnreadCount();
            return Result.success(Map.of("count", count));
        } catch (Exception e) {
            log.warn("[SysNotice] getUnreadCount 异常，返回0: {}", e.getMessage());
            return Result.success(Map.of("count", 0L));
        }
    }

    /**
     * 标记一条通知为已读
     */
    @PostMapping("/{id}/read")
    public Result<Void> markRead(@PathVariable Long id) {
        sysNoticeOrchestrator.markRead(id);
        return Result.success(null);
    }
}
