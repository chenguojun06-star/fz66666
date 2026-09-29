package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.RoleTemplate;
import com.fashion.supplychain.system.orchestration.RoleTemplateOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 角色模板控制器
 *
 * <p>本类只做「参数解析 + 调 Orchestrator + 组装响应」。业务编排在
 * {@link RoleTemplateOrchestrator}，原先直接注入的 RoleTemplateService / RoleService
 * 已下沉（D-630 规则6：Controller 不得直接依赖多个 Service）。
 */
@RestController
@RequestMapping("/api/role-template")
@PreAuthorize("isAuthenticated()")
@Slf4j
public class RoleTemplateController {

    @Autowired
    private RoleTemplateOrchestrator roleTemplateOrchestrator;

    /**
     * 获取角色模板列表
     */
    @GetMapping("/list")
    public Result<List<RoleTemplate>> list() {
        return roleTemplateOrchestrator.list();
    }

    /**
     * 根据ID获取角色模板详情
     */
    @GetMapping("/{id}")
    public Result<RoleTemplate> getById(@PathVariable Long id) {
        return roleTemplateOrchestrator.getById(id);
    }

    /**
     * 根据模板创建角色
     */
    @PostMapping("/apply")
    public Result<Long> apply(@RequestBody Map<String, Object> params) {
        Long templateId = Long.valueOf(params.get("templateId").toString());
        String roleName = params.containsKey("roleName") ? params.get("roleName").toString() : null;
        String remark = params.containsKey("remark") ? params.get("remark").toString() : "应用角色模板";

        return roleTemplateOrchestrator.apply(templateId, roleName, remark);
    }

    /**
     * 检测是否为新租户（没有创建过任何角色）
     */
    @GetMapping("/check-new-tenant")
    public Result<Map<String, Object>> checkNewTenant() {
        return roleTemplateOrchestrator.checkNewTenant();
    }

    /**
     * 快速初始化：一键应用推荐模板创建基础角色
     */
    @PostMapping("/quick-setup")
    public Result<Map<String, Object>> quickSetup(@RequestBody List<Long> templateIds) {
        return roleTemplateOrchestrator.quickSetup(templateIds);
    }
}
