package com.fashion.supplychain.pos.orchestration;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.pos.entity.PosHold;
import com.fashion.supplychain.pos.mapper.PosHoldMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * D-817：收银台挂单测试。
 *
 * <p>重点在<b>并发取回</b>：两个收银员同时点「取回」拿到同一单，
 * 就会把这笔钱收两次 —— 这是挂单最容易出资损的地方。
 */
class PosHoldOrchestratorTest {

    @Mock
    private PosHoldMapper holdMapper;

    @InjectMocks
    private PosHoldOrchestrator svc;

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant a = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(a, PosHold.class);
    }

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("u-pos");
        ctx.setUsername("收银员小李");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private PosHold held(String no) {
        PosHold h = new PosHold();
        h.setId("H1");
        h.setTenantId(2L);
        h.setHoldNo(no);
        h.setStatus("HELD");
        h.setItemCount(2);
        h.setGoodsAmount(new java.math.BigDecimal("200"));
        h.setCustomerName("王女士");
        h.setCartJson("[{\"skuCode\":\"A\",\"quantity\":2,\"amount\":200}]");
        return h;
    }

    private Map<String, Object> cartBody() {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("skuCode", "A");
        line.put("quantity", 2);
        line.put("amount", new java.math.BigDecimal("200"));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("lines", List.of(line));
        return body;
    }

    @Test
    @DisplayName("购物车为空不允许挂单（避免产生无意义的空挂单）")
    void emptyCartCannotHold() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> svc.hold(Map.of("lines", List.of())));
        assertTrue(e.getMessage().contains("购物车是空的"), e.getMessage());
    }

    @Test
    @DisplayName("挂单成功：件数与金额按快照汇总")
    void holdSummarisesCart() {
        Map<String, Object> out = svc.hold(cartBody());

        assertEquals(2, out.get("itemCount"));
        assertEquals(0, new java.math.BigDecimal("200").compareTo((java.math.BigDecimal) out.get("goodsAmount")));
        assertTrue(String.valueOf(out.get("holdNo")).startsWith("HLD"), String.valueOf(out.get("holdNo")));
    }

    @Test
    @DisplayName("取回：返回购物车快照，供前台还原")
    void resumeReturnsCart() {
        when(holdMapper.selectOne(any())).thenReturn(held("HLD001"));
        when(holdMapper.update(any(), any())).thenReturn(1);

        Map<String, Object> out = svc.resume("HLD001");

        assertEquals("HLD001", out.get("holdNo"));
        assertEquals("王女士", out.get("customerName"));
        assertEquals(1, ((List<?>) out.get("lines")).size());
    }

    @Test
    @DisplayName("并发取回：只有一个人能取到，另一个必须报错而不是重复收款")
    void concurrentResumeBlocked() {
        when(holdMapper.selectOne(any())).thenReturn(held("HLD001"));
        // 第二个收银员来取时，update 影响 0 行（已被别人置为 RESUMED）
        when(holdMapper.update(any(), any())).thenReturn(0);

        IllegalStateException e = assertThrows(IllegalStateException.class, () -> svc.resume("HLD001"));
        assertTrue(e.getMessage().contains("其他收银员"), e.getMessage());
    }

    @Test
    @DisplayName("已取回的挂单不能再取")
    void resumedHoldCannotResumeAgain() {
        PosHold h = held("HLD001");
        h.setStatus("RESUMED");
        when(holdMapper.selectOne(any())).thenReturn(h);

        IllegalStateException e = assertThrows(IllegalStateException.class, () -> svc.resume("HLD001"));
        assertTrue(e.getMessage().contains("已被取回"), e.getMessage());
    }

    @Test
    @DisplayName("丢弃：显式动作，保留记录可追溯，不物理删除")
    void discardKeepsRecord() {
        when(holdMapper.selectOne(any())).thenReturn(held("HLD001"));
        when(holdMapper.update(any(), any())).thenReturn(1);

        Map<String, Object> out = svc.discard("HLD001", "顾客说不买了");

        assertEquals("DISCARDED", out.get("status"));
        // 只有 update，没有 delete —— 挂单记录要留着追溯
        org.mockito.Mockito.verify(holdMapper, org.mockito.Mockito.never()).deleteById(ArgumentMatchers.<java.io.Serializable>any());
    }

    @Test
    @DisplayName("快照损坏时按空车返回，不能让整页打不开")
    void brokenSnapshotYieldsEmptyCart() {
        PosHold h = held("HLD001");
        h.setCartJson("{not-json");
        when(holdMapper.selectOne(any())).thenReturn(h);
        when(holdMapper.update(any(), any())).thenReturn(1);

        Map<String, Object> out = svc.resume("HLD001");

        assertTrue(((List<?>) out.get("lines")).isEmpty(), "损坏快照应降级为空车而不是抛异常");
    }
}