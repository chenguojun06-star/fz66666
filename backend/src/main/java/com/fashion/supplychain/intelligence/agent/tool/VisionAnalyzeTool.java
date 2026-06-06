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
 * 通用视觉分析工具：支持图片URL和Base64图片分析
 * 
 * <p>用户可以在聊天中上传图片，小云会自动识别并回答。
 * <p>支持的分析类型：
 * <ul>
 *   <li>DEFECT_DETECT - 缺陷检测（破洞、污渍、色差等）</li>
 *   <li>STYLE_IDENTIFY - 款式识别（领型、袖型、面料等）</li>
 *   <li>COLOR_CHECK - 颜色检测（色差、色牢度等）</li>
 *   <li>GENERIC - 通用分析（自动判断最佳分析方式）</li>
 * </ul>
 */
@Slf4j
@Component
@AgentToolDef(
        name = "tool_vision_analyze",
        description = "通用视觉AI分析：分析服装/布料/款式图片，支持缺陷检测、款式识别、颜色检测等多种视觉任务",
        domain = ToolDomain.VISION,
        timeoutMs = 30000,
        readOnly = true
)
public class VisionAnalyzeTool extends AbstractAgentTool {

    @Autowired
    private VisionAnalysisService visionAnalysisService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("imageUrl", stringProp("图片的URL地址或Base64编码"));
        properties.put("taskType", stringProp("分析类型：DEFECT_DETECT(缺陷检测)|STYLE_IDENTIFY(款式识别)|COLOR_CHECK(颜色检测)|GENERIC(通用分析)，默认GENERIC"));
        properties.put("userQuestion", stringProp("用户的问题描述，如：'这是什么款式'、'有没有质量问题'等"));
        return buildToolDef(
                "通用视觉分析工具，可以分析服装图片并回答用户问题。支持：1)缺陷检测：识别破洞、污渍、色差、线头等质量问题；2)款式识别：识别领型、袖型、面料、风格等款式特征；3)颜色检测：检测色差、色牢度等颜色问题；4)通用分析：根据图片内容自动判断并回答用户问题。当用户上传图片或发送图片进行分析时调用。",
                properties, List.of("imageUrl"));
    }

    @Override
    public String getName() {
        return "tool_vision_analyze";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.VISION;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String imageUrl = requireString(args, "imageUrl");
        
        // 获取 taskType，默认为 GENERIC
        String taskType = optionalString(args, "taskType");
        if (taskType == null || taskType.isBlank()) {
            taskType = "GENERIC";
        }
        
        // 获取 userQuestion，默认为空
        String userQuestion = optionalString(args, "userQuestion");
        if (userQuestion == null) {
            userQuestion = "";
        }

        if (!visionAnalysisService.isAvailable()) {
            return errorJson("视觉AI未配置（请检查 agnes API 配置）");
        }

        // 检查图片URL格式
        if (imageUrl == null || imageUrl.isBlank()) {
            return errorJson("图片地址不能为空");
        }

        // Base64 图片预处理（仅验证格式，不做上传）
        if (imageUrl.startsWith("data:image")) {
            if (!validateBase64Image(imageUrl)) {
                return errorJson("图片格式不支持，请上传 PNG/JPG/GIF/WebP 格式");
            }
            // Base64 图片直接传给视觉模型
            log.info("[VisionAnalyze] 接收到 Base64 图片，长度={}", imageUrl.length());
        }

        log.info("[VisionAnalyze] 开始视觉分析 taskType={} imageUrl={}", taskType, 
                truncateUrl(imageUrl));

        VisionAnalysisService.VisionResult result;
        
        switch (taskType.toUpperCase()) {
            case "DEFECT_DETECT":
                result = visionAnalysisService.analyzeDefect(imageUrl, userQuestion);
                break;
            case "STYLE_IDENTIFY":
                result = visionAnalysisService.analyzeStyle(imageUrl, userQuestion);
                break;
            case "COLOR_CHECK":
                result = visionAnalysisService.analyzeColor(imageUrl, userQuestion);
                break;
            case "GENERIC":
            default:
                result = visionAnalysisService.analyzeGeneric(imageUrl, userQuestion);
                break;
        }

        if (!result.isAvailable()) {
            return errorJson("视觉分析服务暂不可用：" + result.getErrorMessage());
        }

        Map<String, Object> output = new LinkedHashMap<>();
        output.put("success", true);
        output.put("taskType", taskType);
        output.put("severity", result.getSeverity());
        output.put("confidence", result.getConfidence());
        output.put("report", result.getReport());
        output.put("recommendation", result.getRecommendation());
        
        if (result.getDefects() != null && !result.getDefects().isEmpty()) {
            output.put("defects", result.getDefects());
        }
        
        if (result.getRawResponse() != null && !result.getRawResponse().isBlank()) {
            output.put("rawAnalysis", truncate(result.getRawResponse(), 500));
        }

        return MAPPER.writeValueAsString(output);
    }

    /**
     * 验证 Base64 图片格式
     */
    private boolean validateBase64Image(String base64Data) {
        try {
            String[] parts = base64Data.split(",");
            if (parts.length != 2) {
                return false;
            }
            String meta = parts[0].toLowerCase();
            return meta.contains("image/png") 
                    || meta.contains("image/jpeg")
                    || meta.contains("image/jpg")
                    || meta.contains("image/gif")
                    || meta.contains("image/webp");
        } catch (Exception e) {
            log.warn("[VisionAnalyze] Base64 验证失败: {}", e.getMessage());
            return false;
        }
    }

    private String truncateUrl(String url) {
        if (url == null) return "null";
        // Base64 图片只显示前缀
        if (url.startsWith("data:image")) {
            String meta = url.split(",")[0];
            return meta + "...";
        }
        return url.length() > 60 ? url.substring(0, 60) + "..." : url;
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }
}
