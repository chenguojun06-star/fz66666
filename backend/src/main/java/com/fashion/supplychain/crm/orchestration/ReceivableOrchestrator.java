package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.service.CustomerService;
import com.fashion.supplychain.crm.service.ReceivableService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 应收账款编排层
 * 独立编排器，处理 AR 创建、收款确认、逾期标记等业务逻辑
 */
@Slf4j
@Service
public class ReceivableOrchestrator {

    @Autowired
    private ReceivableService receivableService;

    @Autowired
    private CustomerService customerService;

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    // ─── 查询 ────────────────────────────────────────────────────────────────

    public IPage<Receivable> list(Map<String, Object> params) {
        int page      = parseInt(params.get("page"), 1);
        int pageSize  = parseInt(params.get("pageSize"), 20);
        String customerId = (String) params.get("customerId");
        String status     = (String) params.get("status");

        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<Receivable> qw = new LambdaQueryWrapper<Receivable>()
                .eq(Receivable::getDeleteFlag, 0)
                .eq(tenantId != null, Receivable::getTenantId, tenantId)
                .eq(StringUtils.hasText(customerId), Receivable::getCustomerId, customerId)
                .eq(StringUtils.hasText(status), Receivable::getStatus, status)
                .orderByDesc(Receivable::getCreateTime);

        return receivableService.page(new Page<>(page, pageSize), qw);
    }

    public Receivable getById(String id) {
        return receivableService.getById(id);
    }

    /**
     * 统计信息：逾期金额、待收合计、本月新增
     */
    public Map<String, Object> getStats() {
        Long tenantId = UserContext.tenantId();
        List<Receivable> all = receivableService.list(
                new LambdaQueryWrapper<Receivable>()
                        .eq(Receivable::getDeleteFlag, 0)
                        .eq(tenantId != null, Receivable::getTenantId, tenantId));

        BigDecimal totalPending = BigDecimal.ZERO;
        BigDecimal totalOverdue = BigDecimal.ZERO;
        long overdueCount = 0;
        LocalDate today = LocalDate.now();
        LocalDate firstOfMonth = today.withDayOfMonth(1);

        for (Receivable r : all) {
            BigDecimal remaining = r.getAmount().subtract(
                    r.getReceivedAmount() != null ? r.getReceivedAmount() : BigDecimal.ZERO);
            if ("PENDING".equals(r.getStatus()) || "PARTIAL".equals(r.getStatus())) {
                totalPending = totalPending.add(remaining);
                if (r.getDueDate() != null && r.getDueDate().isBefore(today)) {
                    totalOverdue = totalOverdue.add(remaining);
                    overdueCount++;
                }
            }
        }

        long newThisMonth = all.stream()
                .filter(r -> r.getCreateTime() != null
                        && r.getCreateTime().toLocalDate().compareTo(firstOfMonth) >= 0)
                .count();

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalPending", totalPending);
        stats.put("totalOverdue", totalOverdue);
        stats.put("overdueCount", overdueCount);
        stats.put("newThisMonth", newThisMonth);
        return stats;
    }

    // ─── 写操作 ──────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public Receivable create(Receivable receivable) {
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();

        receivable.setReceivableNo("AR" + LocalDateTime.now().format(NO_FMT));
        receivable.setTenantId(tenantId);
        receivable.setDeleteFlag(0);
        receivable.setStatus("PENDING");
        if (receivable.getReceivedAmount() == null) {
            receivable.setReceivedAmount(BigDecimal.ZERO);
        }
        if (ctx != null) {
            receivable.setCreatorId(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
            receivable.setCreatorName(ctx.getUsername());
        }

        // 回填客户名称
        if (receivable.getCustomerId() != null && !StringUtils.hasText(receivable.getCustomerName())) {
            Customer customer = customerService.getById(receivable.getCustomerId());
            if (customer != null) {
                receivable.setCustomerName(customer.getCompanyName());
            }
        }

        receivableService.save(receivable);
        log.info("[ReceivableOrchestrator] 新建应收单 {} 金额 {}", receivable.getReceivableNo(), receivable.getAmount());
        return receivable;
    }

    /**
     * 从订单直接生成应收单（快捷入口）
     */
    @Transactional(rollbackFor = Exception.class)
    public Receivable generateFromOrder(String customerId, String orderId, String orderNo,
                                        BigDecimal amount, LocalDate dueDate, String description) {
        Receivable r = new Receivable();
        r.setCustomerId(customerId);
        r.setOrderId(orderId);
        r.setOrderNo(orderNo);
        r.setAmount(amount);
        r.setDueDate(dueDate);
        r.setDescription(description);
        return create(r);
    }

    /**
     * 登记到账：增加已收金额，自动更新状态
     */
    @Transactional(rollbackFor = Exception.class)
    public Receivable markReceived(String id, BigDecimal paymentAmount) {
        Receivable r = receivableService.getById(id);
        if (r == null) throw new RuntimeException("应收单不存在");
        if ("PAID".equals(r.getStatus())) throw new RuntimeException("该应收单已结清，无法重复收款");

        BigDecimal newReceived = (r.getReceivedAmount() != null ? r.getReceivedAmount() : BigDecimal.ZERO)
                .add(paymentAmount);
        r.setReceivedAmount(newReceived);

        if (newReceived.compareTo(r.getAmount()) >= 0) {
            r.setStatus("PAID");
        } else {
            r.setStatus("PARTIAL");
        }

        receivableService.updateById(r);
        log.info("[ReceivableOrchestrator] 应收单 {} 登记到账 {}，状态更新为 {}", id, paymentAmount, r.getStatus());
        return r;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(String id) {
        Receivable r = new Receivable();
        r.setId(id);
        r.setDeleteFlag(1);
        receivableService.updateById(r);
    }

    /**
     * 定时标记逾期：PENDING/PARTIAL 且 due_date < today → OVERDUE
     * 可由 @Scheduled 任务每日调用，也可按需手动触发
     */
    @Transactional(rollbackFor = Exception.class)
    public int markOverdue() {
        List<Receivable> list = receivableService.list(
                new LambdaQueryWrapper<Receivable>()
                        .eq(Receivable::getDeleteFlag, 0)
                        .in(Receivable::getStatus, "PENDING", "PARTIAL")
                        .lt(Receivable::getDueDate, LocalDate.now()));
        int count = 0;
        for (Receivable r : list) {
            r.setStatus("OVERDUE");
            receivableService.updateById(r);
            count++;
        }
        if (count > 0) {
            log.info("[ReceivableOrchestrator] 批量标记逾期 {} 条", count);
        }
        return count;
    }

    // ─── 工具方法 ────────────────────────────────────────────────────────────

    private int parseInt(Object val, int def) {
        if (val == null) return def;
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { return def; }
    }
}
