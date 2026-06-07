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
 * 缺陷检测工具：分析服装/布料图片中的质量缺陷
 */
@Slf4j
@Component
@AgentToolDef(
        name = "tool_vision_defect_detect",
        description = "服装缺陷检测：分析服装/布料/成品图片，检测破洞、污渍、色差、线头、跳针等质量缺陷",
        domain = ToolDomain.STYLE,
        timeoutMs = 30000,
        readOnly = true
)
@McpToolAnnotation(
        name = "tool_vision_defect_detect",
        description = "服装缺陷检测：分析服装/布料/成品图片，检测破洞、污渍、色差、线头、跳针等质量缺陷",
        domain = ToolDomain.STYLE,
        readOnly = true,
        timeoutSeconds = 30,
        requiresConfirmation = false,
        tags = {"缺陷检测", "质量检测", "破洞", "污渍", "线头", "跳针", "瑕疵检测"}
)
public class VisionDefectDetectTool extends AbstractAgentTool {

    @Autowired
    private VisionAnalysisService visionAnalysisService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("imageUrl", stringProp("服装/布料/成品图片的URL地址"));
        properties.put("contextHint", stringProp("额外上下文提示（如：这是XX款式的第3次质检、面料为纯棉等），可选"));
        return buildToolDef(
                "服装缺陷检测：分析图片中的质量缺陷，包括破洞、污渍、色差、线头、跳针、漏针、起毛、褶皱、尺寸偏差、印花偏移等。" +
                        "返回缺陷列表、严重程度、置信度和处理建议。当用户提到质检、不合格、缺陷、瑕疵、次品时调用。",
                properties, List.of("imageUrl"));
    }

    @Override
    public String getName() {
        return "tool_vision_defect_detect";
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

        log.info("[VisionDefectDetect] 开始缺陷检测 imageUrl={}", imageUrl);
        VisionAnalysisService.VisionResult result = visionAnalysisService.analyzeDefect(imageUrl, contextHint);

        if (!result.isAvailable() || result.getConfidence() == 0) {
            return errorJson("缺陷检测未能识别图片内容");
        }

        Map<String, Object> output = new LinkedHashMap<>();
        output.put("success", true);
        output.put("severity", result.getSeverity());
        output.put("confidence", result.getConfidence());
        output.put("report", result.getReport());
        output.put("recommendation", result.getRecommendation());
        output.put("defects", result.getDefects());
        return MAPPER.writeValueAsString(output);
    }
}
