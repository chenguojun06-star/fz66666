package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.fashion.supplychain.common.util.AesEncryptor;
import com.fashion.supplychain.intelligence.entity.TenantAiConfig;
import com.fashion.supplychain.intelligence.entity.TenantAiUsage;
import com.fashion.supplychain.intelligence.mapper.TenantAiConfigMapper;
import com.fashion.supplychain.intelligence.mapper.TenantAiUsageMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;

@Slf4j
@Service
public class TenantAiConfigService {

    @Autowired private TenantAiConfigMapper configMapper;
    @Autowired private TenantAiUsageMapper usageMapper;
    @Autowired private AesEncryptor aesEncryptor;

    @Value("${ai.gateway.litellm.base-url:}") private String platformBaseUrl;
    @Value("${ai.gateway.litellm.api-key:}") private String platformApiKey;
    @Value("${ai.gateway.litellm.default-model:}") private String platformModel;
    @Value("${ai.deepseek.api-key:}") private String platformFallbackKey;

    public static class ResolvedConfig {
        private final String apiKey;
        private final String baseUrl;
        private final String model;
        private final String provider;
        private final String configSource;

        public ResolvedConfig(String apiKey, String baseUrl, String model, String provider, String configSource) {
            this.apiKey = apiKey;
            this.baseUrl = baseUrl;
            this.model = model;
            this.provider = provider;
            this.configSource = configSource;
        }

        public String getApiKey() { return apiKey; }
        public String getBaseUrl() { return baseUrl; }
        public String getModel() { return model; }
        public String getProvider() { return provider; }
        public String getConfigSource() { return configSource; }
        public boolean isPlatformProvisioned() { return "platform".equals(configSource); }
    }

    public TenantAiConfig getOrCreateConfig(Long tenantId) {
        if (tenantId == null) {
            log.warn("[TenantAiConfig] tenantId为null，返回空配置");
            return new TenantAiConfig();
        }
        QueryWrapper<TenantAiConfig> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId).eq("delete_flag", 0);
        TenantAiConfig config = configMapper.selectOne(qw);
        if (config == null) {
            config = new TenantAiConfig();
            config.setTenantId(tenantId);
            config.setConfigSource("platform");
            config.setAiEnabled(1);
            configMapper.insert(config);
        }
        return config;
    }

    public TenantAiConfig updateConfig(Long tenantId, String textProvider, String textApiKey,
                                        String textBaseUrl, String textModel, Integer aiEnabled) {
        TenantAiConfig config = getOrCreateConfig(tenantId);
        if (textProvider != null) config.setTextProvider(textProvider);
        if (textApiKey != null && !textApiKey.isBlank()) {
            config.setTextApiKey(aesEncryptor.encrypt(textApiKey));
            config.setConfigSource("tenant");
        }
        if (textBaseUrl != null) config.setTextBaseUrl(textBaseUrl);
        if (textModel != null) config.setTextModel(textModel);
        if (aiEnabled != null) config.setAiEnabled(aiEnabled);
        configMapper.updateById(config);
        log.info("[TenantAiConfig] 租户{} AI配置已更新: source={} provider={} enabled={}",
                tenantId, config.getConfigSource(), config.getTextProvider(), config.getAiEnabled());
        return config;
    }

    public TenantAiConfig setPlatformProvisioned(Long tenantId, String apiKey, String model) {
        TenantAiConfig config = getOrCreateConfig(tenantId);
        config.setTextProvider("mimo");
        config.setTextApiKey(aesEncryptor.encrypt(apiKey));
        if (model != null && !model.isBlank()) config.setTextModel(model);
        config.setConfigSource("platform");
        config.setAiEnabled(1);
        configMapper.updateById(config);
        log.info("[TenantAiConfig] 租户{} 平台代充已生效: model={}", tenantId, model);
        return config;
    }

    public ResolvedConfig resolveConfig(Long tenantId) {
        TenantAiConfig config = getOrCreateConfig(tenantId);
        if (!config.checkAiEnabled()) {
            return new ResolvedConfig(null, null, null, "disabled", "disabled");
        }

        if (config.hasOwnApiKey()) {
            String decryptedKey = aesEncryptor.tryDecrypt(config.getTextApiKey());
            if (decryptedKey != null && !decryptedKey.isBlank()) {
                return new ResolvedConfig(
                        decryptedKey,
                        firstNonBlank(config.getTextBaseUrl(), platformBaseUrl),
                        firstNonBlank(config.getTextModel(), platformModel),
                        firstNonBlank(config.getTextProvider(), "mimo"),
                        "tenant"
                );
            }
        }

        if (config.isPlatformProvisioned() && config.getTextApiKey() != null && !config.getTextApiKey().isBlank()) {
            String decryptedKey = aesEncryptor.tryDecrypt(config.getTextApiKey());
            if (decryptedKey != null && !decryptedKey.isBlank()) {
                return new ResolvedConfig(
                        decryptedKey,
                        firstNonBlank(config.getTextBaseUrl(), platformBaseUrl),
                        firstNonBlank(config.getTextModel(), platformModel),
                        firstNonBlank(config.getTextProvider(), "mimo"),
                        "platform"
                );
            }
        }

        if (isNotBlank(platformApiKey)) {
            return new ResolvedConfig(platformApiKey, platformBaseUrl, platformModel, "platform", "platform_default");
        }
        if (isNotBlank(platformFallbackKey)) {
            return new ResolvedConfig(platformFallbackKey, null, null, "deepseek", "platform_fallback");
        }

        return new ResolvedConfig(null, null, null, "unavailable", "unavailable");
    }

    public void recordUsage(Long tenantId, String provider, String model, long tokenCount, BigDecimal costAmount) {
        try {
            LocalDate today = LocalDate.now();
            QueryWrapper<TenantAiUsage> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId).eq("usage_date", today).eq("provider", provider).eq("model", model);
            TenantAiUsage usage = usageMapper.selectOne(qw);
            if (usage == null) {
                usage = new TenantAiUsage();
                usage.setTenantId(tenantId);
                usage.setUsageDate(today);
                usage.setProvider(provider);
                usage.setModel(model);
                usage.setRequestCount(1);
                usage.setTokenCount(tokenCount);
                usage.setCostAmount(costAmount != null ? costAmount : BigDecimal.ZERO);
                usageMapper.insert(usage);
            } else {
                UpdateWrapper<TenantAiUsage> uw = new UpdateWrapper<>();
                uw.eq("id", usage.getId());
                uw.setSql("request_count = request_count + 1");
                uw.setSql("token_count = COALESCE(token_count,0) + " + tokenCount);
                if (costAmount != null && costAmount.compareTo(BigDecimal.ZERO) > 0) {
                    uw.setSql("cost_amount = COALESCE(cost_amount,0) + " + costAmount);
                }
                usageMapper.update(null, uw);
            }
        } catch (Exception e) {
            log.debug("[TenantAiUsage] 用量记录跳过: {}", e.getMessage());
        }
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (isNotBlank(v)) return v;
        }
        return null;
    }

    private boolean isNotBlank(String s) {
        return s != null && !s.isBlank();
    }
}