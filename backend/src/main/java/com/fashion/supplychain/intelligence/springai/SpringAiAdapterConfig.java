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

    @Value("${spring-ai.adapter.base-url:}")
    private String baseUrl;

    @Value("${spring-ai.adapter.api-key:}")
    private String apiKey;

    @Value("${spring-ai.adapter.model:deepseek-chat}")
    private String model;

    @Bean
    public OpenAiApi springAiOpenAiApi() {
        return OpenAiApi.builder()
                .baseUrl(baseUrl)
                .apiKey(apiKey)
                .build();
    }

    @Bean
    public OpenAiChatModel springAiChatModel(OpenAiApi api) {
        return OpenAiChatModel.builder()
                .openAiApi(api)
                .defaultOptions(OpenAiChatOptions.builder()
                        .model(model)
                        .temperature(0.3)
                        .maxTokens(2048)
                        .build())
                .build();
    }

    @Bean
    public ChatClient springAiChatClient(OpenAiChatModel chatModel) {
        return ChatClient.builder(chatModel).build();
    }
}
