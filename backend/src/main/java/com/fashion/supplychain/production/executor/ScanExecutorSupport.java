package com.fashion.supplychain.production.executor;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.WorkerHintComposer;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;

import java.util.concurrent.CompletableFuture;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 扫码公共逻辑 —— 统一封装：
 * <ol>
 *   <li>工厂隔离（防止外发菲号被本厂扫码）</li>
 *   <li>扫码阻止（已在看板中标注"阻止扫码"的菲号拒绝）</li>
 *   <li>订单终态判断</li>
 *   <li>工人提示生成（样衣开发阶段 AI 识别结果 → 扫码时提示）{@link WorkerHintComposer}</li>
 *   <li>工序跟踪记录更新（含重试）</li>
 * </ol>
 */
@Component
@Slf4j
public class ScanExecutorSupport {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private OrderProgressWebSocketServer orderProgressWebSocketServer;

    @Autowired(required = false)
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired(required = false)
    private StyleInfoService styleInfoService;

    @Autowired(required = false)
    private SecondaryProcessService secondaryProcessService;

    // ======================== 验证类 ========================

    public void validateBundleFactoryAccess(CuttingBundle bundle, String stageName) {
        if (bundle == null) return;
        String bundleFactoryId = bundle.getFactoryId();
        if (!StringUtils.hasText(bundleFactoryId)) return;
        String workerFactoryId = UserContext.factoryId();
        if (!bundleFactoryId.equals(workerFactoryId)) {
            log.warn("[工厂隔离-{}] 扫码被拒绝: bundleId={}, bundleFactory={}, workerFactory={}",
                    stageName, bundle.getId(), bundleFactoryId, workerFactoryId);
            throw new BusinessException("该菲号已转派至外发工厂，您无权" + stageName + "扫码");
        }
    }

    public void validateBundleNotBlocked(CuttingBundle bundle, String stageName) {
        if (bundle == null) return;
        if (Boolean.TRUE.equals(bundle.getScanBlocked())) {
            log.warn("[扫码阻止-{}] 菲号已被阻止扫码: bundleId={}, bundleNo={}",
                    stageName, bundle.getId(), bundle.getBundleNo());
            throw new BusinessException("该菲号已被阻止扫码，无法继续" + stageName + "。请在工序看板中解除阻止后重试");
        }
    }

    public void validateOrderNotTerminal(ProductionOrder order, String stageName) {
        String status = order.getStatus() == null ? "" : order.getStatus().trim();
        if (OrderStatusConstants.isTerminal(status)) {
            throw new IllegalStateException("订单已终态(" + status + ")，无法继续" + stageName);
        }
    }

    // ======================== 进度同步 ========================

    public void recomputeProgressSync(String orderId) {
        ExceptionHandler.runRecoverable("订单进度同步重算", () -> {
            if (productionOrderService != null) productionOrderService.recomputeProgressFromRecords(orderId);
        }, e -> log.warn("订单进度同步重算失败(不阻断): orderId={}", orderId, e));
        
        pushProgressNotification(orderId);
    }

    private void pushProgressNotification(String orderId) {
        if (orderProgressWebSocketServer == null) return;
        CompletableFuture.runAsync(() -> {
            try {
                ProductionOrder order = productionOrderService.getById(orderId);
                if (order != null) {
                    orderProgressWebSocketServer.broadcastOrderProgressFromOrder(order);
                }
            } catch (Exception e) {
                log.warn("[WS] 进度推送失败(不阻断): orderId={}", orderId, e);
            }
        });
    }

    public void recomputeProgressAsync(String orderId) {
        ExceptionHandler.runRecoverable("订单进度异步重算", () -> {
            if (productionOrderService != null) productionOrderService.recomputeProgressAsync(orderId);
        }, e -> log.warn("订单进度异步重算失败(不阻断): orderId={}", orderId, e));
    }

    // ======================== 工人提示构建 ========================

    /**
     * 构建订单中的款式工人提示信息，放入返回 Map。
     * 统一供生产/质检/入库扫码调用。
     *
     * @param order  生产订单（不可为 null）
     * @param bundle 当前扫码的菲号（用于判断是否外发；可传 null 表示"本厂"）
     */
    public Map<String, Object> buildOrderInfo(ProductionOrder order, CuttingBundle bundle) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("orderNo", order.getOrderNo());
        info.put("styleNo", order.getStyleNo());
        safePut(info, "styleName", order.getStyleName());

        // —— 交货日期：工人扫码时能看到交期，合理安排生产 ——
        // 优先取 ProductionOrder.expectedShipDate；为空时兜底从 StyleInfo.deliveryDate 取
        if (order.getExpectedShipDate() != null) {
            info.put("deliveryDate", order.getExpectedShipDate().toLocalDate().toString());
        }

        // —— 外发工厂：仅本厂才展示客户名，外发状态下屏蔽客户信息 ——
        if (!isOutsourceFactory(bundle)) {
            safePut(info, "customerName", order.getCustomerName());
        }

        if (!hasText(order.getStyleId())) return info;

        StyleInfo si = null;
        List<SecondaryProcess> processes = null;
        try {
            if (styleInfoService != null) si = styleInfoService.getById(order.getStyleId());
        } catch (Exception e) {
            log.warn("buildOrderInfo查询款式信息失败: styleId={}", order.getStyleId(), e);
        }
        try {
            if (secondaryProcessService != null) {
                long styleIdLong = Long.parseLong(order.getStyleId());
                processes = secondaryProcessService.listByStyleId(styleIdLong);
            }
        } catch (NumberFormatException ignored) {
            // styleId 不是数字（可能是 UUID），忽略即可
        } catch (Exception e) {
            log.warn("buildOrderInfo查询二次工艺失败: styleId={}", order.getStyleId(), e);
        }
        WorkerHintComposer.composeInto(info, si, processes);

        // 交期兜底：若 ProductionOrder.expectedShipDate 为空，从 StyleInfo.deliveryDate 取
        if (info.get("deliveryDate") == null && si != null && si.getDeliveryDate() != null) {
            info.put("deliveryDate", si.getDeliveryDate().toLocalDate().toString());
        }

        return info;
    }

    /** 兼容旧签名：等同于 buildOrderInfo(order, null)（视为本厂） */
    public Map<String, Object> buildOrderInfo(ProductionOrder order) {
        return buildOrderInfo(order, null);
    }

    /**
     * 判断该菲号是否属于"外发工厂"。
     * 当 bundle.factoryId 非空且不等于当前用户的 factoryId 时视为外发，不应展示客户等敏感信息。
     */
    public static boolean isOutsourceFactory(CuttingBundle bundle) {
        if (bundle == null) return false;
        String bundleFactoryId = bundle.getFactoryId();
        if (!hasText(bundleFactoryId)) return false;
        String workerFactoryId;
        try {
            workerFactoryId = UserContext.factoryId();
        } catch (Exception e) {
            // 拿不到当前用户 factoryId 时视为本厂（宁可展示）
            return false;
        }
        if (!hasText(workerFactoryId)) return false;
        return !bundleFactoryId.equals(workerFactoryId);
    }

    /**
     * 抛出带上下文的业务异常——即便扫码失败，前端也能展示款号/菲号等基本信息，不至于一片空白。
     */
    public void throwWithContext(String message, ProductionOrder order, CuttingBundle bundle,
            String scanType, String progressStage) {
        java.util.Map<String, Object> ctx = new java.util.HashMap<>();
        if (order != null) {
            java.util.Map<String, Object> orderInfo = buildOrderInfo(order, bundle);
            ctx.put("orderInfo", orderInfo);
            flattenOrderInfoToTop(ctx, orderInfo);
        }
        if (bundle != null) {
            flattenBundleToTop(ctx, bundle);
        }
        filterHintsByStage(ctx, scanType, progressStage);
        ctx.put("error", true);
        throw new BusinessException(message, ctx);
    }

    /** 将 orderInfo 关键字段平铺到扫码结果顶层，便于前端直接读取 */
    public void flattenOrderInfoToTop(Map<String, Object> result, Map<String, Object> orderInfo) {
        if (result == null || orderInfo == null || orderInfo.isEmpty()) return;
        String[] keys = {
                "orderNo", "styleNo", "styleName", "customerName",
                "deliveryDate", "deliveryTime",
                "difficultyLabel", "difficultyScore", "difficultyLevel", "difficultySeverity",
                "fabricComposition", "imageInsight", "visionRaw",
                "workerHint", "secondaryProcessHint", "secondaryProcesses",
                "processHints", "needleHint", "needleReason",
                "description", "cover", "fabricCompositionParts"
        };
        for (String k : keys) {
            Object v = orderInfo.get(k);
            if (v != null) result.put(k, v);
        }
    }

    /** 将菲号（CuttingBundle）关键字段平铺到扫码结果顶层 —— 供生产/质检/入库统一调用。 */
    public void flattenBundleToTop(Map<String, Object> result, CuttingBundle bundle) {
        if (result == null || bundle == null) return;
        safePut(result, "bundleNo", bundle.getBundleNo());
        safePut(result, "bundleLabel", bundle.getBundleLabel());
        safePut(result, "color", bundle.getColor());
        safePut(result, "size", bundle.getSize());
        safePut(result, "quantity", bundle.getQuantity());
        safePut(result, "bedNo", bundle.getBedNo());
        safePut(result, "bedSubNo", bundle.getBedSubNo());
        safePut(result, "productionOrderNo", bundle.getProductionOrderNo());
        safePut(result, "styleNo", bundle.getStyleNo());
        if (bundle.getBedNo() != null && bundle.getBedSubNo() != null) {
            result.put("bedNoDisplay", bundle.getBedNo() + "-" + bundle.getBedSubNo());
        } else if (bundle.getBedNo() != null) {
            result.put("bedNoDisplay", String.valueOf(bundle.getBedNo()));
        }
        if (bundle.getParentBundleId() != null || "split_parent".equals(bundle.getSplitStatus())
                || "split_child".equals(bundle.getSplitStatus())) {
            result.put("bundleSplitHint",
                    "split_parent".equals(bundle.getSplitStatus()) ? "本菲号已拆分，扫码后会分摊到子菲号" : null);
        }
    }

    /**
     * 根据扫码工序类型，过滤掉与当前工序无关的提示信息。
     * <p>不同工序关注点不同，只展示该工序真正需要的信息：
     * <ul>
     *   <li>裁剪：关注难度、面料、款式备注（不看针号/工艺要点/二次工艺）</li>
     *   <li>车缝：关注难度、面料、针号、工艺要点、二次工艺、款式备注（全展示）</li>
     *   <li>质检：关注难度、二次工艺、款式备注、系统提示（不看针号/工艺要点）</li>
     *   <li>入库：关注款式基本信息（难度/面料/备注），不看工艺类提示</li>
     * </ul>
     *
     * @param result       已在构建中的扫码结果（此方法直接修改 result 的内容）
     * @param scanType     扫码类型：cutting / production / quality / warehouse
     * @param progressStage 当前工序阶段名称（兜底判断）
     */
    public void filterHintsByStage(Map<String, Object> result, String scanType, String progressStage) {
        if (result == null) return;

        // —— 统一转小写，方便比较 ——
        String st = (scanType != null ? scanType.trim().toLowerCase() : "");
        String ps = (progressStage != null ? progressStage.trim().toLowerCase() : "");

        // 判断是否是裁剪工序（裁剪不看针号、工艺、二次工艺）
        boolean isCutting = st.equals("cutting") || ps.contains("裁剪") || ps.contains("裁床");
        // 判断是否是采购工序（采购不看针号、工艺要点、二次工艺，只看面料/难度）
        boolean isPurchasing = ps.contains("采购") || ps.contains("面辅料") || ps.contains("面料采购");
        // 判断是否是车缝工序（车缝关注针号、工艺要点）
        boolean isProduction = !isPurchasing && (st.equals("production") || ps.contains("车缝") || ps.contains("缝制")
                || ps.contains("生产") || ps.contains("工序"));
        // 判断是否是质检工序（质检不看针号、工艺要点，关注二次工艺和系统提示）
        boolean isQuality = st.equals("quality") || ps.contains("质检") || ps.contains("验货");
        // 判断是否是入库工序（入库只看基本信息）
        boolean isWarehouse = st.equals("warehouse") || ps.contains("入库") || ps.contains("仓库");

        // 裁剪工序过滤：移除针号、工艺要点、二次工艺、系统提示
        if (isCutting) {
            result.remove("needleHint");
            result.remove("processHints");
            result.remove("secondaryProcessHint");
            result.remove("secondaryProcesses");
            result.remove("imageInsight");
            result.remove("visionRaw");
        }

        // 采购工序过滤：同裁剪，只保留面料/难度/款式备注，移除针号/工艺/二次工艺/系统提示
        if (isPurchasing) {
            result.remove("needleHint");
            result.remove("processHints");
            result.remove("secondaryProcessHint");
            result.remove("secondaryProcesses");
            result.remove("imageInsight");
            result.remove("visionRaw");
        }

        // 入库工序过滤：保留基本信息，但移除针号、工艺要点、二次工艺、系统提示
        if (isWarehouse && !isProduction) {
            result.remove("needleHint");
            result.remove("processHints");
            result.remove("secondaryProcessHint");
            result.remove("secondaryProcesses");
            result.remove("imageInsight");
            result.remove("visionRaw");
        }

        // 质检工序过滤：移除针号、工艺要点（这些是车缝用的）；保留难度、二次工艺、系统提示
        if (isQuality) {
            result.remove("needleHint");
            result.remove("processHints");
            // 质检特别保留 imageInsight 作为参考（但已在前端标注为仅供参考）
        }

        // 车缝工序：不过滤任何字段，保留全部提示
        // 入库已单独处理
    }

    /** 单步完成：构建 orderInfo + 关键字段平铺到 result 顶层 */
    public Map<String, Object> composeAndFlatten(ProductionOrder order, Map<String, Object> result) {
        Map<String, Object> orderInfo = buildOrderInfo(order);
        flattenOrderInfoToTop(result, orderInfo);
        return orderInfo;
    }

    // ======================== 工序跟踪更新 ========================

    /** 兼容旧签名：无回退工序名 */
    public void updateProcessTracking(CuttingBundle bundle, String processName,
                                       String operatorId, String operatorName, String scanRecordId,
                                       ProductionOrder order) {
        updateProcessTracking(bundle, processName, null, operatorId, operatorName, scanRecordId, order);
    }

    /**
     * 更新工序跟踪记录（支持父节点回退匹配）
     * <p>
     * 统一封装重试逻辑：先尝试 updateScanRecord，失败后 appendProcessTracking 初始化再重试。
     * 当 fallbackProcessName 非空且不等于 processName 时，主工序未命中后自动按回退工序名再匹配一次。
     *
     * @param bundle              菲号信息
     * @param processName         主工序名称（优先匹配）
     * @param fallbackProcessName 回退工序名称（主工序未命中时使用，可为 null）
     * @param operatorId          操作人ID
     * @param operatorName        操作人姓名
     * @param scanRecordId        扫码记录ID
     * @param order               生产订单
     */
    public void updateProcessTracking(CuttingBundle bundle, String processName, String fallbackProcessName,
                                       String operatorId, String operatorName, String scanRecordId,
                                       ProductionOrder order) {
        if (bundle == null || !hasText(bundle.getId()) || !hasText(processName)) return;
        if (processTrackingOrchestrator == null) {
            log.warn("工序跟踪编排器未注入，跳过: bundleId={}, processName={}", bundle.getId(), processName);
            return;
        }
        if (order == null || !hasText(order.getId())) {
            log.warn("订单信息缺失，跳过工序跟踪: bundleId={}, processName={}", bundle.getId(), processName);
            return;
        }
        ExceptionHandler.runClassified("工序跟踪更新", () -> {
            try {
                doUpdateProcessTracking(bundle, processName, operatorId, operatorName, scanRecordId, order);
            } catch (Exception e) {
                // 主工序更新失败不应阻止回退工序匹配（与重构前两次独立调用行为一致）
                log.warn("工序跟踪主工序更新失败（将继续尝试回退工序）: bundleId={}, processName={}, error={}",
                        bundle.getId(), processName, e.getMessage());
            }
            if (hasText(fallbackProcessName) && !fallbackProcessName.equals(processName)) {
                log.info("工序跟踪按回退工序名匹配: bundleId={}, primary={}, fallback={}",
                        bundle.getId(), processName, fallbackProcessName);
                doUpdateProcessTracking(bundle, fallbackProcessName, operatorId, operatorName, scanRecordId, order);
            }
        },
        be -> log.warn("工序跟踪业务拒绝（不阻断扫码）: bundleId={}, processName={}, fallback={}, orderNo={}, msg={}",
                bundle.getId(), processName, fallbackProcessName, order.getOrderNo(), be.getMessage()),
        ise -> log.warn("工序跟踪状态冲突（不阻断扫码）: bundleId={}, processName={}, fallback={}, orderNo={}, msg={}",
                bundle.getId(), processName, fallbackProcessName, order.getOrderNo(), ise.getMessage()),
        e -> log.error("工序跟踪记录更新失败（非业务异常）: bundleId={}, processName={}, fallback={}, orderNo={}",
                bundle.getId(), processName, fallbackProcessName, order.getOrderNo(), e));
    }

    /**
     * 执行单次工序跟踪更新（含 appendProcessTracking 重试）
     */
    private void doUpdateProcessTracking(CuttingBundle bundle, String processName,
                                          String operatorId, String operatorName, String scanRecordId,
                                          ProductionOrder order) {
        boolean updated = processTrackingOrchestrator.updateScanRecord(
                bundle.getId(), processName, operatorId, operatorName, scanRecordId);
        if (updated) {
            log.info("工序跟踪记录更新成功: bundleId={}, processName={}, orderNo={}",
                    bundle.getId(), processName, order.getOrderNo());
            return;
        }
        log.warn("工序跟踪记录未找到，追加初始化后重试: bundleId={}, processName={}, orderNo={}",
                bundle.getId(), processName, order.getOrderNo());
        processTrackingOrchestrator.appendProcessTracking(order.getId(), List.of(bundle));
        boolean retryUpdated = processTrackingOrchestrator.updateScanRecord(
                bundle.getId(), processName, operatorId, operatorName, scanRecordId);
        if (retryUpdated) {
            log.info("工序跟踪记录重试成功: bundleId={}, processName={}, orderNo={}",
                    bundle.getId(), processName, order.getOrderNo());
        } else {
            log.warn("工序跟踪记录重试仍失败: bundleId={}, processName={}, orderNo={}",
                    bundle.getId(), processName, order.getOrderNo());
        }
    }

    private static void safePut(Map<String, Object> map, String key, Object value) {
        if (value == null) return;
        if (value instanceof String && !hasText((String) value)) return;
        map.put(key, value);
    }

    public static boolean hasText(String str) {
        return StringUtils.hasText(str);
    }
}
