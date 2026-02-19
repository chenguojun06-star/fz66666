package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.entity.ProductionOrder;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * OrderStockFillService集成测试
 * 使用真实数据库进行测试
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class OrderStockFillServiceIntegrationTest {

    @Autowired
    private OrderStockFillService orderStockFillService;

    @Test
    void fillStockSummary_WithNullRecords_ShouldReturnImmediately() {
        // 测试null输入
        assertDoesNotThrow(() -> orderStockFillService.fillStockSummary(null));
    }

    @Test
    void fillStockSummary_WithEmptyRecords_ShouldReturnImmediately() {
        // 测试空列表
        assertDoesNotThrow(() -> orderStockFillService.fillStockSummary(Collections.emptyList()));
    }

    @Test
    void fillStockSummary_WithNullOrderIds_ShouldSkipNullRecords() {
        // 准备测试数据（包含null ID）
        ProductionOrder order1 = new ProductionOrder();
        order1.setId("TEST001");

        ProductionOrder order2 = new ProductionOrder();
        order2.setId(null); // null ID

        List<ProductionOrder> records = List.of(order1, order2);

        // 执行测试
        assertDoesNotThrow(() -> orderStockFillService.fillStockSummary(records));

        // 验证null ID的订单未被处理（字段仍为null）
        assertNull(order2.getWarehousingQualifiedQuantity());
    }

    @Test
    void fillStockSummary_WithNonExistentOrder_ShouldSetZero() {
        // 准备测试数据（不存在的订单ID）
        ProductionOrder order = new ProductionOrder();
        order.setId("NON_EXISTENT_ORDER_12345");

        List<ProductionOrder> records = List.of(order);

        // 执行测试
        orderStockFillService.fillStockSummary(records);

        // 验证结果被设置为0
        assertEquals(0, order.getWarehousingQualifiedQuantity());
        assertEquals(0, order.getOutstockQuantity());
        assertEquals(0, order.getInStockQuantity());
    }
}
