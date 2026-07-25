package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.SoulAnchorRebuildService;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.TenantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * soul.py 多锚点身份一致性校验定时任务（五层记忆模型第七章）
 *
 * <p>每周日 02:30 执行，遍历所有租户，检测 4 个锚点完整性：
 * <ul>
 *   <li>工厂画像（t_factory.supplier_tier 非空记录）</li>
 *   <li>用户偏好（t_memory_bank_entry.category=user_profile）</li>
 *   <li>历史决策（t_memory_bank_entry.category=decision_log）</li>
 *   <li>反思记忆（t_ai_long_memory.layer=REFLECTIVE）</li>
 * </ul>
 *
 * <p>发现缺失锚点时：
 * <ul>
 *   <li>自动重建 decisionLog（从 memory-bank/decisionLog.md 回灌）</li>
 *   <li>其他锚点：log.warn 告警 + 记录到 metric，需人工/LLM 介入</li>
 * </ul>
 *
 * <p>设计原则：
 * <ul>
 *   <li>多租户隔离（P0 铁律 4）：每租户独立检测，UserContext 设置后清理</li>
 *   <li>单租户失败不影响其他租户（per-tenant try-catch）</li>
 *   <li>失败不影响主流程（外层 try-catch 兜底）</li>
 *   <li>凌晨错峰：02:30 与 03:00+ 的其他巡检错开</li>
 * </ul>
 *
 * @author xiaoyun
 * @since 2026-07-26
 */
@Slf4j
@Component
@Lazy
public class SoulAnchorConsistencyJob {

    @Autowired private SoulAnchorRebuildService soulAnchorRebuildService;
    @Autowired private TenantService tenantService;

    @Value("${xiaoyun.soul.consistency-check.enabled:true}")
    private boolean checkEnabled;

    /**
     * 每周日 02:30 执行多锚点一致性校验
     *
     * <p>选择周日凌晨原因：
     * <ul>
     *   <li>非业务高峰，不影响在线用户</li>
     *   <li>与凌晨 03:00+ 的其他巡检错开 30 分钟，避免 DB 资源争抢</li>
     *   <li>每周一次频率足够（锚点变化不频繁）</li>
     * </ul>
     */
    @Scheduled(cron = "0 30 2 * * SUN")
    public void checkConsistency() {
        if (!checkEnabled) {
            log.debug("[SoulAnchor] 一致性校验已禁用（xiaoyun.soul.consistency-check.enabled=false）");
            return;
        }
        log.info("[SoulAnchor] 多锚点一致性校验开始");
        List<Tenant> tenants;
        try {
            tenants = tenantService.list();
        } catch (Exception e) {
            log.warn("[SoulAnchor] 加载租户列表失败: {}", e.getMessage());
            return;
        }
        if (tenants == null || tenants.isEmpty()) {
            log.info("[SoulAnchor] 无租户，跳过");
            return;
        }

        int totalChecked = 0;
        int totalInconsistent = 0;
        int totalRebuilt = 0;
        List<String> inconsistentTenants = new ArrayList<>();

        for (Tenant tenant : tenants) {
            if (tenant.getId() == null) continue;
            Long tenantId = tenant.getId();
            try {
                UserContext.set(buildContext(tenant));
                totalChecked++;
                SoulAnchorRebuildService.SoulAnchorStatus status =
                        soulAnchorRebuildService.detectAnchors(tenantId);
                if (!status.isAllExists()) {
                    totalInconsistent++;
                    inconsistentTenants.add(String.format("tenant=%d(factory=%s/user=%s/decision=%s/reflective=%s)",
                            tenantId,
                            status.isFactoryProfileExists() ? "OK" : "MISSING",
                            status.isUserProfileExists() ? "OK" : "MISSING",
                            status.isDecisionLogExists() ? "OK" : "MISSING",
                            status.isReflectiveMemExists() ? "OK" : "MISSING"));
                    log.warn("[SoulAnchor] 租户{}锚点不完整: {}", tenantId, status.toMap());

                    // 自动重建缺失锚点
                    SoulAnchorRebuildService.RebuildResult result =
                            soulAnchorRebuildService.rebuildMissingAnchors(tenantId);
                    if (result.isDecisionLogRebuilt()) {
                        totalRebuilt++;
                    }
                }
            } catch (Exception e) {
                log.warn("[SoulAnchor] 租户{}一致性校验失败: {}", tenantId, e.getMessage());
            } finally {
                UserContext.clear();
            }
        }

        log.info("[SoulAnchor] 多锚点一致性校验完成: 检查{}租户, 不完整{}, 自动重建decisionLog {}",
                totalChecked, totalInconsistent, totalRebuilt);
        if (!inconsistentTenants.isEmpty()) {
            log.warn("[SoulAnchor] 不完整租户列表: {}", inconsistentTenants);
        }
    }

    private UserContext buildContext(Tenant tenant) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenant.getId());
        ctx.setSuperAdmin(false);
        return ctx;
    }
}
