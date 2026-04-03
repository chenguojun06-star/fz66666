package com.fashion.supplychain.production.integration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
public class MaterialPurchaseStockIntegrationTest {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUpUserContext() {
        ensureTestTables();
        jdbcTemplate.execute("DELETE FROM t_material_stock");
        jdbcTemplate.execute("DELETE FROM t_material_purchase");

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
    @DisplayName("验证采购入库后库存自动增加")
    public void testPurchaseArrivedSyncsStock() {
        // 1. 准备数据：创建一个新的采购单
        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setPurchaseNo("TEST_P001");
        purchase.setMaterialCode("TEST_M001");
        purchase.setMaterialName("测试面料");
        purchase.setMaterialType("fabric");
        purchase.setColor("Red");
        purchase.setSize("L");
        purchase.setUnit("米"); // Set required unit field
        purchase.setPurchaseQuantity(new BigDecimal(100));
        purchase.setArrivedQuantity(0); // 初始未到货
        purchase.setUnitPrice(new BigDecimal("10.0"));
        purchase.setSupplierName("Test Supplier");
        purchase.setSourceType("independent"); // 非订单驱动采购，确保库存同步生效

        boolean saved = materialPurchaseService.save(purchase);
        Assertions.assertTrue(saved, "采购单保存失败");
        String purchaseId = purchase.getId();

        // 2. 验证初始库存为0
        MaterialStock initialStock = getStock("TEST_M001", "Red", "L");
        Assertions.assertNull(initialStock, "初始库存应为空");

        // 3. 模拟前端操作：更新到货数量为 50
        boolean updated = materialPurchaseService.updateArrivedQuantity(purchaseId, 50, "部分到货");
        Assertions.assertTrue(updated, "更新到货数量失败");

        // 4. 验证库存增加 50
        MaterialStock stockAfterFirstArrival = getStock("TEST_M001", "Red", "L");
        Assertions.assertNotNull(stockAfterFirstArrival, "库存记录未创建");
        Assertions.assertEquals(50, stockAfterFirstArrival.getQuantity(), "库存数量应为50");

        // 5. 模拟前端操作：再次更新到货数量为 80 (即又到了30)
        // 注意：updateArrivedQuantity 接收的是累积到货量
        updated = materialPurchaseService.updateArrivedQuantity(purchaseId, 80, "再次到货");
        Assertions.assertTrue(updated);

        // 6. 验证库存增加到 80
        MaterialStock stockAfterSecondArrival = getStock("TEST_M001", "Red", "L");
        Assertions.assertEquals(80, stockAfterSecondArrival.getQuantity(), "库存数量应为80");

        // 手动刷新一下，因为MyBatis Plus缓存或者事务可见性问题？
        // 其实不需要，因为是同一个事务内。
        // 但要注意 updateStockQuantity 是直接 SQL update，可能对象没刷新？
        // getStock 是查数据库，应该没问题。

        // 7. 模拟数据修正：发现数错了，其实只到了 70 (即扣减10)
        // 关键点：updateArrivedQuantity 内部是先 getById，然后计算 delta。
        // 但是在同一个事务中，如果上一次 updateArrivedQuantity 调用后，MyBatis的一级缓存或者Hibernate Session缓存
        // 如果 materialPurchaseService.getById(id)
        // 拿到的是旧对象（arrived=50），而不是第二次更新后的（arrived=80）
        // 那么 delta = 70 - 50 = +20，而不是 70 - 80 = -10。

        // 强制刷新一下上下文或者确保 getById 拿到最新值。
        // 由于 updateArrivedQuantity 内部调用了 this.updateById(materialPurchase)，
        // 理论上数据库已经更新。

        // 但是在 Spring Boot Test @Transactional 中，所有操作在同一个事务。
        // 如果 ServiceImpl 内部有 @Transactional，且测试类也有 @Transactional，默认是 propagation
        // REQUIRED，即加入测试事务。

        // 问题可能出在 materialPurchaseService.getById(id)。
        // MyBatis-Plus 的 getById 默认可能走缓存？或者事务内可见性问题？
        // 让我们尝试在 updateArrivedQuantity 之前清除一下缓存，或者重新查。

        // 但这里我们是在 Test 类调用 Service 方法。
        // 让我们先断言一下此时数据库里的状态。
        MaterialPurchase p80 = materialPurchaseService.getById(purchaseId);
        Assertions.assertEquals(80, p80.getArrivedQuantity());

        updated = materialPurchaseService.updateArrivedQuantity(purchaseId, 70, "修正数量");
        Assertions.assertTrue(updated);

        // 8. 验证库存减少到 70
        MaterialStock stockAfterCorrection = getStock("TEST_M001", "Red", "L");
        // 调试输出
        System.out.println("DEBUG: stockAfterCorrection=" + stockAfterCorrection.getQuantity());
        Assertions.assertEquals(70, stockAfterCorrection.getQuantity(), "修正后库存应为70");
    }

    private MaterialStock getStock(String code, String color, String size) {
        List<MaterialStock> list = materialStockService.list(new LambdaQueryWrapper<MaterialStock>()
                .eq(MaterialStock::getMaterialCode, code)
                .eq(MaterialStock::getColor, color)
                .eq(MaterialStock::getSize, size));
        return list.isEmpty() ? null : list.get(0);
    }

    private void ensureTestTables() {
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS t_material_purchase ("
                + "id VARCHAR(64) PRIMARY KEY,"
                + "purchase_no VARCHAR(64),"
                + "material_id VARCHAR(64),"
                + "material_code VARCHAR(64),"
                + "material_name VARCHAR(128),"
                + "material_type VARCHAR(64),"
                + "specifications VARCHAR(255),"
                + "unit VARCHAR(32),"
                + "purchase_quantity DECIMAL(18,2),"
                + "conversion_rate DECIMAL(18,2),"
                + "arrived_quantity INT,"
                + "inbound_record_id VARCHAR(64),"
                + "supplier_id VARCHAR(64),"
                + "supplier_name VARCHAR(128),"
                + "supplier_contact_person VARCHAR(64),"
                + "supplier_contact_phone VARCHAR(64),"
                + "unit_price DECIMAL(18,2),"
                + "total_amount DECIMAL(18,2),"
                + "receiver_id VARCHAR(64),"
                + "receiver_name VARCHAR(64),"
                + "received_time TIMESTAMP,"
                + "remark VARCHAR(500),"
                + "order_id VARCHAR(64),"
                + "order_no VARCHAR(64),"
                + "style_id VARCHAR(64),"
                + "style_no VARCHAR(64),"
                + "style_name VARCHAR(128),"
                + "style_cover VARCHAR(255),"
                + "color VARCHAR(64),"
                + "size VARCHAR(64),"
                + "return_confirmed INT,"
                + "return_quantity INT,"
                + "return_confirmer_id VARCHAR(64),"
                + "return_confirmer_name VARCHAR(64),"
                + "return_confirm_time TIMESTAMP,"
                + "status VARCHAR(64),"
                + "create_time TIMESTAMP,"
                + "update_time TIMESTAMP,"
                + "delete_flag INT DEFAULT 0,"
                + "creator_id VARCHAR(64),"
                + "creator_name VARCHAR(64),"
                + "updater_id VARCHAR(64),"
                + "updater_name VARCHAR(64),"
                + "expected_arrival_date TIMESTAMP,"
                + "actual_arrival_date TIMESTAMP,"
                + "expected_ship_date DATE,"
                + "source_type VARCHAR(64),"
                + "pattern_production_id VARCHAR(64),"
                + "tenant_id BIGINT,"
                + "evidence_image_urls VARCHAR(1000),"
                + "fabric_composition VARCHAR(255),"
                + "invoice_urls VARCHAR(1000),"
                + "audit_status VARCHAR(50) DEFAULT 'none',"
                + "audit_reason VARCHAR(500),"
                + "audit_time TIMESTAMP,"
                + "audit_operator_id VARCHAR(50),"
                + "audit_operator_name VARCHAR(100)"
                + ")");

        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS t_material_stock ("
                + "id VARCHAR(64) PRIMARY KEY,"
                + "material_id VARCHAR(64),"
                + "material_code VARCHAR(64),"
                + "material_name VARCHAR(128),"
                + "material_type VARCHAR(64),"
                + "specifications VARCHAR(255),"
                + "unit VARCHAR(32),"
                + "color VARCHAR(64),"
                + "size VARCHAR(64),"
                + "supplier_name VARCHAR(128),"
                + "supplier_id VARCHAR(64),"
                + "supplier_contact_person VARCHAR(64),"
                + "supplier_contact_phone VARCHAR(64),"
                + "fabric_width VARCHAR(64),"
                + "fabric_weight VARCHAR(64),"
                + "fabric_composition VARCHAR(255),"
                + "quantity INT DEFAULT 0,"
                + "locked_quantity INT DEFAULT 0,"
                + "location VARCHAR(128),"
                + "unit_price DECIMAL(18,2),"
                + "total_value DECIMAL(18,2),"
                + "conversion_rate DECIMAL(18,2),"
                + "last_inbound_date TIMESTAMP,"
                + "last_outbound_date TIMESTAMP,"
                + "safety_stock INT DEFAULT 100,"
                + "create_time TIMESTAMP,"
                + "update_time TIMESTAMP,"
                + "delete_flag INT DEFAULT 0,"
                + "version INT DEFAULT 0,"
                + "tenant_id BIGINT"
                + ")");
    }
}
