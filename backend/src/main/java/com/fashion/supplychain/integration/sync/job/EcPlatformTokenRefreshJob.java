package com.fashion.supplychain.integration.sync.job;

import com.fashion.supplychain.integration.ecommerce.service.EcPlatformOAuthService;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * D-587 电商平台访问令牌定时刷新。
 *
 * <p>访问令牌普遍短期（2小时~30天不等），到期前 7 天内用 refresh_token 静默续期；
 * 刷新令牌本身过期则跳过并记日志（需要商家重新走一次授权，前端 auth-status 会展示过期态）。
 * 单租户失败不阻断其他租户。
 */
@Slf4j
@Component
public class EcPlatformTokenRefreshJob {

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    @Autowired
    private EcPlatformOAuthService ecPlatformOAuthService;

    /** 每天凌晨 3:17 扫描一次（错开整点的对账/备份任务） */
    @Scheduled(cron = "0 17 3 * * ?")
    public void refreshExpiringTokens() {
        List<EcPlatformConfig> configs = ecPlatformConfigService.list();
        int refreshed = 0;
        int skipped = 0;
        for (EcPlatformConfig config : configs) {
            try {
                if (config.getStatus() == null || !"ACTIVE".equals(config.getStatus())) {
                    continue;
                }
                if (config.getAccessToken() == null || config.getAccessToken().isBlank()) {
                    continue; // 凭证模式（手工 token）不走刷新
                }
                LocalDateTime expiresAt = config.getTokenExpiresAt();
                if (expiresAt == null || expiresAt.isAfter(LocalDateTime.now().plusDays(7))) {
                    skipped++;
                    continue;
                }
                if (config.getRefreshToken() == null || config.getRefreshToken().isBlank()) {
                    log.warn("[令牌刷新] 无刷新令牌，需商家重新授权: platform={}, tenant={}",
                            config.getPlatformCode(), config.getTenantId());
                    continue;
                }
                if (ecPlatformOAuthService.refreshTokenIfDue(config)) {
                    refreshed++;
                }
            } catch (Exception e) {
                log.warn("[令牌刷新] 单条处理失败（不阻断）: platform={}, tenant={}, err={}",
                        config.getPlatformCode(), config.getTenantId(), e.getMessage());
            }
        }
        if (refreshed > 0 || skipped == 0) {
            log.info("[令牌刷新] 扫描完成: 刷新={}, 跳过={}", refreshed, skipped);
        }
    }
}
