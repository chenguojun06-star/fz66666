package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
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
    private final OperationLogService operationLogService;

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

        if (list.isEmpty()) {
            return Result.success(list);
        }

        // 优化：一次性查询所有库位的库存数据，避免 N+1 查询问题
        Set<String> warehouseIdentifiers = new HashSet<>();
        for (WarehouseLocation loc : list) {
            if (StringUtils.isNotBlank(loc.getLocationCode())) {
                warehouseIdentifiers.add(loc.getLocationCode());
            }
            if (StringUtils.isNotBlank(loc.getLocationName())) {
                warehouseIdentifiers.add(loc.getLocationName());
            }
        }

        // 查询所有相关的入库记录，按 warehouse 字段分组统计数量
        List<ProductWarehousing> allRecords = productWarehousingMapper.selectList(
                new LambdaQueryWrapper<ProductWarehousing>()
                        .eq(ProductWarehousing::getTenantId, tenantId)
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .in(ProductWarehousing::getWarehouse, warehouseIdentifiers)
        );

        // 构建统计 map：warehouse -> count
        Map<String, Integer> warehouseCountMap = new HashMap<>();
        for (ProductWarehousing record : allRecords) {
            String warehouse = record.getWarehouse();
            if (StringUtils.isNotBlank(warehouse)) {
                warehouseCountMap.put(warehouse, warehouseCountMap.getOrDefault(warehouse, 0) + 1);
            }
        }

        // 更新每个库位的 usedCapacity
        for (WarehouseLocation loc : list) {
            int actualCount = 0;
            if (StringUtils.isNotBlank(loc.getLocationCode())) {
                actualCount += warehouseCountMap.getOrDefault(loc.getLocationCode(), 0);
            }
            if (StringUtils.isNotBlank(loc.getLocationName())) {
                actualCount += warehouseCountMap.getOrDefault(loc.getLocationName(), 0);
            }
            if (loc.getUsedCapacity() == null || loc.getUsedCapacity() != actualCount) {
                loc.setUsedCapacity(actualCount);
            }
        }

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

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> delete(String id, String reason) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (StringUtils.isBlank(reason)) {
            return Result.fail("删除原因不能为空");
        }

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

        String locationCode = existing.getLocationCode();
        String locationName = existing.getLocationName();
        String warehouseType = existing.getWarehouseType();

        locationService.removeById(id);

        OperationLog opLog = new OperationLog();
        opLog.setModule("仓库管理");
        opLog.setOperation("删除库位");
        opLog.setOperatorId(parseLongSafe(UserContext.userId()));
        opLog.setOperatorName(UserContext.username());
        opLog.setTargetType("WarehouseLocation");
        opLog.setTargetId(id);
        opLog.setTargetName(locationCode);
        opLog.setReason(reason);
        opLog.setDetails(String.format("库位编码=%s, 名称=%s, 仓库类型=%s", locationCode, locationName, warehouseType));
        opLog.setOperationTime(LocalDateTime.now());
        opLog.setStatus("success");
        opLog.setTenantId(tenantId);
        operationLogService.save(opLog);

        log.info("[库位] 硬删除库位: id={}, code={}, reason={}", id, locationCode, reason);
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

        long actualCount = productWarehousingMapper.selectCount(new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getTenantId, tenantId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .and(w -> w.eq(ProductWarehousing::getWarehouse, locationCode)
                        .or().eq(ProductWarehousing::getWarehouse, location.getLocationName())));
        result.put("actualUsedCapacity", actualCount);

        List<Map<String, Object>> items = new ArrayList<>();

        if ("FINISHED".equals(location.getWarehouseType())) {
            List<ProductWarehousing> records = productWarehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getTenantId, tenantId)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .and(w -> w.eq(ProductWarehousing::getWarehouse, locationCode)
                                    .or().eq(ProductWarehousing::getWarehouse, location.getLocationName())));

            Map<String, List<ProductWarehousing>> byKey = new LinkedHashMap<>();
            for (ProductWarehousing r : records) {
                String key = StringUtils.isNotBlank(r.getSkuCode()) ? r.getSkuCode() : r.getStyleNo();
                if (StringUtils.isBlank(key)) continue;
                byKey.computeIfAbsent(key, k -> new ArrayList<>()).add(r);
            }

            for (Map.Entry<String, List<ProductWarehousing>> entry : byKey.entrySet()) {
                String key = entry.getKey();
                List<ProductWarehousing> recs = entry.getValue();
                int totalQty = recs.stream().mapToInt(r -> r.getWarehousingQuantity() != null ? r.getWarehousingQuantity() : 0).sum();

                ProductSku matchedSku = null;
                if (StringUtils.isNotBlank(recs.get(0).getSkuCode())) {
                    matchedSku = productSkuService.getOne(new LambdaQueryWrapper<ProductSku>()
                            .eq(ProductSku::getTenantId, tenantId)
                            .eq(ProductSku::getSkuCode, key)
                            .last("LIMIT 1"));
                }
                if (matchedSku == null && StringUtils.isNotBlank(recs.get(0).getStyleNo())) {
                    matchedSku = productSkuService.getOne(new LambdaQueryWrapper<ProductSku>()
                            .eq(ProductSku::getTenantId, tenantId)
                            .eq(ProductSku::getStyleNo, key)
                            .eq(ProductSku::getStatus, "ENABLED")
                            .last("LIMIT 1"));
                }

                Map<String, Object> item = new LinkedHashMap<>();
                if (matchedSku != null) {
                    item.put("skuCode", matchedSku.getSkuCode());
                    item.put("styleNo", matchedSku.getStyleNo());
                    item.put("color", matchedSku.getColor());
                    item.put("size", matchedSku.getSize());
                    item.put("stockQuantity", matchedSku.getStockQuantity());
                    item.put("salesPrice", matchedSku.getSalesPrice());
                } else {
                    item.put("skuCode", recs.get(0).getSkuCode());
                    item.put("styleNo", recs.get(0).getStyleNo());
                    item.put("color", null);
                    item.put("size", null);
                    item.put("stockQuantity", totalQty);
                    item.put("salesPrice", null);
                }
                item.put("warehousedCount", recs.size());
                item.put("warehousedQty", totalQty);
                items.add(item);
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

            List<WarehouseLocation> allLocs = locationService.list(new LambdaQueryWrapper<WarehouseLocation>()
                    .eq(WarehouseLocation::getTenantId, tenantId)
                    .eq(WarehouseLocation::getWarehouseType, type)
                    .eq(WarehouseLocation::getDeleteFlag, 0)
                    .select(WarehouseLocation::getId, WarehouseLocation::getLocationCode,
                            WarehouseLocation::getLocationName, WarehouseLocation::getZoneName,
                            WarehouseLocation::getUsedCapacity));

            // 优化：一次性查询所有库位的库存数据，避免 N+1 查询问题
            Set<String> warehouseIdentifiers = new HashSet<>();
            for (WarehouseLocation loc : allLocs) {
                if (StringUtils.isNotBlank(loc.getLocationCode())) {
                    warehouseIdentifiers.add(loc.getLocationCode());
                }
                if (StringUtils.isNotBlank(loc.getLocationName())) {
                    warehouseIdentifiers.add(loc.getLocationName());
                }
            }

            // 查询所有相关的入库记录，按 warehouse 字段分组统计
            List<ProductWarehousing> allRecords = productWarehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getTenantId, tenantId)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .in(ProductWarehousing::getWarehouse, warehouseIdentifiers)
            );

            // 构建统计 map：warehouse -> count
            Map<String, Integer> warehouseCountMap = new HashMap<>();
            for (ProductWarehousing record : allRecords) {
                String warehouse = record.getWarehouse();
                if (StringUtils.isNotBlank(warehouse)) {
                    warehouseCountMap.put(warehouse, warehouseCountMap.getOrDefault(warehouse, 0) + 1);
                }
            }

            // 计算已使用的库位数
            long usedLocations = 0;
            for (WarehouseLocation loc : allLocs) {
                int actualCount = 0;
                if (StringUtils.isNotBlank(loc.getLocationCode())) {
                    actualCount += warehouseCountMap.getOrDefault(loc.getLocationCode(), 0);
                }
                if (StringUtils.isNotBlank(loc.getLocationName())) {
                    actualCount += warehouseCountMap.getOrDefault(loc.getLocationName(), 0);
                }
                if (actualCount > 0) {
                    usedLocations++;
                }
            }

            List<String> zones = allLocs.stream()
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

    public void incrementUsedCapacity(String locationCode, String warehouseType, int delta) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || StringUtils.isBlank(locationCode) || delta == 0) return;

        WarehouseLocation loc = locationService.getOne(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getLocationCode, locationCode)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .eq(StringUtils.isNotBlank(warehouseType), WarehouseLocation::getWarehouseType, warehouseType)
                .last("LIMIT 1"));
        if (loc == null) return;

        int current = loc.getUsedCapacity() != null ? loc.getUsedCapacity() : 0;
        int updated = Math.max(0, current + delta);
        loc.setUsedCapacity(updated);
        loc.setUpdateTime(LocalDateTime.now());
        locationService.updateById(loc);
    }

    public int recalculateUsedCapacity(String locationCode, String warehouseType) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || StringUtils.isBlank(locationCode)) return 0;

        long count = productWarehousingMapper.selectCount(new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getTenantId, tenantId)
                .eq(ProductWarehousing::getWarehouse, locationCode)
                .eq(ProductWarehousing::getDeleteFlag, 0));

        WarehouseLocation loc = locationService.getOne(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getLocationCode, locationCode)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .eq(StringUtils.isNotBlank(warehouseType), WarehouseLocation::getWarehouseType, warehouseType)
                .last("LIMIT 1"));
        if (loc != null) {
            loc.setUsedCapacity((int) count);
            loc.setUpdateTime(LocalDateTime.now());
            locationService.updateById(loc);
        }
        return (int) count;
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<Map<String, Object>> transfer(String fromLocationCode, String toLocationCode, String warehouseType) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (StringUtils.isBlank(fromLocationCode) || StringUtils.isBlank(toLocationCode)) {
            return Result.fail("源库位和目标库位不能为空");
        }
        if (fromLocationCode.equals(toLocationCode)) {
            return Result.fail("不能转移到同一个库位");
        }

        WarehouseLocation fromLoc = locationService.getOne(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getLocationCode, fromLocationCode)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .eq(StringUtils.isNotBlank(warehouseType), WarehouseLocation::getWarehouseType, warehouseType)
                .last("LIMIT 1"));
        if (fromLoc == null) {
            return Result.fail("源库位不存在: " + fromLocationCode);
        }

        WarehouseLocation toLoc = locationService.getOne(new LambdaQueryWrapper<WarehouseLocation>()
                .eq(WarehouseLocation::getTenantId, tenantId)
                .eq(WarehouseLocation::getLocationCode, toLocationCode)
                .eq(WarehouseLocation::getDeleteFlag, 0)
                .eq(StringUtils.isNotBlank(warehouseType), WarehouseLocation::getWarehouseType, warehouseType)
                .last("LIMIT 1"));
        if (toLoc == null) {
            return Result.fail("目标库位不存在: " + toLocationCode);
        }

        if (!"ACTIVE".equals(toLoc.getStatus())) {
            return Result.fail("目标库位已停用，无法转入");
        }

        long count = productWarehousingMapper.selectCount(new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getTenantId, tenantId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .and(w -> w.eq(ProductWarehousing::getWarehouse, fromLocationCode)
                        .or().eq(ProductWarehousing::getWarehouse, fromLoc.getLocationName())));

        if (count == 0) {
            return Result.fail("源库位没有库存，无法转移");
        }

        productWarehousingMapper.update(null, new LambdaUpdateWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getTenantId, tenantId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .and(w -> w.eq(ProductWarehousing::getWarehouse, fromLocationCode)
                        .or().eq(ProductWarehousing::getWarehouse, fromLoc.getLocationName()))
                .set(ProductWarehousing::getWarehouse, toLocationCode));

        recalculateUsedCapacity(fromLocationCode, warehouseType);
        recalculateUsedCapacity(toLocationCode, warehouseType);

        log.info("[库位] 转移库存: from={} to={} count={} tenantId={}", fromLocationCode, toLocationCode, count, tenantId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("fromLocationCode", fromLocationCode);
        result.put("toLocationCode", toLocationCode);
        result.put("transferredCount", count);
        result.put("fromLocationName", fromLoc.getLocationName());
        result.put("toLocationName", toLoc.getLocationName());
        return Result.success(result);
    }

    private Long parseLongSafe(String s) {
        if (s == null || s.isBlank()) return null;
        try { return Long.parseLong(s); } catch (NumberFormatException e) { return null; }
    }
}
