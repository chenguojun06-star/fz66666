package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.HighRiskAuditLog;
import com.fashion.supplychain.intelligence.mapper.HighRiskAuditLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

/**
 * 高风险 AI 工具调用审计服务
 * <p>
 * 替代旧版 {@code HighRiskAuditHook} 内部 ConcurrentHashMap 实现，解决：
 * </p>
 * <ol>
 *   <li><b>多 Pod / 重启丢失</b>：pending 标记改用 Redis 共享存储 (60s TTL)</li>
 *   <li><b>args 截断绕过</b>：从"前 32 字符"升级为 SHA-256 全量哈希</li>
 *   <li><b>无审计</b>：申请 / 批准 / 执行 全过程异步落库 t_intelligence_high_risk_audit</li>
 * </ol>
 *
 * <p>熔断：参照 {@link AiJobRunLogService} 模式，落库失败 10 分钟内不再尝试，
 * 避免审计表丢失时拖垮业务线程。</p>
 */
@Slf4j
@Service
public class HighRiskAuditService extends ServiceImpl<HighRiskAuditLogMapper, HighRiskAuditLog> {

    /** Redis pending 标记 TTL：60 秒（与旧 CONFIRM_WINDOW_MS 保持一致） */
    private static final long PENDING_TTL_SECONDS = 60L;

    /** Redis key 前缀 */
    private static final String PENDING_KEY_PREFIX = "ai:hra:pending:";

    /** 熔断冷却时长：10 分钟 */
    private static final long CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000L;

    /** 当前线程关联的 auditId，用于 postToolUse 回写执行结果 */
    private static final ThreadLocal<Long> CURRENT_AUDIT_ID = new ThreadLocal<>();

    @Autowired(required = false)
    private StringRedisTemplate redis;

    private volatile boolean tableWritable = true;
    private volatile long lastFailureMs = 0;

    /** ── 公开 API：判断是否已批准（命中 Redis pending key） ────────────────── */
    public boolean isApproved(String userId, String toolName, String args) {
        if (redis == null) {
            // Redis 未配置时退化为单机内存方案的占位（极少出现），允许第一次失败让 AI 重试
            log.warn("[HighRisk-Audit] Redis 不可用，跳过 pending 校验 tool={}", toolName);
            return false;
        }
        String key = buildPendingKey(userId, toolName, args);
        Boolean exists = redis.hasKey(key);
        if (Boolean.TRUE.equals(exists)) {
            redis.delete(key);
            return true;
        }
        return false;
    }

    /** ── 公开 API：登记 pending 申请，返回 auditId ──────────────────────────── */
    public Long registerPending(String userId, String userName, String toolName, String args) {
        if (redis != null) {
            String key = buildPendingKey(userId, toolName, args);
            try {
                redis.opsForValue().set(key, "1", PENDING_TTL_SECONDS, TimeUnit.SECONDS);
            } catch (Exception e) {
                log.warn("[HighRisk-Audit] Redis pending 写入失败 tool={}, err={}", toolName, e.getMessage());
            }
        }
        Long auditId = persistPending(userId, userName, toolName, args);
        CURRENT_AUDIT_ID.set(auditId);
        return auditId;
    }

    /** ── 公开 API：标记本次 audit 已被批准（用户/AI 二次调用触发） ─────────── */
    public void markApproved(Long auditId) {
        if (auditId == null || !isWritable()) return;
        try {
            Long tenantId = UserContext.tenantId();
            LambdaUpdateWrapper<HighRiskAuditLog> w = new LambdaUpdateWrapper<>();
            w.eq(HighRiskAuditLog::getId, auditId)
                    .eq(HighRiskAuditLog::getTenantId, tenantId)
                    .set(HighRiskAuditLog::getStatus, "APPROVED")
                    .set(HighRiskAuditLog::getDecidedAt, LocalDateTime.now());
            update(w);
        } catch (Exception e) {
            onFailure(e, "markApproved 失败");
        }
        CURRENT_AUDIT_ID.set(auditId);
    }

    /** ── 公开 API：postToolUse 写入执行结果 ─────────────────────────────────── */
    @Async
    public void markExecuted(Long auditId, boolean success, String resultPreview, long elapsedMs, String errorMessage) {
        if (auditId == null || !isWritable()) return;
        try {
            Long tenantId = UserContext.tenantId();
            LambdaUpdateWrapper<HighRiskAuditLog> w = new LambdaUpdateWrapper<>();
            w.eq(HighRiskAuditLog::getId, auditId)
                    .eq(HighRiskAuditLog::getTenantId, tenantId)
                    .set(HighRiskAuditLog::getStatus, "EXECUTED")
                    .set(HighRiskAuditLog::getExecutedAt, LocalDateTime.now())
                    .set(HighRiskAuditLog::getElapsedMs, elapsedMs)
                    .set(HighRiskAuditLog::getSuccess, success)
                    .set(HighRiskAuditLog::getResultPreview, truncate(resultPreview, 490))
                    .set(HighRiskAuditLog::getErrorMessage, truncate(errorMessage, 490));
            update(w);
            onSuccess();
        } catch (Exception e) {
            onFailure(e, "markExecuted 失败");
        }
    }

    /** ── 工具方法：取出当前线程绑定的 auditId 并清理 ──────────────────────── */
    public Long popCurrentAuditId() {
        Long id = CURRENT_AUDIT_ID.get();
        CURRENT_AUDIT_ID.remove();
        return id;
    }

    /** ── 内部：异步落库 PENDING 记录（同步获取 auditId 后再异步刷新其余字段） */
    private Long persistPending(String userId, String userName, String toolName, String args) {
        if (!isWritable()) return null;
        try {
            HighRiskAuditLog rec = new HighRiskAuditLog()
                    .setTenantId(UserContext.tenantId())
                    .setUserId(userId)
                    .setUserName(userName)
                    .setToolName(toolName)
                    .setArgsHash(sha256(args))
                    .setArgsPreview(truncate(args, 490))
                    .setStatus("PENDING")
                    .setCreatedAt(LocalDateTime.now());
            save(rec);
            onSuccess();
            return rec.getId();
        } catch (Exception e) {
            onFailure(e, "persistPending 失败");
            return null;
        }
    }

    /** ── 公共方法：完整 SHA-256 哈希（修复"前 32 字符"截断 bug） ───────────── */
    public static String sha256(String text) {
        if (text == null) text = "";
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] bytes = md.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 在 JDK 中永远存在，正常不会触发；保险起见退化为 hashCode（不影响审计落库的正确性）
            return Integer.toHexString(text.hashCode());
        }
    }

    private String buildPendingKey(String userId, String toolName, String args) {
        return PENDING_KEY_PREFIX + (userId == null ? "anon" : userId) + ":" + toolName + ":" + sha256(args);
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return null;
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }

    /** ── 熔断管理（与 AiJobRunLogService 同款思路） ───────────────────────── */
    private boolean isWritable() {
        if (tableWritable) return true;
        if (System.currentTimeMillis() - lastFailureMs > CIRCUIT_BREAKER_COOLDOWN_MS) {
            tableWritable = true;
            log.info("[HighRisk-Audit] 熔断恢复，重新尝试写入审计表");
            return true;
        }
        return false;
    }

    private void onSuccess() {
        if (!tableWritable) {
            tableWritable = true;
            log.info("[HighRisk-Audit] 写入恢复正常");
        }
    }

    private void onFailure(Exception e, String stage) {
        lastFailureMs = System.currentTimeMillis();
        tableWritable = false;
        log.warn("[HighRisk-Audit] {} → 熔断 10 分钟: {}", stage, e.getMessage());
    }
}
