package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.SensitiveDataMaskHelper;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.ScanRecordOrchestrator;
import com.fashion.supplychain.production.service.SKUService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.List;
import lombok.extern.slf4j.Slf4j;

/**
 * 扫码记录Controller
 *
 * <p>2026-09-29（D-645）：原类注入了 {@code CuttingBundleService}、{@code ProductionOrderService}、
 * {@code StyleInfoService} 与 {@code ObjectMapper}（违反 ArchUnit 规则6）。
 * 扫码诊断（{@code /diagnose}）与质检任务款式图富化（{@code /my-quality-tasks}）
 * 已下沉到 {@link ScanRecordOrchestrator}。
 * 保留 {@code SKUService}（其端点全部为纯透传）不违反规则6 —— 计数 Service 数 == 1。
 */
@Slf4j
@RestController
@RequestMapping("/api/production/scan")
@PreAuthorize("isAuthenticated()")
public class ScanRecordController {

    // D-359 操作人统一显示姓名（历史链路写入的是登录账号，读取时统一解析）
    @Autowired
    private com.fashion.supplychain.common.UserNameResolver userNameResolver;

    private void normalizeOperatorNames(java.util.List<com.fashion.supplychain.production.entity.ScanRecord> rows) {
        userNameResolver.normalizeOperatorNames(
                rows,
                com.fashion.supplychain.production.entity.ScanRecord::getOperatorId,
                com.fashion.supplychain.production.entity.ScanRecord::getOperatorName,
                com.fashion.supplychain.production.entity.ScanRecord::setOperatorName);
    }

    @Autowired
    private ScanRecordOrchestrator scanRecordOrchestrator;

    // ✅ Phase 3新增: SKU服务注入
    // D-645：其余 Service（CuttingBundleService / ProductionOrderService / StyleInfoService）
    // 与 ObjectMapper 已随 /diagnose、/my-quality-tasks 的富化逻辑下沉到 ScanRecordOrchestrator。
    // 本类保留 1 个 Service（SKUService，对应端点全部是纯透传）不违反规则6（size() == 1）。
    @Autowired
    private SKUService skuService;

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
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasRole('TENANT_OWNER')")
    public Result<?> diagnose(@RequestBody Map<String, Object> params) {
        return Result.success(scanRecordOrchestrator.diagnose(params));
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
            Object history = scanRecordOrchestrator.getMyHistory(
                page, pageSize, scanType, startTime, endTime, orderNo, bundleNo, workerName, operatorName);
            if (history instanceof com.baomidou.mybatisplus.core.metadata.IPage<?> ip) {
                @SuppressWarnings("unchecked")
                java.util.List<com.fashion.supplychain.production.entity.ScanRecord> recs =
                        (java.util.List<com.fashion.supplychain.production.entity.ScanRecord>) ip.getRecords();
                normalizeOperatorNames(recs);
            }
            return Result.success(history);
        }

        // 默认分页查询
        IPage<ScanRecord> pageResult = scanRecordOrchestrator.list(params);
        normalizeOperatorNames(pageResult.getRecords());
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
        return Result.success(scanRecordOrchestrator.getMyQualityTasksWithImages());
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
            // 没配单价时返回空数组而非fail，避免前端扫码时把"未配置"当成错误卡住
            if (processConfig == null || processConfig.isEmpty()) {
                log.warn("订单[{}]未配置工序单价模板，返回空数组，前端走默认单价", orderNo);
                return Result.success(new java.util.ArrayList<>());
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
            return Result.badRequest("缺少orderNo参数");
        }

        switch (type) {
            case "list":
                return Result.success(skuService.getSKUListByOrder(orderNo));

            case "progress":
                String styleNo = params.containsKey("styleNo") ? params.get("styleNo").toString() : null;
                String color = params.containsKey("color") ? params.get("color").toString() : null;
                String size = params.containsKey("size") ? params.get("size").toString() : null;
                if (styleNo == null || color == null || size == null) {
                    return Result.badRequest("缺少SKU维度参数（styleNo/color/size）");
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
                    return Result.badRequest("缺少SKU维度参数（styleNo/color/size）");
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
