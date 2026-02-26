package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 扫码记录查询辅助类
 * 职责：封装扫码记录的查询、统计、详情填充逻辑
 *
 * 提取自 ScanRecordOrchestrator（2026-02-10）
 */
@Component
@Slf4j
public class ScanRecordQueryHelper {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    public IPage<ScanRecord> list(Map<String, Object> params) {
        return scanRecordService.queryPage(params);
    }

    public IPage<ScanRecord> getByOrderId(String orderId, int page, int pageSize) {
        return scanRecordService.queryByOrderId(orderId, page, pageSize);
    }

    public IPage<ScanRecord> getByStyleNo(String styleNo, int page, int pageSize) {
        return scanRecordService.queryByStyleNo(styleNo, page, pageSize);
    }

    public IPage<ScanRecord> getHistory(int page, int pageSize) {
        Map<String, Object> params = Map.of("page", page, "pageSize", pageSize);
        return scanRecordService.queryPage(params);
    }

    public IPage<ScanRecord> getMyHistory(int page, int pageSize, String scanType, String startTime, String endTime,
            String orderNo, String bundleNo, String workerName, String operatorName) {
        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        if (!hasText(operatorId)) {
            throw new AccessDeniedException("未登录");
        }
        log.debug("[getMyHistory] operatorId={}, startTime={}, endTime={}", operatorId, startTime, endTime);

        Map<String, Object> params = new HashMap<>();
        params.put("page", page);
        params.put("pageSize", pageSize);
        params.put("operatorId", operatorId);
        if (hasText(scanType)) {
            params.put("scanType", scanType.trim());
        }
        if (hasText(startTime)) {
            params.put("startTime", startTime.trim());
        }
        if (hasText(endTime)) {
            params.put("endTime", endTime.trim());
        }
        if (hasText(orderNo)) {
            params.put("orderNo", orderNo.trim());
        }
        if (hasText(bundleNo)) {
            params.put("bundleNo", bundleNo.trim());
        }
        String name = hasText(operatorName) ? operatorName : workerName;
        if (hasText(name)) {
            params.put("operatorName", name.trim());
        }

        // 注意：工人个人历史不过滤已完成/关闭订单。
        // excludeClosedOrders 只适用于管理员视图，这里不设置，
        // 否则工人当天扫的「已完成」订单记录会从「今日记录」中消失。

        IPage<ScanRecord> pageResult = scanRecordService.queryPage(params);

        // 为裁剪类型的扫码记录填充cutting_bundle详细数据
        List<ScanRecord> records = pageResult.getRecords();
        if (records != null && !records.isEmpty()) {
            for (ScanRecord record : records) {
                if ("cutting".equals(record.getScanType()) || "\u88c1\u526a".equals(record.getProgressStage())) {
                    enrichCuttingDetails(record);
                }
            }
        }

        return pageResult;
    }

    /**
     * 为裁剪扫码记录填充cutting_bundle详细信息
     */
    private void enrichCuttingDetails(ScanRecord record) {
        if (!hasText(record.getOrderId())) {
            return;
        }

        try {
            List<CuttingBundle> bundles = cuttingBundleService.list(
                new LambdaQueryWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getProductionOrderId, record.getOrderId())
                    .orderByAsc(CuttingBundle::getSize)
            );

            if (bundles != null && !bundles.isEmpty()) {
                Map<String, Integer> sizeQuantityMap = new HashMap<>();
                for (CuttingBundle bundle : bundles) {
                    String size = bundle.getSize();
                    Integer qty = bundle.getQuantity() != null ? bundle.getQuantity() : 0;
                    sizeQuantityMap.put(size, sizeQuantityMap.getOrDefault(size, 0) + qty);
                }

                List<Map<String, Object>> details = new ArrayList<>();
                for (Map.Entry<String, Integer> entry : sizeQuantityMap.entrySet()) {
                    Map<String, Object> detail = new HashMap<>();
                    detail.put("size", entry.getKey());
                    detail.put("quantity", entry.getValue());
                    details.add(detail);
                }

                record.setCuttingDetails(details);
            }
        } catch (Exception e) {
            log.warn("填充裁剪详情失败: orderId={}, error={}", record.getOrderId(), e.getMessage());
        }
    }

    /**
     * 获取我的质检待处理任务（已领取未确认结果）
     */
    public List<ScanRecord> getMyQualityTasks() {
        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        if (!hasText(operatorId)) {
            throw new AccessDeniedException("未登录");
        }

        Map<String, Object> params = new HashMap<>();
        params.put("operatorId", operatorId);
        params.put("scanType", "quality");
        params.put("processCode", "quality_receive");
        params.put("page", 1);
        params.put("pageSize", 100);

        IPage<ScanRecord> receivedPage = scanRecordService.queryPage(params);
        List<ScanRecord> receivedRecords = receivedPage.getRecords();

        if (receivedRecords == null || receivedRecords.isEmpty()) {
            return List.of();
        }

        List<ScanRecord> pendingTasks = new ArrayList<>();
        for (ScanRecord received : receivedRecords) {
            String orderId = received.getOrderId();
            String bundleId = received.getCuttingBundleId();

            // 排除已关闭/已完成/已取消/已归档订单
            if (hasText(orderId)) {
                ProductionOrder order = productionOrderService.getById(orderId);
                if (order == null || order.getDeleteFlag() == 1) {
                    continue;
                }
                String orderStatus = order.getStatus();
                if ("closed".equals(orderStatus) || "completed".equals(orderStatus)
                        || "cancelled".equals(orderStatus) || "archived".equals(orderStatus)) {
                    continue;
                }
            }

            // 检查是否已有质检验收记录
            // 🔧 修复(2026-02-25)：quality_confirm processCode 从未被写入，
            // 改为查询 quality_receive 记录的 confirmTime 是否不为空
            ScanRecord confirmed = findQualityConfirmedRecord(orderId, bundleId);
            if (confirmed != null && hasText(confirmed.getId())) {
                continue;
            }

            // 检查该菲号是否已全部入库
            if (hasText(bundleId)) {
                CuttingBundle bundle = cuttingBundleService.getById(bundleId);
                if (bundle != null) {
                    int cuttingQuantity = bundle.getQuantity() == null ? 0 : bundle.getQuantity();

                    List<ProductWarehousing> warehousingRecords = productWarehousingService.list(
                            new LambdaQueryWrapper<ProductWarehousing>()
                                    .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                                    .eq(ProductWarehousing::getDeleteFlag, 0));

                    int totalWarehoused = warehousingRecords.stream()
                            .mapToInt(w -> w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity())
                            .sum();

                    if (cuttingQuantity > 0 && totalWarehoused >= cuttingQuantity) {
                        continue;
                    }
                }
            }

            pendingTasks.add(received);
        }

        return pendingTasks;
    }

    /**
     * 查找质检阶段记录
     */
    public ScanRecord findQualityStageRecord(String orderId, String bundleId, String stageCode) {
        if (!hasText(orderId) || !hasText(bundleId) || !hasText(stageCode)) {
            return null;
        }
        try {
            return scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanType, "quality")
                    .eq(ScanRecord::getScanResult, "success")
                    .eq(ScanRecord::getProcessCode, stageCode)
                    .last("limit 1"));
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 查找已完成质检验收的记录（quality_receive + confirmTime 不为空）
     * 🔧 修复(2026-02-25)：handleConfirm 只更新 quality_receive 的 confirmTime，
     * 不创建 quality_confirm 记录，因此用 confirmTime IS NOT NULL 判断确认状态。
     */
    public ScanRecord findQualityConfirmedRecord(String orderId, String bundleId) {
        if (!hasText(orderId) || !hasText(bundleId)) {
            return null;
        }
        try {
            return scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanType, "quality")
                    .eq(ScanRecord::getScanResult, "success")
                    .eq(ScanRecord::getProcessCode, "quality_receive")
                    .isNotNull(ScanRecord::getConfirmTime)
                    .last("limit 1"));
        } catch (Exception e) {
            return null;
        }
    }

    public Map<String, Object> getPersonalStats(String scanType, String period) {
        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();
        if (!hasText(operatorId)) {
            throw new AccessDeniedException("未登录");
        }

        String st = hasText(scanType) ? scanType.trim() : null;
        String pd = hasText(period) ? period.trim() : null;
        Map<String, Object> agg = scanRecordService.getPersonalStats(operatorId, st, pd);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("operatorId", operatorId);
        String safeOperatorName = operatorName == null ? null : operatorName.trim();
        if (hasText(safeOperatorName)) {
            resp.put("operatorName", safeOperatorName);
        }
        resp.put("scanType", st);

        if (agg == null) {
            resp.put("scanCount", 0);
            resp.put("orderCount", 0);
            resp.put("totalQuantity", 0);
            resp.put("totalAmount", BigDecimal.ZERO);
            return resp;
        }

        resp.putAll(agg);
        return resp;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
