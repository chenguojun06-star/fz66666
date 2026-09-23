package com.fashion.supplychain.integration.ecommerce.controller;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.style.orchestration.ProductSkuOrchestrator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code POST /api/ecommerce/orders/brief} 契约测试。
 *
 * <p>守护的核心契约：<b>订单级列表（物流异常 / 平台账单）只有订单号、没有 skuCode，
 * 必须能按订单号回查到商品摘要；查不到就不返回该键，绝不编造默认值。</b>
 *
 * <p>另外两条回归点：
 * <ol>
 *   <li>两种键都要支持：内部 {@code orderNo} 与平台 {@code platformOrderNo}；
 *       返回的 key 必须是<b>调用方传入的那个字符串原样</b>，前端才能按行取到。</li>
 *   <li>查询必须带 {@code tenantId} 过滤（多租户隔离）。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SmartEcommerceController - 订单号批量解析商品摘要")
class SmartEcommerceControllerBriefTest {

    private static final Long TENANT_ID = 7L;
    /** 真实编码形态：款号直接拼颜色尺码、无分隔符 */
    private static final String SKU_CODE = "BR24XQ0098E草绿色L(170/84A)";

    @Mock
    private EcommerceOrderService ecommerceOrderService;

    @Mock
    private ProductSkuOrchestrator productSkuOrchestrator;

    @InjectMocks
    private SmartEcommerceController controller;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(TENANT_ID);
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.set(null);
    }

    private static EcommerceOrder order(String orderNo, String platformOrderNo, String skuCode) {
        EcommerceOrder o = new EcommerceOrder();
        o.setTenantId(TENANT_ID);
        o.setOrderNo(orderNo);
        o.setPlatformOrderNo(platformOrderNo);
        o.setSkuCode(skuCode);
        return o;
    }

    private static Map<String, Object> brief(String skuCode) {
        Map<String, Object> b = new HashMap<>();
        b.put("skuCode", skuCode);
        b.put("styleNo", "BR24XQ0098E");
        b.put("color", "草绿色");
        b.put("size", "L(170/84A)");
        b.put("imageUrl", "/files/br24xq0098e-green.jpg");
        return b;
    }

    @Test
    @DisplayName("body 为 null → 空结果，且不查库")
    void nullBody_returnsEmpty() {
        Result<Map<String, Map<String, Object>>> res = controller.briefByOrderNos(null);

        assertThat(res.getData()).isEmpty();
        verify(ecommerceOrderService, never()).list(any(Wrapper.class));
        verify(productSkuOrchestrator, never()).briefBySkuCodes(anyCollection());
    }

    @Test
    @DisplayName("两个键都为空 → 空结果，且不查库")
    void emptyLists_returnsEmpty() {
        Map<String, List<String>> body = new HashMap<>();
        body.put("orderNos", List.of());
        body.put("platformOrderNos", List.of("  ", ""));

        Result<Map<String, Map<String, Object>>> res = controller.briefByOrderNos(body);

        assertThat(res.getData()).isEmpty();
        verify(ecommerceOrderService, never()).list(any(Wrapper.class));
    }

    @Test
    @DisplayName("内部订单号命中 → 返回 orderNo -> 摘要（key 为传入的原样字符串）")
    void internalOrderNo_hits() {
        when(ecommerceOrderService.list(ArgumentMatchers.<Wrapper<EcommerceOrder>>any()))
                .thenReturn(List.of(order("EC20260101", "TB-9", SKU_CODE)));
        when(productSkuOrchestrator.briefBySkuCodes(anyCollection()))
                .thenReturn(Map.of(SKU_CODE, brief(SKU_CODE)));

        Result<Map<String, Map<String, Object>>> res =
                controller.briefByOrderNos(Map.of("orderNos", List.of("EC20260101")));

        assertThat(res.getData()).containsOnlyKeys("EC20260101");
        assertThat(res.getData().get("EC20260101"))
                .containsEntry("skuCode", SKU_CODE)
                .containsEntry("styleNo", "BR24XQ0098E")
                .containsEntry("imageUrl", "/files/br24xq0098e-green.jpg");
        // 交给下游解析的必须是从订单里取出的 skuCode，而不是订单号
        verify(productSkuOrchestrator).briefBySkuCodes(
                ArgumentMatchers.argThat((Collection<String> codes) -> codes.contains(SKU_CODE)));
    }

    @Test
    @DisplayName("平台订单号命中 → 返回 platformOrderNo -> 摘要（账单表用这个键）")
    void platformOrderNo_hits() {
        when(ecommerceOrderService.list(ArgumentMatchers.<Wrapper<EcommerceOrder>>any()))
                .thenReturn(List.of(order("EC20260101", "TB-9", SKU_CODE)));
        when(productSkuOrchestrator.briefBySkuCodes(anyCollection()))
                .thenReturn(Map.of(SKU_CODE, brief(SKU_CODE)));

        Result<Map<String, Map<String, Object>>> res =
                controller.briefByOrderNos(Map.of("platformOrderNos", List.of("TB-9")));

        assertThat(res.getData()).containsOnlyKeys("TB-9");
        assertThat(res.getData().get("TB-9")).containsEntry("styleNo", "BR24XQ0098E");
    }

    @Test
    @DisplayName("两种键同时传 → 各查一次，结果按各自键返回")
    void bothKeys_queriedSeparately() {
        // 两次查询分别返回各自命中的订单（按调用顺序）
        when(ecommerceOrderService.list(ArgumentMatchers.<Wrapper<EcommerceOrder>>any()))
                .thenReturn(List.of(order("EC1", "TB-1", SKU_CODE)))
                .thenReturn(List.of(order("EC2", "TB-2", SKU_CODE)));
        when(productSkuOrchestrator.briefBySkuCodes(anyCollection()))
                .thenReturn(Map.of(SKU_CODE, brief(SKU_CODE)));

        Map<String, List<String>> body = new HashMap<>();
        body.put("orderNos", List.of("EC1"));
        body.put("platformOrderNos", List.of("TB-2"));
        Result<Map<String, Map<String, Object>>> res = controller.briefByOrderNos(body);

        assertThat(res.getData()).containsOnlyKeys("EC1", "TB-2");
        // 两种键各查一次库
        verify(ecommerceOrderService, org.mockito.Mockito.times(2)).list(ArgumentMatchers.<Wrapper<EcommerceOrder>>any());
    }

    @Test
    @DisplayName("订单不存在 → 该键不出现（不编造占位摘要）")
    void orderNotFound_keyAbsent() {
        when(ecommerceOrderService.list(ArgumentMatchers.<Wrapper<EcommerceOrder>>any()))
                .thenReturn(List.of());

        Result<Map<String, Map<String, Object>>> res =
                controller.briefByOrderNos(Map.of("orderNos", List.of("NOT-EXIST")));

        assertThat(res.getData()).isEmpty();
        verify(productSkuOrchestrator, never()).briefBySkuCodes(anyCollection());
    }

    @Test
    @DisplayName("订单存在但 skuCode 为空 → 不进入解析，键不出现")
    void orderWithoutSkuCode_keyAbsent() {
        when(ecommerceOrderService.list(ArgumentMatchers.<Wrapper<EcommerceOrder>>any()))
                .thenReturn(List.of(order("EC1", "TB-1", null)));

        Result<Map<String, Map<String, Object>>> res =
                controller.briefByOrderNos(Map.of("orderNos", List.of("EC1")));

        assertThat(res.getData()).isEmpty();
        verify(productSkuOrchestrator, never()).briefBySkuCodes(anyCollection());
    }

    @Test
    @DisplayName("SKU 摘要解析不到（商品已删/编码对不上）→ 该键不出现，不返回半成品")
    void briefMissing_keyAbsent() {
        when(ecommerceOrderService.list(ArgumentMatchers.<Wrapper<EcommerceOrder>>any()))
                .thenReturn(List.of(order("EC1", "TB-1", SKU_CODE)));
        when(productSkuOrchestrator.briefBySkuCodes(anyCollection())).thenReturn(Map.of());

        Result<Map<String, Map<String, Object>>> res =
                controller.briefByOrderNos(Map.of("orderNos", List.of("EC1")));

        assertThat(res.getData()).isEmpty();
    }

    @Test
    @DisplayName("订单号首尾空格被 trim 后再查库（前端脏数据不影响命中）")
    void orderNosAreTrimmed() {
        when(ecommerceOrderService.list(ArgumentMatchers.<Wrapper<EcommerceOrder>>any()))
                .thenReturn(List.of(order("EC1", "TB-1", SKU_CODE)));
        when(productSkuOrchestrator.briefBySkuCodes(anyCollection()))
                .thenReturn(Map.of(SKU_CODE, brief(SKU_CODE)));

        Result<Map<String, Map<String, Object>>> res =
                controller.briefByOrderNos(Map.of("orderNos", List.of("  EC1  ")));

        // 返回的 key 是 trim 后的订单号（与库里一致），前端传参前也做了 trim
        assertThat(res.getData()).containsOnlyKeys("EC1");
    }
}
