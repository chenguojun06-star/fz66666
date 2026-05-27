package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.service.TenantAiConfigService;
import com.fashion.supplychain.integration.im.service.DingtalkNotifyService;
import com.fashion.supplychain.integration.im.service.FeishuNotifyService;
import com.fashion.supplychain.service.RedisService;
import lombok.extern.slf4j.Slf4j;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.TenantBillingRecord;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import com.fashion.supplychain.system.orchestration.TenantOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * 租户管理控制器
 *
 * 端点设计：
 * - /api/system/tenant/*        超级管理员管理租户
 * - /api/system/tenant/sub/*    租户主账号管理子账号
 * - /api/system/tenant/my       获取当前租户信息
 */
@Slf4j
@RestController
@RequestMapping("/api/system/tenant")
@PreAuthorize("isAuthenticated()")
public class TenantController {

    @Autowired
    private TenantOrchestrator tenantOrchestrator;

    @Autowired
    private SysNoticeOrchestrator sysNoticeOrchestrator;

    @Autowired(required = false)
    private RedisService redisService;

    @Autowired(required = false)
    private FeishuNotifyService feishuNotifyService;

    @Autowired(required = false)
    private DingtalkNotifyService dingtalkNotifyService;

    @Autowired(required = false)
    private TenantAiConfigService tenantAiConfigService;

    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.mapper.TenantAiConfigMapper tenantAiConfigMapper;

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
        if (tenantName == null || tenantName.isBlank()) return Result.fail("租户名称不能为空");
        if (tenantCode == null || tenantCode.isBlank()) return Result.fail("租户编码不能为空");
        if (ownerUsername == null || ownerUsername.isBlank()) return Result.fail("管理员用户名不能为空");
        if (ownerPassword == null || ownerPassword.length() < 6) return Result.fail("管理员密码不能少于6个字符");
        if (ownerName == null || ownerName.isBlank()) return Result.fail("管理员姓名不能为空");
        String planType = params.get("planType") != null ? params.get("planType").toString() : null;
        Integer maxUsers = params.get("maxUsers") != null ? Integer.valueOf(params.get("maxUsers").toString()) : null;
        String tenantType = (String) params.getOrDefault("tenantType", "HYBRID");

        Map<String, Object> result = tenantOrchestrator.createTenant(
                tenantName, tenantCode, contactName, contactPhone,
            ownerUsername, ownerPassword, ownerName, maxUsers, planType, tenantType);
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
     * 单独更新租户菜单白名单，支持设置为 null 表示全部开放。
     */
    @PostMapping("/{id}/enabled-modules")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Boolean> updateTenantEnabledModules(@PathVariable Long id,
                                                      @RequestBody(required = false) Map<String, Object> params) {
        Object raw = params != null ? params.get("enabledModules") : null;
        String enabledModules = raw != null ? raw.toString() : null;
        tenantOrchestrator.updateTenantEnabledModules(id, enabledModules);
        return Result.success(true);
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
        String orgUnitId = params != null ? (String) params.get("orgUnitId") : null;
        String employmentStatus = params != null ? (String) params.get("employmentStatus") : null;
        String roleId = params != null && params.get("roleId") != null ? String.valueOf(params.get("roleId")) : null;
        Boolean excludeFactoryUsers = params != null && params.get("excludeFactoryUsers") != null ? Boolean.valueOf(params.get("excludeFactoryUsers").toString()) : false;
        return Result.success(tenantOrchestrator.listSubAccounts(page, pageSize, name, roleName, orgUnitId, employmentStatus, roleId, excludeFactoryUsers));
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
     * 租户主账号修改自己的工厂名称/联系信息/IM Webhook（非超管专用，租户自主管理）
     */
    @PutMapping("/my/info")
    public Result<Boolean> updateMyTenantInfo(@RequestBody Map<String, String> params) {
        String tenantName = params.get("tenantName");
        String contactName = params.get("contactName");
        String contactPhone = params.get("contactPhone");
        String wechatWorkWebhookUrl = params.get("wechatWorkWebhookUrl");
        String feishuWebhookUrl = params.get("feishuWebhookUrl");
        String dingtalkWebhookUrl = params.get("dingtalkWebhookUrl");
        return Result.success(tenantOrchestrator.updateMyTenantInfo(
                tenantName, contactName, contactPhone,
                wechatWorkWebhookUrl, feishuWebhookUrl, dingtalkWebhookUrl));
    }

    // ========== 租户自助账单与发票 ==========

    /**
     * 租户查看自己的账单概览（套餐信息+最近账单+开票信息）
     */
    @GetMapping("/my/billing")
    public Result<Map<String, Object>> getMyBilling() {
        return Result.success(tenantOrchestrator.getMyBilling());
    }

    /**
     * 租户查看自己的账单列表
     */
    @PostMapping("/my/bills")
    public Result<Page<TenantBillingRecord>> listMyBills(@RequestBody Map<String, Object> params) {
        Long page = params.get("page") != null ? Long.parseLong(params.get("page").toString()) : 1L;
        Long pageSize = params.get("pageSize") != null ? Long.parseLong(params.get("pageSize").toString()) : 20L;
        String status = params.get("status") != null ? params.get("status").toString() : null;
        return Result.success(tenantOrchestrator.listMyBills(page, pageSize, status));
    }

    /**
     * 租户对已支付账单申请开票
     */
    @PostMapping("/my/bills/{billId}/request-invoice")
    public Result<Boolean> requestInvoice(@PathVariable Long billId,
                                          @RequestBody(required = false) Map<String, String> invoiceInfo) {
        return Result.success(tenantOrchestrator.requestInvoice(billId, invoiceInfo));
    }

    /**
     * 租户维护默认开票信息（发票抬头、税号、银行等）
     */
    @PutMapping("/my/invoice-info")
    public Result<Boolean> updateMyInvoiceInfo(@RequestBody Map<String, String> invoiceInfo) {
        return Result.success(tenantOrchestrator.updateMyInvoiceInfo(invoiceInfo));
    }

    /**
     * 超管确认开票（填写发票号码）
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/billing/{billId}/issue-invoice")
    public Result<Boolean> issueInvoice(@PathVariable Long billId,
                                        @RequestBody Map<String, String> params) {
        String invoiceNo = params.get("invoiceNo");
        return Result.success(tenantOrchestrator.issueInvoice(billId, invoiceNo));
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
        Integer trialDays = parseNullableInteger(params != null ? params.get("trialDays") : null, "trialDays");
        String enabledModules = params != null ? (String) params.get("enabledModules") : null;
        return Result.success(tenantOrchestrator.approveApplication(id, planType, trialDays, enabledModules));
    }

    private Integer parseNullableInteger(Object raw, String fieldName) {
        if (raw == null) {
            return null;
        }
        String value = raw.toString();
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        try {
            return Integer.valueOf(value.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(fieldName + " 格式错误");
        }
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
     * 获取待审批注册列表
     */
    @PostMapping("/registrations/pending")
    public Result<Page<User>> listPendingRegistrations(@RequestBody(required = false) Map<String, Object> params) {
        Long page = params != null && params.get("page") != null ? Long.valueOf(params.get("page").toString()) : 1L;
        Long pageSize = params != null && params.get("pageSize") != null ? Long.valueOf(params.get("pageSize").toString()) : 20L;
        return Result.success(tenantOrchestrator.listPendingRegistrations(page, pageSize));
    }

    @PostMapping("/registrations/factory-pending")
    public Result<Page<User>> listFactoryPendingRegistrations(@RequestBody(required = false) Map<String, Object> params) {
        Long page = params != null && params.get("page") != null ? Long.valueOf(params.get("page").toString()) : 1L;
        Long pageSize = params != null && params.get("pageSize") != null ? Long.valueOf(params.get("pageSize").toString()) : 20L;
        return Result.success(tenantOrchestrator.listFactoryPendingRegistrations(page, pageSize));
    }

    /**
     * 审批通过注册用户
     */
    @PostMapping("/registrations/{userId}/approve")
    public Result<Boolean> approveRegistration(@PathVariable Long userId,
                                                @RequestBody(required = false) Map<String, Object> params) {
        Long roleId = null;
        if (params != null && params.get("roleId") != null) {
            String roleStr = params.get("roleId").toString().trim();
            if (!roleStr.isEmpty()) {
                try { roleId = Long.valueOf(roleStr); }
                catch (NumberFormatException e) { log.warn("roleId格式非法: {}", roleStr); }
            }
        }
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

    /**
     * 超级管理员：立即清理全部权限缓存
     * 适用于云端无法直接执行 Redis CLI 时通过 API 触发
     * 清理范围：role:perms:* / user:perms:* / tenant:ceiling:*
     */
    @PostMapping("/admin/clear-permission-cache")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Map<String, Object>> clearPermissionCache() {
        if (redisService == null) {
            return Result.fail("Redis服务不可用");
        }
        long role = redisService.deleteByPattern("role:perms:*");
        long user = redisService.deleteByPattern("user:perms:*");
        long ceiling = redisService.deleteByPattern("tenant:ceiling:*");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rolePermKeys", role);
        result.put("userPermKeys", user);
        result.put("tenantCeilingKeys", ceiling);
        result.put("total", role + user + ceiling);
        log.info("[ClearPermCache] 超管触发权限缓存清理 — role={}, user={}, ceiling={}", role, user, ceiling);
        return Result.success(result);
    }

    /**
     * 超级管理员：向所有活跃租户广播系统通知（升级/维护/公告）
     * body: { "type": "upgrade", "title": "...", "content": "..." }
     */
    @PostMapping("/broadcast")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Map<String, Object>> broadcastToAllTenants(@RequestBody Map<String, String> body) {
        String type    = body.getOrDefault("type", "announcement");
        String title   = body.get("title");
        String content = body.get("content");
        if (title == null || title.isBlank()) {
            return Result.fail("公告标题不能为空");
        }
        if (content == null || content.isBlank()) {
            return Result.fail("公告内容不能为空");
        }
        int count = sysNoticeOrchestrator.broadcastGlobal(type, title, content);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sentCount", count);
        return Result.success(result);
    }

    /**
     * 测试 IM 通知连接（飞书/钉钉/企业微信）
     * POST /api/system/tenant/test-im-notify
     * body: { "type": "feishu"|"dingtalk"|"wechat", "webhookUrl": "https://..." }
     */
    @PostMapping("/test-im-notify")
    public Result<Map<String, Object>> testImNotify(@RequestBody Map<String, String> body) {
        String type = body.getOrDefault("type", "feishu");
        String webhookUrl = body.get("webhookUrl");

        if (webhookUrl == null || webhookUrl.isBlank()) {
            return Result.fail("Webhook URL 不能为空");
        }

        try {
            String testMsg = String.format("【云裳供应链】测试消息 — 连接成功！\n时间：%s",
                    java.time.LocalDateTime.now().toString().replace("T", " "));

            if ("dingtalk".equalsIgnoreCase(type)) {
                sendDingtalkTest(webhookUrl, testMsg);
            } else if ("wechat".equalsIgnoreCase(type)) {
                sendWechatTest(webhookUrl, testMsg);
            } else {
                sendFeishuTest(webhookUrl, testMsg);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            result.put("message", "测试消息已发送，请查看 IM 群");
            return Result.success(result);
        } catch (Exception e) {
            log.warn("[IM-Test] 测试连接失败 type={}: {}", type, e.getMessage());
            return Result.fail("连接失败：" + e.getMessage());
        }
    }

    private void sendFeishuTest(String url, String text) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msg_type", "text");
        Map<String, String> content = new LinkedHashMap<>();
        content.put("text", text);
        body.put("content", content);
        postJson(url, body);
    }

    private void sendDingtalkTest(String url, String text) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "text");
        Map<String, String> content = new LinkedHashMap<>();
        content.put("content", text);
        body.put("text", content);
        postJson(url, body);
    }

    private void sendWechatTest(String url, String text) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "text");
        Map<String, Object> textObj = new LinkedHashMap<>();
        textObj.put("content", text);
        body.put("text", textObj);
        postJson(url, body);
    }

    private void postJson(String url, Map<String, Object> body) {
        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        org.springframework.http.HttpEntity<Map<String, Object>> request =
                new org.springframework.http.HttpEntity<>(body, headers);
        new org.springframework.web.client.RestTemplate().postForEntity(url, request, String.class);
    }

    // ========== 租户AI能力配置 ==========

    @GetMapping("/{id}/ai-config")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Map<String, Object>> getTenantAiConfig(@PathVariable Long id) {
        if (tenantAiConfigService == null) return Result.fail("AI配置服务未启用");
        com.fashion.supplychain.intelligence.entity.TenantAiConfig config = tenantAiConfigService.getOrCreateConfig(id);
        TenantAiConfigService.ResolvedConfig resolved = tenantAiConfigService.resolveConfig(id);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("config", config);
        result.put("resolvedProvider", resolved.getProvider());
        result.put("resolvedSource", resolved.getConfigSource());
        return Result.success(result);
    }

    @PostMapping("/{id}/ai-config")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Map<String, Object>> setTenantAiConfig(@PathVariable Long id,
                                                          @RequestBody Map<String, Object> params) {
        if (tenantAiConfigService == null) return Result.fail("AI配置服务未启用");
        String action = params.get("action") != null ? params.get("action").toString() : "provision";
        if ("provision".equals(action)) {
            String apiKey = params.get("apiKey") != null ? params.get("apiKey").toString() : null;
            String model = params.get("model") != null ? params.get("model").toString() : null;
            if (apiKey == null || apiKey.isBlank()) return Result.fail("API Key不能为空");
            tenantAiConfigService.setPlatformProvisioned(id, apiKey, model);
        } else if ("reset".equals(action)) {
            com.fashion.supplychain.intelligence.entity.TenantAiConfig config = tenantAiConfigService.getOrCreateConfig(id);
            config.setConfigSource("platform");
            config.setTextApiKey(null);
            config.setTextProvider("mimo");
            config.setTextModel(null);
            config.setTextBaseUrl(null);
            config.setAiEnabled(1);
            if (tenantAiConfigMapper != null) tenantAiConfigMapper.updateById(config);
        } else {
            return Result.fail("未知操作: " + action);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("tenantId", id);
        return Result.success(result);
    }

    @PutMapping("/my/ai-config")
    public Result<Map<String, Object>> updateMyAiConfig(@RequestBody Map<String, Object> params) {
        if (tenantAiConfigService == null) return Result.fail("AI配置服务未启用");
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (tenantId == null) return Result.fail("无法获取租户信息");
        String textProvider = params.get("textProvider") != null ? params.get("textProvider").toString() : null;
        String textApiKey = params.get("textApiKey") != null ? params.get("textApiKey").toString() : null;
        String textBaseUrl = params.get("textBaseUrl") != null ? params.get("textBaseUrl").toString() : null;
        String textModel = params.get("textModel") != null ? params.get("textModel").toString() : null;
        Integer aiEnabled = params.get("aiEnabled") != null
                ? Integer.valueOf(params.get("aiEnabled").toString()) : null;
        tenantAiConfigService.updateConfig(tenantId, textProvider, textApiKey, textBaseUrl, textModel, aiEnabled);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        return Result.success(result);
    }

    @GetMapping("/my/ai-config")
    public Result<Map<String, Object>> getMyAiConfig() {
        if (tenantAiConfigService == null) return Result.fail("AI配置服务未启用");
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (tenantId == null) return Result.fail("无法获取租户信息");
        com.fashion.supplychain.intelligence.entity.TenantAiConfig config = tenantAiConfigService.getOrCreateConfig(tenantId);
        TenantAiConfigService.ResolvedConfig resolved = tenantAiConfigService.resolveConfig(tenantId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("config", config);
        result.put("resolvedProvider", resolved.getProvider());
        result.put("resolvedSource", resolved.getConfigSource());
        return Result.success(result);
    }
}
