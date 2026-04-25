package com.fashion.supplychain.intelligence.service.tts;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
@ConditionalOnProperty(name = "tts.provider", havingValue = "azure")
@Slf4j
public class AzureTtsStrategy implements TtsStrategy {

    private static final String DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";
    private static final String OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

    private final HttpClient httpClient;
    private final String subscriptionKey;
    private final String region;

    public AzureTtsStrategy(
            @Value("${tts.azure.subscription-key:}") String subscriptionKey,
            @Value("${tts.azure.region:eastasia}") String region) {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        this.subscriptionKey = subscriptionKey;
        this.region = region;
        log.info("[AzureTTS] 初始化: region={}", region);
    }

    @Override
    public byte[] synthesize(String text, String voiceName) {
        if (subscriptionKey == null || subscriptionKey.isBlank()) {
            throw new RuntimeException("Azure TTS 未配置: 请设置 tts.azure.subscription-key");
        }

        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("文本不能为空");
        }
        String trimmed = text.trim();
        if (trimmed.length() > 200) {
            trimmed = trimmed.substring(0, 200);
        }

        String ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>"
                + "<voice name='" + voiceName + "'>"
                + escapeXml(trimmed)
                + "</voice></speak>";

        try {
            String accessToken = fetchToken();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://" + region + ".tts.speech.microsoft.com/cognitiveservices/v1"))
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Content-Type", "application/ssml+xml")
                    .header("X-Microsoft-OutputFormat", OUTPUT_FORMAT)
                    .header("User-Agent", "FashionSupplyChain-TTS")
                    .POST(HttpRequest.BodyPublishers.ofString(ssml, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());

            if (response.statusCode() == 200) {
                return response.body();
            } else {
                String body = new String(response.body(), StandardCharsets.UTF_8);
                log.warn("[AzureTTS] 合成失败: status={}, body={}", response.statusCode(),
                        body.substring(0, Math.min(200, body.length())));
                throw new RuntimeException("Azure TTS 合成失败: HTTP " + response.statusCode());
            }

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[AzureTTS] 请求异常: {}", e.getMessage());
            throw new RuntimeException("Azure TTS 请求失败: " + e.getMessage(), e);
        }
    }

    private String fetchToken() throws Exception {
        HttpRequest tokenRequest = HttpRequest.newBuilder()
                .uri(URI.create("https://" + region + ".api.cognitive.microsoft.com/sts/v1.0/issueToken"))
                .header("Ocp-Apim-Subscription-Key", subscriptionKey)
                .header("Content-Length", "0")
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();

        HttpResponse<String> tokenResponse = httpClient.send(tokenRequest, HttpResponse.BodyHandlers.ofString());

        if (tokenResponse.statusCode() == 200) {
            return tokenResponse.body();
        }
        throw new RuntimeException("获取Azure Token失败: HTTP " + tokenResponse.statusCode());
    }

    @Override
    public String getDefaultVoice() {
        return DEFAULT_VOICE;
    }

    @Override
    public String getProviderName() {
        return "azure";
    }

    private String escapeXml(String text) {
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("'", "&apos;")
                .replace("\"", "&quot;");
    }
}
