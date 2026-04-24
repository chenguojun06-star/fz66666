package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 小云 AI Agent Skill — 款式制作难度查询
 * <p>
 * 支持：
 * ① 按款号查询单款的 AI 难度分析摘要（imageInsight）
 * ② 模糊搜索款式名/款号，批量返回难度信息
 * ③ 列出已完成 AI 难度分析的款式（onlyAnalyzed=true）
 * <p>
 * 当用户问「哪个款式最难」「XX款有什么难度」「生产时需要注意什么」等问题时，
 * 优先调用此工具得到 imageInsight 后再组织回答。
 */
@Slf4j
@Component
public class StyleDifficultyQueryTool implements AgentTool {

    @Autowired
    private StyleInfoService styleInfoService;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public AiTool getToolDefinition() {
        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription(
                "查询款式的制作难度信息。当用户询问某款式的制作难度、工艺注意事项，" +
                "或想知道哪些款式比较难时，调用此工具。" +
                "返回款式的 AI 难度摘要（imageInsight），包含工艺难点和制版注意事项。");

        AiTool.AiParameters parameters = new AiTool.AiParameters();
        Map<String, Object> props = new HashMap<>();

        Map<String, Object> styleNoProp = new HashMap<>();
        styleNoProp.put("type", "string");
        styleNoProp.put("description", "精确款号，如 D2024001。不填则按关键词批量查询。");
        props.put("styleNo", styleNoProp);

        Map<String, Object> keywordProp = new HashMap<>();
        keywordProp.put("type", "string");
        keywordProp.put("description", "款式名称或款号关键词，用于模糊搜索，例如 '西装''连衣裙'");
        props.put("keyword", keywordProp);

        Map<String, Object> limitProp = new HashMap<>();
        limitProp.put("type", "integer");
        limitProp.put("description", "最多返回条数，默认 8，最大 20");
        props.put("limit", limitProp);

        Map<String, Object> onlyAnalyzedProp = new HashMap<>();
        onlyAnalyzedProp.put("type", "boolean");
        onlyAnalyzedProp.put("description", "为 true 时只返回已完成 AI 难度分析（有 imageInsight）的款式，默认 false");
        props.put("onlyAnalyzed", onlyAnalyzedProp);

        parameters.setProperties(props);
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        JsonNode args = MAPPER.readTree(argumentsJson);
        String styleNo = args.path("styleNo").asText(null);
        String keyword  = args.path("keyword").asText(null);
        int limit       = Math.min(20, Math.max(1, args.path("limit").asInt(8)));
        boolean onlyAnalyzed = args.path("onlyAnalyzed").asBoolean(false);

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // ① 精确款号查询
        if (styleNo != null && !styleNo.isBlank()) {
            return querySingleStyle(styleNo.trim(), tenantId);
        }

        // ② 批量查询（关键词 / 全部已分析）
        QueryWrapper<StyleInfo> qw = new QueryWrapper<>();
        qw.eq("delete_flag", 0);
        if (tenantId != null) {
            qw.eq("tenant_id", tenantId);
        }
        if (keyword != null && !keyword.isBlank()) {
            qw.and(w -> w.like("style_no", keyword.trim()).or().like("style_name", keyword.trim()));
        }
        if (onlyAnalyzed) {
            qw.isNotNull("image_insight").ne("image_insight", "");
        }
        qw.orderByDesc("create_time");
        qw.last("LIMIT " + limit);

        List<StyleInfo> styles = styleInfoService.list(qw);
        if (styles == null || styles.isEmpty()) {
            String desc = keyword != null ? "关键词「" + keyword + "」" : "条件";
            return "未找到符合" + desc + "的款式信息。";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("共找到 ").append(styles.size()).append(" 款款式的难度信息：\n\n");
        for (StyleInfo s : styles) {
            sb.append("【款号：").append(s.getStyleNo() != null ? s.getStyleNo() : "未填").append("】");
            if (s.getStyleName() != null && !s.getStyleName().isBlank()) {
                sb.append(" ").append(s.getStyleName());
            }
            sb.append("\n");
            if (s.getImageInsight() != null && !s.getImageInsight().isBlank()) {
                sb.append("  难度分析：").append(s.getImageInsight()).append("\n");
            } else {
                sb.append("  难度分析：暂未进行 AI 难度识别（可在款式详情页触发分析）\n");
            }
            sb.append("\n");
        }
        return sb.toString().trim();
    }

    /**
     * 查询单款的详细难度信息
     */
    private String querySingleStyle(String styleNo, Long tenantId) {
        QueryWrapper<StyleInfo> qw = new QueryWrapper<>();
        qw.eq("style_no", styleNo);
        qw.eq("delete_flag", 0);
        if (tenantId != null) {
            qw.eq("tenant_id", tenantId);
        }
        StyleInfo info = styleInfoService.getOne(qw);
        if (info == null) {
            return "未找到款号为 " + styleNo + " 的款式。";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("款号：").append(info.getStyleNo()).append("\n");
        if (info.getStyleName() != null) {
            sb.append("款式名称：").append(info.getStyleName()).append("\n");
        }
        if (info.getCategory() != null) {
            sb.append("品类：").append(info.getCategory()).append("\n");
        }
        if (info.getImageInsight() != null && !info.getImageInsight().isBlank()) {
            sb.append("AI 难度分析：").append(info.getImageInsight()).append("\n");
        } else {
            sb.append("AI 难度分析：该款式尚未进行 AI 难度识别。\n");
            sb.append("提示：可在款式详情页点击「AI 识别难度」触发分析，分析结果会持久保存。\n");
        }
        return sb.toString().trim();
    }

    @Override
    public String getName() {
        return "tool_query_style_difficulty";
    }
}
