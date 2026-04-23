package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/system/diag")
public class OrgDiagController {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @GetMapping("/org")
    public Result<Map<String, Object>> diagnoseOrg() {
        Map<String, Object> result = new HashMap<>();
        
        Map<String, Object> ctx = new HashMap<>();
        ctx.put("userId", UserContext.get() != null ? UserContext.get().getUserId() : null);
        ctx.put("username", UserContext.username());
        ctx.put("tenantId", UserContext.tenantId());
        ctx.put("isTenantOwner", UserContext.isTenantOwner());
        ctx.put("isSuperAdmin", UserContext.isSuperAdmin());
        result.put("context", ctx);

        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("租户上下文缺失");
        }
        String sql = "SELECT id, node_name, tenant_id, parent_id, node_type, delete_flag, create_time FROM t_organization_unit WHERE tenant_id = ? ORDER BY create_time DESC LIMIT 20";
        List<Map<String, Object>> orgs = jdbcTemplate.queryForList(sql, tenantId);
        result.put("orgUnits", orgs);
        
        if (UserContext.username() != null) {
            List<Map<String, Object>> users = jdbcTemplate.queryForList(
                "SELECT id, username, tenant_id, is_tenant_owner, is_super_admin FROM t_user WHERE username = ?", 
                UserContext.username());
            result.put("userInfo", users);
        }

        return Result.success(result);
    }
}
