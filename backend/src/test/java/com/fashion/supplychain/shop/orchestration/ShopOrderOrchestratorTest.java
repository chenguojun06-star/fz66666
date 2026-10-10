package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.CustomerOrchestrator;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.shop.entity.ShopConfig;
import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.entity.ShopOrderItem;
import com.fashion.supplychain.shop.mapper.ShopConfigMapper;
import com.fashion.supplychain.shop.mapper.ShopOrderItemMapper;
import com.fashion.supplychain.shop.mapper.ShopOrderMapper;
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
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * D-763 店铺下单全链单测：算价在服务端/库存校验/上架校验/打烊拒绝/客户归并/出库+应收联动
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopOrderOrchestratorTest {

    @Mock
    private ShopConfigMapper shopConfigMapper;

    @Mock
    private ShopOrderMapper shopOrderMapper;

    @Mock
    private ShopOrderItemMapper shopOrderItemMapper;

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private ProductSkuService productSkuService;

    @Mock
    private FinishedWarehouseOperationOrchestrator finishedWarehouseOperationOrchestrator;

    @Mock
    private CustomerOrchestrator customerOrchestrator;

    @Mock
    private ReceivableOrchestrator receivableOrchestrator;

    @Mock
    private ShopListingContentOrchestrator shopListingContentOrchestrator;

    @Mock
    private ShopStyleLayoutService styleLayoutService;

    @Mock
    private ShopRecommendOrchestrator shopRecommendOrchestrator;

    /**
     * 用**真实实例**（spy）而非 mock：租户上下文切换必须真跑，
     * 否则 doPlaceOrder 根本不会被执行，测试会变成假绿。
     */
    @Spy
    private ShopTenantContextRunner tenantContextRunner = new ShopTenantContextRunner();

    @InjectMocks
    private ShopOrderOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(9L);
        ctx.setUserId("tester");
        ctx.setUsername("测试员");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private ShopConfig openShop() {
        ShopConfig config = new ShopConfig();
        config.setTenantId(9L);
        config.setSlug("test-shop");
        config.setShopName("测试店");
        config.setEnabled(1);
        when(shopConfigMapper.selectOne(any())).thenReturn(config);
        return config;
    }

    private StyleInfo listedStyle() {
        StyleInfo style = new StyleInfo();
        style.setId(1L);
        style.setTenantId(9L);
        style.setStyleNo("FZ001");
        style.setStyleName("测试连衣裙");
        style.setShopListed(1);
        return style;
    }

    private ProductSku sku(int stock) {
        ProductSku sku = new ProductSku();
        sku.setId(100L);
        sku.setTenantId(9L);
        sku.setSkuCode("FZ001-黑色-M");
        sku.setStyleId(1L);
        sku.setStyleNo("FZ001");
        sku.setColor("黑色");
        sku.setSize("M");
        sku.setSalesPrice(new BigDecimal("100"));
        sku.setStockQuantity(stock);
        return sku;
    }

    private List<Map<String, Object>> cartItems(int qty) {
        return List.of(Map.of("skuId", 100L, "quantity", qty));
    }

    /* ─────────────── D-781 补修：生产工艺资料外泄（线上实测） ─────────────── */

    /**
     * 线上抓到的真泄漏：D-781 原本是「<b>先无条件下发 description，再打一个
     * descriptionVisibleToCustomer=false</b>」，只让前端藏起来 ——
     * 顾客在 F12 展开响应体照样看到完整的「大货工艺要求 / 裁剪工艺说明」。
     *
     * <p>前端隐藏 ≠ 资料没外泄。这条断言盯的是<b>数据层</b>：原文根本不能在响应里。
     * 只测 {@code ProductionContentDetector} 会全绿，却漏掉真正的漏洞 ——
     * 所以这里必须打到编排器的返回值。
     */
    @Test
    @DisplayName("顾客端详情：description 是生产工艺资料时，响应体里不能有原文")
    void productionProcessDescriptionMustNotLeakToCustomer() {
        openShop();
        StyleInfo style = listedStyle();
        // 抄线上款 146 的真实内容形态：大货工艺制造单 + 裁剪工艺说明
        style.setDescription("大货工艺要求 供应链管理有限公司 - 大货工艺制造单(2/2) "
                + "一. 裁剪工艺说明：裁剪前需松布和缩水，确认布号、正反面及验布，裁剪按照合同执行。");
        when(styleInfoService.getById(1L)).thenReturn(style);
        when(productSkuService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class)))
                .thenReturn(List.of());
        when(shopListingContentOrchestrator.find(any(), any())).thenReturn(null);
        when(styleLayoutService.layoutOf(1L)).thenReturn(List.of());

        Map<String, Object> data = orchestrator.productDetail("test-shop", 1L);

        assertEquals(Boolean.FALSE, data.get("descriptionVisibleToCustomer"));
        assertNull(data.get("description"), "生产工艺原文不能出现在顾客端响应体里");
        assertFalse(String.valueOf(data).contains("裁剪工艺"), "响应体任何位置都不得残留工艺原文");
    }

    /** 反向守护：正常商品描述必须照常下发，别为了挡工艺把顾客需要的资料也挡了 */
    @Test
    @DisplayName("顾客端详情：正常商品描述照常下发")
    void normalDescriptionStillVisibleToCustomer() {
        openShop();
        StyleInfo style = listedStyle();
        style.setDescription("经典翻领设计，优质棉布面料，手感柔软亲肤透气，适合日常通勤穿着。");
        when(styleInfoService.getById(1L)).thenReturn(style);
        when(productSkuService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class)))
                .thenReturn(List.of());
        when(shopListingContentOrchestrator.find(any(), any())).thenReturn(null);
        when(styleLayoutService.layoutOf(1L)).thenReturn(List.of());

        Map<String, Object> data = orchestrator.productDetail("test-shop", 1L);

        assertEquals(Boolean.TRUE, data.get("descriptionVisibleToCustomer"));
        assertNotNull(data.get("description"));
    }

    /**
     * D-785：商品说明（remark）此前是个**假提示** —— 上架页一直显示
     * 「这段会被顾客端隐藏」，但服务端只拦了 description、remark 照原样下发，
     * 顾客在详情页照样看得到整段工艺要求。提示必须是真的。
     */
    @Test
    @DisplayName("顾客端详情：remark 是生产工艺资料时也不能下发")
    void productionContentInRemarkMustNotLeakToCustomer() {
        openShop();
        StyleInfo style = listedStyle();
        style.setRemark("大货工艺要求：一. 裁剪工艺说明：裁剪前需松布和缩水，确认布号、"
                + "正反面及验布无误后方可裁剪；裁片按顺序编号分包，避免大货出现色差现象。");
        when(styleInfoService.getById(1L)).thenReturn(style);
        when(productSkuService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class)))
                .thenReturn(List.of());
        when(shopListingContentOrchestrator.find(any(), any())).thenReturn(null);
        when(styleLayoutService.layoutOf(1L)).thenReturn(List.of());

        Map<String, Object> data = orchestrator.productDetail("test-shop", 1L);

        assertNull(data.get("remark"), "生产工艺原文不能出现在顾客端响应体里");
        assertFalse(String.valueOf(data).contains("裁剪工艺"), "响应体任何位置都不得残留工艺原文");
    }

    /** 正常商品说明（如发货时效）必须照常下发 */
    @Test
    @DisplayName("顾客端详情：正常商品说明照常下发")
    void normalRemarkStillVisibleToCustomer() {
        openShop();
        StyleInfo style = listedStyle();
        style.setRemark("江浙沪次日达，偏远地区顺丰到付，支持 7 天无理由退换。");
        when(styleInfoService.getById(1L)).thenReturn(style);
        when(productSkuService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class)))
                .thenReturn(List.of());
        when(shopListingContentOrchestrator.find(any(), any())).thenReturn(null);
        when(styleLayoutService.layoutOf(1L)).thenReturn(List.of());

        Map<String, Object> data = orchestrator.productDetail("test-shop", 1L);

        assertNotNull(data.get("remark"));
    }

    private void mockHappySku() {
        when(productSkuService.getById("100")).thenReturn(sku(50));
        when(styleInfoService.getById(1L)).thenReturn(listedStyle());
    }

    private void mockCustomerAndReceivable() {
        Customer existing = new Customer();
        existing.setId("C1");
        existing.setCompanyName("老客户");
        existing.setContactPhone("13900000000");
        when(customerOrchestrator.getByPhone(eq(9L), eq("13900000000"))).thenReturn(existing);

        Receivable receivable = new Receivable();
        receivable.setId("R1");
        receivable.setReceivableNo("RE001");
        when(receivableOrchestrator.create(any(Receivable.class))).thenReturn(receivable);
    }

    private ProductOutstock outstock(String no) {
        ProductOutstock out = new ProductOutstock();
        out.setOutstockNo(no);
        return out;
    }

    @Test
    @DisplayName("下单成功：服务端算价(100×3=300)+复用已有客户+逐款出库+挂应收")
    void placeOrderHappyPath() {
        openShop();
        mockHappySku();
        mockCustomerAndReceivable();
        when(finishedWarehouseOperationOrchestrator.freeOutbound(any())).thenReturn(outstock("SO001"));
        when(shopOrderMapper.insert(any(ShopOrder.class))).thenAnswer(inv -> {
            inv.getArgument(0, ShopOrder.class).setId("O1");
            return 1;
        });

        ShopOrder order = orchestrator.placeOrder("test-shop", "李老板", "13900000000",
                "广州市海珠区", "尽快发", cartItems(3));

        assertEquals("300.00", order.getTotalAmount().toPlainString());
        assertEquals(3, order.getItemCount());
        assertEquals("C1", order.getCustomerId());
        assertEquals("R1", order.getReceivableId());
        verify(finishedWarehouseOperationOrchestrator, times(1)).freeOutbound(any());
        verify(shopOrderItemMapper, times(1)).insert(any(ShopOrderItem.class));

        ArgumentCaptor<Receivable> rc = ArgumentCaptor.forClass(Receivable.class);
        verify(receivableOrchestrator).create(rc.capture());
        assertEquals(0, rc.getValue().getAmount().compareTo(new BigDecimal("300")));
    }

    @Test
    @DisplayName("库存不足：拒绝下单且不出库不挂应收")
    void insufficientStockRejected() {
        openShop();
        when(productSkuService.getById("100")).thenReturn(sku(2));
        when(styleInfoService.getById(1L)).thenReturn(listedStyle());

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.placeOrder("test-shop", "李老板", "13900000000", "地址", null, cartItems(5)));
        assertTrue(e.getMessage().contains("库存不足"));
        verify(finishedWarehouseOperationOrchestrator, never()).freeOutbound(any());
        verify(receivableOrchestrator, never()).create(any(Receivable.class));
    }

    @Test
    @DisplayName("未上架款式：拒绝（防越权买到内部款）")
    void unlistedStyleRejected() {
        openShop();
        ProductSku sku = sku(50);
        when(productSkuService.getById("100")).thenReturn(sku);
        StyleInfo unlisted = listedStyle();
        unlisted.setShopListed(0);
        when(styleInfoService.getById(1L)).thenReturn(unlisted);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.placeOrder("test-shop", "李老板", "13900000000", "地址", null, cartItems(1)));
        assertTrue(e.getMessage().contains("下架"));
        verify(receivableOrchestrator, never()).create(any(Receivable.class));
    }

    @Test
    @DisplayName("打烊：拒绝下单")
    void closedShopRejected() {
        ShopConfig closed = openShop();
        closed.setEnabled(0);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.placeOrder("test-shop", "李老板", "13900000000", "地址", null, cartItems(1)));
        assertTrue(e.getMessage().contains("打烊"));
    }

    @Test
    @DisplayName("新客户：按手机号建档（店铺客户）再挂单")
    void newCustomerCreatedAndMerged() {
        openShop();
        mockHappySku();
        when(customerOrchestrator.getByPhone(eq(9L), eq("13900000000"))).thenReturn(null);
        when(customerOrchestrator.save(any(Customer.class))).thenAnswer(inv -> {
            Customer c = inv.getArgument(0);
            c.setId("C-NEW");
            return c;
        });
        Receivable receivable = new Receivable();
        receivable.setId("R1");
        when(receivableOrchestrator.create(any(Receivable.class))).thenReturn(receivable);
        when(finishedWarehouseOperationOrchestrator.freeOutbound(any())).thenReturn(outstock("SO002"));
        lenient().when(shopOrderMapper.insert(any(ShopOrder.class))).thenAnswer(inv -> {
            inv.getArgument(0, ShopOrder.class).setId("O2");
            return 1;
        });

        ShopOrder order = orchestrator.placeOrder("test-shop", "王小姐", "13900000000", "地址", null, cartItems(1));

        assertNotNull(order.getCustomerId());
        ArgumentCaptor<Customer> cc = ArgumentCaptor.forClass(Customer.class);
        verify(customerOrchestrator).save(cc.capture());
        assertEquals("13900000000", cc.getValue().getContactPhone());
        assertTrue(cc.getValue().getCompanyName().contains("店铺客户"));
    }
}
