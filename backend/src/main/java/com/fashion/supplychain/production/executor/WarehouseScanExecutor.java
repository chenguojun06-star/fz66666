package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.service.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 仓库入库扫码执行器
 * 职责：
 * 1. 成品入库
 * 2. 次品阻止入库
 * 3. 重复扫码处理
 * 4. 进度重新计算
 *
 * 提取自 ScanRecordOrchestrator（减少约140行代码）
 */
@Component
@Slf4j
public class WarehouseScanExecutor {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private InventoryValidator inventoryValidator;

    @Autowired
    private SKUService skuService;

    /**
     * 执行仓库入库扫码
     */
    public Map<String, Object> execute(Map<String, Object> params, String requestId, String operatorId,
                                       String operatorName, ProductionOrder order,
                                       java.util.function.Function<String, String> colorResolver,
                                       java.util.function.Function<String, String> sizeResolver) {
        Integer qty = NumberUtils.toInt(params.get("quantity"));
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("数量必须大于0");
        }

        String scanCode = TextUtils.safeText(params.get("scanCode"));
        if (!hasText(scanCode)) {
            throw new IllegalArgumentException("扫码内容不能为空");
        }

        String warehouse = TextUtils.safeText(params.get("warehouse"));
        if (!hasText(warehouse)) {
            throw new IllegalArgumentException("请指定仓库");
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(scanCode);
        if (bundle == null || !hasText(bundle.getId())) {
            throw new IllegalStateException("未匹配到菲号");
        }

        if (order == null) {
            throw new IllegalStateException("未匹配到订单");
        }

        // ★ 订单完成状态检查：所有环节统一拦截
        String orderStatus = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equalsIgnoreCase(orderStatus)) {
            throw new IllegalStateException("进度节点已完成，该订单已结束入库");
        }

        // 检查是否有次品待返修（只检查最后一条记录状态）
        if (isBundleBlockedForWarehousingStatus(order.getId(), bundle.getId())) {
            throw new IllegalStateException("温馨提示：该菲号存在待返修的产品，返修完成后才能入库哦～");
        }

        // ★ 新增：验证单个菲号累计入库数量不超过菲号裁剪数量
        validateBundleWarehousingQuantity(bundle, qty);

        // ★ 生产前置校验：该菲号必须有生产扫码记录才能入库
        validateProductionPrerequisite(order.getId(), bundle.getId());

        // 验证数量不超过订单数量
        inventoryValidator.validateNotExceedOrderQuantity(order, "warehouse", "入库", qty, bundle);

        // 创建入库记录
        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setWarehousingType("scan");
        w.setWarehouse(warehouse);
        w.setWarehousingQuantity(qty);
        w.setQualifiedQuantity(qty);
        w.setUnqualifiedQuantity(0);
        w.setQualityStatus("qualified");
        w.setCuttingBundleQrCode(bundle.getQrCode());
        // 填充操作人信息
        if (StringUtils.hasText(operatorId)) {
            w.setWarehousingOperatorId(operatorId);
            w.setReceiverId(operatorId);
            w.setQualityOperatorId(operatorId);
        }
        if (StringUtils.hasText(operatorName)) {
            w.setWarehousingOperatorName(operatorName);
            w.setReceiverName(operatorName);
            w.setQualityOperatorName(operatorName);
        }

        try {
            boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(w);
            if (!ok) {
                throw new IllegalStateException("入库失败");
            }
        } catch (DuplicateKeyException dke) {
            log.info("仓库扫码重复: orderId={}, bundle={}, warehouse={}", order.getId(),
                    bundle.getBundleNo(), warehouse, dke);
            // 忽略重复扫码，视为成功
        }

        // 重新计算订单进度
        try {
            if (productionOrderService != null) {
                productionOrderService.recomputeProgressFromRecords(order.getId());
            }
        } catch (Exception e) {
            log.error("重新计算订单进度失败: orderId={}", order.getId(), e);
        }

        // 查找生成的扫码记录
        ScanRecord sr = findWarehousingGeneratedRecord(w.getId());
        if (sr == null) {
            // 未找到记录，手动创建
            sr = buildWarehouseRecord(params, requestId, operatorId, operatorName, order, bundle, qty, warehouse,
                                     colorResolver, sizeResolver);
            try {
                scanRecordService.saveScanRecord(sr);
            } catch (DuplicateKeyException dke) {
                log.info("仓库扫码记录重复: requestId={}", requestId, dke);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "入库成功");
        result.put("scanRecord", sr);
        result.put("orderInfo", buildOrderInfo(order));
        result.put("cuttingBundle", bundle);
        return result;
    }

    /**
     * 检查菲号是否有次品阻止入库（仅检查最后一条记录）
     * 逻辑：如果最后一条记录是“返修”状态，则阻止入库
     *      如果之后有新的合格记录，说明返修已完成，允许入库
     */
    private boolean isBundleBlockedForWarehousingStatus(String orderId, String bundleId) {
        if (!hasText(orderId) || !hasText(bundleId)) {
            return false;
        }

        try {
            java.util.List<ProductWarehousing> warehousingList =
                    productWarehousingService.lambdaQuery()
                            .select(ProductWarehousing::getId, ProductWarehousing::getQualityStatus,
                                    ProductWarehousing::getDefectRemark,
                                    ProductWarehousing::getUnqualifiedQuantity,
                                    ProductWarehousing::getQualifiedQuantity,
                                    ProductWarehousing::getCreateTime)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .eq(ProductWarehousing::getOrderId, orderId)
                            .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                            .orderByDesc(ProductWarehousing::getCreateTime)
                            .list();

            if (warehousingList == null || warehousingList.isEmpty()) {
                return false;
            }

            // ★ 只检查最后一条记录：如果是返修状态，则阻止入库
            ProductWarehousing latestRecord = warehousingList.get(0);
            if (latestRecord == null) {
                return false;
            }

            String qs = TextUtils.safeText(latestRecord.getQualityStatus());
            if (!"unqualified".equalsIgnoreCase(qs)) {
                return false; // 最后一条不是不合格，允许入库
            }

            Integer unqualifiedQty = latestRecord.getUnqualifiedQuantity();
            if (unqualifiedQty == null || unqualifiedQty <= 0) {
                return false;
            }

            String defectRemark = TextUtils.safeText(latestRecord.getDefectRemark());
            if ("返修".equals(defectRemark.trim())) {
                return true; // 最后一条是返修状态，阻止入库
            }

        } catch (Exception e) {
            log.warn("检查菲号次品状态失败: orderId={}, bundleId={}", orderId, bundleId, e);
        }

        return false;
    }

    /**
     * ★ 验证单个菲号累计入库数量不超过菲号裁剪数量
     */
    private void validateBundleWarehousingQuantity(CuttingBundle bundle, int incomingQty) {
        if (bundle == null || bundle.getQuantity() == null || bundle.getQuantity() <= 0) {
            return; // 菲号数量未设置，不做限制
        }

        int bundleQty = bundle.getQuantity();

        int bundleWarehoused;
        try {
            bundleWarehoused = productWarehousingService.list(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .select(ProductWarehousing::getQualifiedQuantity)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                            .eq(ProductWarehousing::getQualityStatus, "qualified"))
                    .stream()
                    .mapToInt(w -> w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0)
                    .sum();
        } catch (Exception e) {
            log.warn("查询菲号已入库数量失败: bundleId={}", bundle.getId(), e);
            return; // 查询失败时跳过验证，不阻塞业务
        }

        int totalAfterScan = bundleWarehoused + incomingQty;

        if (totalAfterScan > bundleQty) {
            String msg = String.format(
                    "菲号入库数量超出限制！菲号裁剪数=%d，已入库=%d，本次入库=%d，总计=%d",
                    bundleQty, bundleWarehoused, incomingQty, totalAfterScan);
            log.warn("单菲号数量验证失败: bundleId={}, bundleNo={}, {}",
                    bundle.getId(), bundle.getBundleNo(), msg);
            throw new IllegalArgumentException(msg);
        }

        log.debug("单菲号数量验证通过: bundleId={}, bundleNo={}, 裁剪数={}, 已入库={}, 本次={}",
                bundle.getId(), bundle.getBundleNo(), bundleQty, bundleWarehoused, incomingQty);
    }

    /**
     * 查找入库生成的扫码记录
     */
    private ScanRecord findWarehousingGeneratedRecord(String warehousingId) {
        if (!hasText(warehousingId)) {
            return null;
        }
        String requestId = "WAREHOUSING:" + warehousingId.trim();
        try {
            return scanRecordService.lambdaQuery()
                    .eq(ScanRecord::getRequestId, requestId)
                    .last("limit 1")
                    .one();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 构建仓库扫码记录
     */
    private ScanRecord buildWarehouseRecord(Map<String, Object> params, String requestId, String operatorId,
                                           String operatorName, ProductionOrder order, CuttingBundle bundle,
                                           int qty, String warehouse,
                                           java.util.function.Function<String, String> colorResolver,
                                           java.util.function.Function<String, String> sizeResolver) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setScanCode(TextUtils.safeText(params.get("scanCode")));
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setColor(colorResolver.apply(null));
        sr.setSize(sizeResolver.apply(null));
        sr.setQuantity(qty);
        sr.setProcessCode("warehouse");
        sr.setProgressStage("入库");
        sr.setProcessName("仓库入库");
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now());
        sr.setScanType("warehouse");
        sr.setScanResult("success");
        sr.setRemark("仓库入库: " + warehouse);
        sr.setCuttingBundleId(bundle.getId());
        sr.setCuttingBundleNo(bundle.getBundleNo());
        sr.setCuttingBundleQrCode(bundle.getQrCode());

        if (skuService != null) {
            skuService.attachProcessUnitPrice(sr);
        }

        return sr;
    }

    /**
     * 构建订单信息
     */
    private Map<String, Object> buildOrderInfo(ProductionOrder order) {
        Map<String, Object> info = new HashMap<>();
        info.put("orderNo", order.getOrderNo());
        info.put("styleNo", order.getStyleNo());
        return info;
    }

    private boolean hasText(String str) {
        return StringUtils.hasText(str);
    }

    /**
     * 验证生产前置条件：该菲号必须有至少一条生产扫码记录才能入库
     * 业务规则：生产工序完成后才能入库，PC端和小程序共用此校验
     */
    private void validateProductionPrerequisite(String orderId, String bundleId) {
        if (!hasText(orderId) || !hasText(bundleId)) {
            return;
        }
        try {
            // 1. 基础检查：至少有生产扫码记录
            long productionCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanType, "production")
                    .eq(ScanRecord::getScanResult, "success"));
            if (productionCount <= 0) {
                throw new IllegalStateException("温馨提示：该菲号还未完成生产扫码哦～请先完成生产工序后再入库");
            }

            // 2. 包装前置检查：包装工序必须有扫码记录归属人（与PC端保持一致）
            //    包装同义词：包装、打包、入袋、后整、装箱、封箱、贴标
            long packingCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanType, "production")
                    .eq(ScanRecord::getScanResult, "success")
                    .isNotNull(ScanRecord::getOperatorId)
                    .and(w -> w
                            .eq(ScanRecord::getProcessCode, "包装")
                            .or().eq(ScanRecord::getProcessCode, "打包")
                            .or().eq(ScanRecord::getProcessCode, "入袋")
                            .or().eq(ScanRecord::getProcessCode, "后整")
                            .or().eq(ScanRecord::getProcessCode, "装箱")
                            .or().eq(ScanRecord::getProcessCode, "封箱")
                            .or().eq(ScanRecord::getProcessCode, "贴标")
                            .or().eq(ScanRecord::getProcessCode, "packing")
                            .or().eq(ScanRecord::getProcessName, "包装")
                            .or().eq(ScanRecord::getProcessName, "打包")
                            .or().eq(ScanRecord::getProcessName, "入袋")
                            .or().eq(ScanRecord::getProcessName, "后整")
                            .or().eq(ScanRecord::getProcessName, "装箱")));
            if (packingCount <= 0) {
                throw new IllegalStateException("温馨提示：该菲号还未完成包装工序哦～请先完成包装扫码后再入库");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("检查生产前置条件失败: orderId={}, bundleId={}", orderId, bundleId, e);
        }
    }
}
