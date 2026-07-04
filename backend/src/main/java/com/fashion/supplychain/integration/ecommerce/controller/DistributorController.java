package com.fashion.supplychain.integration.ecommerce.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorLevel;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorPricePolicy;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorProfile;
import com.fashion.supplychain.integration.ecommerce.orchestration.DistributorOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

/**
 * 分销商管理 Controller（Phase 4）
 * 路径前缀：/api/ecommerce/distributor
 */
@Slf4j
@RestController
@RequestMapping("/api/ecommerce/distributor")
@RequiredArgsConstructor
public class DistributorController {

    private final DistributorOrchestrator distributorOrchestrator;

    // ==================== 分销商档案 ====================

    @GetMapping("/profiles")
    public Result<List<DistributorProfile>> listProfiles(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String status) {
        return Result.success(distributorOrchestrator.listProfiles(keyword, level, status));
    }

    @GetMapping("/profiles/{id}")
    public Result<DistributorProfile> getProfile(@PathVariable Long id) {
        return Result.success(distributorOrchestrator.getProfile(id));
    }

    @PostMapping("/profiles")
    public Result<DistributorProfile> createProfile(@RequestBody DistributorProfile profile) {
        try {
            return Result.success(distributorOrchestrator.createProfile(profile));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @PutMapping("/profiles/{id}")
    public Result<DistributorProfile> updateProfile(@PathVariable Long id, @RequestBody DistributorProfile profile) {
        try {
            profile.setId(id);
            return Result.success(distributorOrchestrator.updateProfile(profile));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @DeleteMapping("/profiles/{id}")
    public Result<Void> deleteProfile(@PathVariable Long id) {
        try {
            distributorOrchestrator.deleteProfile(id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @PostMapping("/profiles/{id}/status")
    public Result<Void> changeStatus(@PathVariable Long id, @RequestParam String status) {
        try {
            distributorOrchestrator.changeStatus(id, status);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    // ==================== 分销商等级 ====================

    @GetMapping("/levels")
    public Result<List<DistributorLevel>> listLevels() {
        return Result.success(distributorOrchestrator.listLevels());
    }

    @PostMapping("/levels")
    public Result<DistributorLevel> createLevel(@RequestBody DistributorLevel level) {
        try {
            return Result.success(distributorOrchestrator.createLevel(level));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @PutMapping("/levels/{id}")
    public Result<DistributorLevel> updateLevel(@PathVariable Long id, @RequestBody DistributorLevel level) {
        try {
            level.setId(id);
            return Result.success(distributorOrchestrator.updateLevel(level));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @DeleteMapping("/levels/{id}")
    public Result<Void> deleteLevel(@PathVariable Long id) {
        try {
            distributorOrchestrator.deleteLevel(id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    // ==================== 价格政策 ====================

    @GetMapping("/policies")
    public Result<List<DistributorPricePolicy>> listPolicies(
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String skuCode,
            @RequestParam(required = false) String policyType) {
        return Result.success(distributorOrchestrator.listPolicies(level, skuCode, policyType));
    }

    @PostMapping("/policies")
    public Result<DistributorPricePolicy> createPolicy(@RequestBody DistributorPricePolicy policy) {
        try {
            return Result.success(distributorOrchestrator.createPolicy(policy));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @PutMapping("/policies/{id}")
    public Result<DistributorPricePolicy> updatePolicy(@PathVariable Long id, @RequestBody DistributorPricePolicy policy) {
        try {
            policy.setId(id);
            return Result.success(distributorOrchestrator.updatePolicy(policy));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @DeleteMapping("/policies/{id}")
    public Result<Void> deletePolicy(@PathVariable Long id) {
        try {
            distributorOrchestrator.deletePolicy(id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 查询供货价（B2B 下单时调用） */
    @GetMapping("/supply-price")
    public Result<BigDecimal> querySupplyPrice(
            @RequestParam Long distributorId,
            @RequestParam String skuCode,
            @RequestParam Integer quantity) {
        return Result.success(distributorOrchestrator.querySupplyPrice(distributorId, skuCode, quantity));
    }
}
