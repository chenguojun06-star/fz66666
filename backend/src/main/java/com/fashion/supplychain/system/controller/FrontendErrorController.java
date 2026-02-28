package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.dto.FrontendErrorDTO;
import com.fashion.supplychain.system.store.FrontendErrorStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 前端异常上报接口
 * POST /api/system/frontend-errors/report  —— 任意已登录用户上报
 * GET  /api/system/frontend-errors/recent  —— 仅超管查询
 *
 * 独立 Controller，不依赖任何 Orchestrator/Service，直接操作 FrontendErrorStore（内存队列）。
 */
@RestController
@RequestMapping("/api/system/frontend-errors")
@PreAuthorize("isAuthenticated()")
public class FrontendErrorController {

    private static final Logger log = LoggerFactory.getLogger(FrontendErrorController.class);

    @Autowired
    private FrontendErrorStore store;

    /**
     * 前端上报 JS 异常
     * window.onerror / unhandledrejection / React ErrorBoundary 触发时调用
     */
    @PostMapping("/report")
    public Result<Void> report(@RequestBody FrontendErrorDTO dto) {
        // 截断 stack，防止超大请求体
        if (dto.getStack() != null && dto.getStack().length() > 2000) {
            dto.setStack(dto.getStack().substring(0, 2000) + "\n...(truncated)");
        }
        if (dto.getMessage() != null && dto.getMessage().length() > 500) {
            dto.setMessage(dto.getMessage().substring(0, 500));
        }
        store.add(dto);
        log.warn("[FrontendError] type={} url={} msg={}",
                dto.getType(), dto.getUrl(),
                dto.getMessage() != null && dto.getMessage().length() > 80
                        ? dto.getMessage().substring(0, 80)
                        : dto.getMessage());
        return Result.success(null);
    }

    /**
     * 超管查询最近的前端异常列表
     */
    @GetMapping("/recent")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<List<FrontendErrorDTO>> recent(
            @RequestParam(defaultValue = "50") int limit) {
        return Result.success(store.getRecent(Math.min(limit, 200)));
    }
}
