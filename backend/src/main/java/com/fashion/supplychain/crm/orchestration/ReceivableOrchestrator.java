package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.entity.ReceivableReceiptLog;
import com.fashion.supplychain.crm.helper.ReceivableLogAppendHelper;
import com.fashion.supplychain.crm.service.CustomerService;
import com.fashion.supplychain.crm.service.ReceivableService;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.service.BillAggregationService;
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

    @Autowired
    private ReceivableReceiptOrchestrator receivableReceiptOrchestrator;

    @Autowired
    private BillAggregationService billAggregationService;

    @Autowired
    private ReceivableLogAppendHelper logAppendHelper;

    /** 懒加载避免与 BillAggregationOrchestrator 循环依赖 */
    @Autowired
    @org.springframework.context.annotation.Lazy
    private com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator billAggregationOrchestrator;

    /** D-753：应收确认后自动生成草稿发票（发票台账智能化，fail-safe 内置不阻塞主流程） */
    @Autowired
    private com.fashion.supplychain.finance.orchestration.InvoiceOrchestrator invoiceOrchestrator;

    @Autowired
    private com.fashion.supplychain.finance.orchestration.AccountingVoucherOrchestrator accountingVoucherOrchestrator;

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final java.util.concurrent.atomic.AtomicInteger NO_SEQ = new java.util.concurrent.atomic.AtomicInteger(0);

    // ─── 查询 ────────────────────────────────────────────────────────────────

    public IPage<Receivable> list(Map<String, Object> params) {
        int page      = parseInt(params.get("page"), 1);
        int pageSize  = parseInt(params.get("pageSize"), 20);
        String customerId = (String) params.get("customerId");
        String status     = (String) params.get("status");
        String keyword = strOf(params.get("keyword"));
        String sourceBizType = strOf(params.get("sourceBizType"));
        String sourceBizNo = strOf(params.get("sourceBizNo"));
        String styleNo = strOf(params.get("styleNo"));

        Long tenantId = UserContext.tenantId();

        // P0 修复（铁律4 多租户隔离）：工厂账号不应看到应收账款（属于租户级财务数据）
        // 与 WagePaymentController.listPendingPayables 的工厂账号禁用策略保持一致
        if (DataPermissionHelper.isFactoryAccount()) {
            return new Page<>(page, pageSize);
        }

        LambdaQueryWrapper<Receivable> qw = new LambdaQueryWrapper<Receivable>()
                .eq(Receivable::getDeleteFlag, 0)
                .eq(Receivable::getTenantId, tenantId)
                .eq(StringUtils.hasText(customerId), Receivable::getCustomerId, customerId)
                .eq(StringUtils.hasText(status), Receivable::getStatus, status)
                .eq(StringUtils.hasText(sourceBizType), Receivable::getSourceBizType, sourceBizType)
                .like(StringUtils.hasText(sourceBizNo), Receivable::getSourceBizNo, sourceBizNo)
                // 【v2】支持款号精确/模糊搜索（orderNo 通常承载款号）
                .like(StringUtils.hasText(styleNo), Receivable::getOrderNo, styleNo)
                .and(StringUtils.hasText(keyword), q -> q
                        .like(Receivable::getReceivableNo, keyword)
                        .or().like(Receivable::getCustomerName, keyword)
                        .or().like(Receivable::getOrderNo, keyword)
                        .or().like(Receivable::getSourceBizNo, keyword))
                .orderByDesc(Receivable::getCreateTime);

        return receivableService.page(new Page<>(page, pageSize), qw);
    }

    /** v2: 按款号(或部分款号)查询收款状态 */
    public Map<String, Object> queryByStyleNo(String styleNo) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> result = new HashMap<>();
        result.put("styleNo", styleNo);

        if (!StringUtils.hasText(styleNo)) {
            result.put("error", "请提供款号");
            return result;
        }

        List<Receivable> list = receivableService.lambdaQuery()
                .eq(Receivable::getTenantId, tenantId)
                .eq(Receivable::getDeleteFlag, 0)
                .like(Receivable::getOrderNo, styleNo)
                .last("LIMIT 20")
                .list();

        result.put("total", list.size());
        if (list.isEmpty()) {
            result.put("summary", "未找到该款号对应的应收单，请确认款号是否正确。");
            return result;
        }

        BigDecimal totalAmount = BigDecimal.ZERO;
        BigDecimal totalReceived = BigDecimal.ZERO;
        int pendingCount = 0, partialCount = 0, paidCount = 0, overdueCount = 0;
        java.util.List<Map<String, Object>> items = new java.util.ArrayList<>();

        for (Receivable r : list) {
            totalAmount = totalAmount.add(safeAmount(r.getAmount()));
            totalReceived = totalReceived.add(safeAmount(r.getReceivedAmount()));
            switch (r.getStatus()) {
                case "PENDING" -> pendingCount++;
                case "PARTIAL" -> partialCount++;
                case "PAID" -> paidCount++;
                case "OVERDUE" -> overdueCount++;
            }
            Map<String, Object> item = new HashMap<>();
            item.put("receivableNo", r.getReceivableNo());
            item.put("orderNo", r.getOrderNo());
            item.put("customerName", r.getCustomerName());
            item.put("amount", safeAmount(r.getAmount()));
            item.put("receivedAmount", safeAmount(r.getReceivedAmount()));
            item.put("status", r.getStatus());
            item.put("dueDate", r.getDueDate());
            items.add(item);
        }

        result.put("items", items);
        result.put("totalAmount", totalAmount);
        result.put("totalReceivedAmount", totalReceived);
        result.put("pendingCount", pendingCount);
        result.put("partialCount", partialCount);
        result.put("paidCount", paidCount);
        result.put("overdueCount", overdueCount);
        result.put("summary", String.format(
                "款号 [%s] 共 %d 笔应收：总额 %.2f，已收 %.2f，待收款 %.2f。状态分布：待收款 %d，部分到账 %d，已结清 %d，逾期 %d。",
                styleNo, list.size(), totalAmount, totalReceived,
                totalAmount.subtract(totalReceived),
                pendingCount, partialCount, paidCount, overdueCount
        ));
        return result;
    }

    private static BigDecimal safeAmount(BigDecimal val) {
        return val != null ? val : BigDecimal.ZERO;
    }

    public Receivable getById(String id) {
        Long tenantId = UserContext.tenantId();
        return receivableService.lambdaQuery()
                .eq(Receivable::getId, id)
                .eq(Receivable::getTenantId, tenantId)
                .eq(Receivable::getDeleteFlag, 0)
                .one();
    }

    public Receivable findByBillAggregationId(String billAggregationId) {
        if (!StringUtils.hasText(billAggregationId)) {
            return null;
        }
        Long tenantId = UserContext.tenantId();
        return receivableService.lambdaQuery()
                .eq(Receivable::getBillAggregationId, billAggregationId)
                .eq(Receivable::getDeleteFlag, 0)
                .eq(Receivable::getTenantId, tenantId)
                .last("LIMIT 1")
                .one();
    }

    /**
     * D-513：按来源业务（sourceBizType + sourceBizId）查应收单。
     *
     * <p>用于账单侧反向定位：出库等上游在推送账单的同时可能已由
     * {@code OutstockReceivableHelper} 建过应收单（那条记录只带 sourceBiz*、不带
     * billAggregationId），仅按账单ID查会漏掉它、进而重复建单或报错。
     */
    public Receivable findBySourceBiz(String sourceBizType, String sourceBizId) {
        if (!StringUtils.hasText(sourceBizType) || !StringUtils.hasText(sourceBizId)) {
            return null;
        }
        Long tenantId = UserContext.tenantId();
        return receivableService.lambdaQuery()
                .eq(Receivable::getSourceBizType, sourceBizType)
                .eq(Receivable::getSourceBizId, sourceBizId)
                .eq(Receivable::getDeleteFlag, 0)
                .eq(Receivable::getTenantId, tenantId)
                .last("LIMIT 1")
                .one();
    }

    public Map<String, Object> getDetail(String id) {
        Receivable receivable = getById(id);
        if (receivable == null) {
            throw new RuntimeException("应收单不存在");
        }
        List<ReceivableReceiptLog> receiptLogs = receivableReceiptOrchestrator.listByReceivableId(id);
        Map<String, Object> result = new HashMap<>();
        result.put("receivable", receivable);
        result.put("receiptLogs", receiptLogs);
        return result;
    }

    /**
     * 统计信息：逾期金额、待收合计、本月新增
     */
    public Map<String, Object> getStats() {
        Long tenantId = UserContext.tenantId();

        // P0 修复（铁律4 多租户隔离）：工厂账号不应看到应收账款（属于租户级财务数据）
        // 与 list 接口的工厂账号禁用策略保持一致
        if (DataPermissionHelper.isFactoryAccount()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("totalPending", BigDecimal.ZERO);
            empty.put("totalOverdue", BigDecimal.ZERO);
            empty.put("overdueCount", 0L);
            empty.put("newThisMonth", 0L);
            return empty;
        }

        List<Receivable> all = receivableService.list(
                new LambdaQueryWrapper<Receivable>()
                        .eq(Receivable::getDeleteFlag, 0)
                        .eq(Receivable::getTenantId, tenantId));

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
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();

        if (receivable.getSourceBizType() != null && receivable.getSourceBizId() != null) {
            Receivable existing = receivableService.lambdaQuery()
                    .eq(Receivable::getSourceBizType, receivable.getSourceBizType())
                    .eq(Receivable::getSourceBizId, receivable.getSourceBizId())
                    .eq(Receivable::getDeleteFlag, 0)
                    .eq(Receivable::getTenantId, tenantId)
                    .last("LIMIT 1")
                    .one();
            if (existing != null) {
                log.info("[ReceivableOrchestrator] 应收单已存在: sourceBizType={}, sourceBizId={}, no={}",
                         receivable.getSourceBizType(), receivable.getSourceBizId(), existing.getReceivableNo());
                return existing;
            }
        }

        receivable.setReceivableNo("AR" + LocalDateTime.now().format(NO_FMT) + String.format("%03d", NO_SEQ.incrementAndGet() % 1000));
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

        if (receivable.getCustomerId() != null && !StringUtils.hasText(receivable.getCustomerName())) {
            Customer customer = customerService.lambdaQuery()
                    .eq(Customer::getId, receivable.getCustomerId())
                    .eq(Customer::getDeleteFlag, 0)
                    .eq(Customer::getTenantId, tenantId)
                    .one();
            if (customer != null) {
                receivable.setCustomerName(customer.getCompanyName());
            }
        }

        receivableService.save(receivable);
        log.info("[ReceivableOrchestrator] 新建应收单 {} 金额 {}", receivable.getReceivableNo(), receivable.getAmount());
        logAppendHelper.appendCreate(receivable, ctx != null ? ctx.getUsername() : null);
        // D-753：发票台账智能化——每张应收确认即自动带出草稿发票（幂等，内部 fail-safe 不阻塞）
        invoiceOrchestrator.generateDraftFromReceivable(receivable);
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

    @Transactional(rollbackFor = Exception.class)
    public Receivable createFromBill(BillAggregation bill) {
        if (bill == null || !StringUtils.hasText(bill.getId())) {
            throw new RuntimeException("账单不存在，无法派生应收任务");
        }
        Receivable existing = findByBillAggregationId(bill.getId());
        if (existing != null) {
            return existing;
        }

        /*
         * D-513：客户解析改为两级，与 OutstockReceivableHelper 同口径。
         *
         * 背景（生产 500 的根因）：
         *   成品出库单 t_product_outstock 只登记 customer_name（无 customer_id 列），
         *   推送账单时 counterparty_id 因此为空；而 t_receivable.customer_id 是
         *   NOT NULL 且无默认值 → MyBatis-Plus 对 null 字段不写列 → 插入报
         *   "Field 'customer_id' doesn't have a default value"。
         *   该异常会标记整个事务 rollback-only，导致 batchConfirm 的
         *   try/catch 失效，最终 UnexpectedRollbackException → 前端 500。
         *
         * 修法：① 优先用账单携带的对方ID；② 缺失时按对方名称在租户内全等匹配客户档案。
         *       两者都拿不到时不抛异常（派生是确认账单的副作用，不应阻断确认本身），
         *       仅告警跳过——与 OutstockReceivableHelper 的处理保持一致。
         */
        String customerId = bill.getCounterpartyId();
        if (!StringUtils.hasText(customerId) && StringUtils.hasText(bill.getCounterpartyName())) {
            Customer byName = resolveCustomerByExactName(bill.getCounterpartyName(), UserContext.tenantId());
            if (byName != null) {
                customerId = byName.getId();
                log.info("[BillAggregation] 账单未携带对方ID，按对方名称匹配客户档案: billNo={}, name={}, customerId={}",
                        bill.getBillNo(), bill.getCounterpartyName(), customerId);
            }
        }
        if (!StringUtils.hasText(customerId)) {
            log.warn("[BillAggregation] 无法确定客户（账单无对方ID且名称未匹配到客户档案），跳过应收派生: billNo={}, name={}",
                    bill.getBillNo(), bill.getCounterpartyName());
            return null;
        }

        Receivable r = new Receivable();
        r.setCustomerId(customerId);
        r.setCustomerName(bill.getCounterpartyName());
        r.setOrderId(bill.getOrderId());
        r.setOrderNo(StringUtils.hasText(bill.getOrderNo()) ? bill.getOrderNo() : bill.getSourceNo());
        r.setAmount(bill.getAmount() == null ? BigDecimal.ZERO : bill.getAmount());
        r.setReceivedAmount(bill.getSettledAmount() == null ? BigDecimal.ZERO : bill.getSettledAmount());
        r.setDescription("账单派生: " + bill.getBillNo() + " / " + bill.getBillCategory());
        r.setSourceBizType(bill.getSourceType());
        r.setSourceBizId(bill.getSourceId());
        r.setSourceBizNo(bill.getSourceNo());
        r.setBillAggregationId(bill.getId());
        return create(r);
    }

    /**
     * 按对方名称在租户内<b>全等匹配</b>客户档案。
     *
     * <p>⚠️ 刻意用全等（eq）而非 like：like 会把「甲公司」的账单误挂到「甲公司分公司」，
     * 重蹈 E-P0-1 跨客户数据泄露的覆辙。同名多客户时告警并取最早创建的一条。
     * <p>与 {@code OutstockReceivableHelper.resolveCustomerByExactName} 同口径。
     */
    private Customer resolveCustomerByExactName(String customerName, Long tenantId) {
        if (!StringUtils.hasText(customerName) || tenantId == null) {
            return null;
        }
        String name = customerName.trim();
        long count = customerService.lambdaQuery()
                .eq(Customer::getCompanyName, name)
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .count();
        if (count == 0) {
            return null;
        }
        if (count > 1) {
            log.warn("[BillAggregation] 客户档案存在 {} 个同名客户「{}」，取第一个（建议在客户档案里去重）", count, name);
        }
        return customerService.lambdaQuery()
                .eq(Customer::getCompanyName, name)
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .orderByAsc(Customer::getCreateTime)
                .last("LIMIT 1")
                .one();
    }

    /**
     * 登记到账：增加已收金额，自动更新状态
     */
    @Transactional(rollbackFor = Exception.class)
    public Receivable markReceived(String id, BigDecimal paymentAmount) {
        return markReceived(id, paymentAmount, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Receivable markReceived(String id, BigDecimal paymentAmount, String remark) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Receivable r = receivableService.lambdaQuery()
                .eq(Receivable::getId, id)
                .eq(Receivable::getTenantId, tenantId)
                .eq(Receivable::getDeleteFlag, 0)
                .one();
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
        ReceivableReceiptLog receiptLog = receivableReceiptOrchestrator.recordReceipt(r, paymentAmount, remark);
        syncBillAggregationAfterReceipt(r, paymentAmount);
        log.info("[ReceivableOrchestrator] 应收单 {} 登记到账 {}，状态更新为 {}", id, paymentAmount, r.getStatus());
        logAppendHelper.appendMarkReceived(r, paymentAmount, UserContext.username());
        // D-513：收款要记会计凭证（借 银行存款/库存现金、贷 应收账款），
        // 与应付付款凭证（借 应付账款、贷 银行存款）方向相反。
        generateReceiptVoucherSafely(r, receiptLog, paymentAmount);
        // D-753：结清时兜底补草稿——覆盖本功能上线前的历史应收（幂等，已有发票不重建）
        if ("PAID".equals(r.getStatus())) {
            invoiceOrchestrator.generateDraftFromReceivable(r);
        }
        return r;
    }

    /**
     * D-513：生成收款凭证（客户付给我们）。
     *
     * <p>会计口径与付款相反：<b>借 银行存款/库存现金、贷 应收账款</b>——
     * {@code AccountingVoucherOrchestrator.resolvePaymentSubjects} 已按 billType 区分方向，
     * 这里只需把账单 ID 与幂等键传对。
     *
     * <p>幂等键用<b>收款流水 ID</b>（一次收款一张凭证），与应付侧用 paymentId 同口径，
     * 避免原先"按 账单+金额"做幂等时两次同额部分收款互相顶掉。
     *
     * <p>非阻塞：凭证失败（如科目映射未配置）只告警，不影响收款主流程。
     */
    private void generateReceiptVoucherSafely(Receivable receivable, ReceivableReceiptLog receiptLog,
                                              BigDecimal amount) {
        if (accountingVoucherOrchestrator == null || receiptLog == null
                || !StringUtils.hasText(receiptLog.getId())) {
            return;
        }
        try {
            String billId = receivable.getBillAggregationId();
            if (!StringUtils.hasText(billId)
                    && StringUtils.hasText(receivable.getSourceBizType())
                    && StringUtils.hasText(receivable.getSourceBizId())
                    && billAggregationOrchestrator != null) {
                // 出库等上游直接建的应收单（OutstockReceivableHelper）没回填账单ID，按来源业务反查
                com.fashion.supplychain.finance.entity.BillAggregation bill =
                        billAggregationOrchestrator.findBySource(
                                receivable.getSourceBizType(), receivable.getSourceBizId());
                billId = bill == null ? null : bill.getId();
            }
            if (!StringUtils.hasText(billId)) {
                log.warn("[ReceivableOrchestrator] 收款凭证跳过（应收单未关联账单）: receivableNo={}",
                        receivable.getReceivableNo());
                return;
            }
            accountingVoucherOrchestrator.generatePaymentVoucher(billId, receiptLog.getId(), amount, "OFFLINE");
        } catch (Exception e) {
            log.warn("[ReceivableOrchestrator] 收款凭证生成失败（不影响收款）: receivableNo={}, err={}",
                    receivable.getReceivableNo(), e.getMessage());
        }
    }

    private void syncBillAggregationAfterReceipt(Receivable receivable, BigDecimal paymentAmount) {
        if (receivable == null) {
            return;
        }
        // P1 修复：优先使用官方 BillAggregationOrchestrator.syncSettledAmountBySource API
        // - Receivable.sourceBizType/sourceBizId 对应 BillAggregation.sourceType/sourceId
        // - 复用终态保护、日志审计、自动结清逻辑
        if (billAggregationOrchestrator != null
                && StringUtils.hasText(receivable.getSourceBizType())
                && StringUtils.hasText(receivable.getSourceBizId())) {
            try {
                BigDecimal newSettled = receivable.getReceivedAmount() != null
                        ? receivable.getReceivedAmount() : BigDecimal.ZERO;
                billAggregationOrchestrator.syncSettledAmountBySource(
                        receivable.getSourceBizType(), receivable.getSourceBizId(), newSettled);
                log.info("[ReceivableOrchestrator] 收款联动账单 settledAmount: receivableNo={}, sourceBizType={}, sourceBizId={}, settled={}",
                        receivable.getReceivableNo(), receivable.getSourceBizType(),
                        receivable.getSourceBizId(), newSettled);
            } catch (Exception e) {
                log.warn("[ReceivableOrchestrator] 收款联动账单失败（不阻塞主流程）: receivableNo={}, err={}",
                        receivable.getReceivableNo(), e.getMessage());
            }
            return;
        }
        // 兜底：无 sourceBizType/sourceBizId 时回退到直接更新 BillAggregation
        syncBillAggregationAfterReceiptLegacy(receivable, paymentAmount);
    }

    /**
     * 旧逻辑兜底：无 sourceBizType/sourceBizId 时直接更新 BillAggregation 表
     * 仅用于兼容历史数据，新数据应通过 pushBill 派生 Receivable 自动携带 sourceBizType/sourceBizId
     */
    private void syncBillAggregationAfterReceiptLegacy(Receivable receivable, BigDecimal paymentAmount) {
        if (receivable == null || !StringUtils.hasText(receivable.getBillAggregationId())) {
            return;
        }
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getId, receivable.getBillAggregationId())
                .eq(BillAggregation::getTenantId, receivable.getTenantId())
                .one();
        if (bill == null || bill.getDeleteFlag() == null || bill.getDeleteFlag() != 0) {
            return;
        }
        BigDecimal settled = bill.getSettledAmount() == null ? BigDecimal.ZERO : bill.getSettledAmount();
        BigDecimal add = paymentAmount == null ? BigDecimal.ZERO : paymentAmount;
        settled = settled.add(add);
        if (bill.getAmount() != null && settled.compareTo(bill.getAmount()) > 0) {
            settled = bill.getAmount();
        }
        bill.setSettledAmount(settled);
        if (bill.getAmount() != null && settled.compareTo(bill.getAmount()) >= 0) {
            bill.setStatus("SETTLED");
            bill.setSettledAt(LocalDateTime.now());
            bill.setSettledById(UserContext.userId());
            bill.setSettledByName(UserContext.username());
        } else {
            bill.setStatus("SETTLING");
        }
        billAggregationService.updateById(bill);
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Receivable existing = receivableService.lambdaQuery()
                .eq(Receivable::getId, id)
                .eq(Receivable::getDeleteFlag, 0)
                .eq(Receivable::getTenantId, tenantId)
                .one();
        if (existing != null) {
            logAppendHelper.appendDelete(existing, UserContext.username());
        }
        receivableService.lambdaUpdate()
                .eq(Receivable::getId, id)
                .eq(Receivable::getTenantId, tenantId)
                .remove();
    }

    /**
     * 反向账单联动：更新应收单状态（仅用于 BillAggregation.reverseBillInternal 联动调用）
     * 不走 markReceived 流程，仅回写状态和备注，保留财务痕迹
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateReceivableStatus(Receivable receivable) {
        if (receivable == null || !StringUtils.hasText(receivable.getId())) {
            return;
        }
        Long tenantId = UserContext.tenantId();
        Receivable existing = receivableService.lambdaQuery()
                .eq(Receivable::getId, receivable.getId())
                .eq(Receivable::getTenantId, tenantId)
                .eq(Receivable::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            log.warn("[ReceivableOrchestrator] 反向联动更新失败：应收单不存在: id={}", receivable.getId());
            return;
        }
        receivableService.updateById(receivable);
        log.info("[ReceivableOrchestrator] 反向联动状态更新: receivableNo={}, newStatus={}",
                existing.getReceivableNo(), receivable.getStatus());
    }

    /**
     * 定时标记逾期：PENDING/PARTIAL 且 due_date < today → OVERDUE
     * <p>
     * P1-3 修复：原实现跨租户批量 update，违反 P0 铁律4多租户隔离
     * 现改为逐条更新（UPDATE 语句显式带 tenant_id WHERE）
     * 由 @Scheduled 任务每日调用，也可按需手动触发
     */
    @Transactional(rollbackFor = Exception.class)
    public int markOverdue() {
        Long tenantId = UserContext.tenantId();
        List<Receivable> list = receivableService.list(
                new LambdaQueryWrapper<Receivable>()
                        .eq(Receivable::getDeleteFlag, 0)
                        .eq(tenantId != null, Receivable::getTenantId, tenantId)
                        .in(Receivable::getStatus, "PENDING", "PARTIAL")
                        .lt(Receivable::getDueDate, LocalDate.now()));
        int count = 0;
        for (Receivable r : list) {
            try {
                // 逐条更新（显式带 id + tenant_id 双重 WHERE，确保多租户隔离）
                boolean updated = receivableService.lambdaUpdate()
                        .eq(Receivable::getId, r.getId())
                        .eq(Receivable::getTenantId, r.getTenantId())
                        .eq(Receivable::getDeleteFlag, 0)
                        .set(Receivable::getStatus, "OVERDUE")
                        .set(Receivable::getUpdateTime, LocalDateTime.now())
                        .update();
                if (updated) {
                    r.setStatus("OVERDUE");
                    logAppendHelper.appendMarkOverdue(r, null);
                    count++;
                }
            } catch (Exception e) {
                log.error("[ReceivableOrchestrator] 标记逾期失败（跳过）: receivableNo={}, tenantId={}, err={}",
                        r.getReceivableNo(), r.getTenantId(), e.getMessage());
            }
        }
        if (count > 0) {
            log.info("[ReceivableOrchestrator] 批量标记逾期 {} 条（按租户隔离逐条更新）", count);
        }
        return count;
    }

    // ─── 工具方法 ────────────────────────────────────────────────────────────

    private int parseInt(Object val, int def) {
        if (val == null) return def;
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { log.debug("[ReceivableOrchestrator] parseInt降级: val={}", val); return def; }
    }

    private String strOf(Object val) {
        if (val == null) {
            return null;
        }
        String text = String.valueOf(val).trim();
        return text.isEmpty() ? null : text;
    }
}
