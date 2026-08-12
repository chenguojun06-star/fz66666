package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.List;
import java.util.concurrent.*;
import java.util.regex.Pattern;

/**
 * AI 批评检查官 — Agent 回答的"最后一道质量关"。
 *
 * <p>升级要点（2026-08-12）：
 * <ul>
 *   <li>超时/线程池参数配置化，运维可调</li>
 *   <li>evidence 截断长度按工具类型差异化（查询类 500 / 写入类 200）</li>
 *   <li>system prompt 增强服装行业知识 + 供应链专业校验规则</li>
 *   <li>前缀清理正则化，覆盖更多 LLM 输出格式</li>
 *   <li>草稿质量预检：过短/纯英文时跳过审查减少无效 LLM 调用</li>
 * </ul>
 */
@Service
@Lazy
@Slf4j
public class AiCriticOrchestrator {

    @Value("${xiaoyun.critic.timeout-ms:30000}")
    private long criticTimeoutMs;

    @Value("${xiaoyun.critic.thread-pool.core:2}")
    private int corePoolSize;

    @Value("${xiaoyun.critic.thread-pool.max:4}")
    private int maxPoolSize;

    @Value("${xiaoyun.critic.thread-pool.queue:32}")
    private int queueCapacity;

    /** 查询类工具 evidence 截断长度（需要更多上下文判断数据真实性） */
    private static final int EVIDENCE_TRUNCATE_QUERY = 500;
    /** 写入/操作类工具 evidence 截断长度（结果通常较短） */
    private static final int EVIDENCE_TRUNCATE_WRITE = 200;

    /** 跳过审查的最小草稿长度（过短的不值得审查） */
    private static final int MIN_DRAFT_LENGTH_FOR_REVIEW = 20;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private volatile ExecutorService criticExecutor;

    private ExecutorService getExecutor() {
        if (criticExecutor == null || criticExecutor.isShutdown()) {
            synchronized (this) {
                if (criticExecutor == null || criticExecutor.isShutdown()) {
                    criticExecutor = new ThreadPoolExecutor(
                            corePoolSize, maxPoolSize, 60L, TimeUnit.SECONDS,
                            new LinkedBlockingQueue<>(queueCapacity),
                            r -> { Thread t = new Thread(r, "critic-worker"); t.setDaemon(true); return t; },
                            new ThreadPoolExecutor.CallerRunsPolicy());
                }
            }
        }
        return criticExecutor;
    }

    public String reviewAndRevise(String userIntent, String draftResponse) {
        return reviewAndRevise(userIntent, draftResponse, null);
    }

    public String reviewAndRevise(String userIntent, String draftResponse,
                                   List<AiAgentToolExecHelper.ToolExecRecord> toolRecords) {
        if (draftResponse == null || draftResponse.isBlank()) return draftResponse;

        // 草稿质量预检：过短的不审查，节省 LLM 调用
        if (draftResponse.trim().length() < MIN_DRAFT_LENGTH_FOR_REVIEW) {
            return draftResponse;
        }

        String toolEvidenceBlock = buildToolEvidence(toolRecords);

        String systemPrompt = buildCriticSystemPrompt();
        String userPrompt = "【用户原本的问题】: " + userIntent + "\n\n"
                + "【主代理给出的草稿】: " + draftResponse + "\n\n"
                + toolEvidenceBlock + "\n"
                + "请严格对照工具执行记录审查草稿，返回最终回答：";

        try {
            log.info("[AiCritic] 进行深度审查（含{}条工具记录）...", toolRecords != null ? toolRecords.size() : 0);
            Future<String> future = getExecutor().submit(() -> doReview(systemPrompt, userPrompt, draftResponse));
            return future.get(criticTimeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            log.warn("[AiCritic] 审查超时({}ms)，直接返回原草稿", criticTimeoutMs);
            return draftResponse;
        } catch (Exception e) {
            log.warn("[AiCritic] 审查失败，退回原草稿: {}", e.getMessage());
            return draftResponse;
        }
    }

    /**
     * 构建工具执行记录块，按工具类型差异化截断。
     */
    private String buildToolEvidence(List<AiAgentToolExecHelper.ToolExecRecord> toolRecords) {
        if (toolRecords == null || toolRecords.isEmpty()) return "";
        StringBuilder teb = new StringBuilder("\n【工具执行记录（你必须对照这些记录审查草稿）】\n");
        for (AiAgentToolExecHelper.ToolExecRecord rec : toolRecords) {
            int truncateLen = isWriteTool(rec.toolName) ? EVIDENCE_TRUNCATE_WRITE : EVIDENCE_TRUNCATE_QUERY;
            String ev = rec.evidence != null && rec.evidence.length() > truncateLen
                    ? rec.evidence.substring(0, truncateLen) + "…" : rec.evidence;
            teb.append("- 工具: ").append(rec.toolName)
               .append(" | 结果: ").append(ev).append("\n");
        }
        teb.append("（以上是主代理实际调用的工具和返回数据，草稿中的每个数字/事实必须能溯源到这些工具结果）\n");
        return teb.toString();
    }

    /**
     * 判断是否为写入/操作类工具（结果通常较短，截断长度可小）。
     */
    private boolean isWriteTool(String toolName) {
        if (toolName == null) return false;
        String lower = toolName.toLowerCase();
        return lower.contains("create") || lower.contains("update") || lower.contains("delete")
                || lower.contains("push") || lower.contains("save") || lower.contains("submit")
                || lower.contains("confirm") || lower.contains("cancel") || lower.contains("assign");
    }

    /**
     * 构建 Critic system prompt — 增强服装行业知识 + 供应链专业校验。
     */
    private String buildCriticSystemPrompt() {
        return "你是系统中的【Critic（批评检查官）】智能体，专门服务服装供应链行业。\n"
            + "主代理(Planner)针对用户的原问题生成了一份初步答案。\n"
            + "你拥有完整的工具执行记录，可以判断草稿中的数据是否真实。\n\n"

            + "【服装供应链领域知识（审查时必须参照）】\n"
            + "- 款式(SKC)是颜色+尺码的组合单位，一个款号下可以有多个SKC\n"
            + "- 生产流程：样衣开发→下单→采购→裁剪→缝制→后整→质检→发货\n"
            + "- 工序单价单位是\"元/件\"，面料用量单位是\"码/米\"，工资=件数×工序单价\n"
            + "- 状态术语：待开工/生产中/已完工/已发货/已质检，不能混用\n"
            + "- 工厂产能=工人数×工时×工序效率，延期预警要看\"剩余天数 vs 剩余产能\"\n"
            + "- 次品率=次品数/总数，超标(>3%)必须提醒\n"
            + "- BOM清单包含面料/辅料/包材，缺料会导致生产停滞\n\n"

            + "审查规则（按优先级）：\n"
            + "1. 数据溯源：草稿中的每个数字、订单号、工厂名、状态等事实，必须在工具执行记录中找到对应来源。"
            + "找不到来源的数字/事实，必须抹除，替换为'系统暂无该数据'或标注为推测。\n"
            + "2. 逻辑一致性：草稿的结论是否与工具数据逻辑一致？"
            + "如工具说进度60%，草稿说'即将完成'，修正为'进度60%，按当前速度预计还需X天'。\n"
            + "3. 遗漏检测：用户问了A，草稿回答了A但忽略了工具数据中与A强相关的B，补充B。"
            + "比如用户问订单进度，工具返回了该工厂近3天无扫码，草稿没提，必须补充。\n"
            + "4. 行业常识校验：\n"
            + "   - 件数/数量必须是正整数，不能出现小数\n"
            + "   - 单价/金额保留2位小数，不能出现超过4位小数\n"
            + "   - 百分比范围0-100，不能出现>100%的进度\n"
            + "   - 日期格式统一为\"X月X日\"或\"YYYY-MM-DD\"，不混用\n"
            + "   - 款号格式通常为字母+数字组合(如BR26C1S0574B)，不能截断或变形\n"
            + "5. 风险标注：草稿建议的操作可能产生什么副作用？如果有，标注出来。\n"
            + "   - 涉及取消订单/删除数据 → 必须\"⚠️ 高风险\"标注\n"
            + "   - 涉及调整单价/工资 → 必须\"⚠️ 需财务确认\"标注\n"
            + "6. 替代方案：如果草稿的方案有明显风险，给出1个替代方案。\n"
            + "7. 修复态度：不能过于生硬或机械，确保回答体贴且有条理。\n"
            + "8. 消除英文：如果回答中出现了英文编程术语（如 java.time.LocalDateTime、IN_PROGRESS、progressNode 等）、"
            + "英文数据库字段名（如 patternStatus、factoryName、orderQuantity 等）、或英文状态码，"
            + "必须将其替换为对应的中文表达。禁止在最终回答中保留任何面向用户不可读的英文技术名词。\n\n"

            + "输出要求：直接输出**修改完善后的最终正文**，不要有任何如'修复后的答案'等前缀。如果觉得没问题，原样返回即可。";
    }

    /** 前缀清理正则（覆盖更多 LLM 输出格式） */
    private static final Pattern PREFIX_CLEAN_PATTERN = Pattern.compile(
            "^\\s*(修复后的答案[是：:]|修复后的正文[：:]|修改后的答案[是：:]|修改后的正文[：:]|最终答案[是：:]|审查后的回答[：:])\\s*",
            Pattern.CASE_INSENSITIVE);

    private String doReview(String systemPrompt, String userPrompt, String fallbackDraft) {
        try {
            IntelligenceInferenceResult result = inferenceOrchestrator.chat("critic_review", systemPrompt, userPrompt);
            if (result != null && result.isSuccess() && result.getContent() != null && !result.getContent().isBlank()) {
                String revised = PREFIX_CLEAN_PATTERN.matcher(result.getContent().trim()).replaceFirst("");

                if (!revised.equals(fallbackDraft)) {
                    log.info("[AiCritic] 反思修正了原结果（含数据溯源审查）");
                } else {
                    log.info("[AiCritic] 原结果通过审查，无修改");
                }
                return revised;
            }
        } catch (Exception e) {
            log.warn("[AiCritic] 审查LLM调用失败: {}", e.getMessage());
        }
        return fallbackDraft;
    }
}
