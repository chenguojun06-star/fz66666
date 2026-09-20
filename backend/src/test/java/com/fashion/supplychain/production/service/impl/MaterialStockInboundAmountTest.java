package com.fashion.supplychain.production.service.impl;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * D-474：物料仓储"本月入库金额"的取值规则。
 * 这段是钱的逻辑——入库单经常只录数量，取值顺序错了就会算出 0 或翻倍。
 */
class MaterialStockInboundAmountTest {

    private static int cmp(BigDecimal a, BigDecimal b) {
        return a.compareTo(b);
    }

    @Test
    @DisplayName("入库单录了金额：直接用金额，不再折算")
    void useTotalAmountWhenPresent() {
        assertEquals(0, cmp(new BigDecimal("118.00"),
                MaterialStockServiceImpl.resolveInboundAmount(
                        new BigDecimal("118.00"), new BigDecimal("60.00"), new BigDecimal("2"), new BigDecimal("70.00"))));
    }

    @Test
    @DisplayName("没金额但有单价：按 单价 × 数量 计算")
    void useUnitPriceWhenNoTotalAmount() {
        assertEquals(0, cmp(new BigDecimal("120.00"),
                MaterialStockServiceImpl.resolveInboundAmount(
                        null, new BigDecimal("60.00"), new BigDecimal("2"), new BigDecimal("70.00"))));
    }

    @Test
    @DisplayName("金额和单价都空：按库存单价折算（否则本月入库金额恒为 0）")
    void fallbackToStockUnitPrice() {
        assertEquals(0, cmp(new BigDecimal("140.00"),
                MaterialStockServiceImpl.resolveInboundAmount(
                        null, null, new BigDecimal("2"), new BigDecimal("70.00"))));
    }

    @Test
    @DisplayName("全空或数量为空：按 0 处理，不报错")
    void emptyInputsAreZero() {
        assertEquals(0, cmp(BigDecimal.ZERO,
                MaterialStockServiceImpl.resolveInboundAmount(null, null, null, null)));
        assertEquals(0, cmp(BigDecimal.ZERO,
                MaterialStockServiceImpl.resolveInboundAmount(null, null, new BigDecimal("5"), null)));
    }
}
