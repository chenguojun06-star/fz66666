package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.dto.FinishedInventoryDTO;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.common.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * 成品库存编排层
 * 负责聚合SKU库存、入库记录、款式信息
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FinishedInventoryOrchestrator {

    private final ProductSkuService productSkuService;
    private final ProductWarehousingMapper productWarehousingMapper;
    private final ProductOutstockService productOutstockService;
    private final ProductionOrderService productionOrderService;
    private final StyleInfoService styleInfoService;
    private final StyleAttachmentService styleAttachmentService;

    /** 电商订单回写（出库后自动更新平台物流状态） */
    @Lazy
    @Autowired
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    /**
     * 分页查询成品库存
     */
    public IPage<FinishedInventoryDTO> getFinishedInventoryPage(Map<String, Object> params) {
        // 解析分页参数
        int page = Integer.parseInt(params.getOrDefault("page", "1").toString());
        int pageSize = Integer.parseInt(params.getOrDefault("pageSize", "20").toString());
        String orderNo = (String) params.get("orderNo");
        String styleNo = (String) params.get("styleNo");
        String warehouseLocation = (String) params.get("warehouseLocation");
        String keyword = params.get("keyword") == null ? null : String.valueOf(params.get("keyword")).trim();
        String parentOrgUnitId = params.get("parentOrgUnitId") == null ? null : String.valueOf(params.get("parentOrgUnitId")).trim();
        String factoryType = params.get("factoryType") == null ? null : String.valueOf(params.get("factoryType")).trim();

        // 查询SKU表（有库存的）
        Long tid = UserContext.tenantId();
        Page<ProductSku> skuPage = new Page<>(page, pageSize);
        LambdaQueryWrapper<ProductSku> wrapper = new LambdaQueryWrapper<>();
        wrapper.gt(ProductSku::getStockQuantity, 0);
        if (tid != null) wrapper.eq(ProductSku::getTenantId, tid);

        // 工厂账号隔离：仅展示本工厂订单关联的款号库存
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            List<String> factoryStyleNos = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .select(ProductionOrder::getStyleNo)
                    .list()
                    .stream()
                    .map(ProductionOrder::getStyleNo)
                    .filter(StringUtils::hasText)
                    .distinct()
                    .collect(java.util.stream.Collectors.toList());
            if (factoryStyleNos.isEmpty()) {
                // 该工厂无订单，返回空页
                return new Page<>(page, pageSize);
            }
            wrapper.in(ProductSku::getStyleNo, factoryStyleNos);
        }

        if (StringUtils.hasText(styleNo)) {
            wrapper.like(ProductSku::getStyleNo, styleNo.trim());
        }

        wrapper.orderByDesc(ProductSku::getUpdateTime);
        IPage<ProductSku> skuPageResult = productSkuService.page(skuPage, wrapper);

        // 统计每个 styleId 的当前库存总量（用于与入库汇总口径对齐）
        Map<String, Integer> stockQtyByStyleId = new HashMap<>();
        for (ProductSku sku : skuPageResult.getRecords()) {
            if (sku == null || sku.getStyleId() == null) {
                continue;
            }
            int qty = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
            stockQtyByStyleId.merge(String.valueOf(sku.getStyleId()), qty, Integer::sum);
        }

        // 收集 styleId 列表
        List<Long> styleIds = skuPageResult.getRecords().stream()
                .map(ProductSku::getStyleId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        List<String> styleNos = skuPageResult.getRecords().stream()
            .map(ProductSku::getStyleNo)
            .filter(StringUtils::hasText)
            .distinct()
            .collect(Collectors.toList());

        // 批量查询款式信息（获取 styleName, cover 图片）
        Map<Long, StyleInfo> styleInfoMap = new HashMap<>();
        if (!styleIds.isEmpty()) {
            List<StyleInfo> styleInfoList = styleInfoService.listByIds(styleIds);
            styleInfoMap = styleInfoList.stream()
                    .collect(Collectors.toMap(StyleInfo::getId, s -> s, (a, b) -> a));
        }

        // 第二级兜底：对 cover 为空的款式，从 t_style_attachment 取第一张图
        Map<Long, String> attachCoverByStyleId = new HashMap<>();
        if (!styleInfoMap.isEmpty()) {
            List<Long> noCoverIds = styleInfoMap.values().stream()
                    .filter(s -> !StringUtils.hasText(s.getCover()))
                    .map(StyleInfo::getId)
                    .collect(Collectors.toList());
            if (!noCoverIds.isEmpty()) {
                try {
                    List<StyleAttachment> attachments = styleAttachmentService.list(
                            new LambdaQueryWrapper<StyleAttachment>()
                                    .in(StyleAttachment::getStyleId, noCoverIds.stream()
                                            .map(String::valueOf).collect(Collectors.toList()))
                                    .like(StyleAttachment::getFileType, "image")
                                    .eq(StyleAttachment::getStatus, "active")
                                    .orderByAsc(StyleAttachment::getCreateTime));
                    if (attachments != null) {
                        for (StyleAttachment a : attachments) {
                            if (a == null || !StringUtils.hasText(a.getFileUrl())) continue;
                            try {
                                Long sid = Long.valueOf(a.getStyleId());
                                attachCoverByStyleId.putIfAbsent(sid, a.getFileUrl());
                            } catch (NumberFormatException ignored) {}
                        }
                    }
                } catch (Exception e) {
                    log.error("[FinishedInventory] 查询款式附件失败（t_style_attachment 可能缺列），跳过封面填充: {}", e.getMessage());
                }
            }
        }

        // 批量查询入库记录（按 styleId 分组，取最新一条）
        // 注意：t_product_warehousing 没有 color/size 列，只能按 styleId 匹配
        Map<String, ProductWarehousing> warehousingMap = new HashMap<>();
        Map<String, String> latestOperatorByStyleId = new HashMap<>();
        Map<String, String> latestWarehouseByStyleId = new HashMap<>();
        if (!styleIds.isEmpty()) {
            List<ProductWarehousing> warehousingList = productWarehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                        .select(
                            ProductWarehousing::getStyleId,
                            ProductWarehousing::getOrderId,
                            ProductWarehousing::getOrderNo,
                            ProductWarehousing::getStyleName,
                            ProductWarehousing::getWarehouse,
                            ProductWarehousing::getWarehousingEndTime,
                            ProductWarehousing::getWarehousingNo,
                            ProductWarehousing::getWarehousingOperatorName,
                            ProductWarehousing::getQualityOperatorName,
                            ProductWarehousing::getQualifiedQuantity,
                            ProductWarehousing::getDeleteFlag)
                            .in(ProductWarehousing::getStyleId,
                                    styleIds.stream().map(String::valueOf).collect(Collectors.toList()))
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .orderByDesc(ProductWarehousing::getWarehousingEndTime)
            );

            // 按 styleId 分组，取最新的一条
            warehousingMap = warehousingList.stream()
                    .collect(Collectors.toMap(
                            ProductWarehousing::getStyleId,
                            w -> w,
                            (existing, replacement) -> {
                                if (existing.getWarehousingEndTime() != null
                                        && replacement.getWarehousingEndTime() != null) {
                                    return existing.getWarehousingEndTime()
                                            .isAfter(replacement.getWarehousingEndTime())
                                            ? existing : replacement;
                                }
                                return existing.getWarehousingEndTime() != null ? existing : replacement;
                            }
                    ));

            // 提取每个 styleId 的“最新非空操作人/库位”用于兜底，避免页面显示 '-'
            for (ProductWarehousing warehousing : warehousingList) {
                if (warehousing == null || !StringUtils.hasText(warehousing.getStyleId())) {
                    continue;
                }
                String styleId = warehousing.getStyleId();
                if (!latestOperatorByStyleId.containsKey(styleId)) {
                    String operatorName = StringUtils.hasText(warehousing.getWarehousingOperatorName())
                            ? warehousing.getWarehousingOperatorName()
                            : warehousing.getQualityOperatorName();
                    if (StringUtils.hasText(operatorName)) {
                        latestOperatorByStyleId.put(styleId, operatorName);
                    }
                }
                if (!latestWarehouseByStyleId.containsKey(styleId)
                        && StringUtils.hasText(warehousing.getWarehouse())) {
                    latestWarehouseByStyleId.put(styleId, warehousing.getWarehouse());
                }
                if (latestOperatorByStyleId.containsKey(styleId)
                        && latestWarehouseByStyleId.containsKey(styleId)) {
                    continue;
                }
            }
        }

        Map<String, ProductionOrder> orderById = new HashMap<>();
        Map<String, ProductionOrder> orderByNo = new HashMap<>();
        Set<String> orderIds = new HashSet<>();
        Set<String> orderNos = new HashSet<>();
        warehousingMap.values().forEach(item -> {
            if (item != null && StringUtils.hasText(item.getOrderId())) {
                orderIds.add(item.getOrderId());
            }
            if (item != null && StringUtils.hasText(item.getOrderNo())) {
                orderNos.add(item.getOrderNo());
            }
        });
        styleInfoMap.values().forEach(item -> {
            if (item != null && StringUtils.hasText(item.getOrderNo())) {
                orderNos.add(item.getOrderNo());
            }
        });
        if (!orderIds.isEmpty()) {
            loadProductionOrdersByIdsSafely(orderIds, "finished-inventory-listByIds").forEach(order -> {
                orderById.put(order.getId(), order);
                if (StringUtils.hasText(order.getOrderNo())) {
                    orderByNo.put(order.getOrderNo(), order);
                }
            });
        }
        if (!orderNos.isEmpty()) {
            loadProductionOrdersByNosSafely(orderNos, "finished-inventory-listByOrderNo").forEach(order -> {
                if (StringUtils.hasText(order.getOrderNo())) {
                    orderByNo.put(order.getOrderNo(), order);
                }
            });
        }

        Map<String, ProductOutstock> latestOutstockByStyleId = new HashMap<>();
        if (!styleIds.isEmpty()) {
            try {
                productOutstockService.list(new LambdaQueryWrapper<ProductOutstock>()
                                .in(ProductOutstock::getStyleId,
                                        styleIds.stream().map(String::valueOf).collect(Collectors.toList()))
                                .eq(ProductOutstock::getDeleteFlag, 0)
                                .orderByDesc(ProductOutstock::getCreateTime))
                        .forEach(outstock -> {
                            if (outstock != null && StringUtils.hasText(outstock.getStyleId())) {
                                latestOutstockByStyleId.putIfAbsent(outstock.getStyleId(), outstock);
                            }
                        });
            } catch (Exception e) {
                log.error("[FinishedInventory] 查询出库记录(byStyleId)失败（t_product_outstock 可能不存在），跳过: {}", e.getMessage());
            }
        }

        Map<String, ProductOutstock> latestOutstockByStyleNo = new HashMap<>();
        if (!styleNos.isEmpty()) {
            try {
                productOutstockService.list(new LambdaQueryWrapper<ProductOutstock>()
                                .in(ProductOutstock::getStyleNo, styleNos)
                                .eq(ProductOutstock::getDeleteFlag, 0)
                                .orderByDesc(ProductOutstock::getCreateTime))
                        .forEach(outstock -> {
                            if (outstock != null && StringUtils.hasText(outstock.getStyleNo())) {
                                latestOutstockByStyleNo.putIfAbsent(outstock.getStyleNo(), outstock);
                            }
                        });
            } catch (Exception e) {
                log.error("[FinishedInventory] 查询出库记录(byStyleNo)失败（t_product_outstock 可能不存在），跳过: {}", e.getMessage());
            }
        }

        // 统计每个 styleId 的总入库数量
        Map<String, Integer> totalInboundQtyMap = new HashMap<>();
        if (!styleIds.isEmpty()) {
            List<ProductWarehousing> allWarehousing = productWarehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                        .select(
                            ProductWarehousing::getStyleId,
                            ProductWarehousing::getQualifiedQuantity,
                            ProductWarehousing::getDeleteFlag)
                            .in(ProductWarehousing::getStyleId,
                                    styleIds.stream().map(String::valueOf).collect(Collectors.toList()))
                            .eq(ProductWarehousing::getDeleteFlag, 0)
            );
            allWarehousing.forEach(w -> {
                int qty = w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0;
                totalInboundQtyMap.merge(w.getStyleId(), qty, Integer::sum);
            });
        }

        // 按款号分组，获取颜色尺码列表
        Map<String, List<ProductSku>> styleSkuMap = skuPageResult.getRecords().stream()
                .collect(Collectors.groupingBy(ProductSku::getStyleNo));

        // 组装DTO
        List<FinishedInventoryDTO> dtoList = new ArrayList<>();
        for (ProductSku sku : skuPageResult.getRecords()) {
            FinishedInventoryDTO dto = new FinishedInventoryDTO();

            // 基础SKU信息
            dto.setId(sku.getSkuCode());
            dto.setSku(sku.getSkuCode());
            dto.setStyleId(sku.getStyleId() != null ? sku.getStyleId().toString() : null);
            dto.setStyleNo(sku.getStyleNo());
            dto.setColor(sku.getColor());
            dto.setSize(sku.getSize());
            dto.setAvailableQty(sku.getStockQuantity() != null ? sku.getStockQuantity() : 0);
            dto.setLockedQty(0);
            dto.setDefectQty(0);
            dto.setCostPrice(sku.getCostPrice());     // 成本价
            dto.setSalesPrice(sku.getSalesPrice());   // 销售价

            // 从款式信息补充 styleName, styleImage
            if (sku.getStyleId() != null) {
                StyleInfo styleInfo = styleInfoMap.get(sku.getStyleId());
                if (styleInfo != null) {
                    dto.setStyleName(styleInfo.getStyleName());
                    String cover = styleInfo.getCover();
                    dto.setStyleImage(StringUtils.hasText(cover) ? cover
                            : attachCoverByStyleId.get(sku.getStyleId()));
                    // 如果款式表有订单号也取出来
                    if (StringUtils.hasText(styleInfo.getOrderNo())) {
                        dto.setOrderNo(styleInfo.getOrderNo());
                    }
                }
            }

            // 从入库记录补充信息（按 styleId 匹配）
            String styleIdStr = dto.getStyleId();
            ProductWarehousing warehousing = warehousingMap.get(styleIdStr);
            if (warehousing != null) {
                dto.setOrderId(warehousing.getOrderId());
                // 优先使用入库记录的订单号
                if (StringUtils.hasText(warehousing.getOrderNo())) {
                    dto.setOrderNo(warehousing.getOrderNo());
                }
                // 如果款式信息没有名称，用入库记录的
                if (!StringUtils.hasText(dto.getStyleName())) {
                    dto.setStyleName(warehousing.getStyleName());
                }
                dto.setWarehouseLocation(warehousing.getWarehouse());
                dto.setLastInboundDate(warehousing.getWarehousingEndTime());
                dto.setQualityInspectionNo(warehousing.getWarehousingNo());
                String latestInboundBy = StringUtils.hasText(warehousing.getWarehousingOperatorName())
                        ? warehousing.getWarehousingOperatorName()
                        : warehousing.getQualityOperatorName();
                dto.setLastInboundBy(latestInboundBy);
            }

            ProductionOrder relatedOrder = StringUtils.hasText(dto.getOrderId())
                    ? orderById.get(dto.getOrderId())
                    : orderByNo.get(dto.getOrderNo());
            if (relatedOrder == null && StringUtils.hasText(dto.getOrderNo())) {
                relatedOrder = orderByNo.get(dto.getOrderNo());
            }
            if (relatedOrder != null) {
                dto.setFactoryName(relatedOrder.getFactoryName());
                dto.setFactoryType(relatedOrder.getFactoryType());
                dto.setOrgUnitId(relatedOrder.getOrgUnitId());
                dto.setParentOrgUnitId(relatedOrder.getParentOrgUnitId());
                dto.setParentOrgUnitName(relatedOrder.getParentOrgUnitName());
                dto.setOrgPath(relatedOrder.getOrgPath());
            }

            // 兜底：若最新记录缺少操作人/库位，回填“最新非空值”
            if (!StringUtils.hasText(dto.getLastInboundBy())) {
                dto.setLastInboundBy(latestOperatorByStyleId.get(styleIdStr));
            }
            if (!StringUtils.hasText(dto.getWarehouseLocation())) {
                dto.setWarehouseLocation(latestWarehouseByStyleId.get(styleIdStr));
            }

            ProductOutstock latestOutstock = StringUtils.hasText(styleIdStr)
                    ? latestOutstockByStyleId.get(styleIdStr)
                    : null;
            if (latestOutstock == null && StringUtils.hasText(dto.getStyleNo())) {
                latestOutstock = latestOutstockByStyleNo.get(dto.getStyleNo());
            }
            if (latestOutstock != null) {
                dto.setLastOutboundDate(latestOutstock.getCreateTime());
                dto.setLastOutstockNo(latestOutstock.getOutstockNo());
                dto.setLastOutboundBy(StringUtils.hasText(latestOutstock.getOperatorName())
                        ? latestOutstock.getOperatorName()
                        : latestOutstock.getCreatorName());
            }

            // 入库总量
            Integer totalInbound = totalInboundQtyMap.get(styleIdStr);
            int inboundQty = totalInbound != null ? totalInbound : 0;
            int stockQty = stockQtyByStyleId.getOrDefault(styleIdStr, 0);
            dto.setTotalInboundQty(Math.max(inboundQty, stockQty));

            // 获取该款式的所有颜色和尺码
            List<ProductSku> styleSKUs = styleSkuMap.get(sku.getStyleNo());
            if (styleSKUs != null) {
                dto.setColors(styleSKUs.stream()
                        .map(ProductSku::getColor)
                        .filter(StringUtils::hasText)
                        .distinct()
                        .collect(Collectors.toList()));
                dto.setSizes(styleSKUs.stream()
                        .map(ProductSku::getSize)
                        .filter(StringUtils::hasText)
                        .distinct()
                        .collect(Collectors.toList()));
            }

            // 应用过滤条件
            boolean match = true;
            if (StringUtils.hasText(orderNo) && (dto.getOrderNo() == null || !dto.getOrderNo().contains(orderNo))) {
                match = false;
            }
            if (StringUtils.hasText(parentOrgUnitId) && !parentOrgUnitId.equals(dto.getParentOrgUnitId())) {
                match = false;
            }
            if (StringUtils.hasText(factoryType) && !factoryType.equalsIgnoreCase(dto.getFactoryType())) {
                match = false;
            }
            if (StringUtils.hasText(warehouseLocation) && (dto.getWarehouseLocation() == null || !dto.getWarehouseLocation().contains(warehouseLocation))) {
                match = false;
            }
            if (StringUtils.hasText(keyword)) {
                String factoryTypeLabel = "INTERNAL".equalsIgnoreCase(dto.getFactoryType()) ? "内部" : "EXTERNAL".equalsIgnoreCase(dto.getFactoryType()) ? "外部" : "";
                String combined = String.join(" ",
                        Optional.ofNullable(dto.getOrderNo()).orElse(""),
                        Optional.ofNullable(dto.getStyleNo()).orElse(""),
                        Optional.ofNullable(dto.getStyleName()).orElse(""),
                        Optional.ofNullable(dto.getSku()).orElse(""),
                        Optional.ofNullable(dto.getFactoryName()).orElse(""),
                        Optional.ofNullable(dto.getParentOrgUnitName()).orElse(""),
                        Optional.ofNullable(dto.getOrgPath()).orElse(""),
                        factoryTypeLabel
                ).toLowerCase(Locale.ROOT);
                if (!combined.contains(keyword.toLowerCase(Locale.ROOT))) {
                    match = false;
                }
            }

            if (match) {
                dtoList.add(dto);
            }
        }

        // 构建分页结果
        Page<FinishedInventoryDTO> resultPage = new Page<>(page, pageSize, dtoList.size());
        resultPage.setRecords(dtoList);
        return resultPage;
    }

    private List<ProductionOrder> loadProductionOrdersByIdsSafely(Set<String> orderIds, String scene) {
        if (orderIds == null || orderIds.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return productionOrderService.listByIds(orderIds);
        } catch (Exception ex) {
            log.error("[{}] 按ID加载生产订单失败，跳过订单补充字段，orderIds={}", scene, orderIds, ex);
            return Collections.emptyList();
        }
    }

    private List<ProductionOrder> loadProductionOrdersByNosSafely(Set<String> orderNos, String scene) {
        if (orderNos == null || orderNos.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                    .in(ProductionOrder::getOrderNo, orderNos)
                    .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0)));
        } catch (Exception ex) {
            log.error("[{}] 按单号加载生产订单失败，跳过订单补充字段，orderNos={}", scene, orderNos, ex);
            return Collections.emptyList();
        }
    }

    /**
     * 成品出库：扣减对应SKU库存
     *
     * @param params 包含 items 列表，每项含 sku（skuCode）和 quantity
     */
    @Transactional(rollbackFor = Exception.class)
    public void outbound(Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) params.get("items");
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("出库明细不能为空");
        }
        String requestOrderId = trimToNull(params.get("orderId"));
        String requestOrderNo = trimToNull(params.get("orderNo"));
        String requestWarehouse = trimToNull(params.get("warehouseLocation"));
        String trackingNo = trimToNull(params.get("trackingNo"));
        String expressCompany = trimToNull(params.get("expressCompany"));
        // 客户信息（出库必须选择客户）
        String customerName = trimToNull(params.get("customerName"));
        if (!StringUtils.hasText(customerName)) {
            throw new IllegalArgumentException("出库必须选择客户");
        }
        String customerPhone = trimToNull(params.get("customerPhone"));
        String shippingAddress = trimToNull(params.get("shippingAddress"));

        for (Map<String, Object> item : items) {
            String skuCode = (String) item.get("sku");
            if (!StringUtils.hasText(skuCode)) {
                throw new IllegalArgumentException("SKU编码不能为空");
            }
            int quantity = Integer.parseInt(item.getOrDefault("quantity", "0").toString());
            if (quantity <= 0) {
                throw new IllegalArgumentException("出库数量必须大于0: " + skuCode);
            }
            LambdaQueryWrapper<ProductSku> wrapper = new LambdaQueryWrapper<ProductSku>()
                    .eq(ProductSku::getSkuCode, skuCode);
            ProductSku sku = productSkuService.getOne(wrapper);
            if (sku == null) {
                throw new IllegalArgumentException("SKU不存在: " + skuCode);
            }
            int current = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
            if (current < quantity) {
                throw new IllegalArgumentException(
                        "库存不足: " + skuCode + "，可用库存:" + current + "件，申请出库:" + quantity + "件");
            }
            sku.setStockQuantity(current - quantity);
            productSkuService.updateById(sku);

                recordProductOutstock(sku, quantity, requestOrderId, requestOrderNo, requestWarehouse,
                    "成品库存页面出库|sku=" + skuCode, trackingNo, expressCompany,
                    customerName, customerPhone, shippingAddress);
        }
        // 出库后回写电商订单状态（如果同一批出库挺带了关联的生产单号 + 快递单号）
        String productionOrderNo = (String) params.get("productionOrderNo");
        if (StringUtils.hasText(productionOrderNo)) {
            try {
                ecommerceOrderOrchestrator.onWarehouseOutbound(productionOrderNo,
                        trackingNo != null ? trackingNo : "", expressCompany != null ? expressCompany : "");
            } catch (Exception ex) {
                log.warn("[EC回写失败不阻塞主流程] productionOrderNo={} err={}", productionOrderNo, ex.getMessage());
            }
        }
    }

    /**
     * QR码扫码出库：支持批量，每项传入 qrCode（格式 款号-颜色-尺码-序号）和 quantity。
     * 自动剥离末尾序号，映射到 skuCode 后复用标准出库逻辑。
     *
     * @param items 列表，每项含 qrCode 和 quantity
     */
    @Transactional(rollbackFor = Exception.class)
    public void qrcodeOutbound(Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) params.get("items");
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("出库明细不能为空");
        }
        // 合并同一 skuCode 的数量（同一款式可能扫多个序号）
        Map<String, Integer> skuQtyMap = new java.util.LinkedHashMap<>();
        for (Map<String, Object> item : items) {
            String qrCode = (String) item.get("qrCode");
            if (!StringUtils.hasText(qrCode)) {
                throw new IllegalArgumentException("二维码内容不能为空");
            }
            int quantity = Integer.parseInt(item.getOrDefault("quantity", "1").toString());
            if (quantity <= 0) {
                throw new IllegalArgumentException("出库数量必须大于0: " + qrCode);
            }
            // 剥离末尾序号：款号-颜色-尺码-序号 → 款号-颜色-尺码
            String[] parts = qrCode.split("-");
            String skuCode = parts.length > 3
                    ? String.join("-", java.util.Arrays.copyOf(parts, parts.length - 1))
                    : qrCode;
            skuQtyMap.merge(skuCode, quantity, Integer::sum);
        }
        // 构造 outbound params，保留客户信息复用标准出库逻辑
        List<Map<String, Object>> stdItems = new java.util.ArrayList<>();
        for (Map.Entry<String, Integer> e : skuQtyMap.entrySet()) {
            Map<String, Object> m = new java.util.HashMap<>();
            m.put("sku", e.getKey());
            m.put("quantity", e.getValue());
            stdItems.add(m);
        }
        Map<String, Object> outboundParams = new java.util.HashMap<>(params);
        outboundParams.put("items", stdItems);
        outbound(outboundParams);
    }

    private void recordProductOutstock(ProductSku sku,
                                       int quantity,
                                       String orderId,
                                       String orderNo,
                                       String warehouse,
                                       String remark,
                                       String trackingNo,
                                       String expressCompany,
                                       String customerName,
                                       String customerPhone,
                                       String shippingAddress) {
        ProductOutstock outstock = new ProductOutstock();
        LocalDateTime now = LocalDateTime.now();
        StyleInfo styleInfo = sku.getStyleId() == null ? null : styleInfoService.getById(sku.getStyleId());
        outstock.setOutstockNo(buildOutstockNo(now));
        outstock.setOrderId(orderId);
        outstock.setOrderNo(StringUtils.hasText(orderNo)
                ? orderNo
                : styleInfo != null && StringUtils.hasText(styleInfo.getOrderNo()) ? styleInfo.getOrderNo() : null);
        outstock.setStyleId(sku.getStyleId() == null ? null : String.valueOf(sku.getStyleId()));
        outstock.setStyleNo(StringUtils.hasText(sku.getStyleNo())
                ? sku.getStyleNo()
                : styleInfo != null ? styleInfo.getStyleNo() : null);
        outstock.setStyleName(styleInfo != null ? styleInfo.getStyleName() : null);
        outstock.setOutstockQuantity(quantity);
        outstock.setOutstockType("shipment");
        outstock.setWarehouse(warehouse);
        outstock.setRemark(remark);

        // SKU明细字段
        outstock.setSkuCode(sku.getSkuCode());
        outstock.setColor(sku.getColor());
        outstock.setSize(sku.getSize());
        outstock.setCostPrice(sku.getCostPrice());
        outstock.setSalesPrice(sku.getSalesPrice());

        // 物流字段
        outstock.setTrackingNo(trackingNo);
        outstock.setExpressCompany(expressCompany);

        // 客户与收款字段
        outstock.setCustomerName(customerName);
        outstock.setCustomerPhone(customerPhone);
        outstock.setShippingAddress(shippingAddress);
        // 自动计算出库金额：售价 × 数量
        if (sku.getSalesPrice() != null) {
            outstock.setTotalAmount(sku.getSalesPrice().multiply(BigDecimal.valueOf(quantity)));
        }
        outstock.setPaidAmount(BigDecimal.ZERO);
        outstock.setPaymentStatus("unpaid");

        // 显式设置操作人/创建人（防止 MetaObjectHandler 取不到上下文导致默认"系统管理员"）
        String ctxUserId = UserContext.userId();
        String ctxUsername = UserContext.username();
        outstock.setOperatorId(ctxUserId);
        outstock.setOperatorName(ctxUsername);
        outstock.setCreatorId(ctxUserId);
        outstock.setCreatorName(ctxUsername);

        outstock.setCreateTime(now);
        outstock.setUpdateTime(now);
        outstock.setDeleteFlag(0);
        productOutstockService.save(outstock);
    }

    /**
     * 分页查询出库记录
     */
    public IPage<ProductOutstock> listOutstockRecords(Map<String, Object> params) {
        int page = Integer.parseInt(params.getOrDefault("page", "1").toString());
        int pageSize = Integer.parseInt(params.getOrDefault("pageSize", "20").toString());
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<ProductOutstock> wrapper = new LambdaQueryWrapper<ProductOutstock>()
                .eq(tenantId != null, ProductOutstock::getTenantId, tenantId)
                .eq(ProductOutstock::getDeleteFlag, 0);

        String keyword = trimToNull(params.get("keyword"));
        if (keyword != null) {
            wrapper.and(w -> w.like(ProductOutstock::getOutstockNo, keyword)
                    .or().like(ProductOutstock::getOrderNo, keyword)
                    .or().like(ProductOutstock::getStyleNo, keyword)
                    .or().like(ProductOutstock::getSkuCode, keyword)
                    .or().like(ProductOutstock::getTrackingNo, keyword));
        }

        String outstockType = trimToNull(params.get("outstockType"));
        if (outstockType != null) {
            wrapper.eq(ProductOutstock::getOutstockType, outstockType);
        }

        String paymentStatus = trimToNull(params.get("paymentStatus"));
        if (paymentStatus != null) {
            wrapper.eq(ProductOutstock::getPaymentStatus, paymentStatus);
        }

        // 支持客户名搜索
        String customerName = trimToNull(params.get("customerName"));
        if (customerName != null) {
            wrapper.like(ProductOutstock::getCustomerName, customerName);
        }

        wrapper.orderByDesc(ProductOutstock::getCreateTime);
        return productOutstockService.page(new Page<>(page, pageSize), wrapper);
    }

    /**
     * 确认收款
     */
    @Transactional(rollbackFor = Exception.class)
    public void confirmPayment(String id, BigDecimal paidAmount) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("出库记录ID不能为空");
        }
        if (paidAmount == null || paidAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("收款金额必须大于0");
        }
        ProductOutstock outstock = productOutstockService.getById(id);
        if (outstock == null) {
            throw new IllegalArgumentException("出库记录不存在");
        }

        BigDecimal currentPaid = outstock.getPaidAmount() != null ? outstock.getPaidAmount() : BigDecimal.ZERO;
        BigDecimal newPaid = currentPaid.add(paidAmount);
        outstock.setPaidAmount(newPaid);

        BigDecimal total = outstock.getTotalAmount();
        if (total != null && newPaid.compareTo(total) >= 0) {
            outstock.setPaymentStatus("paid");
            outstock.setSettlementTime(LocalDateTime.now());
        } else {
            outstock.setPaymentStatus("partial");
        }
        outstock.setUpdateTime(LocalDateTime.now());
        productOutstockService.updateById(outstock);
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return StringUtils.hasText(text) ? text : null;
    }

    private String buildOutstockNo(LocalDateTime now) {
        return "FI" + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + Integer.toHexString(ThreadLocalRandom.current().nextInt(0x1000, 0x10000)).toUpperCase(Locale.ROOT);
    }
}
