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
        // D-702：先试【无参直查】——异常检测 / 财务异常。
        // 这两个工具内部是纯统计计算（z-score / 金额聚合），不调 LLM，
        // 因此问「有没有异常」本就不需要任何模型推理，走 Agent 循环纯属浪费
        // （实测两轮 LLM 往返约 20 秒，而统计本身亚秒级）。
        DirectAnswer noArg = tryNoArgDirect(userMessage);
        if (noArg != null) {
            return noArg;
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

    /**
     * D-702：无参工具直查（异常检测 / 财务异常）。
     *
     * <p><b>为什么这两个最适合直查</b>：
     * <ul>
     *   <li><b>零参数歧义</b> —— 无需从问题里提取任何标识符，不可能猜错；</li>
     *   <li><b>内部不调 LLM</b> —— {@code AnomalyDetectionOrchestrator.detect()} 是
     *       纯 z-score 统计与金额聚合，走 Agent 循环纯属把亚秒级统计包装成 20 秒；</li>
     *   <li><b>结论确定</b> —— 输出是规则算出的异常清单，不需要模型"解释"。</li>
     * </ul>
     *
     * <p>相比订单进度直查，这里连参数提取都没有，是所有候选里风险最低的一档。
     *
     * @return 命中则返回；未命中或执行失败返回 {@code null}（交回 Agent）
     */
    private DirectAnswer tryNoArgDirect(String msg) {
        final String toolName;
        final String cardType;
        final String cardTitle;
        if (msg.matches("(?s).*(有没有异常|有什么异常|有异常吗|生产异常|风险检测|风险信号|"
                + "今天有什么问题|异常检测|有没有问题|哪些异常).*")) {
            toolName = "tool_anomaly_detection";
            cardType = "anomaly_list";
            cardTitle = "今日生产异常检测";
        } else if (msg.matches("(?s).*(财务.{0,4}异常|异常.{0,4}财务|财务有没有问题|"
                + "费用异常|收付款.{0,4}问题|有没有对不上的|财务风险).*")) {
            toolName = "tool_finance_anomaly";
            cardType = "anomaly_list";
            cardTitle = "财务异常检测";
        } else {
            return null;
        }

        // 权限先行：直查绕过 Agent 循环，必须显式校验，否则等于给无权角色开旁路
        if (!toolAccessService.canUseTool(toolName)) {
            log.debug("[DirectQuery] 当前用户无权使用 {}，跳过直查", toolName);
            return null;
        }
        AgentTool tool = toolExecHelper.getToolMap().get(toolName);
        if (tool == null) {
            log.warn("[DirectQuery] 未注册工具 {}，跳过直查", toolName);
            return null;
        }
        try {
            String result = tool.execute("{}");
            if (result == null || result.isBlank()) {
                return null;
            }
            Map<String, Object> parsed = MAPPER.readValue(result,
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {
                    });
            if (Boolean.FALSE.equals(parsed.get("success"))) {
                log.debug("[DirectQuery] {} 未成功（{}），交回 Agent", toolName, parsed.get("message"));
                return null;
            }
            return renderAnomaly(toolName, cardType, cardTitle, parsed);
        } catch (Exception e) {
            // 直查是优化，失败一律降级交回 Agent 循环
            log.warn("[DirectQuery] {} 执行失败，交回 Agent 循环: {}", toolName, e.getMessage());
            return null;
        }
    }

    /**
     * 把异常检测结果渲染成卡片。
     *
     * <p>字段来自 {@code AnomalyDetectionTool} 的真实输出：
     * {@code {success,totalChecked,anomalyCount,anomalies:[{type,severity,title,
     * description,targetName,todayValue,historyAvg,deviationRatio}],alert|summary}}。
     */
    private DirectAnswer renderAnomaly(String toolName, String cardType, String cardTitle,
            Map<String, Object> parsed) {
        Object listRaw = parsed.get("anomalies");
        if (!(listRaw instanceof List<?> list)) {
            log.debug("[DirectQuery] {} 返回结构中无 anomalies，交回 Agent", toolName);
            return null;
        }
        int count = list.size();

        // 铁律 9：没有数据 ≠ 一切正常。
        // 规则即使一条记录都没有也会跑完并返回「无异常」，
        // 若照搬，用户会把「今天没扫码/没单据」误读成「生产正常」——
        // 0 和「无数据」在业务上是两回事，这里必须区分。
        int samples = intOf(parsed.get("todaySampleCount"));
        int sampleKey = sampleKeyFor(toolName);
        boolean noData = sampleKey >= 0 && samples <= 0;

        Map<String, Object> card = new LinkedHashMap<>();
        card.put("tool", toolName);
        copyIfPresent(parsed, card, "totalChecked");
        copyIfPresent(parsed, card, "anomalyCount");
        copyIfPresent(parsed, card, "todaySampleCount");
        copyIfPresent(parsed, card, "alert");
        copyIfPresent(parsed, card, "summary");
        card.put("anomalies", list);
        card.put("dataSufficient", !noData);

        StringBuilder sb = new StringBuilder();
        if (noData) {
            // 有异常照样要报——不能因为样本少就把已发现的异常吞掉
            if (count > 0) {
                sb.append("今日样本不足（").append(samples).append(" 条），但仍发现 ")
                        .append(count).append(" 项异常，请优先核查：");
            } else {
                sb.append("今日暂无可供分析的").append(sampleKey == 0 ? "扫码" : "单据")
                        .append("数据（0 条），因此**无法判断**是否存在异常。");
                sb.append("这不代表生产正常，只代表没有数据可分析。");
            }
        } else {
            Object alert = parsed.get("alert");
            Object summary = parsed.get("summary");
            if (alert != null) {
                sb.append(String.valueOf(alert)).append("。");
            } else if (summary != null) {
                sb.append(String.valueOf(summary)).append("。");
            } else if (count > 0) {
                sb.append("发现 ").append(count).append(" 项异常。");
            } else {
                sb.append("已分析 ").append(samples).append(" 条记录，未检测到异常。");
            }
        }
        sb.append("以上为系统规则实时统计（直接查库，未经 AI 生成）。");
        sb.append("如需分析原因或给出处理建议，可以继续问我。");

        return new DirectAnswer(sb.toString(), cardType, cardTitle, card);
    }

    /**
     * 该工具用哪个字段表示「今日样本量」。
     *
     * @return 字段名；该工具不提供样本量时返回 -1（不做无数据判断）
     */
    private static int sampleKeyFor(String toolName) {
        if ("tool_anomaly_detection".equals(toolName)) {
            return 0;   // todaySampleCount：今日扫码条数
        }
        if ("tool_finance_anomaly".equals(toolName)) {
            return 1;   // totalChecked：待核对单据数
        }
        return -1;
    }

    private static int intOf(Object v) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        if (v instanceof String s) {
            try {
                return Integer.parseInt(s.trim());
            } catch (NumberFormatException ignored) {
                return -1;
            }
        }
        return -1;
    }

    private static void copyIfPresent(Map<String, Object> src, Map<String, Object> dst, String key) {
        Object v = src.get(key);
        if (v != null && !(v instanceof String s && s.isBlank())) {
            dst.put(key, v);
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