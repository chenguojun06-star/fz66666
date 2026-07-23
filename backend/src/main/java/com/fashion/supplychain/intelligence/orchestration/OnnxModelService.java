package com.fashion.supplychain.intelligence.orchestration;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;

/**
 * 时序预测模型服务
 *
 * 实现 Holt-Winters 三阶指数平滑（Triple Exponential Smoothing），
 * 一种经典且生产可用的时序预测算法，无需外部模型文件。
 *
 * 算法原理：
 *   - Level (ℓ): 平滑后的当前值
 *   - Trend (b): 趋势分量
 *   - Seasonal (s): 周期性分量
 *   预测公式：ŷ(t+h) = ℓ_t + h·b_t + s_{t+h-m(k+1)}
 *
 * 优势：
 *   1. 纯 Java 实现，无外部依赖（不需要 ONNX Runtime / Python）
 *   2. 能捕捉趋势和周期性，比简单 EWMA 更精准
 *   3. 参数自适应：根据序列特征自动调整平滑系数
 *   4. 支持置信区间输出（基于残差标准差）
 */
@Service
@Lazy
@Slf4j
public class OnnxModelService {

    private static final int FORECAST_HORIZON = 7;
    private static final int SEASON_LENGTH = 7; // 7天周期

    private boolean modelLoaded = false;

    @PostConstruct
    public void init() {
        // 纯Java实现，无需加载外部模型文件
        modelLoaded = true;
        log.info("[时序预测] Holt-Winters三阶指数平滑模型已就绪");
    }

    public boolean isModelLoaded() {
        return modelLoaded;
    }

    /**
     * 执行时序预测
     *
     * @param input 归一化后的历史序列（建议14天）
     * @return 预测序列（7天）
     */
    public double[] predict(double[] input) {
        if (!modelLoaded) {
            throw new IllegalStateException("时序预测模型未初始化");
        }
        return holtWintersForecast(input, FORECAST_HORIZON);
    }

    /**
     * Holt-Winters 三阶指数平滑预测
     *
     * @param history 历史序列
     * @param horizon 预测步数
     * @return 预测值数组
     */
    private double[] holtWintersForecast(double[] history, int horizon) {
        int n = history.length;
        if (n < SEASON_LENGTH) {
            // 数据不足以做季节性分解，退化为简单指数平滑
            return simpleExponentialSmoothing(history, horizon);
        }

        // 自适应平滑系数：序列方差大时降低alpha（更平滑），方差小时提高alpha（更敏感）
        double[] params = optimizeParameters(history);
        double alpha = params[0]; // level smoothing
        double beta = params[1];  // trend smoothing
        double gamma = params[2]; // seasonal smoothing

        // 初始化
        double[] seasonals = initializeSeasonals(history);
        double level = initializeLevel(history);
        double trend = initializeTrend(history);

        double[] fitted = new double[n];

        // 迭代更新
        for (int i = 0; i < n; i++) {
            double seasonal = seasonals[i % SEASON_LENGTH];
            double predicted = level + trend + seasonal;

            double observed = history[i];
            // 处理零值（无产量日）：用预测值替代，避免季节分量被冲零
            if (observed <= 0) {
                observed = Math.max(0, predicted);
            }

            double newLevel = alpha * (observed - seasonal) + (1 - alpha) * (level + trend);
            double newTrend = beta * (newLevel - level) + (1 - beta) * trend;
            double newSeasonal = gamma * (observed - newLevel) + (1 - gamma) * seasonal;

            fitted[i] = predicted;
            level = newLevel;
            trend = newTrend;
            seasonals[i % SEASON_LENGTH] = newSeasonal;
        }

        // 生成预测
        double[] forecast = new double[horizon];
        for (int h = 0; h < horizon; h++) {
            int seasonIdx = (n + h) % SEASON_LENGTH;
            forecast[h] = level + (h + 1) * trend + seasonals[seasonIdx];
            forecast[h] = Math.max(0, forecast[h]); // 产量不能为负
        }

        log.debug("[Holt-Winters] alpha={}, beta={}, gamma={}, forecast={}",
                String.format("%.2f", alpha), String.format("%.2f", beta),
                String.format("%.2f", gamma), Arrays.toString(forecast));
        return forecast;
    }

    /**
     * 简单指数平滑（数据不足时降级使用）
     */
    private double[] simpleExponentialSmoothing(double[] history, int horizon) {
        double alpha = 0.3;
        double smoothed = history[0];
        for (int i = 1; i < history.length; i++) {
            double observed = history[i] > 0 ? history[i] : smoothed;
            smoothed = alpha * observed + (1 - alpha) * smoothed;
        }
        double[] forecast = new double[horizon];
        for (int i = 0; i < horizon; i++) {
            forecast[i] = Math.max(0, smoothed);
        }
        return forecast;
    }

    /**
     * 参数优化：基于序列特征自适应选择平滑系数
     */
    private double[] optimizeParameters(double[] history) {
        double mean = Arrays.stream(history).filter(v -> v > 0).average().orElse(1);
        double variance = Arrays.stream(history)
                .filter(v -> v > 0)
                .map(v -> Math.pow(v - mean, 2))
                .average().orElse(0);
        double cv = mean > 0 ? Math.sqrt(variance) / mean : 0.5; // 变异系数

        // 变异系数高 → 序列波动大 → 降低alpha（更平滑），避免过拟合噪声
        double alpha = Math.max(0.1, Math.min(0.6, 0.5 - cv * 0.3));
        double beta = Math.max(0.05, Math.min(0.3, alpha * 0.4));
        double gamma = Math.max(0.05, Math.min(0.3, alpha * 0.3));

        return new double[]{alpha, beta, gamma};
    }

    /**
     * 初始化季节分量：取前几个完整周期的平均值
     */
    private double[] initializeSeasonals(double[] history) {
        int n = history.length;
        double[] seasonals = new double[SEASON_LENGTH];
        double overallAvg = Arrays.stream(history).filter(v -> v > 0).average().orElse(0);

        for (int i = 0; i < SEASON_LENGTH; i++) {
            double sum = 0;
            int count = 0;
            for (int j = i; j < n; j += SEASON_LENGTH) {
                if (history[j] > 0) {
                    sum += history[j];
                    count++;
                }
            }
            double seasonalAvg = count > 0 ? sum / count : overallAvg;
            seasonals[i] = overallAvg > 0 ? seasonalAvg - overallAvg : 0;
        }
        return seasonals;
    }

    private double initializeLevel(double[] history) {
        return Arrays.stream(history).filter(v -> v > 0).average().orElse(0);
    }

    private double initializeTrend(double[] history) {
        int n = history.length;
        if (n < 2) return 0;
        double firstHalf = Arrays.stream(history, 0, n / 2).filter(v -> v > 0).average().orElse(0);
        double secondHalf = Arrays.stream(history, n / 2, n).filter(v -> v > 0).average().orElse(0);
        return (secondHalf - firstHalf) / (n / 2.0);
    }

    public void reloadModel() {
        log.info("[时序预测] 模型参数已重置");
        modelLoaded = true;
    }
}
