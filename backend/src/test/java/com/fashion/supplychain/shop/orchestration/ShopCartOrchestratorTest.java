package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fashion.supplychain.shop.entity.ShopCartItem;
import com.fashion.supplychain.shop.mapper.ShopCartItemMapper;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * P1 跨店购物车单测。
 *
 * <p>重点：跨店分组、失效商品**显示而不隐藏**、库存/数量上限拦截、
 * 归属隔离（只能改自己的行）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopCartOrchestratorTest {

    @Mock
    private ShopCartItemMapper cartItemMapper;

    @Mock
    private ShopPlatformMapper platformMapper;

    @Mock
    private ProductSkuService productSkuService;

    @Mock
    private StyleInfoService styleInfoService;

    @InjectMocks
    private ShopCartOrchestrator orchestrator;

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, ShopCartItem.class);
    }

    private ProductSku sku(long id, long tenantId, long styleId, int stock) {
        ProductSku s = new ProductSku();
        s.setId(id);
        s.setTenantId(tenantId);
        s.setStyleId(styleId);
        s.setStockQuantity(stock);
        s.setColor("黑");
        s.setSize("M");
        return s;
    }

    private StyleInfo style(long id, int listed) {
        StyleInfo st = new StyleInfo();
        st.setId(id);
        st.setShopListed(listed);
        st.setStyleName("款" + id);
        return st;
    }

    private Map<String, Object> row(long tenantId, String slug, String shopName, int qty,
                                    String price, int stock, String listed, String shopEnabled) {
        Map<String, Object> m = new HashMap<>();
        m.put("cartItemId", "ci-" + tenantId);
        m.put("skuId", 100L + tenantId);
        m.put("tenantId", tenantId);
        m.put("quantity", qty);
        m.put("slug", slug);
        m.put("shopName", shopName);
        m.put("styleId", 10L + tenantId);
        m.put("styleName", "款" + tenantId);
        m.put("salesPrice", price == null ? null : new BigDecimal(price));
        m.put("stockQuantity", stock);
        m.put("shopListed", listed);
        m.put("shopEnabled", shopEnabled);
        return m;
    }

    @Test
    @DisplayName("加购：新增行时写入商品所属租户（结算分组键）")
    void addNewRow() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, 7L, 11L, 10));
        when(styleInfoService.getById(11L)).thenReturn(style(11L, 1));
        when(cartItemMapper.selectOne(any(Wrapper.class))).thenReturn(null);
        when(cartItemMapper.selectCount(any(Wrapper.class))).thenReturn(0L);

        orchestrator.add("c1", 1L, 2);

        ArgumentCaptor<ShopCartItem> captor = ArgumentCaptor.forClass(ShopCartItem.class);
        verify(cartItemMapper).insert(captor.capture());
        assertEquals(7L, captor.getValue().getTenantId());
        assertEquals(2, captor.getValue().getQuantity());
        assertEquals("c1", captor.getValue().getConsumerId());
    }

    @Test
    @DisplayName("加购：同 SKU 累加，超过库存拒绝并说明已有数量")
    void addAccumulate() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, 7L, 11L, 5));
        when(styleInfoService.getById(11L)).thenReturn(style(11L, 1));
        ShopCartItem exist = new ShopCartItem();
        exist.setId("ci1");
        exist.setQuantity(4);
        when(cartItemMapper.selectOne(any(Wrapper.class))).thenReturn(exist);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.add("c1", 1L, 2));
        assertTrue(e.getMessage().contains("库存仅剩 5 件"));
        assertTrue(e.getMessage().contains("购物车已有 4 件"));
        verify(cartItemMapper, never()).insert(any(ShopCartItem.class));
    }

    @Test
    @DisplayName("加购：商品下架 / 缺货 → 拒绝")
    void addRejectsUnavailable() {
        when(productSkuService.getById(1L)).thenReturn(sku(1L, 7L, 11L, 10));
        when(styleInfoService.getById(11L)).thenReturn(style(11L, 0));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.add("c1", 1L, 1));

        when(styleInfoService.getById(11L)).thenReturn(style(11L, 1));
        when(productSkuService.getById(1L)).thenReturn(sku(1L, 7L, 11L, 0));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.add("c1", 1L, 1));

        when(productSkuService.getById(999L)).thenReturn(null);
        assertThrows(IllegalArgumentException.class, () -> orchestrator.add("c1", 999L, 1));
    }

    @Test
    @DisplayName("购物车：按店铺分组、小计金额、失效原因一起返回（不静默丢弃）")
    void cartGroupsAndFlags() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(row(2L, "t2", "东方制衣厂", 2, "50.00", 10, "1", "1"));
        rows.add(row(2L, "t2", "东方制衣厂", 1, "30.00", 10, "1", "1"));
        rows.add(row(3L, "t3", "另一家店", 5, "20.00", 1, "1", "1"));   // 库存不足
        rows.add(row(4L, "t4", "已打烊店", 1, "10.00", 9, "1", "0"));   // 店铺打烊
        when(platformMapper.listCartRows("c1")).thenReturn(rows);

        Map<String, Object> data = orchestrator.cart("c1");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> groups = (List<Map<String, Object>>) data.get("groups");
        assertEquals(3, groups.size());
        assertEquals(2L, groups.get(0).get("tenantId"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> g0 = (List<Map<String, Object>>) groups.get(0).get("items");
        assertEquals(new BigDecimal("100.00"), g0.get(0).get("amount"));
        assertTrue((Boolean) g0.get(0).get("available"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> g1 = (List<Map<String, Object>>) groups.get(1).get("items");
        assertFalse((Boolean) g1.get(0).get("available"));
        assertEquals("库存仅剩 1 件", g1.get(0).get("unavailableReason"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> g2 = (List<Map<String, Object>>) groups.get(2).get("items");
        assertFalse((Boolean) g2.get(0).get("available"));
        assertEquals("店铺已打烊", g2.get(0).get("unavailableReason"));

        // 只有可买的行计入有效金额：50*2 + 30*1 = 130
        assertEquals(new BigDecimal("130.00"), data.get("validAmount"));
        assertEquals(9, data.get("itemCount"));
    }

    @Test
    @DisplayName("改数量：<=0 视为删除；超过库存拒绝")
    void updateQuantity() {
        ShopCartItem row = new ShopCartItem();
        row.setId("ci1");
        row.setConsumerId("c1");
        row.setSkuId(1L);
        when(cartItemMapper.selectOne(any(Wrapper.class))).thenReturn(row);
        when(productSkuService.getById(1L)).thenReturn(sku(1L, 7L, 11L, 3));

        orchestrator.updateQuantity("c1", "ci1", 0);
        verify(cartItemMapper).deleteById("ci1");

        assertThrows(IllegalArgumentException.class, () -> orchestrator.updateQuantity("c1", "ci1", 9));
    }

    @Test
    @DisplayName("改/删：不是自己的行 → 拒绝（归属隔离）")
    void ownershipIsolated() {
        when(cartItemMapper.selectOne(any(Wrapper.class))).thenReturn(null);
        assertThrows(IllegalArgumentException.class, () -> orchestrator.updateQuantity("c1", "other", 1));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.remove("c1", "other"));
        verify(cartItemMapper, never()).deleteById(anyString());
    }
}
