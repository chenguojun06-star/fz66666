package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.NlQueryRequest;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import com.fashion.supplychain.intelligence.orchestration.NlQueryOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.*;

/**
 * 自然语言查询工具 —— 让 AI 可以直接查询数据库中的所有业务数据。
 *
 * <p>支持 Text-to-SQL 能力：可以理解用户的自然语言问题，自动转换为 SQL 查询，
 * 覆盖所有业务表（订单/生产/采购/库存/财务/工资/供应商/客户/工人/面料/物料/质检/入库/出库/裁剪/车缝/尾部/出货/交期 等）。
 *
 * 典型对话：
 *   "查询 PO202606010001 订单进度"
 *   "查看今天的产量统计"
 *   "哪些订单逾期了"
 *   "各工厂表现对比"
 *   "本月工资最高的10个工人"
 *   "最近一个月采购金额排名"
 *   "库存不足的面料有哪些"
 *   "质检合格率最低的工序"
 */
@Slf4j
@Component
@Lazy
@AgentToolDef(
        name = "tool_nl_query",
        description = "自然语言数据查询工具",
        domain = ToolDomain.ANALYSIS,
        timeoutMs = 30000
)
@McpToolAnnotation(
        name = "tool_nl_query",
        description = "自然语言数据查询：通过自然语言直接查询所有业务数据（订单/生产/采购/库存/财务/工资/供应商/客户/工人/面料/物料/质检/入库/出库/裁剪/车缝/尾部/出货/交期等）。"
                + "支持Text-to-SQL，能理解复杂查询条件。当用户问任何数据相关问题时，优先使用此工具。",
        domain = ToolDomain.ANALYSIS,
        readOnly = true,
        timeoutSeconds = 30,
        requiresConfirmation = false,
        tags = {"自然语言查询", "数据查询", "订单查询", "产量统计", "库存查询", "财务统计", "工资查询", "Text-to-SQL"}
)
public class NlQueryTool extends AbstractAgentTool {

    @Autowired
    private NlQueryOrchestrator nlQueryOrchestrator;

    @Override
    public String getName() {
        return "tool_nl_query";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.ANALYSIS;
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("question", stringProp(
                "用户的自然语言问题，例如："
                + "「查询 PO202606010001 订单进度」、"
                + "「查看今天的产量统计」、"
                + "「哪些订单逾期了」、"
                + "「各工厂表现对比」、"
                + "「本月工资最高的10个工人」、"
                + "「最近一个月采购金额排名」、"
                + "「库存不足的面料有哪些」"));

        return buildToolDef(
                "自然语言数据查询：通过自然语言直接查询所有业务数据（订单/生产/采购/库存/财务/工资/供应商/客户/工人/面料/物料/质检/入库/出库/裁剪/车缝/尾部/出货/交期等）。"
                + "支持Text-to-SQL，能理解复杂查询条件。当用户问任何数据相关问题时，优先使用此工具。",
                properties,
                List.of("question")
        );
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Map<String, Object> args = parseArgs(argumentsJson);
        String question = requireString(args, "question");

        log.info("[NlQueryTool] 执行查询: {}", question);

        NlQueryRequest request = new NlQueryRequest();
        request.setQuestion(question);

        NlQueryResponse response = nlQueryOrchestrator.query(request);

        Map<String, Object> resultData = new LinkedHashMap<>();
        resultData.put("intent", response.getIntent());
        resultData.put("confidence", response.getConfidence());
        resultData.put("answer", response.getAnswer());
        if (response.getData() != null) {
            resultData.put("data", response.getData());
        }
        if (response.getSuggestions() != null && !response.getSuggestions().isEmpty()) {
            resultData.put("suggestions", response.getSuggestions());
        }

        return successJson(response.getAnswer(), resultData);
    }
}
