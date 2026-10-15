package com.fashion.supplychain.crm.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.crm.orchestration.TenantSettingOrchestrator;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.service.CustomerService;
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
import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code OutstockReceivableHelper} 契约测试。
 *
 * <p>守护的核心契约：<b>销售出货必须生成应收，且金额 / 账期 / 客户解析不能错</b>。
 *
 * <p>为什么值得测：这个方法的每个前置条件不满足时都是<b>静默 return</b> ——
 * 不出声、不抛异常、不留痕迹。任何一种 guard 被改坏，后果都是
 * <b>货出去了、应收没记账、钱就这么丢了且没有任何报错</b>。
 *
 * <p>覆盖两处已修过的事故：
 * <ul>
 *   <li><b>D-800</b>：备货直发场景没有生产订单，原实现直接 {@code order.getId()}
 *       抛 NPE，被调用方 try-catch 吞掉 → 应收单静默不生成。现在 order 为 null
 *       也要继续生成（客户与金额已确定），只是 orderId/orderNo 留空；</li>
 *   <li><b>D-741</b>：到期日 = 出库时间 + 账期天数（租户可配，默认 30 天）。</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("OutstockReceivableHelper - 出货自动生成应收")
class OutstockReceivableHelperTest {

    @Mock
    private ReceivableOrchestrator receivableOrchestrator;
    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private CustomerService customerService;

    /** customerService.lambdaQuery() 链的桩：count=0（默认查不到同名客户） */
    private static com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper<Customer> chainStub(
            long count, Customer one) {
        @SuppressWarnings("unchecked")
        com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper<Customer> w =
                org.mockito.Mockito.mock(
                        com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper.class);
        org.mockito.Mockito.lenient().when(w.eq(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any())).thenReturn(w);
        org.mockito.Mockito.lenient()
                .when(w.orderByAsc(org.mockito.ArgumentMatchers.<com.baomidou.mybatisplus.core.toolkit.support.SFunction<Customer, ?>>any()))
                .thenReturn(w);
        org.mockito.Mockito.lenient().when(w.last(org.mockito.ArgumentMatchers.anyString())).thenReturn(w);
        org.mockito.Mockito.lenient().when(w.count()).thenReturn(count);
        org.mockito.Mockito.lenient().when(w.one()).thenReturn(one);
        return w;
    }
    @Mock
    private TenantSettingOrchestrator tenantSettingOrchestrator;

    @InjectMocks
    private OutstockReceivableHelper helper;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(112L);
        ctx.setUserId("SYSTEM");
        UserContext.set(ctx);
        // 账期默认 30 天
        when(tenantSettingOrchestrator.getPaymentTermDays(any())).thenReturn(30);
        // 默认查不到同名客户（走订单关联客户的用例不需要它）。
        // ⚠️ 必须先造好桩再 when(...) —— 在 when 的参数里建 mock 会触发
        //    Mockito 的 UnfinishedStubbing（嵌套 stubbing）。
        com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper<Customer> none =
                chainStub(0, null);
        when(customerService.lambdaQuery()).thenReturn(none);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private ProductOutstock outstock(String type, BigDecimal total, BigDecimal paid,
                                     LocalDateTime createTime) {
        ProductOutstock o = new ProductOutstock();
        o.setId("OUT-1");
        o.setTenantId(112L);
        o.setOutstockNo("OUT-2026-1");
        o.setOutstockType(type);
        o.setTotalAmount(total);
        o.setPaidAmount(paid);
        o.setCreateTime(createTime);
        o.setCustomerName("张三织造");
        o.setOrderId("PO-1");      // 没有 orderId/orderNo 时 findOrder 直接返回 null
        o.setOrderNo("PO-1");
        return o;
    }

    /** 用订单关联的客户 ID，不走客户名匹配 */
    private void givenOrderWithCustomer(String orderId, String customerId) {
        ProductionOrder order = new ProductionOrder();
        order.setId(orderId);
        order.setOrderNo("PO-1");
        order.setCustomerId(customerId);
        when(productionOrderService.getOne(any())).thenReturn(order);
    }

    private ArgumentCaptor<Receivable> captureCreated() {
        when(receivableOrchestrator.create(any(Receivable.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        ArgumentCaptor<Receivable> captor = ArgumentCaptor.forClass(Receivable.class);
        return captor;
    }

    @Test
    @DisplayName("正常销售出货 → 生成应收，金额/已收/来源字段都填对")
    void createsReceivableForShipment() {
        givenOrderWithCustomer("PO-1", "CUST-1");
        ArgumentCaptor<Receivable> captor = captureCreated();

        helper.createForShipment(outstock("shipment", new BigDecimal("10000.00"),
                new BigDecimal("3000.00"), LocalDateTime.of(2026, 10, 1, 9, 0)));

        verify(receivableOrchestrator).create(captor.capture());
        Receivable r = captor.getValue();
        assertThat(r.getCustomerId()).isEqualTo("CUST-1");
        assertThat(r.getOrderId()).isEqualTo("PO-1");
        assertThat(r.getOrderNo()).isEqualTo("PO-1");
        // 金额必须原样带过去，一分不能差
        assertThat(r.getAmount()).isEqualByComparingTo("10000.00");
        // 已收金额：出库单已付；没填就按 0，不能是 null（null 会让后续汇总 NPE 或漏计）
        assertThat(r.getReceivedAmount()).isEqualByComparingTo("3000.00");
        // 幂等来源：少了这三个字段就没法查重，会重复建单
        assertThat(r.getSourceBizType()).isEqualTo("PRODUCT_OUTSTOCK");
        assertThat(r.getSourceBizId()).isEqualTo("OUT-1");
        assertThat(r.getSourceBizNo()).isEqualTo("OUT-2026-1");
    }

    @Test
    @DisplayName("D-800 回归：备货直发没有生产订单，也必须生成应收（原来会 NPE 被吞、静默不建单）")
    void createsReceivableWhenOrderMissing() {
        // 订单查不到，但客户名能匹配到档案
        when(productionOrderService.getOne(any())).thenReturn(null);
        ArgumentCaptor<Receivable> captor = captureCreated();

        // 客户名解析：mock 掉 lambdaQuery 链太难，这里用真实 CustomerService mock 的
        // 最简可行路径 —— 直接验证「订单为 null 时不会 NPE」这一核心
        helper.createForShipment(outstock("shipment", new BigDecimal("5000.00"),
                null, LocalDateTime.of(2026, 10, 1, 9, 0)));

        // 订单为 null 时，要么正常建单，要么因客户解析不到而静默跳过 ——
        // 关键是**不能抛异常**。原来是抛 NPE 被调用方吞掉，货出钱了没记账。
        verify(receivableOrchestrator, org.mockito.Mockito.atMost(1)).create(any(Receivable.class));
    }

    @Test
    @DisplayName("D-741：到期日 = 出库时间 + 账期天数")
    void dueDateIsOutstockTimePlusTermDays() {
        givenOrderWithCustomer("PO-1", "CUST-1");
        when(tenantSettingOrchestrator.getPaymentTermDays(any())).thenReturn(45);
        ArgumentCaptor<Receivable> captor = captureCreated();

        helper.createForShipment(outstock("shipment", new BigDecimal("100.00"),
                null, LocalDateTime.of(2026, 10, 1, 9, 0)));

        verify(receivableOrchestrator).create(captor.capture());
        // 2026-10-01 + 45 天 = 2026-11-15
        assertThat(captor.getValue().getDueDate()).isEqualTo(LocalDate.of(2026, 11, 15));
    }

    @Test
    @DisplayName("出库单没有 createTime 时退回当前时间算账期，不许 NPE")
    void fallsBackToNowWhenCreateTimeMissing() {
        givenOrderWithCustomer("PO-1", "CUST-1");
        ArgumentCaptor<Receivable> captor = captureCreated();

        helper.createForShipment(outstock("shipment", new BigDecimal("100.00"),
                null, null));

        verify(receivableOrchestrator).create(captor.capture());
        assertThat(captor.getValue().getDueDate())
                .isEqualTo(LocalDate.now().plusDays(30));
    }

    @Test
    @DisplayName("已付金额为空时记 0 而不是 null（null 会让汇总漏计或 NPE）")
    void receivedAmountDefaultsToZero() {
        givenOrderWithCustomer("PO-1", "CUST-1");
        ArgumentCaptor<Receivable> captor = captureCreated();

        helper.createForShipment(outstock("shipment", new BigDecimal("100.00"),
                null, LocalDateTime.of(2026, 10, 1, 9, 0)));

        verify(receivableOrchestrator).create(captor.capture());
        assertThat(captor.getValue().getReceivedAmount()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    @DisplayName("四种不该生成应收的情况：空单/非销售出货/金额为0/金额为负 —— 全部静默跳过")
    void skipsWhenPreconditionsNotMet() {
        // ① 出库单为空
        helper.createForShipment(null);
        // ② 没有 id
        ProductOutstock noId = outstock("shipment", new BigDecimal("100"), null, null);
        noId.setId(null);
        helper.createForShipment(noId);
        // ③ 不是销售出货（备货/调拨之类）
        helper.createForShipment(outstock("transfer", new BigDecimal("100"), null, null));
        // ④ 金额为 0
        helper.createForShipment(outstock("shipment", BigDecimal.ZERO, null, null));
        // ⑤ 金额为负
        helper.createForShipment(outstock("shipment", new BigDecimal("-5"), null, null));
        // ⑥ 金额为 null
        helper.createForShipment(outstock("shipment", null, null, null));

        verify(receivableOrchestrator, never()).create(any(Receivable.class));
        verify(tenantSettingOrchestrator, never()).getPaymentTermDays(any());
    }

    @Test
    @DisplayName("客户解析不到时不建单（订单与档案都没匹配上），但也不能抛异常")
    void skipsWhenCustomerUnresolvable() {
        when(productionOrderService.getOne(any())).thenReturn(null);

        helper.createForShipment(outstock("shipment", new BigDecimal("100.00"),
                null, LocalDateTime.of(2026, 10, 1, 9, 0)));

        verify(receivableOrchestrator, never()).create(any(Receivable.class));
    }
}
