package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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
        Invoice existing = invoiceService.getById(invoice.getId());
        if (existing == null) throw new RuntimeException("发票不存在");
        TenantAssert.assertBelongsToCurrentTenant(existing.getTenantId(), "发票");
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
        Invoice inv = invoiceService.getById(id);
        if (inv == null) throw new RuntimeException("发票不存在");
        TenantAssert.assertBelongsToCurrentTenant(inv.getTenantId(), "发票");
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
        Invoice inv = invoiceService.getById(id);
        if (inv == null) throw new RuntimeException("发票不存在");
        TenantAssert.assertBelongsToCurrentTenant(inv.getTenantId(), "发票");
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
        Invoice patch = new Invoice();
        patch.setId(id);
        patch.setDeleteFlag(1);
        patch.setUpdateTime(java.time.LocalDateTime.now());
        invoiceService.updateById(patch);
    }

    // ─── 内部方法 ────────────────────────────────────────────────────────────

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
