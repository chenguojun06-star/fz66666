package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Optional;

/**
 * AI Agent 写工具幂等服务。
 *
 * <p>问题背景：网络抖动 / LLM 重试 / 工具瞬态退避会造成同一写工具在 60 秒内被多次调用，
 * 真实事故案例：OrderEditTool 把同一订单改两次（第二次覆盖了第一次结果）、
 * PayrollApproveTool 重复审批触发状态机异常、ScanUndoTool 撤回扫码后又被重放。
 *
 * <p>设计：
 * <ul>
 *   <li>仅对 {@link AiAgentToolAccessService#isHighRisk(String)} 返回 true 的写工具生效</li>
 *   <li>幂等键：{@code ai:idem:{tenantId}:{toolName}:sha256(args)}</li>
 *   <li>TTL 60 秒：覆盖 LLM 重试 + 用户连击 + 工具瞬态重试三种场景</li>
 *   <li>命中后直接返回首次结果，不再触达底层业务逻辑</li>
 * </ul>
 *
 * <p>对供应链智能化的价值：写工具是 AI 最直接影响生产数据的入口，
 * 幂等是把"AI 决策辅助"演进到"AI 执行"必须先解决的安全底座。
 */
@Slf4j
@Service
public class AiAgentIdempotencyService {

    private static final String KEY_PREFIX = "ai:idem:";
    private static final Duration TTL = Duration.ofSeconds(60);

    @Autowired(required = false)
    private StringRedisTemplate redis;

    /**
     * 查询并占位幂等结果。
     * <p>首次调用：写入占位符 "__PENDING__"，返回 empty，调用方继续执行业务并通过 {@link #saveResult} 回写真实结果。
     * <br>重复调用：若值为占位符，返回"业务执行中，请稍后重试"提示；若已是真实结果，直接返回该结果。
     *
     * @return Optional 包装的 JSON 结果；empty 表示首次调用，应继续执行
     */
    public Optional<String> tryReplay(String toolName, String argumentsJson) {
        if (redis == null || toolName == null) {
            return Optional.empty();
        }
        if (!AiAgentToolAccessService.isHighRisk(toolName)) {
            return Optional.empty(); // 读工具不做幂等
        }
        String key = buildKey(toolName, argumentsJson);
        if (key == null) {
            return Optional.empty();
        }
        try {
            // SET NX：原子占位 + 取值
            Boolean placed = redis.opsForValue().setIfAbsent(key, "__PENDING__", TTL);
            if (Boolean.TRUE.equals(placed)) {
                return Optional.empty(); // 首次调用，继续执行
            }
            // 已存在 → 取值
            String existing = redis.opsForValue().get(key);
            if (existing == null) {
                // 极端竞争：刚被 evict，放行
                return Optional.empty();
            }
            if ("__PENDING__".equals(existing)) {
                log.warn("[AiIdempotency] 重复调用命中执行中状态: tool={}", toolName);
                return Optional.of("{\"success\":false,\"error\":\"该操作正在执行中，请勿重复提交\",\"idempotencyHit\":true}");
            }
            log.info("[AiIdempotency] 重复调用命中已完成结果: tool={}", toolName);
            return Optional.of(existing);
        } catch (Exception e) {
            log.warn("[AiIdempotency] Redis 访问失败，降级放行: {}", e.getMessage());
            return Optional.empty();
        }
    }

    /** 业务执行完成后回写真实结果，覆盖 __PENDING__ 占位符。 */
    public void saveResult(String toolName, String argumentsJson, String result) {
        if (redis == null || toolName == null || result == null) {
            return;
        }
        if (!AiAgentToolAccessService.isHighRisk(toolName)) {
            return;
        }
        String key = buildKey(toolName, argumentsJson);
        if (key == null) {
            return;
        }
        try {
            redis.opsForValue().set(key, result, TTL);
        } catch (Exception e) {
            log.warn("[AiIdempotency] 结果回写失败: tool={}, err={}", toolName, e.getMessage());
        }
    }

    /** 业务执行失败时清除占位，允许立即重试。 */
    public void clearOnFailure(String toolName, String argumentsJson) {
        if (redis == null || toolName == null) {
            return;
        }
        if (!AiAgentToolAccessService.isHighRisk(toolName)) {
            return;
        }
        String key = buildKey(toolName, argumentsJson);
        if (key == null) {
            return;
        }
        try {
            redis.delete(key);
        } catch (Exception e) {
            log.debug("[AiIdempotency] 失败清键异常: {}", e.getMessage());
        }
    }

    private String buildKey(String toolName, String argumentsJson) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return null; // 无租户上下文不做幂等，避免误命中
        }
        String argsHash = sha256(argumentsJson == null ? "" : argumentsJson);
        return KEY_PREFIX + tenantId + ":" + toolName + ":" + argsHash;
    }

    private String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(input.hashCode());
        }
    }
}
