package com.fashion.supplychain.intelligence.springai;

import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration
@ConditionalOnProperty(name = "spring-ai.adapter.enabled", havingValue = "true")
public class SpringAiAdapterConfig {

    @Value("${spring-ai.adapter.base-url:https://api.deepseek.com}")
    private String baseUrl;

    @Value("${spring-ai.adapter.api-key:}")
    private String apiKey;

    @Value("${spring-ai.adapter.model:deepseek-v4-flash}")
    private String model;

    @Bean
    public OpenAiApi springAiOpenAiApi() {
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("[SpringAiAdapter] API key is empty, Spring AI adapter will not function properly");
        }
        return OpenAiApi.builder()
                .baseUrl(baseUrl)
                .apiKey(apiKey)
                .build();
    }

    @Bean
    public OpenAiChatModel springAiChatModel(OpenAiApi springAiOpenAiApi) {
        return OpenAiChatModel.builder()
                .openAiApi(springAiOpenAiApi)
                .defaultOptions(OpenAiChatOptions.builder()
                        .model(model)
                        .temperature(0.3)
                        .maxTokens(2048)
                        .build())
                .build();
    }

    @Bean
    public ChatClient springAiChatClient(OpenAiChatModel springAiChatModel) {
        return ChatClient.builder(springAiChatModel).build();
    }
}
