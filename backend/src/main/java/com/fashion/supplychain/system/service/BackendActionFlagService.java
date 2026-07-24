package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.system.entity.TenantSmartFeature;
import com.fashion.supplychain.system.mapper.TenantSmartFeatureMapper;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 后端动作类智能开关查询服务。
 *
 * <p>用于各 Orchestrator 在执行"会触发实际操作"的智能能力前查询开关状态，
 * 遵循用户诉求"智能能力不要自动执行，让用户可以设置"。
 *
 * <p>所有开关默认关闭（false），需租户管理员在「智能化配置」面板手动开启。
 *
 * <p>支持的开关（{@link BackendActionKey}）：
 * <ul>
 *   <li>{@code AUTO_PRICE_SYNC} — 自动改价同步到平台</li>
 *   <li>{@code AUTO_REFUND_APPROVE} — 退款自动审核通过</li>
 *   <li>{@code AUTO_STOCK_DELIST} — 缺货自动下架</li>
 *   <li>{@code AUTO_RECEIVABLE_NOTIFY} — 逾期应收自动通知</li>
 *   <li>{@code AUTO_WORKER_ANOMALY_NOTIFY} — 工人效率异常自动通知</li>
 *   <li>{@code AUTO_DELIVERY_RISK_NOTIFY} — 交期风险自动通知</li>
 *   <li>{@code AUTO_STAGNANT_NOTIFY} — 工序停滞自动通知</li>
 *   <li>{@code AUTO_PATROL_EXEC} — 巡检自动执行（创建跟进任务+微信通知）</li>
 *   <li>{@code AUTO_TASK_ESCALATION} — 协作任务逾期自动升级</li>
 *   <li>{@code AUTO_TASK_REMINDER} — 个人任务到期自动提醒</li>
 *   <li>{@code AUTO_EC_STOCK_SYNC} — 电商库存自动同步到平台</li>
 *   <li>{@code AUTO_HIGH_SEVERITY_DISPATCH} — 高危巡检告警自动派发</li>
 *   <li>{@code AUTO_MIND_PUSH} — 生产智能提醒自动推送（微信/站内通知）</li>
 *   <li>{@code AUTO_DAILY_INSIGHT_DISPATCH} — 每日洞察自动生成并派发协作任务</li>
 *   <li>{@code AUTO_AGENT_BACKGROUND_TASK} — AI 后台任务自动执行</li>
 * </ul>
 */
@Slf4j
@Service
public class BackendActionFlagService {

    /** 后端动作类开关 Key 枚举 */
    public enum BackendActionKey {
        AUTO_PRICE_SYNC("backend.action.auto_price_sync", "自动改价同步到平台"),
        AUTO_REFUND_APPROVE("backend.action.auto_refund_approve", "退款自动审核通过"),
        AUTO_STOCK_DELIST("backend.action.auto_stock_delist", "缺货自动下架"),
        AUTO_RECEIVABLE_NOTIFY("backend.action.auto_receivable_notify", "逾期应收自动通知"),
        AUTO_WORKER_ANOMALY_NOTIFY("backend.action.auto_worker_anomaly_notify", "工人效率异常自动通知"),
        AUTO_DELIVERY_RISK_NOTIFY("backend.action.auto_delivery_risk_notify", "交期风险自动通知"),
        AUTO_STAGNANT_NOTIFY("backend.action.auto_stagnant_notify", "工序停滞自动通知"),
        AUTO_PATROL_EXEC("backend.action.auto_patrol_exec", "巡检自动执行（创建跟进任务+微信通知）"),
        AUTO_TASK_ESCALATION("backend.action.auto_task_escalation", "协作任务逾期自动升级"),
        AUTO_TASK_REMINDER("backend.action.auto_task_reminder", "个人任务到期自动提醒"),
        AUTO_EC_STOCK_SYNC("backend.action.auto_ec_stock_sync", "电商库存自动同步到平台"),
        AUTO_HIGH_SEVERITY_DISPATCH("backend.action.auto_high_severity_dispatch", "高危巡检告警自动派发"),
        AUTO_MIND_PUSH("backend.action.auto_mind_push", "生产智能提醒自动推送（微信/站内通知）"),
        AUTO_DAILY_INSIGHT_DISPATCH("backend.action.auto_daily_insight_dispatch", "每日洞察自动生成并派发协作任务"),
        AUTO_AGENT_BACKGROUND_TASK("backend.action.auto_agent_background_task", "AI 后台任务自动执行");

        private final String key;
        private final String label;

        BackendActionKey(String key, String label) {
            this.key = key;
            this.label = label;
        }

        public String key() {
            return key;
        }

        public String label() {
            return label;
        }
    }

    /** 所有后端动作类开关 Key 列表（用于批量查询） */
    public static final List<String> ALL_BACKEND_ACTION_KEYS;

    static {
        ALL_BACKEND_ACTION_KEYS = Arrays.stream(BackendActionKey.values())
                .map(BackendActionKey::key)
                .toList();
    }

    @Autowired
    private TenantSmartFeatureMapper tenantSmartFeatureMapper;

    /**
     * 查询指定租户的某个后端动作开关是否启用。
     *
     * <p>查询失败或记录不存在时返回 false（安全降级：默认不执行自动动作）。
     *
     * @param tenantId 租户ID（必填）
     * @param action   动作开关枚举
     * @return true=已启用；false=未启用或查询失败
     */
    public boolean isEnabled(Long tenantId, BackendActionKey action) {
        if (tenantId == null || action == null) {
            return false;
        }
        try {
            TenantSmartFeature row = tenantSmartFeatureMapper.selectOne(
                    new LambdaQueryWrapper<TenantSmartFeature>()
                            .eq(TenantSmartFeature::getTenantId, tenantId)
                            .eq(TenantSmartFeature::getFeatureKey, action.key())
                            .last("LIMIT 1")
            );
            return row != null && Boolean.TRUE.equals(row.getEnabled());
        } catch (Exception e) {
            log.warn("[BackendActionFlag] 查询开关失败 tenantId={} key={} 返回false",
                    tenantId, action.key(), e);
            return false;
        }
    }

    /**
     * 批量查询指定租户的所有后端动作开关状态。
     *
     * @param tenantId 租户ID
     * @return Map&lt;actionKey, enabled&gt;，未查询到默认为 false
     */
    public Map<String, Boolean> listFlags(Long tenantId) {
        if (tenantId == null) {
            return Collections.emptyMap();
        }
        Map<String, Boolean> flags = new HashMap<>();
        for (BackendActionKey k : BackendActionKey.values()) {
            flags.put(k.key(), false);
        }
        try {
            List<TenantSmartFeature> rows = tenantSmartFeatureMapper.selectList(
                    new LambdaQueryWrapper<TenantSmartFeature>()
                            .eq(TenantSmartFeature::getTenantId, tenantId)
                            .in(TenantSmartFeature::getFeatureKey, ALL_BACKEND_ACTION_KEYS)
            );
            for (TenantSmartFeature row : rows) {
                if (row.getFeatureKey() != null) {
                    flags.put(row.getFeatureKey(), Boolean.TRUE.equals(row.getEnabled()));
                }
            }
        } catch (Exception e) {
            log.warn("[BackendActionFlag] 批量查询开关失败 tenantId={} 返回全false", tenantId, e);
        }
        return flags;
    }
}
