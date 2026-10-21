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
import static org.mockito.ArgumentMatchers.isNull;
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

    @Mock
    private com.fashion.supplychain.system.mapper.UserMapper userMapper;

    @Mock
    private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

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
        when(writeService.createSale(any(PosSale.class), any(), any())).thenAnswer(inv -> {
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
        verify(writeService).createSale(cap.capture(), any(), any());
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
        verify(writeService).settle(SALE_ID, "PAID", null, null);
        // 明细改价留痕：吊牌价与成交价都在
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PosSaleItem>> items = ArgumentCaptor.forClass(List.class);
        verify(writeService).createSale(any(PosSale.class), items.capture(), any());
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
        verify(writeService).settle(SALE_ID, "PAID", null, null);
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

        // 无授权的挂账已在授权专项测试里覆盖；这里给一份合法授权继续验证应收链路
        stubApprover("店长王", true, true, true);
        Map<String, Object> b = body("CREDIT", List.of(item(1L, 1, null)));
        b.put("customerPhone", "13800000000");
        b.put("creditApprover", "boss");
        b.put("creditApproverPassword", "right");
        orchestrator.checkout(b);

        // D-817 组合收款：整单挂账时第 4 参是挂账总额（creditTotal），不是 null ——
        // 应收金额按这个落。此前测试期望 null，与真实行为不符。
        verify(writeService).settle(eq(SALE_ID), eq("UNPAID"), isNull(), eq(new BigDecimal("300.00")));
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
        verify(writeService, never()).settle(anyLong(), anyString(), anyString(), any());
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
        verify(writeService, never()).settle(anyLong(), anyString(), anyString(), any());
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
        verify(writeService, never()).settle(anyLong(), anyString(), anyString(), any());
    }

    @Test
    @DisplayName("⑧ 已确认过的单再确认：幂等跳过，不再出库")
    void confirmPaidIsIdempotent() {
        PosSale sale = payingSale("POS1");
        sale.setPayStatus("PAID");
        when(saleMapper.selectOne(any())).thenReturn(sale);

        orchestrator.confirmPaid("POS1", "WECHAT_PAY", "4200001234", 10000L);

        verify(writeService, never()).settle(anyLong(), anyString(), anyString(), any());
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
        verify(writeService, never()).createSale(any(PosSale.class), any(), any());
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

        verify(writeService, never()).createSale(any(PosSale.class), any(), any());
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

        verify(writeService).settle(SALE_ID, "PAID", null, null);
        verify(writeService, never()).settle(anyLong(), eq("UNPAID"), any(), any());
    }

    /* ── 挂账授权（防资损）───────────────────────────────────────────────────
     *
     * 挂账是唯一「不到账也能出单」的收款方式。没有授权就等于把资损口子敞开：
     * 挂一张单走掉，事后核销抹平，账面对得上、钱回不来、查无此人。
     * 下面每条都是资损防线，必须守住。
     */

    private static Map<String, Object> creditBody() {
        Map<String, Object> body = new HashMap<>();
        body.put("items", List.of(Map.of("skuId", 1L, "quantity", 1, "unitPrice", new BigDecimal("99.00"))));
        body.put("payMethod", "CREDIT");
        body.put("customerPhone", "13800000000");
        return body;
    }

    private void stubApprover(String name, boolean owner, boolean designated, boolean pwdOk) {
        // 注意：不要在这里 stub SKU/款式 —— 会覆盖调用方自己 stub 的成交价
        // （creditCheckout 就踩过：这里 stub 99，把它自己的 300 盖掉，应收断言跟着挂）。
        // 需要 SKU 的测试自己 stub（见 creditWithoutApprovalIsRejected 等）。
        com.fashion.supplychain.system.entity.User u =
                new com.fashion.supplychain.system.entity.User();
        u.setId(1L);
        u.setUsername("boss");
        u.setName(name);
        u.setPassword("hashed");
        u.setStatus("ACTIVE");
        u.setIsTenantOwner(owner);
        u.setPosCreditApprover(designated);
        when(userMapper.selectOne(any())).thenReturn(u);
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(pwdOk);
    }

    @Test
    @DisplayName("挂账不给授权信息 → 直接拒单，绝不落库")
    void creditWithoutApprovalIsRejected() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "99.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(creditBody()));
        assertTrue(e.getMessage().contains("授权"));
        verify(writeService, never()).createSale(any(PosSale.class), any(), any());
    }

    @Test
    @DisplayName("授权密码错误 → 拒单")
    void creditWithWrongPasswordIsRejected() {
        stubApprover("店长王", true, true, false);
        Map<String, Object> body = creditBody();
        body.put("creditApprover", "boss");
        body.put("creditApproverPassword", "wrong");
        assertThrows(IllegalArgumentException.class, () -> orchestrator.checkout(body));
        verify(writeService, never()).createSale(any(PosSale.class), any(), any());
    }

    @Test
    @DisplayName("账号不存在 → 报错文案不得暴露账号是否存在（防撞库提示）")
    void creditWithUnknownUserGivesSameMessage() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "99.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        when(userMapper.selectOne(any())).thenReturn(null);
        Map<String, Object> body = creditBody();
        body.put("creditApprover", "nobody");
        body.put("creditApproverPassword", "whatever");
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body));
        assertEquals("授权账号或密码不正确", e.getMessage());
    }

    @Test
    @DisplayName("账号存在但无授权资格 → 拒单")
    void creditWithoutPermissionIsRejected() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "99.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        stubApprover("普通收银员小李", false, false, true);
        Map<String, Object> body = creditBody();
        body.put("creditApprover", "cashier1");
        body.put("creditApproverPassword", "right");
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body));
        assertTrue(e.getMessage().contains("没有挂账授权权限"));
        verify(writeService, never()).createSale(any(PosSale.class), any(), any());
    }

    @Test
    @DisplayName("账号已停用 → 拒单")
    void creditWithDisabledApproverIsRejected() {
        stubApprover("离职店长", true, true, true);
        when(userMapper.selectOne(any())).thenAnswer(inv -> {
            com.fashion.supplychain.system.entity.User u = new com.fashion.supplychain.system.entity.User();
            u.setUsername("boss");
            u.setStatus("DISABLED");
            u.setIsTenantOwner(true);
            return u;
        });
        Map<String, Object> body = creditBody();
        body.put("creditApprover", "boss");
        body.put("creditApproverPassword", "right");
        assertThrows(IllegalArgumentException.class, () -> orchestrator.checkout(body));
        verify(writeService, never()).createSale(any(PosSale.class), any(), any());
    }

    @Test
    @DisplayName("授权通过 → 放行，且授权人必须写进单据备注（可追溯）")
    void creditWithApprovalRecordsApprover() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "99.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        stubApprover("店长王", true, true, true);
        Map<String, Object> body = creditBody();
        body.put("creditApprover", "boss");
        body.put("creditApproverPassword", "right");

        orchestrator.checkout(body);

        ArgumentCaptor<PosSale> cap = ArgumentCaptor.forClass(PosSale.class);
        verify(writeService).createSale(cap.capture(), any(), any());
        String remark = cap.getValue().getRemark();
        assertTrue(remark != null && remark.contains("挂账授权人:店长王"),
                "授权人必须落在单据上，事后对账只认单据");
    }

    @Test
    @DisplayName("现金收款**不需要**授权（不能把正常收银也拦住）")
    void cashDoesNotNeedApproval() {
        // 与 creditBody() 的 skuId=1L 对齐（此前 stub 9L 而 body 已漂到 1L → 商品不存在）
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "99.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        Map<String, Object> body = creditBody();
        body.put("payMethod", "CASH");
        body.remove("customerPhone");
        orchestrator.checkout(body);
        verify(writeService).createSale(any(PosSale.class), any(), any());
    }
}
