package com.fashion.supplychain.intelligence.agent.sse;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.Map;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SseEvent {

    private String event;
    private Object data;
    private String id;
    private Long retry;

    public static SseEvent of(String event, Object data) {
        SseEvent e = new SseEvent();
        e.setEvent(event);
        e.setData(data);
        return e;
    }

    public static SseEvent thinking(int iteration, String message) {
        return of("thinking", Map.of("iteration", iteration, "message", message));
    }

    public static SseEvent toolCall(String tool, Object arguments) {
        return of("tool_call", Map.of("tool", tool, "arguments", arguments));
    }

    public static SseEvent toolResult(String tool, boolean success, String summary) {
        return of("tool_result", Map.of("tool", tool, "success", success, "summary", summary));
    }

    public static SseEvent answer(String content, String commandId) {
        return of("answer", Map.of("content", content, "commandId", commandId));
    }

    public static SseEvent followUpActions(Object actions) {
        return of("follow_up_actions", Map.of("actions", actions));
    }

    public static SseEvent criticThinking() {
        return of("critic_thinking", Map.of("status", "reviewing"));
    }

    public static SseEvent stuckDetected() {
        return of("stuck_detected", Map.of("status", "loop_detected"));
    }

    public static SseEvent tokenBudgetExceeded(String message, String commandId) {
        return of("token_budget_exceeded", Map.of("message", message, "commandId", commandId));
    }

    public static SseEvent maxIterationsExceeded() {
        return of("max_iterations_exceeded", Map.of("status", "limit_reached"));
    }

    public static SseEvent planMode(Object toolCalls, int iteration, String content) {
        return of("plan_mode", Map.of("toolCalls", toolCalls, "iteration", iteration, "content", content));
    }

    public static SseEvent error(String message) {
        return of("error", Map.of("message", message));
    }

    public static SseEvent done() {
        return of("done", Map.of());
    }

    public static SseEvent graphStart(String scene) {
        return of("graph_start", Map.of("scene", scene));
    }

    public static SseEvent nodeDone(String node, Object result) {
        return of("node_done", Map.of("node", node, "result", result));
    }

    public static SseEvent graphDone(Object summary) {
        return of("graph_done", summary);
    }

    public static SseEvent graphError(String message) {
        return of("graph_error", Map.of("message", message));
    }

    public static SseEvent heartbeat() {
        return of("heartbeat", Map.of("ts", System.currentTimeMillis()));
    }
}
