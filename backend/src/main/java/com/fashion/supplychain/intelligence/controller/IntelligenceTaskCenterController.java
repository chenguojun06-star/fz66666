package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.CollaborationTask;
import com.fashion.supplychain.intelligence.orchestration.AiMetricsOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.TaskCenterOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.TaskOrderMonitorOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.TaskTrackerOrchestrator;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/intelligence/task-center")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligenceTaskCenterController {

    private final TaskCenterOrchestrator taskCenterOrchestrator;
    private final AiMetricsOrchestrator aiMetricsOrchestrator;
    private final TaskOrderMonitorOrchestrator taskOrderMonitorOrchestrator;
    private final TaskTrackerOrchestrator taskTrackerOrchestrator;

    @GetMapping("/dashboard")
    public Result<Map<String, Object>> getDashboard() {
        return Result.success(taskCenterOrchestrator.getDashboard());
    }

    /**
     * AI 执行待验证任务（D-880）。
     *
     * <p>`AiTaskTracker` 此前只有写入口：高风险/写操作工具执行成功后由
     * `HighRiskAuditHook` 记一条 PENDING，但全系统没有任何查询路径，
     * 任务既看不到也不会过期。这里按「执行人」列出待验证动作——默认查当前登录人
     * （hook 记录时 assignedTo 就是操作人用户名）。
     *
     * <p>⚠️ 会话维度的待办列表暂不可用：Agent 工具执行链路没有贯通 sessionId，
     * 任务与会话的绑定方法也没有调用方，接了只会永远返回空。
     * （D-880 留作待办：需要把 sessionId 从 Agent 循环一路传到工具钩子。）
     */
    @GetMapping("/ai-tasks")
    public Result<?> listAiTasks(@RequestParam(required = false) String agentName) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("缺少租户上下文");
        }
        String target = (agentName == null || agentName.isBlank())
                ? UserContext.username() : agentName;
        if (target == null || target.isBlank()) {
            return Result.fail("无法确定执行人（请传 agentName）");
        }
        return Result.success(taskTrackerOrchestrator.listPendingTasksByAgent(tenantId, target));
    }

    @GetMapping("/tasks")
    public Result<Map<String, Object>> listTasks(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return Result.success(taskCenterOrchestrator.listTasks(status, priority, page, size));
    }

    @GetMapping("/tasks/{taskId}")
    public Result<Map<String, Object>> getTaskDetail(@PathVariable Long taskId) {
        Map<String, Object> detail = taskCenterOrchestrator.getTaskDetail(taskId);
        if (detail == null) {
            return Result.fail("任务不存在或无权访问");
        }
        return Result.success(detail);
    }

    @PutMapping("/tasks/{taskId}/status")
    public Result<Map<String, Object>> updateTaskStatus(
            @PathVariable Long taskId,
            @RequestBody Map<String, String> body) {
        String newStatus = body.get("status");
        String note = body.get("note");
        Map<String, Object> result = taskCenterOrchestrator.updateTaskStatus(taskId, newStatus, note);
        if (Boolean.FALSE.equals(result.get("success"))) {
            return Result.fail(String.valueOf(result.get("error")));
        }
        return Result.success(result);
    }

    @PostMapping("/tasks/{taskId}/escalate")
    public Result<Map<String, Object>> escalateTask(
            @PathVariable Long taskId,
            @RequestBody Map<String, String> body) {
        String reason = body.getOrDefault("reason", "任务逾期自动升级");
        return Result.success(taskCenterOrchestrator.escalateTask(taskId, reason));
    }

    @PostMapping("/tasks")
    public Result<Map<String, Object>> createTask(@RequestBody Map<String, Object> taskData) {
        Map<String, Object> result = taskCenterOrchestrator.createTask(taskData);
        if (Boolean.FALSE.equals(result.get("success"))) {
            return Result.fail(String.valueOf(result.get("error")));
        }
        return Result.success(result);
    }

    @PutMapping("/tasks/{taskId}")
    public Result<Map<String, Object>> updateTask(
            @PathVariable Long taskId,
            @RequestBody Map<String, Object> taskData) {
        Map<String, Object> result = taskCenterOrchestrator.updateTask(taskId, taskData);
        if (Boolean.FALSE.equals(result.get("success"))) {
            return Result.fail(String.valueOf(result.get("error")));
        }
        return Result.success(result);
    }

    @DeleteMapping("/tasks/{taskId}")
    public Result<Map<String, Object>> deleteTask(@PathVariable Long taskId) {
        Map<String, Object> result = taskCenterOrchestrator.deleteTask(taskId);
        if (Boolean.FALSE.equals(result.get("success"))) {
            return Result.fail(String.valueOf(result.get("error")));
        }
        return Result.success(result);
    }

    @PostMapping("/tasks/{taskId}/claim")
    public Result<Map<String, Object>> claimTask(@PathVariable Long taskId) {
        Map<String, Object> result = taskCenterOrchestrator.claimTask(taskId);
        if (Boolean.FALSE.equals(result.get("success"))) {
            return Result.fail(String.valueOf(result.get("error")));
        }
        return Result.success(result);
    }

    @GetMapping("/my-tasks")
    public Result<Map<String, Object>> getMyTasks(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String scope,
            @RequestParam(required = false, defaultValue = "false") boolean includeCompleted,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        return Result.success(taskCenterOrchestrator.getMyTasks(status, priority, module, scope, includeCompleted, page, size));
    }

    @GetMapping("/task-stats")
    public Result<Map<String, Object>> getTaskStats() {
        return Result.success(taskCenterOrchestrator.getTaskStats());
    }

    @GetMapping("/metrics")
    public Result<Map<String, Object>> getMetrics() {
        return Result.success(aiMetricsOrchestrator.getCurrentMetrics());
    }

    @PostMapping("/metrics/snapshot")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public Result<String> generateMetricsSnapshot() {
        aiMetricsOrchestrator.generateSnapshot();
        return Result.success("指标快照已生成");
    }

    @PostMapping("/tasks/{taskId}/link-order")
    public Result<Map<String, Object>> linkTaskToOrder(
            @PathVariable Long taskId,
            @RequestBody Map<String, String> body) {
        String orderNo = body.get("orderNo");
        return Result.success(taskOrderMonitorOrchestrator.linkTaskToOrder(taskId, orderNo));
    }

    @PostMapping("/tasks/{taskId}/refresh-order")
    public Result<Map<String, Object>> refreshTaskOrderStatus(@PathVariable Long taskId) {
        return Result.success(taskOrderMonitorOrchestrator.refreshTaskOrderStatus(taskId));
    }

    @GetMapping("/tasks/by-order/{orderNo}")
    public Result<List<CollaborationTask>> getTasksByOrderNo(@PathVariable String orderNo) {
        return Result.success(taskOrderMonitorOrchestrator.getTasksByOrderNo(orderNo));
    }
}
