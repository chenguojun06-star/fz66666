package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.service.impl.ProductWarehousingHelper;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
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
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired
    private SKUService skuService;

    @Autowired
    private ProductWarehousingHelper warehousingHelper;

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

        // ★ 提前判断 isDefectiveReentry，返修申报不强制要求仓库（避免 400）
        boolean isDefectiveReentry = "true".equalsIgnoreCase(
                TextUtils.safeText(params.get("isDefectiveReentry")));

        String warehouse = TextUtils.safeText(params.get("warehouse"));
        if (!hasText(warehouse)) {
            if (isDefectiveReentry) {
                warehouse = "待分配"; // 返修申报不必指定仓库，使用默认值
            } else {
                throw new IllegalArgumentException("请指定仓库");
            }
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(scanCode);
        // ★ 回退：通过 orderNo + bundleNo（整数序号）查找，对中文编码完全免疫
        // 根因：QR码含中文时 getByQrCode 可能因编码不一致匹配失败，导致 cutting_bundle_no=NULL
        if (bundle == null || !hasText(bundle.getId())) {
            String fallbackOrderNo = TextUtils.safeText(params.get("orderNo"));
            Integer bundleNoInt = NumberUtils.toInt(params.get("bundleNo"));
            if (hasText(fallbackOrderNo) && bundleNoInt != null && bundleNoInt > 0) {
                try {
                    CuttingBundle foundByNo = cuttingBundleService.getByBundleNo(fallbackOrderNo, bundleNoInt);
                    if (foundByNo != null && hasText(foundByNo.getId())) {
                        bundle = foundByNo;
                        log.info("入库回退（orderNo+bundleNo）找到菲号: orderNo={}, bundleNo={}, bundleId={}",
                                fallbackOrderNo, bundleNoInt, bundle.getId());
                    }
                } catch (Exception e) {
                    log.warn("入库通过orderNo+bundleNo查找菲号失败: orderNo={}, bundleNo={}", fallbackOrderNo, bundleNoInt, e);
                }
            }
        }
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

        // isDefectiveReentry 已在方法入口处解析（方法顶部）
        if (isDefectiveReentry) {
            // ── 返修完成申报：不直接入库，记录"修好了"让质检重检 ──
            // 不做 validateQualityConfirmBeforeWarehousing（返修申报不是正式入库）
            validateDefectiveReentryQty(order.getId(), bundle, qty);

            // 保存返修申报记录（不更新 SKU 库存，不更新订单完成数量）
            try {
                productWarehousingService.saveRepairReturnDeclaration(
                        bundle, order, qty, "返修完成", operatorId, operatorName, warehouse);
            } catch (DuplicateKeyException dke) {
                log.info("返修申报重复扫码: orderId={}, bundle={}", order.getId(), bundle.getBundleNo(), dke);
            }
            // 返修申报成功后直接返回，等待质检重检
            Map<String, Object> repairResult = new HashMap<>();
            repairResult.put("success", true);
            repairResult.put("message", "返修完成申报成功，请通知质检员进行重新验收");
            repairResult.put("bundleStatus", "repaired_waiting_qc");
            return repairResult;
        } else {
            // 正常入库：检查是否有次品待返修阻止
            if (warehousingHelper.isBundleBlockedForWarehousing(bundle.getStatus())) {
                throw new IllegalStateException("温馨提示：该菲号存在待返修的产品，返修完成后才能入库哦～");
            }
            // ★ 验证单个菲号累计入库数量不超过菲号裁剪数量
            validateBundleWarehousingQuantity(bundle, qty);
            // ★ 生产前置校验：该菲号必须有生产扫码记录（含包装工序）才能入库
            validateProductionPrerequisite(order.getId(), bundle.getId());
            // ★ 质检前置校验：必须有质检验收记录（quality_receive + confirmTime 不为空）才能入库
            validateQualityConfirmBeforeWarehousing(order.getId(), bundle.getId());
            // 验证数量不超过订单/裁剪总量
            inventoryValidator.validateNotExceedOrderQuantity(order, "warehouse", "入库", qty, bundle);
        }

        // 创建入库记录（正常入库路径）
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
        } catch (DataAccessException dae) {
            // 若出现 DB 列缺失（Unknown column）等异常，给出明确错误而非"系统内部错误"
            log.error("[WarehouseScan] 入库记录写入DB失败 orderId={}, bundle={}: {}",
                    order.getId(), bundle.getBundleNo(), dae.getMessage(), dae);
            throw new IllegalStateException("入库记录保存失败，请联系管理员（DB错误）");
        }

        // 重新计算订单进度
        try {
            if (productionOrderService != null) {
                productionOrderService.recomputeProgressFromRecords(order.getId());
            }
        } catch (Exception e) {
            log.error("重新计算订单进度失败: orderId={}", order.getId(), e);
        }

        // 始终创建入库类型扫码记录（progressStage="入库"），确保进度球正确统计
        // saveWarehousingAndUpdateOrder 内部会创建质检阶段记录（WAREHOUSING:xxx, progressStage="质检"），
        // 但 warehousingType="scan" 时不会创建入库阶段记录，这里手动补充
        ScanRecord sr = buildWarehouseRecord(params, requestId, operatorId, operatorName, order, bundle, qty, warehouse,
                                             colorResolver, sizeResolver);
        try {
            scanRecordService.saveScanRecord(sr);
        } catch (DuplicateKeyException dke) {
            log.info("仓库扫码记录重复: requestId={}", requestId, dke);
            // 重复时尝试查找已有记录
            try {
                ScanRecord existing = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getRequestId, requestId)
                        .last("limit 1")
                        .one();
                if (existing != null) sr = existing;
            } catch (Exception ex) {
                log.warn("查找已有入库扫码记录失败: requestId={}", requestId, ex);
            }
        } catch (org.springframework.dao.DataAccessException dbEx) {
            log.error("[ScanSave-Warehouse] t_scan_record保存失败(可能缺少列): requestId={}, error={}", requestId, dbEx.getMessage(), dbEx);
            throw new IllegalStateException("扫码记录保存失败，请联系管理员（DB列缺失，错误：" + dbEx.getMessage() + "）");
        }

        // 更新工序跟踪记录（工序跟踪表以节点名"入库"作为 processCode 初始化）
        if (bundle != null && hasText(bundle.getId())) {
            try {
                boolean trackingUpdated = processTrackingOrchestrator.updateScanRecord(
                    bundle.getId(),
                    "入库",     // 工序跟踪表的 processCode = 节点名 "入库"
                    operatorId,
                    operatorName,
                    sr.getId()
                );
                if (trackingUpdated) {
                    log.info("入库工序跟踪记录更新成功: bundleId={}, orderId={}", bundle.getId(), order.getId());
                } else {
                    log.warn("入库工序跟踪记录未找到（不阻断入库）: bundleId={}, orderId={}", bundle.getId(), order.getId());
                }
            } catch (Exception e) {
                // 工序跟踪更新失败不应阻断入库操作（ProductWarehousing 已提交）
                log.warn("更新入库工序跟踪记录失败（不阻断入库）: bundleId={}, msg={}", bundle.getId(), e.getMessage());
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
     * 查找入库生成的扫码记录（仅查找入库类型，避免匹配到质检记录）
     *
     * 注意：upsertWarehousingStageScanRecord 使用前缀 "WAREHOUSING:" 创建质检记录，
     * upsertWarehouseScanRecord 使用前缀 "WAREHOUSE:" 创建入库记录。
     * 此处查询必须用 "WAREHOUSE:" 前缀，否则会误匹配质检记录，
     * 导致 buildWarehouseRecord 永远不被调用、入库扫码记录缺失。
     */
    private ScanRecord findWarehousingGeneratedRecord(String warehousingId) {
        if (!hasText(warehousingId)) {
            return null;
        }
        String requestId = "WAREHOUSE:" + warehousingId.trim();
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
        sr.setProcessName("入库");
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now());
        sr.setScanType("warehouse");
        sr.setScanResult("success");
        sr.setRemark("入库: " + warehouse);
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

    /**
     * 质检前置校验：入库前必须已录入质检结果（quality_receive 记录 + confirmTime 不为空）
     * 业务规则：质检 → 包装 → 入库，质检结果是必经步骤
     *
     * 🔧 修复(2026-02-25)：handleConfirm 只更新现有 quality_receive 记录的 confirmTime，
     * 不创建 quality_confirm 记录。改为查询 quality_receive + confirmTime IS NOT NULL，
     * 与小程序 StageDetector 的修复保持一致。
     */
    private void validateQualityConfirmBeforeWarehousing(String orderId, String bundleId) {
        if (!hasText(orderId) || !hasText(bundleId)) {
            return;
        }
        try {
            long confirmCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanType, "quality")
                    .eq(ScanRecord::getProcessCode, "quality_receive")
                    .eq(ScanRecord::getScanResult, "success")
                    .isNotNull(ScanRecord::getConfirmTime));
            if (confirmCount <= 0) {
                throw new IllegalStateException("温馨提示：该菲号还未录入质检结果哦～请先完成质检后再入库");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("检查质检前置条件失败: orderId={}, bundleId={}", orderId, bundleId, e);
        }
    }



    /**
     * 次品返修入库数量验证：从 t_product_warehousing 读取剩余可返修件数
     * （PC 手工入库 / 扫码入库均适用，数据源统一）
     */
    private void validateDefectiveReentryQty(String orderId, CuttingBundle bundle, int qty) {
        String bid = bundle == null ? null : bundle.getId();
        // 根据新语义：检查“尚在工厂返修中尚未申报返回”的件数
        int remaining = warehousingHelper.repairDeclarationRemainingQtyByBundle(orderId, bid, null);
        if (remaining <= 0) {
            throw new IllegalStateException("未找到待返修次品记录，无法进行次品入库");
        }
        if (qty > remaining) {
            throw new IllegalArgumentException(String.format(
                    "次品入库数量超限！剩余可返修=%d，本次=%d，超出%d件",
                    remaining, qty, qty - remaining));
        }
        log.debug("次品入库验证通过: bundleId={}, remaining={}, 本次={}", bid, remaining, qty);
    }
}
