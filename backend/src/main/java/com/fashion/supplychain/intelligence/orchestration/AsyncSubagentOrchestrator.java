package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.specialist.SpecialistAgent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class AsyncSubagentOrchestrator {

    private static final int MAX_CONCURRENT = 4;
    private static final long SUBAGENT_TIMEOUT_SECONDS = 120;

    private final List<SpecialistAgent> specialistAgents;
    private final AgentCheckpointService checkpointService;

    public AgentState dispatchSubagents(AgentState state, boolean parallel) {
        String route = state.getRoute();
        List<SpecialistAgent> targets = specialistAgents.stream()
                .filter(s -> "full".equals(route) || s.getRoute().equals(route))
                .toList();

        if (targets.isEmpty()) {
            log.warn("[AsyncSubagent] No matching agents for route={}", route);
            return state;
        }

        if (!parallel || targets.size() == 1) {
            for (SpecialistAgent agent : targets) {
                executeWithTimeout(agent, state);
            }
        } else {
            Semaphore semaphore = new Semaphore(MAX_CONCURRENT);
            List<CompletableFuture<Void>> futures = targets.stream()
                    .map(agent -> CompletableFuture.runAsync(() -> {
                        try {
                            semaphore.acquire();
                            executeWithTimeout(agent, state);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            log.warn("[AsyncSubagent] Interrupted: {}", agent.getRoute());
                        } finally {
                            semaphore.release();
                        }
                    }))
                    .toList();

            try {
                CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new))
                        .get(SUBAGENT_TIMEOUT_SECONDS * 2L, TimeUnit.SECONDS);
            } catch (Exception e) {
                log.warn("[AsyncSubagent] Parallel dispatch partial failure: {}", e.getMessage());
            }
        }

        targets.forEach(s -> state.getNodeTrace().add("subagent:" + s.getRoute()));
        return state;
    }

    private void executeWithTimeout(SpecialistAgent agent, AgentState state) {
        try {
            CompletableFuture.runAsync(() -> {
                try {
                    UserContext ctx = new UserContext();
                    ctx.setTenantId(state.getTenantId());
                    ctx.setUserId("SYSTEM");
                    UserContext.set(ctx);
                    agent.analyze(state);
                } finally {
                    UserContext.clear();
                }
            }).get(SUBAGENT_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            checkpointService.saveCheckpointAsync(
                    state.getTenantId(),
                    state.getThreadId() != null ? state.getThreadId() : ("thread-" + state.getExecutionId()),
                    agent.getRoute() + "_specialist",
                    agent.getRoute() + "专家",
                    state,
                    state.getNodeTrace().size());
        } catch (Exception e) {
            log.warn("[AsyncSubagent] Agent {} failed: {}", agent.getRoute(), e.getMessage());
            state.getSpecialistResults().put(agent.getRoute(), "分析超时或失败: " + e.getMessage());
        }
    }
}
