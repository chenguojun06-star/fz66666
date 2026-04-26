package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Component
public class OrderRemarkTool extends AbstractAgentTool {

    private static final Set<String> URGENCY_KEYWORDS = Set.of(
            "紧急", "加急", "催", "赶紧", "马上", "立即", "急", "尽快", "务必", "今天", "明天", "逾期", "超期", "延迟", "延误"
    );
    private static final Set<String> PROBLEM_KEYWORDS = Set.of(
            "问题", "异常", "不良", "缺陷", "返工", "报废", "不合格", "差", "错", "漏", "缺", "少", "多", "色差",
            "尺寸不对", "面料问题", "工艺问题", "质量差", "破损", "污渍", "起球", "脱线"
    );
    private static final Set<String> ACTION_KEYWORDS = Set.of(
            "需要", "要求", "请", "必须", "希望", "安排", "协调", "确认", "跟进", "处理", "解决", "修改", "调整"
    );
    private static final Pattern DATE_PATTERN = Pattern.compile("\\d{1,2}[/-]\\d{1,2}|\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}");

    @Autowired
    private OrderRemarkService orderRemarkService;

    @Override
    public String getName() {
        return "tool_query_order_remarks";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("orderNo", stringProp("订单号，必填"));
        props.put("limit", intProp("返回条数，默认20，最多50"));
        props.put("action", stringProp("操作类型：list(列表)/summary(智能摘要)/alerts(异常告警)，默认list"));
        return buildToolDef(
                "查询指定订单的备注历史，包含系统自动备注和人工手动备注。" +
                        "支持智能摘要提取关键信息、异常告警标注。当用户问'这单有什么问题''备注里说了什么''这单的历史记录'时调用。",
                props, List.of("orderNo"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String orderNo = requireString(args, "orderNo");
        int limit = Optional.ofNullable(optionalInt(args, "limit")).orElse(20);
        limit = Math.min(limit, 50);
        String action = optionalString(args, "action");
        if (action == null || action.isBlank()) action = "list";

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<OrderRemark> remarks = orderRemarkService.lambdaQuery()
                .eq(OrderRemark::getTargetNo, orderNo)
                .eq(OrderRemark::getTenantId, tenantId)
                .eq(OrderRemark::getDeleteFlag, 0)
                .orderByDesc(OrderRemark::getCreateTime)
                .last("LIMIT " + limit)
                .list();

        return switch (action) {
            case "summary" -> buildSummary(orderNo, remarks);
            case "alerts" -> buildAlerts(orderNo, remarks);
            default -> buildList(orderNo, remarks);
        };
    }

    private String buildList(String orderNo, List<OrderRemark> remarks) throws Exception {
        List<Map<String, Object>> list = new ArrayList<>();
        for (OrderRemark r : remarks) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("time", r.getCreateTime() != null ? r.getCreateTime().toString() : "");
            item.put("author", r.getAuthorName());
            item.put("role", r.getAuthorRole());
            item.put("content", r.getContent());
            item.put("tags", extractTags(r.getContent()));
            list.add(item);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderNo", orderNo);
        data.put("total", list.size());
        data.put("remarks", list);
        return successJson("查询成功", data);
    }

    private String buildSummary(String orderNo, List<OrderRemark> remarks) throws Exception {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderNo", orderNo);
        data.put("totalRemarks", remarks.size());

        long systemCount = remarks.stream().filter(r -> r.getAuthorRole() != null && r.getAuthorRole().contains("系统")).count();
        long manualCount = remarks.size() - systemCount;
        data.put("systemRemarks", systemCount);
        data.put("manualRemarks", manualCount);

        List<String> keyPoints = new ArrayList<>();
        List<String> urgentItems = new ArrayList<>();
        List<String> problemItems = new ArrayList<>();
        List<String> actionItems = new ArrayList<>();

        for (OrderRemark r : remarks) {
            String content = r.getContent();
            if (content == null || content.isBlank()) continue;
            String author = r.getAuthorName() != null ? r.getAuthorName() : "系统";

            boolean isUrgent = containsAny(content, URGENCY_KEYWORDS);
            boolean isProblem = containsAny(content, PROBLEM_KEYWORDS);
            boolean isAction = containsAny(content, ACTION_KEYWORDS);

            if (isUrgent) {
                urgentItems.add("[" + author + "] " + content);
            }
            if (isProblem) {
                problemItems.add("[" + author + "] " + content);
            }
            if (isAction && !isUrgent) {
                actionItems.add("[" + author + "] " + content);
            }
        }

        if (!urgentItems.isEmpty()) {
            keyPoints.add("🔴 紧急事项（" + urgentItems.size() + "条）");
            keyPoints.addAll(urgentItems.stream().limit(3).map(s -> "  → " + s).toList());
        }
        if (!problemItems.isEmpty()) {
            keyPoints.add("🟡 质量问题（" + problemItems.size() + "条）");
            keyPoints.addAll(problemItems.stream().limit(3).map(s -> "  → " + s).toList());
        }
        if (!actionItems.isEmpty()) {
            keyPoints.add("🔵 待办事项（" + actionItems.size() + "条）");
            keyPoints.addAll(actionItems.stream().limit(3).map(s -> "  → " + s).toList());
        }
        if (keyPoints.isEmpty()) {
            keyPoints.add("✅ 备注中无紧急/异常/待办事项，订单运转正常");
        }

        data.put("keyPoints", keyPoints);
        data.put("urgentCount", urgentItems.size());
        data.put("problemCount", problemItems.size());
        data.put("actionCount", actionItems.size());

        return successJson("智能摘要生成成功", data);
    }

    private String buildAlerts(String orderNo, List<OrderRemark> remarks) throws Exception {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderNo", orderNo);

        List<Map<String, Object>> alerts = new ArrayList<>();
        for (OrderRemark r : remarks) {
            String content = r.getContent();
            if (content == null || content.isBlank()) continue;

            List<String> tags = extractTags(content);
            if (tags.isEmpty()) continue;

            Map<String, Object> alert = new LinkedHashMap<>();
            alert.put("time", r.getCreateTime() != null ? r.getCreateTime().toString() : "");
            alert.put("author", r.getAuthorName());
            alert.put("content", content);
            alert.put("tags", tags);

            String severity = "info";
            if (containsAny(content, URGENCY_KEYWORDS)) severity = "urgent";
            else if (containsAny(content, PROBLEM_KEYWORDS)) severity = "warning";
            alert.put("severity", severity);

            alerts.add(alert);
        }

        long urgentCount = alerts.stream().filter(a -> "urgent".equals(a.get("severity"))).count();
        long warningCount = alerts.stream().filter(a -> "warning".equals(a.get("severity"))).count();

        data.put("totalAlerts", alerts.size());
        data.put("urgentAlerts", urgentCount);
        data.put("warningAlerts", warningCount);
        data.put("alerts", alerts);

        List<String> recommendations = new ArrayList<>();
        if (urgentCount > 0) {
            recommendations.add("🔴 有" + urgentCount + "条紧急备注，建议立即处理");
        }
        if (warningCount > 2) {
            recommendations.add("🟡 质量问题较多（" + warningCount + "条），建议安排专项排查");
        }
        if (urgentCount == 0 && warningCount == 0) {
            recommendations.add("✅ 无异常告警，订单运转正常");
        }
        data.put("recommendations", recommendations);

        return successJson("异常告警分析完成", data);
    }

    private List<String> extractTags(String content) {
        if (content == null || content.isBlank()) return Collections.emptyList();
        List<String> tags = new ArrayList<>();
        if (containsAny(content, URGENCY_KEYWORDS)) tags.add("紧急");
        if (containsAny(content, PROBLEM_KEYWORDS)) tags.add("质量问题");
        if (containsAny(content, ACTION_KEYWORDS)) tags.add("待办");
        if (DATE_PATTERN.matcher(content).find()) tags.add("含日期");
        return tags;
    }

    private boolean containsAny(String content, Set<String> keywords) {
        if (content == null) return false;
        String lower = content.toLowerCase();
        return keywords.stream().anyMatch(lower::contains);
    }
}
