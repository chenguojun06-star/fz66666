package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.EcSalesRevenue;
import com.fashion.supplychain.finance.service.EcSalesRevenueService;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.OrderProcessQueryService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.ArgumentMatchers;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

/**
 * 联动面板编排器契约测试
 *
 * <p>守护两条底线：
 * <ol>
 *   <li><b>数据真实性</b>：查不到就 linked=false，绝不返回编造的默认值
 *       （不能把缺失库存写成 0、不能凭空给出进度、不能虚构交期）。</li>
 *   <li><b>健壮性</b>：任何入参/上下文异常都返回 linked=false，不抛异常给前端。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class EcProductionLinkOrchestratorTest {

    private static final Long TENANT = 1L;
    private static final String PROD_NO = "PO20260901120000";

    @Mock private EcommerceOrderService ecOrderService;
    @Mock private EcSalesRevenueService ecSalesRevenueService;
    @Mock private EcUniversalStockService ecUniversalStockService;
    @Mock private ProductionOrderService productionOrderService;
    @Mock private OrderProcessQueryService orderProcessQueryService;

    @InjectMocks private EcProductionLinkOrchestrator orchestrator;

    private MockedStatic<UserContext> mockedUserContext;

    @BeforeEach
    void setUp() {
        mockedUserContext = mockStatic(UserContext.class);
    }

    @AfterEach
    void tearDown() {
        mockedUserContext.close();
    }

    // ==================== 方向一：生产端看电商 ====================

    @Test
    @DisplayName("未提供生产单号 → linked=false，不查库")
    void ecBrief_blankInput_returnsNotLinked() {
        assertThat(orchestrator.ecBriefByProductionOrderNo(null))
                .containsEntry("linked", false)
                .containsKey("reason");
        assertThat(orchestrator.ecBriefByProductionOrderNo("   "))
                .containsEntry("linked", false);
    }

    @Test
    @DisplayName("缺少租户上下文 → linked=false，不抛异常")
    void ecBrief_noTenant_returnsNotLinked() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(null);

        Map<String, Object> result = orchestrator.ecBriefByProductionOrderNo(PROD_NO);

        assertThat(result).containsEntry("linked", false);
        assertThat(result.get("reason")).isEqualTo("缺少租户上下文");
    }

    @Test
    @DisplayName("生产单未关联电商单 → linked=false 且给出原因")
    void ecBrief_noLinkedOrder_returnsNotLinked() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);
        when(ecOrderService.getOne(any(), anyBoolean())).thenReturn(null);

        Map<String, Object> result = orchestrator.ecBriefByProductionOrderNo(PROD_NO);

        assertThat(result).containsEntry("linked", false);
        assertThat(result.get("reason")).isEqualTo("该生产单尚未关联电商订单");
        // 关键：不能凭空造出库存/销量数字
        assertThat(result).doesNotContainKeys("stock", "salesTrend");
    }

    @Test
    @DisplayName("已关联 → 状态文案与销量/库存按真实数据返回")
    void ecBrief_linkedOrder_mapsRealData() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);

        EcommerceOrder order = new EcommerceOrder();
        order.setOrderNo("EC20260901001");
        order.setPlatform("TB");
        order.setPlatformOrderNo("TB-99887766");
        // 真实编码形态：款号直接拼颜色尺码，无分隔符
        order.setSkuCode("A1001草绿色L(170/84A)");
        order.setQuantity(3);
        order.setPayAmount(new BigDecimal("199.00"));
        order.setStatus(1);
        order.setWarehouseStatus(1);
        order.setCreateTime(LocalDateTime.now().minusDays(1));
        when(ecOrderService.getOne(any(), anyBoolean())).thenReturn(order);

        // 款号/款ID 的权威来源：生产单
        ProductionOrder prodOrder = new ProductionOrder();
        prodOrder.setOrderNo(PROD_NO);
        prodOrder.setStyleNo("A1001");
        prodOrder.setStyleId("147");
        when(productionOrderService.getOne(any(), anyBoolean())).thenReturn(prodOrder);

        // 真实出库流水：今天卖出 5 件
        EcSalesRevenue rev = new EcSalesRevenue();
        rev.setSkuCode("A1001草绿色L(170/84A)");
        rev.setQuantity(5);
        rev.setPayAmount(new BigDecimal("500.00"));
        rev.setCreateTime(LocalDateTime.now());
        when(ecSalesRevenueService.list(ArgumentMatchers.<Wrapper<EcSalesRevenue>>any())).thenReturn(List.of(rev));

        // 真实库存：两个 SKU 的款级行
        EcUniversalStock s1 = new EcUniversalStock();
        s1.setStyleId(147L);
        s1.setSkuCode("A1001草绿色L(170/84A)");
        s1.setAvailableStock(20);
        s1.setOnWayProduction(30);
        s1.setPendingOrders(2);
        s1.setTotalWarehoused(50);
        s1.setTotalOutstock(5);
        s1.setSafeStock(10);
        EcUniversalStock s2 = new EcUniversalStock();
        s2.setStyleId(147L);
        s2.setSkuCode("A1001白色M(165/80A)");
        s2.setAvailableStock(5);
        when(ecUniversalStockService.list(ArgumentMatchers.<Wrapper<EcUniversalStock>>any())).thenReturn(List.of(s1, s2));

        Map<String, Object> result = orchestrator.ecBriefByProductionOrderNo(PROD_NO);

        assertThat(result).containsEntry("linked", true);
        assertThat(result).containsEntry("statusText", "待发货");
        assertThat(result).containsEntry("warehouseStatusText", "备货中");
        assertThat(result).containsEntry("styleNo", "A1001");
        assertThat(result).containsEntry("styleId", 147L);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> trend = (List<Map<String, Object>>) result.get("salesTrend");
        assertThat(trend).hasSize(7);
        assertThat(trend.stream().mapToInt(p -> (Integer) p.get("quantity")).sum()).isEqualTo(5);

        @SuppressWarnings("unchecked")
        Map<String, Object> stock = (Map<String, Object>) result.get("stock");
        assertThat(stock).containsEntry("availableStock", 25);
        assertThat(stock).containsEntry("onWayProduction", 30);
        assertThat(stock).containsEntry("pendingOrders", 2);
        assertThat(stock).containsEntry("skuCount", 2);
        assertThat(stock).containsEntry("belowSafeStock", false);
    }

    @Test
    @DisplayName("生产单查不到时 → 不编造款号，stock 为 null 且不查销量")
    void ecBrief_productionOrderMissing_noStyleFabrication() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);

        EcommerceOrder order = new EcommerceOrder();
        order.setOrderNo("EC20260901009");
        order.setSkuCode("A1009草绿色L(170/84A)");
        order.setStatus(1);
        when(ecOrderService.getOne(any(), anyBoolean())).thenReturn(order);
        when(productionOrderService.getOne(any(), anyBoolean())).thenReturn(null);

        Map<String, Object> result = orchestrator.ecBriefByProductionOrderNo(PROD_NO);

        assertThat(result).containsEntry("linked", true);
        assertThat(result.get("styleNo")).isNull();
        assertThat(result.get("styleId")).isNull();
        assertThat(result.get("stock")).isNull();
    }

    @Test
    @DisplayName("库存只统计款级行，仓库明细行不参与汇总（防重复计数）")
    void stockBrief_onlyTotalRowsCounted() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);
        when(productionOrderService.getOne(any(), anyBoolean())).thenReturn(order("sewing", null, 40));

        // 款级行（warehouse 为空）：真实值
        EcUniversalStock total1 = new EcUniversalStock();
        total1.setStyleId(147L);
        total1.setAvailableStock(20);
        total1.setSafeStock(10);
        EcUniversalStock total2 = new EcUniversalStock();
        total2.setStyleId(147L);
        total2.setAvailableStock(5);

        // 仓库明细行：是款级行的拆分，若一并相加会翻倍
        EcUniversalStock wh1 = new EcUniversalStock();
        wh1.setStyleId(147L);
        wh1.setWarehouse("A-01-1-1");
        wh1.setAvailableStock(20);
        EcUniversalStock wh2 = new EcUniversalStock();
        wh2.setStyleId(147L);
        wh2.setWarehouse("A-01-1-1");
        wh2.setAvailableStock(5);

        when(ecUniversalStockService.list(ArgumentMatchers.<Wrapper<EcUniversalStock>>any()))
                .thenReturn(List.of(total1, total2, wh1, wh2));

        @SuppressWarnings("unchecked")
        Map<String, Object> stock = (Map<String, Object>) orchestrator.productionBriefByOrderNo(PROD_NO).get("stock");

        assertThat(stock).containsEntry("availableStock", 25);
        assertThat(stock).containsEntry("skuCount", 2);
    }

    @Test
    @DisplayName("只有仓库明细行、没有款级行 → 不兜底，stock 为 null")
    void stockBrief_warehouseRowsOnly_returnsNull() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);
        when(productionOrderService.getOne(any(), anyBoolean())).thenReturn(order("sewing", null, 40));

        EcUniversalStock wh = new EcUniversalStock();
        wh.setStyleId(147L);
        wh.setWarehouse("A-01-1-1");
        wh.setAvailableStock(20);
        when(ecUniversalStockService.list(ArgumentMatchers.<Wrapper<EcUniversalStock>>any())).thenReturn(List.of(wh));

        assertThat(orchestrator.productionBriefByOrderNo(PROD_NO).get("stock")).isNull();
    }

    @Test
    @DisplayName("没有出库流水时，趋势仍是 7 天且全为 0（0 是事实，不是编造）")
    void ecBrief_noRevenue_zeroTrendNotFabricated() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);

        EcommerceOrder order = new EcommerceOrder();
        order.setOrderNo("EC20260901002");
        order.setSkuCode("A1002草绿色S(160/76A)");
        order.setStatus(0);
        when(ecOrderService.getOne(any(), anyBoolean())).thenReturn(order);

        ProductionOrder prodOrder = new ProductionOrder();
        prodOrder.setOrderNo(PROD_NO);
        prodOrder.setStyleNo("A1002");
        prodOrder.setStyleId("148");
        when(productionOrderService.getOne(any(), anyBoolean())).thenReturn(prodOrder);

        when(ecSalesRevenueService.list(ArgumentMatchers.<Wrapper<EcSalesRevenue>>any())).thenReturn(List.of());
        when(ecUniversalStockService.list(ArgumentMatchers.<Wrapper<EcUniversalStock>>any())).thenReturn(List.of());

        Map<String, Object> result = orchestrator.ecBriefByProductionOrderNo(PROD_NO);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> trend = (List<Map<String, Object>>) result.get("salesTrend");
        assertThat(trend).hasSize(7);
        assertThat(trend).allSatisfy(p -> assertThat(p.get("quantity")).isEqualTo(0));
        // 无库存行 → stock 为 null，由前端显示"暂无库存数据"，而不是伪造成 0
        assertThat(result.get("stock")).isNull();
    }

    // ==================== 方向二：销售端看生产 ====================

    @Test
    @DisplayName("生产单不存在 → linked=false")
    void productionBrief_notFound_returnsNotLinked() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);
        when(productionOrderService.getOne(any(), anyBoolean())).thenReturn(null);

        Map<String, Object> result = orchestrator.productionBriefByOrderNo(PROD_NO);

        assertThat(result).containsEntry("linked", false);
        assertThat(result.get("reason")).isEqualTo("未找到该生产订单");
    }

    @Test
    @DisplayName("未设置计划交期 → 交期为 unknown，不得凭空给出剩余天数")
    void productionBrief_noPlannedEnd_deliveryUnknown() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);
        when(productionOrderService.getOne(any(), anyBoolean())).thenReturn(order("sewing", null, 40));
        when(ecUniversalStockService.list(ArgumentMatchers.<Wrapper<EcUniversalStock>>any())).thenReturn(List.of());

        Map<String, Object> result = orchestrator.productionBriefByOrderNo(PROD_NO);

        @SuppressWarnings("unchecked")
        Map<String, Object> delivery = (Map<String, Object>) result.get("delivery");
        assertThat(delivery).containsEntry("riskLevel", "unknown");
        assertThat(delivery).containsEntry("daysLeft", null);
        assertThat(delivery.get("riskText")).isEqualTo("未设置交期");
    }

    @Test
    @DisplayName("计划交期已过 → danger 且剩余天数为负")
    void productionBrief_overdue_isDanger() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);
        when(productionOrderService.getOne(any(), anyBoolean()))
                .thenReturn(order("sewing", LocalDateTime.now().minusDays(3), 40));
        when(ecUniversalStockService.list(ArgumentMatchers.<Wrapper<EcUniversalStock>>any())).thenReturn(List.of());

        Map<String, Object> result = orchestrator.productionBriefByOrderNo(PROD_NO);

        @SuppressWarnings("unchecked")
        Map<String, Object> delivery = (Map<String, Object>) result.get("delivery");
        assertThat(delivery).containsEntry("riskLevel", "danger");
        assertThat((Long) delivery.get("daysLeft")).isNegative();
        assertThat((String) delivery.get("riskText")).contains("逾期");
    }

    @Test
    @DisplayName("终态订单 → 交期标记 done")
    void productionBrief_completed_isDone() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);
        when(productionOrderService.getOne(any(), anyBoolean()))
                .thenReturn(order("completed", LocalDateTime.now().plusDays(5), 100));
        when(ecUniversalStockService.list(ArgumentMatchers.<Wrapper<EcUniversalStock>>any())).thenReturn(List.of());

        Map<String, Object> result = orchestrator.productionBriefByOrderNo(PROD_NO);

        @SuppressWarnings("unchecked")
        Map<String, Object> delivery = (Map<String, Object>) result.get("delivery");
        assertThat(delivery).containsEntry("riskLevel", "done");
        assertThat(delivery.get("riskText")).isEqualTo("已完成");
    }

    @Test
    @DisplayName("当前工序优先取 OrderProcessQueryService 结果，缺失时回退状态文案（不编造）")
    void productionBrief_currentProcessFallback() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);
        when(productionOrderService.getOne(any(), anyBoolean()))
                .thenReturn(order("sewing", null, 40));
        when(ecUniversalStockService.list(ArgumentMatchers.<Wrapper<EcUniversalStock>>any())).thenReturn(List.of());

        // 场景 A：服务未回填 → 回退到状态文案
        assertThat(orchestrator.productionBriefByOrderNo(PROD_NO)).containsEntry("currentProcess", "车缝");

        // 场景 B：服务回填了真实工序名 → 以它为准
        doAnswer(inv -> {
            List<ProductionOrder> list = inv.getArgument(0);
            list.forEach(o -> o.setCurrentProcessName("车缝-上袖"));
            return null;
        }).when(orderProcessQueryService).fillCurrentProcessName(anyList());

        assertThat(orchestrator.productionBriefByOrderNo(PROD_NO))
                .containsEntry("currentProcess", "车缝-上袖");
    }

    @Test
    @DisplayName("库存低于安全库存才置 belowSafeStock=true；安全库存未设置时不误报")
    void stockBrief_belowSafeStockOnlyWhenSafeStockConfigured() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(TENANT);
        when(productionOrderService.getOne(any(), anyBoolean()))
                .thenReturn(order("sewing", null, 40));

        // 安全库存 0（未设置）+ 可用 0 → 不判定为低于安全库存
        EcUniversalStock noSafe = new EcUniversalStock();
        noSafe.setSkuCode("A1003-黑-M");
        noSafe.setAvailableStock(0);
        noSafe.setSafeStock(0);
        when(ecUniversalStockService.list(ArgumentMatchers.<Wrapper<EcUniversalStock>>any())).thenReturn(List.of(noSafe));

        @SuppressWarnings("unchecked")
        Map<String, Object> stock1 = (Map<String, Object>) orchestrator.productionBriefByOrderNo(PROD_NO).get("stock");
        assertThat(stock1).containsEntry("belowSafeStock", false);

        // 安全库存 10 + 可用 3 → 判定为低于安全库存
        EcUniversalStock lowSafe = new EcUniversalStock();
        lowSafe.setSkuCode("A1003-黑-M");
        lowSafe.setAvailableStock(3);
        lowSafe.setSafeStock(10);
        when(ecUniversalStockService.list(ArgumentMatchers.<Wrapper<EcUniversalStock>>any())).thenReturn(List.of(lowSafe));

        @SuppressWarnings("unchecked")
        Map<String, Object> stock2 = (Map<String, Object>) orchestrator.productionBriefByOrderNo(PROD_NO).get("stock");
        assertThat(stock2).containsEntry("belowSafeStock", true);
    }

    // ==================== 辅助 ====================

    private ProductionOrder order(String status, LocalDateTime plannedEnd, int progress) {
        ProductionOrder o = new ProductionOrder();
        o.setId("9001");
        o.setOrderNo(PROD_NO);
        o.setStyleId("147");
        o.setStyleNo("A1001");
        o.setStyleName("圆领T恤");
        o.setFactoryName("一厂");
        o.setStatus(status);
        o.setOrderQuantity(500);
        o.setCompletedQuantity(200);
        o.setProductionProgress(progress);
        o.setPlannedEndDate(plannedEnd);
        return o;
    }
}
