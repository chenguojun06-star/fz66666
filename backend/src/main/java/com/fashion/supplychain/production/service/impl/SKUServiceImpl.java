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
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.fashion.supplychain.production.helper.SKUDataResolver;
import java.util.*;
import java.util.stream.Collectors;

/**
 * SKU服务实现类
 *
 * 职责:
 * 1. SKU数据标准化和验证
 * 2. SKU扫码模式检测 (ORDER/BUNDLE/SKU)
 * 3. SKU进度追踪和统计
 */
@Service
@Slf4j
public class SKUServiceImpl implements SKUService {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private SKUDataResolver skuDataResolver;

    /**
     * 扫码模式定义
     */
    private static final String SCAN_MODE_ORDER = "ORDER"; // 订单级扫码
    private static final String SCAN_MODE_BUNDLE = "BUNDLE"; // 菲号级扫码
    private static final String SCAN_MODE_SKU = "SKU"; // SKU级扫码

    /**
     * 无工资工序列表（管理类工序，不参与工资结算）
     * 这些工序是流程节点，不是实际的手工操作
     */
    private static final Set<String> NON_PAYABLE_PROCESSES = new HashSet<>(Arrays.asList(
            "采购", "下单", "订单创建", "接单", "入库", "成品入库", "验收",
            "procurement", "order", "warehousing", "receiving"
    ));

    private static final List<String> STAGE_ORDER = List.of("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库");

    private static int parseSortNum(String id) {
        if (id == null || id.isEmpty()) return 9999;
        String digits = id.replaceAll("\\D", "");
        if (digits.isEmpty()) return 9999;
        try { return Integer.parseInt(digits); } catch (NumberFormatException e) { return 9999; }
    }

    /**
     * 判断是否为无工资工序
     * @param processName 工序名称
     * @return true=无工资工序，false=有工资工序
     */
    private boolean isNonPayableProcess(String processName) {
        if (!StringUtils.hasText(processName)) {
            return false;
        }
        String pn = processName.trim().toLowerCase();

        // 精确匹配
        for (String nonPayable : NON_PAYABLE_PROCESSES) {
            if (pn.equalsIgnoreCase(nonPayable)) {
                return true;
            }
        }

        // 模糊匹配（包含关键词）
        return pn.contains("采购") || pn.contains("下单") || pn.contains("入库") ||
               pn.contains("procurement") || pn.contains("order") || pn.contains("warehousing");
    }

    /**
     * 根据工序名/进度阶段名推断 scanType（后端唯一权威来源）
     *
     * <p>使用 ProcessSynonymMapping 将任意工序名归一化为标准名称，再映射为 scanType。
     * 端侧（小程序/PC端）直接使用此字段，不再自行推断，彻底消除三端不一致问题。</p>
     *
     * @param processName  工序名（如"做领"、"裁剪"、"大烫"）
     * @param progressStage 父进度节点名（如"车缝"、"尾部"）
     * @return scanType：warehouse | cutting | quality | procurement | production
     */
    private String inferScanTypeFromNames(String processName, String progressStage) {
        // 优先 processName，其次 progressStage
        for (String raw : new String[]{processName, progressStage}) {
            if (!StringUtils.hasText(raw)) continue;
            String norm = com.fashion.supplychain.common.ProcessSynonymMapping.normalize(raw.trim());
            switch (norm) {
                case "入库": return "warehouse";
                case "裁剪": return "cutting";
                case "质检": return "quality";
                case "采购": return "procurement";
            }
        }
        return "production";
    }

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
            // 查询该订单下所有的SKU记录 (去重)
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

            // 统计该SKU的已完成数（scanResult = success）
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
            // 获取该订单下的所有SKU
            List<Map<String, Object>> skuList = getSKUListByOrder(orderNo);

            if (skuList.isEmpty()) {
                orderProgress.put("totalSKUs", 0);
                orderProgress.put("completedSKUs", 0);
                orderProgress.put("overallProgress", "0%");
                return orderProgress;
            }

            // 优化：一次性查询所有SKU的扫码统计，避免N+1查询
            List<Map<String, Object>> stats = scanRecordService.getScanStatsByOrder(orderNo);
            Map<String, Long> statsMap = new HashMap<>();
            if (stats != null) {
                for (Map<String, Object> s : stats) {
                    String color = (String) s.get("color");
                    String size = (String) s.get("size");
                    Object countObj = s.get("count");
                    long count = countObj != null ? Long.parseLong(countObj.toString()) : 0;
                    statsMap.put(color + "|" + size, count);
                }
            }

            // 统计完成的SKU数量
            int completedSKUs = 0;
            for (Map<String, Object> sku : skuList) {
                String color = (String) sku.get("color");
                String size = (String) sku.get("size");
                String styleNo = (String) sku.get("styleNo");

                // 从内存Map获取已完成数量
                long completed = statsMap.getOrDefault(color + "|" + size, 0L);
                long totalCount = skuDataResolver.getOrderSkuQuantity(orderNo, styleNo, color, size);
                long remaining = Math.max(0, totalCount - completed);

                // 更新SKU对象的进度信息 (用于前端展示)
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
                            .ne(ScanRecord::getScanType, "orchestration")
                            .orderByDesc(ScanRecord::getScanTime));

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

            ProductionOrder order = productionOrderService.getOne(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getOrderNo, orderNo)
                            .eq(ProductionOrder::getDeleteFlag, 0)
                            .last("LIMIT 1"));

            if (order == null) {
                log.warn("[SKUService] 订单不存在 - orderNo: {}", orderNo);
                return result;
            }

            String workflowJson = order.getProgressWorkflowJson();
            if (!StringUtils.hasText(workflowJson)) {
                log.warn("[SKUService] 订单无工序配置 - orderNo: {}", orderNo);
                return result;
            }

            log.info("[SKUService] 开始解析工序单价 - orderNo: {}, json长度: {}", orderNo, workflowJson.length());

            List<Map<String, Object>> nodes = parseWorkflowNodes(workflowJson);
            if (nodes == null || nodes.isEmpty()) {
                log.warn("[SKUService] workflow.nodes为空 - orderNo: {}", orderNo);
                return result;
            }

            log.info("[SKUService] 找到 {} 个工序节点", nodes.size());

            collectPriceInfoFromNodes(nodes, result);

            log.debug("[SKUService] 获取工序单价配置完成 - orderNo: {}, 成功解析: {} 个", orderNo, result.size());

            mergeTemplateStageMapping(order, result);
            inferAndAssignScanType(result);
            sortByStageAndId(result);

            return result;

        } catch (Exception e) {
            log.error("[SKUService] 获取工序单价配置失败 - orderNo: {}", orderNo, e);
            return result;
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseWorkflowNodes(String workflowJson) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Object> workflow = mapper.readValue(workflowJson, new TypeReference<Map<String, Object>>() {});
        log.info("[SKUService] JSON解析成功 - keys: {}", workflow.keySet());
        return (List<Map<String, Object>>) workflow.get("nodes");
    }

    private void collectPriceInfoFromNodes(List<Map<String, Object>> nodes, List<Map<String, Object>> result) {
        for (Map<String, Object> node : nodes) {
            String processId = String.valueOf(node.getOrDefault("id", "")).trim();
            String processName = String.valueOf(node.getOrDefault("name", "")).trim();
            Object unitPriceObj = node.get("unitPrice");
            String progressStage = String.valueOf(node.getOrDefault("progressStage", "")).trim();

            log.info("[SKUService] 处理工序 - id: {}, name: {}, unitPrice: {}, progressStage: {}, nodeKeys: {}",
                    processId, processName, unitPriceObj, progressStage, node.keySet());

            if (unitPriceObj != null) {
                Map<String, Object> priceInfo = new HashMap<>();

                if (StringUtils.hasText(processId)) {
                    priceInfo.put("id", processId);
                }
                if (StringUtils.hasText(processName)) {
                    priceInfo.put("name", processName);
                    priceInfo.put("processName", processName);
                }
                if (StringUtils.hasText(progressStage)) {
                    priceInfo.put("progressStage", progressStage);
                }

                try {
                    double unitPrice = Double.parseDouble(unitPriceObj.toString());
                    priceInfo.put("unitPrice", unitPrice);
                    priceInfo.put("price", unitPrice);
                    extractSortOrder(node, priceInfo);
                    extractScanType(node, priceInfo);

                    if (StringUtils.hasText(processId) || StringUtils.hasText(processName)) {
                        result.add(priceInfo);
                        log.info("[SKUService] 添加工序单价 - id: {}, processName: {}, unitPrice: {}",
                                processId, processName, unitPrice);
                    }
                } catch (NumberFormatException e) {
                    log.warn("[SKUService] 工序单价格式错误 - id: {}, processName: {}, unitPrice: {}",
                            processId, processName, unitPriceObj);
                }
            } else {
                log.warn("[SKUService] 跳过工序（无单价）- id: {}, processName: {}", processId, processName);
            }
        }
    }

    private void extractSortOrder(Map<String, Object> node, Map<String, Object> priceInfo) {
        Object sortOrderObj = node.get("sortOrder");
        if (sortOrderObj != null) {
            try { priceInfo.put("sortOrder", Integer.parseInt(sortOrderObj.toString())); }
            catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
        }
    }

    private void extractScanType(Map<String, Object> node, Map<String, Object> priceInfo) {
        Object scanTypeObj = node.get("scanType");
        if (scanTypeObj != null && StringUtils.hasText(scanTypeObj.toString())) {
            priceInfo.put("scanType", scanTypeObj.toString());
        }
    }

    private void mergeTemplateStageMapping(ProductionOrder order, List<Map<String, Object>> result) {
        if (templateLibraryService == null || order.getStyleNo() == null) {
            return;
        }
        try {
            List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo().trim());
            if (templateNodes == null || templateNodes.isEmpty()) {
                return;
            }
            Map<String, String> stageMap = new HashMap<>();
            for (Map<String, Object> tn : templateNodes) {
                String tnName = tn.get("name") != null ? tn.get("name").toString().trim() : "";
                String tnStage = tn.get("progressStage") != null ? tn.get("progressStage").toString().trim() : "";
                if (StringUtils.hasText(tnName) && StringUtils.hasText(tnStage)) {
                    stageMap.put(tnName, tnStage);
                }
            }
            for (Map<String, Object> r : result) {
                String pn = r.get("processName") != null ? r.get("processName").toString() : "";
                if (StringUtils.hasText(pn) && stageMap.containsKey(pn) && !r.containsKey("progressStage")) {
                    r.put("progressStage", stageMap.get(pn));
                }
            }
            log.info("[SKUService] 合并progressStage映射完成 - 共{}个映射", stageMap.size());
        } catch (Exception e) {
            log.warn("[SKUService] 合并progressStage映射失败: {}", e.getMessage());
        }
    }

    private void inferAndAssignScanType(List<Map<String, Object>> result) {
        for (Map<String, Object> r : result) {
            String pn = r.get("processName") != null ? r.get("processName").toString() : "";
            String ps = r.get("progressStage") != null ? r.get("progressStage").toString() : "";
            r.put("scanType", inferScanTypeFromNames(pn, ps));
        }
    }

    private void sortByStageAndId(List<Map<String, Object>> result) {
        result.sort((a, b) -> {
            String stageA = String.valueOf(a.getOrDefault("progressStage", "")).trim();
            String stageB = String.valueOf(b.getOrDefault("progressStage", "")).trim();
            int idxA = STAGE_ORDER.indexOf(stageA);
            int idxB = STAGE_ORDER.indexOf(stageB);
            if (idxA == -1) idxA = 999;
            if (idxB == -1) idxB = 999;
            if (idxA != idxB) return idxA - idxB;
            String idA = String.valueOf(a.getOrDefault("id", "")).trim();
            String idB = String.valueOf(b.getOrDefault("id", "")).trim();
            int numA = parseSortNum(idA);
            int numB = parseSortNum(idB);
            if (numA != numB) return numA - numB;
            return idA.compareTo(idB);
        });
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

            log.debug("[SKUService] 查询工序单价 - orderNo: {}, processName: '{}'", orderNo, processName);

            // 获取所有工序单价配置
            List<Map<String, Object>> prices = getProcessUnitPrices(orderNo);

            log.debug("[SKUService] 获取到 {} 个工序配置", prices.size());

            // 【三层匹配机制】确保即使charset乱码也能匹配到单价
            for (Map<String, Object> priceInfo : prices) {
                String name = String.valueOf(priceInfo.getOrDefault("name", "")).trim();
                String id = String.valueOf(priceInfo.getOrDefault("id", "")).trim();

                log.info("[SKUService] 比较工序 - id: '{}', name: '{}', processName: '{}'", id, name, processName);

                // 【优先级1】通过工序名精确匹配（正常情况）
                if (name.equalsIgnoreCase(processName)) {
                    Object unitPrice = priceInfo.get("unitPrice");
                    result.put("unitPrice", unitPrice != null ? Double.parseDouble(unitPrice.toString()) : 0.0);
                    result.put("found", true);
                    result.put("matchBy", "name");
                    log.info("[SKUService] 通过名称匹配成功 - name: '{}', unitPrice: {}", name, unitPrice);
                    break;
                }

                // 【优先级2】通过工序ID匹配（charset乱码时的fallback）
                if (StringUtils.hasText(id) && id.equalsIgnoreCase(processName)) {
                    Object unitPrice = priceInfo.get("unitPrice");
                    result.put("unitPrice", unitPrice != null ? Double.parseDouble(unitPrice.toString()) : 0.0);
                    result.put("found", true);
                    result.put("matchBy", "id");
                    log.warn("[SKUService] ⚠️ 通过ID匹配成功（名称可能乱码）- id: '{}', unitPrice: {}", id, unitPrice);
                    break;
                }

                // 【优先级3】模糊匹配常见工序（最后的兜底）
                if (StringUtils.hasText(processName)) {
                    String pn = processName.toLowerCase();
                    String n = name.toLowerCase();
                    if ((pn.contains("裁剪") || pn.contains("裁") || pn.contains("cutting")) &&
                        (n.contains("裁剪") || n.contains("裁") || n.contains("cutting") || n.equals("??"))) {
                        Object unitPrice = priceInfo.get("unitPrice");
                        if (unitPrice != null && Double.parseDouble(unitPrice.toString()) > 0) {
                            result.put("unitPrice", Double.parseDouble(unitPrice.toString()));
                            result.put("found", true);
                            result.put("matchBy", "fuzzy");
                            log.warn("[SKUService] ⚠️ 通过模糊匹配裁剪工序 - processName: '{}', unitPrice: {}", processName, unitPrice);
                            break;
                        }
                    }
                }
            }

            log.debug("[SKUService] 查询工序单价完成 - orderNo: {}, processName: {}, found: {}, unitPrice: {}, matchBy: {}",
                    orderNo, processName, result.get("found"), result.get("unitPrice"), result.getOrDefault("matchBy", "none"));

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

            String orderNo = scanRecord.getOrderNo();
            String processName = scanRecord.getProcessName();

            log.info("[SKUService] 开始附加工序单价 - orderNo: {}, processName: '{}'", orderNo, processName);

            if (isNonPayableProcess(processName)) {
                log.info("[SKUService] 跳过无工资工序 - processName: '{}'（采购/下单/入库等管理类工序）", processName);
                scanRecord.setProcessUnitPrice(java.math.BigDecimal.ZERO);
                scanRecord.setScanCost(java.math.BigDecimal.ZERO);
                scanRecord.setUnitPrice(java.math.BigDecimal.ZERO);
                scanRecord.setTotalAmount(java.math.BigDecimal.ZERO);
                return true;
            }

            java.math.BigDecimal unitPrice = resolveUnitPrice(orderNo, processName, scanRecord);
            applyPriceToScanRecord(scanRecord, unitPrice);

            log.info("[SKUService] 附加工序单价完成 - processName: {}, unitPrice: {}, quantity: {}, scanCost: {}",
                    scanRecord.getProcessName(), unitPrice, scanRecord.getQuantity(), scanRecord.getScanCost());

            return true;
        } catch (Exception e) {
            log.error("[SKUService] 附加工序单价失败", e);
            return false;
        }
    }

    private java.math.BigDecimal resolveUnitPrice(String orderNo, String processName, ScanRecord scanRecord) {
        Map<String, Object> priceInfo = getUnitPriceByProcess(orderNo, processName);
        java.math.BigDecimal unitPrice = parseBigDecimal(priceInfo.get("unitPrice"));

        if (unitPrice.compareTo(java.math.BigDecimal.ZERO) <= 0
                && StringUtils.hasText(scanRecord.getProgressStage())) {
            String stageName = scanRecord.getProgressStage().trim();
            if (!stageName.equalsIgnoreCase(processName.trim())) {
                java.math.BigDecimal stagePrice = tryResolveStagePrice(orderNo, stageName);
                if (stagePrice.compareTo(java.math.BigDecimal.ZERO) > 0) {
                    unitPrice = stagePrice;
                }
            }
        }
        return unitPrice;
    }

    private java.math.BigDecimal tryResolveStagePrice(String orderNo, String stageName) {
        Map<String, Object> stagePriceInfo = getUnitPriceByProcess(orderNo, stageName);
        return parseBigDecimal(stagePriceInfo.get("unitPrice"));
    }

    private java.math.BigDecimal parseBigDecimal(Object value) {
        if (value == null) {
            return java.math.BigDecimal.ZERO;
        }
        try {
            java.math.BigDecimal result = new java.math.BigDecimal(value.toString());
            return result;
        } catch (Exception e) {
            log.warn("[SKUService] 单价转换失败: {}", value);
            return java.math.BigDecimal.ZERO;
        }
    }

    private void applyPriceToScanRecord(ScanRecord scanRecord, java.math.BigDecimal unitPrice) {
        scanRecord.setProcessUnitPrice(unitPrice);

        int qty = scanRecord.getQuantity() != null ? scanRecord.getQuantity() : 0;
        java.math.BigDecimal scanCost = unitPrice.multiply(new java.math.BigDecimal(qty));
        scanRecord.setScanCost(scanCost);

        java.math.BigDecimal currentUnitPrice = scanRecord.getUnitPrice();
        if ((currentUnitPrice == null || currentUnitPrice.compareTo(java.math.BigDecimal.ZERO) <= 0)
                && unitPrice.compareTo(java.math.BigDecimal.ZERO) > 0) {
            scanRecord.setUnitPrice(unitPrice);
        }

        java.math.BigDecimal currentTotalAmount = scanRecord.getTotalAmount();
        if ((currentTotalAmount == null || currentTotalAmount.compareTo(java.math.BigDecimal.ZERO) <= 0)
                && scanCost.compareTo(java.math.BigDecimal.ZERO) > 0) {
            scanRecord.setTotalAmount(scanCost);
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
