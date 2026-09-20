package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator.SettlementResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 收付款中心核心规则测试 —— 都是钱的逻辑，改坏了直接体现在账上。
 *
 * <p>覆盖：
 * <ul>
 *   <li>部分付款：付一半 → 未付满，剩余挂账（结算中）</li>
 *   <li>分次付款：第二次补齐 → 付满</li>
 *   <li>超额付款：封顶到账单金额，不会多付</li>
 *   <li>往来对象类型归一化：EMPLOYEE 等同 WORKER（避免同一员工在总账拆两行）</li>
 *   <li>付款记录字段映射：payeeType / bizType</li>
 * </ul>
 */
@DisplayName("收付款中心：部分付款与对象归一化")
class BillAggregationSettlementTest {

    private BillAggregationOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("test-user");
        UserContext.set(ctx);
        orchestrator = new BillAggregationOrchestrator();
    }

    private SettlementResult settle(String total, String already, String thisTime) {
        return orchestrator.resolveSettlement(
                new BigDecimal(total), new BigDecimal(already), new BigDecimal(thisTime));
    }

    @Nested
    @DisplayName("部分付款（本月钱不够 / 品质问题留尾款）")
    class PartialPayment {

        @Test
        @DisplayName("付一半：未付满，剩余继续挂账")
        void payHalfRemainsUnsettled() {
            SettlementResult r = settle("10000", "0", "5000");
            assertFalse(r.isFullyPaid(), "付一半不应标记为付满");
            assertEquals(0, new BigDecimal("5000").compareTo(r.getNewSettled()));
        }

        @Test
        @DisplayName("分次付款：第二次补齐后付满")
        void secondPaymentCompletes() {
            SettlementResult first = settle("10000", "0", "5000");
            SettlementResult second = settle("10000", first.getNewSettled().toPlainString(), "5000");
            assertTrue(second.isFullyPaid());
            assertEquals(0, new BigDecimal("10000").compareTo(second.getNewSettled()));
        }

        @Test
        @DisplayName("超额付款：封顶到账单金额，不会多付")
        void overpayIsCapped() {
            SettlementResult r = settle("10000", "0", "99999");
            assertTrue(r.isFullyPaid());
            assertEquals(0, new BigDecimal("10000").compareTo(r.getNewSettled()));
        }

        @Test
        @DisplayName("扣款项（负数账单）付清判定")
        void negativeBill() {
            // 扣款 -800，无需付款；若被结清，累计封顶到 -800 而不是 0
            SettlementResult r = settle("-800", "0", "-800");
            assertTrue(r.isFullyPaid());
            assertEquals(0, new BigDecimal("-800").compareTo(r.getNewSettled()));
        }
    }

    @Nested
    @DisplayName("往来对象类型归一化")
    class CounterpartyNormalization {

        @Test
        @DisplayName("EMPLOYEE 归一为 WORKER，避免同一员工拆成两行")
        void employeeBecomesWorker() {
            assertEquals("WORKER",
                    ReflectionTestUtils.invokeMethod(orchestrator, "normalizeCounterpartyType", "EMPLOYEE"));
            assertEquals("WORKER",
                    ReflectionTestUtils.invokeMethod(orchestrator, "normalizeCounterpartyType", "employee"));
        }

        @Test
        @DisplayName("其它类型原样保留")
        void othersKept() {
            assertEquals("SUPPLIER",
                    ReflectionTestUtils.invokeMethod(orchestrator, "normalizeCounterpartyType", "SUPPLIER"));
            assertEquals("FACTORY",
                    ReflectionTestUtils.invokeMethod(orchestrator, "normalizeCounterpartyType", "FACTORY"));
        }

        @Test
        @DisplayName("payeeType / bizType 映射符合库中既有取值")
        void mappings() {
            assertEquals("employee",
                    ReflectionTestUtils.invokeMethod(orchestrator, "mapPayeeType", "WORKER"));
            assertEquals("supplier",
                    ReflectionTestUtils.invokeMethod(orchestrator, "mapPayeeType", "SUPPLIER"));
            assertEquals("material_reconciliation",
                    ReflectionTestUtils.invokeMethod(orchestrator, "mapBizType", "MATERIAL_RECONCILIATION"));
            assertEquals("PAYROLL_SETTLEMENT",
                    ReflectionTestUtils.invokeMethod(orchestrator, "mapBizType", "PAYROLL_SETTLEMENT"));
            assertEquals("BILL_PAYABLE",
                    ReflectionTestUtils.invokeMethod(orchestrator, "mapBizType", "UNKNOWN_TYPE"));
        }
    }

    // ==================== D-474 占位对象ID识别（防对象被合并） ====================

    @Test
    @DisplayName("UNKNOWN_SUPPLIER 等占位ID必须识别为占位，否则不同供应商会被合并成一行")
    void placeholderIdsAreRecognized() {
        assertTrue(BillAggregationOrchestrator.isPlaceholderCounterpartyId("UNKNOWN_SUPPLIER"));
        assertTrue(BillAggregationOrchestrator.isPlaceholderCounterpartyId("unknown_supplier"), "大小写不敏感");
        assertTrue(BillAggregationOrchestrator.isPlaceholderCounterpartyId("UNKNOWN"));
        assertTrue(BillAggregationOrchestrator.isPlaceholderCounterpartyId("UNKNOWN_FACTORY"));
    }

    @Test
    @DisplayName("空值与空白也算占位（按名称分组）")
    void blankIdsArePlaceholder() {
        assertTrue(BillAggregationOrchestrator.isPlaceholderCounterpartyId(null));
        assertTrue(BillAggregationOrchestrator.isPlaceholderCounterpartyId(""));
        assertTrue(BillAggregationOrchestrator.isPlaceholderCounterpartyId("   "));
    }

    @Test
    @DisplayName("真实ID不是占位，按ID分组")
    void realIdsAreNotPlaceholder() {
        assertFalse(BillAggregationOrchestrator.isPlaceholderCounterpartyId("73d090ba3aee3191d1de4b56031a010f"));
        assertFalse(BillAggregationOrchestrator.isPlaceholderCounterpartyId("李老板"));
    }
}
