package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.SensitiveDataMaskHelper;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.ScanRecordOrchestrator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;

/**
 * 扫码记录Controller
 */
@Slf4j
@RestController
@RequestMapping("/api/production/scan")
@PreAuthorize("isAuthenticated()")
public class ScanRecordController {

    @Autowired
    private ScanRecordOrchestrator scanRecordOrchestrator;

    // ✅ Phase 3新增: SKU服务注入
    @Autowired
    private SKUService skuService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 执行扫码操作
     */
    @PostMapping("/execute")
    public Result<?> execute(@RequestBody Map<String, Object> params) {
        Map<String, Object> result = scanRecordOrchestrator.execute(params);
        SensitiveDataMaskHelper.maskPriceInMap(result);
        return Result.success(result);
    }

    /**
     * 🔍 扫码诊断接口（不保存，只排查问题）
     * 用法：与 /execute 发同样的请求体，返回每步的诊断结果
     */
    @PostMapping("/diagnose")
    public Result<?> diagnose(@RequestBody Map<String, Object> params) {
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("step0_params", params);

        String scanCode = params.get("scanCode") != null ? params.get("scanCode").toString().trim() : "";
        String orderNo  = params.get("orderNo")  != null ? params.get("orderNo").toString().trim()  : "";
        String bundleNoRaw = params.get("bundleNo") != null ? params.get("bundleNo").toString().trim() : "";
        String scanType = params.get("scanType") != null ? params.get("scanType").toString().trim() : "production";
        String operatorId = params.get("operatorId") != null ? params.get("operatorId").toString().trim() : "";
        String processName = params.get("processName") != null ? params.get("processName").toString().trim() : "";

        report.put("step1_scanCode",  StringUtils.hasText(scanCode)  ? scanCode  : "【空】");
        report.put("step1_orderNo",   StringUtils.hasText(orderNo)   ? orderNo   : "【空】");
        report.put("step1_bundleNo",  StringUtils.hasText(bundleNoRaw) ? bundleNoRaw : "【空】");
        report.put("step1_scanType",  scanType);
        report.put("step1_operatorId", StringUtils.hasText(operatorId) ? operatorId : "【空-将导致参数错误】");
        report.put("step1_processName", StringUtils.hasText(processName) ? processName : "【空-生产扫码必须有工序名】");

        // Step2: getByQrCode
        try {
            CuttingBundle b1 = StringUtils.hasText(scanCode) ? cuttingBundleService.getByQrCode(scanCode) : null;
            if (b1 != null && StringUtils.hasText(b1.getId())) {
                report.put("step2_getByQrCode", "✅ 找到菲号 id=" + b1.getId() + " bundleNo=" + b1.getBundleNo() + " orderNo=" + b1.getProductionOrderNo());
            } else {
                report.put("step2_getByQrCode", "❌ 未找到（scanCode中文字段编码不一致，这是已知根因）");
            }
        } catch (Exception e) {
            report.put("step2_getByQrCode", "❌ 异常: " + e.getMessage());
        }

        // Step3: getByBundleNo 第三回退
        try {
            int bundleNoInt = 0;
            try { bundleNoInt = Integer.parseInt(bundleNoRaw); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
            if (StringUtils.hasText(orderNo) && bundleNoInt > 0) {
                CuttingBundle b2 = cuttingBundleService.getByBundleNo(orderNo, bundleNoInt);
                if (b2 != null && StringUtils.hasText(b2.getId())) {
                    report.put("step3_getByBundleNo", "✅ 找到菲号 id=" + b2.getId() + " bundleNo=" + b2.getBundleNo() + " color=" + b2.getColor() + " size=" + b2.getSize());
                } else {
                    report.put("step3_getByBundleNo", "❌ 未找到（orderNo=" + orderNo + " bundleNo=" + bundleNoInt + "）— 检查t_cutting_bundle表是否有此数据");
                }
            } else {
                report.put("step3_getByBundleNo", "⚠️ 跳过（orderNo或bundleNo为空/0）orderNo='" + orderNo + "' bundleNoRaw='" + bundleNoRaw + "'");
            }
        } catch (Exception e) {
            report.put("step3_getByBundleNo", "❌ 异常: " + e.getMessage());
        }

        // Step4: 订单解析
        try {
            ProductionOrder order = null;
            if (StringUtils.hasText(orderNo)) {
                order = productionOrderService.getByOrderNo(orderNo);
            }
            if (order != null) {
                report.put("step4_order", "✅ 找到订单 id=" + order.getId() + " status=" + order.getStatus() + " styleNo=" + order.getStyleNo());
                if (order.getStatus() != null && OrderStatusConstants.isTerminal(order.getStatus())) {
                    report.put("step4_order_warn", "🚫 订单状态=" + order.getStatus() + "，扫码会被拦截！");
                }
            } else {
                report.put("step4_order", "❌ 未找到订单（orderNo='" + orderNo + "'）");
            }
        } catch (Exception e) {
            report.put("step4_order", "❌ 异常: " + e.getMessage());
        }

        // Step5: 最近扫码记录（有没有历史）
        try {
            int bundleNoInt2 = 0;
            try { bundleNoInt2 = Integer.parseInt(bundleNoRaw); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
            if (StringUtils.hasText(orderNo) && bundleNoInt2 > 0) {
                java.util.Map<String, Object> listParams = new java.util.HashMap<>();
                listParams.put("orderNo", orderNo);
                listParams.put("bundleNo", bundleNoRaw);
                listParams.put("page", 1);
                listParams.put("pageSize", 10);
                try {
                    com.baomidou.mybatisplus.core.metadata.IPage<ScanRecord> page =
                        scanRecordOrchestrator.list(listParams);
                    report.put("step5_history_total", page.getTotal());
                    report.put("step5_history_note", page.getTotal() == 0
                        ? "❌ 无历史扫码记录 — _getScanHistory拿不到数据，每次都当第一次，会一直推整烫"
                        : "✅ 有" + page.getTotal() + "条历史记录");
                    if (!page.getRecords().isEmpty()) {
                        ScanRecord r = page.getRecords().get(0);
                        report.put("step5_latest", "processName=" + r.getProcessName() + " progressStage=" + r.getProgressStage() + " bundleNo=" + r.getCuttingBundleNo() + " result=" + r.getScanResult());
                    }
                } catch (Exception e2) {
                    report.put("step5_history", "❌ 查询异常: " + e2.getMessage());
                }
            }
        } catch (Exception e) {
            report.put("step5_history", "❌ 异常: " + e.getMessage());
        }

        report.put("conclusion", "如果step2/step3都是❌，说明菲号查不到，历史记录会是0，整烫会无限循环。如果订单已completed，扫码会被拦截。");
        return Result.success(report);
    }

    @PostMapping("/unit-price")
    public Result<?> resolveUnitPrice(@RequestBody Map<String, Object> params) {
        Map<String, Object> result = scanRecordOrchestrator.resolveUnitPrice(params);
        SensitiveDataMaskHelper.maskPriceInMap(result);
        return Result.success(result);
    }

    @PostMapping("/undo")
    public Result<?> undo(@RequestBody Map<String, Object> params) {
        return Result.success(scanRecordOrchestrator.undo(params));
    }

    /**
     * 【新版统一查询】分页查询扫码记录
     * 支持参数：
     * - orderId: 按订单ID查询
     * - styleNo: 按款号查询
     * - currentUser: 查询当前用户记录（值为true）
     * - scanType/startTime/endTime/orderNo/bundleNo/workerName/operatorName
     *
     * @since 2026-02-01 优化版本
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        // 智能路由：根据参数自动选择查询方法
        if (params.containsKey("orderId")) {
            String orderId = params.get("orderId").toString();
            int page = params.containsKey("page") ? Integer.parseInt(params.get("page").toString()) : 1;
            int pageSize = params.containsKey("pageSize") ? Integer.parseInt(params.get("pageSize").toString()) : 10;
            return Result.success(scanRecordOrchestrator.getByOrderId(orderId, page, pageSize));
        }

        if (params.containsKey("styleNo")) {
            String styleNo = params.get("styleNo").toString();
            int page = params.containsKey("page") ? Integer.parseInt(params.get("page").toString()) : 1;
            int pageSize = params.containsKey("pageSize") ? Integer.parseInt(params.get("pageSize").toString()) : 10;
            return Result.success(scanRecordOrchestrator.getByStyleNo(styleNo, page, pageSize));
        }

        if (params.containsKey("currentUser") && "true".equals(params.get("currentUser").toString())) {
            int page = params.containsKey("page") ? Integer.parseInt(params.get("page").toString()) : 1;
            int pageSize = params.containsKey("pageSize") ? Integer.parseInt(params.get("pageSize").toString()) : 10;
            String scanType = params.containsKey("scanType") ? params.get("scanType").toString() : null;
            String startTime = params.containsKey("startTime") ? params.get("startTime").toString() : null;
            String endTime = params.containsKey("endTime") ? params.get("endTime").toString() : null;
            String orderNo = params.containsKey("orderNo") ? params.get("orderNo").toString() : null;
            String bundleNo = params.containsKey("bundleNo") ? params.get("bundleNo").toString() : null;
            String workerName = params.containsKey("workerName") ? params.get("workerName").toString() : null;
            String operatorName = params.containsKey("operatorName") ? params.get("operatorName").toString() : null;
            return Result.success(scanRecordOrchestrator.getMyHistory(
                page, pageSize, scanType, startTime, endTime, orderNo, bundleNo, workerName, operatorName));
        }

        // 默认分页查询
        IPage<ScanRecord> pageResult = scanRecordOrchestrator.list(params);
        if (SensitiveDataMaskHelper.shouldMaskPrice() && pageResult.getRecords() != null) {
            pageResult.getRecords().forEach(r -> r.setUnitPrice(null));
        }
        return Result.success(pageResult);
    }

    @GetMapping("/personal-stats")
    public Result<?> personalStats(@RequestParam(required = false) String scanType,
            @RequestParam(required = false) String period) {
        return Result.success(scanRecordOrchestrator.getPersonalStats(scanType, period));
    }

    @PostMapping("/cleanup")
    public Result<?> cleanup(@RequestParam(required = false) String from) {
        return Result.success(scanRecordOrchestrator.cleanup(from));
    }

    /**
     * 获取我的质检待处理任务（已领取未确认结果）
     * 已注入 coverImage/styleImage，修复小程序质检弹窗款式图不显示问题
     */
    @GetMapping("/my-quality-tasks")
    public Result<?> getMyQualityTasks() {
        List<?> tasks = scanRecordOrchestrator.getMyQualityTasks();
        ObjectMapper mapper = objectMapper;

        // 批量收集所有 orderId，一次性查询订单和款式，避免 N+1
        List<Map<String, Object>> taskMaps = tasks.stream()
                .map(task -> mapper.convertValue(task, new TypeReference<Map<String, Object>>() {}))
                .collect(java.util.stream.Collectors.toList());

        java.util.Set<String> orderIds = taskMaps.stream()
                .map(m -> m.get("orderId"))
                .filter(id -> id != null && StringUtils.hasText(id.toString()))
                .map(id -> id.toString())
                .collect(java.util.stream.Collectors.toSet());

        java.util.Map<String, ProductionOrder> orderCache = new java.util.HashMap<>();
        if (!orderIds.isEmpty()) {
            productionOrderService.listByIds(orderIds).forEach(po -> orderCache.put(po.getId(), po));
        }

        java.util.Set<String> styleIds = orderCache.values().stream()
                .filter(po -> StringUtils.hasText(po.getStyleId()))
                .map(ProductionOrder::getStyleId)
                .collect(java.util.stream.Collectors.toSet());

        java.util.Map<String, StyleInfo> styleCache = new java.util.HashMap<>();
        if (!styleIds.isEmpty()) {
            styleInfoService.listByIds(styleIds).forEach(si -> styleCache.put(String.valueOf(si.getId()), si));
        }

        List<Map<String, Object>> enriched = taskMaps.stream().map(m -> {
            Object orderIdObj = m.get("orderId");
            if (orderIdObj != null && StringUtils.hasText(orderIdObj.toString())) {
                ProductionOrder po = orderCache.get(orderIdObj.toString());
                if (po != null && StringUtils.hasText(po.getStyleId())) {
                    StyleInfo si = styleCache.get(po.getStyleId());
                    if (si != null && StringUtils.hasText(si.getCover())) {
                        m.put("coverImage", si.getCover());
                        m.put("styleImage", si.getCover());
                    }
                }
            }
            return m;
        }).collect(java.util.stream.Collectors.toList());
        return Result.success(enriched);
    }

    /**
     * 退回重扫 - 仅允许退回1小时内的扫码记录
     * 小程序扫码历史中点击"退回重扫"调用此端点
     * @param params { recordId: 扫码记录ID }
     */
    @PostMapping("/rescan")
    public Result<?> rescan(@RequestBody Map<String, Object> params) {
        return Result.success(scanRecordOrchestrator.rescan(params));
    }

    @PostMapping("/delete-full-link/{orderId}")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<?> deleteFullLinkByOrderId(@PathVariable String orderId) {
        return Result.success(scanRecordOrchestrator.deleteFullLinkByOrderId(orderId));
    }

    /**
     * 【新增】获取订单的工序配置（用于小程序扫码工序识别）
     * 返回该订单对应款式的工序列表、单价、顺序
     *
     * @param orderNo 订单号
     * @return 工序配置列表 [{processName: '采购', price: 0.00, sortOrder: 1, progressStage: '采购'}, ...]
     * @since 2026-02-10
     */
    @GetMapping("/process-config/{orderNo}")
    public Result<?> getProcessConfigByOrderNo(@PathVariable String orderNo) {
        try {
            List<Map<String, Object>> processConfig = skuService.getProcessUnitPrices(orderNo);
            if (processConfig == null || processConfig.isEmpty()) {
                return Result.fail("订单[" + orderNo + "]未配置工序单价模板");
            }
            return Result.success(processConfig);
        } catch (Exception e) {
            return Result.fail("获取工序配置失败: " + e.getMessage());
        }
    }

    // ================= ✅ SKU相关端点（2026-02-01优化版本）=================

    /**
     * 【新版统一SKU查询】
     * 支持参数：
     * - type: list/progress/order-progress/statistics/is-completed/report
     * - orderNo: 订单号（必填）
     * - styleNo, color, size: SKU维度（progress/is-completed时需要）
     *
     * 示例：
     * - GET /sku/query?type=list&orderNo=PO001
     * - GET /sku/query?type=progress&orderNo=PO001&styleNo=ST001&color=黑色&size=L
     *
     * @since 2026-02-01 优化版本
     */
    @GetMapping("/sku/query")
    public Result<?> querySKU(@RequestParam Map<String, Object> params) {
        String type = params.containsKey("type") ? params.get("type").toString() : "list";
        String orderNo = params.containsKey("orderNo") ? params.get("orderNo").toString() : null;

        if (orderNo == null) {
            return Result.fail("缺少orderNo参数");
        }

        switch (type) {
            case "list":
                return Result.success(skuService.getSKUListByOrder(orderNo));

            case "progress":
                String styleNo = params.containsKey("styleNo") ? params.get("styleNo").toString() : null;
                String color = params.containsKey("color") ? params.get("color").toString() : null;
                String size = params.containsKey("size") ? params.get("size").toString() : null;
                if (styleNo == null || color == null || size == null) {
                    return Result.fail("缺少SKU维度参数（styleNo/color/size）");
                }
                return Result.success(skuService.getSKUProgress(orderNo, styleNo, color, size));

            case "order-progress":
                return Result.success(skuService.getOrderSKUProgress(orderNo));

            case "statistics":
                return Result.success(skuService.querySKUStatistics(params));

            case "is-completed":
                String styleNo2 = params.containsKey("styleNo") ? params.get("styleNo").toString() : null;
                String color2 = params.containsKey("color") ? params.get("color").toString() : null;
                String size2 = params.containsKey("size") ? params.get("size").toString() : null;
                if (styleNo2 == null || color2 == null || size2 == null) {
                    return Result.fail("缺少SKU维度参数（styleNo/color/size）");
                }
                boolean completed = skuService.isSKUCompleted(orderNo, styleNo2, color2, size2);
                return Result.success(completed);

            case "report":
                return Result.success(skuService.generateSKUReport(orderNo));

            default:
                return Result.fail("不支持的查询类型：" + type);
        }
    }

    /**
     * 检测扫码模式
     */
    @PostMapping("/sku/detect-mode")
    public Result<?> detectScanMode(@RequestBody Map<String, Object> params) {
        String scanCode = (String) params.get("scanCode");
        String color = (String) params.get("color");
        String size = (String) params.get("size");
        String mode = skuService.detectScanMode(scanCode, color, size);
        return Result.success(mode);
    }

    /**
     * 验证SKU数据
     */
    @PostMapping("/sku/validate")
    public Result<?> validateSKU(@RequestBody ScanRecord scanRecord) {
        boolean valid = skuService.validateSKU(scanRecord);
        return Result.success(valid);
    }

    /**
     * 获取订单的工序单价配置（Phase 5新增）
     */
    @GetMapping("/process-prices/{orderNo}")
    public Result<?> getProcessUnitPrices(@PathVariable String orderNo) {
        List<Map<String, Object>> prices = skuService.getProcessUnitPrices(orderNo);
        return Result.success(prices);
    }

    /**
     * 根据工序名称获取单价（Phase 5新增）
     */
    @GetMapping("/process-price/{orderNo}/{processName}")
    public Result<?> getUnitPriceByProcess(
            @PathVariable String orderNo,
            @PathVariable String processName) {
        Map<String, Object> priceInfo = skuService.getUnitPriceByProcess(orderNo, processName);
        return Result.success(priceInfo);
    }

    /**
     * 计算订单总工价（Phase 5新增）
     */
    @GetMapping("/order-total-cost/{orderNo}")
    public Result<?> calculateOrderTotalCost(@PathVariable String orderNo) {
        Map<String, Object> costInfo = skuService.calculateOrderTotalCost(orderNo);
        return Result.success(costInfo);
    }
}
