package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.production.dto.MaterialBatchDetailDto;
import com.fashion.supplychain.production.dto.MaterialStockAlertDto;
import com.fashion.supplychain.production.dto.MaterialTransactionDto;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialInboundMapper;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.mapper.MaterialPickingItemMapper;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator;
import com.fashion.supplychain.warehouse.entity.WarehouseArea;
import com.fashion.supplychain.warehouse.service.WarehouseAreaService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class MaterialStockOrchestrator {

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingItemMapper materialPickingItemMapper;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private WarehouseAreaService warehouseAreaService;

    @Autowired
    private MaterialOutboundLogMapper materialOutboundLogMapper;

    @Autowired
    private MaterialPickupOrchestrator materialPickupOrchestrator;

    @Autowired(required = false)
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired
    private DistributedLockService distributedLockService;

    // D-644：面辅料库存列表/流水/图片富化从 MaterialStockController 下沉，收敛 ArchUnit 规则6、规则1
    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Autowired
    private MaterialInboundMapper materialInboundMapper;

    private final AtomicInteger outboundSequence = new AtomicInteger(0);

    // ============================================================
    //  面辅料库存查询 / 流水（D-644 从 MaterialStockController 下沉）
    // ============================================================

    /**
     * 面辅料库存分页列表。
     *
     * <p>除分页外还做三件事：
     * ① 按物料编码批量富化图片（D-360z，入库后列表不再"无图"）；
     * ② 富化最近一次出入库的经办人与时间；
     * ③ 附加今日出入库笔数与本月的出入库金额。
     *
     * <p>工厂账号不可查看面辅料库存（属租户级仓库数据）→ 直接返回空分页结构，
     * 不报错（避免探测）。
     */
    public Map<String, Object> getStockPage(Map<String, Object> params) {
        if (DataPermissionHelper.isFactoryAccount()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("records", List.of());
            empty.put("total", 0L);
            empty.put("size", 10L);
            empty.put("current", 1L);
            empty.put("pages", 0L);
            empty.put("todayInCount", 0);
            empty.put("todayOutCount", 0);
            return empty;
        }
        IPage<MaterialStock> page = materialStockService.queryPage(params);

        // D-360z：批量富化物料图片（按物料编码关联物料资料）
        if (page.getRecords() != null && !page.getRecords().isEmpty()) {
            try {
                Set<String> codes = page.getRecords().stream()
                        .map(MaterialStock::getMaterialCode)
                        .filter(c -> c != null && !c.isBlank())
                        .collect(Collectors.toSet());
                if (!codes.isEmpty()) {
                    Map<String, String> imageMap = materialDatabaseService.list(
                            new LambdaQueryWrapper<MaterialDatabase>()
                                    .in(MaterialDatabase::getMaterialCode, codes))
                            .stream()
                            .filter(md -> md.getImage() != null && !md.getImage().isBlank())
                            .collect(Collectors.toMap(
                                    MaterialDatabase::getMaterialCode,
                                    MaterialDatabase::getImage,
                                    (a, b) -> a));
                    for (MaterialStock stock : page.getRecords()) {
                        stock.setMaterialImage(imageMap.get(stock.getMaterialCode()));
                    }
                }
            } catch (Exception e) {
                // 图片富化失败不影响列表
                log.debug("[MaterialStock] 列表图片富化失败（不影响列表）: {}", e.getMessage());
            }
        }
        enrichLastOperationInfo(page.getRecords());

        Map<String, Object> result = new HashMap<>();
        result.put("records", page.getRecords());
        result.put("total", page.getTotal());
        result.put("size", page.getSize());
        result.put("current", page.getCurrent());
        result.put("pages", page.getPages());

        Long tenantId = UserContext.tenantId();
        LocalDate today = LocalDate.now();
        Integer todayOutCount = materialOutboundLogMapper.selectTodayOutboundCount(today, tenantId);
        result.put("todayOutCount", todayOutCount != null ? todayOutCount : 0);

        long todayInCount = materialInboundMapper.selectCount(new LambdaQueryWrapper<MaterialInbound>()
                .eq(MaterialInbound::getTenantId, tenantId)
                .eq(MaterialInbound::getDeleteFlag, 0)
                .ge(MaterialInbound::getInboundTime, today.atStartOfDay())
                .lt(MaterialInbound::getInboundTime, today.plusDays(1).atStartOfDay()));
        result.put("todayInCount", (int) todayInCount);

        // D-474：本月入库/出库金额（统计在 Service 层做，编排层不直接依赖 Mapper 做聚合）
        Map<String, BigDecimal> monthAmount = materialStockService.getMonthInOutAmount(tenantId, today);
        result.put("monthInAmount", monthAmount.getOrDefault("monthInAmount", BigDecimal.ZERO));
        result.put("monthOutAmount", monthAmount.getOrDefault("monthOutAmount", BigDecimal.ZERO));

        return result;
    }

    /** 按物料 ID 批量取库存；工厂账号不可见（属租户级仓库数据）→ 空列表 */
    public List<MaterialStock> getStocksByMaterialIds(List<String> materialIds) {
        if (DataPermissionHelper.isFactoryAccount()) {
            return List.of();
        }
        return materialStockService.getStocksByMaterialIds(materialIds);
    }

    /** 物料批次明细（出库时按批次 FIFO 用）；工厂账号不可见 → 空列表 */
    public List<MaterialBatchDetailDto> getBatchDetails(String materialCode, String color, String size) {
        if (DataPermissionHelper.isFactoryAccount()) {
            return List.of();
        }
        return materialStockService.getBatchDetails(materialCode, color, size);
    }

    /** 更新安全库存 */
    public Result<Boolean> updateSafetyStock(String stockId, Integer safetyStock) {
        boolean ok = materialStockService.updateSafetyStock(stockId, safetyStock);
        if (!ok) {
            return Result.fail("更新安全库存失败");
        }
        return Result.success(true);
    }

    /**
     * 面辅料出入库流水（合并入库 + 出库，按操作时间倒序）。
     *
     * <p>工厂账号不可见（属租户级仓库数据）→ 空列表。
     */
    public List<MaterialTransactionDto> getTransactions(String materialCode, String stockId) {
        if (DataPermissionHelper.isFactoryAccount()) {
            return List.of();
        }
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        List<MaterialTransactionDto> result = new ArrayList<>();

        // 1. 入库记录（来自 t_material_inbound）
        LambdaQueryWrapper<MaterialInbound> inQuery = new LambdaQueryWrapper<MaterialInbound>()
                .eq(MaterialInbound::getMaterialCode, materialCode)
                .eq(MaterialInbound::getDeleteFlag, 0)
                .orderByDesc(MaterialInbound::getInboundTime);
        for (MaterialInbound ib : materialInboundMapper.selectList(inQuery)) {
            MaterialTransactionDto dto = new MaterialTransactionDto();
            dto.setType("IN");
            dto.setTypeLabel("入库");
            // D-414：流水数量统一支持小数（1.32 米不再显示成 1）
            dto.setQuantity(ib.getInboundQuantity());
            dto.setOperatorName(ib.getOperatorName());
            dto.setWarehouseLocation(ib.getWarehouseLocation());
            dto.setRemark(ib.getRemark());
            if (ib.getInboundTime() != null) {
                dto.setOperationTime(ib.getInboundTime().format(fmt));
            }
            result.add(dto);
        }

        // 2. 出库记录（来自 t_material_outbound_log）
        QueryWrapper<MaterialOutboundLog> outQuery = new QueryWrapper<MaterialOutboundLog>()
                .eq("material_code", materialCode)
                .eq("delete_flag", 0);
        if (StringUtils.hasText(stockId)) {
            outQuery.eq("stock_id", stockId);
        }
        outQuery.orderByDesc("outbound_time");
        for (MaterialOutboundLog ob : materialOutboundLogMapper.selectList(outQuery)) {
            MaterialTransactionDto dto = new MaterialTransactionDto();
            dto.setType("OUT");
            dto.setTypeLabel("出库");
            dto.setQuantity(ob.getQuantity());
            dto.setOperatorName(ob.getOperatorName());
            dto.setWarehouseLocation(ob.getWarehouseLocation());
            dto.setRemark(ob.getRemark());
            if (ob.getOutboundTime() != null) {
                dto.setOperationTime(ob.getOutboundTime().format(fmt));
            }
            result.add(dto);
        }

        // 3. 按时间倒序排序
        result.sort(Comparator.comparing(
                dto -> dto.getOperationTime() == null ? "" : dto.getOperationTime(),
                Comparator.reverseOrder()
        ));

        return result;
    }

    /**
     * 富化最近一次入库/出库的经办人与时间。
     *
     * <p>各用 1 次 IN 查询批量取回后按 {@code 物料编码|颜色|尺码} / {@code stockId} 取最新一条，
     * 避免 N+1。
     */
    private void enrichLastOperationInfo(List<MaterialStock> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        Set<String> stockIds = records.stream()
                .map(MaterialStock::getId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        Set<String> materialCodes = records.stream()
                .map(MaterialStock::getMaterialCode)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        Map<String, MaterialInbound> latestInboundByKey = new HashMap<>();
        if (!materialCodes.isEmpty()) {
            List<MaterialInbound> inboundList = materialInboundMapper.selectList(new LambdaQueryWrapper<MaterialInbound>()
                    .eq(MaterialInbound::getDeleteFlag, 0)
                    .in(MaterialInbound::getMaterialCode, materialCodes)
                    .orderByDesc(MaterialInbound::getInboundTime)
                    .orderByDesc(MaterialInbound::getCreateTime));
            for (MaterialInbound inbound : inboundList) {
                latestInboundByKey.putIfAbsent(
                        buildMaterialCodeKey(inbound.getMaterialCode(), inbound.getColor(), inbound.getSize()), inbound);
            }
        }

        Map<String, MaterialOutboundLog> latestOutboundByStockId = new HashMap<>();
        if (!stockIds.isEmpty()) {
            List<MaterialOutboundLog> outboundList = materialOutboundLogMapper.selectList(new LambdaQueryWrapper<MaterialOutboundLog>()
                    .eq(MaterialOutboundLog::getDeleteFlag, 0)
                    .in(MaterialOutboundLog::getStockId, stockIds)
                    .orderByDesc(MaterialOutboundLog::getOutboundTime)
                    .orderByDesc(MaterialOutboundLog::getCreateTime));
            for (MaterialOutboundLog outbound : outboundList) {
                if (StringUtils.hasText(outbound.getStockId())) {
                    latestOutboundByStockId.putIfAbsent(outbound.getStockId(), outbound);
                }
            }
        }

        for (MaterialStock record : records) {
            MaterialInbound inbound = latestInboundByKey.get(
                    buildMaterialCodeKey(record.getMaterialCode(), record.getColor(), record.getSize()));
            if (inbound != null) {
                record.setLastInboundBy(inbound.getOperatorName());
                if (record.getLastInboundDate() == null) {
                    record.setLastInboundDate(inbound.getInboundTime());
                }
            }

            MaterialOutboundLog outbound = latestOutboundByStockId.get(record.getId());
            if (outbound != null) {
                record.setLastOutboundBy(outbound.getOperatorName());
                if (record.getLastOutboundDate() == null) {
                    record.setLastOutboundDate(outbound.getOutboundTime());
                }
            }
        }
    }

    private String buildMaterialCodeKey(String materialCode, String color, String size) {
        return String.join("|",
                Objects.toString(materialCode, ""),
                Objects.toString(color, ""),
                Objects.toString(size, ""));
    }

    public List<MaterialStockAlertDto> listAlerts(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;
        int days = Math.max(1, ParamUtils.getIntOrDefault(safeParams, "days", 30));
        int leadDays = Math.max(1, ParamUtils.getIntOrDefault(safeParams, "leadDays", 7));
        int limit = Math.max(0, ParamUtils.getIntOrDefault(safeParams, "limit", 0));
        boolean onlyNeed = "true".equalsIgnoreCase(String.valueOf(safeParams.get("onlyNeed")));

        LocalDateTime startTime = LocalDateTime.now().minusDays(days);

        Long tenantId = UserContext.tenantId();
        List<MaterialStock> stocks = materialStockService.list(new LambdaQueryWrapper<MaterialStock>()
                .eq(MaterialStock::getDeleteFlag, 0)
                .eq(MaterialStock::getTenantId, tenantId)); // 🔒 租户隔离

        if (stocks == null || stocks.isEmpty()) {
            return new ArrayList<>();
        }

        List<MaterialPickingItem> pickingItems = materialPickingItemMapper.selectList(
                new LambdaQueryWrapper<MaterialPickingItem>()
                        // P0 修复（铁律4 多租户隔离）：必须带 tenantId 过滤，避免跨租户读取
                        .eq(MaterialPickingItem::getTenantId, tenantId)
                        .ge(MaterialPickingItem::getCreateTime, startTime));

        Map<String, BigDecimal> usageByMaterial = buildUsageMap(stocks);

        Map<String, Summary> byStockId = new HashMap<>();
        Map<String, Summary> byMaterialKey = new HashMap<>();

        if (pickingItems != null) {
            for (MaterialPickingItem item : pickingItems) {
                if (item == null) {
                    continue;
                }
                BigDecimal qty = item.getQuantity() == null ? BigDecimal.ZERO : item.getQuantity();
                if (qty.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }
                LocalDateTime time = item.getCreateTime();
                String stockId = trimToNull(item.getMaterialStockId());
                if (stockId != null) {
                    Summary summary = byStockId.computeIfAbsent(stockId, k -> new Summary());
                    summary.add(qty, time);
                }

                String materialKey = buildMaterialKey(item.getMaterialId(), item.getColor(), item.getSize());
                if (materialKey != null) {
                    Summary summary = byMaterialKey.computeIfAbsent(materialKey, k -> new Summary());
                    summary.add(qty, time);
                }
            }
        }

        List<MaterialStockAlertDto> alerts = new ArrayList<>();
        for (MaterialStock stock : stocks) {
            if (stock == null) {
                continue;
            }
            String stockId = trimToNull(stock.getId());
            Summary summary = stockId == null ? null : byStockId.get(stockId);
            if (summary == null) {
                String materialKey = buildMaterialKey(stock.getMaterialId(), stock.getColor(), stock.getSize());
                summary = materialKey == null ? null : byMaterialKey.get(materialKey);
            }

            // D-414：领料汇总已是 BigDecimal，此处按小数取日均（1.32 米不再被截成 1）
            double recentOutQty = summary == null ? 0d : summary.quantity.doubleValue();
            int dailyOutQty = (int) Math.ceil(recentOutQty / (double) days);
            int safetyStock = stock.getSafetyStock() == null ? 0 : stock.getSafetyStock();
            int suggestedSafety = Math.max(safetyStock, dailyOutQty * leadDays);
            BigDecimal quantity = stock.getQuantity() == null ? BigDecimal.ZERO : stock.getQuantity();
            // D-410：suggestedSafety 仍按 int 估算（安全库存字段未纳入本次迁移），比较时提升到 BigDecimal
            boolean need = quantity.compareTo(BigDecimal.valueOf(suggestedSafety)) < 0;

            BigDecimal perPieceUsage = resolveUsage(usageByMaterial, stock);
            Integer minProductionQty = calcProductionQty(quantity, perPieceUsage);
            Integer maxProductionQty = calcProductionQty(BigDecimal.valueOf(suggestedSafety), perPieceUsage);

            if (onlyNeed && !need) {
                continue;
            }

            MaterialStockAlertDto dto = new MaterialStockAlertDto();
            dto.setStockId(stockId);
            dto.setMaterialId(stock.getMaterialId());
            dto.setMaterialCode(stock.getMaterialCode());
            dto.setMaterialName(stock.getMaterialName());
            dto.setMaterialType(stock.getMaterialType());
            dto.setUnit(stock.getUnit());
            dto.setColor(stock.getColor());
            dto.setSize(stock.getSize());
            // D-466：告警列表的库存数量改为小数显示（375.5 米不该显示成 375）
            dto.setQuantity(quantity);
            dto.setSafetyStock(safetyStock);
            // D-414：DTO 该字段仍是 Integer，按 CEILING 取整（1.32 米按 2 计，避免低估近期出库量）
            dto.setRecentOutQuantity((int) Math.ceil(recentOutQty));
            dto.setSuggestedSafetyStock(suggestedSafety);
            dto.setDailyOutQuantity(dailyOutQty);
            dto.setNeedReplenish(need);
            dto.setLastOutTime(summary == null ? null : summary.lastTime);
            dto.setPerPieceUsage(perPieceUsage);
            dto.setMinProductionQty(minProductionQty);
            dto.setMaxProductionQty(maxProductionQty);
            dto.setSupplierName(stock.getSupplierName());
            dto.setFabricWidth(stock.getFabricWidth());
            dto.setFabricWeight(stock.getFabricWeight());
            dto.setFabricComposition(stock.getFabricComposition());
            alerts.add(dto);
        }

        alerts = alerts.stream()
                .sorted(Comparator
                        .comparing(MaterialStockAlertDto::getNeedReplenish, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(dto -> shortage(dto), Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(MaterialStockAlertDto::getRecentOutQuantity, Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());

        if (limit > 0 && alerts.size() > limit) {
            return alerts.subList(0, limit);
        }
        return alerts;
    }

    @Transactional(rollbackFor = Exception.class)
    /** D-414：手动出库数量支持小数（原 Integer 会把 1.32 米截断成 1，库存少扣） */
    public String manualOutbound(
            String stockId,
            BigDecimal quantity,
            String reason,
            String orderNo,
            String styleNo,
            String factoryId,
            String factoryName,
            String factoryType,
            String receiverId,
            String receiverName,
            String pickupType,
            String usageType,
            String warehouseAreaId) {
        if (!StringUtils.hasText(stockId)) {
            throw new IllegalArgumentException("库存记录不能为空");
        }
        if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("出库数量必须大于0");
        }
        if (!StringUtils.hasText(receiverName)) {
            throw new IllegalArgumentException("领取人不能为空");
        }
        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("关联订单不能为空");
        }
        if (!StringUtils.hasText(styleNo)) {
            throw new IllegalArgumentException("关联款号不能为空");
        }
        if (!StringUtils.hasText(factoryName)) {
            throw new IllegalArgumentException("关联工厂不能为空");
        }
        if (!StringUtils.hasText(usageType)) {
            throw new IllegalArgumentException("用料场景不能为空");
        }

        MaterialStock stock = materialStockService.getById(stockId);
        if (stock == null || stock.getDeleteFlag() != null && stock.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("库存记录不存在");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(stock.getTenantId(), "物料库存");

        // 分布式锁：防止同一库存并发出库导致超卖
        String lockKey = "material:outbound:" + stockId;
        distributedLockService.executeWithStrictLock(lockKey, 10, TimeUnit.SECONDS, () -> {
            materialStockService.decreaseStockById(stockId, quantity);
            return null;
        });

        LocalDateTime outboundTime = LocalDateTime.now();
        String issuerId = StringUtils.hasText(UserContext.userId()) ? UserContext.userId().trim() : null;
        String issuerName = StringUtils.hasText(UserContext.username()) ? UserContext.username().trim() : "系统";
        String normalizedFactoryType = StringUtils.hasText(factoryType) ? factoryType.trim().toUpperCase() : null;
        String normalizedPickupType = StringUtils.hasText(pickupType)
                ? pickupType.trim().toUpperCase()
                : (StringUtils.hasText(normalizedFactoryType) ? normalizedFactoryType : "INTERNAL");
        String outboundNo = generateOutboundNo();

        MaterialOutboundLog log = new MaterialOutboundLog();
        log.setStockId(stockId);
        log.setOutboundNo(outboundNo);
        log.setSourceType("MANUAL_OUTBOUND");
        log.setPickupType(normalizedPickupType);
        log.setUsageType(usageType.trim());
        log.setOrderNo(orderNo.trim());
        log.setStyleNo(styleNo.trim());
        log.setFactoryId(StringUtils.hasText(factoryId) ? factoryId.trim() : null);
        log.setFactoryName(factoryName.trim());
        log.setFactoryType(normalizedFactoryType);
        log.setMaterialCode(stock.getMaterialCode());
        log.setMaterialName(stock.getMaterialName());
        log.setQuantity(quantity);
        log.setOperatorId(issuerId);
        log.setOperatorName(issuerName);
        log.setReceiverId(StringUtils.hasText(receiverId) ? receiverId.trim() : null);
        log.setReceiverName(receiverName.trim());
        log.setWarehouseLocation(stock.getLocation());
        log.setWarehouseAreaId(warehouseAreaId);
        log.setWarehouseAreaName(resolveWarehouseAreaName(warehouseAreaId));
        log.setRemark(StringUtils.hasText(reason) ? reason.trim() : "手动出库");
        log.setOutboundTime(outboundTime);
        log.setCreateTime(outboundTime);
        log.setDeleteFlag(0);
        materialOutboundLogMapper.insert(log);
        pushManualOutboundBill(log, stock, quantity);

        MaterialStock patch = new MaterialStock();
        patch.setId(stockId);
        patch.setLastOutboundDate(outboundTime);
        patch.setUpdateTime(outboundTime);
        materialStockService.updateById(patch);

        Map<String, Object> pickupBody = new LinkedHashMap<>();
        pickupBody.put("pickupType", normalizedPickupType);
        pickupBody.put("movementType", "OUTBOUND");
        pickupBody.put("sourceType", "MANUAL_OUTBOUND");
        pickupBody.put("usageType", usageType.trim());
        pickupBody.put("sourceRecordId", log.getId());
        pickupBody.put("sourceDocumentNo", outboundNo);
        pickupBody.put("factoryId", StringUtils.hasText(factoryId) ? factoryId.trim() : null);
        pickupBody.put("factoryName", factoryName.trim());
        pickupBody.put("factoryType", normalizedFactoryType);
        pickupBody.put("orderNo", orderNo.trim());
        pickupBody.put("styleNo", styleNo.trim());
        pickupBody.put("materialId", stock.getMaterialId());
        pickupBody.put("materialCode", stock.getMaterialCode());
        pickupBody.put("materialName", stock.getMaterialName());
        pickupBody.put("materialType", stock.getMaterialType());
        pickupBody.put("color", stock.getColor());
        pickupBody.put("specification", stock.getSpecifications());
        pickupBody.put("fabricWidth", stock.getFabricWidth());
        pickupBody.put("fabricWeight", stock.getFabricWeight());
        pickupBody.put("fabricComposition", stock.getFabricComposition());
        pickupBody.put("quantity", quantity);
        pickupBody.put("unit", stock.getUnit());
        pickupBody.put("unitPrice", stock.getUnitPrice());
        pickupBody.put("receiverId", StringUtils.hasText(receiverId) ? receiverId.trim() : null);
        pickupBody.put("receiverName", receiverName.trim());
        pickupBody.put("issuerId", issuerId);
        pickupBody.put("issuerName", issuerName);
        pickupBody.put("warehouseLocation", stock.getLocation());
        pickupBody.put("remark", StringUtils.hasText(reason) ? reason.trim() : "手动出库");
        materialPickupOrchestrator.create(pickupBody);

        return outboundNo;
    }

    private void pushManualOutboundBill(MaterialOutboundLog outboundLog, MaterialStock stock, BigDecimal quantity) {
        if (billAggregationOrchestrator == null || outboundLog == null || stock == null
                || quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        try {
            if (StringUtils.hasText(outboundLog.getOrderId())) {
                boolean hasReconBill = billAggregationOrchestrator.billExistsByOrderId("MATERIAL_RECONCILIATION", outboundLog.getOrderId());
                if (hasReconBill) {
                    log.info("[MaterialStock] 手动出库跳过推送账单: 已有物料对账账单 orderId={}", outboundLog.getOrderId());
                    return;
                }
            }

            BigDecimal unitPrice = stock.getUnitPrice();
            if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
                return;
            }
            BigDecimal amount = unitPrice.multiply(quantity).setScale(2, java.math.RoundingMode.HALF_UP);
            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                return;
            }

            BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
            req.setBillType("PAYABLE");
            req.setSourceType("MATERIAL_OUTBOUND");
            req.setSourceId(outboundLog.getId());
            req.setSourceNo(outboundLog.getOutboundNo());
            if (StringUtils.hasText(stock.getSupplierId()) || StringUtils.hasText(stock.getSupplierName())) {
                // 供应商提供物料 → 物料类别
                req.setBillCategory("MATERIAL");
                req.setCounterpartyType("SUPPLIER");
                req.setCounterpartyId(stock.getSupplierId());
                req.setCounterpartyName(stock.getSupplierName());
            } else {
                // P1-3 修复：fallback 到外发工厂 → 应归入"外发厂"类别
                req.setBillCategory("EXTERNAL_FACTORY");
                req.setCounterpartyType("FACTORY");
                req.setCounterpartyId(outboundLog.getFactoryId());
                req.setCounterpartyName(outboundLog.getFactoryName());
            }
            req.setOrderNo(outboundLog.getOrderNo());
            req.setStyleNo(outboundLog.getStyleNo());
            req.setAmount(amount);
            req.setRemark("手动出库自动入账|outboundNo=" + outboundLog.getOutboundNo()
                    + "|material=" + outboundLog.getMaterialCode() + "|qty=" + quantity);
            billAggregationOrchestrator.pushBill(req);
        } catch (Exception e) {
            String outboundNo = outboundLog.getOutboundNo();
            log.warn("手动出库推送账单失败（不阻塞主流程）: outboundNo={}", outboundNo, e);
        }
    }

    private static Integer shortage(MaterialStockAlertDto dto) {
        if (dto == null) {
            return 0;
        }
        // D-466：库存改小数后，缺口 = 建议安全库存 - 当前库存 也可能是小数；
        // 补货场景向上取整（缺 0.5 米也得补 1 米），避免低估缺口。
        BigDecimal qty = dto.getQuantity() == null ? BigDecimal.ZERO : dto.getQuantity();
        int suggested = dto.getSuggestedSafetyStock() == null ? 0 : dto.getSuggestedSafetyStock();
        BigDecimal gap = BigDecimal.valueOf(suggested).subtract(qty).setScale(0, java.math.RoundingMode.CEILING);
        return Math.max(0, gap.intValue());
    }

    private static String buildMaterialKey(String materialId, String color, String size) {
        String mid = trimToNull(materialId);
        if (!StringUtils.hasText(mid)) {
            return null;
        }
        return String.join("|",
                mid,
                normalize(color),
                normalize(size));
    }

    private Map<String, BigDecimal> buildUsageMap(List<MaterialStock> stocks) {
        List<String> codes = stocks.stream()
                .map(MaterialStock::getMaterialCode)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (codes.isEmpty()) {
            return new HashMap<>();
        }
        List<StyleBom> boms = styleBomService.listByMaterialCodes(codes);
        Map<String, BigDecimal> usageMap = new HashMap<>();
        if (boms == null) {
            return usageMap;
        }
        for (StyleBom bom : boms) {
            if (bom == null || !StringUtils.hasText(bom.getMaterialCode())) {
                continue;
            }
            BigDecimal usage = bom.getUsageAmount() == null ? BigDecimal.ZERO : bom.getUsageAmount();
            if (usage.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            BigDecimal loss = bom.getLossRate() == null ? BigDecimal.ZERO : bom.getLossRate();
            BigDecimal factor = BigDecimal.ONE.add(loss.movePointLeft(2));
            BigDecimal perPiece = usage.multiply(factor);
            if (perPiece.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            String key = buildBomKey(bom.getMaterialCode(), bom.getColor(), bom.getSize());
            BigDecimal current = usageMap.get(key);
            if (current == null || perPiece.compareTo(current) > 0) {
                usageMap.put(key, perPiece);
            }
        }
        return usageMap;
    }

    private BigDecimal resolveUsage(Map<String, BigDecimal> usageMap, MaterialStock stock) {
        if (usageMap == null || usageMap.isEmpty() || stock == null) {
            return null;
        }
        String key = buildBomKey(stock.getMaterialCode(), stock.getColor(), stock.getSize());
        BigDecimal usage = usageMap.get(key);
        if (usage != null) {
            return usage;
        }
        String fallback = buildBomKey(stock.getMaterialCode(), null, null);
        return usageMap.get(fallback);
    }

    private String buildBomKey(String materialCode, String color, String size) {
        String code = trimToNull(materialCode);
        if (!StringUtils.hasText(code)) {
            return null;
        }
        return String.join("|",
                code,
                normalize(color),
                normalize(size));
    }

    /** D-410：qty 改 BigDecimal，避免库存小数在计算可生产数时被截断 */
    private Integer calcProductionQty(BigDecimal qty, BigDecimal perPiece) {
        if (qty == null || perPiece == null || perPiece.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        return qty.divide(perPiece, 0, java.math.RoundingMode.DOWN)
                .intValue();
    }

    private static String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim() : "";
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private String generateOutboundNo() {
        String date = DateTimeFormatter.ofPattern("yyyyMMddHHmmss").format(LocalDateTime.now());
        int seq = outboundSequence.incrementAndGet() % 1000;
        return String.format("MOB%s%03d", date, seq);
    }

    private String resolveWarehouseAreaName(String areaId) {
        if (!StringUtils.hasText(areaId)) return null;
        try {
            WarehouseArea area = warehouseAreaService.getById(areaId);
            return area != null ? area.getAreaName() : null;
        } catch (Exception e) {
            return null;
        }
    }

    @Data
    private static class Summary {
        // D-414：领料数量已支持小数，汇总也改 BigDecimal（int 会把 1.32 截成 1）
        private BigDecimal quantity = BigDecimal.ZERO;
        private LocalDateTime lastTime;

        void add(BigDecimal qty, LocalDateTime time) {
            this.quantity = this.quantity.add(qty == null ? BigDecimal.ZERO : qty);
            if (time != null) {
                if (this.lastTime == null || time.isAfter(this.lastTime)) {
                    this.lastTime = time;
                }
            }
        }
    }
}
