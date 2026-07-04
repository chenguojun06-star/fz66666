package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorLevel;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorPricePolicy;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorProfile;
import com.fashion.supplychain.integration.ecommerce.service.DistributorLevelService;
import com.fashion.supplychain.integration.ecommerce.service.DistributorPricePolicyService;
import com.fashion.supplychain.integration.ecommerce.service.DistributorProfileService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/**
 * 分销商管理 Orchestrator（Phase 4）
 * 负责分销商档案/等级/价格政策的编排逻辑
 * 事务边界在此层（D-001），Service 层无 @Transactional
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DistributorOrchestrator {

    private final DistributorProfileService profileService;
    private final DistributorLevelService levelService;
    private final DistributorPricePolicyService pricePolicyService;

    // ==================== 分销商档案 ====================

    public List<DistributorProfile> listProfiles(String keyword, String level, String status) {
        Long tenantId = UserContext.tenantId();
        return profileService.listByTenant(tenantId, keyword, level, status);
    }

    public DistributorProfile getProfile(Long id) {
        Long tenantId = UserContext.tenantId();
        return profileService.getByIdAndTenant(tenantId, id);
    }

    /** 新建分销商档案（同时更新 customer_type） */
    @Transactional(rollbackFor = Exception.class)
    public DistributorProfile createProfile(DistributorProfile profile) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        profile.setTenantId(tenantId);
        // 自动生成分销商编号
        if (profile.getDistributorNo() == null || profile.getDistributorNo().isBlank()) {
            profile.setDistributorNo("DS" + System.currentTimeMillis());
        }
        if (profileService.existsByNo(tenantId, profile.getDistributorNo())) {
            throw new IllegalArgumentException("分销商编号已存在：" + profile.getDistributorNo());
        }
        // 默认值
        if (profile.getStatus() == null) profile.setStatus("ACTIVE");
        if (profile.getSettlementCycle() == null) profile.setSettlementCycle("CASH");
        if (profile.getCreditLimit() == null) profile.setCreditLimit(BigDecimal.ZERO);
        if (profile.getUsedCredit() == null) profile.setUsedCredit(BigDecimal.ZERO);
        profile.setDeleteFlag(0);
        profile.setCreatorId(UserContext.userId());
        profile.setCreatorName(UserContext.username());
        profileService.save(profile);
        log.info("[Distributor] 新建分销商 tenantId={} id={} no={} name={}",
                tenantId, profile.getId(), profile.getDistributorNo(), profile.getDistributorName());
        return profile;
    }

    /** 更新分销商档案 */
    @Transactional(rollbackFor = Exception.class)
    public DistributorProfile updateProfile(DistributorProfile profile) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        DistributorProfile existing = profileService.getByIdAndTenant(tenantId, profile.getId());
        if (existing == null) {
            throw new IllegalArgumentException("分销商不存在或已删除");
        }
        // 不允许直接修改 used_credit（只能通过订单流转）
        profile.setUsedCredit(existing.getUsedCredit());
        profile.setTenantId(tenantId);
        profileService.updateById(profile);
        return profile;
    }

    /** 删除分销商（软删除） */
    @Transactional(rollbackFor = Exception.class)
    public void deleteProfile(Long id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        DistributorProfile existing = profileService.getByIdAndTenant(tenantId, id);
        if (existing == null) return;
        existing.setDeleteFlag(1);
        profileService.updateById(existing);
    }

    /** 冻结/解冻分销商 */
    @Transactional(rollbackFor = Exception.class)
    public void changeStatus(Long id, String status) {
        TenantAssert.assertTenantContext();
        if (!"ACTIVE".equals(status) && !"INACTIVE".equals(status) && !"FROZEN".equals(status)) {
            throw new IllegalArgumentException("状态不合法：ACTIVE/INACTIVE/FROZEN");
        }
        Long tenantId = UserContext.tenantId();
        DistributorProfile existing = profileService.getByIdAndTenant(tenantId, id);
        if (existing == null) throw new IllegalArgumentException("分销商不存在");
        existing.setStatus(status);
        profileService.updateById(existing);
    }

    // ==================== 分销商等级 ====================

    public List<DistributorLevel> listLevels() {
        Long tenantId = UserContext.tenantId();
        return levelService.listEnabled(tenantId);
    }

    @Transactional(rollbackFor = Exception.class)
    public DistributorLevel createLevel(DistributorLevel level) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        level.setTenantId(tenantId);
        if (level.getLevelCode() == null || level.getLevelCode().isBlank()) {
            throw new IllegalArgumentException("等级编码不能为空");
        }
        if (levelService.existsByCode(tenantId, level.getLevelCode())) {
            throw new IllegalArgumentException("等级编码已存在：" + level.getLevelCode());
        }
        if (level.getDefaultDiscount() == null) level.setDefaultDiscount(new BigDecimal("100.00"));
        if (level.getMinPurchaseAmount() == null) level.setMinPurchaseAmount(BigDecimal.ZERO);
        if (level.getSortOrder() == null) level.setSortOrder(0);
        if (level.getEnabled() == null) level.setEnabled(1);
        level.setDeleteFlag(0);
        levelService.save(level);
        return level;
    }

    @Transactional(rollbackFor = Exception.class)
    public DistributorLevel updateLevel(DistributorLevel level) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        level.setTenantId(tenantId);
        levelService.updateById(level);
        return level;
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteLevel(Long id) {
        TenantAssert.assertTenantContext();
        DistributorLevel level = levelService.getById(id);
        if (level == null) return;
        if (!level.getTenantId().equals(UserContext.tenantId())) {
            throw new IllegalArgumentException("无权操作");
        }
        level.setDeleteFlag(1);
        levelService.updateById(level);
    }

    // ==================== 价格政策 ====================

    public List<DistributorPricePolicy> listPolicies(String level, String skuCode, String policyType) {
        Long tenantId = UserContext.tenantId();
        return pricePolicyService.listByTenant(tenantId, level, skuCode, policyType);
    }

    @Transactional(rollbackFor = Exception.class)
    public DistributorPricePolicy createPolicy(DistributorPricePolicy policy) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        policy.setTenantId(tenantId);
        if (policy.getPolicyName() == null || policy.getPolicyName().isBlank()) {
            throw new IllegalArgumentException("策略名称不能为空");
        }
        if (policy.getPolicyType() == null) {
            throw new IllegalArgumentException("策略类型不能为空：FIXED/DISCOUNT/TIERED");
        }
        if (policy.getEnabled() == null) policy.setEnabled(1);
        policy.setDeleteFlag(0);
        pricePolicyService.save(policy);
        return policy;
    }

    @Transactional(rollbackFor = Exception.class)
    public DistributorPricePolicy updatePolicy(DistributorPricePolicy policy) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        policy.setTenantId(tenantId);
        pricePolicyService.updateById(policy);
        return policy;
    }

    @Transactional(rollbackFor = Exception.class)
    public void deletePolicy(Long id) {
        TenantAssert.assertTenantContext();
        DistributorPricePolicy policy = pricePolicyService.getById(id);
        if (policy == null) return;
        if (!policy.getTenantId().equals(UserContext.tenantId())) {
            throw new IllegalArgumentException("无权操作");
        }
        policy.setDeleteFlag(1);
        pricePolicyService.updateById(policy);
    }

    /**
     * 查询供货价（B2B 下单时调用）
     * @param distributorId 分销商ID
     * @param skuCode       SKU编码
     * @param quantity      数量
     * @return 供货价，未匹配返回 null
     */
    public BigDecimal querySupplyPrice(Long distributorId, String skuCode, Integer quantity) {
        Long tenantId = UserContext.tenantId();
        DistributorProfile d = profileService.getByIdAndTenant(tenantId, distributorId);
        if (d == null) return null;
        return pricePolicyService.calcSupplyPrice(tenantId, d.getDistributorLevel(), skuCode, quantity);
    }
}
