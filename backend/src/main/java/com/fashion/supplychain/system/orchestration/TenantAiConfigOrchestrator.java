package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.intelligence.entity.TenantAiConfig;
import com.fashion.supplychain.intelligence.mapper.TenantAiConfigMapper;
import com.fashion.supplychain.intelligence.service.TenantAiConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@Lazy
public class TenantAiConfigOrchestrator {

    @Autowired
    private TenantAiConfigMapper tenantAiConfigMapper;

    /**
     * D-649：租户 AI 配置读写（原 TenantController 直接注入，规则6 违规）。
     * 声明为可选 —— 与重构前一致，Bean 缺失时由 {@link #isAvailable()} 暴露给调用方降级。
     */
    @Autowired(required = false)
    private TenantAiConfigService tenantAiConfigService;

    @Transactional
    public void updateById(TenantAiConfig config) {
        tenantAiConfigMapper.updateById(config);
    }

    // ==================== D-649：自 TenantController 下沉 ====================

    /** AI 配置能力是否可用（Service Bean 未装配时为 false，由 Controller 决定降级响应体）。 */
    public boolean isAvailable() {
        return tenantAiConfigService != null;
    }

    /**
     * 读取租户 AI 配置，含解析后真正生效的 provider 与来源。
     */
    public Map<String, Object> getConfig(Long tenantId) {
        TenantAiConfig config = tenantAiConfigService.getOrCreateConfig(tenantId);
        TenantAiConfigService.ResolvedConfig resolved = tenantAiConfigService.resolveConfig(tenantId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("config", config);
        result.put("resolvedProvider", resolved.getProvider());
        result.put("resolvedSource", resolved.getConfigSource());
        return result;
    }

    /** 平台代管：写入平台下发的 API Key 与模型。 */
    public void setPlatformProvisioned(Long tenantId, String apiKey, String model) {
        tenantAiConfigService.setPlatformProvisioned(tenantId, apiKey, model);
    }

    /** 重置为平台代管模式（清空租户自备密钥）。 */
    public void resetToPlatform(Long tenantId) {
        TenantAiConfig config = tenantAiConfigService.getOrCreateConfig(tenantId);
        config.setConfigSource("platform");
        config.setTextApiKey(null);
        config.setTextProvider("mimo");
        config.setTextModel(null);
        config.setTextBaseUrl(null);
        config.setAiEnabled(1);
        updateById(config);
    }

    /** 更新租户自备模型配置。 */
    public void updateConfig(Long tenantId, String textProvider, String textApiKey,
                             String textBaseUrl, String textModel, Integer aiEnabled) {
        tenantAiConfigService.updateConfig(tenantId, textProvider, textApiKey,
                textBaseUrl, textModel, aiEnabled);
    }
}
