package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.TenantPreferenceProfile;
import com.fashion.supplychain.intelligence.service.TenantIntelligencePreferenceService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.system.dto.TenantIntelligenceProfileResponse;
import com.fashion.supplychain.system.entity.TenantIntelligenceProfile;
import com.fashion.supplychain.system.service.TenantIntelligenceProfileService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class TenantIntelligenceProfileViewOrchestrator {

    private static final DateTimeFormatter DATE_TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private TenantIntelligenceProfileService tenantIntelligenceProfileService;

    @Autowired
    private TenantIntelligencePreferenceService tenantIntelligencePreferenceService;

    public TenantIntelligenceProfileResponse getCurrentTenantProfileView() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        TenantPreferenceProfile learnedProfile = learnCurrentTenantProfile(tenantId);
        TenantIntelligenceProfile savedProfile = loadCurrentTenantConfig(tenantId);
        TenantPreferenceProfile currentProfile = tenantIntelligencePreferenceService.mergeProfile(
                learnedProfile,
                savedProfile == null ? null : savedProfile.getPrimaryGoal(),
                savedProfile == null ? null : savedProfile.getDeliveryWarningDays(),
                savedProfile == null ? null : savedProfile.getAnomalyWarningCount(),
                savedProfile == null ? null : savedProfile.getLowMarginThreshold()
        );
        return buildResponse(currentProfile, learnedProfile, savedProfile);
    }

    public TenantPreferenceProfile getCurrentTenantPreferenceProfile() {
        TenantIntelligenceProfileResponse response = getCurrentTenantProfileView();
        TenantPreferenceProfile profile = tenantIntelligencePreferenceService.defaultProfile();
        profile.setPrimaryGoal(response.getPrimaryGoal());
        profile.setPrimaryGoalLabel(response.getPrimaryGoalLabel());
        profile.setDeliveryWarningDays(response.getDeliveryWarningDays());
        profile.setAnomalyWarningCount(response.getAnomalyWarningCount());
        profile.setLowMarginThreshold(response.getLowMarginThreshold());
        profile.setTopRiskFactoryName(response.getTopRiskFactoryName());
        profile.setTopRiskFactoryReason(response.getTopRiskFactoryReason());
        return profile;
    }

    private TenantPreferenceProfile learnCurrentTenantProfile(Long tenantId) {
        List<ProductionOrder> orders = productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getTenantId, tenantId)
                .and(wrapper -> wrapper.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                .last("LIMIT 500"));
        List<ScanRecord> scanRecords = scanRecordService.list(new LambdaQueryWrapper<ScanRecord>()
                .eq(ScanRecord::getTenantId, tenantId)
                .orderByDesc(ScanRecord::getScanTime)
                .last("LIMIT 1000"));
        return tenantIntelligencePreferenceService.learnProfile(orders, scanRecords);
    }

    private TenantIntelligenceProfile loadCurrentTenantConfig(Long tenantId) {
        if (tenantId == null) {
            return null;
        }
        return tenantIntelligenceProfileService.getOne(new LambdaQueryWrapper<TenantIntelligenceProfile>()
                .eq(TenantIntelligenceProfile::getTenantId, tenantId)
                .last("LIMIT 1"), false);
    }

    private TenantIntelligenceProfileResponse buildResponse(TenantPreferenceProfile currentProfile,
                                                            TenantPreferenceProfile learnedProfile,
                                                            TenantIntelligenceProfile savedProfile) {
        TenantIntelligenceProfileResponse response = new TenantIntelligenceProfileResponse();
        fillCurrentProfile(response, currentProfile, savedProfile);
        fillLearnedProfile(response, learnedProfile);
        return response;
    }

    private void fillCurrentProfile(TenantIntelligenceProfileResponse response,
                                    TenantPreferenceProfile currentProfile,
                                    TenantIntelligenceProfile savedProfile) {
        TenantPreferenceProfile safeProfile = currentProfile == null
                ? tenantIntelligencePreferenceService.defaultProfile()
                : currentProfile;
        response.setPrimaryGoal(safeProfile.getPrimaryGoal());
        response.setPrimaryGoalLabel(safeProfile.getPrimaryGoalLabel());
        response.setDeliveryWarningDays(safeProfile.getDeliveryWarningDays());
        response.setAnomalyWarningCount(safeProfile.getAnomalyWarningCount());
        response.setLowMarginThreshold(safeScale(safeProfile.getLowMarginThreshold()));
        response.setTopRiskFactoryName(safeProfile.getTopRiskFactoryName());
        response.setTopRiskFactoryReason(safeProfile.getTopRiskFactoryReason());
        response.setManualConfigured(savedProfile != null);
        response.setUpdateTime(savedProfile != null && savedProfile.getUpdateTime() != null
                ? savedProfile.getUpdateTime().format(DATE_TIME_FMT)
                : null);
    }

    private void fillLearnedProfile(TenantIntelligenceProfileResponse response, TenantPreferenceProfile learnedProfile) {
        TenantPreferenceProfile safeLearned = learnedProfile == null
                ? tenantIntelligencePreferenceService.defaultProfile()
                : learnedProfile;
        response.getLearnedProfile().setPrimaryGoal(safeLearned.getPrimaryGoal());
        response.getLearnedProfile().setPrimaryGoalLabel(safeLearned.getPrimaryGoalLabel());
        response.getLearnedProfile().setDeliveryWarningDays(safeLearned.getDeliveryWarningDays());
        response.getLearnedProfile().setAnomalyWarningCount(safeLearned.getAnomalyWarningCount());
        response.getLearnedProfile().setLowMarginThreshold(safeScale(safeLearned.getLowMarginThreshold()));
        response.getLearnedProfile().setTopRiskFactoryName(safeLearned.getTopRiskFactoryName());
        response.getLearnedProfile().setTopRiskFactoryReason(safeLearned.getTopRiskFactoryReason());
    }

    private BigDecimal safeScale(BigDecimal value) {
        BigDecimal current = value == null ? BigDecimal.valueOf(5) : value;
        return current.setScale(2, RoundingMode.HALF_UP);
    }
}
