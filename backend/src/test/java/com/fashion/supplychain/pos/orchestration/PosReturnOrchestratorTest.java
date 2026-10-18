package com.fashion.supplychain.pos.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.pos.entity.PosReturn;
import com.fashion.supplychain.pos.entity.PosReturnItem;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosSaleItem;
import com.fashion.supplychain.pos.mapper.PosReturnItemMapper;
import com.fashion.supplychain.pos.mapper.PosReturnMapper;
import com.fashion.supplychain.pos.mapper.PosSaleItemMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * D-816：POS 退货的资损类规则测试。
 *
 * <p>退货是唯一「钱往外走」的收银动作，规则错了就是直接资损，所以重点全放在
 * 「不该让它通过」的反例上：
 * <ol>
 *   <li>退超（可退量校验）—— 允许退超等于允许无限退钱</li>
 *   <li>整单有优惠时按原价退 —— 把没付过的钱也退出去</li>
 *   <li>未收款单走退货 —— 白白生成退货单并冲减应收</li>
 * </ol>
 */
class PosReturnOrchestratorTest {

    @Mock
    private PosSaleMapper saleMapper;
    @Mock
    private PosSaleItemMapper saleItemMapper;
    @Mock
    private PosReturnMapper returnMapper;
    @Mock
    private PosReturnItemMapper returnItemMapper;
    @Mock
    private com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator warehouse;

    @InjectMocks
    private PosReturnOrchestrator svc;

    @BeforeAll
    static void initTableInfo() {
        com.baomidou.mybatisplus.core.MybatisConfiguration cfg = new com.baomidou.mybatisplus.core.MybatisConfiguration();
        org.apache.ibatis.builder.MapperBuilderAssistant asst = new org.apache.ibatis.builder.MapperBuilderAssistant(cfg, "");
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(asst, PosSale.class);
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(asst, PosSaleItem.class);
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(asst, PosReturn.class);
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(asst, PosReturnItem.class);
    }

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("u-pos");
        ctx.setUsername("收银员小李");
        UserContext.set(ctx);

        when(returnMapper.selectList(any())).thenReturn(List.of());
        when(returnItemMapper.selectList(any())).thenReturn(List.of());
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private PosSale paidSale(String goods, String total) {
        PosSale s = new PosSale();
        s.setId(1L);
        s.setTenantId(2L);
        s.setSaleNo("PS20260101120001");
        s.setPayStatus("PAID");
        s.setPayMethod("WECHAT");
        s.setGoodsAmount(new BigDecimal(goods));
        s.setTotalAmount(new BigDecimal(total));
        s.setDiscountAmount(new BigDecimal(goods).subtract(new BigDecimal(total)));
        return s;
    }

    private PosSaleItem item(long id, String name, String tag, int qty) {
        PosSaleItem i = new PosSaleItem();
        i.setId(id);
        i.setTenantId(2L);
        i.setSaleId(1L);
        i.setSkuId(100L);
        i.setSkuCode("SKU" + id);
        i.setStyleNo("ST" + id);
        i.setStyleName(name);
        i.setTagPrice(new BigDecimal(tag));
        i.setUnitPrice(new BigDecimal(tag));
        i.setQuantity(qty);
        i.setAmount(new BigDecimal(tag).multiply(BigDecimal.valueOf(qty)));
        return i;
    }

    @Test
    @DisplayName("未收款单不允许走退货 —— 应当用取消订单")
    void unpaidSaleCannotReturn() {
        PosSale s = paidSale("100", "100");
        s.setPayStatus("PENDING");
        when(saleMapper.selectOne(any())).thenReturn(s);

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> svc.createReturn("PS1", List.of(Map.of("saleItemId", 11L, "quantity", 1)), "RETURN", "理由"));
        assertTrue(e.getMessage().contains("尚未收款"), e.getMessage());
    }

    @Test
    @DisplayName("退超必须被拒绝：可退量 = 已售 − 已退")
    void rejectOverReturn() {
        PosSale s = paidSale("200", "200");
        when(saleMapper.selectOne(any())).thenReturn(s);
        // 卖了 2 件，之前已退 1 件 → 只能再退 1
        when(saleItemMapper.selectList(any())).thenReturn(List.of(item(11L, "连衣裙", "100", 2)));

        PosReturn done = new PosReturn();
        done.setReturnNo("RET001");
        done.setTenantId(2L);
        when(returnMapper.selectList(any())).thenReturn(List.of(done));
        PosReturnItem r1 = new PosReturnItem();
        r1.setSaleItemId(11L);
        r1.setQuantity(1);
        when(returnItemMapper.selectList(any())).thenReturn(List.of(r1));

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> svc.createReturn("PS20260101120001", List.of(Map.of("saleItemId", 11L, "quantity", 2)),
                        "RETURN", "理由"));
        assertTrue(e.getMessage().contains("可退 1 件"), e.getMessage());
    }

    @Test
    @DisplayName("整单有优惠时按原价退 —— 会把没付过的钱也退出去，必须被折算")
    void prorateRefundByPaidAmount() {
        // 原价 300，实付 200（有 100 优惠）；退其中原价 150 的那件
        PosSale s = paidSale("300", "200");
        when(saleMapper.selectOne(any())).thenReturn(s);
        when(saleItemMapper.selectList(any())).thenReturn(List.of(
                item(11L, "外套", "150", 1),
                item(12L, "裤子", "150", 1)));

        Map<String, Object> out = svc.createReturn("PS20260101120001",
                List.of(Map.of("saleItemId", 11L, "quantity", 1)), "RETURN", "尺码不合适");

        // 应退 = 200 × 150/300 = 100，而不是原价 150
        assertEquals(0, new BigDecimal("100.00").compareTo((BigDecimal) out.get("totalAmount")),
                "实付200/原价300，退一半原价 → 应退100，实际=" + out.get("totalAmount"));
        assertEquals("PENDING", out.get("refundStatus"), "未接支付渠道退款接口，只能待人工确认");
    }

    @Test
    @DisplayName("整单多行全退时，各行应退合计必须等于实付，一分不差")
    void refundTotalsMatchPaidAmount() {
        // 原价 333，实付 199.99 —— 刻意用不能整除的数，逼出分位差问题
        PosSale s = paidSale("333", "199.99");
        when(saleMapper.selectOne(any())).thenReturn(s);
        when(saleItemMapper.selectList(any())).thenReturn(List.of(
                item(11L, "A", "100", 1),
                item(12L, "B", "100", 1),
                item(13L, "C", "133", 1)));

        svc.createReturn("PS20260101120001", List.of(
                Map.of("saleItemId", 11L, "quantity", 1),
                Map.of("saleItemId", 12L, "quantity", 1),
                Map.of("saleItemId", 13L, "quantity", 1)), "RETURN", null);

        // 直接断言落库金额之和
        BigDecimal sum = new BigDecimal("0");
        for (PosReturnItem it : insertedItems()) {
            sum = sum.add(it.getAmount());
        }
        assertEquals(0, new BigDecimal("199.99").compareTo(sum), "各行应退合计=" + sum + "，必须等于实付 199.99");
    }

    /** 从 mock 抓已插入的单行。 */
    private List<PosReturnItem> insertedItems() {
        ArgumentCaptor<PosReturnItem> cap = ArgumentCaptor.forClass(PosReturnItem.class);
        org.mockito.Mockito.verify(returnItemMapper, org.mockito.Mockito.atLeast(3))
                .insert(cap.capture());
        return cap.getAllValues();
    }

    @Test
    @DisplayName("退款必须人工确认：重复确认要报错，不能静默改金额")
    void confirmRefundIsIdempotentGuarded() {
        PosReturn r = new PosReturn();
        r.setId("R1");
        r.setTenantId(2L);
        r.setReturnNo("RET001");
        r.setRefundStatus("REFUNDED");
        r.setTotalAmount(new BigDecimal("100"));
        when(returnMapper.selectOne(any())).thenReturn(r);

        IllegalStateException e = assertThrows(IllegalStateException.class, () -> svc.confirmRefund("RET001", null));
        assertTrue(e.getMessage().contains("已确认退款"), e.getMessage());
    }

    @Test
    @DisplayName("可退量查询：已售/已退/可退 三个数必须分得清")
    void returnableItemsShowsRemaining() {
        when(saleMapper.selectOne(any())).thenReturn(paidSale("200", "200"));
        when(saleItemMapper.selectList(any())).thenReturn(List.of(item(11L, "连衣裙", "100", 3)));

        PosReturn done = new PosReturn();
        done.setReturnNo("RET001");
        when(returnMapper.selectList(any())).thenReturn(List.of(done));
        PosReturnItem r1 = new PosReturnItem();
        r1.setSaleItemId(11L);
        r1.setQuantity(1);
        when(returnItemMapper.selectList(any())).thenReturn(List.of(r1));

        List<Map<String, Object>> rows = svc.returnableItems("PS20260101120001");

        assertEquals(1, rows.size());
        assertEquals(3, rows.get(0).get("soldQty"));
        assertEquals(1, rows.get(0).get("returnedQty"));
        assertEquals(2, rows.get(0).get("returnableQty"));
    }
}