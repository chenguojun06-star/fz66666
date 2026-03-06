package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.PainPointResponse;
import com.fashion.supplychain.intelligence.entity.IntelligencePainPoint;
import com.fashion.supplychain.intelligence.service.IntelligencePainPointService;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class PainPointViewOrchestrator {

    @Autowired
    private IntelligencePainPointService intelligencePainPointService;

    public List<PainPointResponse> listCurrentTenantPainPoints(int limit) {
        Long tenantId = UserContext.tenantId();
        int size = limit <= 0 ? 20 : Math.min(limit, 100);
        return intelligencePainPointService.list(new LambdaQueryWrapper<IntelligencePainPoint>()
                        .eq(tenantId != null, IntelligencePainPoint::getTenantId, tenantId)
                        .orderByDesc(IntelligencePainPoint::getPainLevel)
                        .orderByDesc(IntelligencePainPoint::getTriggerCount)
                        .orderByDesc(IntelligencePainPoint::getLatestTriggerTime)
                        .last("LIMIT " + size))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private PainPointResponse toResponse(IntelligencePainPoint entity) {
        PainPointResponse response = new PainPointResponse();
        response.setId(entity.getId());
        response.setPainCode(entity.getPainCode());
        response.setPainName(entity.getPainName());
        response.setPainLevel(entity.getPainLevel());
        response.setBusinessDomain(entity.getBusinessDomain());
        response.setTriggerCount(entity.getTriggerCount());
        response.setAffectedOrderCount(entity.getAffectedOrderCount());
        response.setAffectedAmount(entity.getAffectedAmount());
        response.setLatestTriggerTime(entity.getLatestTriggerTime());
        response.setRootReasonSummary(entity.getRootReasonSummary());
        response.setCurrentStatus(entity.getCurrentStatus());
        return response;
    }
}
