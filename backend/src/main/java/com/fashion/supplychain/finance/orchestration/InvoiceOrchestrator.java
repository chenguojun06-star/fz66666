package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.Invoice;
import com.fashion.supplychain.finance.entity.TaxConfig;
import com.fashion.supplychain.finance.service.InvoiceService;
import com.fashion.supplychain.finance.service.TaxConfigService;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 发票管理编排器
 * 开票、作废、税额自动计算、关联业务单据
 */
@Slf4j
@Service
public class InvoiceOrchestrator {

    @Autowired
    private InvoiceService invoiceService;

    @Autowired
    private TaxConfigService taxConfigService;

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    // ─── 查询 ────────────────────────────────────────────────────────────────

    public IPage<Invoice> list(Map<String, Object> params) {
        int page     = parseInt(params.get("page"), 1);
        int pageSize = parseInt(params.get("pageSize"), 20);
        String status      = (String) params.get("status");
        String invoiceType = (String) params.get("invoiceType");
        String keyword     = (String) params.get("keyword");

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // P0 修复（铁律4 多租户隔离）：工厂账号不应看到发票（属于租户级财务数据）
        // 与 ReceivableOrchestrator.list 的工厂账号禁用策略保持一致
        if (DataPermissionHelper.isFactoryAccount()) {
            return new Page<>(page, pageSize);
        }

        LambdaQueryWrapper<Invoice> qw = new LambdaQueryWrapper<Invoice>()
                .eq(Invoice::getDeleteFlag, 0)
                .eq(Invoice::getTenantId, tenantId)
                .eq(StringUtils.hasText(status), Invoice::getStatus, status)
                .eq(StringUtils.hasText(invoiceType), Invoice::getInvoiceType, invoiceType)
                .and(StringUtils.hasText(keyword), w -> w
                        .like(Invoice::getInvoiceNo, keyword)
                        .or().like(Invoice::getTitleName, keyword)
                        .or().like(Invoice::getRelatedBizNo, keyword))
                .orderByDesc(Invoice::getCreateTime);

        return invoiceService.page(new Page<>(page, pageSize), qw);
    }

    public Invoice getById(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        return invoiceService.lambdaQuery()
                .eq(Invoice::getId, id)
                .eq(Invoice::getTenantId, tenantId)
                .eq(Invoice::getDeleteFlag, 0)
                .one();
    }

    public Map<String, Object> getStats() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // P0 修复（铁律4 多租户隔离）：工厂账号不应看到发票统计（属于租户级财务数据）
        if (DataPermissionHelper.isFactoryAccount()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("totalIssued", BigDecimal.ZERO);
            empty.put("issuedCount", 0L);
            empty.put("draftCount", 0L);
            empty.put("monthAmount", BigDecimal.ZERO);
            return empty;
        }

        List<Invoice> all = invoiceService.list(
                new LambdaQueryWrapper<Invoice>()
                        .eq(Invoice::getDeleteFlag, 0)
                        .eq(Invoice::getTenantId, tenantId)
                        .last("LIMIT 5000"));

        BigDecimal totalIssued = BigDecimal.ZERO;
        long issuedCount = 0;
        long draftCount = 0;
        BigDecimal monthAmount = BigDecimal.ZERO;
        LocalDate firstOfMonth = LocalDate.now().withDayOfMonth(1);

        for (Invoice inv : all) {
            if ("ISSUED".equals(inv.getStatus())) {
                totalIssued = totalIssued.add(inv.getTotalAmount() != null ? inv.getTotalAmount() : BigDecimal.ZERO);
                issuedCount++;
                if (inv.getIssueDate() != null && !inv.getIssueDate().isBefore(firstOfMonth)) {
                    monthAmount = monthAmount.add(inv.getTotalAmount() != null ? inv.getTotalAmount() : BigDecimal.ZERO);
                }
            } else if ("DRAFT".equals(inv.getStatus())) {
                draftCount++;
            }
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalIssued", totalIssued);
        stats.put("issuedCount", issuedCount);
        stats.put("draftCount", draftCount);
        stats.put("monthAmount", monthAmount);
        return stats;
    }

    // ─── 写操作 ──────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public Invoice create(Invoice invoice) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();

        invoice.setInvoiceNo("INV" + LocalDateTime.now().format(NO_FMT));
        invoice.setTenantId(tenantId);
        invoice.setDeleteFlag(0);
        if (!StringUtils.hasText(invoice.getStatus())) {
            invoice.setStatus("DRAFT");
        }

        // 自动计算税额
        autoCalcTax(invoice);

        if (ctx != null) {
            invoice.setCreatorId(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
            invoice.setCreatorName(ctx.getUsername());
        }

        invoiceService.save(invoice);
        log.info("[InvoiceOrchestrator] 新建发票 {} 类型={} 价税合计={}", invoice.getInvoiceNo(), invoice.getInvoiceType(), invoice.getTotalAmount());
        return invoice;
    }

    @Transactional(rollbackFor = Exception.class)
    public Invoice update(Invoice invoice) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Invoice existing = invoiceService.lambdaQuery()
                .eq(Invoice::getId, invoice.getId())
                .eq(Invoice::getTenantId, tenantId)
                .one();
        if (existing == null) throw new RuntimeException("发票不存在");
        if (!"DRAFT".equals(existing.getStatus())) throw new RuntimeException("只有草稿状态的发票可以编辑");

        // 保护不可修改的字段
        invoice.setInvoiceNo(existing.getInvoiceNo());
        invoice.setTenantId(existing.getTenantId());
        invoice.setDeleteFlag(existing.getDeleteFlag());
        invoice.setCreatorId(existing.getCreatorId());
        invoice.setCreatorName(existing.getCreatorName());
        invoice.setCreateTime(existing.getCreateTime());

        autoCalcTax(invoice);
        invoiceService.updateById(invoice);
        log.info("[InvoiceOrchestrator] 更新发票草稿 id={}", invoice.getId());
        return invoice;
    }

    @Transactional(rollbackFor = Exception.class)
    public Invoice issue(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Invoice inv = invoiceService.lambdaQuery()
                .eq(Invoice::getId, id)
                .eq(Invoice::getTenantId, tenantId)
                .one();
        if (inv == null) throw new RuntimeException("发票不存在");
        if (!"DRAFT".equals(inv.getStatus())) throw new RuntimeException("只有草稿状态的发票可以开具");

        inv.setStatus("ISSUED");
        inv.setIssueDate(LocalDate.now());
        invoiceService.updateById(inv);
        log.info("[InvoiceOrchestrator] 发票 {} 已开具", inv.getInvoiceNo());
        return inv;
    }

    @Transactional(rollbackFor = Exception.class)
    public Invoice cancel(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Invoice inv = invoiceService.lambdaQuery()
                .eq(Invoice::getId, id)
                .eq(Invoice::getTenantId, tenantId)
                .one();
        if (inv == null) throw new RuntimeException("发票不存在");
        if ("CANCELLED".equals(inv.getStatus())) throw new RuntimeException("发票已作废");

        inv.setStatus("CANCELLED");
        invoiceService.updateById(inv);
        log.info("[InvoiceOrchestrator] 发票 {} 已作废", inv.getInvoiceNo());
        return inv;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Invoice existing = invoiceService.lambdaQuery()
                .eq(Invoice::getId, id)
                .eq(Invoice::getTenantId, tenantId)
                .eq(Invoice::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            throw new NoSuchElementException("发票不存在");
        }
        // D-363d：逻辑删除空操作修复
        invoiceService.removeById(id);
    }

    // ─── 内部方法 ────────────────────────────────────────────────────────────

    /**
     * 应收单 → 自动生成草稿发票（D-753 发票台账智能化）。
     *
     * <p>发票台账此前是纯手填孤立表（业务事件零写入，页面恒空）；
     * 现在每张应收单确认后自动带出一张草稿发票（金额/购方/关联单号全带出，
     * 税率取税率配置默认 VAT），用户核对后点「开票」才转 ISSUED——
     * 实际开票动作仍在税盘/平台，系统只管台账。</p>
     *
     * <p>幂等：按 relatedBizType=RECEIVABLE + relatedBizId 先查后建，重复调用不重复建。
     * 刻意不加 @Transactional：调用方（应收创建/收款登记）自带事务，
     * 单条 save 本身原子；若套进调用方事务，失败被 catch 也会把共享事务标 rollback-only
     * 拖垮主流程（D-751 教训）。调用方必须 try/catch 包裹，发票生成失败不阻塞应收主流程。</p>
     */
    public void generateDraftFromReceivable(com.fashion.supplychain.crm.entity.Receivable receivable) {
        if (receivable == null || !StringUtils.hasText(receivable.getId())) {
            return;
        }
        try {
            TenantAssert.assertTenantContext();
            Long tenantId = UserContext.tenantId();
            Invoice existing = invoiceService.lambdaQuery()
                    .eq(Invoice::getRelatedBizType, "RECEIVABLE")
                    .eq(Invoice::getRelatedBizId, receivable.getId())
                    .eq(Invoice::getTenantId, tenantId)
                    .eq(Invoice::getDeleteFlag, 0)
                    .last("LIMIT 1")
                    .one();
            if (existing != null) {
                return; // 幂等：该应收已有关联发票（草稿/已开/作废均不重建）
            }

            Invoice draft = new Invoice();
            draft.setInvoiceNo("INV" + LocalDateTime.now().format(NO_FMT));
            draft.setInvoiceType("NORMAL");
            draft.setTitleName(receivable.getCustomerName());
            draft.setAmount(receivable.getAmount());
            draft.setTaxRate(getDefaultVatRate());
            draft.setRelatedBizType("RECEIVABLE");
            draft.setRelatedBizId(receivable.getId());
            draft.setRelatedBizNo(receivable.getReceivableNo());
            draft.setStatus("DRAFT");
            draft.setRemark("由应收单自动生成草稿，请核对购方信息与税率后开票");
            draft.setTenantId(tenantId);
            draft.setDeleteFlag(0);
            UserContext ctx = UserContext.get();
            if (ctx != null) {
                draft.setCreatorId(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
                draft.setCreatorName(ctx.getUsername());
            }
            autoCalcTax(draft);
            invoiceService.save(draft);
            log.info("[InvoiceOrchestrator] 应收单 {} 自动生成草稿发票 {} 价税合计={}",
                    receivable.getReceivableNo(), draft.getInvoiceNo(), draft.getTotalAmount());
        } catch (Exception e) {
            // fail-safe：发票台账生成失败绝不阻塞应收/收款主流程
            log.warn("[InvoiceOrchestrator] 应收单自动生成草稿发票失败（不阻塞主流程）: receivableNo={}, err={}",
                    receivable.getReceivableNo(), e.getMessage());
        }
    }

    private void autoCalcTax(Invoice invoice) {
        BigDecimal amount = invoice.getAmount();
        BigDecimal taxRate = invoice.getTaxRate();

        // 未指定税率时，尝试从税率配置获取默认增值税率
        if ((taxRate == null || taxRate.compareTo(BigDecimal.ZERO) == 0) && amount != null) {
            taxRate = getDefaultVatRate();
            invoice.setTaxRate(taxRate);
        }

        if (amount != null && taxRate != null) {
            BigDecimal taxAmount = amount.multiply(taxRate).setScale(2, RoundingMode.HALF_UP);
            invoice.setTaxAmount(taxAmount);
            invoice.setTotalAmount(amount.add(taxAmount));
        }
    }

    private BigDecimal getDefaultVatRate() {
        Long tenantId = UserContext.tenantId();
        TaxConfig cfg = taxConfigService.getOne(
                new LambdaQueryWrapper<TaxConfig>()
                        .eq(TaxConfig::getStatus, "ACTIVE")
                        .eq(TaxConfig::getTaxCode, "VAT")
                        .eq(TaxConfig::getIsDefault, 1)
                        .eq(TaxConfig::getTenantId, tenantId)
                        .last("LIMIT 1"));
        return cfg != null ? cfg.getTaxRate() : new BigDecimal("0.13");
    }

    private int parseInt(Object val, int def) {
        if (val == null) return def;
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { return def; }
    }
}
