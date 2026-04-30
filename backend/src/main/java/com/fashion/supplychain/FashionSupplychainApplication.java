package com.fashion.supplychain;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.fashion.supplychain.style.orchestration.StyleQuotationOrchestrator;

@SpringBootApplication(excludeName = {
    "org.springframework.ai.model.openai.autoconfigure.OpenAiChatAutoConfiguration",
    "org.springframework.ai.model.openai.autoconfigure.OpenAiEmbeddingAutoConfiguration",
    "org.springframework.ai.model.openai.autoconfigure.OpenAiImageAutoConfiguration",
    "org.springframework.ai.model.openai.autoconfigure.OpenAiModerationAutoConfiguration",
    "org.springframework.ai.model.openai.autoconfigure.OpenAiAudioTranscriptionAutoConfiguration",
    "org.springframework.ai.model.openai.autoconfigure.OpenAiAudioSpeechAutoConfiguration",
    "org.springframework.ai.model.chat.client.autoconfigure.ChatClientAutoConfiguration",
    "org.springframework.ai.retry.autoconfigure.SpringAiRetryAutoConfiguration",
    "org.springframework.ai.model.tool.autoconfigure.ToolCallingAutoConfiguration",
    "org.springframework.ai.model.chat.memory.autoconfigure.ChatMemoryAutoConfiguration",
    "org.springframework.ai.model.chat.observation.autoconfigure.ChatObservationAutoConfiguration",
    "org.springframework.ai.model.embedding.observation.autoconfigure.EmbeddingObservationAutoConfiguration",
    "org.springframework.ai.model.image.observation.autoconfigure.ImageObservationAutoConfiguration"
})
@EnableScheduling
@MapperScan("com.fashion.supplychain.**.mapper")
public class FashionSupplychainApplication {

    private static final Logger log = LoggerFactory.getLogger(FashionSupplychainApplication.class);

    public static void main(final String[] args) {
        ensureDatasourceCharset();
        SpringApplication.run(FashionSupplychainApplication.class, args);
    }

    private static void ensureDatasourceCharset() {
        String url = System.getenv("SPRING_DATASOURCE_URL");
        if (url != null && url.startsWith("jdbc:mysql:") && !url.contains("characterEncoding")) {
            String separator = url.contains("?") ? "&" : "?";
            String fixedUrl = url + separator + "useUnicode=true&characterEncoding=UTF-8";
            System.setProperty("spring.datasource.url", fixedUrl);
            log.warn("[Charset] SPRING_DATASOURCE_URL 缺少 characterEncoding，已自动追加: {}", fixedUrl);
        }
    }

    @Bean
    @Profile("!test")
    public ApplicationRunner fixBuggyOtherCost(final StyleQuotationOrchestrator styleQuotationOrchestrator) {
        return args -> {
            try {
                styleQuotationOrchestrator.fixBuggyOtherCostOnStartup();
            } catch (Exception e) {
                log.error("[Startup] fixBuggyOtherCost 失败，跳过修复，应用继续启动。原因: {}", e.getMessage());
            }
        };
    }

}
