package com.fashion.supplychain.dashboard.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.dashboard.orchestration.MenuBadgeCountOrchestrator;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 菜单红点计数控制器
 * <p>
 * 返回各业务菜单的待处理数量，用于侧边栏红点显示。
 * <p>
 * D-636：取数与合并逻辑已下沉到 {@link MenuBadgeCountOrchestrator}。
 * 本类只负责「认证（@PreAuthorize）+ 组装响应」，不再直接注入 Service。
 */
@Slf4j
@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize("isAuthenticated()")
public class MenuBadgeCountController {

    @Autowired
    private MenuBadgeCountOrchestrator menuBadgeCountOrchestrator;

    @GetMapping("/menu-badge-counts")
    public Result<Map<String, Long>> getMenuBadgeCounts() {
        return Result.success(menuBadgeCountOrchestrator.getMenuBadgeCounts());
    }
}
