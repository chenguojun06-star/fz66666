package com.fashion.supplychain.integration.ecommerce.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.integration.ecommerce.entity.EcStockAlert;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcStockOrchestrator;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.TenantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 库存预警自愈任务（2026-10-31）— 兜底修「预警列表全是 0 / 匹配不到成品库存」。
 *
 * <h3>为什么需要定时兜底</h3>
 * 入库 → 电商库存重算这条链在部分入库路径上是断的（成品入库主流程
 * {@code ProductWarehousingOrchestrator}、仓库入库/出库操作
 * {@code FinishedWarehouseOperationOrchestrator} 都没有触发重算），
 * 而预警又只在创建时写一次快照 —— 结果就是「入库了 280 件，预警还显示库存 0」，
 * 且永远不会自己恢复。
 *
 * <p>本任务每 15 分钟对**有未解决预警**的 SKU 做一次"重算 + 对齐"：
 * 有货的自动关闭预警，缺货的刷新成当前真实数字。只处理预警涉及的 SKU，
 * 不做全量重算（线上当前 14 条预警，成本可忽略）。
 *
 * <p>注意：这是兜底，不是主链路。真正及时的做法是入库/出库后发布
 * {@code StockChangeEvent}（{@code StockChangePublisher}），两者并存。
 */
@Slf4j
@Component
public class EcStockAlertReconcileJob {

    /** 开关：默认开启，出问题可临时关掉（配置 xiaoyun.job.ec-stock-alert-reconcile.enabled=false） */
    @Value("${xiaoyun.job.ec-stock-alert-reconcile.enabled:true}")
    private boolean enabled;

    private static final String LOCK_KEY = "job:ec-stock-alert-reconcile";
    private static final long LOCK_TIMEOUT_MINUTES = 10;

    /** 电商集成未启用时为 null，任务自动跳过 */
    @Autowired(required = false)
    private EcStockOrchestrator ecStockOrchestrator;

    @Autowired
    private TenantService tenantService;

    @Autowired
    private DistributedLockService distributedLockService;

    /** 每 15 分钟跑一次（错开整点，避免和其他任务撞在一起） */
    @Scheduled(cron = "0 7,22,37,52 * * * ?")
    public void reconcile() {
        if (!enabled) {
            log.debug("[EcStockAlertReconcile] 已禁用，跳过");
            return;
        }
        if (ecStockOrchestrator == null) {
            log.debug("[EcStockAlertReconcile] 电商模块未启用，跳过");
            return;
        }
        try {
            distributedLockService.executeWithLock(LOCK_KEY, LOCK_TIMEOUT_MINUTES, TimeUnit.MINUTES,
                    this::doReconcile);
        } catch (Exception e) {
            // 抢锁失败（别的实例正在跑）属正常，不打错误日志
            log.debug("[EcStockAlertReconcile] 本次跳过: {}", e.getMessage());
        }
    }

    private void doReconcile() {
        List<Tenant> tenants = tenantService.list();
        int totalLeft = 0;
        for (Tenant tenant : tenants) {
            if (tenant.getId() == null) {
                continue;
            }
            try {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenant.getId());
                ctx.setSuperAdmin(false);
                UserContext.set(ctx);

                // reconcileAlerts 内部已完成"重算 + 覆盖快照 + 自动关闭已恢复"，
                // 返回的就是仍需关注的预警（已恢复的不再返回）
                List<EcStockAlert> left = ecStockOrchestrator.reconcileAlerts(tenant.getId(), true);
                totalLeft += left.size();
            } catch (Exception e) {
                log.warn("[EcStockAlertReconcile] 租户{}对齐失败: {}", tenant.getId(), e.getMessage());
            } finally {
                UserContext.clear();
            }
        }
        log.info("[EcStockAlertReconcile] 完成：剩余未解决预警 {} 条", totalLeft);
    }
}
