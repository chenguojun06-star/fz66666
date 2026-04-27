package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.warehouse.entity.WarehouseLocation;
import com.fashion.supplychain.warehouse.service.WarehouseLocationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class WarehouseLocationOrchestrator {

    private final WarehouseLocationService locationService;

    public Result<Page<WarehouseLocation>> list(int page, int pageSize, String locationType,
                                                 String warehouseType, String status, String keyword) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<WarehouseLocation> qw = new LambdaQueryWrapper<>();
        qw.eq(WarehouseLocation::getTenantId, tenantId);
        qw.eq(WarehouseLocation::getDeleteFlag, 0);

        if (StringUtils.isNotBlank(locationType)) {
            qw.eq(WarehouseLocation::getLocationType, locationType);
        }
        if (StringUtils.isNotBlank(warehouseType)) {
            qw.eq(WarehouseLocation::getWarehouseType, warehouseType);
        }
        if (StringUtils.isNotBlank(status)) {
            qw.eq(WarehouseLocation::getStatus, status);
        }
        if (StringUtils.isNotBlank(keyword)) {
            qw.and(w -> w.like(WarehouseLocation::getLocationCode, keyword)
                    .or().like(WarehouseLocation::getLocationName, keyword)
                    .or().like(WarehouseLocation::getZoneName, keyword));
        }
        qw.orderByAsc(WarehouseLocation::getLocationCode);

        Page<WarehouseLocation> result = locationService.page(new Page<>(page, pageSize), qw);
        return Result.success(result);
    }

    public Result<WarehouseLocation> create(WarehouseLocation location) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (StringUtils.isBlank(location.getLocationCode())) {
            return Result.fail("库位编码不能为空");
        }

        long exists = locationService.count(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getLocationCode, location.getLocationCode())
                .eq(WarehouseLocation::getDeleteFlag, 0));
        if (exists > 0) {
            return Result.fail("库位编码已存在: " + location.getLocationCode());
        }

        location.setTenantId(tenantId);
        location.setDeleteFlag(0);
        location.setStatus(StringUtils.isBlank(location.getStatus()) ? "ACTIVE" : location.getStatus());
        location.setUsedCapacity(0);
        location.setCreateTime(LocalDateTime.now());
        locationService.save(location);

        log.info("[库位] 创建库位: code={}, name={}, tenantId={}",
                location.getLocationCode(), location.getLocationName(), tenantId);
        return Result.success(location);
    }

    public Result<WarehouseLocation> update(String id, WarehouseLocation location) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        WarehouseLocation existing = locationService.lambdaQuery()
                .eq(WarehouseLocation::getId, id)
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            return Result.fail("库位不存在");
        }

        location.setId(id);
        location.setTenantId(tenantId);
        location.setUpdateTime(LocalDateTime.now());
        locationService.updateById(location);

        log.info("[库位] 更新库位: id={}, code={}", id, existing.getLocationCode());
        return Result.success(location);
    }

    public Result<Void> delete(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        WarehouseLocation existing = locationService.lambdaQuery()
                .eq(WarehouseLocation::getId, id)
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            return Result.fail("库位不存在");
        }

        if (existing.getUsedCapacity() != null && existing.getUsedCapacity() > 0) {
            return Result.fail("库位正在使用中，无法删除");
        }

        existing.setDeleteFlag(1);
        existing.setUpdateTime(LocalDateTime.now());
        locationService.updateById(existing);

        log.info("[库位] 删除库位: id={}, code={}", id, existing.getLocationCode());
        return Result.success(null);
    }

    public Result<List<WarehouseLocation>> listByType(String warehouseType) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<WarehouseLocation> list = locationService.list(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .eq(WarehouseLocation::getStatus, "ACTIVE")
                .eq(StringUtils.isNotBlank(warehouseType), WarehouseLocation::getWarehouseType, warehouseType)
                .orderByAsc(WarehouseLocation::getLocationCode)
                .last("LIMIT 5000"));
        return Result.success(list);
    }
}
