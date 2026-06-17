package com.fashion.supplychain.production.executor;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class ScanExecutorSupport {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

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

    public void recomputeProgressSync(String orderId) {
        ExceptionHandler.runRecoverable("订单进度同步重算", () -> {
            if (productionOrderService != null) {
                productionOrderService.recomputeProgressFromRecords(orderId);
            }
        }, e -> log.warn("订单进度同步重算失败(不阻断): orderId={}", orderId, e));
    }

    public void recomputeProgressAsync(String orderId) {
        ExceptionHandler.runRecoverable("订单进度异步重算", () -> {
            if (productionOrderService != null) {
                productionOrderService.recomputeProgressAsync(orderId);
            }
        }, e -> log.warn("订单进度异步重算失败(不阻断): orderId={}", orderId, e));
    }

    public Map<String, Object> buildOrderInfo(ProductionOrder order) {
        Map<String, Object> info = new HashMap<>();
        info.put("orderNo", order.getOrderNo());
        info.put("styleNo", order.getStyleNo());
        return info;
    }

    public static boolean hasText(String str) {
        return StringUtils.hasText(str);
    }

    /**
     * 统一工序跟踪记录更新（不阻断扫码主流程）
     * <p>
     * 收敛三个扫码执行器中重复的工序跟踪更新逻辑，提供一致的：
     * 1. 分类异常处理（BusinessException/IllegalStateException/未知异常）
     * 2. 重试机制（首次未命中 → appendProcessTracking → 再次更新）
     * 3. 统一日志格式（含 bundleId/processName/orderNo）
     *
     * @param bundle       菲号（非空）
     * @param processName  工序名称（非空）
     * @param operatorId   操作人ID
     * @param operatorName 操作人姓名
     * @param scanRecordId 扫码记录ID
     * @param order        关联订单（非空，用于 appendProcessTracking 重试）
     */
    public void updateProcessTracking(CuttingBundle bundle, String processName,
                                       String operatorId, String operatorName, String scanRecordId,
                                       ProductionOrder order) {
        if (bundle == null || !hasText(bundle.getId()) || !hasText(processName)) {
            return;
        }
        if (processTrackingOrchestrator == null) {
            log.warn("工序跟踪编排器未注入，跳过工序跟踪更新: bundleId={}, processName={}",
                    bundle.getId(), processName);
            return;
        }
        if (order == null || !hasText(order.getId())) {
            log.warn("订单信息缺失，跳过工序跟踪更新: bundleId={}, processName={}",
                    bundle.getId(), processName);
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

            // 首次未命中（tracking 记录可能未初始化），追加初始化后重试一次
            log.warn("工序跟踪记录未找到，尝试追加初始化并重试: bundleId={}, processName={}, orderNo={}",
                    bundle.getId(), processName, order.getOrderNo());
            processTrackingOrchestrator.appendProcessTracking(order.getId(), List.of(bundle));
            boolean retryUpdated = processTrackingOrchestrator.updateScanRecord(
                    bundle.getId(), processName, operatorId, operatorName, scanRecordId);

            if (retryUpdated) {
                log.info("工序跟踪记录重试更新成功: bundleId={}, processName={}, orderNo={}",
                        bundle.getId(), processName, order.getOrderNo());
            } else {
                log.warn("工序跟踪记录重试更新仍失败: bundleId={}, processName={}, orderNo={}",
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
}
