package com.fashion.supplychain.pos.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.CustomerOrchestrator;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosSaleItem;
import com.fashion.supplychain.pos.mapper.PosSaleItemMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator;
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
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
 *   <li>金额**服务端算**：前端只给单价/数量/折扣/抹零，小计与应收一律后端算；</li>
 *   <li>库存不足直接拒单，绝不出现「卖了没有的货」；</li>
 *   <li>挂账必须留手机号，并生成应收单；当场收款**不生成**应收（否则同一笔钱记两次）；</li>
 *   <li>改价留痕：明细同时存吊牌价与成交价。</li>
 * </ol>
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
    private ReceivableOrchestrator receivableOrchestrator;

    @Mock
    private FinishedWarehouseOperationOrchestrator finishedWarehouseOperationOrchestrator;

    @InjectMocks
    private PosSaleOrchestrator orchestrator;

    private static final long TENANT = 5L;

    @BeforeEach
    void setUpContext() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(TENANT);
        ctx.setUsername("cashier1");
        ctx.setUserId("u1");
        UserContext.set(ctx);
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

    /** 出库返回一个带单号的对象（否则 outstockNo 为空，不影响断言） */
    private void stubOutbound() {
        ProductOutstock out = new ProductOutstock();
        out.setOutstockNo("OUT001");
        when(finishedWarehouseOperationOrchestrator.freeOutbound(any())).thenReturn(out);
    }

    private PosSale captureSale() {
        ArgumentCaptor<PosSale> cap = ArgumentCaptor.forClass(PosSale.class);
        verify(saleMapper).insert(cap.capture());
        return cap.getValue();
    }

    @Test
    @DisplayName("① 现金收款：金额服务端算，明细落库，出库逐条走 freeOutbound")
    void cashCheckout() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "100.00", "199.00", 10));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        stubOutbound();

        Map<String, Object> resp = orchestrator.checkout(
                body("CASH", List.of(item(1L, 2, null), item(1L, 1, "80.00"))));

        // 同款两行也照实落两条明细（收银台允许同一 SKU 出现两次，例如改价前后）
        assertEquals(new BigDecimal("280.00"), resp.get("goodsAmount"));
        assertEquals(new BigDecimal("280.00"), resp.get("totalAmount"));
        assertEquals("PAID", resp.get("payStatus"));
        assertEquals(3, resp.get("itemCount"));

        PosSale sale = captureSale();
        assertEquals(TENANT, sale.getTenantId());
        assertEquals("CASH", sale.getPayMethod());
        assertEquals("PAID", sale.getPayStatus());
        assertEquals("cashier1", sale.getCashier());
        assertNull(sale.getReceivableId());
        assertTrue(sale.getSaleNo().startsWith("POS"));

        ArgumentCaptor<PosSaleItem> items = ArgumentCaptor.forClass(PosSaleItem.class);
        verify(saleItemMapper, org.mockito.Mockito.times(2)).insert(items.capture());
        List<PosSaleItem> saved = items.getAllValues();
        // 改价留痕：吊牌价与成交价都在
        assertEquals(new BigDecimal("199.00"), saved.get(0).getTagPrice());
        assertEquals(new BigDecimal("100.00"), saved.get(0).getUnitPrice());
        assertEquals(new BigDecimal("80.00"), saved.get(1).getUnitPrice());

        verify(finishedWarehouseOperationOrchestrator, org.mockito.Mockito.times(2))
                .freeOutbound(any());
        // 当场收款不生成应收（否则同一笔钱在「已收款」与「应收未收」里各出现一次）
        verify(receivableOrchestrator, never()).create(any());
    }

    @Test
    @DisplayName("② 折扣 + 抹零：应收 = 商品金额 - 折扣 - 抹零")
    void discountAndRoundOff() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "1000.00", null, 10));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        stubOutbound();

        Map<String, Object> b = body("WECHAT", List.of(item(1L, 1, null)));
        b.put("discount", "100");
        b.put("roundOff", "0.5");

        Map<String, Object> resp = orchestrator.checkout(b);

        assertEquals(new BigDecimal("1000.00"), resp.get("goodsAmount"));
        assertEquals(new BigDecimal("100.00"), resp.get("discountAmount"));
        assertEquals(new BigDecimal("0.50"), resp.get("roundOffAmount"));
        assertEquals(new BigDecimal("899.50"), resp.get("totalAmount"));
    }

    @Test
    @DisplayName("③ 库存不足直接拒单（不能卖了没有的货）")
    void rejectWhenStockNotEnough() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "100.00", null, 2));

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CASH", List.of(item(1L, 3, null)))));
        assertTrue(e.getMessage().contains("库存仅剩 2"));
        verify(saleMapper, never()).insert(any(PosSale.class));
        verify(finishedWarehouseOperationOrchestrator, never()).freeOutbound(any());
    }

    @Test
    @DisplayName("④ 挂账：必须有手机号，并生成应收单（customer_id 不能为空）")
    void creditCreatesReceivable() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "300.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        stubOutbound();

        // 没手机号 → 拒
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CREDIT", List.of(item(1L, 1, null)))));

        Customer c = new Customer();
        c.setId("C1");
        c.setCompanyName("老王服饰");
        when(customerOrchestrator.getByPhone(TENANT, "13800000000")).thenReturn(c);
        Receivable r = new Receivable();
        r.setId("R1");
        when(receivableOrchestrator.create(any())).thenReturn(r);

        Map<String, Object> b = body("CREDIT", List.of(item(1L, 1, null)));
        b.put("customerPhone", "13800000000");
        b.put("customerName", "老王");

        Map<String, Object> resp = orchestrator.checkout(b);

        assertEquals("UNPAID", resp.get("payStatus"));
        assertEquals("R1", resp.get("receivableId"));
        ArgumentCaptor<Receivable> cap = ArgumentCaptor.forClass(Receivable.class);
        verify(receivableOrchestrator).create(cap.capture());
        assertEquals("C1", cap.getValue().getCustomerId());
        assertEquals(new BigDecimal("300.00"), cap.getValue().getAmount());
    }

    @Test
    @DisplayName("⑤ 不支持的收款方式 / 空购物车 / 负折扣一律拒绝")
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
    @DisplayName("⑥ 单价缺省取 SKU 售价；无售价回落吊牌价；显式传 0 视为 0（赠品）")
    void unitPriceFallback() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "120.00", "199.00", 5));
        when(productSkuService.getById(2L)).thenReturn(sku(2L, "A-2", null, "88.00", 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        stubOutbound();

        Map<String, Object> resp = orchestrator.checkout(
                body("CASH", List.of(item(1L, 1, null), item(2L, 1, null), item(1L, 1, "0"))));

        // 120 + 88 + 0
        assertEquals(new BigDecimal("208.00"), resp.get("goodsAmount"));
    }

    @Test
    @DisplayName("⑦ 手机号带出客户与上次成交价（批发档口报价基准）")
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
    @DisplayName("⑧ 未登录不允开单")
    void requireLogin() {
        UserContext.clear();
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CASH", List.of(item(1L, 1, null)))));
        assertTrue(orchestrator.searchSkus("A", 10).isEmpty());
    }

    @Test
    @DisplayName("⑨ 找货：精确命中（条码/SKU 编码）排最前，扫码不会加错款")
    void searchExactFirst() {
        ProductSku exact = sku(1L, "ABC123", "100.00", null, 5);
        exact.setBarcode("6901234567890");
        ProductSku fuzzy = sku(2L, "ABC1234", "100.00", null, 5);

        List<ProductSku> found = new ArrayList<>();
        found.add(fuzzy);
        found.add(exact);
        when(productSkuService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(found);
        when(styleInfoService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(new ArrayList<>());
        when(styleInfoService.listByIds(any())).thenReturn(new ArrayList<>());

        List<Map<String, Object>> rows = orchestrator.searchSkus("ABC123", 30);

        assertEquals(2, rows.size());
        assertEquals(1L, rows.get(0).get("skuId"));
        assertEquals(2L, rows.get(1).get("skuId"));

        // 扫条码也要精确命中
        when(productSkuService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(found);
        List<Map<String, Object>> byBarcode = orchestrator.searchSkus("6901234567890", 30);
        assertEquals(1L, byBarcode.get(0).get("skuId"));
    }

    @Test
    @DisplayName("⑩ 今日汇总：空租户上下文返回空结构而不是报错")
    void todayWithoutTenant() {
        UserContext.clear();
        Map<String, Object> out = orchestrator.today();
        assertTrue(out.containsKey("summary"));
        assertTrue(((List<?>) out.get("byPayMethod")).isEmpty());

        verify(saleMapper, never()).todaySummary(anyLong());
        verify(saleMapper, never()).todayByPayMethod(anyLong());
    }

    @Test
    @DisplayName("⑪ 出库单号写回销售单（多款时显示首单号+等N单）")
    void outstockNoPatched() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "100.00", null, 5));
        when(styleInfoService.getById(100L)).thenReturn(new StyleInfo());
        stubOutbound();

        orchestrator.checkout(body("CASH", List.of(item(1L, 1, null))));

        ArgumentCaptor<PosSale> patch = ArgumentCaptor.forClass(PosSale.class);
        verify(saleMapper).updateById(patch.capture());
        assertEquals("OUT001", patch.getValue().getOutstockNo());
    }

    @Test
    @DisplayName("⑫ 数量上限与非法数量")
    void quantityGuards() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, "A-1", "100.00", null, 99999));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CASH", List.of(item(1L, 10000, null)))));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout(body("CASH", List.of(item(1L, 0, null)))));
        verify(saleMapper, never()).insert(any(PosSale.class));
        verify(finishedWarehouseOperationOrchestrator, never()).freeOutbound(any());
        // 数量在进商品查询**之前**就被拦掉（超上限/非正数），所以连 SKU 都不该去查
        verify(productSkuService, never()).getById(anyLong());
    }
}
