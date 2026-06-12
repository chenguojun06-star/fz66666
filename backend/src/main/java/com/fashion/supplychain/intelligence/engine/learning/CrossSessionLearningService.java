package com.fashion.supplychain.intelligence.engine.learning;

import com.fashion.supplychain.intelligence.entity.CrossSessionLearningEntity;
import com.fashion.supplychain.intelligence.mapper.CrossSessionLearningMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class CrossSessionLearningService {

    private final CrossSessionLearningMapper learningMapper;

    public void remember(Long tenantId, String userId, String key, String value, String type) {
        if (tenantId == null || userId == null || key == null) return;
        if (value == null) value = "";
        String learningType = type == null ? "preference" : type;
        try {
            CrossSessionLearningEntity existing = learningMapper.findByKey(tenantId, userId, key, learningType);
            if (existing != null) {
                existing.setLearningValue(value);
                existing.setConfidence(Math.min(1.0, existing.getConfidence() + 0.1));
                existing.setUpdateTime(LocalDateTime.now());
                learningMapper.updateById(existing);
            } else {
                CrossSessionLearningEntity entity = new CrossSessionLearningEntity();
                entity.setTenantId(tenantId);
                entity.setUserId(userId);
                entity.setLearningKey(key);
                entity.setLearningValue(value);
                entity.setLearningType(learningType);
                entity.setConfidence(0.5);
                entity.setHitCount(0);
                entity.setStatus("active");
                entity.setCreateTime(LocalDateTime.now());
                entity.setUpdateTime(LocalDateTime.now());
                learningMapper.insert(entity);
            }
        } catch (Exception e) {
            log.debug("[CrossSessionLearning] remember failed: {}", e.getMessage());
        }
    }

    public List<CrossSessionLearningEntity> recallActive(Long tenantId, String userId, int limit) {
        if (tenantId == null || userId == null) return new ArrayList<>();
        try {
            return learningMapper.findActiveByUser(tenantId, userId, limit);
        } catch (Exception e) {
            log.debug("[CrossSessionLearning] recallActive failed: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    public Map<String, String> recallAsMap(Long tenantId, String userId, int limit) {
        List<CrossSessionLearningEntity> list = recallActive(tenantId, userId, limit);
        Map<String, String> result = new HashMap<>();
        for (CrossSessionLearningEntity e : list) {
            result.put(e.getLearningKey(), e.getLearningValue());
        }
        return result;
    }

    public void touchHit(Long id) {
        if (id == null) return;
        try {
            learningMapper.incrementHit(id);
        } catch (Exception e) {
            log.debug("[CrossSessionLearning] touchHit failed: {}", e.getMessage());
        }
    }

    public int totalActiveLearnings(Long tenantId, String userId) {
        return recallActive(tenantId, userId, 1000).size();
    }
}
