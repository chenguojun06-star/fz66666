package com.fashion.supplychain.intelligence.risk.persistence;

import com.fashion.supplychain.intelligence.entity.RiskDetectionResultEntity;
import com.fashion.supplychain.intelligence.engine.risk.RiskItem;
import com.fashion.supplychain.intelligence.mapper.RiskDetectionResultMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class RiskPersistenceService {

    private final RiskDetectionResultMapper riskDetectionResultMapper;

    public int saveRisks(Long tenantId, List<RiskItem> risks) {
        if (tenantId == null || risks == null || risks.isEmpty()) return 0;
        int saved = 0;
        for (RiskItem item : risks) {
            try {
                String type = item.getType() == null ? "UNKNOWN" : item.getType().name();
                String targetType = item.getOrderId() != null ? "ORDER" : "FACTORY";
                String targetId = item.getOrderId() != null ? item.getOrderId() :
                        item.getFactoryId() != null ? item.getFactoryId() : "";
                if (targetId.isEmpty()) continue;
                RiskDetectionResultEntity existing = riskDetectionResultMapper.findOpenByTarget(
                        tenantId, type, targetId);
                if (existing != null) continue;
                RiskDetectionResultEntity entity = new RiskDetectionResultEntity();
                entity.setTenantId(tenantId);
                entity.setRiskType(type);
                entity.setTargetType(targetType);
                entity.setTargetId(targetId);
                entity.setTargetName(targetId);
                entity.setRiskLevel(item.getSeverity() == null ? "MEDIUM" : item.getSeverity());
                entity.setRiskScore((int) Math.max(0, Math.min(100, item.getScore())));
                entity.setRiskReason(item.getDescription());
                entity.setRecommendedAction(item.getSuggestedAction());
                entity.setStatus("open");
                entity.setDetectorName(type);
                entity.setConfidence(0.5);
                entity.setDetectedAt(LocalDateTime.now());
                entity.setCreateTime(LocalDateTime.now());
                entity.setUpdateTime(LocalDateTime.now());
                riskDetectionResultMapper.insert(entity);
                saved++;
            } catch (Exception e) {
                log.debug("[RiskPersistence] save failed: {}", e.getMessage());
            }
        }
        return saved;
    }

    public List<RiskDetectionResultEntity> listOpen(Long tenantId, int limit) {
        if (tenantId == null) return new ArrayList<>();
        try {
            return riskDetectionResultMapper.findOpenByTenant(tenantId, limit);
        } catch (Exception e) {
            log.debug("[RiskPersistence] listOpen failed: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    public boolean resolve(Long id) {
        if (id == null) return false;
        try {
            return riskDetectionResultMapper.resolveById(id) > 0;
        } catch (Exception e) {
            log.debug("[RiskPersistence] resolve failed: {}", e.getMessage());
            return false;
        }
    }
}
