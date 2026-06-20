package com.fashion.supplychain.intelligence.orchestration;

import lombok.extern.slf4j.Slf4j;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * 收敛停止条件 —— 防止 SelfCritiqueGate 无限重写。
 *
 * <p>记录历史评分，连续 2 轮提升 < 5 分则建议停止（收敛）。
 *
 * <p>状态隔离：每个 commandId 对应一个 ConvergenceStopCondition 实例，
 * 由 SelfCritiqueGate 通过 ConcurrentHashMap 管理。
 *
 * <p>AI Hard Limit 合规：收敛停止是"停止重做"的机制，本身不增加轮数。
 */
@Slf4j
public class ConvergenceStopCondition {

    /** 最大历史记录数（超过则自动清理最旧的） */
    private static final int MAX_HISTORY = 5;

    /** 收敛阈值：最近 2 轮提升小于此值则视为收敛 */
    private static final double CONVERGENCE_THRESHOLD = 5.0;

    private final Deque<Double> scoreHistory = new ArrayDeque<>(MAX_HISTORY);

    /**
     * 记录一轮评分。
     *
     * @param score 本轮综合评分（0-100）
     */
    public void recordScore(double score) {
        if (scoreHistory.size() >= MAX_HISTORY) {
            scoreHistory.pollFirst();
        }
        scoreHistory.addLast(score);
        log.debug("[Convergence] recorded score={}, historySize={}", score, scoreHistory.size());
    }

    /**
     * 判断是否应该停止重写。
     *
     * <p>停止条件：
     * <ul>
     *   <li>历史记录 < 2 → false（数据不足，继续）</li>
     *   <li>最近 2 轮提升 < 5 分 → true（收敛）</li>
     *   <li>历史记录 ≥ 5 → true（达上限，防止无限重写）</li>
     * </ul>
     */
    public boolean shouldStop() {
        if (scoreHistory.size() < 2) {
            return false;
        }

        // 达上限：防止无限重写
        if (scoreHistory.size() >= MAX_HISTORY) {
            log.info("[Convergence] 达上限 {} 轮，建议停止", MAX_HISTORY);
            return true;
        }

        // 收敛检测：最近 2 轮提升 < 阈值
        Double[] scores = scoreHistory.toArray(new Double[0]);
        int n = scores.length;
        double lastScore = scores[n - 1];
        double prevScore = scores[n - 2];
        double improvement = lastScore - prevScore;

        if (improvement < CONVERGENCE_THRESHOLD) {
            log.info("[Convergence] 收敛停止：最近提升={} < 阈值={}", improvement, CONVERGENCE_THRESHOLD);
            return true;
        }

        return false;
    }

    /**
     * 重置历史记录（新一轮对话开始时调用）。
     */
    public void reset() {
        scoreHistory.clear();
    }

    /**
     * 获取历史记录数（用于监控/日志）。
     */
    public int getHistorySize() {
        return scoreHistory.size();
    }

    /**
     * 获取最近一轮评分（用于日志/监控）。
     */
    public double getLatestScore() {
        Double last = scoreHistory.peekLast();
        return last == null ? 0.0 : last;
    }
}
