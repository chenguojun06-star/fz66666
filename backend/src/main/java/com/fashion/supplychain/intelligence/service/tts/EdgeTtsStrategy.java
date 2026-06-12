package com.fashion.supplychain.intelligence.service.tts;

import com.fashion.supplychain.intelligence.service.EdgeTtsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

@Component
@Lazy
@RequiredArgsConstructor
@Slf4j
public class EdgeTtsStrategy implements TtsStrategy {

    private final EdgeTtsService edgeTtsService;

    @Override
    public byte[] synthesize(String text, String voiceName) {
        return edgeTtsService.synthesize(text, voiceName);
    }

    @Override
    public String getDefaultVoice() {
        return "zh-CN-XiaoxiaoNeural";
    }

    @Override
    public String getProviderName() {
        return "edge";
    }
}
