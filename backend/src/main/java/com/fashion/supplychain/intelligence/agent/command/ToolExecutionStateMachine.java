package com.fashion.supplychain.intelligence.agent.command;

import java.time.LocalDateTime;
import java.util.*;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class ToolExecutionStateMachine {

    public enum State {
        PENDING,
        PRE_CHECKING,
        RUNNING,
        POST_VERIFYING,
        SUCCESS,
        FAILED,
        ROLLING_BACK,
        ROLLED_BACK,
        UNRECOVERABLE
    }

    private State currentState;
    private final String toolName;
    private final String executionId;
    private final List<StateTransitionRecord> history;
    private String errorMessage;

    public ToolExecutionStateMachine(String toolName) {
        this.toolName = toolName;
        this.executionId = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        this.currentState = State.PENDING;
        this.history = new ArrayList<>();
        recordTransition(null, State.PENDING, "初始化");
    }

    public synchronized void transitionTo(State target, String reason) {
        if (!isValidTransition(currentState, target)) {
            String msg = String.format("非法状态转换: %s → %s (tool=%s)", currentState, target, toolName);
            log.error(msg);
            throw new IllegalStateException(msg);
        }
        State from = currentState;
        currentState = target;
        recordTransition(from, target, reason);
        log.info("[状态机] {} {} → {} reason={}", toolName, from, target, reason);
    }

    public synchronized void markFailed(String error) {
        this.errorMessage = error;
        transitionTo(State.FAILED, error);
    }

    public boolean isTerminal() {
        return currentState == State.SUCCESS
                || currentState == State.FAILED
                || currentState == State.ROLLED_BACK
                || currentState == State.UNRECOVERABLE;
    }

    public boolean isSuccess() {
        return currentState == State.SUCCESS;
    }

    public State getCurrentState() {
        return currentState;
    }

    public String getToolName() {
        return toolName;
    }

    public String getExecutionId() {
        return executionId;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public List<StateTransitionRecord> getHistory() {
        return Collections.unmodifiableList(history);
    }

    public Map<String, Object> toAuditRecord() {
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("executionId", executionId);
        record.put("toolName", toolName);
        record.put("currentState", currentState.name());
        record.put("errorMessage", errorMessage);
        List<Map<String, Object>> transitions = new ArrayList<>();
        for (StateTransitionRecord t : history) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("from", t.from != null ? t.from.name() : null);
            m.put("to", t.to.name());
            m.put("reason", t.reason);
            m.put("timestamp", t.timestamp.toString());
            transitions.add(m);
        }
        record.put("history", transitions);
        return record;
    }

    private boolean isValidTransition(State from, State to) {
        switch (from) {
            case PENDING:
                return to == State.PRE_CHECKING;
            case PRE_CHECKING:
                return to == State.RUNNING || to == State.FAILED;
            case RUNNING:
                return to == State.POST_VERIFYING || to == State.FAILED;
            case POST_VERIFYING:
                return to == State.SUCCESS || to == State.FAILED || to == State.ROLLING_BACK;
            case ROLLING_BACK:
                return to == State.ROLLED_BACK || to == State.UNRECOVERABLE;
            default:
                return false;
        }
    }

    private void recordTransition(State from, State to, String reason) {
        history.add(new StateTransitionRecord(from, to, reason, LocalDateTime.now()));
    }

    public static class StateTransitionRecord {
        public final State from;
        public final State to;
        public final String reason;
        public final LocalDateTime timestamp;

        public StateTransitionRecord(State from, State to, String reason, LocalDateTime timestamp) {
            this.from = from;
            this.to = to;
            this.reason = reason;
            this.timestamp = timestamp;
        }
    }
}
