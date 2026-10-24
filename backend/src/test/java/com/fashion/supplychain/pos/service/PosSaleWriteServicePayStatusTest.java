package com.fashion.supplychain.pos.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosSaleItem;
import com.fashion.supplychain.pos.mapper.PosSaleItemMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.fashion.supplychain.pos.mapper.PosSalePaymentMapper;
import com.fashion.supplychain.pos.mapper.PosWholesaleTierMapper;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.ticket.orchestration.TicketOrchestrator;
import com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * D-860：POS 当场收款后必须回写出库单收款状态。
 *
 * <p>事故背景（2026-10-24 生产实证）：4 条 POS 出库单 `t_pos_sale.pay_status=PAID`、
 * 但 `t_product_outstock.payment_status=unpaid` —— 出库单被 freeOutbound 写死 unpaid 后
 * 再没有任何地方更新过它。库存管理「出库记录」于是显示「未收款」，账实不符。
 */
@ExtendWith(MockitoExtension.class)
class PosSaleWriteServicePayStatusTest {

    @Mock private PosSaleMapper saleMapper;
    @Mock private PosSaleItemMapper saleItemMapper;
    @Mock private PosSalePaymentMapper salePaymentMapper;
    @Mock private PosWholesaleTierMapper wholesaleTierMapper;
    @Mock private FinishedWarehouseOperationOrchestrator finishedWarehouseOperationOrchestrator;
    @Mock private ReceivableOrchestrator receivableOrchestrator;
    @Mock private TicketOrchestrator ticketOrchestrator;

    @InjectMocks private PosSaleWriteService service;

    private PosSale payingSale() {
        PosSale sale = new PosSale();
        sale.setId(1L);
        sale.setSaleNo("POS2026102109142702");
        sale.setPayStatus("PAYING");
        sale.setPayMethod("CASH");
        sale.setTotalAmount(new BigDecimal("2200.00"));
        return sale;
    }

    private PosSaleItem item() {
        PosSaleItem it = new PosSaleItem();
        it.setSkuCode("SKU000001");
        it.setQuantity(1);
        return it;
    }

    private ProductOutstock outstock(String no) {
        ProductOutstock os = new ProductOutstock();
        os.setOutstockNo(no);
        return os;
    }

    @Test
    @DisplayName("当场收款（PAID）→ 必须回写出库单收款状态")
    void paidSettlementWritesBackPaymentStatus() {
        when(saleMapper.selectById(1L)).thenReturn(payingSale());
        when(saleItemMapper.selectList(any())).thenReturn(List.of(item()));
        when(finishedWarehouseOperationOrchestrator.freeOutbound(any())).thenReturn(outstock("FO2026102109142735E3"));

        service.settle(1L, "PAID", null);

        verify(finishedWarehouseOperationOrchestrator).markOutstockPaid(any());
    }

    @Test
    @DisplayName("挂账（UNPAID）→ 不得把出库单标成已收款（钱还没到）")
    void creditSettlementDoesNotMarkPaid() {
        PosSale sale = payingSale();
        sale.setPayMethod("CREDIT");
        when(saleMapper.selectById(1L)).thenReturn(sale);
        when(saleItemMapper.selectList(any())).thenReturn(List.of(item()));
        when(finishedWarehouseOperationOrchestrator.freeOutbound(any())).thenReturn(outstock("FO2026102109142735E4"));
        com.fashion.supplychain.crm.entity.Receivable saved =
                new com.fashion.supplychain.crm.entity.Receivable();
        saved.setId("R001");
        when(receivableOrchestrator.create(any())).thenReturn(saved);

        service.settle(1L, "UNPAID", null);

        verify(finishedWarehouseOperationOrchestrator, org.mockito.Mockito.never()).markOutstockPaid(any());
    }
}
