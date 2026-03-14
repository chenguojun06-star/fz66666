package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.DifficultyAssessment;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 款式制作难度评估编排器。
 *
 * <p>评估流程：
 * <ol>
 *   <li>从结构化数据（BOM 数量、工序道数、二次工艺、品类）自动计算基础难度分</li>
 *   <li>（可选）调用 AI 大模型结合款式封面图进行增强分析，修正评分并输出图像洞察</li>
 * </ol>
 *
 * <p>难度分（1-10）→ 级别：1-3 简单款 / 4-5 中等难度 / 6-7 工艺复杂 / 8-10 高定级
 */
@Service
@Slf4j
public class StyleDifficultyOrchestrator {

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private QdrantService qdrantService;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ─────────────────────────────────────────────────────────────────────────
    // 公开 API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 使用结构化数据自动计算难度（无 AI 调用，速度快，始终可用）。
     */
    public DifficultyAssessment assess(StyleInfo style) {
        if (style == null || style.getId() == null) {
            return defaultAssessment();
        }
        List<StyleBom> boms = styleBomService.listByStyleId(style.getId());
        List<StyleProcess> processes = styleProcessService.listByStyleId(style.getId());
        List<SecondaryProcess> secondaryProcesses = secondaryProcessService.listByStyleId(style.getId());
        return buildStructuredAssessment(style, boms, processes, secondaryProcesses, null);
    }

    /**
     * 通过款式 ID 进行 AI 增强难度评估（Controller 直接调用的入口）。
     */
    public DifficultyAssessment assessWithAiById(Long styleId, String coverUrl) {
        if (styleId == null) {
            return defaultAssessment();
        }
        StyleInfo style = styleInfoService.getDetailById(styleId);
        if (style == null) {
            return defaultAssessment();
        }
        return assessWithAi(style, coverUrl);
    }

    /**
     * 使用结构化数据 + AI 大模型图像分析进行增强评估（耗时较长，建议用户主动触发）。
     *
     * @param style       款式实体
     * @param coverUrl    可覆盖使用的图片 URL（为 null 时使用 style.cover）
     */
    public DifficultyAssessment assessWithAi(StyleInfo style, String coverUrl) {
        if (style == null || style.getId() == null) {
            return defaultAssessment();
        }
        List<StyleBom> boms = styleBomService.listByStyleId(style.getId());
        List<StyleProcess> processes = styleProcessService.listByStyleId(style.getId());
        List<SecondaryProcess> secondaryProcesses = secondaryProcessService.listByStyleId(style.getId());

        // 先用结构化数据算基准
        DifficultyAssessment base = buildStructuredAssessment(style, boms, processes, secondaryProcesses, null);

        // 有 AI 资格才去调用
        if (!aiAdvisorService.isEnabled()) {
            return base;
        }
        String imageUrl = coverUrl != null ? coverUrl : style.getCover();
        log.info("[StyleDifficulty] 款式{}：BOM={}种，工序={}道，封面图={}, visionEnabled={}",
            style.getStyleNo(), boms.size(), processes.size(),
            (imageUrl != null && !imageUrl.isBlank()) ? "有(" + imageUrl.substring(0, Math.min(60, imageUrl.length())) + "...)" : "无",
            inferenceOrchestrator.isVisionEnabled());
        try {
            return enhanceWithAi(base, style, boms, processes, secondaryProcesses, imageUrl);
        } catch (Exception e) {
            log.warn("[StyleDifficulty] AI 增强分析失败，回退结构化结果: {}", e.getMessage());
            return base;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 内部逻辑
    // ─────────────────────────────────────────────────────────────────────────

    private DifficultyAssessment buildStructuredAssessment(
            StyleInfo style,
            List<StyleBom> boms,
            List<StyleProcess> processes,
            List<SecondaryProcess> secondaryProcesses,
            BigDecimal baseSuggestedPrice) {

        int bomCount = boms == null ? 0 : boms.size();
        int processCount = processes == null ? 0 : processes.size();
        boolean hasSecondary = secondaryProcesses != null && !secondaryProcesses.isEmpty();

        int score = 0;

        // BOM 物料种类评分
        if (bomCount <= 3) score += 1;
        else if (bomCount <= 8) score += 2;
        else if (bomCount <= 15) score += 3;
        else score += 4;

        // 工序道数评分
        if (processCount <= 5) score += 1;
        else if (processCount <= 10) score += 2;
        else if (processCount <= 20) score += 3;
        else score += 4;

        // 二次工艺附加
        if (hasSecondary) score += 2;

        // 品类修正
        String category = style.getCategory() == null ? "" : style.getCategory();
        if (category.matches(".*?(内衣|背心|T恤|短裤|短裙|半裙|打底|文胸|三角裤).*")) {
            score -= 1;
        } else if (category.matches(".*?(夹克|外套|大衣|羽绒服|西装|西裤|风衣|棉服|皮衣|棉袄).*")) {
            score += 1;
        } else if (category.matches(".*?(刺绣|蕾丝|礼服|婚纱|高定|旗袍|晚礼).*")) {
            score += 3;
        }

        // 含高难度工序加分（每 2 道 HARD 工序 +1 分）
        long hardCount = processes == null ? 0 : processes.stream()
                .filter(p -> "HARD".equalsIgnoreCase(p.getDifficulty()) || "高".equals(p.getDifficulty()))
                .count();
        score += (int) (hardCount / 2);

        // 限定范围 [1, 10]
        score = Math.max(1, Math.min(10, score));

        // 关键工艺因素
        List<String> keyFactors = buildKeyFactors(boms, processes, secondaryProcesses, category, hardCount);

        // 级别与倍率
        String level = scoreToLevel(score);
        String label = levelToLabel(level);
        BigDecimal multiplier = levelToMultiplier(level);

        DifficultyAssessment result = new DifficultyAssessment();
        result.setDifficultyScore(score);
        result.setDifficultyLevel(level);
        result.setDifficultyLabel(label);
        result.setBomCount(bomCount);
        result.setProcessCount(processCount);
        result.setHasSecondaryProcess(hasSecondary);
        result.setKeyFactors(keyFactors);
        result.setPricingMultiplier(multiplier);
        result.setAdjustedSuggestedPrice(baseSuggestedPrice != null
                ? baseSuggestedPrice.multiply(multiplier).setScale(2, java.math.RoundingMode.HALF_UP)
                : null);
        result.setImageAnalyzed(false);
        result.setAssessmentSource("STRUCTURED");
        return result;
    }

    @SuppressWarnings("unchecked")
    private DifficultyAssessment enhanceWithAi(
            DifficultyAssessment base,
            StyleInfo style,
            List<StyleBom> boms,
            List<StyleProcess> processes,
            List<SecondaryProcess> secondaryProcesses,
            String imageUrl) {

        String processNames = processes == null ? "无" : processes.stream()
                .map(StyleProcess::getProcessName)
                .filter(n -> n != null && !n.isEmpty())
                .limit(15)
                .collect(Collectors.joining("、"));

        String secondaryNames = secondaryProcesses == null ? "无" : secondaryProcesses.stream()
                .map(SecondaryProcess::getProcessName)
                .filter(n -> n != null && !n.isEmpty())
                .collect(Collectors.joining("、"));

        // ── 视觉模型：优先 Doubao，降级 Qwen-VL，开放式发现工艺难度特征（无固定列表限制） ──
        String visionDescription = "暂无视觉分析";
        boolean visionEnabled = inferenceOrchestrator.isVisionEnabled();
        if (!visionEnabled) {
            log.warn("[StyleDifficulty] 视觉模型未启用（Doubao 和 Qwen-VL 均未配置），跳过视觉分析");
        } else if (imageUrl == null || imageUrl.isBlank()) {
            log.warn("[StyleDifficulty] 该款式无封面图（cover=null），跳过视觉分析");
        } else {
            log.info("[StyleDifficulty] 开始视觉分析，imageUrl前60字符={}", imageUrl.substring(0, Math.min(60, imageUrl.length())));
        }
        if (imageUrl != null && !imageUrl.isBlank() && visionEnabled) {
            try {
                String visionPrompt = "分析这件服装图片中存在的制作难度因素。\n" +
                        "直接列出图片中实际可见的工艺难点特征，对每个难点简述为什么会增加制作难度。\n" +
                        "可以包括但不限于：\n" +
                        "- 领型复杂度（翻领、贴边、烫定等）\n" +
                        "- 口袋构造（数量、里布、转角处理）\n" +
                        "- 扣子精度（单排/双排、间距要求）\n" +
                        "- 版型控制（Oversize、宽松度均匀性、裁片复杂度）\n" +
                        "- 面料工序难度（易皱/易起球、对车工手工要求）\n" +
                        "- 长度精度要求\n" +
                        "- 装饰工艺（刺绣、蕾丝、拼接、压褶、激光切割等）\n" +
                        "- 或其他任何工艺创新特征\n\n" +
                        "对每个识别的难点用「难」「中」「易」标记。\n" +
                        "严格控制在 200 字以内，着重讲工艺复杂度，无关颜色/风格等不涉及难度的信息。\n" +
                        "如果图片中根本看不出有什么难度特征，就直接写「简单基础款，无特殊难度因素」。";
                // 优先 Doubao 视觉模型
                String raw = inferenceOrchestrator.chatWithDoubaoVision(imageUrl, visionPrompt);
                if (raw == null || raw.isBlank()) {
                    // Doubao 不可用（未配置或调用失败），降级使用 Qwen-VL
                    log.info("[StyleDifficulty] Doubao 不可用，降级使用 Qwen-VL 视觉分析");
                    raw = inferenceOrchestrator.chatWithVision(imageUrl, visionPrompt);
                }
                if (raw != null && !raw.isBlank()) {
                    visionDescription = raw.length() > 250 ? raw.substring(0, 250) : raw;
                    log.info("[StyleDifficulty] 视觉分析完成，描述长度={}", visionDescription.length());
                } else {
                    log.warn("[StyleDifficulty] 视觉模型（Doubao+Qwen-VL）均返回空，跳过视觉增强");
                }
            } catch (Exception e) {
                log.warn("[StyleDifficulty] 视觉分析异常，降级无描述: {}", e.getMessage());
            }
        }

        // ── Voyage AI 视觉相似度检索（辅助 DeepSeek 理解款式视觉难度） ──
        String visualSimilarityContext = "";
        float[] imageVec = null;
        if (imageUrl != null && !imageUrl.isBlank()) {
            try {
                imageVec = qdrantService.computeMultimodalEmbedding(imageUrl);
                List<QdrantService.SimilarStyle> similar = qdrantService.searchSimilarStyleImages(imageVec, 3);
                List<String> refs = new ArrayList<>();
                for (QdrantService.SimilarStyle ss : similar) {
                    if (ss.getSimilarity() >= 0.72f) {
                        refs.add(String.format("款号%s 难度%d分(%s) 视觉相似%.0f%%",
                                ss.getStyleNo().isEmpty() ? "[无款号]" : ss.getStyleNo(),
                                ss.getDifficultyScore(), ss.getDifficultyLevel(),
                                ss.getSimilarity() * 100));
                    }
                }
                if (!refs.isEmpty()) {
                    visualSimilarityContext = "- 视觉近似历史款式（AI检索）：" + String.join("；", refs) + "\n";
                }
                log.info("[StyleDifficulty] 图片向量完成，相似款式数={}", similar.size());
            } catch (Exception e) {
                log.warn("[StyleDifficulty] Voyage图像向量失败，跳过视觉上下文: {}", e.getMessage());
            }
        }

        String systemPrompt = "你是专业服装版师和工艺师，擅长根据款式工艺信息快速评估制作难度。" +
                "请根据用户提供的款式信息（含AI视觉描述）进行难度评估，严格返回 JSON，不加任何解释文字。";

        String userMessage = String.format(
                "款式信息：\n" +
                "- 品类：%s\n" +
                "- BOM物料种数：%d 种\n" +
                "- 工序（共%d道）：%s\n" +
                "- 二次工艺（共%d道）：%s\n" +
                "- AI图像发现的工艺难度因素（Qwen-VL 开放式分析）：%s\n%s\n" +
                "结构化预评分：难度%s（%d/10），含高难工序%d道，二次工艺%s。\n\n" +
                "请根据 AI 图像分析发现的工艺难度特征进行评估。\n" +
                "AI 可能发现的工艺特征是动态的、开放式的，包括常见工艺和创新工艺（如激光切割、热风贴合等）。\n" +
                "标记为「难」的工艺特征应该显著提升评分，「中」适度提升，「易」保持基准评分。\n" +
                "如果有多个「难」特征，综合评分应该至少在 6-8 分。\n" +
                "返回 JSON（必须严格是下面格式，不能有其他文字）：\n" +
                "{\"difficultyLevel\":\"SIMPLE|MEDIUM|COMPLEX|HIGH_END\",\"difficultyScore\":0," +
                "\"keyFactors\":[\"因素1\"],\"pricingMultiplier\":1.0,\"imageInsight\":\"AI识别的难度关键特征总结\"}",
                style.getCategory() == null ? "未分类" : style.getCategory(),
                base.getBomCount(),
                base.getProcessCount(),
                processNames.isEmpty() ? "暂无" : processNames,
                secondaryProcesses == null ? 0 : secondaryProcesses.size(),
                secondaryNames.isEmpty() ? "无" : secondaryNames,
                visionDescription,
                visualSimilarityContext,
                base.getDifficultyLabel(),
                base.getDifficultyScore(),
                processes == null ? 0 : processes.stream()
                        .filter(p -> "HARD".equalsIgnoreCase(p.getDifficulty()) || "高".equals(p.getDifficulty()))
                        .count(),
                base.getHasSecondaryProcess() ? "有" : "无");

        String raw = aiAdvisorService.chat(systemPrompt, userMessage);
        if (raw == null || raw.isBlank()) {
            return base;
        }

        // 提取 JSON 块（可能被 markdown 包裹）
        String json = extractJson(raw);
        if (json == null) {
            log.warn("[StyleDifficulty] AI 返回内容无法提取 JSON: {}", raw.length() > 200 ? raw.substring(0, 200) : raw);
            return base;
        }

        Map<String, Object> parsed;
        try {
            parsed = MAPPER.readValue(json, Map.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("[StyleDifficulty] AI 返回 JSON 解析失败: {}", e.getMessage());
            return base;
        }

        String aiLevel = String.valueOf(parsed.getOrDefault("difficultyLevel", base.getDifficultyLevel()));
        Object scoreObj = parsed.get("difficultyScore");
        int aiScore = scoreObj instanceof Number ? Math.max(1, Math.min(10, ((Number) scoreObj).intValue())) : base.getDifficultyScore();
        String imageInsight = String.valueOf(parsed.getOrDefault("imageInsight", ""));
        Object multiplierObj = parsed.get("pricingMultiplier");
        BigDecimal aiMultiplier = multiplierObj instanceof Number
                ? BigDecimal.valueOf(((Number) multiplierObj).doubleValue()).setScale(2, java.math.RoundingMode.HALF_UP)
                : levelToMultiplier(aiLevel);
        // 限制倍率范围 [1.0, 2.0]
        if (aiMultiplier.compareTo(BigDecimal.ONE) < 0) aiMultiplier = BigDecimal.ONE;
        if (aiMultiplier.compareTo(BigDecimal.valueOf(2.0)) > 0) aiMultiplier = BigDecimal.valueOf(2.0);

        @SuppressWarnings("unchecked")
        List<String> aiFactors = (List<String>) parsed.get("keyFactors");
        List<String> mergedFactors = new ArrayList<>(base.getKeyFactors());
        if (aiFactors != null) {
            for (String f : aiFactors) {
                if (!mergedFactors.contains(f)) mergedFactors.add(f);
            }
        }

        base.setDifficultyScore(aiScore);
        base.setDifficultyLevel(aiLevel);
        base.setDifficultyLabel(levelToLabel(aiLevel));
        base.setPricingMultiplier(aiMultiplier);
        base.setKeyFactors(mergedFactors.stream().limit(6).collect(Collectors.toList()));
        base.setImageAnalyzed(true);
        base.setImageInsight(imageInsight.length() > 100 ? imageInsight.substring(0, 100) : imageInsight);
        base.setAssessmentSource("AI_ENHANCED");
        // 存储款式图片向量，供后续相似款式搜索使用
        if (imageVec != null && style.getId() != null) {
            try {
                qdrantService.upsertStyleImageVector(style.getId(),
                        style.getStyleNo() != null ? style.getStyleNo() : "",
                        imageVec, base.getDifficultyLevel(), base.getDifficultyScore());
                log.info("[StyleDifficulty] \u6b3e\u5f0f\u56fe\u7247\u5411\u91cf\u5df2\u5165\u5e93 styleId={}", style.getId());
            } catch (Exception e) {
                log.warn("[StyleDifficulty] \u6b3e\u5f0f\u56fe\u5411\u91cf\u5165\u5e93\u5931\u8d25: {}", e.getMessage());
            }
        }
        return base;
    }

    private List<String> buildKeyFactors(
            List<StyleBom> boms,
            List<StyleProcess> processes,
            List<SecondaryProcess> secondaryProcesses,
            String category,
            long hardCount) {
        List<String> factors = new ArrayList<>();
        if (boms != null && boms.size() > 8) {
            factors.add("物料种类多（" + boms.size() + "种）");
        }
        if (processes != null && processes.size() > 10) {
            factors.add("工序道数多（" + processes.size() + "道）");
        }
        if (hardCount > 0) {
            factors.add("含高难工序 " + hardCount + " 道");
        }
        if (secondaryProcesses != null && !secondaryProcesses.isEmpty()) {
            String names = secondaryProcesses.stream()
                    .map(SecondaryProcess::getProcessName)
                    .filter(n -> n != null && !n.isEmpty())
                    .limit(3)
                    .collect(Collectors.joining("、"));
            factors.add("二次工艺：" + (names.isEmpty() ? "有" : names));
        }
        if (category != null) {
            if (category.matches(".*?(礼服|婚纱|高定|旗袍).*")) {
                factors.add("高端品类附加难度");
            } else if (category.matches(".*?(夹克|外套|大衣|西装|风衣).*")) {
                factors.add("外套品类结构复杂");
            }
        }
        return factors.stream().limit(5).collect(Collectors.toList());
    }

    private String scoreToLevel(int score) {
        if (score <= 3) return "SIMPLE";
        if (score <= 5) return "MEDIUM";
        if (score <= 7) return "COMPLEX";
        return "HIGH_END";
    }

    private String levelToLabel(String level) {
        if (level == null) return "中等难度";
        switch (level) {
            case "SIMPLE": return "简单款";
            case "MEDIUM": return "中等难度";
            case "COMPLEX": return "工艺复杂";
            case "HIGH_END": return "高定级";
            default: return "中等难度";
        }
    }

    private BigDecimal levelToMultiplier(String level) {
        if (level == null) return BigDecimal.ONE;
        switch (level) {
            case "SIMPLE": return BigDecimal.valueOf(1.00);
            case "MEDIUM": return BigDecimal.valueOf(1.15);
            case "COMPLEX": return BigDecimal.valueOf(1.35);
            case "HIGH_END": return BigDecimal.valueOf(1.60);
            default: return BigDecimal.ONE;
        }
    }

    private String extractJson(String raw) {
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return raw.substring(start, end + 1);
        }
        return null;
    }

    private DifficultyAssessment defaultAssessment() {
        DifficultyAssessment d = new DifficultyAssessment();
        d.setDifficultyLevel("MEDIUM");
        d.setDifficultyLabel("中等难度");
        d.setDifficultyScore(5);
        d.setBomCount(0);
        d.setProcessCount(0);
        d.setHasSecondaryProcess(false);
        d.setPricingMultiplier(BigDecimal.valueOf(1.15));
        d.setAssessmentSource("STRUCTURED");
        return d;
    }
}
