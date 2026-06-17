package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.OrderWasteAnalysisDTO;
import com.fashion.supplychain.production.dto.OrderWasteSummaryDTO;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.ProductSkuService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class OrderWasteAnalysisOrchestrator {

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private ProductSkuService productSkuService;

    public IPage<OrderWasteAnalysisDTO> getWasteAnalysisPage(Long current, Long size,
            String styleNo, String orderNo, String factoryName, String factoryType, String dateRange) {

        Page<ProductionOrder> page = new Page<>(current, size);
        LambdaQueryWrapper<ProductionOrder> wrapper = buildQueryWrapper(styleNo, orderNo, factoryName, factoryType, dateRange);

        IPage<ProductionOrder> orderPage = productionOrderMapper.selectPage(page, wrapper);
        List<OrderWasteAnalysisDTO> dtoList = convertToDTOList(orderPage.getRecords());

        return new Page<OrderWasteAnalysisDTO>()
                .setRecords(dtoList)
                .setTotal(orderPage.getTotal())
                .setCurrent(orderPage.getCurrent())
                .setSize(orderPage.getSize());
    }

    public OrderWasteSummaryDTO getWasteSummary(String styleNo, String orderNo, String factoryName, String factoryType, String dateRange) {
        LambdaQueryWrapper<ProductionOrder> wrapper = buildQueryWrapper(styleNo, orderNo, factoryName, factoryType, dateRange);
        List<ProductionOrder> orders = productionOrderMapper.selectList(wrapper);

        return computeSummary(orders);
    }

    private LambdaQueryWrapper<ProductionOrder> buildQueryWrapper(String styleNo, String orderNo,
            String factoryName, String factoryType, String dateRange) {

        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(UserContext.tenantId() != null, ProductionOrder::getTenantId, UserContext.tenantId());

        if (styleNo != null && !styleNo.trim().isEmpty()) {
            wrapper.like(ProductionOrder::getStyleNo, styleNo.trim());
        }
        if (orderNo != null && !orderNo.trim().isEmpty()) {
            wrapper.like(ProductionOrder::getOrderNo, orderNo.trim());
        }
        if (factoryName != null && !factoryName.trim().isEmpty()) {
            wrapper.like(ProductionOrder::getFactoryName, factoryName.trim());
        }
        if (factoryType != null && !factoryType.trim().isEmpty()) {
            wrapper.eq(ProductionOrder::getFactoryType, factoryType.trim());
        }
        if (dateRange != null && !dateRange.trim().isEmpty()) {
            String[] dates = dateRange.split("~");
            if (dates.length == 2) {
                LocalDateTime start = LocalDate.parse(dates[0].trim()).atStartOfDay();
                LocalDateTime end = LocalDate.parse(dates[1].trim()).atTime(23, 59, 59);
                wrapper.between(ProductionOrder::getCreateTime, start, end);
            }
        }

        wrapper.orderByDesc(ProductionOrder::getCreateTime);
        return wrapper;
    }

    private List<OrderWasteAnalysisDTO> convertToDTOList(List<ProductionOrder> orders) {
        if (orders.isEmpty()) return new ArrayList<>();

        Map<String, BigDecimal> materialCostMap = buildMaterialCostMap(orders);
        Map<String, BigDecimal> processCostMap = buildProcessCostMap(orders);
        // 批量获取款号颜色图片映射
        Map<String, Map<String, String>> styleColorImagesMap = buildStyleColorImagesMap(orders);

        return orders.stream()
                .map(order -> convertToDTO(order, materialCostMap, processCostMap, styleColorImagesMap))
                .collect(Collectors.toList());
    }

    private Map<String, Map<String, String>> buildStyleColorImagesMap(List<ProductionOrder> orders) {
        Map<String, Map<String, String>> result = new HashMap<>();
        for (ProductionOrder order : orders) {
            String styleNo = order.getStyleNo();
            if (styleNo != null && !result.containsKey(styleNo)) {
                Map<String, String> colorImages = productSkuService.getStyleColorImages(styleNo);
                result.put(styleNo, colorImages);
            }
        }
        return result;
    }

    private Map<String, BigDecimal> buildMaterialCostMap(List<ProductionOrder> orders) {
        Map<String, BigDecimal> costMap = new HashMap<>();
        List<String> styleIds = orders.stream()
                .map(ProductionOrder::getStyleId)
                .distinct()
                .collect(Collectors.toList());

        for (String styleId : styleIds) {
            if (styleId == null) {
                costMap.put(styleId, BigDecimal.ZERO);
                continue;
            }
            List<StyleBom> bomList = styleBomService.listByStyleId(Long.parseLong(styleId));
            BigDecimal totalCost = bomList.stream()
                    .map(bom -> {
                        BigDecimal tp = bom.getTotalPrice();
                        if (tp != null) return tp;
                        double usage = bom.getUsageAmount() != null ? bom.getUsageAmount().doubleValue() : 0.0;
                        double loss = bom.getLossRate() != null ? bom.getLossRate().doubleValue() : 0.0;
                        double up = bom.getUnitPrice() != null ? bom.getUnitPrice().doubleValue() : 0.0;
                        return BigDecimal.valueOf(usage * (1.0 + loss / 100.0) * up);
                    })
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            costMap.put(styleId, totalCost);
        }
        return costMap;
    }

    private Map<String, BigDecimal> buildProcessCostMap(List<ProductionOrder> orders) {
        Map<String, BigDecimal> costMap = new HashMap<>();
        List<String> styleIds = orders.stream()
                .map(ProductionOrder::getStyleId)
                .distinct()
                .collect(Collectors.toList());

        for (String styleId : styleIds) {
            if (styleId == null) {
                costMap.put(styleId, BigDecimal.ZERO);
                continue;
            }
            List<StyleProcess> processList = styleProcessService.listByStyleId(Long.parseLong(styleId));
            BigDecimal totalCost = processList.stream()
                    .map(p -> p.getPrice() != null ? p.getPrice() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            costMap.put(styleId, totalCost);
        }
        return costMap;
    }

    private OrderWasteAnalysisDTO convertToDTO(ProductionOrder order,
            Map<String, BigDecimal> materialCostMap, Map<String, BigDecimal> processCostMap,
            Map<String, Map<String, String>> styleColorImagesMap) {

        Integer oq = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
        Integer cq = order.getCuttingQuantity() != null ? order.getCuttingQuantity() : 0;
        Integer compq = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
        Integer wq = order.getWarehousingQualifiedQuantity() != null ? order.getWarehousingQualifiedQuantity() : 0;
        Integer oeq = order.getOutstockQuantity() != null ? order.getOutstockQuantity() : 0;
        Integer uq = order.getUnqualifiedQuantity() != null ? order.getUnqualifiedQuantity() : 0;

        int cuttingWaste = Math.max(0, oq - cq);
        int productionWaste = Math.max(0, cq - compq);
        int qualityWaste = Math.max(0, compq - wq) + uq;
        int shipmentWaste = Math.max(0, wq - oeq);
        int totalWaste = cuttingWaste + productionWaste + qualityWaste + shipmentWaste;

        BigDecimal materialCost = materialCostMap.getOrDefault(order.getStyleId(), BigDecimal.ZERO);
        BigDecimal processCost = processCostMap.getOrDefault(order.getStyleId(), BigDecimal.ZERO);
        BigDecimal totalCost = materialCost.add(processCost);

        BigDecimal unitCostWithoutWaste = oq > 0 ? totalCost.divide(BigDecimal.valueOf(oq), 4, RoundingMode.HALF_UP) : BigDecimal.ZERO;
        BigDecimal unitCostWithWasteAllocation = oeq > 0 ? totalCost.divide(BigDecimal.valueOf(oeq), 4, RoundingMode.HALF_UP) : BigDecimal.ZERO;
        BigDecimal unitCostIncrease = unitCostWithWasteAllocation.subtract(unitCostWithoutWaste);
        BigDecimal unitCostIncreaseRate = unitCostWithoutWaste.compareTo(BigDecimal.ZERO) > 0
                ? unitCostIncrease.divide(unitCostWithoutWaste, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100))
                : BigDecimal.ZERO;

        String completionTime = "";
        if (order.getUpdateTime() != null) {
            completionTime = order.getUpdateTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        }

        // 获取SKU颜色图片
        String skuColorImage = null;
        String orderColor = order.getColor();
        Map<String, String> colorImages = styleColorImagesMap.get(order.getStyleNo());
        if (colorImages != null && orderColor != null) {
            skuColorImage = colorImages.get(orderColor);
        }

        return OrderWasteAnalysisDTO.builder()
                .id(order.getId())
                .orderNo(order.getOrderNo())
                .styleNo(order.getStyleNo())
                .styleName(order.getStyleName())
                .color(orderColor)
                .skuColorImage(skuColorImage)
                .size(order.getSize())
                .factoryName(order.getFactoryName())
                .customerName(order.getCustomerName() != null ? order.getCustomerName() : order.getCompany())
                .salesChannel(order.getSalesChannel())
                .orderQuantity(oq)
                .cuttingQuantity(cq)
                .completedQuantity(compq)
                .warehousingQualifiedQuantity(wq)
                .outstockQuantity(oeq)
                .unqualifiedQuantity(uq)
                .repairQuantity(order.getRepairQuantity())
                .cuttingWaste(cuttingWaste)
                .cuttingWasteRate(oq > 0 ? BigDecimal.valueOf(cuttingWaste * 100.0 / oq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .productionWaste(productionWaste)
                .productionWasteRate(cq > 0 ? BigDecimal.valueOf(productionWaste * 100.0 / cq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .qualityWaste(qualityWaste)
                .qualityWasteRate(compq > 0 ? BigDecimal.valueOf(qualityWaste * 100.0 / compq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .shipmentWaste(shipmentWaste)
                .shipmentWasteRate(wq > 0 ? BigDecimal.valueOf(shipmentWaste * 100.0 / wq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .totalWaste(totalWaste)
                .totalWasteRate(oq > 0 ? BigDecimal.valueOf(totalWaste * 100.0 / oq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .materialCost(materialCost.setScale(2, RoundingMode.HALF_UP))
                .processCost(processCost.setScale(2, RoundingMode.HALF_UP))
                .totalCost(totalCost.setScale(2, RoundingMode.HALF_UP))
                .unitCostWithoutWaste(unitCostWithoutWaste.setScale(2, RoundingMode.HALF_UP))
                .unitCostWithWasteAllocation(unitCostWithWasteAllocation.setScale(2, RoundingMode.HALF_UP))
                .unitCostIncrease(unitCostIncrease.setScale(2, RoundingMode.HALF_UP))
                .unitCostIncreaseRate(unitCostIncreaseRate.setScale(2, RoundingMode.HALF_UP))
                .orderStatus(order.getStatus())
                .completionTime(completionTime)
                .build();
    }

    private OrderWasteSummaryDTO computeSummary(List<ProductionOrder> orders) {
        if (orders.isEmpty()) {
            return OrderWasteSummaryDTO.builder()
                    .wasteByFactory(new ArrayList<>())
                    .wasteByStyle(new ArrayList<>())
                    .wasteTrend(new ArrayList<>())
                    .build();
        }

        Map<String, BigDecimal> materialCostMap = buildMaterialCostMap(orders);
        Map<String, BigDecimal> processCostMap = buildProcessCostMap(orders);

        int totalOq = 0, totalCq = 0, totalCompq = 0, totalWq = 0, totalOeq = 0;
        int totalCuttingWaste = 0, totalProductionWaste = 0, totalQualityWaste = 0, totalShipmentWaste = 0;
        BigDecimal totalMaterialCost = BigDecimal.ZERO, totalProcessCost = BigDecimal.ZERO;

        for (ProductionOrder order : orders) {
            Integer oq = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
            Integer cq = order.getCuttingQuantity() != null ? order.getCuttingQuantity() : 0;
            Integer compq = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
            Integer wq = order.getWarehousingQualifiedQuantity() != null ? order.getWarehousingQualifiedQuantity() : 0;
            Integer oeq = order.getOutstockQuantity() != null ? order.getOutstockQuantity() : 0;
            Integer uq = order.getUnqualifiedQuantity() != null ? order.getUnqualifiedQuantity() : 0;

            totalOq += oq;
            totalCq += cq;
            totalCompq += compq;
            totalWq += wq;
            totalOeq += oeq;

            totalCuttingWaste += Math.max(0, oq - cq);
            totalProductionWaste += Math.max(0, cq - compq);
            totalQualityWaste += Math.max(0, compq - wq) + uq;
            totalShipmentWaste += Math.max(0, wq - oeq);

            totalMaterialCost = totalMaterialCost.add(materialCostMap.getOrDefault(order.getStyleId(), BigDecimal.ZERO));
            totalProcessCost = totalProcessCost.add(processCostMap.getOrDefault(order.getStyleId(), BigDecimal.ZERO));
        }

        int totalWaste = totalCuttingWaste + totalProductionWaste + totalQualityWaste + totalShipmentWaste;
        BigDecimal totalCost = totalMaterialCost.add(totalProcessCost);

        BigDecimal avgUnitCostWithoutWaste = totalOq > 0 ? totalCost.divide(BigDecimal.valueOf(totalOq), 4, RoundingMode.HALF_UP) : BigDecimal.ZERO;
        BigDecimal avgUnitCostWithWaste = totalOeq > 0 ? totalCost.divide(BigDecimal.valueOf(totalOeq), 4, RoundingMode.HALF_UP) : BigDecimal.ZERO;
        BigDecimal totalCostIncrease = avgUnitCostWithWaste.subtract(avgUnitCostWithoutWaste).multiply(BigDecimal.valueOf(totalOeq));
        BigDecimal avgCostIncreaseRate = avgUnitCostWithoutWaste.compareTo(BigDecimal.ZERO) > 0
                ? avgUnitCostWithWaste.subtract(avgUnitCostWithoutWaste)
                        .divide(avgUnitCostWithoutWaste, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                : BigDecimal.ZERO;

        List<OrderWasteSummaryDTO.WasteByFactoryDTO> wasteByFactory = computeWasteByFactory(orders, materialCostMap, processCostMap);
        List<OrderWasteSummaryDTO.WasteByStyleDTO> wasteByStyle = computeWasteByStyle(orders, materialCostMap, processCostMap);
        List<OrderWasteSummaryDTO.WasteTrendDTO> wasteTrend = computeWasteTrend(orders);

        return OrderWasteSummaryDTO.builder()
                .totalOrderQuantity(totalOq)
                .totalCuttingQuantity(totalCq)
                .totalCompletedQuantity(totalCompq)
                .totalWarehousingQuantity(totalWq)
                .totalOutstockQuantity(totalOeq)
                .totalCuttingWaste(totalCuttingWaste)
                .avgCuttingWasteRate(totalOq > 0 ? BigDecimal.valueOf(totalCuttingWaste * 100.0 / totalOq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .totalProductionWaste(totalProductionWaste)
                .avgProductionWasteRate(totalCq > 0 ? BigDecimal.valueOf(totalProductionWaste * 100.0 / totalCq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .totalQualityWaste(totalQualityWaste)
                .avgQualityWasteRate(totalCompq > 0 ? BigDecimal.valueOf(totalQualityWaste * 100.0 / totalCompq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .totalShipmentWaste(totalShipmentWaste)
                .avgShipmentWasteRate(totalWq > 0 ? BigDecimal.valueOf(totalShipmentWaste * 100.0 / totalWq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .totalWaste(totalWaste)
                .avgTotalWasteRate(totalOq > 0 ? BigDecimal.valueOf(totalWaste * 100.0 / totalOq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .totalMaterialCost(totalMaterialCost.setScale(2, RoundingMode.HALF_UP))
                .totalProcessCost(totalProcessCost.setScale(2, RoundingMode.HALF_UP))
                .totalCost(totalCost.setScale(2, RoundingMode.HALF_UP))
                .avgUnitCostWithoutWaste(avgUnitCostWithoutWaste.setScale(2, RoundingMode.HALF_UP))
                .avgUnitCostWithWaste(avgUnitCostWithWaste.setScale(2, RoundingMode.HALF_UP))
                .totalCostIncrease(totalCostIncrease.setScale(2, RoundingMode.HALF_UP))
                .avgCostIncreaseRate(avgCostIncreaseRate.setScale(2, RoundingMode.HALF_UP))
                .wasteByFactory(wasteByFactory)
                .wasteByStyle(wasteByStyle)
                .wasteTrend(wasteTrend)
                .build();
    }

    private List<OrderWasteSummaryDTO.WasteByFactoryDTO> computeWasteByFactory(
            List<ProductionOrder> orders,
            Map<String, BigDecimal> materialCostMap,
            Map<String, BigDecimal> processCostMap) {

        Map<String, List<ProductionOrder>> grouped = orders.stream()
                .filter(o -> o.getFactoryName() != null && !o.getFactoryName().isEmpty())
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName));

        return grouped.entrySet().stream()
                .map(entry -> {
                    String factoryName = entry.getKey();
                    List<ProductionOrder> factoryOrders = entry.getValue();

                    int oq = 0, waste = 0;
                    for (ProductionOrder order : factoryOrders) {
                        int orderOq = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
                        int oeq = order.getOutstockQuantity() != null ? order.getOutstockQuantity() : 0;
                        oq += orderOq;
                        waste += Math.max(0, orderOq - oeq);
                    }

                    return OrderWasteSummaryDTO.WasteByFactoryDTO.builder()
                            .factoryName(factoryName)
                            .orderQuantity(oq)
                            .wasteQuantity(waste)
                            .wasteRate(oq > 0 ? BigDecimal.valueOf(waste * 100.0 / oq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                            .build();
                })
                .sorted((a, b) -> b.getWasteQuantity().compareTo(a.getWasteQuantity()))
                .collect(Collectors.toList());
    }

    private List<OrderWasteSummaryDTO.WasteByStyleDTO> computeWasteByStyle(
            List<ProductionOrder> orders,
            Map<String, BigDecimal> materialCostMap,
            Map<String, BigDecimal> processCostMap) {

        Map<String, List<ProductionOrder>> grouped = orders.stream()
                .filter(o -> o.getStyleNo() != null && !o.getStyleNo().isEmpty())
                .collect(Collectors.groupingBy(o -> o.getStyleNo() + "-" + o.getStyleName()));

        return grouped.entrySet().stream()
                .map(entry -> {
                    String key = entry.getKey();
                    String styleNo = key.split("-")[0];
                    String styleName = key.substring(key.indexOf("-") + 1);
                    List<ProductionOrder> styleOrders = entry.getValue();

                    int oq = 0, waste = 0;
                    for (ProductionOrder order : styleOrders) {
                        int orderOq = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
                        int oeq = order.getOutstockQuantity() != null ? order.getOutstockQuantity() : 0;
                        oq += orderOq;
                        waste += Math.max(0, orderOq - oeq);
                    }

                    return OrderWasteSummaryDTO.WasteByStyleDTO.builder()
                            .styleNo(styleNo)
                            .styleName(styleName)
                            .orderQuantity(oq)
                            .wasteQuantity(waste)
                            .wasteRate(oq > 0 ? BigDecimal.valueOf(waste * 100.0 / oq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                            .build();
                })
                .sorted((a, b) -> b.getWasteQuantity().compareTo(a.getWasteQuantity()))
                .collect(Collectors.toList());
    }

    private List<OrderWasteSummaryDTO.WasteTrendDTO> computeWasteTrend(List<ProductionOrder> orders) {
        Map<String, List<ProductionOrder>> grouped = orders.stream()
                .filter(o -> o.getCreateTime() != null)
                .collect(Collectors.groupingBy(o -> o.getCreateTime().toLocalDate().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))));

        return grouped.entrySet().stream()
                .map(entry -> {
                    String date = entry.getKey();
                    List<ProductionOrder> dayOrders = entry.getValue();

                    int oq = 0, waste = 0;
                    for (ProductionOrder order : dayOrders) {
                        int orderOq = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
                        int oeq = order.getOutstockQuantity() != null ? order.getOutstockQuantity() : 0;
                        oq += orderOq;
                        waste += Math.max(0, orderOq - oeq);
                    }

                    return OrderWasteSummaryDTO.WasteTrendDTO.builder()
                            .date(date)
                            .orderQuantity(oq)
                            .wasteQuantity(waste)
                            .wasteRate(oq > 0 ? BigDecimal.valueOf(waste * 100.0 / oq).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                            .build();
                })
                .sorted((a, b) -> a.getDate().compareTo(b.getDate()))
                .collect(Collectors.toList());
    }
}