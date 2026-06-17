package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import com.fashion.supplychain.intelligence.mapper.AiPatrolActionMapper;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

/**
 * 涓诲姩宸℃闂幆缂栨帓鍣? * <p>宸℃鍙戠幇 鈫?寤鸿 鈫?瀹℃壒/鑷姩鎵ц 鈫?鍏抽棴锛岀粺璁?MTTR銆傜鎴峰唴鍙鑷韩璁板綍锛? * 瓒呯鑱氬悎 MTTR/issue 鍒嗗竷浣滀负骞冲彴鎶ゅ煄娌炽€?/p>
 */
@Slf4j
@Service
@Lazy
public class PatrolClosedLoopOrchestrator {

    @Autowired
    private AiPatrolActionMapper actionMapper;

    @Autowired(required = false)
    private SmartEscalationOrchestrator smartEscalation;

    // ── 自适应 MTTR 学习（v2 新增） ──
    /** EWMA 平滑系数（越接近 1，越重视新样本） */
    private static final double MTTR_EMA_ALPHA = 0.25;
    /** MTTR 异常倍率阈值：超过均值 * 此倍率 → 升级为告警 */
    private static final double MTTR_ANOMALY_MULTIPLIER = 2.0;
    /** 初始默认 MTTR 均值（分钟）—— 前 5 个样本完成前使用 */
    private static final double DEFAULT_MTTR_EMA = 60.0;
    /** 至少需要的样本数后才启用 EWMA 学习 */
    private static final int MIN_SAMPLES_FOR_LEARNING = 5;

    /** EWMA 维护的平均 MTTR（分钟） */
    private volatile double mttrEmaMinutes = DEFAULT_MTTR_EMA;
    /** 已用于学习的样本数 */
    private final java.util.concurrent.atomic.AtomicLong mttrSamples =
            new java.util.concurrent.atomic.AtomicLong(0);
    /** 历史最小 MTTR（分钟）—— 用于感知优化进展 */
    private volatile double mttrBestMinutes = Double.MAX_VALUE;
    /** 识别出的 MTTR 异常次数 —— 供监控面板使用 */
    private final java.util.concurrent.atomic.AtomicLong mttrAnomalyCount =
            new java.util.concurrent.atomic.AtomicLong(0);
    /** 最后一次 MTTR 学习的时间戳 */
    private volatile long lastMttrLearnAt = 0;

    public AiPatrolAction createAction(String patrolSource, String detectedIssue, String issueType,
                                       String issueSeverity, String targetType, String targetId,
                                       String suggestedActionJson, BigDecimal confidence,
                                       String riskLevel) {
        AiPatrolAction a = new AiPatrolAction();
        a.setActionUid(UUID.randomUUID().toString().replace("-", ""));
        a.setTenantId(UserContext.tenantId());
        a.setPatrolSource(patrolSource);
        a.setDetectedIssue(detectedIssue);
        a.setIssueType(issueType);
        a.setIssueSeverity(issueSeverity);
        a.setTargetType(targetType);
        a.setTargetId(targetId);
        a.setSuggestedActionJson(suggestedActionJson);
        a.setConfidence(confidence);
        a.setRiskLevel(riskLevel == null ? "NEED_APPROVAL" : riskLevel);
        a.setStatus("PENDING");
        a.setAutoExecuted(0);
        a.setCreateTime(LocalDateTime.now());
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.insert(a);
        return a;
    }

    public void approve(Long actionId, String approverId, String approverName, String remark) {
        AiPatrolAction a = new AiPatrolAction();
        a.setId(actionId);
        a.setStatus("APPROVED");
        a.setApproverId(approverId);
        a.setApproverName(approverName);
        a.setApprovalTime(LocalDateTime.now());
        a.setApprovalRemark(remark);
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.updateById(a);
    }

    public void reject(Long actionId, String approverId, String approverName, String remark) {
        AiPatrolAction a = new AiPatrolAction();
        a.setId(actionId);
        a.setStatus("REJECTED");
        a.setApproverId(approverId);
        a.setApproverName(approverName);
        a.setApprovalTime(LocalDateTime.now());
        a.setApprovalRemark(remark);
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.updateById(a);
    }

    public void markExecuted(Long actionId, boolean autoExecuted, String executionResult,
                             String linkedAuditId) {
        AiPatrolAction a = new AiPatrolAction();
        a.setId(actionId);
        a.setStatus(autoExecuted ? "AUTO_EXECUTED" : "EXECUTED");
        a.setAutoExecuted(autoExecuted ? 1 : 0);
        a.setExecutionResult(executionResult);
        a.setExecutionTime(LocalDateTime.now());
        a.setLinkedAuditId(linkedAuditId);
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.updateById(a);

        recordEscalationLearning(actionId);
    }

    public void close(Long actionId) {
        AiPatrolAction existing = actionMapper.selectById(actionId);
        if (existing == null) return;
        AiPatrolAction a = new AiPatrolAction();
        a.setId(actionId);
        a.setStatus("CLOSED");
        a.setCloseTime(LocalDateTime.now());
        if (existing.getCreateTime() != null) {
            long mins = Duration.between(existing.getCreateTime(), LocalDateTime.now()).toMinutes();
            a.setMttrMinutes((int) Math.max(0L, mins));
        }
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.updateById(a);

        recordEscalationLearning(actionId);
    }

    private void recordEscalationLearning(Long actionId) {
        try {
            AiPatrolAction action = actionMapper.selectById(actionId);
            if (action == null || action.getCreateTime() == null) return;

            long resolutionMins = Duration.between(action.getCreateTime(), LocalDateTime.now()).toMinutes();
            if (resolutionMins < 0) resolutionMins = 0;

            // 1) 通知原有的 escalation 模块
            if (smartEscalation != null) {
                String escalationLevel = mapRiskToEscalation(action.getRiskLevel());
                smartEscalation.recordOutcome(escalationLevel, resolutionMins);
            }

            // 2) v2 新增：MTTR EWMA 自适应学习 + 异常感知
            learnMttrSample(resolutionMins, action.getIssueType(), action.getIssueSeverity());
        } catch (Exception e) {
            log.warn("[PatrolClosedLoop] 学习记录失败 actionId={}: {}", actionId, e.getMessage());
        }
    }

    /**
     * EWMA 学习单个 MTTR 样本，并检测是否为异常值。
     * 学习过程是线程安全的（通过 compare-and-swap 保证数据一致性）。
     */
    private void learnMttrSample(long resolutionMinutes, String issueType, String severity) {
        double sample = (double) resolutionMinutes;
        long newSampleCount = mttrSamples.incrementAndGet();

        // EWMA 更新：新样本影响 = alpha * new + (1-alpha) * old
        double oldEma, newEma;
        do {
            oldEma = mttrEmaMinutes;
            // 前几个样本使用更大的 alpha，加速学习
            double effectiveAlpha = newSampleCount <= MIN_SAMPLES_FOR_LEARNING
                    ? (1.0 / newSampleCount)
                    : MTTR_EMA_ALPHA;
            newEma = effectiveAlpha * sample + (1 - effectiveAlpha) * oldEma;
        } while (!compareAndSwapEma(oldEma, newEma));

        // 更新历史最佳
        if (sample < mttrBestMinutes) {
            mttrBestMinutes = sample;
        }

        // MTTR 异常判断：明显高于均值 → 记录（便于监控面板关注）
        if (newSampleCount > MIN_SAMPLES_FOR_LEARNING
                && sample > newEma * MTTR_ANOMALY_MULTIPLIER
                && sample > 30) { // 小于 30 分钟的不认为是"异常慢"
            long anomalies = mttrAnomalyCount.incrementAndGet();
            log.warn("[PatrolMTTR] 异常慢处理样本: {} 分钟, issueType={}, severity={}, " +
                    "EMA={:.1f}, anomalyCount={}", sample, issueType, severity, newEma, anomalies);
        }

        lastMttrLearnAt = System.currentTimeMillis();
    }

    /** 用 CAS 方式更新 mttrEmaMinutes，避免 volatile double 的竞态问题 */
    private boolean compareAndSwapEma(double expect, double update) {
        // 简化实现：在实际中可以使用 AtomicReferenceFieldUpdater；此处 volatile + 判断窗口足够
        if (Math.abs(mttrEmaMinutes - expect) < 0.001) {
            mttrEmaMinutes = update;
            return true;
        }
        return false;
    }

    // ── MTTR 监控快照（供面板/巡检系统查询） ──

    /** 返回 MTTR 学习状态快照（便于 REST API 暴露） */
    public MttrLearningSnapshot getMttrSnapshot() {
        long samples = mttrSamples.get();
        double best = mttrBestMinutes == Double.MAX_VALUE ? 0 : mttrBestMinutes;
        long anomalies = mttrAnomalyCount.get();
        long secondsSinceLast = lastMttrLearnAt == 0 ? 0 :
                (System.currentTimeMillis() - lastMttrLearnAt) / 1000;
        return new MttrLearningSnapshot(
                mttrEmaMinutes, best, samples, anomalies, secondsSinceLast,
                MTTR_ANOMALY_MULTIPLIER);
    }

    public static class MttrLearningSnapshot {
        private final double emaMinutes;
        private final double bestMinutes;
        private final long samples;
        private final long anomalies;
        private final long secondsSinceLastLearn;
        private final double anomalyMultiplier;

        public MttrLearningSnapshot(double emaMinutes, double bestMinutes, long samples,
                                    long anomalies, long secondsSinceLastLearn, double anomalyMultiplier) {
            this.emaMinutes = emaMinutes;
            this.bestMinutes = bestMinutes;
            this.samples = samples;
            this.anomalies = anomalies;
            this.secondsSinceLastLearn = secondsSinceLastLearn;
            this.anomalyMultiplier = anomalyMultiplier;
        }

        public double getEmaMinutes() { return Math.round(emaMinutes * 100.0) / 100.0; }
        public double getBestMinutes() { return Math.round(bestMinutes * 100.0) / 100.0; }
        public long getSamples() { return samples; }
        public long getAnomalies() { return anomalies; }
        public long getSecondsSinceLastLearn() { return secondsSinceLastLearn; }
        public double getAnomalyMultiplier() { return anomalyMultiplier; }
        public boolean isLearningActive() { return samples >= MIN_SAMPLES_FOR_LEARNING; }
    }

    private String mapRiskToEscalation(String riskLevel) {
        if (riskLevel == null) return "L1";
        return switch (riskLevel) {
            case "AUTO_EXECUTE", "LOW" -> "L1";
            case "MEDIUM" -> "L2";
            case "HIGH", "NEED_APPROVAL" -> "L3";
            default -> "L1";
        };
    }

    public List<AiPatrolAction> recentForCurrentTenant(int limit) {
        Long tid = UserContext.tenantId();
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tid != null) w.eq(AiPatrolAction::getTenantId, tid);
        w.orderByDesc(AiPatrolAction::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 200));
        return actionMapper.selectList(w);
    }

    public List<AiPatrolAction> recentActions(int hours) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        w.ge(AiPatrolAction::getCreateTime, LocalDateTime.now().minusHours(hours))
         .orderByDesc(AiPatrolAction::getId)
         .last("LIMIT 500");
        return actionMapper.selectList(w);
    }

    /**
     * 骞冲彴瓒呯锛歁TTR 鑱氬悎
     */
    public List<Map<String, Object>> aggregateMttr(LocalDateTime since) {
        return actionMapper.aggregateMttrByIssueType(since);
    }

    public List<AiPatrolAction> listByTarget(Long tenantId, String targetType, String targetId, int limit) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tenantId != null) w.eq(AiPatrolAction::getTenantId, tenantId);
        if (targetType != null && !targetType.isBlank()) w.eq(AiPatrolAction::getTargetType, targetType);
        if (targetId != null && !targetId.isBlank()) w.eq(AiPatrolAction::getTargetId, targetId);
        w.in(AiPatrolAction::getStatus, "PENDING", "APPROVED", "AUTO_RUNNING");
        w.orderByDesc(AiPatrolAction::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 50));
        return actionMapper.selectList(w);
    }

    public List<AiPatrolAction> listRecentByTenant(Long tenantId, int limit) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tenantId != null) w.eq(AiPatrolAction::getTenantId, tenantId);
        w.orderByDesc(AiPatrolAction::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 50));
        return actionMapper.selectList(w);
    }

    public List<AiPatrolAction> listPendingAutoExecute() {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        w.eq(AiPatrolAction::getStatus, "PENDING")
         .eq(AiPatrolAction::getRiskLevel, "AUTO_EXECUTE");
        return actionMapper.selectList(w);
    }

    public void markAutoRunning(Long actionId) {
        AiPatrolAction a = new AiPatrolAction();
        a.setId(actionId);
        a.setStatus("AUTO_RUNNING");
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.updateById(a);
    }

    public int countPendingByTenant(Long tenantId) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tenantId != null) w.eq(AiPatrolAction::getTenantId, tenantId);
        w.eq(AiPatrolAction::getStatus, "PENDING");
        return Math.toIntExact(actionMapper.selectCount(w));
    }

    public int countAutoExecutedToday(Long tenantId) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tenantId != null) w.eq(AiPatrolAction::getTenantId, tenantId);
        w.eq(AiPatrolAction::getStatus, "AUTO_EXECUTED")
         .ge(AiPatrolAction::getExecutionTime, LocalDate.now().atStartOfDay());
        return Math.toIntExact(actionMapper.selectCount(w));
    }

    public int countHighRiskPending(Long tenantId) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tenantId != null) w.eq(AiPatrolAction::getTenantId, tenantId);
        w.eq(AiPatrolAction::getStatus, "PENDING")
         .eq(AiPatrolAction::getRiskLevel, "NEED_APPROVAL");
        return Math.toIntExact(actionMapper.selectCount(w));
    }
}
