package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.warehouse.entity.WarehouseLocation;
import com.fashion.supplychain.warehouse.entity.WarehouseArea;
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
public class WarehouseLocationOrchestrator {

    private final WarehouseLocationService locationService;
    private final WarehouseAreaService warehouseAreaService;
    private final ProductSkuService productSkuService;
    private final ProductWarehousingMapper productWarehousingMapper;

    private static final Map<String, String> WAREHOUSE_TYPE_LABELS = Map.of(
            "FINISHED", "成品仓",
            "MATERIAL", "物料仓",
            "SAMPLE", "样衣仓"
    );

    private static final Map<String, List<String>> DEFAULT_ZONES = Map.of(
            "FINISHED", List.of("A区-合格品", "B区-待检品", "C区-次品区", "D区-退货区"),
            "MATERIAL", List.of("A区-面料仓", "B区-辅料仓", "C区-待检区", "D区-退货区"),
            "SAMPLE", List.of("A区-样衣展示", "B区-样衣库存", "C区-客供样")
    );

    public Result<Page<WarehouseLocation>> list(int page, int pageSize, String locationType,
                                                 String warehouseType, String areaId,
                                                 String status, String keyword) {
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
        if (StringUtils.isNotBlank(areaId)) {
            qw.eq(WarehouseLocation::getAreaId, areaId);
        }
        if (StringUtils.isNotBlank(status)) {
            qw.eq(WarehouseLocation::getStatus, status);
        }
        if (StringUtils.isNotBlank(keyword)) {
            qw.and(w -> w.like(WarehouseLocation::getLocationCode, keyword)
                    .or().like(WarehouseLocation::getLocationName, keyword)
                    .or().like(WarehouseLocation::getZoneName, keyword));
        }
        qw.orderByAsc(WarehouseLocation::getWarehouseType, WarehouseLocation::getLocationCode);

        Page<WarehouseLocation> result = locationService.page(new Page<>(page, pageSize), qw);
        return Result.success(result);
    }

    public Result<List<WarehouseLocation>> listByType(String warehouseType, String areaId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<WarehouseLocation> list = locationService.list(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .eq(WarehouseLocation::getStatus, "ACTIVE")
                .eq(StringUtils.isNotBlank(warehouseType), WarehouseLocation::getWarehouseType, warehouseType)
                .eq(StringUtils.isNotBlank(areaId), WarehouseLocation::getAreaId, areaId)
                .orderByAsc(WarehouseLocation::getLocationCode)
                .last("LIMIT 5000"));
        return Result.success(list);
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
                .eq(WarehouseLocation::getWarehouseType, location.getWarehouseType())
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

        log.info("[库位] 创建库位: code={}, type={}, tenantId={}",
                location.getLocationCode(), location.getWarehouseType(), tenantId);
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

    @Transactional(rollbackFor = Exception.class)
    public Result<Map<String, Object>> batchInit(String warehouseType, String areaId,
                                                   List<String> zoneNames,
                                                   int racksPerZone, int levelsPerRack, int positionsPerLevel) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (!WAREHOUSE_TYPE_LABELS.containsKey(warehouseType)) {
            return Result.fail("不支持的仓库类型: " + warehouseType);
        }

        String resolvedAreaId = areaId;
        if (StringUtils.isNotBlank(resolvedAreaId)) {
            WarehouseArea area = warehouseAreaService.lambdaQuery()
                    .eq(WarehouseArea::getId, resolvedAreaId)
                    .eq(WarehouseArea::getTenantId, tenantId)
                    .eq(WarehouseArea::getDeleteFlag, 0)
                    .one();
            if (area == null) {
                return Result.fail("仓库区域不存在: " + resolvedAreaId);
            }
        }

        List<String> zones = zoneNames != null && !zoneNames.isEmpty()
                ? zoneNames : DEFAULT_ZONES.getOrDefault(warehouseType, List.of("A区"));

        int created = 0;
        int skipped = 0;

        for (int zi = 0; zi < zones.size(); zi++) {
            String zoneName = zones.get(zi);
            String zoneCode = String.valueOf((char) ('A' + zi));

            for (int ri = 1; ri <= racksPerZone; ri++) {
                String rackCode = String.format("%s-%02d", zoneCode, ri);

                for (int li = 1; li <= levelsPerRack; li++) {
                    for (int pi = 1; pi <= positionsPerLevel; pi++) {
                        String locationCode = String.format("%s-%02d-%d-%d", zoneCode, ri, li, pi);
                        String locationName = String.format("%s %d架%d层%d位", zoneName, ri, li, pi);

                        long exists = locationService.count(new LambdaQueryWrapper<WarehouseLocation>()
                                .eq(WarehouseLocation::getTenantId, tenantId)
                                .eq(WarehouseLocation::getLocationCode, locationCode)
                                .eq(WarehouseLocation::getWarehouseType, warehouseType)
                                .eq(WarehouseLocation::getDeleteFlag, 0));

                        if (exists > 0) {
                            skipped++;
                            continue;
                        }

                        WarehouseLocation loc = new WarehouseLocation();
                        loc.setLocationCode(locationCode);
                        loc.setLocationName(locationName);
                        loc.setZoneCode(zoneCode);
                        loc.setZoneName(zoneName);
                        loc.setAisleCode(zoneCode);
                        loc.setRackCode(rackCode);
                        loc.setLevelCode(String.valueOf(li));
                        loc.setPositionCode(String.valueOf(pi));
                        loc.setLocationType("STORAGE");
                        loc.setWarehouseType(warehouseType);
                        loc.setAreaId(resolvedAreaId);
                        loc.setCapacity(100);
                        loc.setUsedCapacity(0);
                        loc.setStatus("ACTIVE");
                        loc.setTenantId(tenantId);
                        loc.setDeleteFlag(0);
                        loc.setCreateTime(LocalDateTime.now());
                        locationService.save(loc);
                        created++;
                    }
                }
            }
        }

        log.info("[库位] 批量初始化: type={}, 新建={}, 跳过={}", warehouseType, created, skipped);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("warehouseType", warehouseType);
        result.put("warehouseTypeLabel", WAREHOUSE_TYPE_LABELS.get(warehouseType));
        result.put("created", created);
        result.put("skipped", skipped);
        return Result.success(result);
    }

    public Result<Map<String, Object>> queryLocationItems(String locationCode, String warehouseType) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        WarehouseLocation location = locationService.getOne(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getLocationCode, locationCode)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .eq(StringUtils.isNotBlank(warehouseType), WarehouseLocation::getWarehouseType, warehouseType)
                .last("LIMIT 1"));

        if (location == null) {
            return Result.fail("库位不存在: " + locationCode);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("locationCode", location.getLocationCode());
        result.put("locationName", location.getLocationName());
        result.put("zoneName", location.getZoneName());
        result.put("warehouseType", location.getWarehouseType());
        result.put("warehouseTypeLabel", WAREHOUSE_TYPE_LABELS.getOrDefault(location.getWarehouseType(), ""));
        result.put("capacity", location.getCapacity());
        result.put("usedCapacity", location.getUsedCapacity());

        List<Map<String, Object>> items = new ArrayList<>();

        if ("FINISHED".equals(location.getWarehouseType())) {
            List<ProductSku> skus = productSkuService.list(new LambdaQueryWrapper<ProductSku>()
                    .eq(ProductSku::getTenantId, tenantId)
                    .eq(ProductSku::getStatus, "ENABLED")
                    .gt(ProductSku::getStockQuantity, 0));
            for (ProductSku sku : skus) {
                long warehousedInLocation = productWarehousingMapper.selectCount(
                        new LambdaQueryWrapper<ProductWarehousing>()
                                .eq(ProductWarehousing::getTenantId, tenantId)
                                .eq(ProductWarehousing::getWarehouse, locationCode)
                                .eq(ProductWarehousing::getSkuCode, sku.getSkuCode())
                                .eq(ProductWarehousing::getDeleteFlag, 0));
                if (warehousedInLocation > 0) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("skuCode", sku.getSkuCode());
                    item.put("styleNo", sku.getStyleNo());
                    item.put("color", sku.getColor());
                    item.put("size", sku.getSize());
                    item.put("stockQuantity", sku.getStockQuantity());
                    item.put("salesPrice", sku.getSalesPrice());
                    items.add(item);
                }
            }
        }

        result.put("items", items);
        result.put("itemCount", items.size());
        return Result.success(result);
    }

    public Result<Map<String, Object>> getWarehouseOverview() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> overview = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : WAREHOUSE_TYPE_LABELS.entrySet()) {
            String type = entry.getKey();
            String label = entry.getValue();

            long totalLocations = locationService.count(new LambdaQueryWrapper<WarehouseLocation>()
                    .eq(WarehouseLocation::getTenantId, tenantId)
                    .eq(WarehouseLocation::getWarehouseType, type)
                    .eq(WarehouseLocation::getDeleteFlag, 0));

            long activeLocations = locationService.count(new LambdaQueryWrapper<WarehouseLocation>()
                    .eq(WarehouseLocation::getTenantId, tenantId)
                    .eq(WarehouseLocation::getWarehouseType, type)
                    .eq(WarehouseLocation::getStatus, "ACTIVE")
                    .eq(WarehouseLocation::getDeleteFlag, 0));

            long usedLocations = locationService.count(new LambdaQueryWrapper<WarehouseLocation>()
                    .eq(WarehouseLocation::getTenantId, tenantId)
                    .eq(WarehouseLocation::getWarehouseType, type)
                    .gt(WarehouseLocation::getUsedCapacity, 0)
                    .eq(WarehouseLocation::getDeleteFlag, 0));

            List<String> zones = locationService.list(new LambdaQueryWrapper<WarehouseLocation>()
                            .eq(WarehouseLocation::getTenantId, tenantId)
                            .eq(WarehouseLocation::getWarehouseType, type)
                            .eq(WarehouseLocation::getDeleteFlag, 0)
                            .select(WarehouseLocation::getZoneName))
                    .stream()
                    .map(WarehouseLocation::getZoneName)
                    .filter(StringUtils::isNotBlank)
                    .distinct()
                    .sorted()
                    .collect(Collectors.toList());

            Map<String, Object> typeInfo = new LinkedHashMap<>();
            typeInfo.put("type", type);
            typeInfo.put("label", label);
            typeInfo.put("totalLocations", totalLocations);
            typeInfo.put("activeLocations", activeLocations);
            typeInfo.put("usedLocations", usedLocations);
            typeInfo.put("zones", zones);
            overview.put(type, typeInfo);
        }
        return Result.success(overview);
    }
}
