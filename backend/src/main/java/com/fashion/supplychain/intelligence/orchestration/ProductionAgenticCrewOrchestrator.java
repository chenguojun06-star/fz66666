package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.entity.ProductionCrewMemory;
import com.fashion.supplychain.intelligence.mapper.ProductionCrewMemoryMapper;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.OrderHealthScoreOrchestrator;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 生产智能体协同编排器 v2 — 纯顾问 + 人工指令委托模式
 *
 * <p><b>设计原则：AI 绝不自主执行任何业务操作</b>
 * <ul>
 *   <li>{@link #analyzeOrder} — 只读分析，生成 AI 建议，展示在"小云"界面，无业务副作用</li>
 *   <li>{@link #executeNaturalLanguageCommand} — 接收人工自然语言指令，LLM 解析意图后
 *       委托 {@link ExecutionEngineOrchestrator} 执行；AI 不直接写任何业务表</li>
 *   <li>{@link #scanAndAdvise} — 批量顾问扫描，供定时任务调用</li>
 * </ul>
 *
 * <p>全系统命令覆盖（17+ 种）：订单暂停/加急/改货期/审批/退回、质检拒绝、
 * 结算审批、采购建单、库存安全库存、工厂催单、工序重分配、消息推送等。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProductionAgenticCrewOrchestrator {

    private static final String SCENE = "production_crew_advisory";

    private static final String CMD_TYPES =
        "order:hold(暂停订单), order:expedite(加急), order:resume(恢复), order:remark(备注), " +
        "order:approve(审批通过), order:reject(驳回), order:ship_date(修改货期), " +
        "order:add_note(添加备注), style:approve(款式审批), style:return(款式退回), " +
        "quality:reject(质检拒绝), settlement:approve(结算审批), purchase:create(创建采购单), " +
        "factory:urge(催工厂), process:reassign(工序重分配), " +
        "material:safety_stock(设置安全库存), notification:push(推送消息), " +
        "procurement:order_goods(下采购订单), undo:last(撤销上次操作)";

    private final ProductionOrderService productionOrderService;
    private final OrderHealthScoreOrchestrator healthScoreOrchestrator;
    private final SysNoticeOrchestrator sysNoticeOrchestrator;
    private final ExecutionEngineOrchestrator executionEngineOrchestrator;
    private final IntelligenceInferenceOrchestrator inferenceOrchestrator;
    private final ProductionCrewMemoryMapper crewMemoryMapper;
    private final ObjectMapper objectMapper;
    private final QdrantService qdrantService;
    private final LangfuseTraceOrchestrator langfuseTraceOrchestrator;

    // =========================================================================
    // 公开 API 1：只读分析 — 输出顾问建议，无业务副作用
    // =========================================================================

    public CrewAdvice analyzeOrder(Long tenantId, String userId, String orderNo) {
        String sessionId = UUID.randomUUID().toString();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getOrderNo, orderNo)
                .one();
        if (order == null) {
            return CrewAdvice.empty(orderNo, "订单不存在: " + orderNo);
        }
        int    score = healthScoreOrchestrator.calcScore(order);
        String level = healthScoreOrchestrator.scoreToLevel(score);

        if (!inferenceOrchestrator.isAnyModelEnabled()) {
            return new CrewAdvice(sessionId, orderNo, score, level,
                    "AI推理引擎未启用，健康分：" + score + "(" + level + ")", LocalDateTime.now());
        }
        String context   = buildOrderContext(order, score, level);
        String sysPrompt = "你是专业服装供应链顾问。根据订单状态提供简洁建议（100字以内），" +
                           "指出风险点和改进措施。不要自行执行任何操作，只给出建议。";

        IntelligenceInferenceResult result = inferenceOrchestrator.chat(SCENE, sysPrompt, context);
        String suggestions = (result != null && result.isSuccess())
                ? result.getContent()
                : "AI分析不可用，健康分：" + score + "(" + level + ")";

        saveAdvisoryMemory(tenantId, sessionId, orderNo, score, level, suggestions);
        postProcessAsync(sessionId, tenantId, userId, orderNo, suggestions, score, result);

        log.info("[ProdCrew/Advisory] orderNo={} score={} level={}", orderNo, score, level);
        return new CrewAdvice(sessionId, orderNo, score, level, suggestions, LocalDateTime.now());
    }

    // =========================================================================
    // 公开 API 2：人工 NL 指令委托 — LLM 解析意图后全权交 ExecutionEngine 执行
    //             AI 不直接写任何业务表；权限/审计/回滚全部由 ExecutionEngine 处理
    // =========================================================================

    public ExecutionResult<?> executeNaturalLanguageCommand(
            Long tenantId, Long operatorId, String naturalInstruction) {
        if (naturalInstruction == null || naturalInstruction.isBlank()) {
            return ExecutionResult.failure("指令内容不能为空");
        }
        if (!inferenceOrchestrator.isAnyModelEnabled()) {
            return ExecutionResult.failure("AI推理引擎未启用，无法解析指令，请手动操作");
        }

        // Step1：LLM 解析自然语言 → 结构化命令 JSON
        IntelligenceInferenceResult parseResult = inferenceOrchestrator.chat(
                SCENE, buildCommandParserSystemPrompt(),
                "请解析以下操作指令：\n" + naturalInstruction);
        if (parseResult == null || !parseResult.isSuccess()) {
            return ExecutionResult.failure("AI指令解析失败，请重试或手动操作");
        }

        // Step2：提取 JSON 块
        String jsonStr = extractJsonBlock(parseResult.getContent());
        if (jsonStr == null) {
            return ExecutionResult.failure("AI未能识别有效指令（响应：" +
                    trunc(parseResult.getContent(), 80) + "），请换个方式描述");
        }

        // Step3：构造 ExecutableCommand，委托 ExecutionEngine 执行
        try {
            JsonNode node   = objectMapper.readTree(jsonStr);
            String   action = node.path("action").asText();
            String   ref    = node.path("targetId").asText();
            int      risk   = node.path("riskLevel").asInt(2);
            String   reason = node.path("reason").asText(naturalInstruction);

            String targetId = resolveTargetId(tenantId, action, ref);
            if (targetId == null) {
                if (ref == null || ref.isBlank()) {
                    return ExecutionResult.failure("请指定具体的订单号或目标，例如：'暂停PO20250101001'");
                }
                return ExecutionResult.failure("找不到操作目标「" + ref + "」，请确认订单号或ID是否正确");
            }

            Map<String, Object> params = new LinkedHashMap<>();
            JsonNode paramsNode = node.path("params");
            if (paramsNode.isObject()) {
                paramsNode.fields().forEachRemaining(e ->
                        params.put(e.getKey(), e.getValue().asText()));
            }

            ExecutableCommand command = ExecutableCommand.builder()
                    .action(action)
                    .targetId(targetId)
                    .params(params)
                    .reason(reason)
                    .riskLevel(risk)
                    .requiresApproval(risk >= 4)
                    .source("ai_nl_command")
                    .initiatorId(String.valueOf(operatorId))
                    .tenantId(tenantId)
                    .expiresAt(System.currentTimeMillis() + 24 * 3600 * 1000L)
                    .build();
            command.generateCommandId();

            log.info("[ProdCrew/NLCmd] action={} targetId={} operator={} risk={}",
                    action, targetId, operatorId, risk);
            return executionEngineOrchestrator.execute(command, operatorId);

        } catch (Exception e) {
            log.error("[ProdCrew/NLCmd] 指令执行异常: {}", e.getMessage(), e);
            return ExecutionResult.failure("指令执行异常: " + e.getMessage());
        }
    }

    // =========================================================================
    // 公开 API 3：批量顾问扫描（供定时任务调用）
    // =========================================================================

    public List<CrewAdvice> scanAndAdvise(Long tenantId, String userId, int maxOrders) {
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .notIn(ProductionOrder::getStatus, "completed", "cancelled", "scrapped", "archived", "closed")
                .last("LIMIT " + Math.min(maxOrders, 20))
                .list();

        List<CrewAdvice> advices = new ArrayList<>();
        for (ProductionOrder o : orders) {
            try {
                advices.add(analyzeOrder(tenantId, userId, o.getOrderNo()));
            } catch (Exception e) {
                log.warn("[ProdCrew/Scan] 分析异常 orderNo={}: {}", o.getOrderNo(), e.getMessage());
                advices.add(CrewAdvice.empty(o.getOrderNo(), "分析异常: " + e.getMessage()));
            }
        }
        return advices;
    }

    // =========================================================================
    // 持久化（@Transactional 仅在此处，绝不包裹 LLM 调用）
    // =========================================================================

    @Transactional(rollbackFor = Exception.class)
    public void saveAdvisoryMemory(Long tenantId, String sessionId, String orderNo,
                                   int score, String level, String suggestions) {
        ProductionCrewMemory m = new ProductionCrewMemory();
        m.setTenantId(tenantId);
        m.setSessionId(sessionId);
        m.setOrderNo(orderNo);
        m.setHealthScore(score);
        m.setLevel(level);
        m.setRoute("ADVISORY");
        m.setPlan(suggestions != null && suggestions.length() > 2000
                ? suggestions.substring(0, 2000) : suggestions);
        m.setCreateTime(LocalDateTime.now());
        try {
            crewMemoryMapper.insert(m);
        } catch (Exception e) {
            log.warn("[ProdCrew] 记忆写入失败（可降级）: {}", e.getMessage());
        }
    }

    // =========================================================================
    // 异步后处理（@Async，不阻塞主链路）
    // =========================================================================

    @Async
    public void postProcessAsync(String sessionId, Long tenantId, String userId,
                                    String orderNo, String content, int score,
                                    IntelligenceInferenceResult result) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenantId);
        ctx.setUserId(userId != null ? userId : "SYSTEM");
        UserContext.set(ctx);
        try {
        // 写 Qdrant，供历史记忆召回
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("content", content);
            payload.put("order_no", orderNo);
            payload.put("score", String.valueOf(score));
            payload.put("type", "advisory");
            qdrantService.upsertVector("crew_adv_" + sessionId, tenantId, content, payload);
        } catch (Exception e) {
            log.debug("[ProdCrew] Qdrant写入降级: {}", e.getMessage());
        }
        // 推 Langfuse trace
        try {
            langfuseTraceOrchestrator.pushTrace(SCENE, tenantId, userId, result);
        } catch (Exception e) {
            log.debug("[ProdCrew] Langfuse推送降级: {}", e.getMessage());
        }
        // danger 级别触发催单通知
        if ("danger".equals(healthScoreOrchestrator.scoreToLevel(score))) {
            try {
                ProductionOrder order = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getOrderNo, orderNo)
                        .one();
                if (order != null) {
                    sysNoticeOrchestrator.sendAuto(tenantId, order, "danger_alert");
                }
            } catch (Exception e) {
                log.debug("[ProdCrew] 危险预警通知降级: {}", e.getMessage());
            }
        }
        } finally {
            UserContext.clear();
        }
    }

    // =========================================================================
    // 私有工具方法
    // =========================================================================

    private String buildOrderContext(ProductionOrder o, int score, String level) {
        return String.format(
                "订单号:%s 颜色:%s 款号:%s 进度:%d%% 采购完成率:%d%% 健康分:%d(%s) 订单数量:%d",
                o.getOrderNo(),
                o.getColor()   != null ? o.getColor()   : "未知",
                o.getStyleNo() != null ? o.getStyleNo() : "未知",
                o.getProductionProgress()       != null ? o.getProductionProgress()       : 0,
                o.getProcurementCompletionRate() != null ? o.getProcurementCompletionRate() : 0,
                score, level,
                o.getOrderQuantity() != null ? o.getOrderQuantity() : 0);
    }

    private String buildCommandParserSystemPrompt() {
        return "你是服装供应链系统的自然语言指令解析器。\n" +
               "将用户的操作指令解析为以下JSON格式（直接输出JSON，不加markdown代码块）：\n" +
               "{\n" +
               "  \"action\": \"命令类型\",\n" +
               "  \"targetId\": \"操作目标（订单号或数字ID）\",\n" +
               "  \"params\": {\"参数key\": \"参数value\"},\n" +
               "  \"reason\": \"操作原因\",\n" +
               "  \"riskLevel\": 1\n" +
               "}\n\n" +
               "支持的命令类型（严格从以下选择，不能自造）：\n" + CMD_TYPES + "\n\n" +
               "riskLevel：1=低风险(备注/标注), 2=中低(状态变更), " +
               "3=中高(审批/拒绝), 4=高(财务/采购), 5=极高(删除/撤销)\n" +
               "只输出JSON，不做任何解释。";
    }

    /** 将自然语言中提到的订单号/String ID 解析为数据库主键（String 类型） */
    private String resolveTargetId(Long tenantId, String action, String ref) {
        if (ref == null || ref.isBlank()) return null;
        // 按业务域用订单号查实际 String UUID
        if (action != null && (action.startsWith("order:") ||
                action.startsWith("quality:") || action.startsWith("factory:"))) {
            ProductionOrder o = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .eq(ProductionOrder::getOrderNo, ref)
                    .one();
            if (o != null) return o.getId();
        }
        // 兜底：直接使用传入值（UUID 或其他 String ID）
        return ref;
    }

    /** 从 LLM 响应文本中提取第一个 JSON 对象块 */
    private String extractJsonBlock(String text) {
        if (text == null) return null;
        int start = text.indexOf('{');
        int end   = text.lastIndexOf('}');
        return (start >= 0 && end > start) ? text.substring(start, end + 1) : null;
    }

    private String trunc(String s, int n) {
        return s != null && s.length() > n ? s.substring(0, n) + "…" : (s != null ? s : "");
    }

    // =========================================================================
    // 顾问分析结果（只读查询的轻量响应）
    // =========================================================================

    public record CrewAdvice(String sessionId, String orderNo, int score, String level,
                             String suggestions, LocalDateTime createdAt) {
        public static CrewAdvice empty(String orderNo, String message) {
            return new CrewAdvice("", orderNo, 0, "unknown", message, LocalDateTime.now());
        }
    }
}
