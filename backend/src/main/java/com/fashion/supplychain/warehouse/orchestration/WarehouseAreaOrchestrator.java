package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.warehouse.entity.WarehouseArea;
import com.fashion.supplychain.warehouse.entity.WarehouseLocation;
import com.fashion.supplychain.warehouse.service.WarehouseAreaService;
import com.fashion.supplychain.warehouse.service.WarehouseLocationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class WarehouseAreaOrchestrator {

    private final WarehouseAreaService areaService;
    private final WarehouseLocationService locationService;

    private static final Map<String, String> WAREHOUSE_TYPE_LABELS = Map.of(
            "FINISHED", "成品仓",
            "MATERIAL", "物料仓",
            "SAMPLE", "样衣仓"
    );

    public Result<Page<WarehouseArea>> list(int page, int pageSize, String warehouseType,
                                              String status, String keyword) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<WarehouseArea> qw = new LambdaQueryWrapper<>();
        qw.eq(WarehouseArea::getTenantId, tenantId);
        qw.eq(WarehouseArea::getDeleteFlag, 0);

        if (StringUtils.isNotBlank(warehouseType)) {
            qw.eq(WarehouseArea::getWarehouseType, warehouseType);
        }
        if (StringUtils.isNotBlank(status)) {
            qw.eq(WarehouseArea::getStatus, status);
        }
        if (StringUtils.isNotBlank(keyword)) {
            qw.and(w -> w.like(WarehouseArea::getAreaCode, keyword)
                    .or().like(WarehouseArea::getAreaName, keyword)
                    .or().like(WarehouseArea::getAddress, keyword));
        }
        qw.orderByAsc(WarehouseArea::getWarehouseType, WarehouseArea::getSortOrder, WarehouseArea::getAreaCode);

        Page<WarehouseArea> result = areaService.page(new Page<>(page, pageSize), qw);
        return Result.success(result);
    }

    public Result<List<WarehouseArea>> listByType(String warehouseType) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<WarehouseArea> list = areaService.list(new LambdaQueryWrapper<WarehouseArea>()
                .eq(WarehouseArea::getTenantId, tenantId)
                .eq(WarehouseArea::getDeleteFlag, 0)
                .eq(WarehouseArea::getStatus, "ACTIVE")
                .eq(StringUtils.isNotBlank(warehouseType), WarehouseArea::getWarehouseType, warehouseType)
                .orderByAsc(WarehouseArea::getSortOrder, WarehouseArea::getAreaCode));
        return Result.success(list);
    }

    public Result<WarehouseArea> create(WarehouseArea area) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (StringUtils.isBlank(area.getAreaCode())) {
            return Result.fail("区域编码不能为空");
        }
        if (StringUtils.isBlank(area.getAreaName())) {
            return Result.fail("区域名称不能为空");
        }
        if (StringUtils.isBlank(area.getWarehouseType())) {
            return Result.fail("仓库类型不能为空");
        }
        if (!WAREHOUSE_TYPE_LABELS.containsKey(area.getWarehouseType())) {
            return Result.fail("不支持的仓库类型: " + area.getWarehouseType());
        }

        long exists = areaService.count(new LambdaQueryWrapper<WarehouseArea>()
                .eq(WarehouseArea::getTenantId, tenantId)
                .eq(WarehouseArea::getAreaCode, area.getAreaCode())
                .eq(WarehouseArea::getDeleteFlag, 0));
        if (exists > 0) {
            return Result.fail("区域编码已存在: " + area.getAreaCode());
        }

        area.setTenantId(tenantId);
        area.setDeleteFlag(0);
        area.setStatus(StringUtils.isBlank(area.getStatus()) ? "ACTIVE" : area.getStatus());
        area.setSortOrder(area.getSortOrder() != null ? area.getSortOrder() : 0);
        area.setCreateTime(LocalDateTime.now());
        areaService.save(area);

        log.info("[仓库区域] 创建: code={}, name={}, type={}, tenantId={}",
                area.getAreaCode(), area.getAreaName(), area.getWarehouseType(), tenantId);
        return Result.success(area);
    }

    public Result<WarehouseArea> update(String id, WarehouseArea area) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        WarehouseArea existing = areaService.lambdaQuery()
                .eq(WarehouseArea::getId, id)
                .eq(WarehouseArea::getTenantId, tenantId)
                .eq(WarehouseArea::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            return Result.fail("仓库区域不存在");
        }

        if (StringUtils.isNotBlank(area.getWarehouseType())
                && !WAREHOUSE_TYPE_LABELS.containsKey(area.getWarehouseType())) {
            return Result.fail("不支持的仓库类型: " + area.getWarehouseType());
        }

        area.setId(id);
        area.setTenantId(tenantId);
        area.setUpdateTime(LocalDateTime.now());
        areaService.updateById(area);

        log.info("[仓库区域] 更新: id={}, code={}", id, existing.getAreaCode());
        return Result.success(area);
    }

    public Result<Void> delete(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        WarehouseArea existing = areaService.lambdaQuery()
                .eq(WarehouseArea::getId, id)
                .eq(WarehouseArea::getTenantId, tenantId)
                .eq(WarehouseArea::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            return Result.fail("仓库区域不存在");
        }

        long locationCount = locationService.count(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getAreaId, id)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .eq(WarehouseLocation::getStatus, "ACTIVE"));
        if (locationCount > 0) {
            return Result.fail("该仓库区域下有 " + locationCount + " 个活跃库位，无法删除");
        }

        existing.setDeleteFlag(1);
        existing.setUpdateTime(LocalDateTime.now());
        areaService.updateById(existing);

        log.info("[仓库区域] 删除: id={}, code={}", id, existing.getAreaCode());
        return Result.success(null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<WarehouseArea> quickCreate(String areaName, String warehouseType) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (StringUtils.isBlank(areaName)) {
            return Result.fail("区域名称不能为空");
        }
        if (StringUtils.isBlank(warehouseType) || !WAREHOUSE_TYPE_LABELS.containsKey(warehouseType)) {
            return Result.fail("仓库类型无效");
        }

        String typePrefix = switch (warehouseType) {
            case "FINISHED" -> "CP";
            case "MATERIAL" -> "WL";
            case "SAMPLE" -> "YY";
            default -> "WH";
        };

        long sameTypeCount = areaService.count(new LambdaQueryWrapper<WarehouseArea>()
                .eq(WarehouseArea::getTenantId, tenantId)
                .eq(WarehouseArea::getWarehouseType, warehouseType)
                .eq(WarehouseArea::getDeleteFlag, 0));

        String areaCode = typePrefix + "-" + String.format("%03d", sameTypeCount + 1);

        WarehouseArea area = new WarehouseArea();
        area.setAreaCode(areaCode);
        area.setAreaName(areaName);
        area.setWarehouseType(warehouseType);
        area.setStatus("ACTIVE");
        area.setSortOrder((int) sameTypeCount + 1);
        area.setTenantId(tenantId);
        area.setDeleteFlag(0);
        area.setCreateTime(LocalDateTime.now());
        areaService.save(area);

        log.info("[仓库区域] 快速创建: code={}, name={}, type={}", areaCode, areaName, warehouseType);
        return Result.success(area);
    }

    public Result<Map<String, Object>> getAreaDetail(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        WarehouseArea area = areaService.lambdaQuery()
                .eq(WarehouseArea::getId, id)
                .eq(WarehouseArea::getTenantId, tenantId)
                .eq(WarehouseArea::getDeleteFlag, 0)
                .one();
        if (area == null) {
            return Result.fail("仓库区域不存在");
        }

        long totalLocations = locationService.count(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getAreaId, id)
                .eq(WarehouseLocation::getDeleteFlag, 0));

        long activeLocations = locationService.count(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getAreaId, id)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .eq(WarehouseLocation::getStatus, "ACTIVE"));

        List<String> zones = locationService.list(new LambdaQueryWrapper<WarehouseLocation>()
                        .eq(WarehouseLocation::getTenantId, tenantId)
                        .eq(WarehouseLocation::getAreaId, id)
                        .eq(WarehouseLocation::getDeleteFlag, 0)
                        .select(WarehouseLocation::getZoneName))
                .stream()
                .map(WarehouseLocation::getZoneName)
                .filter(StringUtils::isNotBlank)
                .distinct()
                .sorted()
                .collect(Collectors.toList());

        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("id", area.getId());
        detail.put("areaCode", area.getAreaCode());
        detail.put("areaName", area.getAreaName());
        detail.put("warehouseType", area.getWarehouseType());
        detail.put("warehouseTypeLabel", WAREHOUSE_TYPE_LABELS.getOrDefault(area.getWarehouseType(), ""));
        detail.put("address", area.getAddress());
        detail.put("contactPerson", area.getContactPerson());
        detail.put("contactPhone", area.getContactPhone());
        detail.put("managerName", area.getManagerName());
        detail.put("status", area.getStatus());
        detail.put("description", area.getDescription());
        detail.put("totalLocations", totalLocations);
        detail.put("activeLocations", activeLocations);
        detail.put("zones", zones);
        return Result.success(detail);
    }

    public Result<Map<String, Object>> getAreaOverview() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> overview = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : WAREHOUSE_TYPE_LABELS.entrySet()) {
            String type = entry.getKey();
            String label = entry.getValue();

            List<WarehouseArea> areas = areaService.list(new LambdaQueryWrapper<WarehouseArea>()
                    .eq(WarehouseArea::getTenantId, tenantId)
                    .eq(WarehouseArea::getWarehouseType, type)
                    .eq(WarehouseArea::getDeleteFlag, 0)
                    .orderByAsc(WarehouseArea::getSortOrder, WarehouseArea::getAreaCode));

            List<Map<String, Object>> areaList = new ArrayList<>();
            for (WarehouseArea area : areas) {
                long locCount = locationService.count(new LambdaQueryWrapper<WarehouseLocation>()
                        .eq(WarehouseLocation::getTenantId, tenantId)
                        .eq(WarehouseLocation::getAreaId, area.getId())
                        .eq(WarehouseLocation::getDeleteFlag, 0));

                Map<String, Object> areaInfo = new LinkedHashMap<>();
                areaInfo.put("id", area.getId());
                areaInfo.put("areaCode", area.getAreaCode());
                areaInfo.put("areaName", area.getAreaName());
                areaInfo.put("status", area.getStatus());
                areaInfo.put("locationCount", locCount);
                areaList.add(areaInfo);
            }

            Map<String, Object> typeInfo = new LinkedHashMap<>();
            typeInfo.put("type", type);
            typeInfo.put("label", label);
            typeInfo.put("areaCount", areas.size());
            typeInfo.put("areas", areaList);
            overview.put(type, typeInfo);
        }
        return Result.success(overview);
    }
}
