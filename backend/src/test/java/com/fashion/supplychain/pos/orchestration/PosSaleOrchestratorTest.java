package com.fashion.supplychain.pos.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.orchestration.CustomerOrchestrator;
import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.orchestration.PaymentOrchestrator;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosSaleItem;
import com.fashion.supplychain.pos.mapper.PosSaleItemMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.fashion.supplychain.pos.service.PosSaleWriteService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 收银台（POS 开单）单测。
 *
 * <p>要守住的口径：
 * <ol>
 *   <li>金额**服务端算**：前端只给单价/数量/折扣/抹零；</li>
 *   <li>库存不足直接拒单，绝不出现「卖了没有的货」；</li>
 *   <li>现金/刷卡当场结算、挂账生成应收、**在线支付先出二维码且此时不出库**；</li>
 *   <li>在线支付确认时，实付小于应收 → 拒绝出库；重复确认 → 幂等跳过；</li>
 *   <li>改价留痕：明细同时存吊牌价与成交价。</li>
 * </ol>
 *
 * <p>落库动作已下沉到 {@code PosSaleWriteService}（避免在事务里调渠道 HTTP 接口），
 * 所以这里断言的是"编排器有没有以正确的参数指挥写服务"。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PosSaleOrchestratorTest {

    @Mock
    private PosSaleMapper saleMapper;

    @Mock
    private PosSaleItemMapper saleItemMapper;

    @Mock
    private ProductSkuService productSkuService;

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private CustomerOrchestrator customerOrchestrator;

    @Mock
    private PosSaleWriteService writeService;

    @Mock
    private PaymentOrchestrator paymentOrchestrator;

    @InjectMocks
    private PosSaleOrchestrator orchestrator;

    private static final long TENANT = 5L;
    private static final long SALE_ID = 123L;

    @BeforeEach
    void setUpContext() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(TENANT);
        ctx.setUsername("cashier1");
        ctx.setUserId("u1");
        UserContext.set(ctx);
        // 真实实现里 createSale 会回填主键；mock 中手动回填，让后续 settle 能拿到 id
        when(writeService.createSale(any(PosSale.class), any())).thenAnswer(inv -> {
            PosSale sale = inv.getArgument(0);
            sale.setId(SALE_ID);
            return SALE_ID;
        });
    }

    @AfterEach
    void clearContext() {
        UserContext.clear();
    }

    private ProductSku sku(long id, String code, String price, String tagPrice, int stock) {
        ProductSku k = new ProductSku();
        k.setId(id);
        k.setTenantId(TENANT);
        k.setSkuCode(code);
        k.setStyleId(100L);
        k.setStyleNo("SN100");
        k.setColor("黑");
        k.setSize("M");
        k.setSalesPrice(price == null ? null : new BigDecimal(price));
        k.setTagPrice(tagPrice == null ? null : new BigDecimal(tagPrice));
        k.setStockQuantity(stock);
        return k;
    }

    private Map<String, Object> item(long skuId, int qty, String unitPrice) {
        Map<String, Object> m = new HashMap<>();
        m.put("skuId", skuId);
        m.put("quantity", qty);
        if (unitPrice != null) {
            m.put("unitPrice", unitPrice);
        }
        return m;
    }

    private Map<String, Object> body(String payMethod, List<Map<String, Object>> items) {
        Map<String, Object> b = new HashMap<>();
        b.put("items", items);
        b.put("payMethod", payMethod);
        return b;
    }

    private PosSale captureCreatedSale() {
        ArgumentCaptor<PosSale> cap = ArgumentCaptor.forClass(PosSale.class);
        verify(writeService).createSale(cap.capture(), any());
        return cap.getValue();
    }

    /* ── 当场收款 ─────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("① 现金收款：落单后立即结算为已收，金额服务端算、改价留痕")
    void cashCheckout() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "100.00", "199.00", 10));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());

        Map<String, Object> resp = orchestrator.checkout(
                body("CASH", List.of(item(1L, 2, null), item(1L, 1, "80.00"))));

        assertEquals(new BigDecimal("280.00"), resp.get("goodsAmount"));
        assertEquals(new BigDecimal("280.00"), resp.get("totalAmount"));
        assertEquals("CASH", resp.get("payMethod"));
        assertEquals(3, resp.get("itemCount"));

        PosSale sale = captureCreatedSale();
        assertEquals(TENANT, sale.getTenantId());
        assertEquals("PAYING", sale.getPayStatus(), "落单时统一先记待支付，由结算环节落定");
        assertEquals("cashier1", sale.getCashier());
        assertTrue(sale.getSaleNo().startsWith("POS"));

        // 现金当场结算为 PAID，且不带渠道交易号
        verify(writeService).settle(SALE_ID, "PAID", null);
        // 明细改价留痕：吊牌价与成交价都在
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PosSaleItem>> items = ArgumentCaptor.forClass(List.class);
        verify(writeService).createSale(any(PosSale.class), items.capture());
        assertEquals(new BigDecimal("199.00"), items.getValue().get(0).getTagPrice());
        assertEquals(new BigDecimal("100.00"), items.getValue().get(0).getUnitPrice());
        assertEquals(new BigDecimal("80.00"), items.getValue().get(1).getUnitPrice());
        // 现金不涉及在线支付
        verify(paymentOrchestrator, never()).prepay(anyLong(), anyString(), anyString(),
                anyLong(), anyString(), any());
    }

    @Test
    @DisplayName("② 折扣 + 抹零：应收 = 商品金额 - 折扣 - 抹零")
    void discountAndRoundOff() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "1000.00", null, 10));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());

        Map<String, Object> b = body("CARD", List.of(item(1L, 1, null)));
        b.put("discount", "100");
        b.put("roundOff", "0.5");

        Map<String, Object> resp = orchestrator.checkout(b);

        assertEquals(new BigDecimal("100.00"), resp.get("discountAmount"));
        assertEquals(new BigDecimal("0.50"), resp.get("roundOffAmount"));
        assertEquals(new BigDecimal("899.50"), resp.get("totalAmount"));
        verify(writeService).settle(SALE_ID, "PAID", null);
    }

    @Test
    @DisplayName("③ 挂账：必须有手机号，且结算为 UNPAID（应收在写服务里生成）")
    void creditCheckout() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "300.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        Customer c = new Customer();
        c.setId("C1");
        c.setCompanyName("老王服饰");
        when(customerOrchestrator.getByPhone(TENANT, "13800000000")).thenReturn(c);

        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CREDIT", List.of(item(1L, 1, null)))));

        Map<String, Object> b = body("CREDIT", List.of(item(1L, 1, null)));
        b.put("customerPhone", "13800000000");
        orchestrator.checkout(b);

        verify(writeService).settle(SALE_ID, "UNPAID", null);
        assertEquals("C1", captureCreatedSale().getCustomerId());
    }

    /* ── 在线支付 ─────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("④ 微信收款：先出二维码，此时绝不出库，等渠道确认")
    void wechatCheckoutReturnsQrWithoutOutbound() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "1680.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        when(paymentOrchestrator.prepay(eq(TENANT), eq("POS_SALE"), anyString(), eq(168000L),
                anyString(), any())).thenReturn(Map.of(
                        "status", "PENDING", "paid", false,
                        "qrCode", "weixin://wxpay/bizpayurl?pr=abc",
                        "expireSeconds", 900));

        Map<String, Object> resp = orchestrator.checkout(
                body("WECHAT", List.of(item(1L, 1, null))));

        assertEquals("PAYING", resp.get("payStatus"));
        assertEquals("weixin://wxpay/bizpayurl?pr=abc", resp.get("qrCode"));
        assertEquals(new BigDecimal("1680.00"), resp.get("totalAmount"));
        // 关键：待支付不能出库，否则顾客不付钱货就出去了
        verify(writeService, never()).settle(anyLong(), anyString(), anyString());
        verify(paymentOrchestrator).prepay(eq(TENANT), eq("POS_SALE"), anyString(), eq(168000L),
                anyString(), any());
    }

    @Test
    @DisplayName("⑤ 发起支付失败：单据自动作废并抛出可读原因（不留永远待支付的废单）")
    void prepayFailureCancelsSale() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "100.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        when(paymentOrchestrator.prepay(anyLong(), anyString(), anyString(), anyLong(), anyString(), any()))
                .thenThrow(new IllegalStateException("尚未开启微信支付收款"));

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> orchestrator.checkout(body("WECHAT", List.of(item(1L, 1, null)))));

        assertTrue(e.getMessage().contains("发起WECHAT支付失败"), "实际：" + e.getMessage());
        verify(writeService).markCancelled(eq(SALE_ID), anyString());
        verify(writeService, never()).settle(anyLong(), anyString(), anyString());
    }

    @Test
    @DisplayName("⑥ 渠道确认已付：结算为 PAID 并带上渠道交易号")
    void confirmPaidSettles() {
        when(saleMapper.selectOne(any())).thenReturn(payingSale("POS1"));

        orchestrator.confirmPaid("POS1", "WECHAT_PAY", "4200001234", 10000L);

        verify(writeService).settle(SALE_ID, "PAID", "4200001234");
    }

    @Test
    @DisplayName("⑦ 实付小于应收：拒绝出库（宁可让人工核对，也不能按低价发货）")
    void confirmPaidRejectsShortPayment() {
        when(saleMapper.selectOne(any())).thenReturn(payingSale("POS1"));

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> orchestrator.confirmPaid("POS1", "WECHAT_PAY", "4200001234", 1L));

        assertTrue(e.getMessage().contains("实付金额小于应收金额"), "实际：" + e.getMessage());
        verify(writeService, never()).settle(anyLong(), anyString(), anyString());
    }

    @Test
    @DisplayName("⑧ 已确认过的单再确认：幂等跳过，不再出库")
    void confirmPaidIsIdempotent() {
        PosSale sale = payingSale("POS1");
        sale.setPayStatus("PAID");
        when(saleMapper.selectOne(any())).thenReturn(sale);

        orchestrator.confirmPaid("POS1", "WECHAT_PAY", "4200001234", 10000L);

        verify(writeService, never()).settle(anyLong(), anyString(), anyString());
    }

    @Test
    @DisplayName("⑨ 取消待支付：先关渠道单，再作废本地单据")
    void cancelPending() {
        PosSale sale = payingSale("POS1");
        sale.setPayMethod("ALIPAY");
        when(saleMapper.selectOne(any())).thenReturn(sale);

        orchestrator.cancelPending("POS1", "顾客不买了");

        verify(paymentOrchestrator).cancel(TENANT, "POS1",
                PaymentGateway.PaymentType.ALIPAY, "顾客不买了");
        verify(writeService).markCancelled(SALE_ID, "顾客不买了");
    }

    @Test
    @DisplayName("⑩ 非待支付状态不能取消（已收款的单只能走退款）")
    void cannotCancelSettledSale() {
        PosSale sale = payingSale("POS1");
        sale.setPayStatus("PAID");
        when(saleMapper.selectOne(any())).thenReturn(sale);

        assertThrows(IllegalArgumentException.class, () -> orchestrator.cancelPending("POS1", "x"));
        verify(writeService, never()).markCancelled(anyLong(), anyString());
    }

    @Test
    @DisplayName("⑪ 轮询支付状态：委托给支付编排器（服务端会主动查渠道并确认）")
    void payStateDelegates() {
        PosSale sale = payingSale("POS1");
        sale.setPayMethod("WECHAT");
        when(saleMapper.selectOne(any())).thenReturn(sale);
        when(paymentOrchestrator.queryAndConfirm(eq(TENANT), eq("POS1"), any())).thenReturn(Map.of(
                "paid", true, "status", "SUCCESS"));

        Map<String, Object> state = orchestrator.payState("POS1");

        assertEquals("POS1", state.get("saleNo"));
        verify(paymentOrchestrator).queryAndConfirm(eq(TENANT), eq("POS1"), any());
    }

    private PosSale payingSale(String saleNo) {
        PosSale sale = new PosSale();
        sale.setId(SALE_ID);
        sale.setSaleNo(saleNo);
        sale.setTenantId(TENANT);
        sale.setPayStatus("PAYING");
        sale.setPayMethod("WECHAT");
        sale.setTotalAmount(new BigDecimal("100.00"));
        return sale;
    }

    /* ── 校验与选货 ───────────────────────────────────────────────────────── */

    @Test
    @DisplayName("⑫ 库存不足直接拒单（不能卖了没有的货）")
    void rejectWhenStockNotEnough() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "100.00", null, 2));

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CASH", List.of(item(1L, 3, null)))));

        assertTrue(e.getMessage().contains("库存仅剩 2"));
        verify(writeService, never()).createSale(any(PosSale.class), any());
    }

    @Test
    @DisplayName("⑬ 不支持的收款方式 / 空购物车 / 负折扣一律拒绝")
    void guardInvalidInput() {
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("BITCOIN", List.of(item(1L, 1, null)))));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CASH", new ArrayList<>())));

        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "100.00", null, 5));
        Map<String, Object> b = body("CASH", List.of(item(1L, 1, null)));
        b.put("discount", "-1");
        assertThrows(IllegalArgumentException.class, () -> orchestrator.checkout(b));

        Map<String, Object> b2 = body("CASH", List.of(item(1L, 1, null)));
        b2.put("discount", "999");
        assertThrows(IllegalArgumentException.class, () -> orchestrator.checkout(b2));
    }

    @Test
    @DisplayName("⑭ 单价缺省取 SKU 售价；无售价回落吊牌价；显式传 0 视为 0（赠品）")
    void unitPriceFallback() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "120.00", "199.00", 5));
        when(productSkuService.getById(2L)).thenReturn(sku(2L, "A-2", null, "88.00", 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());

        Map<String, Object> resp = orchestrator.checkout(
                body("CASH", List.of(item(1L, 1, null), item(2L, 1, null), item(1L, 1, "0"))));

        assertEquals(new BigDecimal("208.00"), resp.get("goodsAmount"));
    }

    @Test
    @DisplayName("⑮ 数量上限与非法数量（在查商品之前就拦掉）")
    void quantityGuards() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "100.00", null, 99999));

        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CASH", List.of(item(1L, 10000, null)))));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CASH", List.of(item(1L, 0, null)))));

        verify(writeService, never()).createSale(any(PosSale.class), any());
        verify(productSkuService, never()).getById(anyLong());
    }

    @Test
    @DisplayName("⑯ 手机号带出客户与上次成交价（批发档口报价基准）")
    void customerWithLastPrices() {
        Customer c = new Customer();
        c.setId("C1");
        c.setCompanyName("老王服饰");
        when(customerOrchestrator.getByPhone(TENANT, "13800000000")).thenReturn(c);

        List<Map<String, Object>> rows = new ArrayList<>();
        Map<String, Object> r1 = new HashMap<>();
        r1.put("skuId", 1L);
        r1.put("unitPrice", new BigDecimal("88.00"));
        Map<String, Object> r2 = new HashMap<>();
        r2.put("skuId", 1L);
        r2.put("unitPrice", new BigDecimal("99.00"));
        rows.add(r1);
        rows.add(r2);
        when(saleMapper.customerRecentPrices(TENANT, "13800000000")).thenReturn(rows);

        Map<String, Object> out = orchestrator.customer("13800000000");

        assertEquals("C1", out.get("customerId"));
        @SuppressWarnings("unchecked")
        Map<String, Object> last = (Map<String, Object>) out.get("lastPrices");
        // 列表按时间倒序，首次出现即最新 → 88 而不是 99
        assertEquals(new BigDecimal("88.00"), last.get("1"));
    }

    @Test
    @DisplayName("⑰ 未登录不允开单")
    void requireLogin() {
        UserContext.clear();
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CASH", List.of(item(1L, 1, null)))));
        assertTrue(orchestrator.searchSkus("A", 10).isEmpty());
    }

    @Test
    @DisplayName("⑱ 找货：精确命中（条码/SKU 编码）排最前，扫码不会加错款")
    void searchExactFirst() {
        ProductSku exact = sku(1L, "ABC123", "100.00", null, 5);
        exact.setBarcode("6901234567890");
        ProductSku fuzzy = sku(2L, "ABC1234", "100.00", null, 5);

        List<ProductSku> found = new ArrayList<>();
        found.add(fuzzy);
        found.add(exact);
        when(productSkuService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class)))
                .thenReturn(found);
        when(styleInfoService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class)))
                .thenReturn(new ArrayList<>());
        when(styleInfoService.listByIds(any())).thenReturn(new ArrayList<>());

        List<Map<String, Object>> rows = orchestrator.searchSkus("ABC123", 30);
        assertEquals(2, rows.size());
        assertEquals(1L, rows.get(0).get("skuId"));
        assertEquals(2L, rows.get(1).get("skuId"));

        List<Map<String, Object>> byBarcode = orchestrator.searchSkus("6901234567890", 30);
        assertEquals(1L, byBarcode.get(0).get("skuId"));
    }

    @Test
    @DisplayName("⑲ 今日汇总：空租户上下文返回空结构而不是报错")
    void todayWithoutTenant() {
        UserContext.clear();
        Map<String, Object> out = orchestrator.today();
        assertTrue(out.containsKey("summary"));
        assertTrue(((List<?>) out.get("byPayMethod")).isEmpty());

        verify(saleMapper, never()).todaySummary(anyLong());
        verify(saleMapper, never()).todayByPayMethod(anyLong());
    }

    @Test
    @DisplayName("⑳ 现金收款只走 PAID 结算，绝不会同时生成应收")
    void cashNeverCreatesReceivable() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "100.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());

        orchestrator.checkout(body("CASH", List.of(item(1L, 1, null))));

        verify(writeService).settle(SALE_ID, "PAID", null);
        verify(writeService, never()).settle(anyLong(), eq("UNPAID"), any());
    }
}
