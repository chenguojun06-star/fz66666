package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.QdrantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 以图搜款工具：根据图片URL搜索视觉相似的历史款式，返回匹配的款号、难度和相似度。
 * 依赖：Voyage AI 多模态向量 + Qdrant style_images 集合
 */
@Slf4j
@Component
@AgentToolDef(
        name = "tool_visual_style_search",
        description = "以图搜款：根据服装图片URL搜索系统中视觉相似的历史款式，返回匹配的款号、难度等级和相似度",
        domain = ToolDomain.STYLE,
        timeoutMs = 30000,
        readOnly = true
)
public class VisualStyleSearchTool extends AbstractAgentTool {

    @Autowired
    private QdrantService qdrantService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("imageUrl", stringProp("服装图片的公网URL地址（必须是Agnes视觉模型可访问的URL）"));
        properties.put("topK", intProp("返回最相似的前N个款式，默认5，最大10"));
        return buildToolDef(
                "以图搜款：根据服装图片搜索系统中视觉相似的历史款式。当用户上传服装图片、询问相似款式、" +
                        "想通过图片找到对应款号时必须调用。返回匹配款号、难度等级、难度分数和视觉相似度。" +
                        "注意：图片URL必须是公网可访问的，base64格式不支持向量搜索。",
                properties, List.of("imageUrl"));
    }

    @Override
    public String getName() {
        return "tool_visual_style_search";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.STYLE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String imageUrl = requireString(args, "imageUrl");
        int topK = optionalInt(args, "topK") != null ? Math.min(optionalInt(args, "topK"), 10) : 5;

        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return errorJson("租户信息缺失，无法搜索");
        }

        // base64 图片不支持向量搜索
        if (imageUrl.startsWith("data:")) {
            return errorJson("base64图片不支持向量搜索，需要公网可访问的图片URL");
        }

        log.info("[VisualStyleSearch] 开始以图搜款 imageUrl={} topK={} tenantId={}", imageUrl, topK, tenantId);

        // 1. 生成多模态向量
        float[] embedding;
        try {
            embedding = qdrantService.computeMultimodalEmbedding(imageUrl);
        } catch (Exception e) {
            log.warn("[VisualStyleSearch] 向量生成失败: {}", e.getMessage());
            return errorJson("图片向量生成失败（可能Voyage API未配置或图片URL不可访问）: " + e.getMessage());
        }

        if (embedding == null || embedding.length == 0) {
            return errorJson("图片向量生成返回空结果");
        }

        // 2. 搜索相似款式
        List<QdrantService.SimilarStyle> similarStyles;
        try {
            similarStyles = qdrantService.searchSimilarStyleImages(embedding, topK, tenantId);
        } catch (Exception e) {
            log.warn("[VisualStyleSearch] 相似搜索失败: {}", e.getMessage());
            return errorJson("相似款式搜索失败: " + e.getMessage());
        }

        if (similarStyles.isEmpty()) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", true);
            result.put("summary", "未找到视觉相似的历史款式（向量库中可能还没有款式图片数据）");
            result.put("matchCount", 0);
            result.put("matches", List.of());
            return MAPPER.writeValueAsString(result);
        }

        // 3. 格式化结果
        List<Map<String, Object>> matches = similarStyles.stream().map(ss -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("styleNo", ss.getStyleNo());
            m.put("difficultyLevel", ss.getDifficultyLevel());
            m.put("difficultyScore", ss.getDifficultyScore());
            m.put("similarity", String.format("%.0f%%", ss.getSimilarity() * 100));
            m.put("similarityRaw", ss.getSimilarity());
            return m;
        }).toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", String.format("找到 %d 个视觉相似款式", matches.size()));
        result.put("matchCount", matches.size());
        result.put("matches", matches);
        return MAPPER.writeValueAsString(result);
    }
}
