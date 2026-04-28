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
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.fashion.supplychain.production.helper.SKUDataResolver;
import com.fashion.supplychain.production.helper.ProcessUnitPriceHelper;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
public class SKUServiceImpl implements SKUService {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private SKUDataResolver skuDataResolver;

    @Autowired
    private ProcessUnitPriceHelper processUnitPriceHelper;

    private static final String SCAN_MODE_ORDER = "ORDER";
    private static final String SCAN_MODE_BUNDLE = "BUNDLE";
    private static final String SCAN_MODE_SKU = "SKU";

    @Override
    public String detectScanMode(String scanCode, String color, String size) {
        if (!StringUtils.hasText(scanCode)) {
            return SCAN_MODE_ORDER;
        }

        if (StringUtils.hasText(color) && StringUtils.hasText(size)) {
            if (scanCode.contains(",")) {
                return SCAN_MODE_SKU;
            } else if (scanCode.contains("-")) {
                return SCAN_MODE_BUNDLE;
            }
        }

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

        if (!StringUtils.hasText(orderNo) ||
                !StringUtils.hasText(styleNo) ||
                !StringUtils.hasText(color) ||
                !StringUtils.hasText(size)) {
            log.warn("[SKUService] SKU信息不完整: {}", scanRecord);
            return false;
        }

        if (scanRecord.getQuantity() == null || scanRecord.getQuantity() <= 0) {
            log.warn("[SKUService] SKU数量无效: {}", scanRecord.getQuantity());
            return false;
        }

        try {
            List<Map<String, Object>> skuList = skuDataResolver.resolveSkuListFromOrderDetails(orderNo);
            if (skuList != null && !skuList.isEmpty()) {
                if (!skuDataResolver.isCompositeValue(color) && !skuDataResolver.isCompositeValue(size)) {
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
                StringUtils.hasText(size) ? size.trim() : "");
    }

    @Override
    public List<Map<String, Object>> getSKUListByOrder(String orderNo) {
        if (!StringUtils.hasText(orderNo)) {
            return new ArrayList<>();
        }

        try {
            List<Map<String, Object>> fromDetails = skuDataResolver.resolveSkuListFromOrderDetails(orderNo);
            if (fromDetails != null && !fromDetails.isEmpty()) {
                return fromDetails;
            }
            List<ScanRecord> records = scanRecordService.list(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getOrderNo, orderNo)
                            .ne(ScanRecord::getScanType, "orchestration")
                            .select(ScanRecord::getStyleNo, ScanRecord::getColor, ScanRecord::getSize)
                            .last("group by style_no, color, size")
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
            long totalCount = skuDataResolver.getOrderSkuQuantity(orderNo, styleNo, color, size);
            if (totalCount <= 0) {
                Long scannedTotal = scanRecordService.count(
                        new LambdaQueryWrapper<ScanRecord>()
                                .eq(ScanRecord::getOrderNo, orderNo)
                                .eq(ScanRecord::getStyleNo, styleNo)
                                .eq(ScanRecord::getColor, color)
                                .eq(ScanRecord::getSize, size)
                                .ne(ScanRecord::getScanType, "orchestration"));
                totalCount = scannedTotal == null ? 0 : scannedTotal;
            }

            Long completedCount = scanRecordService.count(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getOrderNo, orderNo)
                            .eq(ScanRecord::getStyleNo, styleNo)
                            .eq(ScanRecord::getColor, color)
                            .eq(ScanRecord::getSize, size)
                            .eq(ScanRecord::getScanResult, "success")
                            .ne(ScanRecord::getScanType, "orchestration"));

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
            List<Map<String, Object>> skuList = getSKUListByOrder(orderNo);

            if (skuList.isEmpty()) {
                orderProgress.put("totalSKUs", 0);
                orderProgress.put("completedSKUs", 0);
                orderProgress.put("overallProgress", "0%");
                return orderProgress;
            }

            List<Map<String, Object>> stats = scanRecordService.getScanStatsByOrder(orderNo);
            Map<String, Long> statsMap = new HashMap<>();
            if (stats != null) {
                for (Map<String, Object> s : stats) {
                    String c = (String) s.get("color");
                    String sz = (String) s.get("size");
                    Object countObj = s.get("count");
                    long count = countObj != null ? Long.parseLong(countObj.toString()) : 0;
                    statsMap.put(c + "|" + sz, count);
                }
            }

            int completedSKUs = 0;
            for (Map<String, Object> sku : skuList) {
                String c = (String) sku.get("color");
                String sz = (String) sku.get("size");
                String sn = (String) sku.get("styleNo");

                long completed = statsMap.getOrDefault(c + "|" + sz, 0L);
                long totalCount = skuDataResolver.getOrderSkuQuantity(orderNo, sn, c, sz);
                long remaining = Math.max(0, totalCount - completed);

                sku.put("totalCount", totalCount);
                sku.put("completedCount", completed);
                sku.put("remainingCount", remaining);
                sku.put("completed", remaining == 0);

                if (remaining == 0 && totalCount > 0) {
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

    @Override
    public boolean updateSKUScanRecord(ScanRecord scanRecord) {
        if (scanRecord == null || !validateSKU(scanRecord)) {
            return false;
        }

        try {
            String scanMode = detectScanMode(scanRecord.getScanCode(), scanRecord.getColor(), scanRecord.getSize());
            scanRecord.setScanMode(scanMode);

            Map<String, Object> orderProgress = getOrderSKUProgress(scanRecord.getOrderNo());
            scanRecord.setSkuTotalCount((Integer) orderProgress.getOrDefault("totalSKUs", 0));
            scanRecord.setSkuCompletedCount((Integer) orderProgress.getOrDefault("completedSKUs", 0));

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
                            .ne(ScanRecord::getScanType, "orchestration")
                            .orderByDesc(ScanRecord::getScanTime));

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
                            .ne(ScanRecord::getScanType, "orchestration"));

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

            List<Map<String, Object>> skuDetails = new ArrayList<>();
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> skuList = (List<Map<String, Object>>) orderProgress.get("skuList");

            if (skuList != null) {
                for (Map<String, Object> sku : skuList) {
                    Map<String, Object> skuDetail = getSKUProgress(
                            (String) sku.get("orderNo"),
                            (String) sku.get("styleNo"),
                            (String) sku.get("color"),
                            (String) sku.get("size"));
                    skuDetails.add(skuDetail);
                }
            }

            report.put("details", skuDetails);
        } catch (Exception e) {
            log.error("[SKUService] 生成SKU报告失败", e);
        }

        return report;
    }

    @Override
    public List<Map<String, Object>> getProcessUnitPrices(String orderNo) {
        return processUnitPriceHelper.getProcessUnitPrices(orderNo);
    }

    @Override
    public Map<String, Object> getUnitPriceByProcess(String orderNo, String processName) {
        return processUnitPriceHelper.getUnitPriceByProcess(orderNo, processName);
    }

    @Override
    public boolean attachProcessUnitPrice(ScanRecord scanRecord) {
        return processUnitPriceHelper.attachProcessUnitPrice(scanRecord);
    }

    @Override
    public Map<String, Object> calculateOrderTotalCost(String orderNo) {
        return processUnitPriceHelper.calculateOrderTotalCost(orderNo);
    }
}
