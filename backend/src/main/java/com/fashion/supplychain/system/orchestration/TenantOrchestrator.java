package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import org.springframework.jdbc.core.JdbcTemplate;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.*;
import com.fashion.supplychain.system.service.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import com.fashion.supplychain.system.helper.TenantBillingHelper;
import com.fashion.supplychain.system.helper.TenantRoleInitHelper;

/**
 * 租户管理编排器
 *
 * 核心职责：
 * 1. 创建租户（超级管理员操作）
 * 2. 租户主账号管理子账号（同租户内CRUD）
 * 3. 租户信息查询和更新
 *
 * 权限层级：
 * - 超级管理员（tenantId=null）：管理所有租户，创建/禁用/删除租户
 * - 租户主账号（isTenantOwner=true）：管理本租户内的子账号
 * - 子账号：无管理权限，只能操作自己的业务数据
 */
@Service
@Slf4j
public class TenantOrchestrator {

    @Autowired
    private TenantService tenantService;

    @Autowired
    private UserService userService;

    @Autowired
    private RoleService roleService;

    @Autowired
    private RolePermissionService rolePermissionService;

    @Autowired
    private TenantPermissionCeilingService ceilingService;

    @Autowired
    private TenantBillingRecordService billingRecordService;

    @Autowired
    private TenantSubscriptionService tenantSubscriptionService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Autowired
    private TenantBillingHelper billingHelper;

    @Autowired
    private TenantRoleInitHelper roleInitHelper;

    // ========== 套餐定义常量 ==========
    // yearlyFee = monthlyFee × 10（年付打8.3折，等于买10个月送2个月）
    public static final Map<String, Map<String, Object>> PLAN_DEFINITIONS;
    static {
        Map<String, Map<String, Object>> plans = new LinkedHashMap<>();
        plans.put("TRIAL",      Map.of("label", "免费试用", "monthlyFee", BigDecimal.ZERO,          "yearlyFee", BigDecimal.ZERO,          "storageQuotaMb", 1024L,    "maxUsers", 5));
        plans.put("BASIC",      Map.of("label", "基础版",   "monthlyFee", new BigDecimal("199"),    "yearlyFee", new BigDecimal("1990"),    "storageQuotaMb", 5120L,    "maxUsers", 20));
        plans.put("PRO",        Map.of("label", "专业版",   "monthlyFee", new BigDecimal("499"),    "yearlyFee", new BigDecimal("4990"),    "storageQuotaMb", 20480L,   "maxUsers", 50));
        plans.put("ENTERPRISE", Map.of("label", "企业版",   "monthlyFee", new BigDecimal("999"),    "yearlyFee", new BigDecimal("9990"),    "storageQuotaMb", 102400L,  "maxUsers", 200));
        PLAN_DEFINITIONS = Collections.unmodifiableMap(plans);
    }

    // ========== 超级管理员操作 ==========

    /**
     * 创建新租户（超级管理员专用）
     * 同时创建租户主账号
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createTenant(String tenantName, String tenantCode,
                                             String contactName, String contactPhone,
                                             String ownerUsername, String ownerPassword,
                                             String ownerName, Integer maxUsers,
                                             String planType,
                                             String tenantType) {
        assertSuperAdmin();
        // TenantInterceptor 已通过 SUPERADMIN_MANAGED_TABLES 精确放行 t_user/t_role
        return doCreateTenant(tenantName, tenantCode, contactName, contactPhone,
                              ownerUsername, ownerPassword, ownerName, maxUsers, planType, tenantType);
    }

    private Map<String, Object> doCreateTenant(String tenantName, String tenantCode,
                                                String contactName, String contactPhone,
                                                String ownerUsername, String ownerPassword,
                                                String ownerName, Integer maxUsers,
                                                String planType,
                                                String tenantType) {
        // 验证租户编码唯一
        if (tenantService.findByTenantCode(tenantCode) != null) {
            throw new IllegalArgumentException("租户编码已存在: " + tenantCode);
        }

        // 验证用户名唯一
        QueryWrapper<User> userQuery = new QueryWrapper<>();
        userQuery.eq("username", ownerUsername);
        if (userService.count(userQuery) > 0) {
            throw new IllegalArgumentException("用户名已存在: " + ownerUsername);
        }

        // 1. 创建租户记录
        Tenant tenant = new Tenant();
        tenant.setTenantName(tenantName);
        tenant.setTenantCode(tenantCode);
        tenant.setContactName(contactName);
        tenant.setContactPhone(contactPhone);
        tenant.setStatus("active");
        applyPlanSettings(tenant, planType, maxUsers, true);
        // 租户类型：决定初始权限包范围
        tenant.setTenantType(tenantType != null && !tenantType.isBlank() ? tenantType : "HYBRID");
        tenant.setCreateTime(LocalDateTime.now());
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.save(tenant);

        // 2. 为新租户初始化全套职位角色（克隆所有模板）—— 必须成功，失败则整体回滚
        Role tenantAdminRole = roleInitHelper.initializeAllTenantRoles(tenant.getId(), tenantName, tenant.getTenantType());
        // 强制校验：管理员角色必须存在且有效
        if (tenantAdminRole == null || tenantAdminRole.getId() == null) {
            throw new IllegalStateException("[数据完整性] 租户管理员角色创建失败，无法继续创建租户: " + tenantCode);
        }
        log.info("租户 {} 管理员角色已就绪: roleId={}, roleName={}, tenantType={}",
                 tenantCode, tenantAdminRole.getId(), tenantAdminRole.getRoleName(), tenant.getTenantType());

        // 3. 创建租户主账号（超级管理员）
        User owner = new User();
        owner.setUsername(ownerUsername);
        owner.setPassword(passwordEncoder.encode(ownerPassword));
        owner.setName(StringUtils.hasText(ownerName) ? ownerName : contactName);
        owner.setTenantId(tenant.getId());
        owner.setIsTenantOwner(true);
        // 主账号强制分配租户管理员角色（不允许 null）
        owner.setRoleId(tenantAdminRole.getId());
        owner.setRoleName(tenantAdminRole.getRoleName());
        owner.setPermissionRange("all");
        owner.setStatus("active");
        owner.setApprovalStatus("approved");
        owner.setCreateTime(LocalDateTime.now());
        owner.setUpdateTime(LocalDateTime.now());
        userService.save(owner);

        // 4. 回填租户的 ownerUserId
        tenant.setOwnerUserId(owner.getId());
        tenantService.updateById(tenant);

        // 5. 新开户赠送：自动激活财税导出模块（1年免费）
        autoGrantFinanceTaxFreebie(tenant.getId(), tenantName);

        // 6. 最终数据完整性校验 —— 以刚保存对象为主，避免超管上下文下 getById 被租户拦截误判
        if (owner.getId() == null || owner.getRoleId() == null || owner.getTenantId() == null) {
            throw new IllegalStateException("[数据完整性] 租户主账号创建后数据异常: " +
                    "ownerId=" + owner.getId() +
                    ", roleId=" + owner.getRoleId() +
                    ", tenantId=" + owner.getTenantId());
        }

        User savedOwner = userService.getById(owner.getId());
        if (savedOwner == null) {
            log.warn("[租户创建校验降级] ownerId={} 在当前上下文下查询为空，按已保存对象判定通过（可能受租户拦截影响）", owner.getId());
            savedOwner = owner;
        }
        log.info("[租户创建完成] tenant={}, code={}, owner={}, roleId={}, roleName={}, tenantId={}",
                 tenantName, tenantCode, ownerUsername,
                 savedOwner.getRoleId(), savedOwner.getRoleName(), savedOwner.getTenantId());

        Map<String, Object> result = new HashMap<>();
        result.put("tenant", tenant);
        result.put("owner", sanitizeUser(owner));
        return result;
    }

    /**
     * 工厂自助申请入驻（无需登录，开放接口）
     * 创建 pending_review 状态的租户记录，等待超管审批
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> applyForTenant(String tenantName, String contactName,
                                               String contactPhone, String applyUsername,
                                               String applyPassword) {
        // 基本校验
        if (!StringUtils.hasText(tenantName)) throw new IllegalArgumentException("工厂名称不能为空");
        if (!StringUtils.hasText(applyUsername)) throw new IllegalArgumentException("申请账号不能为空");
        if (!StringUtils.hasText(applyPassword) || applyPassword.length() < 6)
            throw new IllegalArgumentException("密码长度不能少于6位");

        // 账号唯一性校验（包括已有账号和已申请账号）
        QueryWrapper<User> userQ = new QueryWrapper<>();
        userQ.eq("username", applyUsername);
        if (userService.count(userQ) > 0) throw new IllegalArgumentException("账号名已被使用: " + applyUsername);
        QueryWrapper<Tenant> tenantQ = new QueryWrapper<>();
        tenantQ.eq("apply_username", applyUsername).in("status", "pending_review");
        if (tenantService.count(tenantQ) > 0) throw new IllegalArgumentException("该账号名已有待审核申请: " + applyUsername);

        Tenant tenant = new Tenant();
        tenant.setTenantName(tenantName);
        // 申请阶段生成临时租户编码（审批通过后替换为正式编码 T0001 等）
        tenant.setTenantCode("PENDING_" + System.currentTimeMillis());
        tenant.setContactName(contactName);
        tenant.setContactPhone(contactPhone);
        tenant.setApplyUsername(applyUsername);
        tenant.setApplyPassword(passwordEncoder.encode(applyPassword));
        tenant.setStatus("pending_review");
        tenant.setPaidStatus("TRIAL");
        tenant.setMaxUsers((Integer) PLAN_DEFINITIONS.get("TRIAL").get("maxUsers")); // TRIAL套餐初始值=5，审批通过时由 approveApplication 按选定套餐覆盖
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

    /**
     * 删除租户（超级管理员专用）
     * - 待审核/已拒绝：直接删除（无关联用户）
     * - 已激活/已停用：删除关联用户和角色，再删除租户
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteTenant(Long tenantId) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户不存在");

        String status = tenant.getStatus();
        if ("active".equals(status) || "inactive".equals(status) || "disabled".equals(status)) {
            // 删除该租户下所有用户
            QueryWrapper<User> userQuery = new QueryWrapper<>();
            userQuery.eq("tenant_id", tenantId);
            userService.remove(userQuery);

            // 删除该租户下所有角色及角色权限
            QueryWrapper<Role> roleQuery = new QueryWrapper<>();
            roleQuery.eq("tenant_id", tenantId);
            List<Role> roles = roleService.list(roleQuery);
            for (Role role : roles) {
                QueryWrapper<com.fashion.supplychain.system.entity.RolePermission> rpQuery = new QueryWrapper<>();
                rpQuery.eq("role_id", role.getId());
                rolePermissionService.remove(rpQuery);
            }
            roleService.remove(roleQuery);

            // 删除权限天花板配置
            QueryWrapper<com.fashion.supplychain.system.entity.TenantPermissionCeiling> ceilQuery = new QueryWrapper<>();
            ceilQuery.eq("tenant_id", tenantId);
            ceilingService.remove(ceilQuery);

            // 删除账单记录
            QueryWrapper<TenantBillingRecord> billQuery = new QueryWrapper<>();
            billQuery.eq("tenant_id", tenantId);
            billingRecordService.remove(billQuery);

            log.info("[租户删除] tenantId={} 工厂={} 已清理关联用户/角色/权限/账单", tenantId, tenant.getTenantName());
        }

        tenantService.removeById(tenantId);
        log.info("[租户删除] tenantId={} 工厂={} 状态={} 已删除", tenantId, tenant.getTenantName(), status);
        return true;
    }

    /**
     * 审批通过入驻申请（超级管理员专用）
     * 自动生成租户编码，创建主账号，激活租户
     * @param planType 套餐类型（可选，默认 TRIAL）
     * @param trialDays 免费试用天数（可选，默认 30，0 表示永不过期）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> approveApplication(Long tenantId, String planType, Integer trialDays, String enabledModules) {
        assertSuperAdmin();
        Tenant current = tenantService.getById(tenantId);
        if (current == null) {
            throw new IllegalArgumentException("租户申请不存在");
        }

        // TenantInterceptor 已通过 SUPERADMIN_MANAGED_TABLES 精确放行 t_user/t_role
        Map<String, Object> result;
        if ("pending_review".equals(current.getStatus())) {
            result = doApproveApplication(tenantId);
        } else if ("active".equals(current.getStatus()) || "inactive".equals(current.getStatus()) || "disabled".equals(current.getStatus())) {
            // 兼容场景：超管通过“审批配置”入口给已激活租户调整套餐，不重复执行开户流程
            result = new HashMap<>();
            result.put("tenant", current);
            result.put("ownerUsername", current.getOwnerUsername());
            log.info("[审批入口兼容] tenantId={} 状态={}，跳过开户流程，仅更新套餐/试用期/模块", tenantId, current.getStatus());
        } else {
            throw new IllegalStateException("该申请不是待审核状态");
        }

        // 审批通过后设置套餐和试用期
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant != null) {
            String plan = normalizePlanType(planType);
            applyPlanSettings(tenant, plan, null, false);
            // 设置试用/有效期
            if ("TRIAL".equals(plan)) {
                tenant.setPaidStatus("TRIAL");
                if (trialDays != null && trialDays > 0) {
                    tenant.setExpireTime(LocalDateTime.now().plusDays(trialDays));
                } else if (trialDays == null) {
                    // 默认 30 天免费试用
                    tenant.setExpireTime(LocalDateTime.now().plusDays(30));
                }
                // trialDays == 0 表示永不过期，不设置 expireTime
            } else {
                tenant.setPaidStatus("PAID");
                tenant.setBillingCycle("MONTHLY");
                tenant.setExpireTime(LocalDateTime.now().plusMonths(1));
            }
            // 保存模块白名单（null=全部开放，非空串=按列表过滤菜单）
            if (enabledModules != null && !enabledModules.isBlank()) {
                tenant.setEnabledModules(enabledModules);
            }
            tenant.setUpdateTime(LocalDateTime.now());
            tenantService.updateById(tenant);
            log.info("[审批套餐] tenantId={} 套餐={} 试用天数={} 模块白名单={}", tenantId, plan, trialDays,
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

        // 检查账号唯一性，若冲突则自动生成唯一用户名
        String finalUsername = resolveUniqueUsername(tenant.getApplyUsername());

        // 自动生成租户编码
        String tenantCode = "T" + String.format("%04d", tenantId);

        // 为新租户初始化全套职位角色（克隆所有模板），申请时未指定类型，默认 HYBRID
        Role tenantAdminRole = roleInitHelper.initializeAllTenantRoles(tenant.getId(), tenant.getTenantName(), "HYBRID");
        if (tenantAdminRole == null || tenantAdminRole.getId() == null) {
            throw new IllegalStateException("租户管理员角色创建失败，请检查 full_admin 角色模板是否存在");
        }

        // 创建租户主账号
        User owner = new User();
        owner.setUsername(finalUsername);
        owner.setPassword(tenant.getApplyPassword()); // 已BCrypt
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

        // 更新租户：激活状态，回填 ownerUserId，清空明文申请密码，设置编码
        // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL，applyPassword 存安全凭据必须真正清空
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
        // 回填内存对象供后续日志/返回值使用
        tenant.setTenantCode(tenantCode);
        tenant.setOwnerUserId(owner.getId());
        tenant.setStatus("active");
        tenant.setApplyUsername(activateUsername);

        log.info("[申请通过] tenantId={} 工厂={} 账号={} 已激活", tenantId, tenant.getTenantName(), finalUsername);

        // 新开户赠送：自动激活财税导出模块（1年免费）
        autoGrantFinanceTaxFreebie(tenant.getId(), tenant.getTenantName());

        Map<String, Object> result = new HashMap<>();
        result.put("tenant", tenant);
        result.put("ownerUsername", finalUsername);
        return result;
    }

    /**
     * 修改入驻申请信息（超级管理员专用，审批前可改账号/联系人等）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean updateApplication(Long tenantId, Map<String, String> params) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户申请不存在");
        if (!"pending_review".equals(tenant.getStatus())) throw new IllegalStateException("仅待审核状态可修改");

        String newUsername = params.get("applyUsername");
        if (StringUtils.hasText(newUsername)) {
            // 检查新账号唯一性
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

    /**
     * 拒绝入驻申请（超级管理员专用）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean rejectApplication(Long tenantId, String reason) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户申请不存在");
        if (!"pending_review".equals(tenant.getStatus())) throw new IllegalStateException("该申请不是待审核状态");

        // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL（applyPassword 需要真正清空，否则存在安全隐患）
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

    /**
     * 标记租户为已付费（超级管理员专用）
     */
    public boolean markTenantPaid(Long tenantId, String paidStatus) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户不存在");
        tenant.setPaidStatus("PAID".equals(paidStatus) ? "PAID" : "TRIAL");
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.updateById(tenant);
        return true;
    }

    // ========== 套餐与收费管理（超级管理员专用） ==========


    // ========== 套餐/账单/发票（委托 TenantBillingHelper）==========

    public List<Map<String, Object>> getPlanDefinitions() {
        return billingHelper.getPlanDefinitions();
    }

    @Transactional(rollbackFor = Exception.class)
    public Tenant updateTenantPlan(Long tenantId, String planType, BigDecimal customFee,
                                    Long billingCycleMonths, Integer maxUsers, String tenantType) {
        return billingHelper.updateTenantPlan(tenantId, planType, customFee, billingCycleMonths, maxUsers, tenantType);
    }

    public void updateStorageUsed(Long tenantId, Long usedBytes) {
        billingHelper.updateStorageUsed(tenantId, usedBytes);
    }

    public Map<String, Object> getTenantBillingOverview(Long tenantId) {
        return billingHelper.getTenantBillingOverview(tenantId);
    }

    @Transactional(rollbackFor = Exception.class)
    public TenantBillingRecord generateMonthlyBill(Long tenantId, String billingMonth) {
        return billingHelper.generateMonthlyBill(tenantId, billingMonth);
    }

    public Page<TenantBillingRecord> listBillingRecords(Long tenantId, Long page, Long pageSize, String status) {
        return billingHelper.listBillingRecords(tenantId, page, pageSize, status);
    }

    public boolean markBillPaid(Long billId) {
        return billingHelper.markBillPaid(billId);
    }

    public boolean waiveBill(Long billId, String reason) {
        return billingHelper.waiveBill(billId, reason);
    }

    public Map<String, Object> getMyBilling() {
        return billingHelper.getMyBilling();
    }

    public Page<TenantBillingRecord> listMyBills(Long page, Long pageSize, String status) {
        return billingHelper.listMyBills(page, pageSize, status);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean requestInvoice(Long billId, Map<String, String> invoiceInfo) {
        return billingHelper.requestInvoice(billId, invoiceInfo);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean issueInvoice(Long billId, String invoiceNo) {
        return billingHelper.issueInvoice(billId, invoiceNo);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateMyInvoiceInfo(Map<String, String> invoiceInfo) {
        return billingHelper.updateMyInvoiceInfo(invoiceInfo);
    }

    // ========== 角色模板/权限天花板/工人注册（委托 TenantRoleInitHelper）==========

    public List<Role> listRoleTemplates() {
        return roleInitHelper.listRoleTemplates();
    }

    @Transactional(rollbackFor = Exception.class)
    public Role cloneRoleTemplate(Long tenantId, Long templateId) {
        return roleInitHelper.cloneRoleTemplate(tenantId, templateId);
    }

    public List<Role> listTenantRoles(Long tenantId) {
        return roleInitHelper.listTenantRoles(tenantId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateTenantRolePermissions(Long roleId, List<Long> permissionIds) {
        roleInitHelper.updateTenantRolePermissions(roleId, permissionIds);
    }

    public Map<String, Object> getTenantCeiling(Long tenantId) {
        return roleInitHelper.getTenantCeiling(tenantId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void setTenantCeiling(Long tenantId, List<Long> grantedPermissionIds) {
        roleInitHelper.setTenantCeiling(tenantId, grantedPermissionIds);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> workerRegister(String username, String password, String name,
                                                String phone, String tenantCode, String factoryId, String orgUnitId) {
        return roleInitHelper.workerRegister(username, password, name, phone, tenantCode, factoryId, orgUnitId);
    }

    public Page<User> listPendingRegistrations(Long page, Long pageSize) {
        return roleInitHelper.listPendingRegistrations(page, pageSize);
    }

    public Page<User> listFactoryPendingRegistrations(Long page, Long pageSize) {
        return roleInitHelper.listFactoryPendingRegistrations(page, pageSize);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean approveRegistration(Long userId, Long roleId) {
        return roleInitHelper.approveRegistration(userId, roleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean rejectRegistration(Long userId, String reason) {
        return roleInitHelper.rejectRegistration(userId, reason);
    }

    public Map<String, Object> getUserPermissionOverrides(Long userId) {
        return roleInitHelper.getUserPermissionOverrides(userId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void setUserPermissionOverrides(Long userId, List<Long> grantIds, List<Long> revokeIds) {
        roleInitHelper.setUserPermissionOverrides(userId, grantIds, revokeIds);
    }
    // ========== 租户自助账单与发票 ==========

    /**
     * 获取所有活跃租户列表（公开接口，无需认证）
     * 仅用于登录页面的公司选择下拉框
     */
    public List<Tenant> listActiveTenants() {
        QueryWrapper<Tenant> query = new QueryWrapper<>();
        query.eq("status", "active")
             .select("id", "tenant_name", "tenant_code")
             .orderByAsc("id");
        return tenantService.list(query);
    }

    /**
     * 查询所有租户列表（超级管理员专用）
     */
    public Page<Tenant> listTenants(Long page, Long pageSize, String tenantName, String status) {
        assertSuperAdmin();
        // TenantInterceptor 已通过 SUPERADMIN_MANAGED_TABLES 精确放行 t_user/t_role
        return doListTenants(page, pageSize, tenantName, status);
    }

    private Page<Tenant> doListTenants(Long page, Long pageSize, String tenantName, String status) {
        QueryWrapper<Tenant> query = new QueryWrapper<>();
        if (StringUtils.hasText(tenantName)) {
            query.like("tenant_name", tenantName);
        }
        if (StringUtils.hasText(status)) {
            query.eq("status", status);
        }
        query.orderByDesc("create_time");
        Page<Tenant> result = tenantService.page(new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
        // 补充填充主账号用户名
        if (result != null && result.getRecords() != null && !result.getRecords().isEmpty()) {
            List<Long> ownerIds = result.getRecords().stream()
                    .map(Tenant::getOwnerUserId)
                    .filter(id -> id != null)
                    .distinct()
                    .collect(java.util.stream.Collectors.toList());
            if (!ownerIds.isEmpty()) {
                QueryWrapper<com.fashion.supplychain.system.entity.User> userQuery = new QueryWrapper<>();
                userQuery.in("id", ownerIds).select("id", "username");
                java.util.Map<Long, String> idToUsername = userService.list(userQuery).stream()
                        .collect(java.util.stream.Collectors.toMap(
                                com.fashion.supplychain.system.entity.User::getId,
                                u -> u.getUsername() != null ? u.getUsername() : "",
                                (a, b) -> a));
                result.getRecords().forEach(t -> {
                    if (t.getOwnerUserId() != null) {
                        t.setOwnerUsername(idToUsername.getOrDefault(t.getOwnerUserId(), null));
                    }
                });
            }
        }
        return result;
    }

    /**
     * 更新租户信息（超级管理员专用）
     */
    public boolean updateTenant(Tenant tenant) {
        assertSuperAdmin();
        if (tenant == null || tenant.getId() == null) {
            throw new IllegalArgumentException("租户ID不能为空");
        }
        tenant.setUpdateTime(LocalDateTime.now());
        return tenantService.updateById(tenant);
    }

    /**
     * 单独更新租户菜单白名单，支持显式清空为 null（全部开放）。
     */
    public boolean updateTenantEnabledModules(Long tenantId, String enabledModules) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            throw new IllegalArgumentException("租户不存在");
        }
        LambdaUpdateWrapper<Tenant> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(Tenant::getId, tenantId)
                .set(Tenant::getEnabledModules, StringUtils.hasText(enabledModules) ? enabledModules : null)
                .set(Tenant::getUpdateTime, LocalDateTime.now());
        return tenantService.update(wrapper);
    }

    /**
     * 禁用/启用租户（超级管理员专用）
     */
    public boolean toggleTenantStatus(Long tenantId, String status) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            throw new IllegalArgumentException("租户不存在");
        }
        tenant.setStatus(status);
        tenant.setUpdateTime(LocalDateTime.now());
        return tenantService.updateById(tenant);
    }

    // ========== 租户主账号操作 ==========

    /**
     * 租户主账号添加子账号
     */
    @Transactional(rollbackFor = Exception.class)
    public User addSubAccount(User userData) {
        assertTenantOwner();

        Long tenantId = UserContext.tenantId();

        // 验证用户数量限制
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant != null && tenant.getMaxUsers() != null && tenant.getMaxUsers() > 0) {
            int currentCount = tenantService.countTenantUsers(tenantId);
            if (currentCount >= tenant.getMaxUsers()) {
                throw new IllegalStateException("已达到最大用户数限制: " + tenant.getMaxUsers());
            }
        }

        // 验证用户名唯一（全局唯一）
        QueryWrapper<User> userQuery = new QueryWrapper<>();
        userQuery.eq("username", userData.getUsername());
        if (userService.count(userQuery) > 0) {
            throw new IllegalArgumentException("用户名已存在: " + userData.getUsername());
        }

        // 设置租户信息
        userData.setTenantId(tenantId);
        userData.setIsTenantOwner(false);
        userData.setPassword(passwordEncoder.encode(userData.getPassword()));
        userData.setStatus("active");
        userData.setApprovalStatus("approved");
        userData.setCreateTime(LocalDateTime.now());
        userData.setUpdateTime(LocalDateTime.now());

        // 处理角色
        if (userData.getRoleId() != null) {
            Role role = roleService.getById(userData.getRoleId());
            if (role != null) {
                userData.setRoleName(role.getRoleName());
            }
        }
        if (!StringUtils.hasText(userData.getPermissionRange())) {
            userData.setPermissionRange("own");
        }

        userService.save(userData);
        return sanitizeUser(userData);
    }

    /**
     * 租户主账号查看本租户所有子账号
     */
    public Page<User> listSubAccounts(Long page, Long pageSize, String name, String roleName) {
        assertTenantOwnerOrAdmin();

        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            // 超级管理员查看所有用户
            return userService.getUserPage(page, pageSize, null, name, roleName, null);
        }

        QueryWrapper<User> query = new QueryWrapper<>();
        query.eq("tenant_id", tenantId);
        if (StringUtils.hasText(name)) {
            query.like("name", name);
        }
        if (StringUtils.hasText(roleName)) {
            query.like("role_name", roleName);
        }
        query.orderByDesc("create_time");
        Page<User> result = userService.page(new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
        if (result.getRecords() != null) {
            result.setRecords(result.getRecords().stream().map(this::sanitizeUser).collect(Collectors.toList()));
        }
        return result;
    }

    /**
     * 租户主账号更新子账号
     */
    public boolean updateSubAccount(User userData) {
        assertTenantOwner();

        User existing = userService.getById(userData.getId());
        if (existing == null) {
            throw new IllegalArgumentException("用户不存在");
        }

        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(existing.getTenantId())) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }

        // 禁止修改 tenantId 和 isTenantOwner
        userData.setTenantId(null);
        userData.setIsTenantOwner(null);
        if (StringUtils.hasText(userData.getPassword())) {
            userData.setPassword(passwordEncoder.encode(userData.getPassword()));
        } else {
            userData.setPassword(null);
        }
        userData.setUpdateTime(LocalDateTime.now());

        // 处理角色
        if (userData.getRoleId() != null) {
            Role role = roleService.getById(userData.getRoleId());
            if (role != null) {
                userData.setRoleName(role.getRoleName());
            }
        }

        return userService.updateById(userData);
    }

    /**
     * 租户主账号删除子账号
     */
    public boolean deleteSubAccount(Long userId) {
        assertTenantOwner();

        User existing = userService.getById(userId);
        if (existing == null) {
            throw new IllegalArgumentException("用户不存在");
        }

        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(existing.getTenantId())) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }
        if (Boolean.TRUE.equals(existing.getIsTenantOwner())) {
            throw new IllegalStateException("不能删除租户主账号");
        }

        return userService.removeById(userId);
    }

    /**
     * 获取当前用户的租户信息
     */
    public Map<String, Object> myTenant() {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> result = new HashMap<>();
        if (tenantId == null) {
            result.put("isSuperAdmin", true);
            result.put("tenant", null);
        } else {
            Tenant tenant = tenantService.getById(tenantId);
            result.put("isSuperAdmin", false);
            result.put("tenant", tenant);
            result.put("isTenantOwner", UserContext.isTenantOwner());
            result.put("currentUsers", tenantService.countTenantUsers(tenantId));
            result.put("maxUsers", tenant != null ? tenant.getMaxUsers() : 0);
            // 顺便把常用字段暴露到顶层，方便前端直接读取
            result.put("tenantCode", tenant != null ? tenant.getTenantCode() : null);
            result.put("tenantName", tenant != null ? tenant.getTenantName() : null);
            result.put("contactName", tenant != null ? tenant.getContactName() : null);
            result.put("contactPhone", tenant != null ? tenant.getContactPhone() : null);
        }
        return result;
    }

    private String normalizePlanType(String planType) {
        return StringUtils.hasText(planType) && PLAN_DEFINITIONS.containsKey(planType) ? planType : "TRIAL";
    }

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
            if (initializeExpireTime) {
                tenant.setExpireTime(LocalDateTime.now().plusDays(30));
            }
        } else {
            tenant.setPaidStatus("PAID");
            if (initializeExpireTime) {
                tenant.setExpireTime(LocalDateTime.now().plusMonths(1));
            }
        }
    }

    /**
     * 租户主账号更新自己的工厂信息（工厂名称、联系人、联系电话）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean updateMyTenantInfo(String tenantName, String contactName, String contactPhone) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new AccessDeniedException("超级管理员无需设置工厂信息");
        }
        // 让租户内管理员以上都可以修改（isTenantOwner 或 topAdmin 角色）
        if (!UserContext.isTenantOwner() && !UserContext.isTopAdmin()) {
            throw new AccessDeniedException("只有工厂主账号或管理员才能修改工厂信息");
        }
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            throw new IllegalArgumentException("租户不存在");
        }
        if (StringUtils.hasText(tenantName)) {
            tenant.setTenantName(tenantName.trim());
        }
        if (contactName != null) {
            tenant.setContactName(contactName.trim());
        }
        if (contactPhone != null) {
            tenant.setContactPhone(contactPhone.trim());
        }
        tenant.setUpdateTime(LocalDateTime.now());
        return tenantService.updateById(tenant);
    }


    /**
     * 新开户赠送：自动激活财税导出模块（FINANCE_TAX），有效期1年。
     * 绕开租户拦截器，用 JdbcTemplate 直接写入 t_tenant_subscription。
     * 失败时仅打印 warn 日志，不阻塞租户创建主流程。
     */
    private void autoGrantFinanceTaxFreebie(Long tenantId, String tenantName) {
        final String APP_CODE = "FINANCE_TAX";
        try {
            // 查询 t_app_store 是否存在该应用（若不存在则跳过，不报错）
            List<Map<String, Object>> appRows = jdbcTemplate.queryForList(
                "SELECT id, app_name FROM t_app_store WHERE app_code = ? AND status = 'PUBLISHED' LIMIT 1",
                APP_CODE);
            if (appRows.isEmpty()) {
                log.warn("[新开户赠送] t_app_store 中 {} 不存在，跳过自动赠送", APP_CODE);
                return;
            }
            Long appId = ((Number) appRows.get(0).get("id")).longValue();
            String appName = (String) appRows.get(0).get("app_name");

            // 若已存在有效订阅，则无需重复插入
            List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                "SELECT id FROM t_tenant_subscription WHERE tenant_id = ? AND app_code = ? AND status IN ('ACTIVE','TRIAL') LIMIT 1",
                tenantId, APP_CODE);
            if (!existing.isEmpty()) {
                log.info("[新开户赠送] 租户{}({}) 已有有效 {} 订阅，跳过", tenantName, tenantId, APP_CODE);
                return;
            }

            java.time.LocalDateTime now = java.time.LocalDateTime.now();
            java.time.LocalDateTime endTime = now.plusYears(1);
            String subNo = tenantSubscriptionService.generateSubscriptionNo();
            jdbcTemplate.update(
                "INSERT INTO t_tenant_subscription " +
                "(subscription_no, tenant_id, tenant_name, app_id, app_code, app_name, " +
                "subscription_type, price, user_count, start_time, end_time, status, auto_renew, created_by, remark, create_time, delete_flag) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                subNo, tenantId, tenantName, appId, APP_CODE, appName,
                "FREE", 0, 999, now, endTime, "ACTIVE", false, "system", "新开户赠送", now, 0);
            log.info("[新开户赠送] 租户{}({}) 已自动激活 {} 有效期至 {}", tenantName, tenantId, APP_CODE, endTime.toLocalDate());
        } catch (Exception e) {
            log.warn("[新开户赠送] 租户{}({}) 自动激活 {} 失败（不影响开户）: {}", tenantName, tenantId, APP_CODE, e.getMessage());
        }
    }

    private void assertSuperAdmin() {
        if (!UserContext.isSuperAdmin()) {
            throw new AccessDeniedException("仅超级管理员可执行此操作");
        }
    }

    private void assertTenantOwner() {
        if (UserContext.isSuperAdmin()) return; // 超级管理员可以代替操作
        if (!UserContext.isTenantOwner()) {
            throw new AccessDeniedException("仅租户主账号可执行此操作");
        }
        if (UserContext.tenantId() == null) {
            throw new AccessDeniedException("租户信息异常");
        }
    }

    private void assertTenantOwnerOrAdmin() {
        if (UserContext.isSuperAdmin()) return;
        if (UserContext.isTenantOwner()) return;
        if (UserContext.isTopAdmin()) return;
        throw new AccessDeniedException("无权限操作");
    }

    /**
     * 解决用户名冲突：若 baseUsername 已存在，自动追加后缀 _2, _3 ...
     * 最多尝试 100 次，避免死循环。
     */
    private String resolveUniqueUsername(String baseUsername) {
        QueryWrapper<User> check = new QueryWrapper<>();
        check.eq("username", baseUsername);
        if (userService.count(check) == 0) {
            return baseUsername; // 无冲突，直接使用
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

    private User sanitizeUser(User user) {
        if (user != null) { user.setPassword(null); }
        return user;
    }

}
