package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class StyleDifficultyOrchestrator {

    @Autowired private StyleBomService styleBomService;
    @Autowired private StyleProcessService styleProcessService;
    @Autowired private SecondaryProcessService secondaryProcessService;
    @Autowired private StyleInfoService styleInfoService;
    @Autowired private AiAdvisorService aiAdvisorService;
    @Autowired private QdrantService qdrantService;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired private StyleImageUrlResolver imageUrlResolver;

    @Value("${ai.doubao.model:doubao-1.5-vision-pro}")
    private String doubaoVisionModel;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public DifficultyAssessment assess(StyleInfo style) {
        if (style == null || style.getId() == null) return defaultAssessment();
        List<StyleBom> boms = styleBomService.listByStyleId(style.getId());
        List<StyleProcess> processes = styleProcessService.listByStyleId(style.getId());
        List<SecondaryProcess> secondaryProcesses = secondaryProcessService.listByStyleId(style.getId());
        return buildStructuredAssessment(style, boms, processes, secondaryProcesses, null);
    }

    public DifficultyAssessment assessWithAiById(Long styleId, String coverUrl) {
        if (styleId == null) return defaultAssessment();
        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) return defaultAssessment();
        List<StyleBom> boms = styleBomService.listByStyleId(styleId);
        List<StyleProcess> processes = styleProcessService.listByStyleId(styleId);
        List<SecondaryProcess> secondaryProcesses = secondaryProcessService.listByStyleId(styleId);
        DifficultyAssessment base = buildStructuredAssessment(style, boms, processes, secondaryProcesses, coverUrl);
        return enhanceWithAi(style, boms, processes, secondaryProcesses, base, coverUrl);
    }

    public DifficultyAssessment assessWithAi(StyleInfo style, List<StyleBom> boms,
            List<StyleProcess> processes, List<SecondaryProcess> secondaryProcesses, String coverUrl) {
        if (style == null) return defaultAssessment();
        DifficultyAssessment base = buildStructuredAssessment(style, boms, processes, secondaryProcesses, coverUrl);
        return enhanceWithAi(style, boms, processes, secondaryProcesses, base, coverUrl);
    }

    DifficultyAssessment buildStructuredAssessment(StyleInfo style, List<StyleBom> boms,
            List<StyleProcess> processes, List<SecondaryProcess> secondaryProcesses, String coverUrl) {
        DifficultyAssessment a = new DifficultyAssessment();
        a.setBomCount(boms != null ? boms.size() : 0);
        a.setProcessCount(processes != null ? processes.size() : 0);
        a.setHasSecondaryProcess(secondaryProcesses != null && !secondaryProcesses.isEmpty());
        long hardCount = processes == null ? 0 : processes.stream()
                .filter(p -> "HARD".equalsIgnoreCase(p.getDifficulty()) || "高".equals(p.getDifficulty()))
                .count();
        int score = computeBaseScore(boms, processes, secondaryProcesses, style.getCategory(), hardCount);
        a.setDifficultyScore(score);
        a.setDifficultyLevel(scoreToLevel(score));
        a.setDifficultyLabel(levelToLabel(a.getDifficultyLevel()));
        a.setPricingMultiplier(levelToMultiplier(a.getDifficultyLevel()));
        a.setKeyFactors(buildKeyFactors(boms, processes, secondaryProcesses, style.getCategory(), hardCount));
        a.setAssessmentSource("STRUCTURED");
        a.setImageAnalyzed(false);
        return a;
    }

    private int computeBaseScore(List<StyleBom> boms, List<StyleProcess> processes,
            List<SecondaryProcess> secondaryProcesses, String category, long hardCount) {
        int score = 3;
        if (boms != null && boms.size() > 5) score++;
        if (boms != null && boms.size() > 10) score++;
        if (processes != null && processes.size() > 8) score++;
        if (processes != null && processes.size() > 15) score++;
        score += (int) Math.min(hardCount, 3);
        if (secondaryProcesses != null && !secondaryProcesses.isEmpty()) score++;
        if (category != null) {
            if (category.matches(".*?(礼服|婚纱|高定|旗袍).*")) score += 3;
            else if (category.matches(".*?(夹克|外套|大衣|西装|风衣).*")) score += 2;
            else if (category.matches(".*?(衬衫|连衣裙|半裙|裤).*")) score += 1;
        }
        return Math.max(1, Math.min(10, score));
    }

    DifficultyAssessment enhanceWithAi(StyleInfo style, List<StyleBom> boms,
            List<StyleProcess> processes, List<SecondaryProcess> secondaryProcesses,
            DifficultyAssessment base, String rawCoverUrl) {
        boolean visionEnabled = doubaoVisionModel != null && !doubaoVisionModel.isBlank();
        String imageUrl = imageUrlResolver.resolveForVision(rawCoverUrl);
        String visionDescription = analyzeWithVision(visionEnabled, imageUrl);
        String visualSimilarityContext = searchVisualSimilarity(imageUrl);
        String userMessage = buildAiPrompt(style, boms, processes, secondaryProcesses, base, visionDescription, visualSimilarityContext);
        String systemPrompt = "你是拥有20年经验的专业服装版师和工艺师。" +
                "请根据AI视觉分析结果为核心依据进行难度评估。" +
                "视觉分析发现的工艺特征优先级最高——如果视觉分析识别出翻领、里布、口袋、肩部结构等特征，" +
                "评分必须体现这些工艺的实际制作难度，不受结构化预评分影响。严格返回 JSON，不加任何解释文字。";
        String raw = aiAdvisorService.chat(systemPrompt, userMessage);
        if (raw == null || raw.isBlank()) return base;
        String json = extractJson(raw);
        if (json == null) { log.warn("[StyleDifficulty] AI 返回内容无法提取 JSON"); return base; }
        Map<String, Object> parsed = parseAiJson(json);
        if (parsed == null) return base;
        return mergeAiResult(style, base, parsed, visionDescription, imageUrl, "暂无视觉分析".equals(visionDescription), rawCoverUrl);
    }

    private String analyzeWithVision(boolean visionEnabled, String imageUrl) {
        if (!visionEnabled || imageUrl == null || imageUrl.isBlank()) return "暂无视觉分析";
        try {
            String visionPrompt = "你是专业服装工艺师，请仅根据图片判断这件服装的制作难度因素。\n" +
                    "第一步：识别服装大类（T恤/衬衫/外套/西装/大衣/裙/裤/连衣裙等）。\n" +
                    "第二步：逐一检查以下工艺维度，列出图中实际可见的难点：\n" +
                    "- 领型结构（翻领/立领/贴边/烫定/驳头/翻折等 → 需要精确对合的加分）\n" +
                    "- 肩部结构（肩垫/落肩/插肩/收省等）\n" +
                    "- 口袋（有袋盖/嵌线袋/里布/数量/转角处理）\n" +
                    "- 门襟与扣合（单排扣/双排扣/暗门襟/拉链/扣位精度）\n" +
                    "- 里布/衬布/挂面（全里/半里/粘合衬/毛衬等）\n" +
                    "- 版型控制（收腰/Oversize/多裁片/公主线/省道等）\n" +
                    "- 面料难度（厚重/易皱/贴合/弹力/对花对格等）\n" +
                    "- 下摆/袖口处理（开衩/卷边/锁边/贴边等）\n" +
                    "- 装饰工艺（刺绣/蕾丝/拼接/压褶/印花等）\n\n" +
                    "对每个难点标注「难」「中」「易」。\n" +
                    "重要：西装/大衣/外套类即使看起来简约，其领型对合、里布挂面、肩部结构、口袋嵌线等工艺本身就有较高制作难度，不要误判为简单。\n" +
                    "严格 200 字以内，只讲工艺，不讲颜色/风格/搭配。\n" +
                    "仅当确实是无结构的基础内衣/背心/纯色T恤时才写「简单基础款，无特殊难度因素」。";
            String raw = inferenceOrchestrator.chatWithDoubaoVision(imageUrl, visionPrompt);
            if (raw != null && !raw.isBlank()) {
                String desc = raw.length() > 400 ? raw.substring(0, 400) : raw;
                log.info("[StyleDifficulty] Doubao视觉分析成功，描述长度={}", desc.length());
                return desc;
            }
            log.warn("[StyleDifficulty] Doubao 视觉模型返回空，跳过视觉增强");
        } catch (Exception e) {
            log.warn("[StyleDifficulty] 视觉分析异常，降级无描述: {}", e.getMessage());
        }
        return "暂无视觉分析";
    }

    private String searchVisualSimilarity(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) return "";
        try {
            float[] imageVec = qdrantService.computeMultimodalEmbedding(imageUrl);
            List<QdrantService.SimilarStyle> similar = qdrantService.searchSimilarStyleImages(imageVec, 3, UserContext.tenantId());
            List<String> refs = new ArrayList<>();
            for (QdrantService.SimilarStyle ss : similar) {
                if (ss.getSimilarity() >= 0.72f) {
                    refs.add(String.format("款号%s 难度%d分(%s) 视觉相似%.0f%%",
                            ss.getStyleNo().isEmpty() ? "[无款号]" : ss.getStyleNo(),
                            ss.getDifficultyScore(), ss.getDifficultyLevel(), ss.getSimilarity() * 100));
                }
            }
            if (!refs.isEmpty()) return "- 视觉近似历史款式（AI检索）：" + String.join("；", refs) + "\n";
            log.info("[StyleDifficulty] 图片向量完成，相似款式数={}", similar.size());
        } catch (Exception e) {
            log.warn("[StyleDifficulty] Voyage图像向量失败，跳过视觉上下文: {}", e.getMessage());
        }
        return "";
    }

    private String buildAiPrompt(StyleInfo style, List<StyleBom> boms, List<StyleProcess> processes,
            List<SecondaryProcess> secondaryProcesses, DifficultyAssessment base,
            String visionDescription, String visualSimilarityContext) {
        String processNames = processes == null ? "" : processes.stream()
                .map(StyleProcess::getProcessName).filter(n -> n != null && !n.isEmpty()).limit(8)
                .collect(Collectors.joining("、"));
        String secondaryNames = secondaryProcesses == null ? "" : secondaryProcesses.stream()
                .map(SecondaryProcess::getProcessName).filter(n -> n != null && !n.isEmpty()).limit(5)
                .collect(Collectors.joining("、"));
        boolean processDataIncomplete = (processes == null || processes.isEmpty());
        String processDataNote = processDataIncomplete
                ? "⚠️ 工序数据尚未录入（0道），这并不代表该款式没有工序，请完全以图像分析结果为主要评估依据！"
                : "";
        long hardCount = processes == null ? 0 : processes.stream()
                .filter(p -> "HARD".equalsIgnoreCase(p.getDifficulty()) || "高".equals(p.getDifficulty())).count();
        return String.format(
                "款式信息：\n- 款号：%s\n- 品类：%s\n- BOM物料种数：%d 种\n- 工序（共%d道）：%s\n" +
                "- 二次工艺（共%d道）：%s\n%s\n- AI图像发现的工艺难度因素（Doubao 视觉分析）：%s\n%s\n" +
                "结构化预评分（仅供参考）：难度%s（%d/10），含高难工序%d道，二次工艺%s。\n\n" +
                "核心评估原则：\n1. AI图像分析是最可信的评估依据\n2. 西装/大衣/外套类至少5-7分\n" +
                "3. 标记为「难」的工艺特征应显著提升评分\n4. 多个「难」特征 → 综合评分至少 6-8 分\n" +
                "5. 不要被结构化预评分误导\n\n" +
                "返回 JSON：{\"difficultyLevel\":\"SIMPLE|MEDIUM|COMPLEX|HIGH_END\",\"difficultyScore\":0," +
                "\"keyFactors\":[\"因素1\"],\"pricingMultiplier\":1.0,\"imageInsight\":\"AI识别的难度关键特征总结\"}",
                style.getStyleNo() == null ? "未填写" : style.getStyleNo(),
                style.getCategory() == null ? "未分类" : style.getCategory(),
                base.getBomCount(), base.getProcessCount(),
                processNames.isEmpty() ? "暂无" : processNames,
                secondaryProcesses == null ? 0 : secondaryProcesses.size(),
                secondaryNames.isEmpty() ? "无" : secondaryNames,
                processDataNote, visionDescription, visualSimilarityContext,
                base.getDifficultyLabel(), base.getDifficultyScore(),
                hardCount, base.getHasSecondaryProcess() ? "有" : "无");
    }

    private DifficultyAssessment mergeAiResult(StyleInfo style, DifficultyAssessment base,
            Map<String, Object> parsed, String visionDescription, String imageUrl,
            boolean visionFailed, String rawCoverUrl) {
        String aiLevel = String.valueOf(parsed.getOrDefault("difficultyLevel", base.getDifficultyLevel()));
        Object scoreObj = parsed.get("difficultyScore");
        int aiScore = scoreObj instanceof Number ? Math.max(1, Math.min(10, ((Number) scoreObj).intValue())) : base.getDifficultyScore();
        String imageInsight = String.valueOf(parsed.getOrDefault("imageInsight", ""));
        if (visionFailed) {
            imageInsight = buildVisionFallbackMessage(rawCoverUrl, base);
        }
        Object multiplierObj = parsed.get("pricingMultiplier");
        BigDecimal aiMultiplier = multiplierObj instanceof Number
                ? BigDecimal.valueOf(((Number) multiplierObj).doubleValue()).setScale(2, java.math.RoundingMode.HALF_UP)
                : levelToMultiplier(aiLevel);
        if (aiMultiplier.compareTo(BigDecimal.ONE) < 0) aiMultiplier = BigDecimal.ONE;
        if (aiMultiplier.compareTo(BigDecimal.valueOf(2.0)) > 0) aiMultiplier = BigDecimal.valueOf(2.0);
        List<String> aiFactors = asStringList(parsed.get("keyFactors"));
        List<String> mergedFactors = new ArrayList<>(base.getKeyFactors());
        if (aiFactors != null) {
            for (String f : aiFactors) { if (!mergedFactors.contains(f)) mergedFactors.add(f); }
        }
        base.setDifficultyScore(aiScore);
        base.setDifficultyLevel(aiLevel);
        base.setDifficultyLabel(levelToLabel(aiLevel));
        base.setPricingMultiplier(aiMultiplier);
        base.setKeyFactors(mergedFactors.stream().limit(6).collect(Collectors.toList()));
        base.setImageAnalyzed(true);
        base.setImageInsight(imageInsight.length() > 120 ? imageInsight.substring(0, 120) : imageInsight);
        if (!visionFailed) {
            base.setVisionRaw(visionDescription.length() > 400 ? visionDescription.substring(0, 400) : visionDescription);
            persistImageInsight(style, base.getImageInsight());
        }
        base.setAssessmentSource("AI_ENHANCED");
        upsertStyleImageVector(style, imageUrl, base);
        return base;
    }

    private String buildVisionFallbackMessage(String rawCoverUrl, DifficultyAssessment base) {
        boolean visionEnabled = doubaoVisionModel != null && !doubaoVisionModel.isBlank();
        boolean imageNotFound = (rawCoverUrl == null || rawCoverUrl.isBlank());
        if (!visionEnabled) return "AI视觉模型未配置，评分依据 BOM和品类结构数据";
        if (imageNotFound) return "封面图未上传，评分依据 BOM（" + base.getBomCount() + " 种物料）及品类信息";
        return "图片读取失败，评分依据 BOM（" + base.getBomCount() + " 种物料）及品类信息";
    }

    private void persistImageInsight(StyleInfo style, String insight) {
        if (style == null || style.getId() == null || insight == null || insight.isBlank()) return;
        try {
            style.setImageInsight(insight);
            styleInfoService.updateById(style);
            log.info("[StyleDifficulty] imageInsight 已持久化: styleId={}", style.getId());
        } catch (Exception e) {
            log.warn("[StyleDifficulty] imageInsight 持久化失败（不影响当前结果）: {}", e.getMessage());
        }
    }

    private void upsertStyleImageVector(StyleInfo style, String imageUrl, DifficultyAssessment base) {
        if (imageUrl == null || style.getId() == null) return;
        try {
            float[] imageVec = qdrantService.computeMultimodalEmbedding(imageUrl);
            if (imageVec != null) {
                qdrantService.upsertStyleImageVector(style.getId(),
                        style.getStyleNo() != null ? style.getStyleNo() : "",
                        imageVec, base.getDifficultyLevel(),
                        base.getDifficultyScore() != null ? base.getDifficultyScore() : 5,
                        UserContext.tenantId());
                log.info("[StyleDifficulty] 款式图片向量已入库 styleId={}", style.getId());
            }
        } catch (Exception e) {
            log.warn("[StyleDifficulty] 款式图向量入库失败: {}", e.getMessage());
        }
    }

    private List<String> buildKeyFactors(List<StyleBom> boms, List<StyleProcess> processes,
            List<SecondaryProcess> secondaryProcesses, String category, long hardCount) {
        List<String> factors = new ArrayList<>();
        if (boms != null && boms.size() > 8) factors.add("物料种类多（" + boms.size() + "种）");
        if (processes != null && processes.size() > 10) factors.add("工序道数多（" + processes.size() + "道）");
        if (hardCount > 0) factors.add("含高难工序 " + hardCount + " 道");
        if (secondaryProcesses != null && !secondaryProcesses.isEmpty()) {
            String names = secondaryProcesses.stream()
                    .map(SecondaryProcess::getProcessName).filter(n -> n != null && !n.isEmpty()).limit(3)
                    .collect(Collectors.joining("、"));
            factors.add("二次工艺：" + (names.isEmpty() ? "有" : names));
        }
        if (category != null) {
            if (category.matches(".*?(礼服|婚纱|高定|旗袍).*")) factors.add("高端品类附加难度");
            else if (category.matches(".*?(夹克|外套|大衣|西装|风衣).*")) factors.add("外套品类结构复杂");
        }
        return factors.stream().limit(5).collect(Collectors.toList());
    }

    private Map<String, Object> parseAiJson(String json) {
        try { return MAPPER.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}); }
        catch (Exception e) { log.warn("[StyleDifficulty] AI 返回 JSON 解析失败: {}", e.getMessage()); return null; }
    }

    private List<String> asStringList(Object value) {
        if (!(value instanceof List<?> rawList)) return null;
        List<String> result = new ArrayList<>();
        for (Object item : rawList) { if (item != null) result.add(String.valueOf(item)); }
        return result;
    }

    private String scoreToLevel(int score) {
        if (score <= 3) return "SIMPLE"; if (score <= 5) return "MEDIUM";
        if (score <= 7) return "COMPLEX"; return "HIGH_END";
    }

    private String levelToLabel(String level) {
        if (level == null) return "中等难度";
        switch (level) { case "SIMPLE": return "简单款"; case "MEDIUM": return "中等难度";
            case "COMPLEX": return "工艺复杂"; case "HIGH_END": return "高定级"; default: return "中等难度"; }
    }

    private BigDecimal levelToMultiplier(String level) {
        if (level == null) return BigDecimal.ONE;
        switch (level) { case "SIMPLE": return BigDecimal.valueOf(1.00); case "MEDIUM": return BigDecimal.valueOf(1.15);
            case "COMPLEX": return BigDecimal.valueOf(1.35); case "HIGH_END": return BigDecimal.valueOf(1.60);
            default: return BigDecimal.ONE; }
    }

    private String extractJson(String raw) {
        int start = raw.indexOf('{'); int end = raw.lastIndexOf('}');
        return (start >= 0 && end > start) ? raw.substring(start, end + 1) : null;
    }

    private DifficultyAssessment defaultAssessment() {
        DifficultyAssessment d = new DifficultyAssessment();
        d.setDifficultyLevel("MEDIUM"); d.setDifficultyLabel("中等难度"); d.setDifficultyScore(5);
        d.setBomCount(0); d.setProcessCount(0); d.setHasSecondaryProcess(false);
        d.setPricingMultiplier(BigDecimal.valueOf(1.15)); d.setAssessmentSource("STRUCTURED");
        return d;
    }
}
