package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import jakarta.annotation.PreDestroy;

/**
 * 个人每日工作计划编排器
 * 根据当前用户跟进的订单、紧急度、进度和交期，
 * 结合AI生成个性化的每日工作优先级安排。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PersonalWorkPlanOrchestrator {

    private static final long AI_TIMEOUT_MS = 5000L;

    private static final ExecutorService AI_EXECUTOR = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r);
        t.setName("personal-plan-ai");
        t.setDaemon(true);
        return t;
    });

    @PreDestroy
    public void shutdown() {
        AI_EXECUTOR.shutdown();
        try {
            if (!AI_EXECUTOR.awaitTermination(5, TimeUnit.SECONDS)) {
                AI_EXECUTOR.shutdownNow();
            }
        } catch (InterruptedException e) {
            AI_EXECUTOR.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    private final ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private AiAdvisorService aiAdvisorService;

    /**
     * 生成当前用户的每日工作计划
     */
    public Map<String, Object> generatePlan() {
        Map<String, Object> plan = new LinkedHashMap<>();
        String userName = UserContext.username();
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();

        plan.put("userName", userName);
        plan.put("date", LocalDate.now().toString());

        // 查询当前用户关联的活跃订单
        List<ProductionOrder> myOrders = queryMyActiveOrders(userName, tenantId, factoryId);
        plan.put("totalActiveOrders", myOrders.size());

        if (myOrders.isEmpty()) {
            plan.put("tasks", Collections.emptyList());
            plan.put("aiPlan", null);
            plan.put("greeting", "今天暂无紧急订单需要跟进，可以做些整理和检查工作 🌟");
            return plan;
        }

        // 按优先级分类
        LocalDate today = LocalDate.now();
        List<Map<String, Object>> tasks = buildPriorityTasks(myOrders, today);
        plan.put("tasks", tasks);

        // AI 个性化工作计划
        String aiPlan = generateAiPlan(userName, tasks, myOrders.size());
        plan.put("aiPlan", aiPlan);
        plan.put("source", aiPlan != null ? "ai" : "rule");

        return plan;
    }

    /**
     * 查询当前用户负责的活跃订单（跟单员或创建人）
     */
    private List<ProductionOrder> queryMyActiveOrders(String userName, Long tenantId, String factoryId) {
        if (!StringUtils.hasText(userName) || tenantId == null) {
            return Collections.emptyList();
        }

        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<ProductionOrder>()
                .select(
                        ProductionOrder::getId,
                        ProductionOrder::getOrderNo,
                        ProductionOrder::getStyleNo,
                        ProductionOrder::getCompany,
                        ProductionOrder::getFactoryName,
                        ProductionOrder::getOrderQuantity,
                        ProductionOrder::getCompletedQuantity,
                        ProductionOrder::getProductionProgress,
                        ProductionOrder::getMaterialArrivalRate,
                        ProductionOrder::getStatus,
                        ProductionOrder::getUrgencyLevel,
                        ProductionOrder::getPlannedEndDate,
                        ProductionOrder::getPlannedStartDate
                )
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, Arrays.asList("completed", "cancelled", "scrapped", "archived", "closed"))
                .and(q -> q
                        .eq(ProductionOrder::getMerchandiser, userName)
                        .or()
                        .eq(ProductionOrder::getCreatedByName, userName)
                )
                .orderByAsc(ProductionOrder::getPlannedEndDate);

        if (StringUtils.hasText(factoryId)) {
            wrapper.eq(ProductionOrder::getFactoryId, factoryId);
        }

        try {
            return productionOrderService.list(wrapper);
        } catch (Exception e) {
            log.warn("[PersonalWorkPlan] 查询用户订单失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 按紧急度分类构建任务列表
     */
    private List<Map<String, Object>> buildPriorityTasks(List<ProductionOrder> orders, LocalDate today) {
        List<Map<String, Object>> tasks = new ArrayList<>();

        for (ProductionOrder o : orders) {
            Map<String, Object> task = new LinkedHashMap<>();
            task.put("orderNo", o.getOrderNo());
            task.put("styleNo", o.getStyleNo() != null ? o.getStyleNo() : "");
            task.put("company", o.getCompany() != null ? o.getCompany() : "");
            task.put("factoryName", o.getFactoryName() != null ? o.getFactoryName() : "");
            task.put("progress", o.getProductionProgress() != null ? o.getProductionProgress() : 0);
            task.put("status", o.getStatus());
            task.put("urgencyLevel", o.getUrgencyLevel() != null ? o.getUrgencyLevel() : "normal");

            int materialRate = o.getMaterialArrivalRate() != null ? o.getMaterialArrivalRate() : 100;
            task.put("materialArrivalRate", materialRate);

            // 计算到期天数
            Long daysLeft = null;
            if (o.getPlannedEndDate() != null) {
                daysLeft = ChronoUnit.DAYS.between(today, o.getPlannedEndDate().toLocalDate());
                task.put("daysLeft", daysLeft);
                task.put("plannedEndDate", o.getPlannedEndDate().toLocalDate().toString());
            }

            // 确定优先级
            String priority = determinePriority(o, daysLeft, materialRate);
            task.put("priority", priority);
            task.put("priorityLabel", getPriorityLabel(priority));

            tasks.add(task);
        }

        // 按优先级排序：P0 > P1 > P2 > P3 > P4
        tasks.sort(Comparator.comparingInt(t -> getPriorityWeight((String) t.get("priority"))));
        return tasks;
    }

    private String determinePriority(ProductionOrder o, Long daysLeft, int materialRate) {
        int progress = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
        boolean isDelayed = "delayed".equals(o.getStatus());
        boolean isOverdue = daysLeft != null && daysLeft < 0;
        boolean isUrgent = "urgent".equals(o.getUrgencyLevel());

        // P0: 已逾期或已标记延迟
        if (isOverdue || isDelayed) return "P0";
        // P1: 3天内到期
        if (daysLeft != null && daysLeft <= 3) return "P1";
        // P2: 7天内到期且进度不足50%，或面料到位率<50%
        if (daysLeft != null && daysLeft <= 7 && progress < 50) return "P2";
        if (materialRate < 50) return "P2";
        // P3: 标记为加急
        if (isUrgent) return "P3";
        // P4: 其他正常跟进
        return "P4";
    }

    private String getPriorityLabel(String priority) {
        return switch (priority) {
            case "P0" -> "🔴 紧急处理";
            case "P1" -> "🟠 即将到期";
            case "P2" -> "🟡 重点关注";
            case "P3" -> "🔵 加急订单";
            case "P4" -> "🟢 正常跟进";
            default -> "正常";
        };
    }

    private int getPriorityWeight(String priority) {
        return switch (priority) {
            case "P0" -> 0;
            case "P1" -> 1;
            case "P2" -> 2;
            case "P3" -> 3;
            case "P4" -> 4;
            default -> 5;
        };
    }

    /**
     * 调用AI生成个性化工作安排（带超时降级）
     */
    private String generateAiPlan(String userName, List<Map<String, Object>> tasks, int totalOrders) {
        if (aiAdvisorService == null || !aiAdvisorService.isEnabled()) {
            return null;
        }

        try {
            String systemPrompt = buildSystemPrompt();
            String userMessage = buildUserMessage(userName, tasks, totalOrders);

            UserContext snapshot = copyUserContext(UserContext.get());
            return CompletableFuture
                    .supplyAsync(() -> withUserContext(snapshot,
                            () -> aiAdvisorService.chat(systemPrompt, userMessage)), AI_EXECUTOR)
                    .completeOnTimeout(null, AI_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                    .exceptionally(ex -> {
                        log.warn("[PersonalWorkPlan] AI生成失败，降级规则列表: {}", ex.getMessage());
                        return null;
                    })
                    .join();
        } catch (Exception e) {
            log.warn("[PersonalWorkPlan] AI调用异常: {}", e.getMessage());
            return null;
        }
    }

    private String buildSystemPrompt() {
        return "你是一位贴心、专业的服装供应链工作助手。\n"
                + "请根据用户手头的订单情况，为TA制定今日工作优先安排。\n\n"
                + "要求：\n"
                + "1. 用编号列表（1、2、3...）列出今日最重要的任务，最多5条\n"
                + "2. 每条任务说清：做什么、为什么重要（影响什么、不处理会导致什么）\n"
                + "3. 语气要温暖亲切，像一位靠谱的同事在提醒你，不要冷冰冰的播报\n"
                + "4. 每条结尾加一句鼓励的话（比如：搞定这个今天就轻松一大半了）\n"
                + "5. 最后用一句暖心的话结尾（比如：加油，今天也是充实的一天！）\n"
                + "6. 不要说'根据数据分析'这类AI味道很重的话，要像人在说话\n"
                + "7. 总字数控制在300字以内";
    }

    private String buildUserMessage(String userName, List<Map<String, Object>> tasks, int totalOrders) {
        StringBuilder sb = new StringBuilder();
        sb.append("我是").append(userName).append("，今天手头有").append(totalOrders).append("个活跃订单。\n\n");

        // 只发送高优先级任务给AI（最多8条，避免prompt过长）
        int count = 0;
        for (Map<String, Object> t : tasks) {
            if (count >= 8) break;
            sb.append("- ").append(t.get("orderNo"));
            if (StringUtils.hasText((String) t.get("styleNo"))) {
                sb.append("（款号:").append(t.get("styleNo")).append("）");
            }
            if (StringUtils.hasText((String) t.get("company"))) {
                sb.append(" 客户:").append(t.get("company"));
            }
            sb.append(" 进度:").append(t.get("progress")).append("%");
            if (t.get("daysLeft") != null) {
                long days = ((Number) t.get("daysLeft")).longValue();
                if (days < 0) {
                    sb.append(" 已逾期").append(Math.abs(days)).append("天");
                } else {
                    sb.append(" 还剩").append(days).append("天");
                }
            }
            int mr = ((Number) t.get("materialArrivalRate")).intValue();
            if (mr < 80) {
                sb.append(" 面料到位:").append(mr).append("%");
            }
            sb.append(" [").append(t.get("priorityLabel")).append("]");
            sb.append("\n");
            count++;
        }

        return sb.toString();
    }

    // ── async UserContext helpers ──

    private <T> T withUserContext(UserContext snapshot, Supplier<T> supplier) {
        UserContext previous = UserContext.get();
        try {
            if (snapshot != null) {
                UserContext.set(snapshot);
            } else {
                UserContext.clear();
            }
            return supplier.get();
        } finally {
            if (previous != null) {
                UserContext.set(previous);
            } else {
                UserContext.clear();
            }
        }
    }

    private UserContext copyUserContext(UserContext source) {
        if (source == null) return null;
        UserContext copy = new UserContext();
        copy.setUserId(source.getUserId());
        copy.setUsername(source.getUsername());
        copy.setRole(source.getRole());
        copy.setPermissionRange(source.getPermissionRange());
        copy.setTeamId(source.getTeamId());
        copy.setTenantId(source.getTenantId());
        copy.setTenantOwner(source.getTenantOwner());
        copy.setSuperAdmin(source.getSuperAdmin());
        copy.setFactoryId(source.getFactoryId());
        return copy;
    }
}
