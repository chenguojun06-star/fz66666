package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingRequest;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingResponse;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.*;

/**
 * 优化求解编排器（已替换空壳，委托给 ApsSchedulingOrchestrator 真实约束求解）
 *
 * <p>历史：原为空壳实现，仅调用 LLM 生成解释文本。
 * 2026-08-01 升级为真实约束求解引擎，保留原接口签名向后兼容。</p>
 *
 * <p>多租户隔离（P0铁律4）：所有查询带 tenant_id WHERE</p>
 *
 * @author xiaoyun
 */
@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class OptimizationSolverOrchestrator {

    private final ApsSchedulingOrchestrator apsSchedulingOrchestrator;

    @Data
    public static class SchedulingSolution {
        private List<TaskAssignment> assignments = new ArrayList<>();
        private double totalCost;
        private double totalScore;
        private boolean feasible;
        private String explanation;
    }

    @Data
    public static class TaskAssignment {
        private String orderId;
        private String factoryId;
        private String startDate;
        private String endDate;
        private double cost;
        private double score;
    }

    @Data
    public static class ProcurementSolution {
        private List<ProcurementItem> items = new ArrayList<>();
        private double totalCost;
        private boolean withinBudget;
        private String explanation;
    }

    @Data
    public static class ProcurementItem {
        private String materialName;
        private String supplierId;
        private double quantity;
        private double unitPrice;
        private double totalPrice;
    }

    /**
     * 排产约束求解（保留原接口签名，内部委托给 ApsSchedulingOrchestrator）
     *
     * <p>向后兼容：SchedulingSuggestionOrchestrator.enhanceWithOptimization 调用此方法</p>
     *
     * @param userRequest     用户请求描述（保留参数，实际不用于求解）
     * @param businessContext 业务上下文（保留参数，实际不用于求解）
     * @return 排产方案
     */
    public SchedulingSolution solveScheduling(String userRequest, String businessContext) {
        SchedulingSolution solution = new SchedulingSolution();
        try {
            if (UserContext.tenantId() == null) {
                solution.setFeasible(false);
                solution.setExplanation("租户上下文为空，无法求解");
                return solution;
            }

            // 委托给真实约束求解引擎
            ApsSchedulingRequest apsRequest = new ApsSchedulingRequest();
            ApsSchedulingResponse apsResponse = apsSchedulingOrchestrator.solveScheduling(apsRequest);

            // 转换为兼容的 SchedulingSolution
            solution.setFeasible("FEASIBLE".equals(apsResponse.getStatus()));
            solution.setTotalScore(apsResponse.getSolutions() != null && !apsResponse.getSolutions().isEmpty()
                    ? apsResponse.getSolutions().get(0).getMatchScore() : 0.0);

            List<TaskAssignment> assignments = new ArrayList<>();
            if (apsResponse.getSolutions() != null) {
                for (ApsSchedulingResponse.ScheduleSolution sol : apsResponse.getSolutions()) {
                    TaskAssignment ta = new TaskAssignment();
                    ta.setOrderId(sol.getOrderId());
                    ta.setFactoryId(sol.getFactoryName());
                    ta.setStartDate(sol.getStartDate());
                    ta.setEndDate(sol.getEndDate());
                    ta.setScore(sol.getMatchScore());
                    assignments.add(ta);
                }
            }
            solution.setAssignments(assignments);
            solution.setExplanation(buildExplanation(apsResponse));
            log.info("[OptimizationSolver] 排产求解完成 status={} 方案数={}",
                    apsResponse.getStatus(), assignments.size());
        } catch (Exception e) {
            log.error("[OptimizationSolver] 排产求解异常: {}", e.getMessage(), e);
            solution.setFeasible(false);
            solution.setExplanation("排产求解异常: " + e.getMessage());
        }
        return solution;
    }

    private String buildExplanation(ApsSchedulingResponse response) {
        if (response.getSolutions() == null || response.getSolutions().isEmpty()) {
            return "无可行排产方案，请检查工厂产能配置";
        }
        StringBuilder sb = new StringBuilder();
        sb.append(String.format("排产完成（%s），共 %d 个方案，耗时 %dms。",
                response.getStatus(), response.getSolutions().size(), response.getSolveTimeMs()));
        for (ApsSchedulingResponse.ScheduleSolution sol : response.getSolutions()) {
            sb.append(String.format("\n- 订单 %s → %s（评分%d，%s→%s，瓶颈：%s）",
                    sol.getOrderNo(), sol.getFactoryName(), sol.getMatchScore(),
                    sol.getStartDate(), sol.getEndDate(),
                    sol.getBottleneckProcess() != null ? sol.getBottleneckProcess() : "无"));
        }
        return sb.toString();
    }

    /**
     * 采购优化求解（保留原接口签名，暂未接入真实求解器）
     *
     * @param userRequest     用户请求描述
     * @param businessContext 业务上下文
     * @return 采购方案
     */
    public ProcurementSolution solveProcurement(String userRequest, String businessContext) {
        ProcurementSolution solution = new ProcurementSolution();
        solution.setWithinBudget(true);
        solution.setExplanation("采购优化求解器暂未接入真实约束求解，返回空方案。");
        return solution;
    }
}
