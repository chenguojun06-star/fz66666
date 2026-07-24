package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.orchestration.PatternProductionOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 样板生产管理工具 — AI 可通过此工具查询、收样、入库和审查样板生产记录
 */
@Slf4j
@Component
@Lazy
public class PatternProductionTool extends AbstractAgentTool {

    @Autowired
    private PatternProductionOrchestrator patternProductionOrchestrator;

    @Override
    public String getName() {
        return "tool_pattern_production";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp(
                "操作类型：list=查询样板列表 / receive=收样 / review=审样 / warehouse_in=样板入库"));
        properties.put("page", intProp("页码，默认 1（list 时可选）"));
        properties.put("size", intProp("每页数量，默认 20（list 时可选）"));
        properties.put("keyword", stringProp("关键词搜索（list 时可选）"));
        properties.put("status", stringProp("状态筛选（list 时可选）：PENDING(待领取) / RECEIVED(已领取) / IN_PROGRESS(制作中) / PRODUCTION_COMPLETED(生产完成) / COMPLETED(已完成) / WAREHOUSE_IN(已入库) / WAREHOUSE_OUT(已出库) / SCRAPPED(已报废)"));
        properties.put("startDate", stringProp("开始日期，格式 yyyy-MM-dd（list 时可选）"));
        properties.put("endDate", stringProp("结束日期，格式 yyyy-MM-dd（list 时可选）"));
        properties.put("patternId", stringProp("样板ID（receive/review/warehouse_in 时使用）"));
        properties.put("result", stringProp("审样结果：PASS=通过 / REJECT=不通过（review 时使用）"));
        properties.put("remark", stringProp("备注（review/warehouse_in 时可选）"));
        return buildToolDef(
                "管理样板生产全流程，包括查询样板列表、收样确认、审样、样板入库",
                properties,
                List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");

        return switch (action) {
            case "list" -> {
                Integer page = optionalInt(args, "page");
                Integer size = optionalInt(args, "size");
                String keyword = optionalString(args, "keyword");
                String status = optionalString(args, "status");
                String startDate = optionalString(args, "startDate");
                String endDate = optionalString(args, "endDate");

                Map<String, Object> result = patternProductionOrchestrator.listWithEnrichment(
                        page != null ? page : 1,
                        size != null ? size : 20,
                        keyword, status, startDate, endDate);
                yield successJson("查询样板列表成功", result);
            }
            case "receive" -> {
                // 已废弃：旧的「领取样板」端点已删除，统一走工序级扫码 submitScan(RECEIVE)
                // 提示用户走扫码流程
                String patternId = requireString(args, "patternId");
                yield errorJson("「领取样板」操作已废弃，请让工人扫码工序二维码完成领取（submitScan operationType=RECEIVE）。patternId=" + patternId);
            }
            case "review" -> {
                String patternId = requireString(args, "patternId");
                String result = requireString(args, "result");
                String remark = optionalString(args, "remark");

                validateReviewResult(result);

                Map<String, Object> reviewResult = patternProductionOrchestrator.reviewPattern(patternId, result, remark);
                yield successJson("审样操作完成", reviewResult);
            }
            case "warehouse_in" -> {
                String patternId = requireString(args, "patternId");
                String remark = optionalString(args, "remark");

                Map<String, Object> inResult = patternProductionOrchestrator.warehouseIn(patternId, remark, null, null, null);
                yield successJson("样板入库成功", inResult);
            }
            default -> errorJson("不支持的 action：" + action + "，可用：list / review / warehouse_in");
        };
    }

    private void validateReviewResult(String result) {
        if (!"PASS".equals(result) && !"REJECT".equals(result)) {
            throw new IllegalArgumentException("result 不合法：" + result + "，可选：PASS / REJECT");
        }
    }
}
