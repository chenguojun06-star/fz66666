package com.fashion.supplychain.intelligence.service.tts;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
@Slf4j
public class TtsStrategyFactory {

    private final Map<String, TtsStrategy> strategyMap;
    private final String activeProvider;

    public TtsStrategyFactory(List<TtsStrategy> strategies,
                              @Value("${tts.provider:edge}") String activeProvider) {
        this.strategyMap = strategies.stream()
                .collect(Collectors.toMap(TtsStrategy::getProviderName, Function.identity()));
        this.activeProvider = activeProvider;
        log.info("[TTS] 已注册策略: {}, 当前使用: {}", strategyMap.keySet(), activeProvider);
    }

    public TtsStrategy getActive() {
        TtsStrategy strategy = strategyMap.get(activeProvider);
        if (strategy == null) {
            throw new RuntimeException("未找到TTS策略: " + activeProvider
                    + ", 可用: " + strategyMap.keySet());
        }
        return strategy;
    }

    public String getActiveProviderName() {
        return activeProvider;
    }
}
