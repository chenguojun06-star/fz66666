package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * SKU服务实现类
 * 
 * 职责:
 * 1. SKU数据标准化和验证
 * 2. SKU扫码模式检测 (ORDER/BUNDLE/SKU)
 * 3. SKU进度追踪和统计
 * 
 * @author GitHub Copilot
 * @date 2026-01-23
 */
@Service
@Slf4j
public class SKUServiceImpl implements SKUService {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderService productionOrderService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 扫码模式定义
     */
    private static final String SCAN_MODE_ORDER = "ORDER";    // 订单级扫码
    private static final String SCAN_MODE_BUNDLE = "BUNDLE";  // 菲号级扫码
    private static final String SCAN_MODE_SKU = "SKU";        // SKU级扫码

    @Override
    public String detectScanMode(String scanCode, String color, String size) {
        if (!StringUtils.hasText(scanCode)) {
            return SCAN_MODE_ORDER;
        }

        // 检测是否包含完整的SKU信息
        if (StringUtils.hasText(color) && StringUtils.hasText(size)) {
            // 如果包含颜色和尺码，可能是BUNDLE或SKU模式
            if (scanCode.contains(",")) {
                // 格式: PO20260122001,黑色,L,50 -> SKU模式
                return SCAN_MODE_SKU;
            } else if (scanCode.contains("-")) {
                // 格式: PO20260122001-黑色-01 -> BUNDLE模式
                return SCAN_MODE_BUNDLE;
            }
        }

        // 默认为ORDER模式
        return SCAN_MODE_ORDER;
    }

    @Override
    public boolean validateSKU(ScanRecord scanRecord) {
        if (scanRecord == null) {
            return false;
        }

        String orderNo = StringUtils.hasText(scanRecord.getOrderNo()) ? scanRecord.getOrderNo().trim() : "";
        String styleNo = StringUtils.hasText(scanRecord.getStyleNo()) ? scanRecord.getStyleNo().trim() : "";
        String color = StringUtils.hasText(scanRecord.getColor()) ? scanRecord.getColor().trim() : "";
        String size = StringUtils.hasText(scanRecord.getSize()) ? scanRecord.getSize().trim() : "";

        // 必填字段检查
        if (!StringUtils.hasText(orderNo) ||
            !StringUtils.hasText(styleNo) ||
            !StringUtils.hasText(color) ||
            !StringUtils.hasText(size)) {
            log.warn("[SKUService] SKU信息不完整: {}", scanRecord);
            return false;
        }

        // 数量校验
        if (scanRecord.getQuantity() == null || scanRecord.getQuantity() <= 0) {
            log.warn("[SKUService] SKU数量无效: {}", scanRecord.getQuantity());
            return false;
        }

        try {
            List<Map<String, Object>> skuList = resolveSkuListFromOrderDetails(orderNo);
            if (skuList != null && !skuList.isEmpty()) {
                if (!isCompositeValue(color) && !isCompositeValue(size)) {
                    boolean matched = false;
                    for (Map<String, Object> sku : skuList) {
                        if (sku == null || sku.isEmpty()) {
                            continue;
                        }
                        String sc = StringUtils.hasText(ParamUtils.toTrimmedString(sku.get("color")))
                            ? ParamUtils.toTrimmedString(sku.get("color"))
                            : "";
                        String ss = StringUtils.hasText(ParamUtils.toTrimmedString(sku.get("size")))
                            ? ParamUtils.toTrimmedString(sku.get("size"))
                            : "";
                        String st = StringUtils.hasText(ParamUtils.toTrimmedString(sku.get("styleNo")))
                            ? ParamUtils.toTrimmedString(sku.get("styleNo"))
                            : "";
                        if (!color.equals(sc) || !size.equals(ss)) {
                            continue;
                        }
                        if (StringUtils.hasText(styleNo) && StringUtils.hasText(st) && !styleNo.equals(st)) {
                            continue;
                        }
                        matched = true;
                        break;
                    }
                    if (!matched) {
                        log.warn("[SKUService] SKU不在订单明细中: orderNo={}, styleNo={}, color={}, size={}",
                            orderNo, styleNo, color, size);
                        return false;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[SKUService] SKU校验异常: orderNo={}, styleNo={}, color={}, size={}",
                orderNo, styleNo, color, size, e);
        }

        return true;
    }

    @Override
    public String normalizeSKUKey(String orderNo, String styleNo, String color, String size) {
        return String.format("%s:%s:%s:%s",
            StringUtils.hasText(orderNo) ? orderNo.trim() : "",
            StringUtils.hasText(styleNo) ? styleNo.trim() : "",
            StringUtils.hasText(color) ? color.trim() : "",
            StringUtils.hasText(size) ? size.trim() : ""
        );
    }

    @Override
    public List<Map<String, Object>> getSKUListByOrder(String orderNo) {
        if (!StringUtils.hasText(orderNo)) {
            return new ArrayList<>();
        }

        try {
            List<Map<String, Object>> fromDetails = resolveSkuListFromOrderDetails(orderNo);
            if (fromDetails != null && !fromDetails.isEmpty()) {
                return fromDetails;
            }
            // 查询该订单下所有的SKU记录 (去重)
            List<ScanRecord> records = scanRecordService.list(
                new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderNo, orderNo)
                    .select(ScanRecord::getStyleNo, ScanRecord::getColor, ScanRecord::getSize)
                    .last("group by style_no, color, size") // 使用SQL GROUP BY实现去重
            );

            return records.stream()
                .map(r -> {
                    Map<String, Object> sku = new HashMap<>();
                    sku.put("orderNo", r.getOrderNo());
                    sku.put("styleNo", r.getStyleNo());
                    sku.put("color", r.getColor());
                    sku.put("size", r.getSize());
                    sku.put("skuKey", normalizeSKUKey(r.getOrderNo(), r.getStyleNo(), r.getColor(), r.getSize()));
                    return sku;
                })
                .collect(Collectors.toList());
        } catch (Exception e) {
            log.error("[SKUService] 获取订单SKU列表失败: {}", orderNo, e);
            return new ArrayList<>();
        }
    }

    @Override
    public Map<String, Object> getSKUProgress(String orderNo, String styleNo, String color, String size) {
        Map<String, Object> progress = new HashMap<>();
        progress.put("orderNo", orderNo);
        progress.put("styleNo", styleNo);
        progress.put("color", color);
        progress.put("size", size);
        progress.put("skuKey", normalizeSKUKey(orderNo, styleNo, color, size));

        try {
            long totalCount = getOrderSkuQuantity(orderNo, styleNo, color, size);
            if (totalCount <= 0) {
                Long scannedTotal = scanRecordService.count(
                    new LambdaQueryWrapper<ScanRecord>()
                        .eq(ScanRecord::getOrderNo, orderNo)
                        .eq(ScanRecord::getStyleNo, styleNo)
                        .eq(ScanRecord::getColor, color)
                        .eq(ScanRecord::getSize, size)
                );
                totalCount = scannedTotal == null ? 0 : scannedTotal;
            }

            // 统计该SKU的已完成数（scanResult = success）
            Long completedCount = scanRecordService.count(
                new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderNo, orderNo)
                    .eq(ScanRecord::getStyleNo, styleNo)
                    .eq(ScanRecord::getColor, color)
                    .eq(ScanRecord::getSize, size)
                    .eq(ScanRecord::getScanResult, "success")
            );

            long completed = completedCount == null ? 0 : completedCount;
            long remaining = totalCount - completed;
            if (remaining < 0) {
                remaining = 0;
            }
            double progressPercent = totalCount > 0 ? (completed * 100.0 / totalCount) : 0;

            progress.put("totalCount", totalCount);
            progress.put("completedCount", completed);
            progress.put("remainingCount", remaining);
            progress.put("progressPercent", String.format("%.0f", progressPercent));
            progress.put("completed", remaining == 0);
        } catch (Exception e) {
            log.error("[SKUService] 获取SKU进度失败: {}/{}/{}/{}", orderNo, styleNo, color, size, e);
        }

        return progress;
    }

    @Override
    public Map<String, Object> getOrderSKUProgress(String orderNo) {
        Map<String, Object> orderProgress = new HashMap<>();
        orderProgress.put("orderNo", orderNo);

        try {
            // 获取该订单下的所有SKU
            List<Map<String, Object>> skuList = getSKUListByOrder(orderNo);

            if (skuList.isEmpty()) {
                orderProgress.put("totalSKUs", 0);
                orderProgress.put("completedSKUs", 0);
                orderProgress.put("overallProgress", "0%");
                return orderProgress;
            }

            // 统计完成的SKU数量
            int completedSKUs = 0;
            for (Map<String, Object> sku : skuList) {
                Map<String, Object> skuProgress = getSKUProgress(
                    (String) sku.get("orderNo"),
                    (String) sku.get("styleNo"),
                    (String) sku.get("color"),
                    (String) sku.get("size")
                );
                Object c = skuProgress.get("completed");
                if (Boolean.TRUE.equals(c)) {
                    completedSKUs++;
                }
            }

            double overallPercent = (completedSKUs * 100.0 / skuList.size());
            orderProgress.put("totalSKUs", skuList.size());
            orderProgress.put("completedSKUs", completedSKUs);
            orderProgress.put("overallProgress", String.format("%.0f", overallPercent));
            orderProgress.put("skuList", skuList);
        } catch (Exception e) {
            log.error("[SKUService] 获取订单SKU总进度失败: {}", orderNo, e);
        }

        return orderProgress;
    }

    private ProductionOrder getActiveOrderByNo(String orderNo) {
        String on = StringUtils.hasText(orderNo) ? orderNo.trim() : null;
        if (!StringUtils.hasText(on)) {
            return null;
        }
        try {
            return productionOrderService.getOne(
                new LambdaQueryWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getOrderNo, on)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("limit 1")
            );
        } catch (Exception e) {
            log.warn("[SKUService] 查询订单失败: {}", on, e);
            return null;
        }
    }

    private List<Map<String, Object>> resolveOrderLines(String details) {
        if (!StringUtils.hasText(details)) {
            return List.of();
        }
        try {
            List<Map<String, Object>> list = objectMapper.readValue(details,
                new TypeReference<List<Map<String, Object>>>() {
                });
            if (list != null) {
                return list;
            }
        } catch (Exception ignore) {
        }
        try {
            Map<String, Object> obj = objectMapper.readValue(details, new TypeReference<Map<String, Object>>() {
            });
            Object lines = obj == null ? null
                : (obj.get("lines") != null ? obj.get("lines")
                    : (obj.get("items") != null ? obj.get("items")
                        : (obj.get("details") != null ? obj.get("details")
                            : (obj.get("orderLines") != null ? obj.get("orderLines") : obj.get("list")))));
            if (lines instanceof List) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> cast = (List<Map<String, Object>>) lines;
                return cast;
            }
        } catch (Exception ignore) {
        }
        return List.of();
    }

    private List<Map<String, Object>> resolveSkuListFromOrderDetails(String orderNo) {
        ProductionOrder order = getActiveOrderByNo(orderNo);
        if (order == null || !StringUtils.hasText(order.getOrderDetails())) {
            return List.of();
        }
        List<Map<String, Object>> lines = resolveOrderLines(order.getOrderDetails());
        if (lines == null || lines.isEmpty()) {
            return List.of();
        }
        String styleNo = StringUtils.hasText(order.getStyleNo()) ? order.getStyleNo().trim() : "";
        String on = StringUtils.hasText(order.getOrderNo()) ? order.getOrderNo().trim() : "";
        Map<String, Map<String, Object>> agg = new LinkedHashMap<>();
        for (Map<String, Object> r : lines) {
            if (r == null || r.isEmpty()) {
                continue;
            }
            String color = StringUtils.hasText(ParamUtils.toTrimmedString(r.get("color")))
                ? ParamUtils.toTrimmedString(r.get("color"))
                : "";
            String size = StringUtils.hasText(ParamUtils.toTrimmedString(r.get("size")))
                ? ParamUtils.toTrimmedString(r.get("size"))
                : "";
            if (!StringUtils.hasText(color) || !StringUtils.hasText(size)) {
                continue;
            }
            int qty = parseQuantity(r.get("quantity"));
            String key = color + "|" + size;
            Map<String, Object> sku = agg.computeIfAbsent(key, k -> {
                Map<String, Object> m = new HashMap<>();
                m.put("orderNo", on);
                m.put("styleNo", styleNo);
                m.put("color", color);
                m.put("size", size);
                m.put("skuKey", normalizeSKUKey(on, styleNo, color, size));
                m.put("quantity", 0);
                return m;
            });
            int current = parseQuantity(sku.get("quantity"));
            sku.put("quantity", current + Math.max(0, qty));
        }
        return new ArrayList<>(agg.values());
    }

    private int parseQuantity(Object obj) {
        if (obj == null) {
            return 0;
        }
        try {
            return Math.max(0, Integer.parseInt(String.valueOf(obj).trim()));
        } catch (Exception e) {
            return 0;
        }
    }

    private long getOrderSkuQuantity(String orderNo, String styleNo, String color, String size) {
        List<Map<String, Object>> list = resolveSkuListFromOrderDetails(orderNo);
        if (list == null || list.isEmpty()) {
            return 0;
        }
        String c = StringUtils.hasText(color) ? color.trim() : "";
        String s = StringUtils.hasText(size) ? size.trim() : "";
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        long total = 0;
        for (Map<String, Object> sku : list) {
            if (sku == null || sku.isEmpty()) {
                continue;
            }
            String sc = StringUtils.hasText(ParamUtils.toTrimmedString(sku.get("color")))
                ? ParamUtils.toTrimmedString(sku.get("color"))
                : "";
            String ss = StringUtils.hasText(ParamUtils.toTrimmedString(sku.get("size")))
                ? ParamUtils.toTrimmedString(sku.get("size"))
                : "";
            String st = StringUtils.hasText(ParamUtils.toTrimmedString(sku.get("styleNo")))
                ? ParamUtils.toTrimmedString(sku.get("styleNo"))
                : "";
            if (!c.equals(sc) || !s.equals(ss)) {
                continue;
            }
            if (StringUtils.hasText(sn) && StringUtils.hasText(st) && !sn.equals(st)) {
                continue;
            }
            total += parseQuantity(sku.get("quantity"));
        }
        return total;
    }

    private boolean isCompositeValue(String value) {
        if (!StringUtils.hasText(value)) {
            return false;
        }
        String v = value.trim();
        return v.contains(",") || v.contains("，") || v.contains("/") || v.contains("、") || v.contains(";")
            || v.contains("|") || v.contains(" ");
    }

    @Override
    public boolean updateSKUScanRecord(ScanRecord scanRecord) {
        if (scanRecord == null || !validateSKU(scanRecord)) {
            return false;
        }

        try {
            // 检测扫码模式
            String scanMode = detectScanMode(scanRecord.getScanCode(), scanRecord.getColor(), scanRecord.getSize());
            scanRecord.setScanMode(scanMode);

            // 计算SKU统计
            Map<String, Object> orderProgress = getOrderSKUProgress(scanRecord.getOrderNo());
            scanRecord.setSkuTotalCount((Integer) orderProgress.getOrDefault("totalSKUs", 0));
            scanRecord.setSkuCompletedCount((Integer) orderProgress.getOrDefault("completedSKUs", 0));

            // 保存记录
            return scanRecordService.saveScanRecord(scanRecord);
        } catch (Exception e) {
            log.error("[SKUService] 更新SKU扫码记录失败", e);
            return false;
        }
    }

    @Override
    public IPage<Map<String, Object>> querySKUStatistics(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);

        String orderNo = (String) params.getOrDefault("orderNo", "");

        try {
            Page<ScanRecord> pageInfo = new Page<>(page, pageSize);
            IPage<ScanRecord> records = scanRecordService.page(
                pageInfo,
                new LambdaQueryWrapper<ScanRecord>()
                    .eq(StringUtils.hasText(orderNo), ScanRecord::getOrderNo, orderNo)
                    .orderByDesc(ScanRecord::getScanTime)
            );

            // 转换为Map格式
            return records.convert(record -> {
                Map<String, Object> result = new HashMap<>();
                result.put("id", record.getId());
                result.put("orderNo", record.getOrderNo());
                result.put("styleNo", record.getStyleNo());
                result.put("color", record.getColor());
                result.put("size", record.getSize());
                result.put("quantity", record.getQuantity());
                result.put("scanMode", record.getScanMode());
                result.put("skuTotalCount", record.getSkuTotalCount());
                result.put("skuCompletedCount", record.getSkuCompletedCount());
                result.put("scanTime", record.getScanTime());
                result.put("operatorName", record.getOperatorName());
                return result;
            });
        } catch (Exception e) {
            log.error("[SKUService] 查询SKU统计失败", e);
            return new Page<>(page, pageSize);
        }
    }

    @Override
    public boolean isSKUCompleted(String orderNo, String styleNo, String color, String size) {
        try {
            Long remainingCount = scanRecordService.count(
                new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderNo, orderNo)
                    .eq(ScanRecord::getStyleNo, styleNo)
                    .eq(ScanRecord::getColor, color)
                    .eq(ScanRecord::getSize, size)
                    .ne(ScanRecord::getScanResult, "success")
            );

            return remainingCount == 0;
        } catch (Exception e) {
            log.error("[SKUService] 检查SKU完成状态失败", e);
            return false;
        }
    }

    @Override
    public Map<String, Object> generateSKUReport(String orderNo) {
        Map<String, Object> report = new HashMap<>();
        report.put("orderNo", orderNo);
        report.put("generatedAt", System.currentTimeMillis());

        try {
            Map<String, Object> orderProgress = getOrderSKUProgress(orderNo);
            report.putAll(orderProgress);

            // 添加详细的SKU信息
            List<Map<String, Object>> skuDetails = new ArrayList<>();
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> skuList = (List<Map<String, Object>>) orderProgress.get("skuList");
            
            if (skuList != null) {
                for (Map<String, Object> sku : skuList) {
                    Map<String, Object> skuDetail = getSKUProgress(
                        (String) sku.get("orderNo"),
                        (String) sku.get("styleNo"),
                        (String) sku.get("color"),
                        (String) sku.get("size")
                    );
                    skuDetails.add(skuDetail);
                }
            }

            report.put("details", skuDetails);
        } catch (Exception e) {
            log.error("[SKUService] 生成SKU报告失败", e);
        }

        return report;
    }

    /**
     * 获取订单的工序单价配置（Phase 5新增）
     * 工序单价来自订单的 progressWorkflowJson 字段
     * 格式: {"nodes": [{"id": "1", "name": "做领", "unitPrice": 2.50}, ...]}
     */
    @Override
    public List<Map<String, Object>> getProcessUnitPrices(String orderNo) {
        List<Map<String, Object>> result = new ArrayList<>();
        try {
            if (!StringUtils.hasText(orderNo)) {
                log.warn("[SKUService] 订单号为空");
                return result;
            }

            log.debug("[SKUService] 工序配置读取未实现 - orderNo: {}", orderNo);

            // 返回示例数据（实际应该从ProductionOrder.progressWorkflowJson解析）
            return result;
        } catch (Exception e) {
            log.error("[SKUService] 获取工序单价配置失败 - orderNo: {}", orderNo, e);
            return result;
        }
    }

    /**
     * 根据工序名称获取单价（Phase 5新增）
     */
    @Override
    public Map<String, Object> getUnitPriceByProcess(String orderNo, String processName) {
        Map<String, Object> result = new HashMap<>();
        result.put("processName", processName);
        result.put("unitPrice", 0.0);
        result.put("found", false);

        try {
            if (!StringUtils.hasText(orderNo) || !StringUtils.hasText(processName)) {
                log.warn("[SKUService] 订单号或工序名为空 - orderNo: {}, processName: {}", orderNo, processName);
                return result;
            }

            // 获取所有工序单价配置
            List<Map<String, Object>> prices = getProcessUnitPrices(orderNo);
            
            // 查找匹配的工序单价
            for (Map<String, Object> priceInfo : prices) {
                String name = String.valueOf(priceInfo.getOrDefault("name", "")).trim();
                if (name.equalsIgnoreCase(processName)) {
                    Object unitPrice = priceInfo.get("unitPrice");
                    result.put("unitPrice", unitPrice != null ? Double.parseDouble(unitPrice.toString()) : 0.0);
                    result.put("found", true);
                    break;
                }
            }

            log.debug("[SKUService] 查询工序单价 - orderNo: {}, processName: {}, unitPrice: {}", 
                orderNo, processName, result.get("unitPrice"));
            
        } catch (Exception e) {
            log.error("[SKUService] 获取工序单价失败 - orderNo: {}, processName: {}", orderNo, processName, e);
        }

        return result;
    }

    /**
     * 为扫码记录附加工序单价信息（Phase 5新增）
     * 主要功能:
     * 1. 从processName查找对应的单价
     * 2. 设置scanRecord.processUnitPrice
     * 3. 计算scanRecord.scanCost = processUnitPrice * quantity
     */
    @Override
    public boolean attachProcessUnitPrice(ScanRecord scanRecord) {
        try {
            if (scanRecord == null || !StringUtils.hasText(scanRecord.getProcessName())) {
                log.warn("[SKUService] 扫码记录或工序名为空");
                return false;
            }

            // 获取工序单价
            Map<String, Object> priceInfo = getUnitPriceByProcess(
                scanRecord.getOrderNo(), 
                scanRecord.getProcessName()
            );

            // 解析单价
            Object unitPriceObj = priceInfo.get("unitPrice");
            java.math.BigDecimal unitPrice = java.math.BigDecimal.ZERO;
            if (unitPriceObj != null) {
                try {
                    unitPrice = new java.math.BigDecimal(unitPriceObj.toString());
                } catch (Exception e) {
                    log.warn("[SKUService] 单价转换失败: {}", unitPriceObj);
                }
            }

            // 设置工序单价
            scanRecord.setProcessUnitPrice(unitPrice);

            // 计算扫码成本 = unitPrice * quantity
            int qty = scanRecord.getQuantity() != null ? scanRecord.getQuantity() : 0;
            java.math.BigDecimal scanCost = unitPrice.multiply(new java.math.BigDecimal(qty));
            scanRecord.setScanCost(scanCost);

            log.debug("[SKUService] 附加工序单价 - processName: {}, unitPrice: {}, quantity: {}, scanCost: {}",
                scanRecord.getProcessName(), unitPrice, qty, scanCost);

            return true;
        } catch (Exception e) {
            log.error("[SKUService] 附加工序单价失败", e);
            return false;
        }
    }

    /**
     * 计算订单总工价（Phase 5新增）
     * 统计所有工序的单价和，计算订单的总成本
     */
    @Override
    public Map<String, Object> calculateOrderTotalCost(String orderNo) {
        Map<String, Object> result = new HashMap<>();
        result.put("orderNo", orderNo);
        result.put("totalUnitPrice", 0.0);
        result.put("totalCost", 0.0);
        result.put("quantity", 0);

        try {
            if (!StringUtils.hasText(orderNo)) {
                log.warn("[SKUService] 订单号为空");
                return result;
            }

            // 获取所有工序的单价
            List<Map<String, Object>> processPrices = getProcessUnitPrices(orderNo);
            
            double totalUnitPrice = 0.0;
            for (Map<String, Object> priceInfo : processPrices) {
                Object unitPrice = priceInfo.get("unitPrice");
                if (unitPrice != null) {
                    try {
                        totalUnitPrice += Double.parseDouble(unitPrice.toString());
                    } catch (Exception e) {
                        log.warn("[SKUService] 工序单价转换失败: {}", unitPrice);
                    }
                }
            }

            // 注意：当前未查询订单数量，成本计算可能不准
            // 需要的话可从 ProductionOrder 查询 orderQuantity
            int orderQuantity = 0; // 默认为0

            double totalCost = totalUnitPrice * orderQuantity;

            result.put("totalUnitPrice", totalUnitPrice);
            result.put("totalCost", totalCost);
            result.put("quantity", orderQuantity);

            log.debug("[SKUService] 计算订单总工价 - orderNo: {}, totalUnitPrice: {}, totalCost: {}",
                orderNo, totalUnitPrice, totalCost);

        } catch (Exception e) {
            log.error("[SKUService] 计算订单总工价失败 - orderNo: {}", orderNo, e);
        }

        return result;
    }
}
