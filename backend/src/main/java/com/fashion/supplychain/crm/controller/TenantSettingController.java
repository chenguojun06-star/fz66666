package com.fashion.supplychain.crm.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.crm.orchestration.TenantSettingOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 租户级设置控制器（D-741）。
 *
 * <p>只做「登录校验 + 参数校验 + 调 Orchestrator + 组装 Result」。
 */
@Slf4j
@RestController
@RequestMapping("/api/crm/tenant-setting")
@PreAuthorize("isAuthenticated()")
public class TenantSettingController {

    @Autowired
    private TenantSettingOrchestrator tenantSettingOrchestrator;

    /** 当前租户设置（未设置项返回默认值） */
    @GetMapping
    public Result<Map<String, Object>> getSettings() {
        return tenantSettingOrchestrator.getSettings();
    }

    /** 保存应收账期天数 */
    @PutMapping("/payment-term")
    public Result<Map<String, Object>> savePaymentTermDays(@RequestBody Map<String, Integer> request) {
        Integer days = request == null ? null : request.get("paymentTermDays");
        return tenantSettingOrchestrator.savePaymentTermDays(days);
    }
}
