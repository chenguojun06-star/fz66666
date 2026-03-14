package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.DifficultyAssessment;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.service.StyleAttachmentService;
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

    @Autowired
    private CosService cosService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Value("${fashion.upload-dir:./uploads}")
    private String uploadPath;

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
        // 如果前端未传 coverUrl 且 style.cover 也为空，则尝试从附件表取第一张图
        // （通过款式详情上传的图片存在 t_style_attachment，style.cover 本身为空）
        String effectiveCoverUrl = coverUrl;
        if ((effectiveCoverUrl == null || effectiveCoverUrl.isBlank())
                && (style.getCover() == null || style.getCover().isBlank())) {
            List<StyleAttachment> attachments = styleAttachmentService.listByStyleId(String.valueOf(styleId));
            if (attachments != null && !attachments.isEmpty()) {
                effectiveCoverUrl = attachments.get(0).getFileUrl();
                log.info("[StyleDifficulty] style.cover为空，从附件表回退第一张图: styleId={}, url={}",
                        styleId, effectiveCoverUrl);
            }
        }
        return assessWithAi(style, effectiveCoverUrl);
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
        String rawImageUrl = coverUrl != null ? coverUrl : style.getCover();
        // 将相对路径（/api/file/tenant-download/...）解析为 Doubao 可公开访问的 URL
        String imageUrl = resolveImageUrlForVision(rawImageUrl);
        log.info("[StyleDifficulty] 款式{}：BOM={}种，工序={}道，封面图={}(原始={}), visionEnabled={}",
            style.getStyleNo(), boms.size(), processes.size(),
            (imageUrl != null && !imageUrl.isBlank()) ? "已解析(" + imageUrl.substring(0, Math.min(60, imageUrl.length())) + "...)" : "无",
            rawImageUrl != null ? rawImageUrl.substring(0, Math.min(40, rawImageUrl.length())) : "null",
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
        // processCount=0 意味着用户还没录入工序，不应当作"无工序"处理
        boolean processDataIncomplete = processCount == 0;

        int score = 0;

        // BOM 物料种类评分
        if (bomCount <= 3) score += 1;
        else if (bomCount <= 8) score += 2;
        else if (bomCount <= 15) score += 3;
        else score += 4;

        // 工序道数评分（0道=数据未录入，给中等分而非最低分）
        if (processDataIncomplete) {
            score += 2; // 未录入工序，给予中等基准分，避免"0道→最简单"的误判
        } else if (processCount <= 5) {
            score += 1;
        } else if (processCount <= 10) {
            score += 2;
        } else if (processCount <= 20) {
            score += 3;
        } else {
            score += 4;
        }

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

        // ── 视觉模型（Doubao）：开放式发现工艺难度特征（无固定列表限制） ──
        String visionDescription = "暂无视觉分析";
        boolean visionEnabled = inferenceOrchestrator.isVisionEnabled();
        if (!visionEnabled) {
            log.warn("[StyleDifficulty] Doubao 视觉模型未配置，跳过视觉分析");
        } else if (imageUrl == null || imageUrl.isBlank()) {
            log.warn("[StyleDifficulty] 该款式无封面图（cover=null），跳过视觉分析");
        } else {
            log.info("[StyleDifficulty] 开始视觉分析，imageUrl前60字符={}", imageUrl.substring(0, Math.min(60, imageUrl.length())));
        }
        if (imageUrl != null && !imageUrl.isBlank() && visionEnabled) {
            try {
                String visionPrompt = "你是专业服装版师。请仔细分析这件服装图片中的制作工艺难度。\n\n" +
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
                // Doubao 视觉模型分析
                String raw = inferenceOrchestrator.chatWithDoubaoVision(imageUrl, visionPrompt);
                if (raw != null && !raw.isBlank()) {
                    visionDescription = raw.length() > 400 ? raw.substring(0, 400) : raw;
                    log.info("[StyleDifficulty] Doubao视觉分析成功，描述长度={} 前80字符={}",
                            visionDescription.length(),
                            visionDescription.substring(0, Math.min(80, visionDescription.length())));
                } else {
                    log.warn("[StyleDifficulty] Doubao 视觉模型返回空，跳过视觉增强");
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

        String systemPrompt = "你是拥有20年经验的专业服装版师和工艺师。" +
                "请根据AI视觉分析结果为核心依据进行难度评估。" +
                "视觉分析发现的工艺特征优先级最高——如果视觉分析识别出翻领、里布、口袋、肩部结构等特征，" +
                "评分必须体现这些工艺的实际制作难度，不受结构化预评分影响。严格返回 JSON，不加任何解释文字。";

        // 工序=0 意味着数据未录入，需要明确告知 AI 以图像为主
        boolean processDataIncomplete = (processes == null || processes.isEmpty());
        String processDataNote = processDataIncomplete
                ? "⚠️ 工序数据尚未录入（0道），这并不代表该款式没有工序，请完全以图像分析结果为主要评估依据！"
                : "";

        // 根据视觉分析是否成功，给 DeepSeek 不同的 imageInsight 生成指令（避免生成误导性"未发现"文字）
        boolean visionFailed = "暂无视觉分析".equals(visionDescription);
        log.info("[StyleDifficulty] 视觉分析状态: visionFailed={} imageUrl类型={}",
                visionFailed,
                imageUrl == null ? "null" : (
                        imageUrl.startsWith("data:") ? "base64(" + imageUrl.length() + "字符)" :
                        imageUrl.startsWith("http") ? "http-url" : "other"));
        String imageInsightInstruction = visionFailed
                ? "必须填写：'封面图暂未获取，评分依据结构化数据（BOM+品类）'"
                : "用80字以内写三点：①款式大类+颜色/面料 ②最难的1-2个工艺特征 ③制版/缝制注意点。直接给结论，不要介绍性语言。";

        String userMessage = String.format(
                "款式信息：\n" +
                "- 品类：%s\n" +
                "- BOM物料种数：%d 种\n" +
                "- 工序（共%d道）：%s\n" +
                "- 二次工艺（共%d道）：%s\n" +
                "%s\n" +
                "- AI图像发现的工艺难度因素（Doubao 视觉分析）：%s\n%s\n" +
                "结构化预评分（仅供参考）：难度%s（%d/10），含高难工序%d道，二次工艺%s。\n\n" +
                "核心评估原则：\n" +
                "1. AI图像分析是最可信的评估依据 — 如果图像发现了翻领/口袋/里布/肩部结构等工艺特征，" +
                "即使结构化数据显示工序=0，也必须按图像所见的工艺复杂度评分。\n" +
                "2. 西装/大衣/外套类服装本身工艺复杂度至少5-7分（领型对合+挂面+里布+肩部+口袋）。\n" +
                "3. 标记为「难」的工艺特征应显著提升评分，「中」适度提升，「易」保持基准。\n" +
                "4. 多个「难」特征 → 综合评分至少 6-8 分。\n" +
                "5. 不要被结构化预评分误导 — 预评分可能因数据不全而偏低。\n\n" +
                "返回 JSON（必须严格是下面格式，不能有其他文字）：\n" +
                "{\"difficultyLevel\":\"SIMPLE|MEDIUM|COMPLEX|HIGH_END\",\"difficultyScore\":0," +
                "\"keyFactors\":[\"因素1\"],\"pricingMultiplier\":1.0,\"imageInsight\":\"AI识别的难度关键特征总结\"}",
                style.getCategory() == null ? "未分类" : style.getCategory(),
                base.getBomCount(),
                base.getProcessCount(),
                processNames.isEmpty() ? "暂无" : processNames,
                secondaryProcesses == null ? 0 : secondaryProcesses.size(),
                secondaryNames.isEmpty() ? "无" : secondaryNames,
                processDataNote,
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
        // 视觉分析失败时覆盖 DeepSeek 生成的文字，避免出现"AI视觉分析未发现具体工艺特征"这类误导性描述
        if (visionFailed) {
            imageInsight = "封面图暂未获取，本次评分依据 BOM（" + base.getBomCount() + " 种物料）及品类信息";
        }
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
        base.setImageInsight(imageInsight.length() > 120 ? imageInsight.substring(0, 120) : imageInsight);
        // 视觉分析成功时，保存 Doubao 原始识别描述供前端展示（用户可直接看到 AI 识别了哪些工艺特征）
        if (!visionFailed) {
            base.setVisionRaw(visionDescription.length() > 400 ? visionDescription.substring(0, 400) : visionDescription);
        }
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

    /**
     * 将款式封面的相对路径解析为 Doubao 视觉模型可公开访问的 URL 或 Base64 Data URI。
     * <ul>
     *   <li>已是 http(s):// → 直接返回（Google 缩略图、外部图片等）</li>
     *   <li>/api/file/tenant-download/{tenantId}/{filename} →
     *       COS 已启用时生成预签名 HTTPS URL；COS 未启用时读取本地文件生成 Base64 Data URI</li>
     *   <li>其他格式 / null → 返回 null，跳过视觉分析</li>
     * </ul>
     */
    private String resolveImageUrlForVision(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return null;
        // 已是公网 URL
        if (rawUrl.startsWith("https://") || rawUrl.startsWith("http://")) {
            // COS 私有桶直链：Doubao 无法直接访问，须转为预签名 URL
            if (rawUrl.contains(".cos.") && rawUrl.contains(".myqcloud.com/")) {
                return resolveCosHttpsUrl(rawUrl);
            }
            return rawUrl;
        }
        // 解析相对路径：/api/file/tenant-download/{tenantId}/{filename}
        String prefix = "/api/file/tenant-download/";
        if (rawUrl.startsWith(prefix)) {
            String rest = rawUrl.substring(prefix.length());
            int slashIdx = rest.indexOf('/');
            if (slashIdx <= 0) {
                log.warn("[StyleDifficulty][imageResolve] 路径格式无效（无法拆分 tenantId/filename）: {}", rawUrl);
                return null;
            }
            String tenantIdStr = rest.substring(0, slashIdx);
            String filename = rest.substring(slashIdx + 1);
            try {
                Long tenantId = Long.parseLong(tenantIdStr);
                if (cosService.isEnabled()) {
                    // 生产环境（COS）→ 生成预签名 HTTPS URL，Doubao 可直接访问
                    String presignedUrl = cosService.getPresignedUrl(tenantId, filename);
                    log.info("[StyleDifficulty][imageResolve] → COS 预签名 URL (tenantId={}, file={})", tenantId, filename);
                    return presignedUrl;
                } else {
                    // 本地开发 → 从磁盘读取文件并编码为 Base64 Data URI
                    return readLocalFileAsBase64DataUri(tenantId, filename);
                }
            } catch (NumberFormatException e) {
                log.warn("[StyleDifficulty][imageResolve] tenantId 格式无效: {}", tenantIdStr);
                return null;
            }
        }
        log.warn("[StyleDifficulty][imageResolve] 无法识别的 URL 格式，跳过视觉: {}",
                rawUrl.substring(0, Math.min(60, rawUrl.length())));
        return null;
    }

    /**
     * 将 COS 私有桶直链（https://xxx.cos.region.myqcloud.com/tenants/{tenantId}/{filename}）
     * 转换为 Doubao 可访问的预签名 URL。
     * 若 URL 格式无法解析则原样返回（兜底透传，避免彻底失败）。
     */
    private String resolveCosHttpsUrl(String cosUrl) {
        try {
            int keyStart = cosUrl.indexOf(".myqcloud.com/") + ".myqcloud.com/".length();
            String cosKey = cosUrl.substring(keyStart);
            int qMark = cosKey.indexOf('?');
            if (qMark > 0) cosKey = cosKey.substring(0, qMark); // 去掉已有的查询参数
            if (cosKey.startsWith("tenants/")) {
                String rest = cosKey.substring("tenants/".length());
                int slashIdx = rest.indexOf('/');
                if (slashIdx > 0) {
                    Long tenantId = Long.parseLong(rest.substring(0, slashIdx));
                    String filename = rest.substring(slashIdx + 1);
                    if (cosService.isEnabled()) {
                        String presigned = cosService.getPresignedUrl(tenantId, filename);
                        log.info("[StyleDifficulty][imageResolve] COS直链 → 预签名URL (tenantId={}, file={})", tenantId, filename);
                        return presigned;
                    }
                    // COS 未启用（本地开发）→ 走本地文件读取
                    return readLocalFileAsBase64DataUri(tenantId, filename);
                }
            }
        } catch (Exception e) {
            log.warn("[StyleDifficulty][imageResolve] COS直链解析失败，透传原始URL: {}", e.getMessage());
        }
        // 无法解析结构，透传原始 URL（外部图片 / 其他平台 CDN）
        return cosUrl;
    }

    /**
     * 本地开发模式：从 uploadPath/tenants/{tenantId}/{filename} 读取文件并编码为 Base64 Data URI。
     */
    private String readLocalFileAsBase64DataUri(Long tenantId, String filename) {
        try {
            java.nio.file.Path filePath = java.nio.file.Paths.get(uploadPath, "tenants",
                    tenantId.toString(), filename).toAbsolutePath().normalize();
            if (!java.nio.file.Files.exists(filePath)) {
                log.warn("[StyleDifficulty][imageResolve] 本地文件不存在，跳过视觉: {}", filePath);
                return null;
            }
            byte[] bytes = java.nio.file.Files.readAllBytes(filePath);
            if (bytes.length > 10 * 1024 * 1024) {
                log.warn("[StyleDifficulty][imageResolve] 文件过大 ({}MB >10MB)，跳过视觉",
                        bytes.length / 1024 / 1024);
                return null;
            }
            String lower = filename.toLowerCase();
            String mimeType = lower.endsWith(".png") ? "image/png"
                    : lower.endsWith(".webp") ? "image/webp"
                    : lower.endsWith(".gif") ? "image/gif" : "image/jpeg";
            String b64 = java.util.Base64.getEncoder().encodeToString(bytes);
            log.info("[StyleDifficulty][imageResolve] → Base64 Data URI ({}B, {})", bytes.length, mimeType);
            return "data:" + mimeType + ";base64," + b64;
        } catch (Exception e) {
            log.warn("[StyleDifficulty][imageResolve] 本地文件读取失败: {} - {}", filename, e.getMessage());
            return null;
        }
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
