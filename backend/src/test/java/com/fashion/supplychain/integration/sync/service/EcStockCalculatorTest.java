package com.fashion.supplychain.integration.sync.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * EcStockCalculator 可售库存口径测试。
 *
 * <p>守护点：<b>待发货占用必须真的被算进去</b>。
 * 历史缺陷：待发货按"款号-颜色-尺码"切分 SKU 猜款号，
 * 而真实 SKU 编码是"款号直接拼颜色尺码"（无分隔符），导致匹配恒失败、
 * 待发货占用恒为 0，可售库存虚高，会直接推错库存给电商平台。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("EcStockCalculator - 可售库存计算")
class EcStockCalculatorTest {

    private static final Long STYLE_ID = 147L;
    private static final Long SKU_ID = 229L;
    /** 真实编码形态：款号直接拼颜色尺码，无分隔符 */
    private static final String SKU_CODE = "BR24XQ0098E草绿色L(170/84A)";

    @Mock private ProductWarehousingService productWarehousingService;
    @Mock private ProductOutstockService productOutstockService;
    @Mock private EcommerceOrderService ecommerceOrderService;
    @Mock private ProductSkuService productSkuService;

    @InjectMocks private EcStockCalculator calculator;

    private ProductWarehousing warehousing(int qualified) {
        ProductWarehousing w = new ProductWarehousing();
        w.setQualifiedQuantity(qualified);
        return w;
    }

    private ProductOutstock outstock(int qty) {
        ProductOutstock o = new ProductOutstock();
        o.setOutstockQuantity(qty);
        return o;
    }

    @Test
    @DisplayName("待发货占用计入可售库存（无分隔符的真实 SKU 编码也能匹配上）")
    void pendingShipIsDeducted() {
        ProductSku sku = new ProductSku();
        sku.setId(SKU_ID);
        sku.setStyleId(STYLE_ID);
        sku.setSkuCode(SKU_CODE);
        when(productSkuService.getById(SKU_ID)).thenReturn(sku);

        // 该款下的内部 SKU 编码
        when(productSkuService.list(ArgumentMatchers.<Wrapper<ProductSku>>any()))
                .thenReturn(List.of(sku));

        // 入库 100 / 出库 20 / 待发货 30 / 缓冲 5 → 可售 45
        when(productWarehousingService.list(ArgumentMatchers.<Wrapper<ProductWarehousing>>any()))
                .thenReturn(List.of(warehousing(100)));
        when(productOutstockService.list(ArgumentMatchers.<Wrapper<ProductOutstock>>any()))
                .thenReturn(List.of(outstock(20)));

        EcommerceOrder pending = new EcommerceOrder();
        pending.setSkuCode(SKU_CODE);
        pending.setQuantity(30);
        when(ecommerceOrderService.list(ArgumentMatchers.<Wrapper<EcommerceOrder>>any()))
                .thenReturn(List.of(pending));

        int available = calculator.calculateAvailableStock(STYLE_ID, SKU_ID);

        // 若待发货未被计入（历史缺陷），这里会是 75
        assertThat(available).isEqualTo(45);
    }

    @Test
    @DisplayName("该款下没有 SKU 时不把待发货算成 0 之外的数：仅扣入库-出库-缓冲")
    void noSkuCodes_noPendingDeduction() {
        ProductSku sku = new ProductSku();
        sku.setId(SKU_ID);
        sku.setStyleId(STYLE_ID);
        when(productSkuService.getById(SKU_ID)).thenReturn(sku);
        when(productSkuService.list(ArgumentMatchers.<Wrapper<ProductSku>>any())).thenReturn(List.of());

        when(productWarehousingService.list(ArgumentMatchers.<Wrapper<ProductWarehousing>>any()))
                .thenReturn(List.of(warehousing(100)));
        when(productOutstockService.list(ArgumentMatchers.<Wrapper<ProductOutstock>>any()))
                .thenReturn(List.of(outstock(20)));

        assertThat(calculator.calculateAvailableStock(STYLE_ID, SKU_ID)).isEqualTo(75);
    }

    @Test
    @DisplayName("SKU 不存在 → 返回 0，不抛异常")
    void skuNotFound_returnsZero() {
        when(productSkuService.getById(SKU_ID)).thenReturn(null);

        assertThat(calculator.calculateAvailableStock(STYLE_ID, SKU_ID)).isZero();
    }
}
