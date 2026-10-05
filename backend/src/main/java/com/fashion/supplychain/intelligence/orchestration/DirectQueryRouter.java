package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * D-702：确定性查询直查分流（把"必须走 AI 的慢"变成"直接查表的快"）
 *
 * <p><b>用户反馈的根因</b>：「回答太慢，人员点击就可以看，远远不够人员去点击查看来的更快」。
 * 这句话指向的不是"再快几秒"，而是：
 * <blockquote>
 * 查订单进度 —— 打开列表页 <b>0.5 秒</b>看到数字；问小云要 <b>15~20 秒</b>。
 * </blockquote>
 * 因为「Agent 循环带工具」本身就有两轮同步 LLM 往返的固有成本
 * （iter=1 发起工具 ~2.4s + iter=2 生成答案 ~20.8s），**再优化提示层也压不掉**。
 *
 * <p><b>本分流器的取舍原则（安全第一）</b>：只在**参数能从用户问题中确定地提取**时才直查，
 * 任何不确定一律交回 Agent 循环。这是为了避免用「猜出来的参数」去查库——
 * 那会产生看似合理却实际错误的数字，比慢更糟（CLAUDE.md 铁律 7：禁止伪造业务数据）。
 *
 * <p>已支持的直查类型（均为「给定标识符 → 查表 → 渲染」形态）：
 * <ul>
 *   <li>订单进度：问题里含订单号（{@code PO+数字}）或款号时</li>
 * </ul>
 *
 * <p><b>为什么不直接把工具结果丢给前端卡片</b>：工具返回的是 JSON 字符串，
 * 字段名与卡片结构不一致，且各工具格式不统一。此处做最小映射，
 * 只渲染已验证的核心字段；其余仍交由 Agent 循环用文字解释。
 */
@Component
public class DirectQueryRouter {

    private static final Logger log = LoggerFactory.getLogger(DirectQueryRouter.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 真实订单号形如 PO20260324001 / PO20260706155257 */
    private static final Pattern ORDER_NO = Pattern.compile("(?i)\\b(PO\\d{6,})\\b");
    /** 款号：6~20 位字母数字组合，避开纯数字以免误匹配订单号 */
    private static final Pattern STYLE_NO = Pattern.compile("(?i)\\b([A-Za-z][A-Za-z0-9]{4,19})\\b");

    /** 直查命中时返回；否则返回 null 表示"交回 Agent 循环" */
    public record DirectAnswer(String text, String cardType, String cardTitle, Map<String, Object> cardData) {
    }

    @Autowired
    private com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper toolExecHelper;
    @Autowired
    private com.fashion.supplychain.intelligence.service.AiAgentToolAccessService toolAccessService;

    /**
     * 尝试直接查库回答。
     *
     * @param userMessage 用户原话
     * @return 命中则返回直查结果；未命中/参数不足返回 {@code null}
     */
    public DirectAnswer tryDirectAnswer(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) {
            return null;
        }
        // 只有明确在问进度时才直查；其余问法交给 Agent（分析类需要推理）
        if (!asksAboutProgress(userMessage)) {
            return null;
        }
        String orderNo = extract(ORDER_NO, userMessage);
        if (orderNo == null) {
            // 没有明确订单号就不猜：宁可退回 Agent 也不能用错误参数查库
            log.debug("[DirectQuery] 问题未含订单号，跳过直查（交回 Agent 循环）");
            return null;
        }
        try {
            Map<String, Object> raw = runProgressTool(orderNo);
            if (raw == null || raw.isEmpty()) {
                return null;
            }
            return render(orderNo, raw);
        } catch (Exception e) {
            // 直查失败绝不抛给用户，降级交回 Agent 循环
            log.warn("[DirectQuery] 直查失败，降级交回 Agent 循环: {}", e.getMessage());
            return null;
        }
    }

    private static boolean asksAboutProgress(String msg) {
        if (msg == null || msg.isBlank()) {
            return false;
        }
        return msg.matches("(?s).*(进度|做到哪|到哪一步|完成多少|多少件|裁了多少|什么时候.*(出货|完成|交货)|能出货吗|好了吗|做到哪步).*");
    }

    private static String extract(Pattern p, String msg) {
        if (msg == null || msg.isBlank()) {
            return null;
        }
        Matcher m = p.matcher(msg);
        if (!m.find()) {
            return null;
        }
        String v = m.group(1).toUpperCase();
        return v.startsWith("PO") || v.matches(".*\\d.*") ? v : null;
    }

    private Map<String, Object> runProgressTool(String orderNo) throws Exception {
        final String toolName = "tool_query_production_progress";

        // ── 权限先行：不可见就直接放弃，绝不执行 ──
        // 直查路径绕过了 Agent 循环，若不显式校验权限就等于给「工具不可见」的角色
        // 开了一条旁路（工厂账号/工人本不该看到跨厂订单进度）。这属于安全红线，
        // 与多租户隔离铁律同级，不能因为"快"而绕过。
        if (!toolAccessService.canUseTool(toolName)) {
            log.debug("[DirectQuery] 当前用户无权使用 {}，跳过直查（交回 Agent 循环）", toolName);
            return null;
        }

        AgentTool tool = toolExecHelper.getToolMap().get(toolName);
        if (tool == null) {
            log.warn("[DirectQuery] 未注册进度工具 {}，跳过直查", toolName);
            return null;
        }

        String argsJson = MAPPER.writeValueAsString(Map.of("orderNo", orderNo, "action", "detail"));
        String result = tool.execute(argsJson);
        if (result == null || result.isBlank()) {
            return null;
        }
        try {
            Map<String, Object> parsed = MAPPER.readValue(result,
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {
                    });
            // 工具失败时返回 {success:false, message:"未查询到..."} —— 必须识别，
            // 否则会把「未查到」当成数据渲染成空卡片，或把错误文案当业务字段展示。
            Object ok = parsed.get("success");
            if (Boolean.FALSE.equals(ok)) {
                log.debug("[DirectQuery] 工具返回未成功（{}），交回 Agent 循环", parsed.get("message"));
                return null;
            }
            return parsed;
        } catch (Exception parseEx) {
            log.debug("[DirectQuery] 工具结果非 JSON 对象，交回 Agent: {}", parseEx.getMessage());
            return null;
        }
    }

    /**
     * 把工具结果映射成数据卡片。
     *
     * <p><b>真实返回结构（已核对 ProductionProgressTool#buildOrderDetail）</b>：
     * <pre>
     *   { "total": N, "orders": [ {
     *       "orderNo","styleNo","styleName","factoryName","orderQuantity",
     *       "completedQuantity","cuttingQuantity","cuttingBundleCount",
     *       "overallProgress"(带%号), "status","urgencyLevel",
     *       "materialArrivalRate","merchandiser","plannedEndDate",
     *       "expectedShipDate","overdueDays","overdueStatus",
     *       "factoryUnitPrice","quotationUnitPrice","totalFactoryAmount" } ] }
     * </pre>
     *
     * <p>注意是<b>嵌套 orders 数组</b>而非平铺 —— 第一版按平铺写，结果渲染不出任何字段。
     * 这也是「不要靠猜字段名」的一次实证。
     *
     * <p>只放行已确认存在的字段，未知字段一律不放进卡片：
     * 宁可卡片少几个字段，也不要展示含义不明的数字。
     */
    private DirectAnswer render(String orderNo, Map<String, Object> raw) {
        Object ordersRaw = raw.get("orders");
        if (!(ordersRaw instanceof List<?> orderList) || orderList.isEmpty()) {
            log.debug("[DirectQuery] 返回结构中无 orders，交回 Agent 循环");
            return null;
        }
        Object firstRaw = orderList.get(0);
        if (!(firstRaw instanceof Map<?, ?> first)) {
            return null;
        }

        Map<String, Object> detail = MAPPER.convertValue(firstRaw,
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {
                });

        Map<String, Object> card = new LinkedHashMap<>();
        card.put("orderNo", detail.get("orderNo") != null ? detail.get("orderNo") : orderNo);
        card.put("total", raw.get("total"));
        for (String k : new String[]{"styleNo", "styleName", "factoryName", "orderQuantity",
                "completedQuantity", "cuttingQuantity", "cuttingBundleCount", "overallProgress",
                "status", "urgencyLevel", "materialArrivalRate", "merchandiser",
                "plannedEndDate", "expectedShipDate", "overdueDays", "overdueStatus",
                "factoryUnitPrice", "quotationUnitPrice", "totalFactoryAmount"}) {
            Object v = detail.get(k);
            if (v != null && !(v instanceof String s && s.isBlank()) && !"0%".equals(v)) {
                card.put(k, v);
            }
        }
        // 多条结果时保留全部，供前端表格展示
        if (orderList.size() > 1) {
            card.put("orders", orderList);
        }

        StringBuilder sb = new StringBuilder();
        sb.append("订单 ").append(card.get("orderNo")).append(" 的实时进度：");
        Object prog = card.get("overallProgress");
        if (prog != null) {
            sb.append("当前完成 ").append(prog);
        }
        Object qty = card.get("orderQuantity");
        Object done = card.get("completedQuantity");
        if (qty != null && done != null) {
            sb.append("，已裁 ").append(done).append("/").append(qty).append(" 件");
        }
        Object ship = card.get("expectedShipDate");
        if (ship != null && !"待定".equals(String.valueOf(ship))) {
            sb.append("，预计出货 ").append(ship);
        }
        sb.append("。以上为系统实时数据（直接查库，未经 AI 生成）。");
        sb.append("如需分析延期原因、成本影响或跨工厂对比，可以继续问我。");

        return new DirectAnswer(sb.toString(), "order_progress", "订单进度 " + card.get("orderNo"), card);
    }

    /** 供测试：暴露订单号提取规则 */
    public static String extractOrderNo(String msg) {
        return extract(ORDER_NO, msg);
    }

    /** 供测试：暴露进度问法判定 */
    public static boolean isProgressQuestion(String msg) {
        return asksAboutProgress(msg);
    }

    /** 供测试：款式号提取（当前未启用直查，保留规则以备扩展） */
    public static String extractStyleNo(String msg) {
        return extract(STYLE_NO, msg);
    }
}