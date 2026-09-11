package com.fashion.supplychain.intelligence.warmup;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * D-360o：小云模型预热保活——消除每次开口前的冷启动 TTFB。
 *
 * <p>serverless 模型空闲一段时间后首次调用要"热启动"（首 token 延迟 2~5 秒），
 * 用户第一句永远最慢。本组件每隔约 90 秒发一次极简探针（1 token 级），
 * 让模型/网关保持温热，用户开口即可秒回首 token。
 *
 * <p>成本：约 960 次/天 × 1 token，deepseek-flash 定价下可忽略。
 * 可通过环境变量关闭：XIAOYUN_WARMUP_ENABLED=false。
 */
@Slf4j
@Component
public class XiaoyunModelWarmup {

    @Value("${xiaoyun.warmup.enabled:true}")
    private boolean enabled;

    @Autowired(required = false)
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Scheduled(
            fixedDelayString = "${xiaoyun.warmup.interval-ms:90000}",
            initialDelayString = "${xiaoyun.warmup.initial-delay-ms:30000}"
    )
    public void warmup() {
        if (!enabled) return;
        if (inferenceOrchestrator == null || !inferenceOrchestrator.isAnyModelEnabled()) return;
        try {
            long start = System.currentTimeMillis();
            IntelligenceInferenceResult result = inferenceOrchestrator.chat("model-warmup", "你是保活探针，请只回复：ok", "ping");
            if (result != null && result.isSuccess()) {
                log.info("[Warmup] 模型保活成功, 耗时 {}ms", System.currentTimeMillis() - start);
            }
        } catch (Exception e) {
            // 保活失败不影响业务，静默即可（失败说明余额/网络有问题，会在正式请求里暴露）
            log.debug("[Warmup] 保活失败（忽略）: {}", e.getMessage());
        }
    }
}
