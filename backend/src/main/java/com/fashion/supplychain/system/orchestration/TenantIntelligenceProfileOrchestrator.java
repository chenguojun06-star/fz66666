package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.dto.TenantIntelligenceProfileSaveRequest;
import com.fashion.supplychain.system.entity.TenantIntelligenceProfile;
import com.fashion.supplychain.system.service.TenantIntelligenceProfileService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Slf4j
@Service
public class TenantIntelligenceProfileOrchestrator {

    @Autowired
    private TenantIntelligenceProfileService tenantIntelligenceProfileService;

    @Transactional(rollbackFor = Exception.class)
    public void saveCurrentTenantProfile(TenantIntelligenceProfileSaveRequest request) {
        TenantAssert.assertTenantContext();
        assertWritable();
        validateRequest(request);

        Long tenantId = TenantAssert.requireTenantId();
        TenantIntelligenceProfile entity = loadCurrentTenantConfig(tenantId);
        LocalDateTime now = LocalDateTime.now();
        if (entity == null) {
            entity = new TenantIntelligenceProfile();
            entity.setTenantId(tenantId);
            entity.setCreateTime(now);
        }
        entity.setPrimaryGoal(normalizePrimaryGoal(request.getPrimaryGoal()));
        entity.setDeliveryWarningDays(request.getDeliveryWarningDays());
        entity.setAnomalyWarningCount(request.getAnomalyWarningCount());
        entity.setLowMarginThreshold(request.getLowMarginThreshold().setScale(2, RoundingMode.HALF_UP));
        entity.setUpdateTime(now);
        tenantIntelligenceProfileService.saveOrUpdate(entity);
        log.info("[TenantIntelligenceProfile] 保存租户智能画像 tenantId={} goal={}", tenantId, entity.getPrimaryGoal());
    }

    @Transactional(rollbackFor = Exception.class)
    public void resetCurrentTenantProfile() {
        TenantAssert.assertTenantContext();
        assertWritable();
        Long tenantId = TenantAssert.requireTenantId();
        tenantIntelligenceProfileService.remove(new LambdaQueryWrapper<TenantIntelligenceProfile>()
                .eq(TenantIntelligenceProfile::getTenantId, tenantId));
        log.info("[TenantIntelligenceProfile] 重置租户智能画像 tenantId={}", tenantId);
    }

    private TenantIntelligenceProfile loadCurrentTenantConfig(Long tenantId) {
        if (tenantId == null) {
            return null;
        }
        return tenantIntelligenceProfileService.getOne(new LambdaQueryWrapper<TenantIntelligenceProfile>()
                .eq(TenantIntelligenceProfile::getTenantId, tenantId)
                .last("LIMIT 1"), false);
    }

    private void validateRequest(TenantIntelligenceProfileSaveRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("智能经营画像不能为空");
        }
        String goal = normalizePrimaryGoal(request.getPrimaryGoal());
        if (!StringUtils.hasText(goal)) {
            throw new IllegalArgumentException("请选择经营目标");
        }
        if (request.getDeliveryWarningDays() == null || request.getDeliveryWarningDays() < 1 || request.getDeliveryWarningDays() > 30) {
            throw new IllegalArgumentException("交期预警天数需在1到30天之间");
        }
        if (request.getAnomalyWarningCount() == null || request.getAnomalyWarningCount() < 1 || request.getAnomalyWarningCount() > 20) {
            throw new IllegalArgumentException("异常预警阈值需在1到20次之间");
        }
        if (request.getLowMarginThreshold() == null
                || request.getLowMarginThreshold().compareTo(BigDecimal.ZERO) < 0
                || request.getLowMarginThreshold().compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new IllegalArgumentException("利润安全线需在0到100之间");
        }
    }

    private String normalizePrimaryGoal(String primaryGoal) {
        String goal = primaryGoal == null ? "" : primaryGoal.trim().toUpperCase();
        return switch (goal) {
            case "PROFIT", "CASHFLOW", "DELIVERY" -> goal;
            default -> null;
        };
    }

    private void assertWritable() {
        if (UserContext.isSuperAdmin() || UserContext.isTenantOwner()) {
            return;
        }
        throw new IllegalArgumentException("仅租户管理员可修改智能画像");
    }
}