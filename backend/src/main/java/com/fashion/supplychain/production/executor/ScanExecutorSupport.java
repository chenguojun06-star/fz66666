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

    /** 将 orderInfo 关键字段平铺到扫码结果顶层，便于前端直接读取 */
    public void flattenOrderInfoToTop(Map<String, Object> result, Map<String, Object> orderInfo) {
        if (result == null || orderInfo == null || orderInfo.isEmpty()) return;
        String[] keys = {
                "orderNo", "styleNo", "styleName", "customerName",
                "difficultyLabel", "difficultyScore", "difficultyLevel", "difficultySeverity",
                "fabricComposition", "imageInsight", "visionRaw",
                "workerHint", "secondaryProcessHint", "secondaryProcesses",
                "processHints", "needleHint",
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

    /** 单步完成：构建 orderInfo + 关键字段平铺到 result 顶层 */
    public Map<String, Object> composeAndFlatten(ProductionOrder order, Map<String, Object> result) {
        Map<String, Object> orderInfo = buildOrderInfo(order);
        flattenOrderInfoToTop(result, orderInfo);
        return orderInfo;
    }

    // ======================== 工序跟踪更新 ========================

    public void updateProcessTracking(CuttingBundle bundle, String processName,
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
        },
        be -> log.warn("工序跟踪业务拒绝（不阻断扫码）: bundleId={}, processName={}, orderNo={}, msg={}",
                bundle.getId(), processName, order.getOrderNo(), be.getMessage()),
        ise -> log.warn("工序跟踪状态冲突（不阻断扫码）: bundleId={}, processName={}, orderNo={}, msg={}",
                bundle.getId(), processName, order.getOrderNo(), ise.getMessage()),
        e -> log.error("工序跟踪记录更新失败（非业务异常）: bundleId={}, processName={}, orderNo={}",
                bundle.getId(), processName, order.getOrderNo(), e));
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
