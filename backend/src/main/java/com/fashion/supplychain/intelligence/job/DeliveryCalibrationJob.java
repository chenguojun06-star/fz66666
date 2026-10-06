package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.intelligence.orchestration.DeliveryCalibrationOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * D-754 P3：交期偏差回扫自校准每日执行。
 * <p>
 * 每天回扫近 180 天已完工订单，刷新 {@code t_delivery_calibration_stat} 的
 * 准交率 / 偏差天数 / 偏差倍数，让「交期建议」吃到的永远是近半年真实交付表现，
 * 而不是固定 5 天缓冲的拍脑袋值。
 */
@Slf4j
@Component
public class DeliveryCalibrationJob extends AbstractPatrolJob {

    private final DeliveryCalibrationOrchestrator deliveryCalibrationOrchestrator;

    public DeliveryCalibrationJob(@Lazy DeliveryCalibrationOrchestrator deliveryCalibrationOrchestrator) {
        this.deliveryCalibrationOrchestrator = deliveryCalibrationOrchestrator;
    }

    @Scheduled(cron = "0 20 3 * * ?")
    public void patrol() {
        long begin = System.currentTimeMillis();
        log.info("[DeliveryCalibration] ===== 交期偏差回扫自校准开始 =====");
        var tenants = getActiveTenantIds();
        int calibrated = 0;
        for (Long tenantId : tenants) {
            try {
                withTenantContext(tenantId, () -> {
                    var resp = deliveryCalibrationOrchestrator.calibrate();
                    log.info("[DeliveryCalibration] 租户{} 校准完成: {}", tenantId, resp.get("summary"));
                });
                calibrated++;
            } catch (Exception e) {
                log.warn("[DeliveryCalibration] 租户{} 校准异常: {}", tenantId, e.getMessage());
            }
        }
        log.info("[DeliveryCalibration] ===== 校准完成 {}/{} 租户，耗时 {}ms =====",
                calibrated, tenants.size(), System.currentTimeMillis() - begin);
    }
}