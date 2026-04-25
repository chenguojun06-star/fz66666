package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.intelligence.service.tts.TtsStrategy;
import com.fashion.supplychain.intelligence.service.tts.TtsStrategyFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/tts")
@RequiredArgsConstructor
@Slf4j
public class TtsController {

    private final TtsStrategyFactory strategyFactory;

    private static final int MAX_TEXT_LENGTH = 500;

    @PostMapping("/speak")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<byte[]> speak(@RequestBody Map<String, String> body) {
        String text = body.getOrDefault("text", "").trim();
        String voice = body.getOrDefault("voice", "").trim();

        if (text.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        if (text.length() > MAX_TEXT_LENGTH) {
            text = text.substring(0, MAX_TEXT_LENGTH);
        }

        try {
            TtsStrategy strategy = strategyFactory.getActive();
            String voiceName = voice.isBlank() ? strategy.getDefaultVoice() : voice;
            byte[] audio = strategy.synthesize(text, voiceName);

            if (audio == null || audio.length == 0) {
                log.warn("[TTS] 合成结果为空: provider={}, text={}",
                        strategy.getProviderName(),
                        text.substring(0, Math.min(30, text.length())));
                return ResponseEntity.noContent().build();
            }
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType("audio/mpeg"))
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"tts.mp3\"")
                    .header(HttpHeaders.CACHE_CONTROL, "max-age=3600")
                    .body(audio);
        } catch (Exception e) {
            log.warn("[TTS] 合成失败: text={}, error={}",
                    text.substring(0, Math.min(30, text.length())), e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }
}
