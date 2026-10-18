package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.production.entity.ProductionOrder;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 关单结算创建已收敛至 ShipmentReconciliationOrchestrator.ensureShipmentReconciliationForOrder，
 * 本类仅保留本厂/外发工厂判定，故只覆盖 isOwnFactory。
 */
@DisplayName("OrderReconciliationHelper - 本厂/外发工厂判定")
class OrderReconciliationHelperTest {

    private final OrderReconciliationHelper helper = new OrderReconciliationHelper();

    @Test
    @DisplayName("isOwnFactory - factoryType=INTERNAL 返回true")
    void isOwnFactory_internalType_returnsTrue() {
        ProductionOrder order = new ProductionOrder();
        order.setFactoryType("INTERNAL");
        assertTrue(helper.isOwnFactory(order));
    }

    @Test
    @DisplayName("isOwnFactory - factoryType=EXTERNAL 返回false")
    void isOwnFactory_externalType_returnsFalse() {
        ProductionOrder order = new ProductionOrder();
        order.setFactoryType("EXTERNAL");
        assertFalse(helper.isOwnFactory(order));
    }

    @Test
    @DisplayName("isOwnFactory - factoryType为空时按factoryName判断-本厂")
    void isOwnFactory_noType_nameIsBenChang_returnsTrue() {
        ProductionOrder order = new ProductionOrder();
        order.setFactoryName("本厂");
        assertTrue(helper.isOwnFactory(order));
    }

    @Test
    @DisplayName("isOwnFactory - factoryType为空时按factoryName判断-最美服装工厂")
    void isOwnFactory_noType_nameIsZuiMei_returnsTrue() {
        ProductionOrder order = new ProductionOrder();
        order.setFactoryName("最美服装工厂");
        assertTrue(helper.isOwnFactory(order));
    }

    @Test
    @DisplayName("isOwnFactory - factoryType为空时按factoryName判断-外发厂")
    void isOwnFactory_noType_nameIsExternal_returnsFalse() {
        ProductionOrder order = new ProductionOrder();
        order.setFactoryName("华美加工厂");
        assertFalse(helper.isOwnFactory(order));
    }

    @Test
    @DisplayName("isOwnFactory - factoryType优先于factoryName")
    void isOwnFactory_typeTakesPrecedence_overName() {
        ProductionOrder order = new ProductionOrder();
        order.setFactoryType("EXTERNAL");
        order.setFactoryName("本厂");
        assertFalse(helper.isOwnFactory(order), "factoryType=EXTERNAL 应优先，即使factoryName=本厂");
    }

    @Test
    @DisplayName("isOwnFactory - null订单返回false")
    void isOwnFactory_nullOrder_returnsFalse() {
        assertFalse(helper.isOwnFactory(null));
    }

    @Test
    @DisplayName("isOwnFactory - factoryType和factoryName都为空返回false")
    void isOwnFactory_bothEmpty_returnsFalse() {
        ProductionOrder order = new ProductionOrder();
        assertFalse(helper.isOwnFactory(order));
    }
}
