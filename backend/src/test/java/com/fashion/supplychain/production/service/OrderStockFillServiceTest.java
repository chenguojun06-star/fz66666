package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductOutstockMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * OrderStockFillService单元测试
 */
@ExtendWith(MockitoExtension.class)
class OrderStockFillServiceTest {

    @Mock
    private ProductWarehousingMapper productWarehousingMapper;

    @Mock
    private ProductOutstockMapper productOutstockMapper;

    @InjectMocks
    private OrderStockFillService orderStockFillService;

    @BeforeEach
    void setUp() {
        // MockitoExtension会自动初始化Mock
    }

    @Test
    void fillStockSummary_WithNullRecords_ShouldReturnImmediately() {
        // 测试null输入
        orderStockFillService.fillStockSummary(null);

        // 验证没有调用mapper
        verify(productWarehousingMapper, never()).selectList(any());
        verify(productOutstockMapper, never()).selectList(any());
    }

    @Test
    void fillStockSummary_WithEmptyRecords_ShouldReturnImmediately() {
        // 测试空列表
        orderStockFillService.fillStockSummary(Collections.emptyList());

        // 验证没有调用mapper
        verify(productWarehousingMapper, never()).selectList(any());
        verify(productOutstockMapper, never()).selectList(any());
    }

    @Test
    void fillStockSummary_WithNullOrderIds_ShouldSkipNullRecords() {
        // 准备测试数据（包含null ID）
        ProductionOrder order1 = new ProductionOrder();
        order1.setId("ORDER001");

        ProductionOrder order2 = new ProductionOrder();
        order2.setId(null); // null ID

        List<ProductionOrder> records = Arrays.asList(order1, order2);

        // Mock数据 - 使用ArgumentCaptor来捕获查询条件
        ProductWarehousing warehousing = new ProductWarehousing();
        warehousing.setOrderId("ORDER001");
        warehousing.setQualifiedQuantity(50);
        warehousing.setDeleteFlag(0);

        when(productWarehousingMapper.selectList(any())).thenReturn(
            Collections.singletonList(warehousing)
        );
        when(productOutstockMapper.selectList(any())).thenReturn(Collections.emptyList());

        // 执行测试
        orderStockFillService.fillStockSummary(records);

        // 验证mapper被调用
        verify(productWarehousingMapper).selectList(any());
        verify(productOutstockMapper).selectList(any());
    }

    @Test
    void fillStockSummary_WhenMapperThrowsException_ShouldHandleGracefully() {
        // 准备测试数据
        ProductionOrder order = new ProductionOrder();
        order.setId("ORDER001");

        List<ProductionOrder> records = Collections.singletonList(order);

        // Mock抛出异常
        when(productWarehousingMapper.selectList(any())).thenThrow(
            new RuntimeException("Database error")
        );
        when(productOutstockMapper.selectList(any())).thenReturn(Collections.emptyList());

        // 执行测试（不应抛出异常）
        assertDoesNotThrow(() -> orderStockFillService.fillStockSummary(records));

        // 验证mapper被调用
        verify(productWarehousingMapper).selectList(any());
    }

    @Test
    void fillStockSummary_WithNoMatchingData_ShouldSetZero() {
        // 准备测试数据
        ProductionOrder order = new ProductionOrder();
        order.setId("ORDER001");

        List<ProductionOrder> records = Collections.singletonList(order);

        // Mock返回空数据
        when(productWarehousingMapper.selectList(any())).thenReturn(Collections.emptyList());
        when(productOutstockMapper.selectList(any())).thenReturn(Collections.emptyList());

        // 执行测试
        orderStockFillService.fillStockSummary(records);

        // 验证结果被设置为0
        assertEquals(0, order.getWarehousingQualifiedQuantity());
        assertEquals(0, order.getOutstockQuantity());
        assertEquals(0, order.getInStockQuantity());
    }

    @Test
    void fillStockSummary_WithValidData_ShouldCalculateCorrectly() {
        // 准备测试数据
        ProductionOrder order = new ProductionOrder();
        order.setId("ORDER001");

        List<ProductionOrder> records = Collections.singletonList(order);

        // Mock入库数据
        ProductWarehousing warehousing = new ProductWarehousing();
        warehousing.setOrderId("ORDER001");
        warehousing.setQualifiedQuantity(100);
        warehousing.setDeleteFlag(0);

        when(productWarehousingMapper.selectList(any())).thenReturn(
            Collections.singletonList(warehousing)
        );

        // Mock出库数据
        ProductOutstock outstock = new ProductOutstock();
        outstock.setOrderId("ORDER001");
        outstock.setOutstockQuantity(30);
        outstock.setDeleteFlag(0);

        when(productOutstockMapper.selectList(any())).thenReturn(
            Collections.singletonList(outstock)
        );

        // 执行测试
        orderStockFillService.fillStockSummary(records);

        // 验证结果
        assertEquals(100, order.getWarehousingQualifiedQuantity());
        assertEquals(30, order.getOutstockQuantity());
        assertEquals(70, order.getInStockQuantity()); // 100 - 30
    }

    @Test
    void fillStockSummary_WithMultipleOrders_ShouldProcessAll() {
        // 准备测试数据
        ProductionOrder order1 = new ProductionOrder();
        order1.setId("ORDER001");

        ProductionOrder order2 = new ProductionOrder();
        order2.setId("ORDER002");

        List<ProductionOrder> records = Arrays.asList(order1, order2);

        // Mock入库数据
        ProductWarehousing warehousing1 = new ProductWarehousing();
        warehousing1.setOrderId("ORDER001");
        warehousing1.setQualifiedQuantity(50);
        warehousing1.setDeleteFlag(0);

        ProductWarehousing warehousing2 = new ProductWarehousing();
        warehousing2.setOrderId("ORDER002");
        warehousing2.setQualifiedQuantity(80);
        warehousing2.setDeleteFlag(0);

        when(productWarehousingMapper.selectList(any())).thenReturn(
            Arrays.asList(warehousing1, warehousing2)
        );

        // Mock出库数据
        ProductOutstock outstock1 = new ProductOutstock();
        outstock1.setOrderId("ORDER001");
        outstock1.setOutstockQuantity(20);
        outstock1.setDeleteFlag(0);

        ProductOutstock outstock2 = new ProductOutstock();
        outstock2.setOrderId("ORDER002");
        outstock2.setOutstockQuantity(30);
        outstock2.setDeleteFlag(0);

        when(productOutstockMapper.selectList(any())).thenReturn(
            Arrays.asList(outstock1, outstock2)
        );

        // 执行测试
        orderStockFillService.fillStockSummary(records);

        // 验证第一个订单
        assertEquals(50, order1.getWarehousingQualifiedQuantity());
        assertEquals(20, order1.getOutstockQuantity());
        assertEquals(30, order1.getInStockQuantity());

        // 验证第二个订单
        assertEquals(80, order2.getWarehousingQualifiedQuantity());
        assertEquals(30, order2.getOutstockQuantity());
        assertEquals(50, order2.getInStockQuantity());
    }
}
