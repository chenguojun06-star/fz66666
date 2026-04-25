package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.system.entity.Dict;
import com.fashion.supplychain.system.service.DictService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class DictTool extends AbstractAgentTool {

    @Autowired
    private DictService dictService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_dict | query_by_type"));
        properties.put("dictType", stringProp("字典类型编码(如: order_status, material_type等)"));
        properties.put("keyword", stringProp("按标签模糊过滤"));
        properties.put("limit", intProp("列表条数，默认20"));
        return buildToolDef(
                "数据字典查询：查看字典列表、按类型查询字典项。用户说'数据字典''字典项''选项值''枚举值'时必须调用。全局共享数据，无租户隔离。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_dict";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.SYSTEM;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        return switch (action) {
            case "list_dict" -> listDict(args);
            case "query_by_type" -> queryByType(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listDict(Map<String, Object> args) throws Exception {
        String keyword = optionalString(args, "keyword");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 20;

        LambdaQueryWrapper<Dict> query = new LambdaQueryWrapper<Dict>()
                .eq(Dict::getStatus, "1")
                .like(StringUtils.hasText(keyword), Dict::getDictLabel, keyword)
                .orderByAsc(Dict::getDictType)
                .orderByAsc(Dict::getSort)
                .last("LIMIT " + limit);

        List<Dict> items = dictService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "字典共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String queryByType(Map<String, Object> args) throws Exception {
        String dictType = requireString(args, "dictType");
        List<Dict> items = dictService.lambdaQuery()
                .eq(Dict::getDictType, dictType)
                .eq(Dict::getStatus, "1")
                .orderByAsc(Dict::getSort)
                .last("LIMIT 100")
                .list();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "字典类型 " + dictType + " 共 " + items.size() + " 项");
        result.put("dictType", dictType);
        result.put("items", items.stream().map(this::toDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> toDto(Dict d) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", d.getId());
        dto.put("dictCode", d.getDictCode());
        dto.put("dictLabel", d.getDictLabel());
        dto.put("dictValue", d.getDictValue());
        dto.put("dictType", d.getDictType());
        dto.put("sort", d.getSort());
        dto.put("status", d.getStatus());
        return dto;
    }
}
