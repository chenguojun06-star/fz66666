package com.fashion.supplychain.intelligence.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
public class EdgeTtsService {

    private static final String WSS_URL =
            "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
    private static final String TRUSTED_TOKEN = System.getProperty("edge.tts.trusted.token", "6A5AA1D4EAFF4E9FB37E23D68491D6F4");
    private static final String DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";
    private static final String OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
    private static final long TIMEOUT_SECONDS = 15;
    private static final String CHROMIUM_VERSION = "143.0.3650.75";
    private static final String CHROMIUM_MAJOR = CHROMIUM_VERSION.split("\\.")[0];
    private static final long WIN_EPOCH = 11644473600L;

    private final HttpClient httpClient;

    public EdgeTtsService() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public byte[] synthesize(String text) {
        return synthesize(text, DEFAULT_VOICE);
    }

    public byte[] synthesize(String text, String voiceName) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("文本不能为空");
        }
        String trimmed = text.trim();
        if (trimmed.length() > 500) {
            trimmed = trimmed.substring(0, 500);
        }

        String requestId = UUID.randomUUID().toString().replace("-", "");
        String connectionId = UUID.randomUUID().toString().replace("-", "");
        String secMsGec = generateSecMsGec();
        String muid = generateMuid();

        CompletableFuture<byte[]> future = new CompletableFuture<>();
        List<byte[]> audioChunks = Collections.synchronizedList(new ArrayList<>());
        String finalText = trimmed;

        try {
            URI uri = new URI(WSS_URL
                    + "?TrustedClientToken=" + TRUSTED_TOKEN
                    + "&Sec-MS-GEC=" + secMsGec
                    + "&Sec-MS-GEC-Version=1-" + CHROMIUM_VERSION
                    + "&ConnectionId=" + connectionId);

            java.net.http.WebSocket.Listener listener = new java.net.http.WebSocket.Listener() {
                private final StringBuilder textBuffer = new StringBuilder();

                @Override
                public void onOpen(java.net.http.WebSocket webSocket) {
                    webSocket.request(1);

                    String config = "Content-Type:application/json; charset=utf-8\r\n"
                            + "Path:speech.config\r\n\r\n"
                            + "{\"context\":{\"synthesis\":{\"audio\":{"
                            + "\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"true\"},"
                            + "\"outputFormat\":\"" + OUTPUT_FORMAT + "\"}}}}";
                    webSocket.sendText(config, true);

                    String ssml = "X-RequestId:" + requestId + "\r\n"
                            + "Content-Type:application/ssml+xml\r\n"
                            + "Path:ssml\r\n\r\n"
                            + "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>"
                            + "<voice name='" + voiceName + "'>"
                            + escapeXml(finalText)
                            + "</voice></speak>";
                    webSocket.sendText(ssml, true);
                }

                @Override
                public java.util.concurrent.CompletionStage<?> onText(
                        java.net.http.WebSocket webSocket, CharSequence data, boolean last) {
                    textBuffer.append(data);
                    if (last) {
                        String payload = textBuffer.toString();
                        textBuffer.setLength(0);
                        if (payload.contains("Path:turn.end")) {
                            try {
                                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                                for (byte[] chunk : audioChunks) {
                                    baos.write(chunk);
                                }
                                future.complete(baos.toByteArray());
                            } catch (Exception e) {
                                future.completeExceptionally(e);
                            }
                            webSocket.sendClose(java.net.http.WebSocket.NORMAL_CLOSURE, "done");
                        }
                    }
                    webSocket.request(1);
                    return null;
                }

                @Override
                public java.util.concurrent.CompletionStage<?> onBinary(
                        java.net.http.WebSocket webSocket, ByteBuffer data, boolean last) {
                    if (data.remaining() > 2) {
                        byte b1 = data.get();
                        byte b2 = data.get();
                        int headerLen = ((b1 & 0xFF) << 8) | (b2 & 0xFF);
                        if (data.remaining() >= headerLen) {
                            data.position(data.position() + headerLen);
                            byte[] audioData = new byte[data.remaining()];
                            data.get(audioData);
                            if (audioData.length > 0) {
                                audioChunks.add(audioData);
                            }
                        }
                    }
                    webSocket.request(1);
                    return null;
                }

                @Override
                public java.util.concurrent.CompletionStage<?> onClose(
                        java.net.http.WebSocket webSocket, int statusCode, String reason) {
                    if (!future.isDone()) {
                        if (audioChunks.isEmpty()) {
                            future.completeExceptionally(
                                    new RuntimeException("连接关闭但未收到音频: " + reason));
                        } else {
                            try {
                                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                                for (byte[] chunk : audioChunks) {
                                    baos.write(chunk);
                                }
                                future.complete(baos.toByteArray());
                            } catch (Exception e) {
                                future.completeExceptionally(e);
                            }
                        }
                    }
                    return null;
                }

                @Override
                public void onError(java.net.http.WebSocket webSocket, Throwable error) {
                    log.warn("[EdgeTTS] WebSocket错误: {}", error.getMessage());
                    future.completeExceptionally(error);
                }
            };

            httpClient.newWebSocketBuilder()
                    .header("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold")
                    .header("User-Agent",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                    + "AppleWebKit/537.36 (KHTML, like Gecko) "
                                    + "Chrome/" + CHROMIUM_MAJOR + ".0.0.0 Safari/537.36"
                                    + " Edg/" + CHROMIUM_MAJOR + ".0.0.0")
                    .header("Pragma", "no-cache")
                    .header("Cache-Control", "no-cache")
                    .header("Accept-Encoding", "gzip, deflate, br, zstd")
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .header("Cookie", "muid=" + muid + ";")
                    .buildAsync(uri, listener);

            return future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);

        } catch (Exception e) {
            log.warn("[EdgeTTS] 语音合成失败: text={}, voice={}, error={}",
                    trimmed.substring(0, Math.min(30, trimmed.length())),
                    voiceName, e.getMessage());
            throw new RuntimeException("语音合成失败: " + e.getMessage(), e);
        }
    }

    private String generateSecMsGec() {
        long ticks = Instant.now().getEpochSecond();
        ticks += WIN_EPOCH;
        ticks -= ticks % 300;
        double ticks100ns = ticks * 1e7;
        String strToHash = String.format("%.0f%s", ticks100ns, TRUSTED_TOKEN);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(strToHash.getBytes(StandardCharsets.US_ASCII));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02X", b));
            }
            return hex.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private String generateMuid() {
        byte[] bytes = new byte[16];
        ThreadLocalRandom.current().nextBytes(bytes);
        StringBuilder hex = new StringBuilder();
        for (byte b : bytes) {
            hex.append(String.format("%02X", b));
        }
        return hex.toString();
    }

    private String escapeXml(String text) {
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("'", "&apos;")
                .replace("\"", "&quot;");
    }
}
