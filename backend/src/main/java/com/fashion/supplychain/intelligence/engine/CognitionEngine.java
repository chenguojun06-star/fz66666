package com.fashion.supplychain.intelligence.engine;

import com.fashion.supplychain.intelligence.engine.dto.MultiIntentResult;
import java.util.Map;

public interface CognitionEngine {
    MultiIntentResult recognizeIntent(String query, Long tenantId);

    String reason(Long tenantId, String question);

    Map<String, Double> selfEvaluate(String query, String answer, Long tenantId);

    Map<String, Object> loadUserPreference(Long userId);
}
