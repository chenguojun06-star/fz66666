package com.fashion.supplychain.system.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.RoleService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Component
@Slf4j
public class TenantApplicationHelper {

    @Autowired private PasswordEncoder passwordEncoder;

    @Autowired private TenantService tenantService;
    @Autowired private UserService userService;
    @Autowired private RoleService roleService;
    @Autowired private TenantRoleInitHelper roleInitHelper;
    @Autowired private TenantSubscriptionGrantHelper subscriptionGrantHelper;

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> applyForTenant(String tenantName, String contactName,
                                               String contactPhone, String applyUsername,
                                               String applyPassword,
                                               Map<String, Map<String, Object>> planDefinitions) {
        if (!StringUtils.hasText(tenantName)) throw new IllegalArgumentException("工厂名称不能为空");
        if (!StringUtils.hasText(applyUsername)) throw new IllegalArgumentException("申请账号不能为空");
        if (!StringUtils.hasText(applyPassword) || applyPassword.length() < 6)
            throw new IllegalArgumentException("密码长度不能少于6位");

        QueryWrapper<User> userQ = new QueryWrapper<>();
        userQ.eq("username", applyUsername);
        if (userService.count(userQ) > 0) throw new IllegalArgumentException("账号名已被使用: " + applyUsername);
        QueryWrapper<Tenant> tenantQ = new QueryWrapper<>();
        tenantQ.eq("apply_username", applyUsername).in("status", "pending_review");
        if (tenantService.count(tenantQ) > 0) throw new IllegalArgumentException("该账号名已有待审核申请: " + applyUsername);

        Tenant tenant = new Tenant();
        tenant.setTenantName(tenantName);
        tenant.setTenantCode("PENDING_" + System.currentTimeMillis());
        tenant.setContactName(contactName);
        tenant.setContactPhone(contactPhone);
        tenant.setApplyUsername(applyUsername);
        tenant.setApplyPassword(passwordEncoder.encode(applyPassword));
        tenant.setStatus("pending_review");
        tenant.setPaidStatus("TRIAL");
        tenant.setMaxUsers((Integer) planDefinitions.get("TRIAL").get("maxUsers"));
        tenant.setCreateTime(LocalDateTime.now());
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.save(tenant);

        log.info("[申请入驻] 工厂={} 申请账号={} 已提交，等待超管审批", tenantName, applyUsername);
        log.info("[入驻通知] 工厂={}（全局广播已移除）", tenantName);

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "申请已提交，请等待管理员审核通过后使用账号登录");
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> approveApplication(Long tenantId, String planType, Integer trialDays,
                                                    String enabledModules,
                                                    java.util.function.BiConsumer<Tenant, String> planSettingsApplier) {
        assertSuperAdmin();
        Tenant current = tenantService.getById(tenantId);
        if (current == null) {
            throw new IllegalArgumentException("租户申请不存在");
        }

        Map<String, Object> result;
        if ("pending_review".equals(current.getStatus())) {
            result = doApproveApplication(tenantId);
        } else if ("active".equals(current.getStatus()) || "inactive".equals(current.getStatus()) || "disabled".equals(current.getStatus())) {
            result = new HashMap<>();
            result.put("tenant", current);
            result.put("ownerUsername", current.getOwnerUsername());
        } else {
            throw new IllegalStateException("该申请不是待审核状态");
        }

        Tenant tenant = tenantService.getById(tenantId);
        if (tenant != null) {
            planSettingsApplier.accept(tenant, planType);
            if ("TRIAL".equals(planType)) {
                tenant.setPaidStatus("TRIAL");
                if (trialDays != null && trialDays > 0) {
                    tenant.setExpireTime(LocalDateTime.now().plusDays(trialDays));
                } else if (trialDays == null) {
                    tenant.setExpireTime(LocalDateTime.now().plusDays(30));
                }
            } else {
                tenant.setPaidStatus("PAID");
                tenant.setBillingCycle("MONTHLY");
                tenant.setExpireTime(LocalDateTime.now().plusMonths(1));
            }
            if (enabledModules != null && !enabledModules.isBlank()) {
                tenant.setEnabledModules(enabledModules);
            }
            tenant.setUpdateTime(LocalDateTime.now());
            tenantService.updateById(tenant);
            log.info("[审批套餐] tenantId={} 套餐={} 试用天数={} 模块白名单={}", tenantId, planType, trialDays,
                    enabledModules != null ? "已设置" : "全部开放");
        }

        return result;
    }

    private Map<String, Object> doApproveApplication(Long tenantId) {
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户申请不存在");
        if (!"pending_review".equals(tenant.getStatus())) throw new IllegalStateException("该申请不是待审核状态");
        if (!StringUtils.hasText(tenant.getApplyUsername())) throw new IllegalStateException("申请账号信息缺失");
        if (!StringUtils.hasText(tenant.getApplyPassword())) throw new IllegalStateException("申请密码信息缺失，请联系工厂重新提交申请");

        String finalUsername = resolveUniqueUsername(tenant.getApplyUsername());

        String tenantCode = "T" + String.format("%04d", tenantId);

        Role tenantAdminRole = roleInitHelper.initializeAllTenantRoles(tenant.getId(), tenant.getTenantName(), "HYBRID");
        if (tenantAdminRole == null || tenantAdminRole.getId() == null) {
            throw new IllegalStateException("租户管理员角色创建失败，请检查 full_admin 角色模板是否存在");
        }

        User owner = new User();
        owner.setUsername(finalUsername);
        owner.setPassword(tenant.getApplyPassword());
        owner.setName(StringUtils.hasText(tenant.getContactName()) ? tenant.getContactName() : finalUsername);
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

        String activateUsername = !finalUsername.equals(tenant.getApplyUsername()) ? finalUsername : tenant.getApplyUsername();
        if (!finalUsername.equals(tenant.getApplyUsername())) {
            log.info("[用户名冲突自动解决] 原始={} → 最终={}", tenant.getApplyUsername(), finalUsername);
        }
        LambdaUpdateWrapper<Tenant> activateUw = new LambdaUpdateWrapper<>();
        activateUw.eq(Tenant::getId, tenant.getId())
                  .set(Tenant::getTenantCode, tenantCode)
                  .set(Tenant::getOwnerUserId, owner.getId())
                  .set(Tenant::getStatus, "active")
                  .set(Tenant::getApplyPassword, null)
                  .set(Tenant::getApplyUsername, activateUsername)
                  .set(Tenant::getUpdateTime, LocalDateTime.now());
        tenantService.update(activateUw);
        tenant.setTenantCode(tenantCode);
        tenant.setOwnerUserId(owner.getId());
        tenant.setStatus("active");
        tenant.setApplyUsername(activateUsername);

        log.info("[申请通过] tenantId={} 工厂={} 账号={} 已激活", tenantId, tenant.getTenantName(), finalUsername);

        subscriptionGrantHelper.autoGrantFinanceTaxFreebie(tenant.getId(), tenant.getTenantName());

        Map<String, Object> result = new HashMap<>();
        result.put("tenant", tenant);
        result.put("ownerUsername", finalUsername);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateApplication(Long tenantId, Map<String, String> params) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户申请不存在");
        if (!"pending_review".equals(tenant.getStatus())) throw new IllegalStateException("仅待审核状态可修改");

        String newUsername = params.get("applyUsername");
        if (StringUtils.hasText(newUsername)) {
            QueryWrapper<User> userCheck = new QueryWrapper<>();
            userCheck.eq("username", newUsername);
            if (userService.count(userCheck) > 0) {
                throw new IllegalArgumentException("账号「" + newUsername + "」已存在，请使用其他账号");
            }
            tenant.setApplyUsername(newUsername.trim());
        }
        String contactName = params.get("contactName");
        if (StringUtils.hasText(contactName)) {
            tenant.setContactName(contactName.trim());
        }
        String contactPhone = params.get("contactPhone");
        if (StringUtils.hasText(contactPhone)) {
            tenant.setContactPhone(contactPhone.trim());
        }
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.updateById(tenant);
        log.info("[申请信息修改] tenantId={} 工厂={}", tenantId, tenant.getTenantName());
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean rejectApplication(Long tenantId, String reason) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户申请不存在");
        if (!"pending_review".equals(tenant.getStatus())) throw new IllegalStateException("该申请不是待审核状态");

        LambdaUpdateWrapper<Tenant> rejectUw = new LambdaUpdateWrapper<>();
        rejectUw.eq(Tenant::getId, tenant.getId())
                .set(Tenant::getStatus, "rejected")
                .set(Tenant::getRemark, "拒绝原因: " + (StringUtils.hasText(reason) ? reason : "无"))
                .set(Tenant::getApplyPassword, null)
                .set(Tenant::getUpdateTime, LocalDateTime.now());
        tenantService.update(rejectUw);
        log.info("[申请拒绝] tenantId={} 工厂={} 原因={}", tenantId, tenant.getTenantName(), reason);
        return true;
    }

    private String resolveUniqueUsername(String baseUsername) {
        QueryWrapper<User> check = new QueryWrapper<>();
        check.eq("username", baseUsername);
        if (userService.count(check) == 0) {
            return baseUsername;
        }
        for (int i = 2; i <= 100; i++) {
            String candidate = baseUsername + "_" + i;
            QueryWrapper<User> q = new QueryWrapper<>();
            q.eq("username", candidate);
            if (userService.count(q) == 0) {
                return candidate;
            }
        }
        throw new IllegalStateException("无法为账号「" + baseUsername + "」生成唯一用户名，请手动修改申请信息");
    }

    private void assertSuperAdmin() {
        if (!UserContext.isSuperAdmin()) {
            throw new AccessDeniedException("仅超级管理员可执行此操作");
        }
    }
}
