package com.fashion.supplychain.system.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.TenantBillingRecord;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.orchestration.TenantOrchestrator;
import com.fashion.supplychain.system.service.TenantBillingRecordService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 租户计费助手：套餐、账单、发票管理
 * <p>从 TenantOrchestrator 拆分，事务由编排器层统一控制。</p>
 */
@Component
@Slf4j
public class TenantBillingHelper {

    @Autowired
    private TenantService tenantService;

    @Autowired
    private UserService userService;

    @Autowired
    private TenantBillingRecordService billingRecordService;

    @Autowired(required = false)
    private com.fashion.supplychain.websocket.service.WebSocketService webSocketService;

    @Autowired(required = false)
    private CosService cosService;

    private void assertSuperAdmin() {
        if (!UserContext.isSuperAdmin()) {
            throw new AccessDeniedException("仅超级管理员可执行此操作");
        }
    }

    /**
     * 获取套餐方案定义列表
     */
    public List<Map<String, Object>> getPlanDefinitions() {
        List<Map<String, Object>> result = new ArrayList<>();
        TenantOrchestrator.PLAN_DEFINITIONS.forEach((code, def) -> {
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
        Map<String, Object> planDef = TenantOrchestrator.PLAN_DEFINITIONS.get(planType);
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
        syncStorageUsageQuietly(tenantId);
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
            Map<String, Object> planDef = TenantOrchestrator.PLAN_DEFINITIONS.get(tenant.getPlanType());
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

    /**
     * 租户查看自己的账单概览（无需超管权限）
     * 包含：套餐信息、已用存储/用户、最近6期账单
     */
    public Map<String, Object> getMyBilling() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) throw new IllegalArgumentException("超级管理员无租户账单");

        syncStorageUsageQuietly(tenantId);

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

    private void syncStorageUsageQuietly(Long tenantId) {
        if (tenantId == null || cosService == null) {
            return;
        }
        try {
            cosService.refreshTenantStorageUsage(tenantId);
        } catch (Exception e) {
            log.warn("[TenantBilling] 同步租户存储用量失败 tenantId={}: {}", tenantId, e.getMessage());
        }
    }

    /**
     * 租户申请开票（对已支付账单申请发票）
     * 自动携带租户默认开票信息，也允许本次覆盖
     */
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

}
