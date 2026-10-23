package com.fashion.supplychain.warehouse.helper;

import com.fashion.supplychain.style.entity.ProductSku;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * D-847：质检直发模式的库存守卫。
 *
 * <p>背景（2026-10-23 生产排查）：BR24XQ0098E 从「质检直发入口」出库 300 件
 * （5 条出库单全 approved、库位 A-01-1-1），但货实际还在成品库存（300 件）——
 * 直发跳过扣库存 → 出库单已算发货、库存原地不动 → 幽灵库存 300 件，对账永不闭合。
 *
 * <p>本测试守护：货还在成品库存里时，直发必须被拒绝。
 */
class FinishedOutstockDirectShipGuardTest {

    @Test
    @DisplayName("直发 + 库存 > 0：必须拒绝（货在库位上不该走直发）")
    void rejectsDirectShipWhenStockExists() {
        ProductSku sku = new ProductSku();
        sku.setSkuCode("BR24XQ0098E草绿色S(160/76A)");
        sku.setStockQuantity(60);

        assertThatThrownBy(() -> FinishedOutstockHelper.assertDirectShipAllowed(sku))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("尚有 60 件成品库存")
                .hasMessageContaining("请从库存管理页正常出库");
    }

    @Test
    @DisplayName("直发 + 库存为 0：允许（货确实没进过成品库存）")
    void allowsDirectShipWhenNoStock() {
        ProductSku sku = new ProductSku();
        sku.setSkuCode("NEW-STYLE-黑-M");
        sku.setStockQuantity(0);

        assertThatCode(() -> FinishedOutstockHelper.assertDirectShipAllowed(sku)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("直发 + 库存字段为空：按 0 处理，允许")
    void allowsDirectShipWhenStockNull() {
        ProductSku sku = new ProductSku();
        sku.setSkuCode("NEW-STYLE-黑-L");
        sku.setStockQuantity(null);

        assertThatCode(() -> FinishedOutstockHelper.assertDirectShipAllowed(sku)).doesNotThrowAnyException();
    }
}
