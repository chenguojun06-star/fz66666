package com.fashion.supplychain.pos.orchestration;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.pos.entity.PosReturn;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosShift;
import com.fashion.supplychain.pos.mapper.PosReturnMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.fashion.supplychain.pos.mapper.PosSalePaymentMapper;
import com.fashion.supplychain.pos.mapper.PosShiftMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * D-817：交接班 / 钱箱测试。
 *
 * <p>钱箱算错就是直接资损或丢钱，所以重点全放在「口径」上：
 * 哪些钱该进钱箱、退款该不该减、差异能不能不解释就放过。
 */
class PosShiftOrchestratorTest {

    @Mock
    private PosShiftMapper shiftMapper;
    @Mock
    private PosSaleMapper saleMapper;
    @Mock
    private PosReturnMapper returnMapper;
    /**
     * D-817 交班实时统计新增的依赖（组合收款明细按支付行进钱箱）。
     * 存量红：orchestrator 加了 @Autowired 但测试没补 mock → NPE，
     * 与「createSale 扩 3 参」同属一批签不同步。
     */
    @Mock
    private PosSalePaymentMapper salePaymentMapper;

    @InjectMocks
    private PosShiftOrchestrator svc;

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant a = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(a, PosShift.class);
        TableInfoHelper.initTableInfo(a, PosSale.class);
        TableInfoHelper.initTableInfo(a, PosReturn.class);
    }

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("u-cashier");
        ctx.setUsername("收银员小李");
        UserContext.set(ctx);
        when(shiftMapper.selectOne(any())).thenReturn(null);
        when(saleMapper.selectList(any())).thenReturn(List.of());
        when(returnMapper.selectList(any())).thenReturn(List.of());
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private PosSale sale(String payMethod, String amount) {
        PosSale s = new PosSale();
        s.setId(1L);
        s.setTenantId(2L);
        s.setSaleNo("PS1");
        s.setPayStatus("PAID");
        s.setPayMethod(payMethod);
        s.setTotalAmount(new BigDecimal(amount));
        s.setPaidTime(LocalDateTime.now());
        return s;
    }

    private PosShift openShift() {
        PosShift s = new PosShift();
        s.setId("S1");
        s.setTenantId(2L);
        s.setShiftNo("SHF001");
        s.setCashierId("u-cashier");
        s.setCashierName("收银员小李");
        s.setOpeningCash(new BigDecimal("200"));
        s.setStatus("OPEN");
        s.setOpenedAt(LocalDateTime.now().minusHours(2));
        return s;
    }

    @Test
    @DisplayName("备用金不能为负")
    void negativeOpeningCashRejected() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> svc.openShift(new BigDecimal("-1"), null, null));
        assertTrue(e.getMessage().contains("不能为负"), e.getMessage());
    }

    @Test
    @DisplayName("已有未交班的班次时不允许再开班（防止销售被算进两个班次）")
    void cannotOpenSecondShift() {
        when(shiftMapper.selectOne(any())).thenReturn(openShift());

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> svc.openShift(new BigDecimal("200"), null, null));
        assertTrue(e.getMessage().contains("没交班"), e.getMessage());
    }

    @Test
    @DisplayName("钱箱只算现金：微信/刷卡/挂账一律不进钱箱")
    void onlyCashEntersDrawer() {
        when(shiftMapper.selectOne(any())).thenReturn(openShift());
        when(saleMapper.selectList(any())).thenReturn(List.of(
                sale("CASH", "100"),
                sale("WECHAT", "200"),
                sale("ALIPAY", "300"),
                sale("CARD", "400"),
                sale("CREDIT", "500")));

        Map<String, Object> cur = svc.currentShift();

        // 应有 = 备用金200 + 现金100 = 300；其余 1400 元都不进钱箱
        assertEquals(0, new BigDecimal("300").compareTo((BigDecimal) cur.get("expectedCash")), String.valueOf(cur));
        assertEquals(0, new BigDecimal("100").compareTo((BigDecimal) cur.get("cashSaleAmount")));
        assertEquals(0, new BigDecimal("500").compareTo((BigDecimal) cur.get("onlineSaleAmount")));
        assertEquals(0, new BigDecimal("400").compareTo((BigDecimal) cur.get("cardSaleAmount")));
        assertEquals(0, new BigDecimal("500").compareTo((BigDecimal) cur.get("creditAmount")));
    }

    @Test
    @DisplayName("现金退款要从钱箱减（漏掉会虚增钱箱）")
    void cashRefundSubtracted() {
        when(shiftMapper.selectOne(any())).thenReturn(openShift());
        when(saleMapper.selectList(any())).thenReturn(List.of(sale("CASH", "100")));

        PosReturn r = new PosReturn();
        r.setTenantId(2L);
        r.setRefundStatus("REFUNDED");
        r.setPayMethod("CASH");
        r.setRefundedAmount(new BigDecimal("30"));
        r.setCreateTime(LocalDateTime.now());
        when(returnMapper.selectList(any())).thenReturn(List.of(r));

        Map<String, Object> cur = svc.currentShift();

        // 应有 = 200 + 100 − 30 = 270
        assertEquals(0, new BigDecimal("270").compareTo((BigDecimal) cur.get("expectedCash")), String.valueOf(cur));
        assertEquals(0, new BigDecimal("30").compareTo((BigDecimal) cur.get("refundCashAmount")));
    }

    @Test
    @DisplayName("非现金退款（如原路退微信）不进钱箱")
    void onlineRefundNotInDrawer() {
        when(shiftMapper.selectOne(any())).thenReturn(openShift());
        when(saleMapper.selectList(any())).thenReturn(List.of(sale("WECHAT", "200")));

        PosReturn r = new PosReturn();
        r.setTenantId(2L);
        r.setRefundStatus("REFUNDED");
        r.setPayMethod("WECHAT");
        r.setRefundedAmount(new BigDecimal("50"));
        r.setCreateTime(LocalDateTime.now());
        when(returnMapper.selectList(any())).thenReturn(List.of(r));

        Map<String, Object> cur = svc.currentShift();

        // 微信退款走线上原路，不该动钱箱 → 应有仍是备用金 200
        assertEquals(0, new BigDecimal("200").compareTo((BigDecimal) cur.get("expectedCash")), String.valueOf(cur));
    }

    @Test
    @DisplayName("长款/短款都必须填写原因，不允许含糊交班")
    void diffRequiresReason() {
        when(shiftMapper.selectOne(any())).thenReturn(openShift());
        when(saleMapper.selectList(any())).thenReturn(List.of());
        when(shiftMapper.update(any(), any())).thenReturn(1);

        // 应有 200，实点 190 → 短款 10，必须解释
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> svc.closeShift(new BigDecimal("190"), null, null));
        assertTrue(e.getMessage().contains("请填写差异原因"), e.getMessage());
    }

    @Test
    @DisplayName("完全对平才允许不填原因")
    void balancedNeedsNoReason() {
        when(shiftMapper.selectOne(any())).thenReturn(openShift());
        when(saleMapper.selectList(any())).thenReturn(List.of());
        when(shiftMapper.update(any(), any())).thenReturn(1);

        Map<String, Object> out = svc.closeShift(new BigDecimal("200"), null, null);

        assertEquals(0, BigDecimal.ZERO.compareTo((BigDecimal) out.get("diffAmount")));
        assertEquals("CLOSED", out.get("status"));
    }

    @Test
    @DisplayName("并发交班：只有一个能成功，另一个被拦（不能把班次记两次）")
    void concurrentCloseBlocked() {
        when(shiftMapper.selectOne(any())).thenReturn(openShift());
        when(saleMapper.selectList(any())).thenReturn(List.of());
        // 第二个收银员交班时 update 影响 0 行
        when(shiftMapper.update(any(), any())).thenReturn(0);

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> svc.closeShift(new BigDecimal("200"), null, null));
        assertTrue(e.getMessage().contains("刚被交班"), e.getMessage());
    }

    @Test
    @DisplayName("没开班不能交班")
    void cannotCloseWithoutShift() {
        when(shiftMapper.selectOne(any())).thenReturn(null);

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> svc.closeShift(new BigDecimal("100"), null, null));
        assertTrue(e.getMessage().contains("没有开着的班次"), e.getMessage());
    }
}