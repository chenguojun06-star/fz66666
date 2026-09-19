package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.AccountSubject;
import com.fashion.supplychain.finance.entity.AccountingEntry;
import com.fashion.supplychain.finance.entity.AccountingVoucher;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.entity.BillSubjectMapping;
import com.fashion.supplychain.finance.service.AccountSubjectService;
import com.fashion.supplychain.finance.service.AccountingEntryService;
import com.fashion.supplychain.finance.service.AccountingVoucherService;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.finance.service.BillSubjectMappingService;
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
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 会计凭证编排器 — 从账单自动生成会计凭证（借贷平衡）
 * <p>
 * 核心职责：
 * 1. generateVoucherFromBill() — 从账单生成凭证（幂等，借方+贷方平衡）
 * 2. reverseVoucher() — 冲销凭证（生成红字凭证，借贷互换）
 * 3. reverseByBillAggregationId() — 账单冲销时联动冲销凭证
 * 4. queryVouchers() — 查询凭证列表
 * <p>
 * 关联铁律：P0 #2 事务边界（@Transactional 只在 Orchestrator）/ P0 #4 多租户隔离 / D-022 财务闭环
 */
@Slf4j
@Service
public class AccountingVoucherOrchestrator {

    private static final String VOUCHER_TYPE_JOURNAL = "JOURNAL";
    private static final String VOUCHER_TYPE_REVERSAL = "REVERSAL";
    private static final String STATUS_POSTED = "POSTED";
    private static final String STATUS_REVERSED = "REVERSED";
    private static final String STANDARD_CAS = "CAS";
    private static final AtomicInteger VOUCHER_NO_SEQ = new AtomicInteger(0);

    @Autowired private AccountingVoucherService voucherService;
    @Autowired private AccountingEntryService entryService;
    @Autowired private BillSubjectMappingService mappingService;
    @Autowired private AccountSubjectService subjectService;
    @Autowired private BillAggregationService billAggregationService;

    // ==================== 1. 从账单生成凭证（幂等） ====================

    /**
     * REQUIRES_NEW：凭证生成必须跑在独立事务里。
     * 账单确认（confirmBill）以 fail-safe 方式调用本方法——科目映射缺失等配置问题只降级不阻塞确认；
     * 若加入外层事务，这里抛出的异常会把共享事务标记 rollback-only，外层 catch 也救不回，
     * 提交时炸 UnexpectedRollbackException（实证：PAYABLE/EXPENSE 无科目映射时全部账单确认 500）。
     * 对账单只做快照读，新事务不会与外层事务行锁互等。
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public AccountingVoucher generateVoucherFromBill(String billAggregationId) {
        Long tenantId = TenantAssert.requireTenantId();
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getId, billAggregationId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (bill == null) {
            throw new RuntimeException("账单不存在: " + billAggregationId);
        }
        // 幂等：同一账单不重复生成 JOURNAL 凭证
        AccountingVoucher existing = voucherService.lambdaQuery()
                .eq(AccountingVoucher::getBillAggregationId, billAggregationId)
                .eq(AccountingVoucher::getTenantId, tenantId)
                .eq(AccountingVoucher::getDeleteFlag, 0)
                .eq(AccountingVoucher::getVoucherType, VOUCHER_TYPE_JOURNAL)
                .last("LIMIT 1")
                .one();
        if (existing != null) {
            log.info("[AccountingVoucher] 凭证已存在: billId={}, voucherNo={}", billAggregationId, existing.getVoucherNo());
            return existing;
        }
        // 查映射
        BillSubjectMapping mapping = mappingService.lambdaQuery()
                .eq(BillSubjectMapping::getTenantId, tenantId)
                .eq(BillSubjectMapping::getBillType, bill.getBillType())
                .eq(BillSubjectMapping::getBillCategory, bill.getBillCategory())
                .eq(BillSubjectMapping::getEnabled, 1)
                .eq(BillSubjectMapping::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (mapping == null) {
            throw new RuntimeException("未找到科目映射: " + bill.getBillType() + "/" + bill.getBillCategory());
        }
        // 创建凭证头
        BigDecimal amount = bill.getAmount() != null ? bill.getAmount() : BigDecimal.ZERO;
        String summary = buildSummary(bill);
        AccountingVoucher voucher = new AccountingVoucher();
        voucher.setVoucherNo(generateVoucherNo());
        voucher.setVoucherDate(LocalDate.now());
        voucher.setBillAggregationId(billAggregationId);
        voucher.setSourceType(bill.getSourceType());
        voucher.setSourceId(bill.getSourceId());
        voucher.setSummary(summary);
        voucher.setTotalAmount(amount);
        voucher.setVoucherType(VOUCHER_TYPE_JOURNAL);
        voucher.setStatus(STATUS_POSTED);
        voucher.setAccountingStandard(STANDARD_CAS);
        voucher.setCreateBy(UserContext.username());
        voucher.setTenantId(tenantId);
        voucher.setDeleteFlag(0);
        voucherService.save(voucher);
        // 创建分录（借方 + 贷方，借贷平衡）
        saveEntry(voucher.getId(), 1, mapping.getDebitSubjectCode(), amount, BigDecimal.ZERO, summary, tenantId);
        saveEntry(voucher.getId(), 2, mapping.getCreditSubjectCode(), BigDecimal.ZERO, amount, summary, tenantId);
        log.info("[AccountingVoucher] 生成凭证: voucherNo={}, billNo={}, debit={}, credit={}",
                voucher.getVoucherNo(), bill.getBillNo(), amount, amount);
        return voucher;
    }

    /**
     * D-474 付款凭证的借贷科目（纯函数，便于单测）。
     *
     * <p>借方 = 确认账单时挂的那个应付科目（2202 应付账款 / 2211 应付职工薪酬…），
     * 付款时把它冲掉；贷方 = 银行存款 1002，现金付款记库存现金 1001。
     *
     * @param payableSubjectCode 账单科目映射里的 credit 科目（应付科目）
     * @param paymentMethod      支付方式，CASH 记现金，其余记银行存款
     */
    static PaymentSubjects resolvePaymentSubjects(String payableSubjectCode, String paymentMethod) {
        String credit = "CASH".equalsIgnoreCase(String.valueOf(paymentMethod)) ? "1001" : "1002";
        return new PaymentSubjects(payableSubjectCode, credit);
    }

    /** 付款凭证的借贷科目对（D-474） */
    static class PaymentSubjects {
        private final String debit;
        private final String credit;

        PaymentSubjects(String debit, String credit) {
            this.debit = debit;
            this.credit = credit;
        }

        public String getDebit() {
            return debit;
        }

        public String getCredit() {
            return credit;
        }
    }

    /**
     * D-474 生成付款凭证（付出去的钱）。
     *
     * <p>会计口径：确认账单时已按全额"借成本/费用、贷应付账款"挂账（JOURNAL 凭证）；
     * 实际付款时再记一笔"借应付账款、贷银行存款"，金额按**本次实付**。
     * 分次付款就分次记，剩余未付的自然留在应付账款余额里，账实一致。
     *
     * <p>幂等：按 paymentId（一次付款一张凭证）；事务独立（REQUIRES_NEW），
     * 凭证失败只回滚凭证本身，不影响付款主流程。
     *
     * @param billAggregationId 账单 ID
     * @param paymentId         付款记录 ID（幂等键）
     * @param payAmount         本次实付金额
     * @param paymentMethod     支付方式（CASH=现金记 1001，其余记 1002 银行存款）
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW,
            rollbackFor = Exception.class)
    public AccountingVoucher generatePaymentVoucher(String billAggregationId, String paymentId,
                                                    BigDecimal payAmount, String paymentMethod) {
        Long tenantId = TenantAssert.requireTenantId();
        if (payAmount == null || payAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        if (!StringUtils.hasText(paymentId)) {
            return null;
        }
        // 幂等：同一笔付款只生成一张凭证
        AccountingVoucher existing = voucherService.lambdaQuery()
                .eq(AccountingVoucher::getTenantId, tenantId)
                .eq(AccountingVoucher::getPaymentId, paymentId)
                .eq(AccountingVoucher::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (existing != null) {
            log.info("[AccountingVoucher] 付款凭证已存在: paymentId={}, voucherNo={}", paymentId, existing.getVoucherNo());
            return existing;
        }
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getId, billAggregationId)
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (bill == null) {
            throw new RuntimeException("账单不存在: " + billAggregationId);
        }
        BillSubjectMapping mapping = mappingService.lambdaQuery()
                .eq(BillSubjectMapping::getTenantId, tenantId)
                .eq(BillSubjectMapping::getBillType, bill.getBillType())
                .eq(BillSubjectMapping::getBillCategory, bill.getBillCategory())
                .eq(BillSubjectMapping::getEnabled, 1)
                .eq(BillSubjectMapping::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (mapping == null || !StringUtils.hasText(mapping.getCreditSubjectCode())) {
            throw new RuntimeException("未找到科目映射（无法确定应付科目）: "
                    + bill.getBillType() + "/" + bill.getBillCategory());
        }
        // 借方 = 确认时挂的应付科目（2202 应付账款 / 2211 应付职工薪酬）
        // 贷方 = 银行存款 1002（现金付款则 1001 库存现金）
        PaymentSubjects subjects = resolvePaymentSubjects(mapping.getCreditSubjectCode(), paymentMethod);
        String debitCode = subjects.getDebit();
        String creditCode = subjects.getCredit();
        String summary = "付款: " + (bill.getBillNo() != null ? bill.getBillNo() : billAggregationId)
                + " 本次支付 " + payAmount + " 元";
        AccountingVoucher voucher = new AccountingVoucher();
        voucher.setVoucherNo(generateVoucherNo());
        voucher.setVoucherDate(LocalDate.now());
        voucher.setBillAggregationId(billAggregationId);
        voucher.setPaymentId(paymentId);
        voucher.setSourceType(bill.getSourceType());
        voucher.setSourceId(bill.getSourceId());
        voucher.setSummary(summary);
        voucher.setTotalAmount(payAmount);
        voucher.setVoucherType("PAYMENT");
        voucher.setStatus(STATUS_POSTED);
        voucher.setAccountingStandard(STANDARD_CAS);
        voucher.setCreateBy(UserContext.username());
        voucher.setTenantId(tenantId);
        voucher.setDeleteFlag(0);
        voucherService.save(voucher);
        saveEntry(voucher.getId(), 1, debitCode, payAmount, BigDecimal.ZERO, summary, tenantId);
        saveEntry(voucher.getId(), 2, creditCode, BigDecimal.ZERO, payAmount, summary, tenantId);
        log.info("[AccountingVoucher] 生成付款凭证: voucherNo={}, billNo={}, 借{}={}, 贷{}={}",
                voucher.getVoucherNo(), bill.getBillNo(), debitCode, payAmount, creditCode, payAmount);
        return voucher;
    }

    // ==================== 2. 冲销凭证 ====================

    @Transactional(rollbackFor = Exception.class)
    public AccountingVoucher reverseVoucher(Long voucherId) {
        Long tenantId = TenantAssert.requireTenantId();
        AccountingVoucher original = getVoucherOrThrow(voucherId, tenantId);
        if (STATUS_REVERSED.equals(original.getStatus())) {
            throw new RuntimeException("凭证已冲销: " + original.getVoucherNo());
        }
        // 创建冲销凭证
        AccountingVoucher reversal = new AccountingVoucher();
        reversal.setVoucherNo(generateVoucherNo());
        reversal.setVoucherDate(LocalDate.now());
        reversal.setBillAggregationId(original.getBillAggregationId());
        reversal.setSourceType(original.getSourceType());
        reversal.setSourceId(original.getSourceId());
        reversal.setSummary("冲销凭证: " + original.getVoucherNo());
        reversal.setTotalAmount(original.getTotalAmount());
        reversal.setVoucherType(VOUCHER_TYPE_REVERSAL);
        reversal.setStatus(STATUS_POSTED);
        reversal.setReverseVoucherId(original.getId());
        reversal.setAccountingStandard(original.getAccountingStandard());
        reversal.setCreateBy(UserContext.username());
        reversal.setTenantId(tenantId);
        reversal.setDeleteFlag(0);
        voucherService.save(reversal);
        // 复制分录并借贷互换
        List<AccountingEntry> originalEntries = entryService.lambdaQuery()
                .eq(AccountingEntry::getVoucherId, voucherId)
                .eq(AccountingEntry::getTenantId, tenantId)
                .orderByAsc(AccountingEntry::getLineNo)
                .list();
        int lineNo = 1;
        for (AccountingEntry entry : originalEntries) {
            saveEntry(reversal.getId(), lineNo++, entry.getSubjectCode(),
                    entry.getCreditAmount(), entry.getDebitAmount(),
                    "冲销: " + (entry.getSummary() != null ? entry.getSummary() : ""), tenantId);
        }
        // 原凭证标记已冲销
        original.setStatus(STATUS_REVERSED);
        original.setReverseVoucherId(reversal.getId());
        voucherService.updateById(original);
        log.info("[AccountingVoucher] 冲销凭证: original={}, reversal={}", original.getVoucherNo(), reversal.getVoucherNo());
        return reversal;
    }

    /** 账单冲销时联动冲销对应凭证（数据流转要求 #2） */
    @Transactional(rollbackFor = Exception.class)
    public void reverseByBillAggregationId(String billAggregationId) {
        Long tenantId = TenantAssert.requireTenantId();
        AccountingVoucher voucher = voucherService.lambdaQuery()
                .eq(AccountingVoucher::getBillAggregationId, billAggregationId)
                .eq(AccountingVoucher::getTenantId, tenantId)
                .eq(AccountingVoucher::getDeleteFlag, 0)
                .eq(AccountingVoucher::getVoucherType, VOUCHER_TYPE_JOURNAL)
                .ne(AccountingVoucher::getStatus, STATUS_REVERSED)
                .last("LIMIT 1")
                .one();
        if (voucher == null) {
            log.info("[AccountingVoucher] 账单无对应凭证可冲销: billId={}", billAggregationId);
            return;
        }
        reverseVoucher(voucher.getId());
    }

    // ==================== 3. 查询 ====================

    public List<AccountingVoucher> queryVouchers(String startDate, String endDate) {
        Long tenantId = TenantAssert.requireTenantId();
        LambdaQueryWrapper<AccountingVoucher> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AccountingVoucher::getTenantId, tenantId)
                .eq(AccountingVoucher::getDeleteFlag, 0)
                .ge(StringUtils.hasText(startDate), AccountingVoucher::getVoucherDate, startDate)
                .le(StringUtils.hasText(endDate), AccountingVoucher::getVoucherDate, endDate)
                .orderByDesc(AccountingVoucher::getVoucherDate)
                .last("LIMIT 500");
        return voucherService.list(wrapper);
    }

    public Map<String, Object> getVoucherDetail(Long voucherId) {
        Long tenantId = TenantAssert.requireTenantId();
        AccountingVoucher voucher = getVoucherOrThrow(voucherId, tenantId);
        List<AccountingEntry> entries = entryService.lambdaQuery()
                .eq(AccountingEntry::getVoucherId, voucherId)
                .eq(AccountingEntry::getTenantId, tenantId)
                .orderByAsc(AccountingEntry::getLineNo)
                .list();
        Map<String, Object> result = new HashMap<>();
        result.put("voucher", voucher);
        result.put("entries", entries);
        return result;
    }

    public List<AccountSubject> querySubjects() {
        Long tenantId = TenantAssert.requireTenantId();
        return subjectService.lambdaQuery()
                .eq(AccountSubject::getTenantId, tenantId)
                .eq(AccountSubject::getDeleteFlag, 0)
                .eq(AccountSubject::getEnabled, 1)
                .orderByAsc(AccountSubject::getSubjectCode)
                .list();
    }

    // ==================== 内部方法 ====================

    private AccountingVoucher getVoucherOrThrow(Long voucherId, Long tenantId) {
        AccountingVoucher voucher = voucherService.lambdaQuery()
                .eq(AccountingVoucher::getId, voucherId)
                .eq(AccountingVoucher::getTenantId, tenantId)
                .eq(AccountingVoucher::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (voucher == null) {
            throw new RuntimeException("凭证不存在: " + voucherId);
        }
        return voucher;
    }

    private void saveEntry(Long voucherId, int lineNo, String subjectCode,
                           BigDecimal debit, BigDecimal credit, String summary, Long tenantId) {
        AccountSubject subject = subjectService.lambdaQuery()
                .eq(AccountSubject::getTenantId, tenantId)
                .eq(AccountSubject::getSubjectCode, subjectCode)
                .eq(AccountSubject::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        AccountingEntry entry = new AccountingEntry();
        entry.setVoucherId(voucherId);
        entry.setLineNo(lineNo);
        entry.setSubjectCode(subjectCode);
        entry.setSubjectName(subject != null ? subject.getSubjectName() : subjectCode);
        entry.setDebitAmount(debit);
        entry.setCreditAmount(credit);
        entry.setSummary(summary);
        entry.setTenantId(tenantId);
        entry.setDeleteFlag(0);
        entryService.save(entry);
    }

    private String buildSummary(BillAggregation bill) {
        return (bill.getBillType() != null ? bill.getBillType() : "")
                + "/" + (bill.getBillCategory() != null ? bill.getBillCategory() : "")
                + (bill.getCounterpartyName() != null ? " " + bill.getCounterpartyName() : "");
    }

    private String generateVoucherNo() {
        return "FV" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"))
                + String.format("%03d", VOUCHER_NO_SEQ.incrementAndGet() % 1000);
    }
}
