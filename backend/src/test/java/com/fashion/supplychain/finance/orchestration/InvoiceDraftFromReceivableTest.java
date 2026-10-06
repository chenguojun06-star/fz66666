package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.finance.entity.Invoice;
import com.fashion.supplychain.finance.entity.TaxConfig;
import com.fashion.supplychain.finance.service.InvoiceService;
import com.fashion.supplychain.finance.service.TaxConfigService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * D-753 发票台账智能化：应收确认 → 自动生成草稿发票（幂等、fail-safe、税额自动计算）
 */
@DisplayName("应收自动生成草稿发票")
class InvoiceDraftFromReceivableTest {

    private InvoiceService invoiceService;
    private TaxConfigService taxConfigService;
    private InvoiceOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(7L);
        ctx.setUserId("u1");
        ctx.setUsername("测试员");
        UserContext.set(ctx);

        invoiceService = Mockito.mock(InvoiceService.class);
        taxConfigService = Mockito.mock(TaxConfigService.class);
        orchestrator = new InvoiceOrchestrator();
        ReflectionTestUtils.setField(orchestrator, "invoiceService", invoiceService);
        ReflectionTestUtils.setField(orchestrator, "taxConfigService", taxConfigService);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @SuppressWarnings("unchecked")
    private void stubNoExistingInvoice() {
        LambdaQueryChainWrapper<Invoice> chain = Mockito.mock(LambdaQueryChainWrapper.class);
        when(invoiceService.lambdaQuery()).thenReturn(chain);
        when(chain.eq(any(), any())).thenReturn(chain);
        when(chain.last(anyString())).thenReturn(chain);
        when(chain.one()).thenReturn(null);
    }

    private void stubDefaultVat() {
        TaxConfig cfg = new TaxConfig();
        cfg.setTaxRate(new BigDecimal("0.13"));
        when(taxConfigService.getOne(any(LambdaQueryWrapper.class))).thenReturn(cfg);
    }

    private Receivable receivable() {
        Receivable r = new Receivable();
        r.setId("RECV-1");
        r.setReceivableNo("RE20261006001");
        r.setCustomerName("广州XX服饰");
        r.setAmount(new BigDecimal("1000"));
        return r;
    }

    @Test
    @DisplayName("应收确认 → 生成 DRAFT 草稿，购方/关联单号/税额全带出（1000 × 13% → 价税合计 1130）")
    void generatesDraftWithTax() {
        stubNoExistingInvoice();
        stubDefaultVat();
        when(invoiceService.save(any(Invoice.class))).thenReturn(true);

        orchestrator.generateDraftFromReceivable(receivable());

        var captor = org.mockito.ArgumentCaptor.forClass(Invoice.class);
        verify(invoiceService).save(captor.capture());
        Invoice saved = captor.getValue();
        assertEquals("DRAFT", saved.getStatus());
        assertEquals("RECEIVABLE", saved.getRelatedBizType());
        assertEquals("RECV-1", saved.getRelatedBizId());
        assertEquals("RE20261006001", saved.getRelatedBizNo());
        assertEquals("广州XX服饰", saved.getTitleName());
        assertEquals(0, new BigDecimal("130.00").compareTo(saved.getTaxAmount()));
        assertEquals(0, new BigDecimal("1130.00").compareTo(saved.getTotalAmount()));
    }

    @Test
    @DisplayName("幂等：该应收已有关联发票时不再重建")
    void idempotentSkipsWhenInvoiceExists() {
        LambdaQueryChainWrapper<Invoice> chain = Mockito.mock(LambdaQueryChainWrapper.class);
        when(invoiceService.lambdaQuery()).thenReturn(chain);
        when(chain.eq(any(), any())).thenReturn(chain);
        when(chain.last(anyString())).thenReturn(chain);
        Invoice existing = new Invoice();
        existing.setId("INV-EXIST");
        when(chain.one()).thenReturn(existing);

        orchestrator.generateDraftFromReceivable(receivable());

        verify(invoiceService, never()).save(any(Invoice.class));
    }

    @Test
    @DisplayName("fail-safe：入参为空或内部异常都不抛出、不阻塞主流程")
    void failSafeNeverThrows() {
        assertDoesNotThrow(() -> orchestrator.generateDraftFromReceivable(null));

        stubNoExistingInvoice();
        // taxConfigService 未打桩（getOne 返回 null）→ 兜底 0.13，不应抛异常
        when(invoiceService.save(any(Invoice.class))).thenReturn(true);
        assertDoesNotThrow(() -> orchestrator.generateDraftFromReceivable(receivable()));

        Receivable blank = new Receivable();
        assertDoesNotThrow(() -> orchestrator.generateDraftFromReceivable(blank));
        verify(invoiceService, Mockito.times(1)).save(any(Invoice.class));
    }
}
