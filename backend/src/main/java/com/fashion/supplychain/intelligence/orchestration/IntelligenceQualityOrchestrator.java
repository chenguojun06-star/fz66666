package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.service.GoldenEvalService;
import com.fashion.supplychain.intelligence.service.GuardrailsConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * AI 质量评估 & 安全规则编排层（P1/P2 升级）
 *
 * <p>{@code IntelligenceQualityController} 原先直接注入两个 Service（D-630 规则6 违规），
 * 现由本层承接。
 *
 * <p><b>为什么用 {@code required = false} + 可用性判断：</b>这两个能力依赖外部组件
 * （Golden Test Dataset / 规则文件），未初始化时接口应返回
 * {@code {"status":"unavailable"}} 而非抛错，这是重构前就有的降级行为，此处原样保留。
 * 故本层暴露 {@code isXxxAvailable()} 供 Controller 决定响应体，而不把
 * 「不可用」建模成异常。
 */
@Service
public class IntelligenceQualityOrchestrator {

    @Autowired(required = false)
    private GoldenEvalService goldenEvalService;

    @Autowired(required = false)
    private GuardrailsConfigService guardrailsConfigService;

    /** GoldenEvalService 是否已初始化。 */
    public boolean isGoldenEvalAvailable() {
        return goldenEvalService != null;
    }

    /**
     * 运行 Golden Test Dataset 回归测试。
     *
     * @return 回归结果原文（JSON 字符串）
     * @throws IllegalStateException 服务未初始化（调用前应先查 {@link #isGoldenEvalAvailable()}）
     */
    public String runGoldenEval() {
        if (goldenEvalService == null) {
            throw new IllegalStateException("GoldenEvalService未初始化");
        }
        return goldenEvalService.runGoldenEval();
    }

    /** GuardrailsConfigService 是否已初始化。 */
    public boolean isGuardrailsAvailable() {
        return guardrailsConfigService != null;
    }

    /**
     * 读取安全规则配置。
     *
     * @throws IllegalStateException 服务未初始化（调用前应先查 {@link #isGuardrailsAvailable()}）
     */
    public Map<String, Object> getGuardrails() {
        if (guardrailsConfigService == null) {
            throw new IllegalStateException("GuardrailsConfigService未初始化");
        }
        return guardrailsConfigService.getRules();
    }

    /**
     * 热更新安全规则。
     *
     * @throws IllegalStateException 服务未初始化（调用前应先查 {@link #isGuardrailsAvailable()}）
     */
    public void reloadGuardrails() {
        if (guardrailsConfigService == null) {
            throw new IllegalStateException("GuardrailsConfigService未初始化");
        }
        guardrailsConfigService.reload();
    }
}
