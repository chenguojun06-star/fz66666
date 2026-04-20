package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.orchestration.TenantOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/system/tenant")
public class PublicTenantController {

    private static final String REDIS_WORKER_REG_PREFIX = "fashion:ratelimit:worker-reg:";
    private static final int WORKER_REG_MAX_PER_HOUR = 10;

    @Autowired
    private TenantOrchestrator tenantOrchestrator;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    @GetMapping("/public-list")
    public Result<List<Map<String, Object>>> publicTenantList() {
        List<Tenant> tenants = tenantOrchestrator.listActiveTenants();
        List<Map<String, Object>> result = tenants.stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", t.getId());
            m.put("tenantName", t.getTenantName());
            m.put("tenantCode", t.getTenantCode());
            return m;
        }).collect(Collectors.toList());
        return Result.success(result);
    }

    @PostMapping("/apply")
    public Result<Map<String, Object>> applyForTenant(@RequestBody Map<String, Object> params) {
        String tenantName = (String) params.get("tenantName");
        String contactName = (String) params.get("contactName");
        String contactPhone = (String) params.get("contactPhone");
        String applyUsername = (String) params.get("applyUsername");
        String applyPassword = (String) params.get("applyPassword");
        return Result.success(tenantOrchestrator.applyForTenant(tenantName, contactName, contactPhone, applyUsername, applyPassword));
    }

    @PostMapping("/registration/register")
    public Result<Map<String, Object>> workerRegister(@RequestBody Map<String, String> params,
                                                      HttpServletRequest request) {
        if (stringRedisTemplate != null) {
            try {
                String ip = request.getRemoteAddr();
                String key = REDIS_WORKER_REG_PREFIX + ip;
                Long count = stringRedisTemplate.opsForValue().increment(key);
                if (count != null && count == 1) {
                    stringRedisTemplate.expire(key, 1, TimeUnit.HOURS);
                }
                if (count != null && count > WORKER_REG_MAX_PER_HOUR) {
                    return Result.fail("注册请求过于频繁，请稍后再试");
                }
            } catch (Exception e) {
                log.warn("[TenantRegister] 限流检查异常，为安全起见放行注册: {}", e.getMessage());
            }
        }
        String username = params.get("username");
        String password = params.get("password");
        String name = params.get("name");
        String phone = params.get("phone");
        String tenantCode = params.get("tenantCode");
        String factoryId = params.get("factoryId");
        String orgUnitId = params.get("orgUnitId");
        return Result.success(tenantOrchestrator.workerRegister(username, password, name, phone, tenantCode, factoryId, orgUnitId));
    }
}
