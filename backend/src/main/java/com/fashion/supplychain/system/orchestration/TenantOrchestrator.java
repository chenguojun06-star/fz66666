package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.*;
import com.fashion.supplychain.system.service.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import com.fashion.supplychain.system.helper.TenantBillingHelper;
import com.fashion.supplychain.system.helper.TenantRoleInitHelper;
import com.fashion.supplychain.system.helper.TenantApplicationHelper;
import com.fashion.supplychain.system.helper.TenantSubAccountHelper;
import com.fashion.supplychain.system.helper.TenantSubscriptionGrantHelper;

@Service
@Slf4j
public class TenantOrchestrator {

    @Autowired private TenantService tenantService;
    @Autowired private UserService userService;
    @Autowired private RoleService roleService;
    @Autowired private RolePermissionService rolePermissionService;
    @Autowired private TenantPermissionCeilingService ceilingService;
    @Autowired private TenantBillingRecordService billingRecordService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private TenantBillingHelper billingHelper;
    @Autowired private TenantRoleInitHelper roleInitHelper;
    @Autowired private TenantApplicationHelper applicationHelper;
    @Autowired private TenantSubAccountHelper subAccountHelper;
    @Autowired private TenantSubscriptionGrantHelper subscriptionGrantHelper;

    public static final Map<String, Map<String, Object>> PLAN_DEFINITIONS;
    static {
        Map<String, Map<String, Object>> plans = new LinkedHashMap<>();
        plans.put("TRIAL",      Map.of("label", "免费试用", "monthlyFee", BigDecimal.ZERO,          "yearlyFee", BigDecimal.ZERO,          "storageQuotaMb", 1024L,    "maxUsers", 5));
        plans.put("BASIC",      Map.of("label", "基础版",   "monthlyFee", new BigDecimal("199"),    "yearlyFee", new BigDecimal("1990"),    "storageQuotaMb", 5120L,    "maxUsers", 20));
        plans.put("PRO",        Map.of("label", "专业版",   "monthlyFee", new BigDecimal("499"),    "yearlyFee", new BigDecimal("4990"),    "storageQuotaMb", 20480L,   "maxUsers", 50));
        plans.put("ENTERPRISE", Map.of("label", "企业版",   "monthlyFee", new BigDecimal("999"),    "yearlyFee", new BigDecimal("9990"),    "storageQuotaMb", 102400L,  "maxUsers", 200));
        PLAN_DEFINITIONS = Collections.unmodifiableMap(plans);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createTenant(String tenantName, String tenantCode,
                                             String contactName, String contactPhone,
                                             String ownerUsername, String ownerPassword,
                                             String ownerName, Integer maxUsers,
                                             String planType, String tenantType) {
        assertSuperAdmin();
        return doCreateTenant(tenantName, tenantCode, contactName, contactPhone,
                              ownerUsername, ownerPassword, ownerName, maxUsers, planType, tenantType);
    }

    private Map<String, Object> doCreateTenant(String tenantName, String tenantCode,
                                                String contactName, String contactPhone,
                                                String ownerUsername, String ownerPassword,
                                                String ownerName, Integer maxUsers,
                                                String planType, String tenantType) {
        if (tenantService.findByTenantCode(tenantCode) != null)
            throw new IllegalArgumentException("租户编码已存在: " + tenantCode);
        QueryWrapper<User> userQuery = new QueryWrapper<>();
        userQuery.eq("username", ownerUsername);
        if (userService.count(userQuery) > 0)
            throw new IllegalArgumentException("用户名已存在: " + ownerUsername);

        Tenant tenant = new Tenant();
        tenant.setTenantName(tenantName);
        tenant.setTenantCode(tenantCode);
        tenant.setContactName(contactName);
        tenant.setContactPhone(contactPhone);
        tenant.setStatus("active");
        applyPlanSettings(tenant, planType, maxUsers, true);
        tenant.setTenantType(tenantType != null && !tenantType.isBlank() ? tenantType : "HYBRID");
        tenant.setCreateTime(LocalDateTime.now());
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.save(tenant);

        Role tenantAdminRole = roleInitHelper.initializeAllTenantRoles(tenant.getId(), tenantName, tenant.getTenantType());
        if (tenantAdminRole == null || tenantAdminRole.getId() == null)
            throw new IllegalStateException("[数据完整性] 租户管理员角色创建失败: " + tenantCode);

        User owner = new User();
        owner.setUsername(ownerUsername);
        owner.setPassword(passwordEncoder.encode(ownerPassword));
        owner.setName(StringUtils.hasText(ownerName) ? ownerName : contactName);
        owner.setTenantId(tenant.getId());
        owner.setIsTenantOwner(true);
        owner.setRoleId(tenantAdminRole.getId());
        owner.setRoleName(tenantAdminRole.getRoleName());
        owner.setPermissionRange("all");
        owner.setStatus("active");
        owner.setApprovalStatus("approved");
        owner.setCreateTime(LocalDateTime.now());
        owner.setUpdateTime(LocalDateTime.now());
        userService.save(owner);

        tenant.setOwnerUserId(owner.getId());
        tenantService.updateById(tenant);
        subscriptionGrantHelper.autoGrantFinanceTaxFreebie(tenant.getId(), tenantName);

        if (owner.getId() == null || owner.getRoleId() == null || owner.getTenantId() == null)
            throw new IllegalStateException("[数据完整性] 租户主账号创建后数据异常");

        Map<String, Object> result = new HashMap<>();
        result.put("tenant", tenant);
        result.put("owner", sanitizeUser(owner));
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> applyForTenant(String tenantName, String contactName,
                                               String contactPhone, String applyUsername, String applyPassword) {
        return applicationHelper.applyForTenant(tenantName, contactName, contactPhone, applyUsername, applyPassword, PLAN_DEFINITIONS);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean deleteTenant(Long tenantId) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户不存在");
        String status = tenant.getStatus();
        if ("active".equals(status) || "inactive".equals(status) || "disabled".equals(status)) {
            QueryWrapper<User> userQuery = new QueryWrapper<>(); userQuery.eq("tenant_id", tenantId); userService.remove(userQuery);
            QueryWrapper<Role> roleQuery = new QueryWrapper<>(); roleQuery.eq("tenant_id", tenantId);
            List<Role> roles = roleService.list(roleQuery);
            for (Role role : roles) { QueryWrapper<RolePermission> rpQuery = new QueryWrapper<>(); rpQuery.eq("role_id", role.getId()); rolePermissionService.remove(rpQuery); }
            roleService.remove(roleQuery);
            QueryWrapper<TenantPermissionCeiling> ceilQuery = new QueryWrapper<>(); ceilQuery.eq("tenant_id", tenantId); ceilingService.remove(ceilQuery);
            QueryWrapper<TenantBillingRecord> billQuery = new QueryWrapper<>(); billQuery.eq("tenant_id", tenantId); billingRecordService.remove(billQuery);
        }
        tenantService.removeById(tenantId);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> approveApplication(Long tenantId, String planType, Integer trialDays, String enabledModules) {
        String normalizedPlan = normalizePlanType(planType);
        return applicationHelper.approveApplication(tenantId, normalizedPlan, trialDays, enabledModules,
                (tenant, pt) -> applyPlanSettings(tenant, pt, null, false));
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateApplication(Long tenantId, Map<String, String> params) { return applicationHelper.updateApplication(tenantId, params); }

    @Transactional(rollbackFor = Exception.class)
    public boolean rejectApplication(Long tenantId, String reason) { return applicationHelper.rejectApplication(tenantId, reason); }

    public boolean markTenantPaid(Long tenantId, String paidStatus) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户不存在");
        tenant.setPaidStatus("PAID".equals(paidStatus) ? "PAID" : "TRIAL");
        tenant.setUpdateTime(LocalDateTime.now());
        return tenantService.updateById(tenant);
    }

    public List<Map<String, Object>> getPlanDefinitions() { return billingHelper.getPlanDefinitions(); }
    @Transactional(rollbackFor = Exception.class)
    public Tenant updateTenantPlan(Long tenantId, String planType, BigDecimal customFee, Long billingCycleMonths, Integer maxUsers, String tenantType) { return billingHelper.updateTenantPlan(tenantId, planType, customFee, billingCycleMonths, maxUsers, tenantType); }
    public void updateStorageUsed(Long tenantId, Long usedBytes) { billingHelper.updateStorageUsed(tenantId, usedBytes); }
    public Map<String, Object> getTenantBillingOverview(Long tenantId) { return billingHelper.getTenantBillingOverview(tenantId); }
    @Transactional(rollbackFor = Exception.class)
    public TenantBillingRecord generateMonthlyBill(Long tenantId, String billingPeriod) { return billingHelper.generateMonthlyBill(tenantId, billingPeriod); }
    public Page<TenantBillingRecord> listBillingRecords(Long tenantId, Long page, Long pageSize, String billingPeriod) { return billingHelper.listBillingRecords(tenantId, page, pageSize, billingPeriod); }
    @Transactional(rollbackFor = Exception.class)
    public boolean markBillPaid(Long billId) { return billingHelper.markBillPaid(billId); }
    @Transactional(rollbackFor = Exception.class)
    public boolean waiveBill(Long billId, String reason) { return billingHelper.waiveBill(billId, reason); }
    public Map<String, Object> getMyBilling() { return billingHelper.getMyBilling(); }
    public Page<TenantBillingRecord> listMyBills(Long page, Long pageSize, String billingPeriod) { return billingHelper.listMyBills(page, pageSize, billingPeriod); }
    @Transactional(rollbackFor = Exception.class)
    public boolean requestInvoice(Long billId, Map<String, String> invoiceInfo) { return billingHelper.requestInvoice(billId, invoiceInfo); }
    @Transactional(rollbackFor = Exception.class)
    public boolean issueInvoice(Long invoiceId, String invoiceNo) { return billingHelper.issueInvoice(invoiceId, invoiceNo); }
    @Transactional(rollbackFor = Exception.class)
    public boolean updateMyInvoiceInfo(Map<String, String> invoiceInfo) { return billingHelper.updateMyInvoiceInfo(invoiceInfo); }

    public List<Role> listRoleTemplates() { return roleInitHelper.listRoleTemplates(); }
    @Transactional(rollbackFor = Exception.class)
    public Role cloneRoleTemplate(Long templateId, Long tenantId) { return roleInitHelper.cloneRoleTemplate(tenantId, templateId); }
    public List<Role> listTenantRoles(Long tenantId) { return roleInitHelper.listTenantRoles(tenantId); }
    @Transactional(rollbackFor = Exception.class)
    public boolean updateTenantRolePermissions(Long roleId, List<Long> permissionIds) { roleInitHelper.updateTenantRolePermissions(roleId, permissionIds); return true; }
    public Map<String, Object> getTenantCeiling(Long tenantId) { return roleInitHelper.getTenantCeiling(tenantId); }
    @Transactional(rollbackFor = Exception.class)
    public boolean setTenantCeiling(Long tenantId, List<Long> permissionIds) { roleInitHelper.setTenantCeiling(tenantId, permissionIds); return true; }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> workerRegister(String username, String password, String name, String phone, String tenantCode, String factoryId, String orgUnitId) { return roleInitHelper.workerRegister(username, password, name, phone, tenantCode, factoryId, orgUnitId); }
    public Page<User> listPendingRegistrations(Long page, Long pageSize) { return roleInitHelper.listPendingRegistrations(page, pageSize); }
    public Page<User> listFactoryPendingRegistrations(Long page, Long pageSize) { return roleInitHelper.listFactoryPendingRegistrations(page, pageSize); }
    @Transactional(rollbackFor = Exception.class)
    public boolean approveRegistration(Long userId, Long factoryId) { return roleInitHelper.approveRegistration(userId, factoryId); }
    @Transactional(rollbackFor = Exception.class)
    public boolean rejectRegistration(Long userId, String reason) { return roleInitHelper.rejectRegistration(userId, reason); }
    public Map<String, Object> getUserPermissionOverrides(Long userId) { return roleInitHelper.getUserPermissionOverrides(userId); }
    @Transactional(rollbackFor = Exception.class)
    public boolean setUserPermissionOverrides(Long userId, List<Long> grantIds, List<Long> revokeIds) { roleInitHelper.setUserPermissionOverrides(userId, grantIds, revokeIds); return true; }

    public List<Tenant> listActiveTenants() { return tenantService.list(new QueryWrapper<Tenant>().eq("status", "active").orderByDesc("create_time")); }
    public Page<Tenant> listTenants(Long page, Long pageSize, String keyword, String status) { return doListTenants(page, pageSize, keyword, status); }
    private Page<Tenant> doListTenants(Long page, Long pageSize, String keyword, String status) {
        QueryWrapper<Tenant> query = new QueryWrapper<>();
        if (StringUtils.hasText(keyword)) query.and(w -> w.like("tenant_name", keyword).or().like("tenant_code", keyword).or().like("contact_name", keyword));
        if (StringUtils.hasText(status)) query.eq("status", status);
        query.orderByDesc("create_time");
        Page<Tenant> result = tenantService.page(new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
        if (result.getRecords() != null) {
            java.util.Set<Long> ownerIds = new java.util.HashSet<>();
            for (Tenant t : result.getRecords()) { if (t.getOwnerUserId() != null) ownerIds.add(t.getOwnerUserId()); }
            if (!ownerIds.isEmpty()) {
                java.util.Map<Long, User> ownerMap = userService.listByIds(ownerIds).stream()
                        .collect(java.util.stream.Collectors.toMap(User::getId, u -> u, (a, b) -> a));
                for (Tenant t : result.getRecords()) {
                    if (t.getOwnerUserId() != null) {
                        User owner = ownerMap.get(t.getOwnerUserId());
                        if (owner != null) t.setOwnerUsername(owner.getUsername());
                    }
                }
            }
            java.util.List<Tenant> missingOwner = result.getRecords().stream()
                    .filter(t -> t.getOwnerUserId() == null && "active".equals(t.getStatus()))
                    .toList();
            if (!missingOwner.isEmpty()) {
                java.util.Set<Long> tenantIds = missingOwner.stream().map(Tenant::getId).collect(java.util.stream.Collectors.toSet());
                QueryWrapper<User> ownerFallback = new QueryWrapper<>();
                ownerFallback.in("tenant_id", tenantIds).eq("is_tenant_owner", true);
                java.util.Map<Long, User> tenantOwnerMap = userService.list(ownerFallback).stream()
                        .collect(java.util.stream.Collectors.toMap(User::getTenantId, u -> u, (a, b) -> a));
                for (Tenant t : missingOwner) {
                    User owner = tenantOwnerMap.get(t.getId());
                    if (owner != null) {
                        t.setOwnerUserId(owner.getId());
                        t.setOwnerUsername(owner.getUsername());
                        try {
                            Tenant update = new Tenant();
                            update.setId(t.getId());
                            update.setOwnerUserId(owner.getId());
                            update.setUpdateTime(LocalDateTime.now());
                            tenantService.updateById(update);
                            log.info("[doListTenants] 修复 ownerUserId: tenantId={}, ownerUserId={}", t.getId(), owner.getId());
                        } catch (Exception e) {
                            log.warn("[doListTenants] 修复 ownerUserId 失败: tenantId={}", t.getId(), e);
                        }
                    }
                }
            }
        }
        return result;
    }
    public boolean updateTenant(Tenant tenant) { assertSuperAdmin(); tenant.setUpdateTime(LocalDateTime.now()); return tenantService.updateById(tenant); }
    @Transactional(rollbackFor = Exception.class)
    public Tenant updateTenantEnabledModules(Long tenantId, String enabledModules) { assertSuperAdmin(); Tenant tenant = tenantService.getById(tenantId); if (tenant == null) throw new IllegalArgumentException("租户不存在"); tenant.setEnabledModules(enabledModules); tenant.setUpdateTime(LocalDateTime.now()); tenantService.updateById(tenant); return tenant; }
    @Transactional(rollbackFor = Exception.class)
    public boolean toggleTenantStatus(Long tenantId, String status) { assertSuperAdmin(); Tenant tenant = tenantService.getById(tenantId); if (tenant == null) throw new IllegalArgumentException("租户不存在"); tenant.setStatus(status); tenant.setUpdateTime(LocalDateTime.now()); return tenantService.updateById(tenant); }

    @Transactional(rollbackFor = Exception.class)
    public User addSubAccount(User userData) { return subAccountHelper.addSubAccount(userData); }
    public Page<User> listSubAccounts(Long page, Long pageSize, String name, String roleName) { return subAccountHelper.listSubAccounts(page, pageSize, name, roleName); }
    public boolean updateSubAccount(User userData) { return subAccountHelper.updateSubAccount(userData); }
    public boolean deleteSubAccount(Long userId) { return subAccountHelper.deleteSubAccount(userId); }

    public Map<String, Object> myTenant() {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> result = new HashMap<>();
        if (tenantId == null) { result.put("isSuperAdmin", true); result.put("tenant", null); }
        else { Tenant tenant = tenantService.getById(tenantId); result.put("isSuperAdmin", false); result.put("tenant", tenant); result.put("isTenantOwner", UserContext.isTenantOwner()); result.put("currentUsers", tenantService.countTenantUsers(tenantId)); result.put("maxUsers", tenant != null ? tenant.getMaxUsers() : 0); result.put("tenantCode", tenant != null ? tenant.getTenantCode() : null); result.put("tenantName", tenant != null ? tenant.getTenantName() : null); result.put("contactName", tenant != null ? tenant.getContactName() : null); result.put("contactPhone", tenant != null ? tenant.getContactPhone() : null); }
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateMyTenantInfo(String tenantName, String contactName, String contactPhone, String wechatWorkWebhookUrl) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) throw new AccessDeniedException("超级管理员无需设置工厂信息");
        if (!UserContext.isTenantOwner() && !UserContext.isTopAdmin()) throw new AccessDeniedException("只有工厂主账号或管理员才能修改工厂信息");
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户不存在");
        if (StringUtils.hasText(tenantName)) tenant.setTenantName(tenantName.trim());
        if (contactName != null) tenant.setContactName(contactName.trim());
        if (contactPhone != null) tenant.setContactPhone(contactPhone.trim());
        if (wechatWorkWebhookUrl != null) tenant.setWechatWorkWebhookUrl(wechatWorkWebhookUrl.trim());
        tenant.setUpdateTime(LocalDateTime.now());
        return tenantService.updateById(tenant);
    }

    private String normalizePlanType(String planType) { return StringUtils.hasText(planType) && PLAN_DEFINITIONS.containsKey(planType) ? planType : "TRIAL"; }

    private void applyPlanSettings(Tenant tenant, String planType, Integer maxUsersOverride, boolean initializeExpireTime) {
        String normalizedPlan = normalizePlanType(planType);
        Map<String, Object> planDef = PLAN_DEFINITIONS.get(normalizedPlan);
        tenant.setPlanType(normalizedPlan);
        tenant.setMonthlyFee((BigDecimal) planDef.get("monthlyFee"));
        tenant.setStorageQuotaMb((Long) planDef.get("storageQuotaMb"));
        tenant.setMaxUsers(maxUsersOverride != null ? maxUsersOverride : (Integer) planDef.get("maxUsers"));
        tenant.setBillingCycle("MONTHLY");
        if ("TRIAL".equals(normalizedPlan)) {
            tenant.setPaidStatus("TRIAL");
            if (initializeExpireTime) tenant.setExpireTime(LocalDateTime.now().plusDays(30));
        } else {
            tenant.setPaidStatus("PAID");
            if (initializeExpireTime) tenant.setExpireTime(LocalDateTime.now().plusMonths(1));
            tenant.setEnabledModules(null);
        }
    }

    private void assertSuperAdmin() { if (!UserContext.isSuperAdmin()) throw new AccessDeniedException("仅超级管理员可执行此操作"); }
    private User sanitizeUser(User user) { if (user != null) { user.setPassword(null); } return user; }
}
