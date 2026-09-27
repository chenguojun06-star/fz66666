package com.fashion.supplychain.integration.sync.job;

import com.fashion.supplychain.integration.ecommerce.service.PddOrderSyncService;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * D-589 拼多多直连订单定时拉取。
 *
 * <p>每 10 分钟增量拉取近 24 小时订单（窗口滚动覆盖，receiveOrder 按平台单号幂等去重）。
 * 仅处理已完成 OAuth 授权（有 access_token）的 ACTIVE 拼多多配置；
 * 单租户失败不阻断其他租户。后续平台按此样板扩展。
 */
@Slf4j
@Component
public class EcPlatformOrderPullJob {

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    @Autowired
    private PddOrderSyncService pddOrderSyncService;

    @Scheduled(cron = "0 */10 * * * ?")
    public void pullPddOrders() {
        List<EcPlatformConfig> configs;
        try {
            configs = ecPlatformConfigService.listByPlatformCode("PINDUODUO");
        } catch (Exception e) {
            log.warn("[拼多多拉单] 配置查询失败: {}", e.getMessage());
            return;
        }
        for (EcPlatformConfig config : configs) {
            if (config.getAccessToken() == null || config.getAccessToken().isBlank()) {
                continue; // 未完成 OAuth 授权的配置跳过
            }
            try {
                Map<String, Object> result = pddOrderSyncService.pullOrders(config, null);
                if (((Number) result.getOrDefault("synced", 0)).intValue() > 0) {
                    log.info("[拼多多拉单] tenant={} synced={} skipped={}",
                            config.getTenantId(), result.get("synced"), result.get("skipped"));
                }
            } catch (Exception e) {
                log.warn("[拼多多拉单] 拉取失败（不阻断）: tenant={}, err={}",
                        config.getTenantId(), e.getMessage());
            }
        }
    }
}
