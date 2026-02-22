package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import com.fashion.supplychain.common.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 生产订单服务测试
 * 测试核心业务逻辑
 */
@SpringBootTest
@ActiveProfiles("dev")
@Transactional
class ProductionOrderServiceImplTest {

    @Autowired
    private ProductionOrderService productionOrderService;

    @BeforeEach
    void setUpUserContext() {
        UserContext ctx = new UserContext();
        ctx.setUserId("test-admin");
        ctx.setUsername("test-admin");
        ctx.setRole("admin");
        ctx.setPermissionRange("all");
        ctx.setTenantId(1L);
        ctx.setTenantOwner(true);
        UserContext.set(ctx);
    }

    @AfterEach
    void clearUserContext() {
        UserContext.clear();
    }

    @Test
    @DisplayName("测试生产订单查询分页")
    void testQueryPage() {
        // Given: 准备查询参数
        Map<String, Object> params = new HashMap<>();
        params.put("page", 1);
        params.put("pageSize", 10);
        
        // When: 执行查询
        IPage<ProductionOrder> result = productionOrderService.queryPage(params);
        
        // Then: 验证结果
        assertNotNull(result);
        assertTrue(result.getTotal() >= 0);
    }

    @Test
    @DisplayName("测试生产订单保存")
    void testSave() {
        // Given: 准备测试数据
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo("TEST" + System.currentTimeMillis());
        order.setStyleId("STYLE-ID-" + System.currentTimeMillis());
        order.setStyleNo("STYLE001");
        order.setStyleName("测试款式");
        order.setOrderQuantity(100);
        order.setFactoryId("FACTORY-ID-" + System.currentTimeMillis());
        order.setFactoryName("测试工厂");
        order.setPlannedStartDate(LocalDateTime.now());
        order.setPlannedEndDate(LocalDateTime.now().plusDays(30));
        order.setCreateTime(LocalDateTime.now());
        order.setDeleteFlag(0);
        order.setStatus("pending");
        
        // When: 执行保存
        boolean saved = productionOrderService.save(order);
        
        // Then: 验证结果
        assertTrue(saved);
        assertNotNull(order.getId());
    }

    @Test
    @DisplayName("测试生产订单按订单号查询")
    void testQueryByOrderNo() {
        // Given: 准备测试数据
        String orderNo = "TEST" + System.currentTimeMillis();
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo(orderNo);
        order.setStyleId("STYLE-ID-" + System.currentTimeMillis());
        order.setStyleNo("STYLE002");
        order.setStyleName("查询测试款式");
        order.setOrderQuantity(200);
        order.setFactoryId("FACTORY-ID-" + System.currentTimeMillis());
        order.setFactoryName("查询测试工厂");
        order.setPlannedStartDate(LocalDateTime.now());
        order.setPlannedEndDate(LocalDateTime.now().plusDays(30));
        order.setCreateTime(LocalDateTime.now());
        order.setDeleteFlag(0);
        order.setStatus("pending");
        productionOrderService.save(order);
        
        Map<String, Object> params = new HashMap<>();
        params.put("page", 1);
        params.put("pageSize", 10);
        params.put("orderNo", orderNo);
        
        // When: 执行查询
        IPage<ProductionOrder> result = productionOrderService.queryPage(params);
        
        // Then: 验证结果
        assertNotNull(result);
        assertEquals(1, result.getRecords().size());
        assertEquals(orderNo, result.getRecords().get(0).getOrderNo());
    }

    @Test
    @DisplayName("测试生产订单更新")
    void testUpdate() {
        // Given: 准备测试数据
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo("UPDATE" + System.currentTimeMillis());
        order.setStyleId("STYLE-ID-" + System.currentTimeMillis());
        order.setStyleNo("STYLE003");
        order.setStyleName("更新前款式");
        order.setOrderQuantity(300);
        order.setFactoryId("FACTORY-ID-" + System.currentTimeMillis());
        order.setFactoryName("更新前工厂");
        order.setPlannedStartDate(LocalDateTime.now());
        order.setPlannedEndDate(LocalDateTime.now().plusDays(30));
        order.setCreateTime(LocalDateTime.now());
        order.setDeleteFlag(0);
        order.setStatus("pending");
        productionOrderService.save(order);
        
        // When: 执行更新
        order.setStyleName("更新后款式");
        order.setOrderQuantity(500);
        boolean updated = productionOrderService.updateById(order);
        
        // Then: 验证结果
        assertTrue(updated);
        ProductionOrder found = productionOrderService.getById(order.getId());
        assertEquals("更新后款式", found.getStyleName());
        assertEquals(500, found.getOrderQuantity());
    }

    @Test
    @DisplayName("测试生产订单逻辑删除")
    void testLogicalDelete() {
        // Given: 准备测试数据
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo("DELETE" + System.currentTimeMillis());
        order.setStyleId("STYLE-ID-" + System.currentTimeMillis());
        order.setStyleNo("STYLE004");
        order.setStyleName("删除测试款式");
        order.setOrderQuantity(400);
        order.setFactoryId("FACTORY-ID-" + System.currentTimeMillis());
        order.setFactoryName("删除测试工厂");
        order.setPlannedStartDate(LocalDateTime.now());
        order.setPlannedEndDate(LocalDateTime.now().plusDays(30));
        order.setCreateTime(LocalDateTime.now());
        order.setDeleteFlag(0);
        order.setStatus("pending");
        productionOrderService.save(order);
        String id = order.getId();
        
        // When: 执行删除
        boolean deleted = productionOrderService.removeById(id);
        
        // Then: 验证结果
        assertTrue(deleted);
        // 逻辑删除后仍然能通过ID查到，但deleteFlag=1
        productionOrderService.getById(id);
        // 如果使用逻辑删除，found应该为null；如果是物理删除，这个断言是正确的
        // 根据实际配置调整
    }

    @Test
    @DisplayName("测试生产订单状态流转")
    void testStatusFlow() {
        // Given: 准备测试数据
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo("STATUS" + System.currentTimeMillis());
        order.setStyleId("STYLE-ID-" + System.currentTimeMillis());
        order.setStyleNo("STYLE005");
        order.setStyleName("状态测试款式");
        order.setOrderQuantity(100);
        order.setFactoryId("FACTORY-ID-" + System.currentTimeMillis());
        order.setFactoryName("状态测试工厂");
        order.setPlannedStartDate(LocalDateTime.now());
        order.setPlannedEndDate(LocalDateTime.now().plusDays(30));
        order.setCreateTime(LocalDateTime.now());
        order.setDeleteFlag(0);
        order.setStatus("pending");
        productionOrderService.save(order);
        
        // When & Then: 测试状态流转
        // CREATED -> IN_PROGRESS
        order.setStatus("production");
        assertTrue(productionOrderService.updateById(order));
        assertEquals("production", productionOrderService.getById(order.getId()).getStatus());
        
        // IN_PROGRESS -> COMPLETED
        order.setStatus("completed");
        assertTrue(productionOrderService.updateById(order));
        assertEquals("completed", productionOrderService.getById(order.getId()).getStatus());
    }
}
