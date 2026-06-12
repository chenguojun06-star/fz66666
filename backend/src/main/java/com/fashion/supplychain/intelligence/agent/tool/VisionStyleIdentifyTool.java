package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.VisionAnalysisService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 款式识别工具：分析服装图片的款式特征
 */
@Slf4j
@Component
@Lazy
@AgentToolDef(
        name = "tool_vision_style_identify",
        description = "服装款式识别：分析服装图片的领型、袖型、版型、面料质感、颜色、图案、风格等款式特征",
        domain = ToolDomain.STYLE,
        timeoutMs = 30000,
        readOnly = true
)
@McpToolAnnotation(
        name = "tool_vision_style_identify",
        description = "服装款式识别：分析服装图片的领型、袖型、版型、面料质感、颜色、图案、风格等款式特征",
        domain = ToolDomain.STYLE,
        readOnly = true,
        timeoutSeconds = 30,
        requiresConfirmation = false,
        tags = {"款式识别", "领型", "袖型", "版型", "面料", "风格分析", "视觉识别"}
)
public class VisionStyleIdentifyTool extends AbstractAgentTool {

    @Autowired
    private VisionAnalysisService visionAnalysisService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("imageUrl", stringProp("服装图片的URL地址"));
        properties.put("contextHint", stringProp("额外上下文提示（如：这是春装新款、客户提供的参考图等），可选"));
        return buildToolDef(
                "服装款式识别：分析图片中服装的款式特征，包括领型、袖型、版型、长度、面料质感、颜色、图案、风格、适用季节。" +
                        "返回详细的款式特征总结和生产/设计建议。当用户要求识别款式、分析服装特征、描述衣服样式时调用。",
                properties, List.of("imageUrl"));
    }

    @Override
    public String getName() {
        return "tool_vision_style_identify";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.STYLE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String imageUrl = requireString(args, "imageUrl");
        String contextHint = optionalString(args, "contextHint");

        if (!visionAnalysisService.isAvailable()) {
            return errorJson("视觉AI未配置（AGNES_API_KEY未设置）");
        }

        log.info("[VisionStyleIdentify] 开始款式识别 imageUrl={}", imageUrl);
        VisionAnalysisService.VisionResult result = visionAnalysisService.analyzeStyle(imageUrl, contextHint);

        if (!result.isAvailable() || result.getConfidence() == 0) {
            return errorJson("款式识别未能分析图片内容");
        }

        Map<String, Object> output = new LinkedHashMap<>();
        output.put("success", true);
        output.put("confidence", result.getConfidence());
        output.put("report", result.getReport());
        output.put("recommendation", result.getRecommendation());
        output.put("features", result.getDefects());
        return MAPPER.writeValueAsString(output);
    }
}
