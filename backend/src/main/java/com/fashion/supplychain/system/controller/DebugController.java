package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/debug")
@PreAuthorize("hasAnyAuthority('ROLE_1', 'ROLE_ADMIN')")
@Profile("dev")
public class DebugController {
    @GetMapping("/context")
    public Result<?> getContext() {
        Map<String, Object> map = new HashMap<>();
        map.put("userId", UserContext.userId());
        map.put("username", UserContext.username());
        map.put("tenantId", UserContext.tenantId());
        map.put("factoryId", UserContext.factoryId());
        map.put("isTenantOwner", UserContext.isTenantOwner());
        map.put("isSuperAdmin", UserContext.isSuperAdmin());
        return Result.success(map);
    }
}