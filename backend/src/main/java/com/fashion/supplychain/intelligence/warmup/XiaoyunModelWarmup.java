package com.fashion.supplychain.intelligence.warmup;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * D-360o：小云模型预热保活——消除每次开口前的冷启动 TTFB。
 *
 * <p>serverless 模型空闲一段时间后首次调用要"热启动"（首 token 延迟 2~5 秒），
 * 用户第一句永远最慢。本组件每隔约 90 秒发一次极简探针（1 token 级），
 * 让模型/网关保持温热，用户开口即可秒回首 token。
 *
 * <p><b>⚠️ 已默认关闭（实测保活完全无效）</b>：查 t_intelligence_metrics 可见本组件
 * 958 次/天、success=0 占 100%，错误固定为 {@code all-models-unavailable}。
 * 根因是它是系统级任务、没有 UserContext，{@code TenantAiConfigService.resolveConfig(null)}
 * 拿不到 API key；而外层只判 {@code isAnyModelEnabled()} 就发调用，必然失败。
 * 失败又被 catch 里的 {@code log.debug} 静默吞掉，长期无人察觉。
 *
 * <p>即：保活效果为零、纯空转。故默认值由 true 改为 false。
 * 原注释称"960 次/天 × 1 token 可忽略"与实测不符（实际每次 226 字符且全部失败）。
 * <b>重新开启前必须先补上租户上下文</b>，否则开了也只是继续全量失败，
 * 可用环境变量 {@code XIAOYUN_WARMUP_ENABLED=true} 临时开启。
 * <p><b>D-700 补：关闭时不再空转</b>。此前只有方法内 {@code if (!enabled) return;}，
 * 于是「已关闭」的 warmup 依旧每 90 秒被调度一次 → 实测每天空跑 <b>662 次</b>，
 * 每次留下一条 {@code t_ai_job_run_log} 记录（该表已 73.9 万行）。
 * 保活为零，却持续消耗调度线程与日志/DB 写入。
 * 现补 {@code @ConditionalOnProperty}：关闭时 <b>bean 根本不注册</b>，
 * 调度器不会持有它，空转彻底消失；需要临时保活时用
 * {@code XIAOYUN_WARMUP_ENABLED=true} 打开即可。
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "xiaoyun.warmup.enabled", havingValue = "true")
public class XiaoyunModelWarmup {

    @Value("${xiaoyun.warmup.enabled:false}")
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
