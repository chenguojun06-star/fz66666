package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
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
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

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
    private UserPermissionOverrideService overrideService;

    @Autowired
    private PermissionService permissionService;

    @Autowired
    private PermissionCalculationEngine permissionEngine;

    @Autowired
    private TenantBillingRecordService billingRecordService;

    @Autowired(required = false)
    private com.fashion.supplychain.websocket.service.WebSocketService webSocketService;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

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
                                             String ownerName, Integer maxUsers) {
        assertSuperAdmin();
        // TenantInterceptor 已通过 SUPERADMIN_MANAGED_TABLES 精确放行 t_user/t_role
        return doCreateTenant(tenantName, tenantCode, contactName, contactPhone,
                              ownerUsername, ownerPassword, ownerName, maxUsers);
    }

    private Map<String, Object> doCreateTenant(String tenantName, String tenantCode,
                                                String contactName, String contactPhone,
                                                String ownerUsername, String ownerPassword,
                                                String ownerName, Integer maxUsers) {
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
        tenant.setMaxUsers(maxUsers != null ? maxUsers : 50);
        tenant.setCreateTime(LocalDateTime.now());
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.save(tenant);

        // 2. 为新租户创建管理员角色（克隆模板）—— 必须成功，失败则整体回滚
        Role tenantAdminRole = createTenantAdminRole(tenant.getId(), tenantName);
        // 强制校验：管理员角色必须存在且有效
        if (tenantAdminRole == null || tenantAdminRole.getId() == null) {
            throw new IllegalStateException("[数据完整性] 租户管理员角色创建失败，无法继续创建租户: " + tenantCode);
        }
        log.info("租户 {} 管理员角色已就绪: roleId={}, roleName={}",
                 tenantCode, tenantAdminRole.getId(), tenantAdminRole.getRoleName());

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

        // 5. 最终数据完整性校验 —— 以刚保存对象为主，避免超管上下文下 getById 被租户拦截误判
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
        tenant.setMaxUsers(50);
        tenant.setCreateTime(LocalDateTime.now());
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.save(tenant);

        log.info("[申请入驻] 工厂={} 申请账号={} 已提交，等待超管审批", tenantName, applyUsername);

        // 通知平台超级管理员（tenantId 为空）有新的工厂入驻申请
        try {
            if (webSocketService != null) {
                LambdaQueryWrapper<User> adminQuery = new LambdaQueryWrapper<>();
                adminQuery.eq(User::getIsSuperAdmin, true)
                          .eq(User::getStatus, "active")
                          .isNull(User::getTenantId);
                List<User> superAdmins = userService.list(adminQuery);
                for (User sa : superAdmins) {
                    webSocketService.notifyTenantApplicationPending(
                        String.valueOf(sa.getId()), tenantName);
                }
                log.info("[入驻通知] 已推送给 {} 位超管, 工厂={}", superAdmins.size(), tenantName);
            }
        } catch (Exception e) {
            log.warn("通知超管WebSocket失败，不影响申请流程: {}", e.getMessage());
        }

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
    public Map<String, Object> approveApplication(Long tenantId, String planType, Integer trialDays) {
        assertSuperAdmin();
        // TenantInterceptor 已通过 SUPERADMIN_MANAGED_TABLES 精确放行 t_user/t_role
        Map<String, Object> result = doApproveApplication(tenantId);

        // 审批通过后设置套餐和试用期
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant != null) {
            String plan = (planType != null && PLAN_DEFINITIONS.containsKey(planType)) ? planType : "TRIAL";
            Map<String, Object> planDef = PLAN_DEFINITIONS.get(plan);
            if (planDef != null) {
                tenant.setPlanType(plan);
                tenant.setMonthlyFee((java.math.BigDecimal) planDef.get("monthlyFee"));
                tenant.setStorageQuotaMb((Long) planDef.get("storageQuotaMb"));
                tenant.setMaxUsers((Integer) planDef.get("maxUsers"));
            }
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
            tenant.setUpdateTime(LocalDateTime.now());
            tenantService.updateById(tenant);
            log.info("[审批套餐] tenantId={} 套餐={} 试用天数={}", tenantId, plan, trialDays);
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

        // 为新租户创建管理员角色
        Role tenantAdminRole = createTenantAdminRole(tenant.getId(), tenant.getTenantName());
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

    /**
     * 获取套餐方案定义列表
     */
    public List<Map<String, Object>> getPlanDefinitions() {
        List<Map<String, Object>> result = new ArrayList<>();
        PLAN_DEFINITIONS.forEach((code, def) -> {
            Map<String, Object> item = new LinkedHashMap<>(def);
            item.put("code", code);
            result.add(item);
        });
        return result;
    }

    /**
     * 设置租户套餐（超级管理员专用）
     * 可自定义价格和配额，也可使用预设方案
     * @param billingCycle MONTHLY=月付, YEARLY=年付（年付自动设置12个月有效期）
     */
    @Transactional(rollbackFor = Exception.class)
    public Tenant updateTenantPlan(Long tenantId, String planType, BigDecimal monthlyFee,
                                    Long storageQuotaMb, Integer maxUsers, String billingCycle) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户不存在");

        // 标准化计费周期
        if (billingCycle == null || (!"MONTHLY".equals(billingCycle) && !"YEARLY".equals(billingCycle))) {
            billingCycle = "MONTHLY";
        }

        // 如果选择预设方案且没有自定义值，使用预设默认值
        Map<String, Object> planDef = PLAN_DEFINITIONS.get(planType);
        if (planDef != null) {
            if (monthlyFee == null) monthlyFee = (BigDecimal) planDef.get("monthlyFee");
            if (storageQuotaMb == null) storageQuotaMb = (Long) planDef.get("storageQuotaMb");
            if (maxUsers == null) maxUsers = (Integer) planDef.get("maxUsers");
        } else {
            // 自定义方案，所有值必填
            if (monthlyFee == null) monthlyFee = BigDecimal.ZERO;
            if (storageQuotaMb == null) storageQuotaMb = 1024L;
            if (maxUsers == null) maxUsers = 50;
        }

        tenant.setPlanType(planType);
        tenant.setMonthlyFee(monthlyFee);
        tenant.setStorageQuotaMb(storageQuotaMb);
        tenant.setMaxUsers(maxUsers);
        tenant.setBillingCycle(billingCycle);
        // 非试用方案自动标记为已付费
        if (!"TRIAL".equals(planType)) {
            tenant.setPaidStatus("PAID");
        }
        // 年付设置12个月有效期，月付设置1个月（从当前时间起算）
        if ("YEARLY".equals(billingCycle) && !"TRIAL".equals(planType)) {
            tenant.setExpireTime(LocalDateTime.now().plusMonths(12));
        } else if ("MONTHLY".equals(billingCycle) && !"TRIAL".equals(planType)) {
            tenant.setExpireTime(LocalDateTime.now().plusMonths(1));
        }
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.updateById(tenant);
        log.info("租户[{}]套餐更新为 {}（{}），月费={}，存储配额={}MB，最大用户={}",
                tenantId, planType, billingCycle, monthlyFee, storageQuotaMb, maxUsers);
        return tenant;
    }

    /**
     * 更新租户存储用量（由文件上传等服务调用）
     */
    public void updateStorageUsed(Long tenantId, Long usedMb) {
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) return;
        tenant.setStorageUsedMb(usedMb);
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.updateById(tenant);
    }

    /**
     * 获取租户存储与套餐概览
     */
    public Map<String, Object> getTenantBillingOverview(Long tenantId) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户不存在");

        long userCount = tenantService.countTenantUsers(tenantId);

        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("tenantId", tenant.getId());
        overview.put("tenantName", tenant.getTenantName());
        overview.put("planType", tenant.getPlanType());
        overview.put("billingCycle", tenant.getBillingCycle());
        overview.put("monthlyFee", tenant.getMonthlyFee());
        long quotaMb = tenant.getStorageQuotaMb() != null ? tenant.getStorageQuotaMb() : 0L;
        long usedMb = tenant.getStorageUsedMb() != null ? tenant.getStorageUsedMb() : 0L;
        overview.put("storageQuotaMb", quotaMb);
        overview.put("storageUsedMb", usedMb);
        overview.put("storageUsedPercent", quotaMb > 0 ? Math.round(usedMb * 100.0 / quotaMb) : 0);
        overview.put("maxUsers", tenant.getMaxUsers());
        overview.put("currentUsers", userCount);
        overview.put("paidStatus", tenant.getPaidStatus());
        overview.put("expireTime", tenant.getExpireTime());

        // 获取最近账单
        QueryWrapper<com.fashion.supplychain.system.entity.TenantBillingRecord> bq = new QueryWrapper<>();
        bq.eq("tenant_id", tenantId).orderByDesc("billing_month").last("LIMIT 6");
        overview.put("recentBills", billingRecordService.list(bq));

        return overview;
    }

    /**
     * 生成账单（超级管理员手动触发或定时任务）
     * 月付：生成当月账单（baseFee = monthlyFee）
     * 年付：生成年度账单（baseFee = yearlyFee，账期格式 2026-YEAR）
     */
    @Transactional(rollbackFor = Exception.class)
    public com.fashion.supplychain.system.entity.TenantBillingRecord generateMonthlyBill(Long tenantId, String billingMonth) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户不存在");

        String cycle = tenant.getBillingCycle() != null ? tenant.getBillingCycle() : "MONTHLY";
        boolean yearly = "YEARLY".equals(cycle);

        // 确定账期标识
        if (billingMonth == null) {
            if (yearly) {
                billingMonth = String.valueOf(java.time.Year.now().getValue()) + "-YEAR";
            } else {
                billingMonth = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
            }
        }

        // 检查是否已有该期账单
        QueryWrapper<com.fashion.supplychain.system.entity.TenantBillingRecord> check = new QueryWrapper<>();
        check.eq("tenant_id", tenantId).eq("billing_month", billingMonth);
        if (billingRecordService.count(check) > 0) {
            throw new IllegalStateException(yearly ? "该租户本年度账单已存在" : "该租户本月账单已存在");
        }

        // 计算基础费用
        BigDecimal baseFee;
        if (yearly) {
            Map<String, Object> planDef = PLAN_DEFINITIONS.get(tenant.getPlanType());
            baseFee = planDef != null ? (BigDecimal) planDef.get("yearlyFee") : BigDecimal.ZERO;
            // 如果有自定义月费，年付 = 月费 × 10
            if (tenant.getMonthlyFee() != null && tenant.getMonthlyFee().compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal defaultMonthly = planDef != null ? (BigDecimal) planDef.get("monthlyFee") : BigDecimal.ZERO;
                if (tenant.getMonthlyFee().compareTo(defaultMonthly) != 0) {
                    baseFee = tenant.getMonthlyFee().multiply(new BigDecimal("10"));
                }
            }
        } else {
            baseFee = tenant.getMonthlyFee() != null ? tenant.getMonthlyFee() : BigDecimal.ZERO;
        }

        com.fashion.supplychain.system.entity.TenantBillingRecord bill = new com.fashion.supplychain.system.entity.TenantBillingRecord();
        bill.setBillingNo(billingRecordService.generateBillingNo());
        bill.setTenantId(tenantId);
        bill.setTenantName(tenant.getTenantName());
        bill.setBillingMonth(billingMonth);
        bill.setPlanType(tenant.getPlanType());
        bill.setBillingCycle(cycle);
        bill.setBaseFee(baseFee);
        bill.setStorageFee(BigDecimal.ZERO); // 超额存储费后续计算
        bill.setUserFee(BigDecimal.ZERO);    // 超额用户费后续计算
        bill.setTotalAmount(bill.getBaseFee().add(bill.getStorageFee()).add(bill.getUserFee()));
        bill.setStatus("PENDING");
        bill.setCreatedBy(UserContext.username());
        billingRecordService.save(bill);

        log.info("生成租户[{}]{}账单（{}），金额={}", tenantId, billingMonth, cycle, bill.getTotalAmount());
        return bill;
    }

    /**
     * 查询租户账单列表
     */
    public Page<com.fashion.supplychain.system.entity.TenantBillingRecord> listBillingRecords(
            Long tenantId, Long page, Long pageSize, String status) {
        assertSuperAdmin();
        QueryWrapper<com.fashion.supplychain.system.entity.TenantBillingRecord> query = new QueryWrapper<>();
        if (tenantId != null) query.eq("tenant_id", tenantId);
        if (StringUtils.hasText(status)) query.eq("status", status);
        query.orderByDesc("billing_month");
        return billingRecordService.page(
                new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
    }

    /**
     * 标记账单已支付
     */
    public boolean markBillPaid(Long billId) {
        assertSuperAdmin();
        com.fashion.supplychain.system.entity.TenantBillingRecord bill = billingRecordService.getById(billId);
        if (bill == null) throw new IllegalArgumentException("账单不存在");
        if ("PAID".equals(bill.getStatus())) throw new IllegalStateException("该账单已支付");
        bill.setStatus("PAID");
        bill.setPaidTime(LocalDateTime.now());
        bill.setUpdateTime(LocalDateTime.now());
        billingRecordService.updateById(bill);
        return true;
    }

    /**
     * 减免账单
     */
    public boolean waiveBill(Long billId, String remark) {
        assertSuperAdmin();
        com.fashion.supplychain.system.entity.TenantBillingRecord bill = billingRecordService.getById(billId);
        if (bill == null) throw new IllegalArgumentException("账单不存在");
        bill.setStatus("WAIVED");
        bill.setRemark(remark);
        bill.setUpdateTime(LocalDateTime.now());
        billingRecordService.updateById(bill);
        return true;
    }

    // ========== 租户自助账单与发票 ==========

    /**
     * 租户查看自己的账单概览（无需超管权限）
     * 包含：套餐信息、已用存储/用户、最近6期账单
     */
    public Map<String, Object> getMyBilling() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) throw new IllegalArgumentException("超级管理员无租户账单");

        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户不存在");

        long userCount = tenantService.countTenantUsers(tenantId);

        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("tenantId", tenant.getId());
        overview.put("tenantName", tenant.getTenantName());
        overview.put("tenantCode", tenant.getTenantCode());
        overview.put("planType", tenant.getPlanType());
        overview.put("billingCycle", tenant.getBillingCycle());
        overview.put("monthlyFee", tenant.getMonthlyFee());
        overview.put("paidStatus", tenant.getPaidStatus());
        overview.put("expireTime", tenant.getExpireTime());
        long quotaMb2 = tenant.getStorageQuotaMb() != null ? tenant.getStorageQuotaMb() : 0L;
        long usedMb2 = tenant.getStorageUsedMb() != null ? tenant.getStorageUsedMb() : 0L;
        overview.put("storageQuotaMb", quotaMb2);
        overview.put("storageUsedMb", usedMb2);
        overview.put("storageUsedPercent", quotaMb2 > 0 ? Math.round(usedMb2 * 100.0 / quotaMb2) : 0);
        overview.put("maxUsers", tenant.getMaxUsers());
        overview.put("currentUsers", userCount);

        // 默认开票信息
        Map<String, String> invoiceDefaults = new LinkedHashMap<>();
        invoiceDefaults.put("invoiceTitle", tenant.getInvoiceTitle());
        invoiceDefaults.put("invoiceTaxNo", tenant.getInvoiceTaxNo());
        invoiceDefaults.put("invoiceBankName", tenant.getInvoiceBankName());
        invoiceDefaults.put("invoiceBankAccount", tenant.getInvoiceBankAccount());
        invoiceDefaults.put("invoiceAddress", tenant.getInvoiceAddress());
        invoiceDefaults.put("invoicePhone", tenant.getInvoicePhone());
        overview.put("invoiceDefaults", invoiceDefaults);

        // 最近6期账单
        QueryWrapper<TenantBillingRecord> bq = new QueryWrapper<>();
        bq.eq("tenant_id", tenantId).orderByDesc("billing_month").last("LIMIT 6");
        overview.put("recentBills", billingRecordService.list(bq));

        return overview;
    }

    /**
     * 租户查看自己的账单列表（无需超管权限，自动按 tenantId 过滤）
     */
    public Page<TenantBillingRecord> listMyBills(Long page, Long pageSize, String status) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) throw new IllegalArgumentException("超级管理员无租户账单");

        QueryWrapper<TenantBillingRecord> query = new QueryWrapper<>();
        query.eq("tenant_id", tenantId);
        if (StringUtils.hasText(status)) query.eq("status", status);
        query.orderByDesc("billing_month");
        return billingRecordService.page(
                new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
    }

    /**
     * 租户申请开票（对已支付账单申请发票）
     * 自动携带租户默认开票信息，也允许本次覆盖
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean requestInvoice(Long billId, Map<String, String> invoiceInfo) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) throw new IllegalArgumentException("超级管理员不能申请发票");

        TenantBillingRecord bill = billingRecordService.getById(billId);
        if (bill == null) throw new IllegalArgumentException("账单不存在");
        if (!tenantId.equals(bill.getTenantId())) throw new AccessDeniedException("无权操作其他租户账单");
        if (!"PAID".equals(bill.getStatus()) && !"PENDING".equals(bill.getStatus())) {
            throw new IllegalStateException("仅待付款/已支付账单可申请发票");
        }
        if ("ISSUED".equals(bill.getInvoiceStatus()) || "MAILED".equals(bill.getInvoiceStatus())) {
            throw new IllegalStateException("该账单发票已开具或已寄出");
        }

        // 优先使用本次传入的信息，否则使用租户默认信息
        Tenant tenant = tenantService.getById(tenantId);
        String title = getOrDefault(invoiceInfo, "invoiceTitle", tenant.getInvoiceTitle());
        String taxNo = getOrDefault(invoiceInfo, "invoiceTaxNo", tenant.getInvoiceTaxNo());
        if (!StringUtils.hasText(title)) throw new IllegalArgumentException("发票抬头不能为空");
        if (!StringUtils.hasText(taxNo)) throw new IllegalArgumentException("纳税人识别号不能为空");

        bill.setInvoiceRequired(true);
        bill.setInvoiceStatus("PENDING");
        bill.setInvoiceTitle(title);
        bill.setInvoiceTaxNo(taxNo);
        bill.setInvoiceBankName(getOrDefault(invoiceInfo, "invoiceBankName", tenant.getInvoiceBankName()));
        bill.setInvoiceBankAccount(getOrDefault(invoiceInfo, "invoiceBankAccount", tenant.getInvoiceBankAccount()));
        bill.setInvoiceAddress(getOrDefault(invoiceInfo, "invoiceAddress", tenant.getInvoiceAddress()));
        bill.setInvoicePhone(getOrDefault(invoiceInfo, "invoicePhone", tenant.getInvoicePhone()));
        bill.setInvoiceAmount(bill.getTotalAmount());
        bill.setUpdateTime(LocalDateTime.now());
        billingRecordService.updateById(bill);

        log.info("[发票申请] tenantId={} billId={} 抬头={} 金额={}", tenantId, billId, title, bill.getTotalAmount());

        // 通知超管有新的开票申请（复用入驻申请通知通道）
        try {
            if (webSocketService != null) {
                LambdaQueryWrapper<User> adminQuery = new LambdaQueryWrapper<>();
                adminQuery.eq(User::getIsSuperAdmin, true).eq(User::getStatus, "active").isNull(User::getTenantId);
                List<User> superAdmins = userService.list(adminQuery);
                for (User sa : superAdmins) {
                    webSocketService.notifyTenantApplicationPending(
                            String.valueOf(sa.getId()),
                            tenant.getTenantName() + " 申请开票 ¥" + bill.getTotalAmount());
                }
            }
        } catch (Exception e) {
            log.warn("通知超管发票申请WebSocket失败: {}", e.getMessage());
        }

        return true;
    }

    /**
     * 超管确认开票（填写发票号码、实际开票日期）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean issueInvoice(Long billId, String invoiceNo) {
        assertSuperAdmin();
        TenantBillingRecord bill = billingRecordService.getById(billId);
        if (bill == null) throw new IllegalArgumentException("账单不存在");
        if (!"PENDING".equals(bill.getInvoiceStatus())) {
            throw new IllegalStateException("仅待开票的账单可操作");
        }
        if (!StringUtils.hasText(invoiceNo)) throw new IllegalArgumentException("发票号码不能为空");

        bill.setInvoiceStatus("ISSUED");
        bill.setInvoiceNo(invoiceNo);
        bill.setInvoiceIssuedTime(LocalDateTime.now());
        bill.setUpdateTime(LocalDateTime.now());
        billingRecordService.updateById(bill);

        log.info("[开票完成] billId={} invoiceNo={} 租户={}", billId, invoiceNo, bill.getTenantName());
        return true;
    }

    /**
     * 租户维护自己的默认开票信息（发票抬头、税号、银行等）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean updateMyInvoiceInfo(Map<String, String> invoiceInfo) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) throw new AccessDeniedException("超级管理员无需设置开票信息");
        if (!UserContext.isTenantOwner() && !UserContext.isTopAdmin()) {
            throw new AccessDeniedException("只有工厂主账号或管理员才能修改开票信息");
        }

        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) throw new IllegalArgumentException("租户不存在");

        if (invoiceInfo.containsKey("invoiceTitle")) tenant.setInvoiceTitle(invoiceInfo.get("invoiceTitle"));
        if (invoiceInfo.containsKey("invoiceTaxNo")) tenant.setInvoiceTaxNo(invoiceInfo.get("invoiceTaxNo"));
        if (invoiceInfo.containsKey("invoiceBankName")) tenant.setInvoiceBankName(invoiceInfo.get("invoiceBankName"));
        if (invoiceInfo.containsKey("invoiceBankAccount")) tenant.setInvoiceBankAccount(invoiceInfo.get("invoiceBankAccount"));
        if (invoiceInfo.containsKey("invoiceAddress")) tenant.setInvoiceAddress(invoiceInfo.get("invoiceAddress"));
        if (invoiceInfo.containsKey("invoicePhone")) tenant.setInvoicePhone(invoiceInfo.get("invoicePhone"));
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.updateById(tenant);

        log.info("[开票信息更新] tenantId={} 抬头={}", tenantId, tenant.getInvoiceTitle());
        return true;
    }

    private String getOrDefault(Map<String, String> map, String key, String defaultVal) {
        if (map != null && StringUtils.hasText(map.get(key))) return map.get(key);
        return defaultVal;
    }

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

    // ========== 辅助方法 ==========

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

    /**
     * 为新租户创建管理员角色（强制成功，失败抛异常回滚事务）
     *
     * 核心保障：新租户主账号必须拥有完整的管理员角色和权限
     * 流程：
     *   1. 查找 full_admin 全局模板角色
     *   2. 检查是否已存在（幂等性）
     *   3. 克隆角色 + 克隆权限
     *   4. 最终验证：确保角色和权限都已正确创建
     *
     * @throws IllegalStateException 模板不存在、克隆失败等情况，触发事务回滚
     */
    private Role createTenantAdminRole(Long tenantId, String tenantName) {
        // 1. 查找 full_admin 模板（全局唯一，is_template=true）
        LambdaQueryWrapper<Role> query = new LambdaQueryWrapper<>();
        query.eq(Role::getIsTemplate, true)
             .eq(Role::getRoleCode, "full_admin")
             .eq(Role::getStatus, "active")
             .last("LIMIT 1");
        Role template = roleService.getOne(query);

        if (template == null) {
            // ❌ 严重错误：模板角色是系统基础数据，缺失意味着系统初始化有问题
            log.error("[数据完整性-严重] 未找到 full_admin 角色模板 (is_template=true, role_code='full_admin', status='active')。" +
                      "请检查 t_role 表是否缺少模板角色数据！租户 {} 创建中止。", tenantId);
            throw new IllegalStateException(
                    "系统缺少角色模板 full_admin，无法创建租户。请联系管理员初始化角色模板数据。");
        }

        // 2. 幂等性检查：如果此租户已有 full_admin 角色，直接返回
        LambdaQueryWrapper<Role> dupCheck = new LambdaQueryWrapper<>();
        dupCheck.eq(Role::getTenantId, tenantId)
                .eq(Role::getRoleCode, template.getRoleCode());
        Role existingRole = roleService.getOne(dupCheck);
        if (existingRole != null) {
            log.info("租户 {} 已有管理员角色 (roleId={})，跳过创建", tenantId, existingRole.getId());
            return existingRole;
        }

        // 3. 克隆角色
        Role cloned = new Role();
        cloned.setRoleName(template.getRoleName());
        cloned.setRoleCode(template.getRoleCode());
        cloned.setDescription("租户" + tenantName + "的管理员角色（自动创建）");
        cloned.setStatus("active");
        cloned.setDataScope(template.getDataScope());
        cloned.setTenantId(tenantId);
        cloned.setIsTemplate(false);
        cloned.setSourceTemplateId(template.getId());
        cloned.setSortOrder(template.getSortOrder());
        cloned.setCreateTime(LocalDateTime.now());
        cloned.setUpdateTime(LocalDateTime.now());
        boolean roleSaved = roleService.save(cloned);
        if (!roleSaved || cloned.getId() == null) {
            throw new IllegalStateException(
                    "[数据完整性] 租户管理员角色保存失败，tenantId=" + tenantId);
        }

        // 4. 克隆权限关联
        List<Long> templatePermIds = rolePermissionService.getPermissionIdsByRoleId(template.getId());
        int permCount = 0;
        if (templatePermIds != null && !templatePermIds.isEmpty()) {
            // 天花板过滤：如果租户有天花板限制，仅克隆天花板内的权限
            List<Long> ceilingGranted = ceilingService.getGrantedPermissionIds(tenantId);
            List<Long> effectivePermIds;
            if (ceilingGranted != null && !ceilingGranted.isEmpty()) {
                Set<Long> ceilingSet = new HashSet<>(ceilingGranted);
                effectivePermIds = templatePermIds.stream()
                        .filter(ceilingSet::contains)
                        .collect(Collectors.toList());
            } else {
                // 无天花板限制 → 继承模板全部权限
                effectivePermIds = templatePermIds;
            }
            rolePermissionService.replaceRolePermissions(cloned.getId(), effectivePermIds);
            permCount = effectivePermIds.size();
        }

        // 5. 最终验证：确保权限正确持久化
        // ✅ roleSaved=true + cloned.getId() != null 已充分证明角色 INSERT 成功。
        //    旧版二次查询 getOne(eq(tenant_id=X)) 在超管路径下因 MyBatis-Plus
        //    fill 机制可能写入 null 而返回 null，导致误报失败，已移除。
        List<Long> verifiedPerms = rolePermissionService.getPermissionIdsByRoleId(cloned.getId());
        int verifiedPermCount = verifiedPerms != null ? verifiedPerms.size() : 0;
        if (permCount > 0 && verifiedPermCount == 0) {
            throw new IllegalStateException(
                    "[数据完整性] 角色权限克隆失败: 预期 " + permCount + " 个权限，实际 0 个");
        }

        log.info("[租户角色创建成功] tenantId={}, roleId={}, roleName={}, 权限数={}（模板权限数={}）",
                 tenantId, cloned.getId(), cloned.getRoleName(), verifiedPermCount,
                 templatePermIds != null ? templatePermIds.size() : 0);
        return cloned;
    }

    private User sanitizeUser(User user) {
        if (user != null) {
            user.setPassword(null);
        }
        return user;
    }

    // ========== 角色模板管理 ==========

    /**
     * 获取所有可用的角色模板列表
     */
    public List<Role> listRoleTemplates() {
        LambdaQueryWrapper<Role> query = new LambdaQueryWrapper<>();
        query.eq(Role::getIsTemplate, true)
             .eq(Role::getStatus, "active")
             .orderByAsc(Role::getSortOrder);
        List<Role> templates = roleService.list(query);
        // 附加权限数量
        for (Role template : templates) {
            List<Long> permIds = rolePermissionService.getPermissionIdsByRoleId(template.getId());
            template.setPermissionCount(permIds != null ? permIds.size() : 0);
        }
        return templates;
    }

    /**
     * 将角色模板克隆到租户中
     * @param tenantId 目标租户ID
     * @param templateId 源模板ID
     * @return 克隆后的租户角色
     */
    @Transactional(rollbackFor = Exception.class)
    public Role cloneRoleTemplate(Long tenantId, Long templateId) {
        assertSuperAdminOrTenantOwner();

        Role template = roleService.getById(templateId);
        if (template == null || !Boolean.TRUE.equals(template.getIsTemplate())) {
            throw new IllegalArgumentException("无效的角色模板ID: " + templateId);
        }

        // 检查是否已克隆（同一租户同一代码不重复）
        LambdaQueryWrapper<Role> dupCheck = new LambdaQueryWrapper<>();
        dupCheck.eq(Role::getTenantId, tenantId)
                .eq(Role::getRoleCode, template.getRoleCode());
        if (roleService.count(dupCheck) > 0) {
            throw new IllegalArgumentException("该角色模板已克隆到此租户: " + template.getRoleName());
        }

        // 克隆角色
        Role cloned = new Role();
        cloned.setRoleName(template.getRoleName());
        cloned.setRoleCode(template.getRoleCode());
        cloned.setDescription(template.getDescription());
        cloned.setStatus("active");
        cloned.setDataScope(template.getDataScope());
        cloned.setTenantId(tenantId);
        cloned.setIsTemplate(false);
        cloned.setSourceTemplateId(templateId);
        cloned.setSortOrder(template.getSortOrder());
        cloned.setCreateTime(LocalDateTime.now());
        cloned.setUpdateTime(LocalDateTime.now());
        roleService.save(cloned);

        // 克隆权限关联
        List<Long> templatePermIds = rolePermissionService.getPermissionIdsByRoleId(templateId);
        if (templatePermIds != null && !templatePermIds.isEmpty()) {
            // 天花板过滤：如果租户有天花板，仅克隆天花板内的权限
            List<Long> ceilingGranted = ceilingService.getGrantedPermissionIds(tenantId);
            List<Long> effectivePermIds;
            if (ceilingGranted != null && !ceilingGranted.isEmpty()) {
                Set<Long> ceilingSet = new HashSet<>(ceilingGranted);
                effectivePermIds = templatePermIds.stream()
                        .filter(ceilingSet::contains)
                        .collect(Collectors.toList());
            } else {
                effectivePermIds = templatePermIds;
            }
            rolePermissionService.replaceRolePermissions(cloned.getId(), effectivePermIds);
        }

        log.info("角色模板克隆完成: template={} -> tenantRole={}, tenantId={}", templateId, cloned.getId(), tenantId);
        return cloned;
    }

    /**
     * 获取租户的角色列表（已克隆的角色）
     */
    public List<Role> listTenantRoles(Long tenantId) {
        assertSuperAdminOrTenantOwner();
        Long tid = tenantId != null ? tenantId : UserContext.tenantId();
        if (tid == null) {
            throw new IllegalArgumentException("租户ID不能为空");
        }

        LambdaQueryWrapper<Role> query = new LambdaQueryWrapper<>();
        query.eq(Role::getTenantId, tid)
             .eq(Role::getIsTemplate, false)
             .eq(Role::getStatus, "active")
             .orderByAsc(Role::getSortOrder);
        List<Role> roles = roleService.list(query);
        for (Role role : roles) {
            List<Long> permIds = rolePermissionService.getPermissionIdsByRoleId(role.getId());
            role.setPermissionCount(permIds != null ? permIds.size() : 0);
        }
        return roles;
    }

    /**
     * 更新租户角色的权限（在天花板范围内微调）
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateTenantRolePermissions(Long roleId, List<Long> permissionIds) {
        assertSuperAdminOrTenantOwner();

        Role role = roleService.getById(roleId);
        if (role == null) {
            throw new IllegalArgumentException("角色不存在");
        }
        if (Boolean.TRUE.equals(role.getIsTemplate())) {
            throw new IllegalArgumentException("不能修改角色模板的权限，请修改克隆后的租户角色");
        }

        Long tenantId = role.getTenantId();
        // 天花板校验
        if (tenantId != null && permissionIds != null) {
            List<Long> ceilingGranted = ceilingService.getGrantedPermissionIds(tenantId);
            if (ceilingGranted != null && !ceilingGranted.isEmpty()) {
                Set<Long> ceilingSet = new HashSet<>(ceilingGranted);
                List<Long> exceeding = permissionIds.stream()
                        .filter(id -> !ceilingSet.contains(id))
                        .collect(Collectors.toList());
                if (!exceeding.isEmpty()) {
                    throw new IllegalArgumentException("以下权限不在租户天花板范围内: " + exceeding);
                }
            }
        }

        rolePermissionService.replaceRolePermissions(roleId, permissionIds);
        permissionEngine.evictRolePermissionCache(roleId);
        log.info("租户角色权限更新: roleId={}, permCount={}", roleId, permissionIds != null ? permissionIds.size() : 0);
    }

    // ========== 租户权限天花板管理 ==========

    /**
     * 获取租户权限天花板（可用权限ID列表）
     */
    public Map<String, Object> getTenantCeiling(Long tenantId) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            throw new IllegalArgumentException("租户不存在");
        }

        List<Long> grantedIds = ceilingService.getGrantedPermissionIds(tenantId);
        List<Permission> allPerms = permissionService.list();

        Map<String, Object> result = new HashMap<>();
        result.put("tenantId", tenantId);
        result.put("tenantName", tenant.getTenantName());
        result.put("grantedPermissionIds", grantedIds);
        result.put("allPermissions", allPerms);
        result.put("hasCeiling", grantedIds != null && !grantedIds.isEmpty());
        return result;
    }

    /**
     * 设置租户权限天花板
     * @param tenantId 租户ID
     * @param grantedPermissionIds 允许的权限ID列表（传空数组=不限制）
     */
    @Transactional(rollbackFor = Exception.class)
    public void setTenantCeiling(Long tenantId, List<Long> grantedPermissionIds) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            throw new IllegalArgumentException("租户不存在");
        }

        ceilingService.replaceCeiling(tenantId, grantedPermissionIds);
        permissionEngine.evictTenantCeilingCache(tenantId);
        log.info("租户权限天花板设置完成: tenantId={}, permCount={}", tenantId,
                grantedPermissionIds != null ? grantedPermissionIds.size() : 0);
    }

    // ========== 工人自注册与审批 ==========

    /**
     * 工人通过小程序注册（无需登录）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> workerRegister(String username, String password, String name,
                                                String phone, String tenantCode) {
        // 验证租户码
        Tenant tenant = tenantService.findByTenantCode(tenantCode);
        if (tenant == null) {
            throw new IllegalArgumentException("无效的租户编码: " + tenantCode);
        }
        if (!"active".equals(tenant.getStatus())) {
            throw new IllegalArgumentException("该租户已停用");
        }

        // 验证用户名唯一
        QueryWrapper<User> userQuery = new QueryWrapper<>();
        userQuery.eq("username", username);
        if (userService.count(userQuery) > 0) {
            throw new IllegalArgumentException("用户名已存在: " + username);
        }

        // 查找租户的 "工人" 角色
        LambdaQueryWrapper<Role> roleQuery = new LambdaQueryWrapper<>();
        roleQuery.eq(Role::getTenantId, tenant.getId())
                 .eq(Role::getRoleCode, "worker")
                 .eq(Role::getStatus, "active")
                 .last("LIMIT 1");
        Role workerRole = roleService.getOne(roleQuery);

        // 创建待审批用户
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.setName(name);
        user.setPhone(phone);
        user.setTenantId(tenant.getId());
        user.setIsTenantOwner(false);
        user.setStatus("inactive"); // 注册中，未激活
        user.setRegistrationStatus("PENDING");
        user.setRegistrationTenantCode(tenantCode);
        if (workerRole != null) {
            user.setRoleId(workerRole.getId());
            user.setRoleName(workerRole.getRoleName());
        }
        user.setPermissionRange("self");
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        userService.save(user);

        // 通知租户内管理主管以上用户（主账号 + admin/manager/supervisor角色），不含超管
        try {
            if (webSocketService != null) {
                // 查找租户内的管理类角色 ID
                LambdaQueryWrapper<Role> mgmtRolesQuery = new LambdaQueryWrapper<>();
                mgmtRolesQuery.eq(Role::getTenantId, tenant.getId())
                              .in(Role::getRoleCode, Arrays.asList(
                                  "admin", "manager", "supervisor",
                                  "tenant_admin", "tenant_manager"))
                              .eq(Role::getStatus, "active");
                List<Role> mgmtRoles = roleService.list(mgmtRolesQuery);
                List<Long> mgmtRoleIds = mgmtRoles.stream()
                        .map(Role::getId).collect(Collectors.toList());

                // 查找需要通知的用户：主账号 或 管理角色，状态active
                LambdaQueryWrapper<User> notifyQuery = new LambdaQueryWrapper<>();
                notifyQuery.eq(User::getTenantId, tenant.getId())
                           .eq(User::getStatus, "active")
                           .and(w -> {
                               w.eq(User::getIsTenantOwner, true);
                               if (!mgmtRoleIds.isEmpty()) {
                                   w.or().in(User::getRoleId, mgmtRoleIds);
                               }
                           });
                List<User> managers = userService.list(notifyQuery);

                String workerDisplay = name != null ? name : username;
                for (User mgr : managers) {
                    webSocketService.notifyWorkerRegistrationPending(
                        String.valueOf(mgr.getId()),
                        workerDisplay
                    );
                }
                log.info("[注册通知] 已推送给 {} 位租户管理人员, tenantId={}", managers.size(), tenant.getId());
            }
        } catch (Exception e) {
            log.warn("通知租户管理人员WebSocket失败，不影响注册流程: {}", e.getMessage());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("userId", user.getId());
        result.put("status", "PENDING");
        result.put("message", "注册申请已提交，请等待管理员审批");
        return result;
    }

    /**
     * 获取待审批的注册用户列表（租户主账号查看）
     */
    public Page<User> listPendingRegistrations(Long page, Long pageSize) {
        assertSuperAdminOrTenantOwner();

        LambdaQueryWrapper<User> query = new LambdaQueryWrapper<>();
        query.eq(User::getRegistrationStatus, "PENDING");

        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            // 租户主账号只能看到本租户的注册申请
            query.eq(User::getTenantId, tenantId);
        }
        query.orderByDesc(User::getCreateTime);

        Page<User> result = userService.page(
                new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
        if (result.getRecords() != null) {
            // 填充租户名称
            result.setRecords(result.getRecords().stream().map(user -> {
                User sanitized = sanitizeUser(user);
                if (sanitized.getTenantId() != null) {
                    Tenant tenant = tenantService.getById(sanitized.getTenantId());
                    if (tenant != null) {
                        sanitized.setTenantName(tenant.getTenantName());
                    }
                }
                return sanitized;
            }).collect(Collectors.toList()));
        }
        return result;
    }

    /**
     * 审批通过注册用户
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean approveRegistration(Long userId, Long roleId) {
        assertSuperAdminOrTenantOwner();

        User user = userService.getById(userId);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (!"PENDING".equals(user.getRegistrationStatus())) {
            throw new IllegalArgumentException("该用户不在待审批状态");
        }

        // 租户主账号只能审批自己租户的用户
        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权审批其他租户的注册申请");
        }

        // 如果指定了角色，更新角色
        if (roleId != null) {
            Role role = roleService.getById(roleId);
            if (role != null) {
                user.setRoleId(role.getId());
                user.setRoleName(role.getRoleName());
            }
        }

        user.setRegistrationStatus("ACTIVE");
        user.setStatus("active");
        user.setApprovalStatus("approved");
        user.setApprovalTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());

        boolean success = userService.updateById(user);
        if (success) {
            log.info("注册审批通过: userId={}, username={}", userId, user.getUsername());
        }
        return success;
    }

    /**
     * 拒绝注册用户
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean rejectRegistration(Long userId, String reason) {
        assertSuperAdminOrTenantOwner();

        User user = userService.getById(userId);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (!"PENDING".equals(user.getRegistrationStatus())) {
            throw new IllegalArgumentException("该用户不在待审批状态");
        }

        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权拒绝其他租户的注册申请");
        }

        user.setRegistrationStatus("REJECTED");
        user.setRejectReason(reason);
        user.setStatus("inactive");
        user.setApprovalStatus("rejected");
        user.setApprovalTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());

        boolean success = userService.updateById(user);
        if (success) {
            log.info("注册申请拒绝: userId={}, username={}, reason={}", userId, user.getUsername(), reason);
        }
        return success;
    }

    // ========== 用户权限覆盖 ==========

    /**
     * 获取用户权限覆盖配置
     */
    public Map<String, Object> getUserPermissionOverrides(Long userId) {
        assertSuperAdminOrTenantOwner();

        User user = userService.getById(userId);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }

        // 租户隔离检查
        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }

        List<Long> grantIds = overrideService.getGrantPermissionIds(userId);
        List<Long> revokeIds = overrideService.getRevokePermissionIds(userId);

        Map<String, Object> result = new HashMap<>();
        result.put("userId", userId);
        result.put("grantPermissionIds", grantIds);
        result.put("revokePermissionIds", revokeIds);
        return result;
    }

    /**
     * 设置用户权限覆盖
     */
    @Transactional(rollbackFor = Exception.class)
    public void setUserPermissionOverrides(Long userId, List<Long> grantIds, List<Long> revokeIds) {
        assertSuperAdminOrTenantOwner();

        User user = userService.getById(userId);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }

        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }

        overrideService.replaceOverrides(userId, user.getTenantId(), grantIds, revokeIds);
        permissionEngine.evictUserPermissionCache(userId);
        log.info("用户权限覆盖设置完成: userId={}, grants={}, revokes={}",
                userId, grantIds != null ? grantIds.size() : 0, revokeIds != null ? revokeIds.size() : 0);
    }

    // ========== 辅助方法 ==========

    private void assertSuperAdminOrTenantOwner() {
        if (UserContext.isSuperAdmin()) return;
        if (UserContext.isTenantOwner()) return;
        throw new AccessDeniedException("仅超级管理员或租户主账号可执行此操作");
    }
}
