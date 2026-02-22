package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.TenantBillingRecord;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.orchestration.TenantOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * 租户管理控制器
 *
 * 端点设计：
 * - /api/system/tenant/*        超级管理员管理租户
 * - /api/system/tenant/sub/*    租户主账号管理子账号
 * - /api/system/tenant/my       获取当前租户信息
 */
@RestController
@RequestMapping("/api/system/tenant")
@PreAuthorize("isAuthenticated()")
public class TenantController {

    @Autowired
    private TenantOrchestrator tenantOrchestrator;

    // ========== 公开接口（无需登录） ==========

    /**
     * 公开接口：获取活跃租户列表（登录页选择公司用）
     * 返回 {id, tenantName, tenantCode}，供员工注册时按名称搜索工厂
     */
    @GetMapping("/public-list")
    @PreAuthorize("permitAll()")
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

    // ========== 超级管理员：租户管理 ==========

    /**
     * 创建新租户（含主账号）
     */
    @PostMapping("/create")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Map<String, Object>> createTenant(@RequestBody Map<String, Object> params) {
        String tenantName = (String) params.get("tenantName");
        String tenantCode = (String) params.get("tenantCode");
        String contactName = (String) params.get("contactName");
        String contactPhone = (String) params.get("contactPhone");
        String ownerUsername = (String) params.get("ownerUsername");
        String ownerPassword = (String) params.get("ownerPassword");
        String ownerName = (String) params.get("ownerName");
        Integer maxUsers = params.get("maxUsers") != null ? Integer.valueOf(params.get("maxUsers").toString()) : null;

        Map<String, Object> result = tenantOrchestrator.createTenant(
                tenantName, tenantCode, contactName, contactPhone,
                ownerUsername, ownerPassword, ownerName, maxUsers);
        return Result.success(result);
    }

    /**
     * 查询租户列表
     */
    @PostMapping("/list")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Page<Tenant>> listTenants(@RequestBody(required = false) Map<String, Object> params) {
        Long page = params != null && params.get("page") != null ? Long.valueOf(params.get("page").toString()) : 1L;
        Long pageSize = params != null && params.get("pageSize") != null ? Long.valueOf(params.get("pageSize").toString()) : 20L;
        String tenantName = params != null ? (String) params.get("tenantName") : null;
        String status = params != null ? (String) params.get("status") : null;
        return Result.success(tenantOrchestrator.listTenants(page, pageSize, tenantName, status));
    }

    /**
     * 更新租户信息
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> updateTenant(@PathVariable Long id, @RequestBody Tenant tenant) {
        tenant.setId(id);
        return Result.success(tenantOrchestrator.updateTenant(tenant));
    }

    /**
     * 切换租户状态
     */
    @PostMapping("/{id}/toggle-status")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> toggleTenantStatus(@PathVariable Long id, @RequestBody Map<String, String> params) {
        String status = params.get("status");
        return Result.success(tenantOrchestrator.toggleTenantStatus(id, status));
    }

    // ========== 租户主账号：子账号管理 ==========

    /**
     * 添加子账号
     */
    @PostMapping("/sub/add")
    public Result<User> addSubAccount(@RequestBody User user) {
        return Result.success(tenantOrchestrator.addSubAccount(user));
    }

    /**
     * 查看本租户子账号列表
     */
    @PostMapping("/sub/list")
    public Result<Page<User>> listSubAccounts(@RequestBody(required = false) Map<String, Object> params) {
        Long page = params != null && params.get("page") != null ? Long.valueOf(params.get("page").toString()) : 1L;
        Long pageSize = params != null && params.get("pageSize") != null ? Long.valueOf(params.get("pageSize").toString()) : 20L;
        String name = params != null ? (String) params.get("name") : null;
        String roleName = params != null ? (String) params.get("roleName") : null;
        return Result.success(tenantOrchestrator.listSubAccounts(page, pageSize, name, roleName));
    }

    /**
     * 更新子账号
     */
    @PutMapping("/sub/{id}")
    public Result<Boolean> updateSubAccount(@PathVariable Long id, @RequestBody User user) {
        user.setId(id);
        return Result.success(tenantOrchestrator.updateSubAccount(user));
    }

    /**
     * 删除子账号
     */
    @DeleteMapping("/sub/{id}")
    public Result<Boolean> deleteSubAccount(@PathVariable Long id) {
        return Result.success(tenantOrchestrator.deleteSubAccount(id));
    }

    // ========== 通用 ==========

    /**
     * 获取当前用户的租户信息
     */
    @GetMapping("/my")
    public Result<Map<String, Object>> myTenant() {
        return Result.success(tenantOrchestrator.myTenant());
    }

    /**
     * 租户主账号修改自己的工厂名称/联系信息（非超管专用，租户自主管理）
     */
    @PutMapping("/my/info")
    public Result<Boolean> updateMyTenantInfo(@RequestBody Map<String, String> params) {
        String tenantName = params.get("tenantName");
        String contactName = params.get("contactName");
        String contactPhone = params.get("contactPhone");
        return Result.success(tenantOrchestrator.updateMyTenantInfo(tenantName, contactName, contactPhone));
    }

    // ========== 角色模板管理 ==========

    /**
     * 获取所有可用角色模板
     */
    @GetMapping("/role-templates")
    public Result<List<Role>> listRoleTemplates() {
        return Result.success(tenantOrchestrator.listRoleTemplates());
    }

    /**
     * 克隆角色模板到租户
     */
    @PostMapping("/roles/clone")
    public Result<Role> cloneRoleTemplate(@RequestBody Map<String, Object> params) {
        Long tenantId = params.get("tenantId") != null ? Long.valueOf(params.get("tenantId").toString()) : null;
        Long templateId = params.get("templateId") != null ? Long.valueOf(params.get("templateId").toString()) : null;
        if (templateId == null) {
            return Result.fail("模板ID不能为空");
        }
        return Result.success(tenantOrchestrator.cloneRoleTemplate(tenantId, templateId));
    }

    /**
     * 获取租户的角色列表
     */
    @GetMapping("/roles/{tenantId}")
    public Result<List<Role>> listTenantRoles(@PathVariable Long tenantId) {
        return Result.success(tenantOrchestrator.listTenantRoles(tenantId));
    }

    /**
     * 更新租户角色权限
     */
    @SuppressWarnings("unchecked")
    @PostMapping("/roles/{roleId}/permissions")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> updateTenantRolePermissions(@PathVariable Long roleId,
                                                        @RequestBody Map<String, Object> params) {
        List<Number> permIds = (List<Number>) params.get("permissionIds");
        List<Long> permissionIds = permIds != null ? permIds.stream()
                .map(Number::longValue).collect(java.util.stream.Collectors.toList()) : null;
        tenantOrchestrator.updateTenantRolePermissions(roleId, permissionIds);
        return Result.success(true);
    }

    // ========== 租户权限天花板 ==========

    /**
     * 获取租户权限天花板配置
     */
    @GetMapping("/ceiling/{tenantId}")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Map<String, Object>> getTenantCeiling(@PathVariable Long tenantId) {
        return Result.success(tenantOrchestrator.getTenantCeiling(tenantId));
    }

    /**
     * 设置租户权限天花板
     */
    @SuppressWarnings("unchecked")
    @PostMapping("/ceiling/{tenantId}")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> setTenantCeiling(@PathVariable Long tenantId,
                                             @RequestBody Map<String, Object> params) {
        List<Number> grantedIds = (List<Number>) params.get("grantedPermissionIds");
        List<Long> grantedPermissionIds = grantedIds != null ? grantedIds.stream()
                .map(Number::longValue).collect(java.util.stream.Collectors.toList()) : null;
        tenantOrchestrator.setTenantCeiling(tenantId, grantedPermissionIds);
        return Result.success(true);
    }

    // ========== 工厂自助申请入驻 ==========

    /**
     * 工厂申请入驻（无需登录，开放接口）
     * 提交后等待超级管理员在「客户管理」中审批
     */
    @PostMapping("/apply")
    @org.springframework.security.access.prepost.PreAuthorize("permitAll()")
    public Result<Map<String, Object>> applyForTenant(@RequestBody Map<String, Object> params) {
        String tenantName = (String) params.get("tenantName");
        String contactName = (String) params.get("contactName");
        String contactPhone = (String) params.get("contactPhone");
        String applyUsername = (String) params.get("applyUsername");
        String applyPassword = (String) params.get("applyPassword");
        return Result.success(tenantOrchestrator.applyForTenant(tenantName, contactName, contactPhone, applyUsername, applyPassword));
    }

    /**
     * 删除租户（超级管理员）
     * 待审核/已拒绝的租户直接删除；已激活的租户会级联清理用户、角色、账单
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> deleteTenant(@PathVariable Long id) {
        return Result.success(tenantOrchestrator.deleteTenant(id));
    }

    /**
     * 审批通过入驻申请（超级管理员）
     * 可选指定套餐和免费试用期
     */
    @PostMapping("/{id}/approve-application")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Map<String, Object>> approveApplication(@PathVariable Long id,
                                                           @RequestBody(required = false) Map<String, Object> params) {
        String planType = params != null ? (String) params.get("planType") : null;
        Integer trialDays = params != null && params.get("trialDays") != null
                ? Integer.valueOf(params.get("trialDays").toString()) : null;
        return Result.success(tenantOrchestrator.approveApplication(id, planType, trialDays));
    }

    /**
     * 修改入驻申请信息（超级管理员，审批前允许修改账号等）
     */
    @PostMapping("/{id}/update-application")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> updateApplication(@PathVariable Long id, @RequestBody Map<String, String> params) {
        return Result.success(tenantOrchestrator.updateApplication(id, params));
    }

    /**
     * 拒绝入驻申请（超级管理员）
     */
    @PostMapping("/{id}/reject-application")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> rejectApplication(@PathVariable Long id, @RequestBody(required = false) Map<String, String> params) {
        String reason = params != null ? params.get("reason") : null;
        return Result.success(tenantOrchestrator.rejectApplication(id, reason));
    }

    /**
     * 标记租户付费状态（超级管理员）
     */
    @PostMapping("/{id}/mark-paid")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> markTenantPaid(@PathVariable Long id, @RequestBody Map<String, String> params) {
        String paidStatus = params.getOrDefault("paidStatus", "PAID");
        return Result.success(tenantOrchestrator.markTenantPaid(id, paidStatus));
    }

    // ========== 套餐与收费管理 ==========

    /**
     * 获取套餐方案列表
     */
    @GetMapping("/plans")
    public Result<List<Map<String, Object>>> getPlanDefinitions() {
        return Result.success(tenantOrchestrator.getPlanDefinitions());
    }

    /**
     * 设置租户套餐（超管）
     */
    @PostMapping("/{id}/plan")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Tenant> updateTenantPlan(@PathVariable Long id, @RequestBody Map<String, Object> params) {
        String planType = (String) params.get("planType");
        java.math.BigDecimal monthlyFee = params.get("monthlyFee") != null
                ? new java.math.BigDecimal(params.get("monthlyFee").toString()) : null;
        Long storageQuotaMb = params.get("storageQuotaMb") != null
                ? Long.valueOf(params.get("storageQuotaMb").toString()) : null;
        Integer maxUsers = params.get("maxUsers") != null
                ? Integer.valueOf(params.get("maxUsers").toString()) : null;
        String billingCycle = params.get("billingCycle") != null
                ? params.get("billingCycle").toString() : "MONTHLY";
        return Result.success(tenantOrchestrator.updateTenantPlan(id, planType, monthlyFee, storageQuotaMb, maxUsers, billingCycle));
    }

    /**
     * 获取租户存储与计费概览
     */
    @GetMapping("/{id}/billing-overview")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Map<String, Object>> getTenantBillingOverview(@PathVariable Long id) {
        return Result.success(tenantOrchestrator.getTenantBillingOverview(id));
    }

    /**
     * 生成月度账单
     */
    @PostMapping("/{id}/generate-bill")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<TenantBillingRecord> generateMonthlyBill(@PathVariable Long id,
            @RequestBody(required = false) Map<String, String> params) {
        String billingMonth = params != null ? params.get("billingMonth") : null;
        return Result.success(tenantOrchestrator.generateMonthlyBill(id, billingMonth));
    }

    /**
     * 查询账单列表（可按租户ID筛选）
     */
    @PostMapping("/billing-records")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Page<TenantBillingRecord>> listBillingRecords(@RequestBody Map<String, Object> params) {
        Long tenantId = params.get("tenantId") != null ? Long.valueOf(params.get("tenantId").toString()) : null;
        Long page = params.get("page") != null ? Long.valueOf(params.get("page").toString()) : 1L;
        Long pageSize = params.get("pageSize") != null ? Long.valueOf(params.get("pageSize").toString()) : 20L;
        String status = params.get("status") != null ? params.get("status").toString() : null;
        return Result.success(tenantOrchestrator.listBillingRecords(tenantId, page, pageSize, status));
    }

    /**
     * 标记账单已支付
     */
    @PostMapping("/billing/{billId}/mark-paid")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> markBillPaid(@PathVariable Long billId) {
        return Result.success(tenantOrchestrator.markBillPaid(billId));
    }

    /**
     * 减免账单
     */
    @PostMapping("/billing/{billId}/waive")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> waiveBill(@PathVariable Long billId, @RequestBody(required = false) Map<String, String> params) {
        String remark = params != null ? params.get("remark") : null;
        return Result.success(tenantOrchestrator.waiveBill(billId, remark));
    }

    // ========== 工人注册与审批 ==========

    /**
     * 工人自注册（无需登录）
     */
    @PostMapping("/registration/register")
    public Result<Map<String, Object>> workerRegister(@RequestBody Map<String, String> params) {
        String username = params.get("username");
        String password = params.get("password");
        String name = params.get("name");
        String phone = params.get("phone");
        String tenantCode = params.get("tenantCode");
        return Result.success(tenantOrchestrator.workerRegister(username, password, name, phone, tenantCode));
    }

    /**
     * 获取待审批注册列表
     */
    @PostMapping("/registrations/pending")
    public Result<Page<User>> listPendingRegistrations(@RequestBody(required = false) Map<String, Object> params) {
        Long page = params != null && params.get("page") != null ? Long.valueOf(params.get("page").toString()) : 1L;
        Long pageSize = params != null && params.get("pageSize") != null ? Long.valueOf(params.get("pageSize").toString()) : 20L;
        return Result.success(tenantOrchestrator.listPendingRegistrations(page, pageSize));
    }

    /**
     * 审批通过注册用户
     */
    @PostMapping("/registrations/{userId}/approve")
    public Result<Boolean> approveRegistration(@PathVariable Long userId,
                                                @RequestBody(required = false) Map<String, Object> params) {
        Long roleId = params != null && params.get("roleId") != null
                ? Long.valueOf(params.get("roleId").toString()) : null;
        return Result.success(tenantOrchestrator.approveRegistration(userId, roleId));
    }

    /**
     * 拒绝注册用户
     */
    @PostMapping("/registrations/{userId}/reject")
    public Result<Boolean> rejectRegistration(@PathVariable Long userId,
                                               @RequestBody Map<String, String> params) {
        String reason = params.get("reason");
        return Result.success(tenantOrchestrator.rejectRegistration(userId, reason));
    }

    // ========== 用户权限覆盖 ==========

    /**
     * 获取用户权限覆盖配置
     */
    @GetMapping("/user-overrides/{userId}")
    public Result<Map<String, Object>> getUserPermissionOverrides(@PathVariable Long userId) {
        return Result.success(tenantOrchestrator.getUserPermissionOverrides(userId));
    }

    /**
     * 设置用户权限覆盖
     */
    @SuppressWarnings("unchecked")
    @PostMapping("/user-overrides/{userId}")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> setUserPermissionOverrides(@PathVariable Long userId,
                                                       @RequestBody Map<String, Object> params) {
        List<Number> grantNums = (List<Number>) params.get("grantPermissionIds");
        List<Number> revokeNums = (List<Number>) params.get("revokePermissionIds");
        List<Long> grantIds = grantNums != null ? grantNums.stream()
                .map(Number::longValue).collect(java.util.stream.Collectors.toList()) : null;
        List<Long> revokeIds = revokeNums != null ? revokeNums.stream()
                .map(Number::longValue).collect(java.util.stream.Collectors.toList()) : null;
        tenantOrchestrator.setUserPermissionOverrides(userId, grantIds, revokeIds);
        return Result.success(true);
    }
}
