package com.fashion.supplychain.search.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.search.dto.GlobalSearchResult;
import com.fashion.supplychain.search.orchestration.GlobalSearchOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * ⌘K 全局搜索控制器
 * GET /api/search/global?q=xxx
 */
@RestController
@RequestMapping("/api/search")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class GlobalSearchController {

    private final GlobalSearchOrchestrator globalSearchOrchestrator;

    /**
     * ⌘K 全局搜索
     * @param q 搜索关键词（前端至少输入1个字符才触发）
     */
    @GetMapping("/global")
    public Result<GlobalSearchResult> search(@RequestParam String q) {
        Long tenantId = UserContext.tenantId();
        GlobalSearchResult result = globalSearchOrchestrator.search(q, tenantId);
        return Result.success(result);
    }
}
