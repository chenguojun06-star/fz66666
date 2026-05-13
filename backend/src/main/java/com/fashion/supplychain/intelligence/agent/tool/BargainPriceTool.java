package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.finance.entity.BargainPrice;
import com.fashion.supplychain.finance.service.BargainPriceService;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@AgentToolDef(name = "bargain_price_tool", description = "查询订单/款式/工序的还价记录和最新还价单价", domain = ToolDomain.FINANCE)
public class BargainPriceTool extends AbstractAgentTool {

    @Autowired
    private BargainPriceService bargainPriceService;

    @Override
    public String getName() {
        return "bargain_price_tool";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("targetType", stringProp("还价目标类型: order / style / process"));
        properties.put("targetId", stringProp("还价目标ID"));
        properties.put("action", stringProp("查询动作: latest=最新已通过还价单价, list=所有还价记录, 默认list"));
        return buildToolDef(
                "还价记录查询工具。查询订单/款式/工序的还价历史记录或最新还价单价。" +
                        "用户说「还价」「议价」「谈判单价」「砍价」「价格协商」时必须调用。",
                properties,
                List.of("targetType", "targetId"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String targetType = requireString(args, "targetType");
        String targetId = requireString(args, "targetId");
        String action = optionalString(args, "action");
        if (action == null || action.isBlank()) {
            action = "list";
        }

        return switch (action) {
            case "latest" -> executeLatest(targetType, targetId);
            case "list" -> executeList(targetType, targetId);
            default -> executeList(targetType, targetId);
        };
    }

    private String executeLatest(String targetType, String targetId) throws Exception {
        BargainPrice bp = bargainPriceService.getLatestApproved(targetType, targetId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        if (bp == null) {
            result.put("found", false);
            result.put("message", "未找到 " + targetType + "/" + targetId + " 的最新已通过还价记录");
        } else {
            result.put("found", true);
            result.put("summary", "最新已通过还价: " + formatPrice(bp.getBargainedPrice())
                    + " (原始: " + formatPrice(bp.getOriginalPrice()) + ")");
            result.put("record", toDto(bp));
        }
        return MAPPER.writeValueAsString(result);
    }

    private String executeList(String targetType, String targetId) throws Exception {
        List<BargainPrice> list = bargainPriceService.listByTarget(targetType, targetId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", targetType + "/" + targetId + " 共 " + list.size() + " 条还价记录");
        result.put("total", list.size());
        result.put("records", list.stream().map(this::toDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> toDto(BargainPrice bp) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", bp.getId());
        dto.put("targetType", bp.getTargetType());
        dto.put("targetId", bp.getTargetId());
        dto.put("originalPrice", bp.getOriginalPrice());
        dto.put("bargainedPrice", bp.getBargainedPrice());
        dto.put("reason", bp.getReason());
        dto.put("status", bp.getStatus());
        dto.put("bargainedBy", bp.getBargainedByName());
        dto.put("approvedBy", bp.getApprovedByName());
        dto.put("createTime", bp.getCreateTime() != null ? bp.getCreateTime().toString() : null);
        return dto;
    }

    private String formatPrice(BigDecimal price) {
        if (price == null) {
            return "-";
        }
        return price.setScale(2, java.math.RoundingMode.HALF_UP).toString();
    }
}