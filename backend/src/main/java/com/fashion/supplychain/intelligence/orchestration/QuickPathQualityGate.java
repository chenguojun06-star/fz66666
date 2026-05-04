package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.service.DataTruthGuard;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 快速通道质量门 —— 为快速通道回答增加质量审查，防止"傻白甜"回答。
 *
 * <p>核心机制：
 * <ul>
 *   <li>快速通道回答也必须通过L1-L3验证</li>
 *   <li>信任度低于阈值时，自动降级到Agent循环重新处理</li>
 *   <li>记录快速通道质量问题，用于模型优化</li>
 * </ul>
 */
@Component
@Slf4j
public class QuickPathQualityGate {

    /** 快速通道最低信任分 */
    private static final int QUICK_PATH_MIN_TRUST = 50;
    /** 快速通道回答最大长度（过长可能包含幻觉） */
    private static final int MAX_QUICK_PATH_LENGTH = 500;

    @Autowired
    private DataTruthGuard dataTruthGuard;

    // ──────────────────────────────────────────────────────────────

    /**
     * 审查快速通道回答。
     *
     * @param userMessage 用户问题
     * @param aiResponse  AI回答
     * @return 审查结果
     */
    public QualityGateResult review(String userMessage, String aiResponse) {
        try {
            // 1. 基础检查
            if (aiResponse == null || aiResponse.isBlank()) {
                return QualityGateResult.fail("回答为空");
            }

            // 2. 长度检查（快速通道回答不应过长）
            if (aiResponse.length() > MAX_QUICK_PATH_LENGTH) {
                return QualityGateResult.fail("回答过长（" + aiResponse.length() + "字符），可能包含未经验证的信息");
            }

            // 3. 数据真实性检查（L1-L3）
            DataTruthGuard.ComprehensiveValidationResult validation =
                    dataTruthGuard.comprehensiveValidate(aiResponse, null, true);

            if (validation.getTrustScore() < QUICK_PATH_MIN_TRUST) {
                return QualityGateResult.fail(
                        String.format("信任度不足（%d/%d），建议走完整Agent循环",
                                validation.getTrustScore(), QUICK_PATH_MIN_TRUST));
            }

            // 4. 问题类型检查（某些问题不应走快速通道）
            if (shouldNotUseQuickPath(userMessage)) {
                return QualityGateResult.fail("问题类型不适合快速通道，需要工具查询支撑");
            }

            // 5. 通过审查
            return QualityGateResult.pass(validation.getTrustScore());

        } catch (Exception e) {
            log.warn("[QuickPathGate] 审查异常，保守降级: {}", e.getMessage());
            return QualityGateResult.fail("审查异常，降级到Agent循环");
        }
    }

    /**
     * 判断问题是否不应走快速通道。
     */
    private boolean shouldNotUseQuickPath(String userMessage) {
        if (userMessage == null) return true;
        String lower = userMessage.toLowerCase();

        // 需要数据查询的问题
        String[] dataQueryPatterns = {
                "多少", "几", "查询", "查一下", "统计", "汇总", "排名", "对比",
                "分析", "趋势", "为什么", "怎么回事", "什么时候", "在哪里",
                "逾期", "延期", "风险", "异常", "不合格", "缺货"
        };
        for (String pattern : dataQueryPatterns) {
            if (lower.contains(pattern)) return true;
        }

        // 需要操作的问题
        String[] actionPatterns = {
                "创建", "新建", "删除", "修改", "更新", "审批", "结算",
                "入库", "出库", "分配", "派单", "撤回", "扫码"
        };
        for (String pattern : actionPatterns) {
            if (lower.contains(pattern)) return true;
        }

        // 多实体问题（可能复杂）
        long entityCount = countEntities(lower);
        if (entityCount >= 3) return true;

        return false;
    }

    private long countEntities(String text) {
        String[] entities = {"订单", "工厂", "工人", "物料", "款式", "客户", "工序"};
        return java.util.Arrays.stream(entities).filter(text::contains).count();
    }

    // ──────────────────────────────────────────────────────────────

    public static class QualityGateResult {
        private final boolean passed;
        private final String reason;
        private final int trustScore;
        private final boolean shouldFallback;

        private QualityGateResult(boolean passed, String reason, int trustScore, boolean shouldFallback) {
            this.passed = passed;
            this.reason = reason;
            this.trustScore = trustScore;
            this.shouldFallback = shouldFallback;
        }

        public static QualityGateResult pass(int trustScore) {
            return new QualityGateResult(true, null, trustScore, false);
        }

        public static QualityGateResult fail(String reason) {
            return new QualityGateResult(false, reason, 0, true);
        }

        public boolean isPassed() { return passed; }
        public String getReason() { return reason; }
        public int getTrustScore() { return trustScore; }
        public boolean isShouldFallback() { return shouldFallback; }
    }
}
