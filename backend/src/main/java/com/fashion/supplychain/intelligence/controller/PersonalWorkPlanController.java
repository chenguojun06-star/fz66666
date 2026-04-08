package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.PersonalWorkPlanOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 个人每日工作计划接口
 */
@RestController
@RequestMapping("/api/intelligence")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class PersonalWorkPlanController {

    private final PersonalWorkPlanOrchestrator personalWorkPlanOrchestrator;

    @GetMapping("/personal-work-plan")
    public Result<Map<String, Object>> getPersonalWorkPlan() {
        return Result.success(personalWorkPlanOrchestrator.generatePlan());
    }
}
