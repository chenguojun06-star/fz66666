package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ProcessTemplateResponse;
import com.fashion.supplychain.intelligence.dto.ProcessTemplateResponse.ProcessTemplateItem;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.io.InputStream;
import javax.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 工序模板AI补全编排器
 * <p>
 * 根据款式品类，统计该租户历史工序清单，
 * 或者结合系统 IE 标准库调用 AI 动态规划并将结果返回给前端自动填充。
 */
@Service
@Slf4j
public class ProcessTemplateOrchestrator {

    /** 单次最多返回工序数 */
    private static final int MAX_ITEMS = 20;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private ObjectMapper objectMapper;

    // 缓存加载的 IE 知识库
    private List<Map<String, Object>> ieKnowledgeBase = new ArrayList<>();

    // 细粒度的工序部位价格库 (1500+项)
    private List<Map<String, Object>> iePartsKnowledgeBase = new ArrayList<>();

    @PostConstruct
    public void init() {
        try {
            InputStream is = getClass().getResourceAsStream("/ai_ie_knowledge.json");
            if (is != null) {
                ieKnowledgeBase = objectMapper.readValue(is, new TypeReference<List<Map<String, Object>>>() {});
                log.info("[工序模板] 成功加载系统内置 IE 核价知识库，包含 {} 个大类", ieKnowledgeBase.size());
            } else {
                log.warn("[工序模板] 找不到资源文件 /ai_ie_knowledge.json (可能尚未生成或打包)");
            }
        } catch (Exception e) {
            log.error("[工序模板] 解析 /ai_ie_knowledge.json 失败: {}", e.getMessage());
        }

        try {
            InputStream isParts = getClass().getResourceAsStream("/ai_ie_parts_knowledge.json");
            if (isParts != null) {
                iePartsKnowledgeBase = objectMapper.readValue(isParts, new TypeReference<List<Map<String, Object>>>() {});
                log.info("[工序模板] 成功加载部位单价知识库，包含 {} 个细化工艺项", iePartsKnowledgeBase.size());
            }
        } catch (Exception e) {
            log.error("[工序模板] 解析 /ai_ie_parts_knowledge.json 失败: {}", e.getMessage());
        }
    }

    public ProcessTemplateResponse suggest(String category) {
        ProcessTemplateResponse resp = new ProcessTemplateResponse();
        resp.setCategory(category);

        // 1. 如果 AI 服务可用，并且传入了品类，优先尝试使用 AI 大模型 + IE知识库进行智能限价推断
        if (StringUtils.hasText(category) && aiAdvisorService != null && aiAdvisorService.isEnabled()) {
            boolean[] ieMatched = {false};
            List<ProcessTemplateItem> aiGenerated = tryGenerateViaLLM(category, ieMatched);
            if (aiGenerated != null && !aiGenerated.isEmpty()) {
                resp.setProcesses(aiGenerated);
                int realSampleCount = countRealSamplesForCategory(category);
                resp.setSampleStyleCount(realSampleCount);
                resp.setDataSource(ieMatched[0] ? "ie_standard" : "ai_derived");
                return resp;
            }
        }

        // 2. 如果无 AI 或大模型回答失败，降级退回租户级历史数据统计（基于本厂以往做过的订单真实价格求均值）
        return buildFromHistoricalData(category, resp);
    }

    private List<ProcessTemplateItem> tryGenerateViaLLM(String category, boolean[] ieMatchedOut) {
        // 在 IE 库中寻找匹配的子记录
        Map<String, Object> matchedKnowledge = null;
        for (Map<String, Object> k : ieKnowledgeBase) {
            String c = (String) k.get("category");
            if (c != null && (c.contains(category) || category.contains(c))) {
                matchedKnowledge = k;
                break;
            }
        }

        // 如果没找到完全匹配的，不要死板地退回第一条，而是让AI进行“无图纸动态估算”。
        String details = "由于是泛类目，暂无具体IE标准工艺参考，请你完全基于行业（华南/珠三角服装厂）最通用的制衣工序进行推演。";
        String pricingStr = "【弹性指导】该品类在当前系统无严格的价格红线，请你基于行业通常的市场加工费为准，预估一个合理的总加工价，并平摊到 裁床、车缝、尾部。";
        String searchContext = category;

        if (matchedKnowledge != null) {
            if (ieMatchedOut != null) ieMatchedOut[0] = true;
            details = (String) matchedKnowledge.get("details");
            Map<String, Object> pricing = (Map<String, Object>) matchedKnowledge.get("pricing_standard");
            pricingStr = pricing.toString() + "\n【绝对约束】：你拆分出的所有「车缝」工序累加的总单价，必须高度接近上述指导的“车间单价”。所有「尾部」工序单价之和必须接近指导的“尾部单价”。";
            searchContext = category + details;
        } else {
            pricingStr += "\n【约束】：请确保拆分出的各道工序单价符合国内下沉代工厂的单价标准。";
        }

        // 从 1500+ 部位图库中，粗略模糊匹配出和当前款式特征相关的部位细化价格 (最多放50条防止Prompt超长)
        List<Map<String, Object>> relatedParts = new ArrayList<>();
        if (iePartsKnowledgeBase != null) {
            for (Map<String, Object> part : iePartsKnowledgeBase) {
                String p = (String) part.get("part");
                String d = (String) part.get("description");
                if ((p != null && searchContext.contains(p)) || (d != null && searchContext.contains(d))) {
                    relatedParts.add(part);
                    if (relatedParts.size() >= 50) break;
                }
            }
        }

        String partsContext = "";
        try {
            if (!relatedParts.isEmpty()) {
                partsContext = "\n同时提供提取到的该款式相关的部位标准单价（供参考，优先保持在此价格附近）：\n" + objectMapper.writeValueAsString(relatedParts);
            }
        } catch (Exception e) {
            log.warn("[工序模板] 提取部位单价上下文失败: {}", e.getMessage());
        }

        String systemPrompt = "你是一个服装厂资深IE核价师与大企业生产工艺专家。你需要输出当前款式的推荐工序给工厂前端录入。" +
                "\n要求回复必须是一个合格的 JSON 数组（不用输出任何 Markdown 格式符号和解释），内容格式如下：" +
                "\n[{\"processName\": \"前开单唇袋\", \"progressStage\": \"车缝\", \"suggestedPrice\": 0.8, \"avgStandardTime\": 2}]";

        String userPrompt = String.format("我们要核价的款式类别是：【%s】。\n" +
                "系统的全局核价指导价和约束红线如下：\n%s\n" +
                "已知该款式的部分大致工艺特征为：\n%s\n%s\n\n" +
                "请你根据这些工艺特征，拆解出 5-15 道具体的常做工序（需要区分'裁床','车缝','尾部'等 progressStage）。\n" +
                "【提示】：请结合行业常识给出一个能够防爆单的科学单价，保留到小数点后三位以内。\n" +
                "千万不要写 markdown ``` 符号，直接返回最纯粹的 JSON 数组。",
                category, pricingStr, details, partsContext);

        try {
            String aiResult = aiAdvisorService.chat(systemPrompt, userPrompt);
            if (StringUtils.hasText(aiResult)) {
                // 清理大模型可能带有的 markdown code block 外壳
                aiResult = aiResult.replaceAll("(?i)```json", "").replaceAll("```", "").trim();
                List<ProcessTemplateItem> list = objectMapper.readValue(aiResult, new TypeReference<List<ProcessTemplateItem>>() {});
                if (!list.isEmpty()) {
                    String matchCat = matchedKnowledge != null ? (String) matchedKnowledge.get("category") : "泛品类大模型推演";
                    log.info("[工序模板] 通过 AI 结合 IE 标准成功生成了 {} 条微观工序限价数据 (匹配品类: {})", list.size(), matchCat);
                    // 对大模型吐出来的数据做基本的安全容错垫底
                    for (ProcessTemplateItem p : list) {
                        if (!StringUtils.hasText(p.getProgressStage())) p.setProgressStage("车缝");
                        if (p.getAvgStandardTime() < 1) p.setAvgStandardTime(1);
                    }
                    return list;
                }
            }
        } catch (Exception e) {
            log.warn("[工序模板] AI 生成或解析 JSON 失败, 将退回普通历史查询: {}", e.getMessage());
        }
        return null;
    }

    private ProcessTemplateResponse buildFromHistoricalData(String category, ProcessTemplateResponse resp) {
        Long tenantId = UserContext.tenantId();

        // ── 1. 找匹配品类的 styleId 集合 ────────────────────────────────────
        Set<String> targetStyleIds = null;
        int sampleStyleCount = 0;

        if (StringUtils.hasText(category)) {
            QueryWrapper<StyleInfo> siQw = new QueryWrapper<StyleInfo>()
                    .eq("tenant_id", tenantId)
                    .eq("category", category)
                    .select("id");
            List<StyleInfo> matchedStyles = styleInfoService.list(siQw);
            sampleStyleCount = matchedStyles.size();

            if (!matchedStyles.isEmpty()) {
                targetStyleIds = matchedStyles.stream()
                        .map(s -> String.valueOf(s.getId()))
                        .collect(Collectors.toSet());
            }
        }

        // ── 2. 查工序记录 ────────────────────────────────────────────────────
        QueryWrapper<StyleProcess> qw = new QueryWrapper<StyleProcess>()
                .eq("tenant_id", tenantId)
                .isNotNull("process_name")
                .ne("process_name", "");
        if (targetStyleIds != null && !targetStyleIds.isEmpty()) {
            qw.in("style_id", targetStyleIds);
        } else {
            // 无品类过滤：取所有历史工序，但限制样本量
            qw.last("LIMIT 2000");
        }
        List<StyleProcess> allProcesses;
        try {
            allProcesses = styleProcessService.list(qw);
        } catch (Exception e) {
            log.warn("[工序模板] 查询历史库失败: {}", e.getMessage());
            resp.setProcesses(new ArrayList<>());
            return resp;
        }

        if (sampleStyleCount == 0) {
            // 统计不同 styleId 数量
            sampleStyleCount = (int) allProcesses.stream()
                    .map(StyleProcess::getStyleId).filter(id -> id != null)
                    .distinct().count();
        }
        resp.setSampleStyleCount(sampleStyleCount);

        // ── 3. 按工序名聚合：频率 + 均价 + 均工时 ──────────────────────────────
        // key: processName → 聚合数据
        Map<String, ProcessAgg> aggMap = new LinkedHashMap<>();
        for (StyleProcess p : allProcesses) {
            String name = StringUtils.hasText(p.getProcessName()) ? p.getProcessName().trim() : null;
            if (name == null) continue;

            ProcessAgg agg = aggMap.computeIfAbsent(name, k -> new ProcessAgg(
                    name,
                    StringUtils.hasText(p.getProgressStage()) ? p.getProgressStage().trim() : null
            ));
            agg.count++;
            if (p.getPrice() != null && p.getPrice().doubleValue() > 0) {
                agg.priceSum += p.getPrice().doubleValue();
                agg.priceCount++;
            }
            if (p.getStandardTime() != null && p.getStandardTime() > 0) {
                agg.timeSum += p.getStandardTime();
                agg.timeCount++;
            }
            // 如果 progressStage 有值，优先更新（防止首条为空）
            if (!StringUtils.hasText(agg.progressStage) && StringUtils.hasText(p.getProgressStage())) {
                agg.progressStage = p.getProgressStage().trim();
            }
        }

        // ── 4. 转换并按频率排序截取 ────────────────────────────────────────────────────
        List<ProcessTemplateItem> items = aggMap.values().stream()
                .sorted(Comparator.comparingInt((ProcessAgg a) -> -a.count))
                .limit(MAX_ITEMS)
                .map(a -> {
                    double avgPrice = a.priceCount > 0 ? a.priceSum / a.priceCount : 0;
                    double avgTime  = a.timeCount  > 0 ? a.timeSum  / a.timeCount  : 0;
                    ProcessTemplateItem item = new ProcessTemplateItem();
                    item.setProcessName(a.name);
                    item.setProgressStage(StringUtils.hasText(a.progressStage) ? a.progressStage : "车缝");
                    item.setFrequency(a.count);
                    double finalPrice = Math.round(avgPrice * 100.0) / 100.0;
                    item.setAvgPrice(finalPrice);
                    item.setSuggestedPrice(finalPrice);
                    item.setAvgStandardTime(Math.max(1, Math.round(avgTime)));
                    return item;
                })
                .collect(Collectors.toList());

        resp.setProcesses(items);
        resp.setDataSource("historical");
        return resp;
    }

    private int countRealSamplesForCategory(String category) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || !StringUtils.hasText(category)) return 0;
        try {
            QueryWrapper<StyleInfo> qw = new QueryWrapper<StyleInfo>()
                    .eq("tenant_id", tenantId)
                    .eq("category", category)
                    .select("id");
            return (int) styleInfoService.count(qw);
        } catch (Exception e) {
            return 0;
        }
    }

    /** 聚合辅助类 */
    private static class ProcessAgg {
        String name;
        String progressStage;
        int count;
        double priceSum;
        int priceCount;
        double timeSum;
        int timeCount;

        ProcessAgg(String name, String progressStage) {
            this.name = name;
            this.progressStage = progressStage;
        }
    }
}
