package com.fashion.supplychain.intelligence.engine.multiint;

import com.fashion.supplychain.intelligence.engine.dto.MultiIntentResult;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;
import java.util.List;
import java.util.Map;

@Component
@Lazy
public class IntentCompositionEngine {

    public MultiIntentResult compose(List<MultiIntentResult.IntentCandidate> candidates,
                                     Map<String, Object> modifiers,
                                     Long tenantId) {
        MultiIntentResult result = new MultiIntentResult();
        result.setCandidates(candidates);
        result.setModifiers(modifiers);
        result.setTenantId(tenantId);
        return result;
    }
}
