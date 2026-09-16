package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestratorHelper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 采购数量小数处理测试 —— 防止 D-410 的截断问题回归。
 *
 * <p><b>为什么要测这个：</b>
 * D-410 把物料数量从 INT 改成 DECIMAL(12,4)，但主入口
 * {@code MaterialPurchaseOrchestrator#updateArrivedQuantity} 和
 * {@code createInstruction} 当时仍用 {@code coerceInt()}（内部 intValue 截断），
 * 导致 1.32 米被存成 1 —— <b>类型改了但语义没通</b>，而编译、CI 全部通过。
 * 现已改用 {@code coerceBigDecimal}，本测试锁死该行为，
 * 防止有人图省事改回 coerceInt 或改动 scale 精度。
 *
 * <p>coerceBigDecimal 是纯函数（不依赖注入字段），故直接 new，无需 Spring 上下文。
 */
@DisplayName("采购数量小数处理（防 D-410 截断回归）")
class MaterialPurchaseOrchestratorHelperTest {

    private final MaterialPurchaseOrchestratorHelper helper = new MaterialPurchaseOrchestratorHelper();

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

    @Test
    @DisplayName("小数不被截断：1.32 应保留为 1.3200（而非 1）")
    void decimalIsNotTruncated() {
        assertEquals(0, bd("1.3200").compareTo(helper.coerceBigDecimal("1.32")),
                "D-410 回归防护：1.32 米不能被截断成 1");
        assertEquals(0, bd("1.3200").compareTo(helper.coerceBigDecimal(1.32)),
                "D-410 回归防护：Double 1.32 不能被截断成 1");
        assertEquals(0, bd("1.3200").compareTo(helper.coerceBigDecimal(bd("1.32"))),
                "D-410 回归防护：BigDecimal 1.32 不能被截断成 1");
    }

    @Test
    @DisplayName("精度固定 4 位，舍入模式 HALF_UP")
    void scaleIsFourWithHalfUp() {
        // 1.23456 → 1.2346（第 5 位 6 进位）
        assertEquals(0, bd("1.2346").compareTo(helper.coerceBigDecimal("1.23456")));
        // 1.23455 → 1.2346（HALF_UP：恰好 5 也进位）
        assertEquals(0, bd("1.2346").compareTo(helper.coerceBigDecimal("1.23455")));
        // 1.23454 → 1.2345（第 5 位 4 舍去）
        assertEquals(0, bd("1.2345").compareTo(helper.coerceBigDecimal("1.23454")));
    }

    @Test
    @DisplayName("整数与负数保持 4 位小数形式")
    void integerAndNegative() {
        assertEquals(0, bd("5.0000").compareTo(helper.coerceBigDecimal("5")));
        assertEquals(0, bd("-1.5000").compareTo(helper.coerceBigDecimal("-1.5")));
        assertEquals(0, bd("0.0000").compareTo(helper.coerceBigDecimal("0")));
    }

    @Test
    @DisplayName("空值与非法输入返回 null，不抛异常")
    void nullAndInvalidInput() {
        assertNull(helper.coerceBigDecimal(null), "null 应返回 null");
        assertNull(helper.coerceBigDecimal(""), "空串应返回 null");
        assertNull(helper.coerceBigDecimal("   "), "空白串应返回 null");
        assertNull(helper.coerceBigDecimal("abc"), "非法字符串应返回 null，不应抛异常");
        assertNull(helper.coerceBigDecimal("1.2.3"), "畸形数字应返回 null，不应抛异常");
    }

    @Test
    @DisplayName("金额场景：单价×数量不因截断而失真")
    void moneyCalculationKeepsPrecision() {
        // 面料 1.32 米 × 单价 12.5 = 16.5 元；若数量被截断成 1 则只有 12.5 元
        BigDecimal qty = helper.coerceBigDecimal("1.32");
        BigDecimal unitPrice = bd("12.5");
        BigDecimal total = qty.multiply(unitPrice);
        assertEquals(0, bd("16.5000").compareTo(total),
                "1.32 × 12.5 应为 16.5；若数量被截断成 1 会算成 12.5（资损）");
    }
}
