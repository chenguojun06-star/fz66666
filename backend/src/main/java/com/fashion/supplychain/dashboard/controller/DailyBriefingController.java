package com.fashion.supplychain.dashboard.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.DailyBriefing;
import com.fashion.supplychain.intelligence.service.DailyBriefingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard/briefing")
@PreAuthorize("isAuthenticated()")
public class DailyBriefingController {

    @Autowired
    private DailyBriefingService service;

    @GetMapping("/today")
    public Result<DailyBriefing> getToday() {
        Long tenantId = UserContext.tenantId();
        return Result.success(service.getToday(tenantId));
    }

    @PostMapping("/refresh")
    public Result<DailyBriefing> refresh() {
        Long tenantId = UserContext.tenantId();
        return Result.success(service.generate(tenantId));
    }
}
