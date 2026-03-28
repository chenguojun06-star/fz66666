package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.entity.ProductionOrder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 订单健康度评分编排器单元测试
 * 
 * 测试覆盖：
 * - 单个订单评分计算
 * - 三维权重验证
 * - 风险等级判定
 * - 边界条件处理
 * 
 * @author AI Agent
 * @since 2026-03-22
 */
@ExtendWith(MockitoExtension.class)
class OrderHealthScoreOrchestratorTest {

    @InjectMocks
    private OrderHealthScoreOrchestrator orchestrator;

    @Mock
    private ProductionOrder mockOrder;

    // ─────────────────────────────────────────────────────────────────────
    // 测试共通数据准备
    // ─────────────────────────────────────────────────────────────────────

    private ProductionOrder createOrder(Integer progress, LocalDateTime shipDate, Integer procRate) {
        ProductionOrder order = new ProductionOrder();
        order.setId("TEST-ID-001");
        order.setOrderNo("TEST-PO-001");
        order.setProductionProgress(progress);
        order.setExpectedShipDate(shipDate.toLocalDate());
        order.setProcurementCompletionRate(procRate);
        return order;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 进度权重测试（0-40 分）
    // ─────────────────────────────────────────────────────────────────────

    @Test
    void testProgressScore_AllCompleted() {
        // 进度 100% 应得 40 分
        ProductionOrder order = createOrder(100, LocalDateTime.now().plusDays(7), 100);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 40 (进度) + 26 (货期) + 25 (采购) = 91
        assertEquals(91, score, 2);
    }

    @Test
    void testProgressScore_ZeroProgress() {
        // 进度 0% 应得 0 分
        ProductionOrder order = createOrder(0, LocalDateTime.now().plusDays(7), 100);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 0 (进度) + 26 (货期) + 25 (采购) = 51
        assertEquals(51, score, 2);
    }

    @Test
    void testProgressScore_PartialProgress() {
        // 进度 50% 应得 20 分
        ProductionOrder order = createOrder(50, LocalDateTime.now().plusDays(7), 100);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 20 (进度) + 26 (货期) + 25 (采购) = 71
        assertEquals(71, score, 2);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 货期权重测试（0-35 分）
    // ─────────────────────────────────────────────────────────────────────

    @Test
    void testDeadlineScore_Overdue() {
        // 已逾期应得 0 分
        ProductionOrder order = createOrder(50, LocalDateTime.now().minusDays(1), 50);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 20 (进度) + 0 (逾期) + 12.5 (采购) = 32.5 ≈ 33
        assertTrue(score < 35);
    }

    @Test
    void testDeadlineScore_LessThan3Days() {
        // 0~3 天应得 8 分
        ProductionOrder order = createOrder(50, LocalDateTime.now().plusHours(36), 50);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 20 (进度) + 8 (紧急) + 12.5 (采购) = 40.5 ≈ 40-41
        assertTrue(score >= 39 && score <= 42, "预期 39-42 分，实际: " + score);
    }

    @Test
    void testDeadlineScore_3To7Days() {
        // 3~7 天应得 16 分
        ProductionOrder order = createOrder(50, LocalDateTime.now().plusDays(5), 50);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 20 (进度) + 16 (较紧) + 12.5 (采购) = 48.5 ≈ 49
        assertTrue(score >= 48 && score <= 50, "预期 48-50 分，实际: " + score);
    }

    @Test
    void testDeadlineScore_7To14Days() {
        // 7~14 天应得 26 分
        ProductionOrder order = createOrder(50, LocalDateTime.now().plusDays(10), 50);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 20 (进度) + 26 (中等) + 12.5 (采购) = 58.5 ≈ 59
        assertTrue(score >= 58 && score <= 60, "预期 58-60 分，实际: " + score);
    }

    @Test
    void testDeadlineScore_MoreThan14Days() {
        // 超过 14 天应得 35 分
        ProductionOrder order = createOrder(50, LocalDateTime.now().plusDays(30), 50);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 20 (进度) + 35 (充足) + 12.5 (采购) = 67.5 ≈ 68
        assertTrue(score >= 67 && score <= 69, "预期 67-69 分，实际: " + score);
    }

    @Test
    void testDeadlineScore_NoDeadline() {
        // 无交期应得 20 分（中等）
        ProductionOrder order = createOrder(50, null, 50);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 20 (进度) + 20 (无交期) + 12.5 (采购) = 52.5 ≈ 53
        assertTrue(score >= 52 && score <= 54, "预期 52-54 分，实际: " + score);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 采购权重测试（0-25 分）
    // ─────────────────────────────────────────────────────────────────────

    @Test
    void testProcurementScore_FullyCompleted() {
        // 采购完成 100% 应得 25 分
        ProductionOrder order = createOrder(50, LocalDateTime.now().plusDays(7), 100);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 20 (进度) + 26 (货期) + 25 (采购) = 71
        assertTrue(score >= 70 && score <= 72, "预期 70-72 分，实际: " + score);
    }

    @Test
    void testProcurementScore_ZeroCompletion() {
        // 采购完成 0% 应得 0 分
        ProductionOrder order = createOrder(50, LocalDateTime.now().plusDays(7), 0);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 20 (进度) + 26 (货期) + 0 (采购) = 46
        assertEquals(46, score, 2);
    }

    @Test
    void testProcurementScore_NoData() {
        // 无采购数据应得 18 分（中等）
        ProductionOrder order = createOrder(50, LocalDateTime.now().plusDays(7), null);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 20 (进度) + 26 (货期) + 18 (无数据) = 64
        assertEquals(64, score, 2);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 风险等级测试
    // ─────────────────────────────────────────────────────────────────────

    @Test
    void testRiskLevel_Good() {
        // 得分 >= 75 应为 "good"
        String level = orchestrator.scoreToLevel(75);
        assertEquals("good", level);
        
        level = orchestrator.scoreToLevel(100);
        assertEquals("good", level);
    }

    @Test
    void testRiskLevel_Warning() {
        // 得分 50-74 应为 "warn"
        String level = orchestrator.scoreToLevel(50);
        assertEquals("warn", level);
        
        level = orchestrator.scoreToLevel(74);
        assertEquals("warn", level);
    }

    @Test
    void testRiskLevel_Critical() {
        // 得分 < 50 应为 "danger"
        String level = orchestrator.scoreToLevel(49);
        assertEquals("danger", level);
        
        level = orchestrator.scoreToLevel(0);
        assertEquals("danger", level);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 边界条件和综合测试
    // ─────────────────────────────────────────────────────────────────────

    @Test
    void testBoundary_MinScore() {
        // 最坏情况：进度 0%，已逾期，无采购数据
        ProductionOrder order = createOrder(0, LocalDateTime.now().minusDays(1), null);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 0 (进度) + 0 (逾期) + 18 (无数据) = 18
        assertEquals(18, score, 2);
        assertEquals("danger", orchestrator.scoreToLevel(score));
    }

    @Test
    void testBoundary_MaxScore() {
        // 最好情况：进度 100%，充足时间（>14 天），采购完成 100%
        ProductionOrder order = createOrder(100, LocalDateTime.now().plusDays(30), 100);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 40 (进度) + 35 (充足) + 25 (采购) = 100
        assertEquals(100, score);
        assertEquals("good", orchestrator.scoreToLevel(score));
    }

    @Test
    void testBoundary_ScoreNeverExceedsHundred() {
        // 任何情况下评分不能超过 100
        ProductionOrder order = createOrder(150, LocalDateTime.now().plusDays(100), 150);
        int score = orchestrator.calcScore(order);
        
        assertTrue(score <= 100, "评分不能超过 100，实际: " + score);
    }

    @Test
    void testBoundary_ScoreNeverBelowZero() {
        // 任何情况下评分不能低于 0
        ProductionOrder order = createOrder(-50, LocalDateTime.now().minusYears(1), -50);
        int score = orchestrator.calcScore(order);
        
        assertTrue(score >= 0, "评分不能低于 0，实际: " + score);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 实际业务场景测试
    // ─────────────────────────────────────────────────────────────────────

    @Test
    void testScenario_NormalOrder() {
        // 场景：进度 60%，交期还有 5 天，采购完成 75%
        ProductionOrder order = createOrder(60, LocalDateTime.now().plusDays(5), 75);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 24 (进度) + 16 (较紧) + 18.75 (采购) = 58.75 ≈ 59
        assertTrue(score >= 58 && score <= 60, "预期 58-60 分，实际: " + score);
        assertEquals("warn", orchestrator.scoreToLevel(score));
    }

    @Test
    void testScenario_HighRiskOrder() {
        // 场景：进度仅 20%，交期只剩 2 天，采购停滞 30%
        ProductionOrder order = createOrder(20, LocalDateTime.now().plusHours(40), 30);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 8 (进度) + 8 (紧迫) + 7.5 (采购) = 23.5 ≈ 24
        assertTrue(score <= 30, "预期结果较低，实际: " + score);
        assertEquals("danger", orchestrator.scoreToLevel(score));
    }

    @Test
    void testScenario_LowRiskOrder() {
        // 场景：进度 85%，交期还有 20 天，采购已完成 95%
        ProductionOrder order = createOrder(85, LocalDateTime.now().plusDays(20), 95);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 34 (进度) + 35 (充足) + 23.75 (采购) = 92.75 ≈ 93
        assertTrue(score >= 90, "预期 ≥90 分，实际: " + score);
        assertEquals("good", orchestrator.scoreToLevel(score));
    }

    // ─────────────────────────────────────────────────────────────────────
    // 空值处理测试
    // ─────────────────────────────────────────────────────────────────────

    @Test
    void testNullHandling_AllNulls() {
        // 所有字段都为 null
        ProductionOrder order = createOrder(null, null, null);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 0 (无进度) + 20 (无交期) + 18 (无采购) = 38
        assertEquals(38, score, 2);
    }

    @Test
    void testNullHandling_ProgressNull() {
        ProductionOrder order = createOrder(null, LocalDateTime.now().plusDays(10), 50);
        int score = orchestrator.calcScore(order);
        
        // 总分 = 0 (无进度) + 26 (中等) + 12.5 (采购) = 38.5 ≈ 39
        assertTrue(score >= 38 && score <= 40);
    }
}
