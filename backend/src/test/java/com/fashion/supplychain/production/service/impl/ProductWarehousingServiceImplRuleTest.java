package com.fashion.supplychain.production.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ProductWarehousingServiceImplRuleTest {

    @Mock
    private Object ignored;

    @Test
    void rule_rejectsBelowMinBeforeLastFill() {
        String msg = ProductWarehousingServiceImpl.warehousingQuantityRuleViolationMessage(100, 0, 4);
        assertEquals(
                "入库数量不符合规则（本次4/剩余100/裁剪100）。每次入库数量需在裁剪数量的5%~15%之间（末次可小于5%）",
                msg);
    }

    @Test
    void rule_allowsMinAndMax() {
        assertNull(ProductWarehousingServiceImpl.warehousingQuantityRuleViolationMessage(100, 0, 5));
        assertNull(ProductWarehousingServiceImpl.warehousingQuantityRuleViolationMessage(100, 0, 15));
    }

    @Test
    void rule_rejectsAboveMaxBeforeLastFill() {
        String msg = ProductWarehousingServiceImpl.warehousingQuantityRuleViolationMessage(100, 0, 16);
        assertEquals(
                "入库数量不符合规则（本次16/剩余100/裁剪100）。每次入库数量需在裁剪数量的5%~15%之间（末次可小于5%）",
                msg);
    }

    @Test
    void rule_allowsExactLastFillEvenBelowMin() {
        assertNull(ProductWarehousingServiceImpl.warehousingQuantityRuleViolationMessage(100, 97, 3));
    }

    @Test
    void rule_rejectsExceedCuttingUpperBound() {
        String msg = ProductWarehousingServiceImpl.warehousingQuantityRuleViolationMessage(100, 98, 5);
        assertEquals("入库数量超出裁剪数量上限（本次5/已入库98/裁剪100）", msg);
    }

    @Test
    void rule_rejectsWhenAlreadyFullyWarehoused() {
        String msg = ProductWarehousingServiceImpl.warehousingQuantityRuleViolationMessage(100, 100, 1);
        assertEquals("已全部入库，禁止继续入库", msg);
    }
}
