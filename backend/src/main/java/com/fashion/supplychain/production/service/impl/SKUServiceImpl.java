package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.production.service.ScanRecordService;
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
    private ScanRecordMapper scanRecordMapper;

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

        // 必填字段检查
        if (!StringUtils.hasText(scanRecord.getOrderNo()) ||
            !StringUtils.hasText(scanRecord.getStyleNo()) ||
            !StringUtils.hasText(scanRecord.getColor()) ||
            !StringUtils.hasText(scanRecord.getSize())) {
            log.warn("[SKUService] SKU信息不完整: {}", scanRecord);
            return false;
        }

        // 数量校验
        if (scanRecord.getQuantity() == null || scanRecord.getQuantity() <= 0) {
            log.warn("[SKUService] SKU数量无效: {}", scanRecord.getQuantity());
            return false;
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
            // 统计该SKU的总数量
            Long totalCount = scanRecordService.count(
                new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderNo, orderNo)
                    .eq(ScanRecord::getStyleNo, styleNo)
                    .eq(ScanRecord::getColor, color)
                    .eq(ScanRecord::getSize, size)
            );

            // 统计该SKU的已完成数（scanResult = success）
            Long completedCount = scanRecordService.count(
                new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderNo, orderNo)
                    .eq(ScanRecord::getStyleNo, styleNo)
                    .eq(ScanRecord::getColor, color)
                    .eq(ScanRecord::getSize, size)
                    .eq(ScanRecord::getScanResult, "success")
            );

            long remaining = totalCount - completedCount;
            double progressPercent = totalCount > 0 ? (completedCount * 100.0 / totalCount) : 0;

            progress.put("totalCount", totalCount);
            progress.put("completedCount", completedCount);
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
                if ((Boolean) skuProgress.getOrDefault("completed", false)) {
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
}
