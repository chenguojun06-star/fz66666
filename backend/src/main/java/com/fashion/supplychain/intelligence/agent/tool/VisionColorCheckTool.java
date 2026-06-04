package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.VisionAnalysisService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 色差检测工具：分析服装图片的色差/色牢度问题
 */
@Slf4j
@Component
@AgentToolDef(
        name = "tool_vision_color_check",
        description = "服装色差检测：分析服装/布料图片的色差、色牢度、染色均匀度问题",
        domain = ToolDomain.STYLE,
        timeoutMs = 30000,
        readOnly = true
)
public class VisionColorCheckTool extends AbstractAgentTool {

    @Autowired
    private VisionAnalysisService visionAnalysisService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("imageUrl", stringProp("服装/布料图片的URL地址"));
        properties.put("contextHint", stringProp("额外上下文提示（如：标准色号Pantone 18-1662TPC、客户反馈偏红等），可选"));
        return buildToolDef(
                "服装色差检测：分析图片中的色差/色牢度问题，包括整体色差、局部色差、色牢度、染色均匀度。" +
                        "返回色差评估、严重程度和处理建议。当用户提到色差、偏色、染色不均、褪色、色牢度时调用。",
                properties, List.of("imageUrl"));
    }

    @Override
    public String getName() {
        return "tool_vision_color_check";
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

        log.info("[VisionColorCheck] 开始色差检测 imageUrl={}", imageUrl);
        VisionAnalysisService.VisionResult result = visionAnalysisService.analyzeColor(imageUrl, contextHint);

        if (!result.isAvailable() || result.getConfidence() == 0) {
            return errorJson("色差检测未能分析图片内容");
        }

        Map<String, Object> output = new LinkedHashMap<>();
        output.put("success", true);
        output.put("severity", result.getSeverity());
        output.put("confidence", result.getConfidence());
        output.put("report", result.getReport());
        output.put("recommendation", result.getRecommendation());
        output.put("issues", result.getDefects());
        return MAPPER.writeValueAsString(output);
    }
}
