package com.fashion.supplychain.intelligence.springai;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import com.openai.client.OpenAIClient;
import com.openai.client.OpenAIClientAsync;
import io.micrometer.observation.ObservationRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.setup.OpenAiSetup;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring AI 2.0 适配器装配（D-743）。
 *
 * <p>2.0 相对 1.0 是范式重写：自研 RestClient 版 {@code OpenAiApi} 被整体移除，
 * 底层换成 OpenAI 官方 Java SDK（{@code com.openai:openai-java-core}），
 * 这里经 {@link OpenAiSetup#setupSyncClient} 构建 SDK 客户端再装配
 * {@link OpenAiChatModel}。DeepSeek API 与 OpenAI 协议兼容，模型名走
 * {@code spring-ai.adapter.model}（deepseek-flash）。
 */
@Slf4j
@Configuration
@ConditionalOnProperty(name = "spring-ai.adapter.enabled", havingValue = "true", matchIfMissing = true)
public class SpringAiAdapterConfig {

    @Value("${spring-ai.adapter.base-url:https://api.deepseek.com}")
    private String baseUrl;

    @Value("${spring-ai.adapter.api-key:}")
    private String apiKey;

    @Value("${spring-ai.adapter.model:deepseek-flash}")
    private String model;

    @Value("${spring-ai.adapter.timeout-seconds:120}")
    private long timeoutSeconds;

    @Bean
    public OpenAiChatModel springAiChatModel(ObjectProvider<ObservationRegistry> observationRegistry) {
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("[SpringAiAdapter] API key is empty, Spring AI adapter will not function properly");
        }
        // 2.0 的 ChatModel 同步调用(call)与流式(stream)分别走 sync/async 两个 SDK client，
        // Builder 不会从 sync client 推导 async——漏配 async 会在 build() 时因空凭据直接炸启动
        // （真机冒烟 D-743 实证）。两个 client 用同一份连接配置显式构建。
        String url = normalizeBaseUrl(baseUrl);
        Duration timeout = Duration.ofSeconds(timeoutSeconds);
        ObservationRegistry registry = observationRegistry.getIfAvailable(() -> ObservationRegistry.NOOP);
        OpenAIClient syncClient = OpenAiSetup.setupSyncClient(url, apiKey,
                null, null, null, null, false, false, null,
                timeout, 0, null, Map.of(), registry, null, List.of());
        OpenAIClientAsync asyncClient = OpenAiSetup.setupAsyncClient(url, apiKey,
                null, null, null, null, false, false, null,
                timeout, 0, null, Map.of(), registry, null, List.of());
        return OpenAiChatModel.builder()
                .openAiClient(syncClient)
                .openAiClientAsync(asyncClient)
                .options(OpenAiChatOptions.builder()
                        .model(model)
                        .temperature(0.3)
                        .maxTokens(2048)
                        .build())
                .build();
    }

    /**
     * OpenAI 官方 SDK 的 baseUrl 约定含版本段（如 https://api.deepseek.com/v1），
     * SDK 自身只追加 /chat/completions 等资源路径。1.0 的 OpenAiApi 是靠默认
     * completionsPath="/v1/chat/completions" 补的 /v1，2.0 没有这层——裸域名配置
     * 在此统一补 /v1，保持 1.0 时代的最终 URL 语义不变；带路径的自建网关原样透传。
     */
    static String normalizeBaseUrl(String url) {
        if (url == null || url.isBlank()) {
            return "https://api.deepseek.com/v1";
        }
        String trimmed = url.trim();
        if (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        try {
            String path = URI.create(trimmed).getPath();
            if (path == null || path.isEmpty() || "/".equals(path)) {
                return trimmed + "/v1";
            }
        }
        catch (Exception ignored) {
            // 非法 URL 交给 SDK 在首次请求时报错，避免吞掉用户配置错误
        }
        return trimmed;
    }
}
