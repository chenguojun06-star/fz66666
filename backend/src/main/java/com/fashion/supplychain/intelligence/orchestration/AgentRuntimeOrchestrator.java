package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.entity.AgentCard;
import com.fashion.supplychain.intelligence.entity.AgentCheckpoint;
import com.fashion.supplychain.intelligence.entity.AgentMemoryArchival;
import com.fashion.supplychain.intelligence.entity.AgentMemoryCore;
import com.fashion.supplychain.intelligence.entity.AgentSession;
import com.fashion.supplychain.intelligence.service.AgentStateStore;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Agent 运行时状态编排器 —— 会话状态 / 检查点 / 记忆 / 名片。
 *
 * <p>把原先直接注入 {@code IntelligenceAdminController} 的四个状态类依赖
 * （{@link AgentStateStore}、{@link AgentCheckpointService}、{@link AgentMemoryService}、
 * {@link AgentCardService}）收敛到编排层，Controller 只做参数解析与委托
 * （D-642，收敛 ArchUnit 规则6「Controller 不得直接依赖多个 Service」）。
 *
 * <p>租户上下文由调用方（Controller）从 {@code UserContext} 取出后显式传入，
 * 编排层不自行读取线程上下文，便于单元测试直接 new 出来断言。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgentRuntimeOrchestrator {

    private final AgentStateStore agentStateStore;
    private final AgentCheckpointService checkpointService;
    private final AgentMemoryService memoryService;
    private final AgentCardService agentCardService;

    // ──────────────────────────────────────────────────────────────
    //  Agent 会话状态
    // ──────────────────────────────────────────────────────────────

    /**
     * 会话详情：会话元信息 + 该会话的全部检查点。
     *
     * @param sessionId 会话 ID
     * @return 会话不存在时返回 {@code Result.fail("会话不存在")}
     */
    public Result<Map<String, Object>> getSessionDetail(String sessionId) {
        AgentSession session = agentStateStore.getSession(sessionId);
        if (session == null) {
            return Result.fail("会话不存在");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("session", session);
        result.put("checkpoints", agentStateStore.getCheckpoints(sessionId));
        return Result.success(result);
    }

    /**
     * 回滚会话到指定迭代：删除该迭代之后的检查点与事件。
     * 仅超管可调用（权限在 Controller 的 {@code @PreAuthorize} 上）。
     */
    public void rollbackToCheckpoint(String sessionId, int targetIteration) {
        agentStateStore.rollbackToCheckpoint(sessionId, targetIteration);
    }

    // ──────────────────────────────────────────────────────────────
    //  检查点（AgentCheckpointService）
    // ──────────────────────────────────────────────────────────────

    /** 按 threadId 查检查点历史（stepIndex 升序） */
    public List<AgentCheckpoint> listCheckpointHistory(Long tenantId, String threadId) {
        return checkpointService.getCheckpointHistory(tenantId, threadId);
    }

    /**
     * 从最近的 ACTIVE 检查点恢复 AgentState。
     *
     * @return 无可恢复检查点时返回 {@code Result.fail("未找到可恢复的检查点")}
     */
    public Result<AgentState> restoreFromCheckpoint(Long tenantId, String threadId) {
        AgentState state = checkpointService.restoreFromCheckpoint(tenantId, threadId);
        if (state == null) {
            return Result.fail("未找到可恢复的检查点");
        }
        return Result.success(state);
    }

    // ──────────────────────────────────────────────────────────────
    //  Agent Memory（AgentMemoryService）
    // ──────────────────────────────────────────────────────────────

    public List<AgentMemoryCore> listCoreMemory(Long tenantId, String agentId) {
        return memoryService.getAllCoreMemory(tenantId, agentId);
    }

    public void setCoreMemory(Long tenantId, String agentId, String key, String value) {
        memoryService.setCoreMemory(tenantId, agentId, key, value);
    }

    public List<AgentMemoryArchival> recallArchival(Long tenantId, String agentId,
                                                     String contentType, int limit) {
        return memoryService.recallArchival(tenantId, agentId, contentType, limit);
    }

    public int applyDecayCurve(Long tenantId) {
        return memoryService.applyDecayCurve(tenantId);
    }

    public String compileContext(Long tenantId, String agentId, int coreLimit, int archivalLimit) {
        return memoryService.compileContext(tenantId, agentId, coreLimit, archivalLimit);
    }

    // ──────────────────────────────────────────────────────────────
    //  Agent Card（AgentCardService）
    // ──────────────────────────────────────────────────────────────

    public List<AgentCard> discoverAgents(Long tenantId, String skill) {
        return agentCardService.discoverAgents(tenantId, skill);
    }

    public AgentCard getAgentCard(Long tenantId, String agentId) {
        return agentCardService.getAgent(tenantId, agentId);
    }
}
