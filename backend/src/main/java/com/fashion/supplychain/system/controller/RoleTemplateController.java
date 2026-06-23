package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.RoleTemplate;
import com.fashion.supplychain.system.orchestration.RoleOrchestrator;
import com.fashion.supplychain.system.service.RoleTemplateService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.service.RoleService;

/**
 * 角色模板控制器
 */
@RestController
@RequestMapping("/api/role-template")
@PreAuthorize("isAuthenticated()")
@Slf4j
public class RoleTemplateController {

    @Autowired
    private RoleTemplateService roleTemplateService;

    @Autowired
    private RoleService roleService;

    @Autowired
    private RoleOrchestrator roleOrchestrator;

    /**
     * 获取角色模板列表
     */
    @GetMapping("/list")
    public Result<List<RoleTemplate>> list() {
        List<RoleTemplate> templates = roleTemplateService.lambdaQuery()
                .eq(RoleTemplate::getDeleteFlag, 0)
                .eq(RoleTemplate::getEnabled, true)
                .orderByAsc(RoleTemplate::getSortOrder)
                .list();
        return Result.success(templates);
    }

    /**
     * 根据ID获取角色模板详情
     */
    @GetMapping("/{id}")
    public Result<RoleTemplate> getById(@PathVariable Long id) {
        RoleTemplate template = roleTemplateService.lambdaQuery()
                .eq(RoleTemplate::getId, id)
                .eq(RoleTemplate::getDeleteFlag, 0)
                .one();
        if (template == null) {
            return Result.fail("模板不存在");
        }
        return Result.success(template);
    }

    /**
     * 根据模板创建角色
     */
    @PostMapping("/apply")
    public Result<Long> apply(@RequestBody Map<String, Object> params) {
        Long templateId = Long.valueOf(params.get("templateId").toString());
        String roleName = params.containsKey("roleName") ? params.get("roleName").toString() : null;
        String remark = params.containsKey("remark") ? params.get("remark").toString() : "应用角色模板";

        Long roleId = roleOrchestrator.applyTemplate(templateId, roleName, remark);
        return Result.success(roleId);
    }

    /**
     * 检测是否为新租户（没有创建过任何角色）
     */
    @GetMapping("/check-new-tenant")
    public Result<Map<String, Object>> checkNewTenant() {
        Long tenantId = UserContext.tenantId();

        // 查询该租户是否已有角色
        long roleCount = roleService.lambdaQuery()
                .eq(Role::getTenantId, tenantId)
                .ne(Role::getIsTemplate, true) // 排除模板
                .count();

        Map<String, Object> result = new HashMap<>();
        result.put("isNewTenant", roleCount == 0);
        result.put("roleCount", roleCount);

        // 如果是新租户，返回推荐的模板列表
        if (roleCount == 0) {
            List<RoleTemplate> templates = roleTemplateService.lambdaQuery()
                    .eq(RoleTemplate::getDeleteFlag, 0)
                    .eq(RoleTemplate::getEnabled, true)
                    .eq(RoleTemplate::getIsDefault, true) // 只返回默认模板
                    .orderByAsc(RoleTemplate::getSortOrder)
                    .list();
            result.put("recommendedTemplates", templates);
        }

        return Result.success(result);
    }

    /**
     * 快速初始化：一键应用推荐模板创建基础角色
     */
    @PostMapping("/quick-setup")
    public Result<Map<String, Object>> quickSetup(@RequestBody List<Long> templateIds) {
        if (templateIds == null || templateIds.isEmpty()) {
            return Result.badRequest("请选择至少一个模板");
        }

        List<Long> createdRoleIds = new ArrayList<>();
        for (Long templateId : templateIds) {
            try {
                Long roleId = roleOrchestrator.applyTemplate(templateId, null, "新租户快速初始化");
                createdRoleIds.add(roleId);
            } catch (Exception e) {
                log.warn("应用模板失败: templateId={}, error={}", templateId, e.getMessage());
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("createdCount", createdRoleIds.size());
        result.put("createdRoleIds", createdRoleIds);

        return Result.success(result);
    }
}
