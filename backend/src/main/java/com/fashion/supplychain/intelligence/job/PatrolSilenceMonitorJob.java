package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.service.SysNoticeService;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.BackendActionFlagService;
import com.fashion.supplychain.system.service.BackendActionFlagService.BackendActionKey;
import com.fashion.supplychain.system.service.TenantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * D-513 巡检产出静默监控 —— 专治「任务在跑、不报错、但什么都不产出」。
 *
 * <h3>为什么要这个 Job</h3>
 * 2026-06-13 起，{@code backend.action.auto_patrol_exec} 开关处于关闭状态且无人察觉，
 * 导致 {@link AbstractPatrolJob} 的全部子类（AiPatrolJob / RiskSentinel / AnomalyDetector /
 * CrewCoordinator … 共 13 个巡检 Job）整体停摆，{@code t_ai_patrol_action} 零新增，
 * 持续 3 个多月才被用户偶然发现。
 * <p>之所以拖这么久：任务本身「还在按 cron 触发」，不抛异常，跳过逻辑只打 debug 日志
 * （生产日志级别看不到），因此监控体系里没有任何信号。这是典型的<b>静默失效</b>。
 *
 * <h3>本 Job 的检测口径</h3>
 * 逐租户查 {@code t_ai_patrol_action} 的最近产出时间，超过阈值即发站内信告警，
 * 并按「总开关是否开启」区分两种完全不同的原因，避免把「用户主动关闭」误报成故障：
 * <ul>
 *   <li>开关未开启 → 提醒「巡检总开关未开，AI 巡检未运行」</li>
 *   <li>开关已开启 → 提醒「开关已开但已 N 小时无产出，可能存在异常」</li>
 * </ul>
 *
 * <h3>两个刻意的设计约束（改动前务必理解）</h3>
 * <ol>
 *   <li><b>不继承 {@link AbstractPatrolJob}</b>：基类带有开关总闸，
 *       继承即意味着开关一关监控自己也停摆，等于没有监控——而这恰恰是要防的场景。</li>
 *   <li><b>不判断 AUTO_PATROL_EXEC 来决定是否执行</b>：开关状态只用来<b>区分告警文案</b>，
 *       绝不用来 gate 本 Job 的运行。</li>
 * </ol>
 */
@Slf4j
@Component
public class PatrolSilenceMonitorJob {

    /** 超过该小时数无巡检产出即告警。巡检每天 5 轮（0/8/12/16/20 点），48h 足以容忍偶发单轮失败。 */
    private static final long SILENCE_THRESHOLD_HOURS = 48;

    @Autowired(required = false)
    private ProcessStatsEngine processStatsEngine;

    @Autowired(required = false)
    private TenantService tenantService;

    @Autowired(required = false)
    private SysNoticeService sysNoticeService;

    @Autowired(required = false)
    private BackendActionFlagService backendActionFlagService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /**
     * 每天 10:00 检查一次。巡检在 0/8/12/16/20 点跑，10 点检查刚好能覆盖 8 点那一轮的结果，
     * 避免在「巡检刚跑完但还没落库」的窗口误报。
     */
    @Scheduled(cron = "0 0 10 * * ?")
    public void checkPatrolSilence() {
        List<Long> tenantIds = resolveTenantIds();
        if (tenantIds.isEmpty()) {
            log.debug("[PatrolSilence] 无租户可检查，跳过");
            return;
        }

        int alerted = 0;
        for (Long tenantId : tenantIds) {
            if (tenantId == null) {
                continue;
            }
            try {
                if (checkTenant(tenantId)) {
                    alerted++;
                }
            } catch (Exception e) {
                // 单个租户异常不影响其余租户；本 Job 自身绝不能因异常中断
                log.warn("[PatrolSilence] 租户 {} 巡检产出检查异常: {}", tenantId, e.getMessage());
            }
        }
        log.info("[PatrolSilence] 巡检产出检查完成: 租户数={}, 告警数={}", tenantIds.size(), alerted);
    }

    /**
     * 检查单个租户的巡检产出，需要告警时发站内信。
     *
     * @return 是否产生了告警
     */
    private boolean checkTenant(Long tenantId) {
        LocalDateTime lastProduced = queryLastProducedAt(tenantId);
        LocalDateTime now = LocalDateTime.now();

        if (lastProduced != null) {
            long silentHours = Duration.between(lastProduced, now).toHours();
            if (silentHours <= SILENCE_THRESHOLD_HOURS) {
                return false;
            }
        }

        boolean switchOn = isPatrolSwitchOn(tenantId);
        long silentHours = lastProduced == null
                ? -1
                : Duration.between(lastProduced, now).toHours();

        String title;
        String content;
        if (!switchOn) {
            // 用户主动关闭 ≠ 故障：只做提醒，避免误报为系统异常
            title = "AI 巡检未运行：总开关未开启";
            content = "检测到「AI 巡检总开关」处于关闭状态，AI 巡检未运行，巡检工单中心不会产生新记录。"
                    + "如需恢复，请到「个人中心 → 智能设置」开启该开关。"
                    + (lastProduced == null
                        ? "（本租户暂无巡检历史记录）"
                        : "（最近一次巡检产出：" + lastProduced + "）");
        } else if (lastProduced == null) {
            title = "AI 巡检异常：总开关已开但从未产出";
            content = "「AI 巡检总开关」已开启，但巡检工单表从未产生过记录，可能存在任务异常，请排查。";
        } else {
            title = "AI 巡检异常：已 " + silentHours + " 小时无产出";
            content = "「AI 巡检总开关」已开启，但已连续 " + silentHours + " 小时没有产生任何巡检工单"
                    + "（最近一次产出：" + lastProduced + "），可能任务已静默失效，请排查。";
        }

        log.warn("[PatrolSilence] 巡检产出告警: tenant={}, switchOn={}, lastProduced={}, silentHours={}",
                tenantId, switchOn, lastProduced, silentHours);

        sendNotice(tenantId, title, content);
        return true;
    }

    /**
     * 查询该租户最近一次巡检产出时间；无记录返回 null。
     * 直接走 JdbcTemplate 而非 Mapper：本 Job 不持有租户上下文，
     * 需避免 MyBatis 租户拦截器改写条件导致查不到数据。
     */
    private LocalDateTime queryLastProducedAt(Long tenantId) {
        try {
            Timestamp ts = jdbcTemplate.queryForObject(
                    "SELECT MAX(create_time) FROM t_ai_patrol_action WHERE tenant_id = ?",
                    Timestamp.class, tenantId);
            return ts == null ? null : ts.toLocalDateTime();
        } catch (Exception e) {
            log.debug("[PatrolSilence] 查询巡检产出时间失败 tenant={}: {}", tenantId, e.getMessage());
            return null;
        }
    }

    private boolean isPatrolSwitchOn(Long tenantId) {
        if (backendActionFlagService == null) {
            return false;
        }
        try {
            return backendActionFlagService.isEnabled(tenantId, BackendActionKey.AUTO_PATROL_EXEC);
        } catch (Exception e) {
            log.debug("[PatrolSilence] 查询巡检开关失败 tenant={}: {}", tenantId, e.getMessage());
            return false;
        }
    }

    /** 站内信告警，失败不阻断（降级为日志） */
    private void sendNotice(Long tenantId, String title, String content) {
        if (sysNoticeService == null) {
            log.warn("[PatrolSilence] SysNoticeService 未注入，告警仅落日志: tenant={}, title={}", tenantId, title);
            return;
        }
        try {
            SysNotice notice = new SysNotice();
            notice.setTenantId(tenantId);
            notice.setToName("管理员");
            notice.setFromName("AI巡检引擎");
            notice.setTitle(title);
            notice.setContent(content);
            notice.setNoticeType("patrol_silence");
            notice.setIsRead(0);
            notice.setHandlingStatus("none");
            notice.setCreatedAt(LocalDateTime.now());
            sysNoticeService.save(notice);
        } catch (Exception e) {
            log.warn("[PatrolSilence] 告警站内信发送失败(降级): tenant={}, error={}", tenantId, e.getMessage());
        }
    }

    /**
     * 活跃租户列表：优先取近 90 天有扫码记录的租户，取不到则退回全部启用租户。
     * 与 AbstractPatrolJob 的口径保持一致，但不复用其方法（基类带开关总闸）。
     */
    private List<Long> resolveTenantIds() {
        try {
            List<Long> active = processStatsEngine != null
                    ? processStatsEngine.findActiveTenantIds()
                    : null;
            if (active != null && !active.isEmpty()) {
                return active;
            }
        } catch (Exception e) {
            log.debug("[PatrolSilence] 获取活跃租户失败，退回全部启用租户: {}", e.getMessage());
        }
        if (tenantService == null) {
            return List.of();
        }
        try {
            return tenantService.list().stream()
                    .filter(t -> !"DISABLED".equalsIgnoreCase(t.getStatus())
                            && !"SUSPENDED".equalsIgnoreCase(t.getStatus()))
                    .map(Tenant::getId)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[PatrolSilence] 获取租户列表失败: {}", e.getMessage());
            return List.of();
        }
    }
}
