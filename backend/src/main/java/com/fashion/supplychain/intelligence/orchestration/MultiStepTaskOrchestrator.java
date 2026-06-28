package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class MultiStepTaskOrchestrator {

    private static final String SCENE = "multi_step_task";

    private static final String CMD_TYPES =
        "order:hold(暂停订单), order:expedite(加急), order:resume(恢复), order:remark(备注), " +
        "order:approve(审批通过), order:reject(驳回), order:ship_date(修改货期), " +
        "order:add_note(添加备注), order:edit(编辑订单), " +
        "style:approve(款式审批), style:return(款式退回), " +
        "quality:reject(质检拒绝), defective:handle(次品处理), " +
        "settlement:approve(结算审批), payroll:approve(工资审批), " +
        "purchase:create(创建采购单), procurement:order_goods(下采购订单), " +
        "factory:urge(催工厂), process:reassign(工序重分配), " +
        "material:safety_stock(设置安全库存), notification:push(推送消息), " +
        "scan:undo(扫码撤回), cutting:create(创建裁床), " +
        "undo:last(撤销上次操作)";

    private final ExecutionEngineOrchestrator executionEngineOrchestrator;
    private final IntelligenceInferenceOrchestrator inferenceOrchestrator;
    private final ObjectMapper objectMapper;

    public static class StepResult {
        private final int stepIndex;
        private final String stepDescription;
        private final String action;
        private final boolean success;
        private final String message;
        private final Object data;

        public StepResult(int stepIndex, String stepDescription, String action,
                          boolean success, String message, Object data) {
            this.stepIndex = stepIndex;
            this.stepDescription = stepDescription;
            this.action = action;
            this.success = success;
            this.message = message;
            this.data = data;
        }

        public int getStepIndex() { return stepIndex; }
        public String getStepDescription() { return stepDescription; }
        public String getAction() { return action; }
        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public Object getData() { return data; }
    }

    public static class MultiStepResult {
        private final String taskId;
        private final int totalSteps;
        private final int completedSteps;
        private final int failedSteps;
        private final boolean allSuccess;
        private final List<StepResult> steps;
        private final String summary;

        public MultiStepResult(String taskId, List<StepResult> steps, String summary) {
            this.taskId = taskId;
            this.steps = steps;
            this.totalSteps = steps.size();
            this.completedSteps = (int) steps.stream().filter(StepResult::isSuccess).count();
            this.failedSteps = (int) steps.stream().filter(s -> !s.isSuccess()).count();
            this.allSuccess = this.failedSteps == 0;
            this.summary = summary;
        }

        public String getTaskId() { return taskId; }
        public int getTotalSteps() { return totalSteps; }
        public int getCompletedSteps() { return completedSteps; }
        public int getFailedSteps() { return failedSteps; }
        public boolean isAllSuccess() { return allSuccess; }
        public List<StepResult> getSteps() { return steps; }
        public String getSummary() { return summary; }
    }

    public MultiStepResult executeMultiStepTask(Long tenantId, Long operatorId, String naturalTask) {
        return executeMultiStepTask(tenantId, operatorId, naturalTask, false);
    }

    public MultiStepResult executeMultiStepTask(
            Long tenantId, Long operatorId, String naturalTask, boolean rollbackOnFailure) {
        String taskId = "TASK-" + System.currentTimeMillis();
        log.info("[MultiStep] 收到多步任务: taskId={}, tenant={}, rollbackOnFailure={}, task={}",
                taskId, tenantId, rollbackOnFailure, naturalTask);

        List<ExecutableCommand> steps = parseMultiStepTask(tenantId, naturalTask);
        if (steps.isEmpty()) {
            return new MultiStepResult(taskId, List.of(), "未能识别出可执行的步骤，请用更明确的语言描述任务");
        }

        log.info("[MultiStep] 任务拆解完成: taskId={}, steps={}", taskId, steps.size());

        List<StepResult> results = new ArrayList<>();
        int successCount = 0;
        int failedAtStep = -1;

        for (int i = 0; i < steps.size(); i++) {
            ExecutableCommand step = steps.get(i);
            String stepDesc = "步骤" + (i + 1) + ": " + step.getAction() +
                    (step.getTargetId() != null ? " " + step.getTargetId() : "");

            log.info("[MultiStep] 执行步骤 {}/{}: {}", i + 1, steps.size(), stepDesc);

            try {
                ExecutionResult<?> result = executionEngineOrchestrator.execute(step, operatorId);

                if (result.isSuccess()) {
                    results.add(new StepResult(i + 1, stepDesc, step.getAction(),
                            true, result.getMessage(), result.getData()));
                    successCount++;
                    log.info("[MultiStep] 步骤 {}/{} 成功: {}", i + 1, steps.size(), result.getMessage());
                } else {
                    String errorMsg = result.getErrorMessage();
                    boolean isApprovalPending = "REQUIRES_APPROVAL".equals(errorMsg);
                    // 失败步骤 success 应为 false；审批等待（isApprovalPending=true）视为"已接收待审批"，不算失败
                    results.add(new StepResult(i + 1, stepDesc, step.getAction(),
                            isApprovalPending,
                            isApprovalPending ? "需要审批：" + result.getMessage() : result.getMessage(),
                            result.getData()));

                    if (!isApprovalPending) {
                        log.error("[MultiStep] 步骤 {}/{} 失败: {}", i + 1, steps.size(), errorMsg);
                        failedAtStep = i;
                        break;
                    } else {
                        log.info("[MultiStep] 步骤 {}/{} 需要审批: {}", i + 1, steps.size(), result.getMessage());
                        results.add(new StepResult(i + 2, "（后续步骤待审批后继续）",
                                "pending", false,
                                "有步骤需要人工审批，审批通过后可继续执行", null));
                        break;
                    }
                }
            } catch (Exception e) {
                results.add(new StepResult(i + 1, stepDesc, step.getAction(),
                        false, "系统异常：" + e.getMessage(), null));
                log.error("[MultiStep] 步骤 {}/{} 异常: {}", i + 1, steps.size(), e.getMessage(), e);
                failedAtStep = i;
                break;
            }
        }

        // 失败回滚：从后往前依次撤回已成功的步骤
        if (failedAtStep > 0 && rollbackOnFailure) {
            log.info("[MultiStep] 开始失败回滚: taskId={}, 需回滚 {} 步", taskId, successCount);

            int rollbackCount = 0;
            for (int i = 0; i < successCount; i++) {
                try {
                    ExecutableCommand undoCmd = ExecutableCommand.builder()
                            .action("undo:last")
                            .reason("多步任务失败回滚")
                            .riskLevel(5)
                            .requiresApproval(false)
                            .build();
                    ExecutionResult<?> undoResult = executionEngineOrchestrator.execute(undoCmd, operatorId);
                    if (undoResult.isSuccess()) {
                        rollbackCount++;
                        results.add(new StepResult(
                                results.size() + 1,
                                "回滚步骤" + (i + 1),
                                "undo:last",
                                true,
                                "已撤回第 " + (successCount - i) + " 步操作",
                                null));
                        log.info("[MultiStep] 回滚步骤 {}/{} 成功", i + 1, successCount);
                    } else {
                        results.add(new StepResult(
                                results.size() + 1,
                                "回滚步骤" + (i + 1),
                                "undo:last",
                                false,
                                "回滚失败：" + undoResult.getErrorMessage(),
                                null));
                        log.error("[MultiStep] 回滚步骤 {}/{} 失败: {}",
                                i + 1, successCount, undoResult.getErrorMessage());
                        break;
                    }
                } catch (Exception e) {
                    results.add(new StepResult(
                            results.size() + 1,
                            "回滚步骤" + (i + 1),
                            "undo:last",
                            false,
                            "回滚异常：" + e.getMessage(),
                            null));
                    log.error("[MultiStep] 回滚步骤 {}/{} 异常: {}", i + 1, successCount, e.getMessage());
                    break;
                }
            }

            String summary = String.format(
                    "共 %d 步，成功 %d 步，失败 %d 步，已回滚 %d 步",
                    steps.size(), successCount, steps.size() - successCount, rollbackCount);

            log.info("[MultiStep] 任务（含回滚）完成: taskId={}, {}", taskId, summary);
            return new MultiStepResult(taskId, results, summary);
        }

        String summary = String.format("共 %d 步，成功 %d 步，失败 %d 步",
                steps.size(), successCount, steps.size() - successCount);

        log.info("[MultiStep] 任务完成: taskId={}, {}", taskId, summary);

        return new MultiStepResult(taskId, results, summary);
    }

    private List<ExecutableCommand> parseMultiStepTask(Long tenantId, String naturalTask) {
        String systemPrompt = buildMultiStepParserPrompt();
        String userPrompt = "请将以下多步任务拆解为有序的执行步骤，每一步对应一个命令：\n" + naturalTask;

        IntelligenceInferenceResult parseResult = inferenceOrchestrator.chat(
                SCENE, systemPrompt, userPrompt);

        String jsonStr = extractJsonBlock(parseResult.getContent());
        if (jsonStr == null) {
            log.warn("[MultiStep] 未能解析出JSON，原始响应: {}", parseResult.getContent());
            return List.of();
        }

        try {
            JsonNode root = objectMapper.readTree(jsonStr);
            JsonNode stepsNode = root.has("steps") ? root.get("steps") : root;

            List<ExecutableCommand> commands = new ArrayList<>();
            Iterator<JsonNode> it = stepsNode.elements();
            while (it.hasNext()) {
                JsonNode step = it.next();
                String action = step.has("action") ? step.get("action").asText() : null;
                String targetId = step.has("targetId") ? step.get("targetId").asText() : null;
                String reason = step.has("reason") ? step.get("reason").asText() : null;
                int riskLevel = step.has("riskLevel") ? step.get("riskLevel").asInt(2) : 2;

                if (action == null || action.isBlank()) continue;

                JsonNode paramsNode = step.get("params");
                Map<String, Object> params = new HashMap<>();
                if (paramsNode != null && paramsNode.isObject()) {
                    Iterator<Map.Entry<String, JsonNode>> pit = paramsNode.fields();
                    while (pit.hasNext()) {
                        Map.Entry<String, JsonNode> entry = pit.next();
                        params.put(entry.getKey(), entry.getValue().asText());
                    }
                }

                ExecutableCommand cmd = ExecutableCommand.builder()
                        .action(action)
                        .targetId(targetId)
                        .params(params)
                        .reason(reason)
                        .riskLevel(riskLevel)
                        .requiresApproval(riskLevel >= 4)
                        .build();

                commands.add(cmd);
            }

            return commands;

        } catch (Exception e) {
            log.error("[MultiStep] 解析多步任务失败: {}", e.getMessage(), e);
            return List.of();
        }
    }

    private String buildMultiStepParserPrompt() {
        return "你是服装供应链系统的多步任务拆解器。\n" +
               "将用户的多步自然语言任务拆解为有序的执行步骤数组。\n\n" +
               "输出JSON格式（直接输出JSON，不加markdown代码块）：\n" +
               "{\n" +
               "  \"steps\": [\n" +
               "    {\n" +
               "      \"action\": \"命令类型\",\n" +
               "      \"targetId\": \"操作目标（订单号或ID）\",\n" +
               "      \"params\": {\"参数key\": \"参数value\"},\n" +
               "      \"reason\": \"操作原因\",\n" +
               "      \"riskLevel\": 2\n" +
               "    }\n" +
               "  ]\n" +
               "}\n\n" +
               "支持的命令类型（严格从以下选择，不能自造）：\n" + CMD_TYPES + "\n\n" +
               "拆解规则：\n" +
               "1. 按用户描述的顺序拆解，先做的在前\n" +
               "2. 每一步只做一件事，一个动作\n" +
               "3. 如果某个步骤依赖前一步的结果（如需要先查到订单号再操作），保持 targetId 为 null，执行时会自动解析\n" +
               "4. 风险等级：1=低风险(备注/标注), 2=中低(状态变更), 3=中高(审批/拒绝), 4=高(财务/采购), 5=极高(删除/撤销)\n" +
               "5. 只输出JSON，不做任何解释。";
    }

    private String extractJsonBlock(String text) {
        if (text == null) return null;
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        return (start >= 0 && end > start) ? text.substring(start, end + 1) : null;
    }
}
