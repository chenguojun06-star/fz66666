package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.entity.AiConversationMemory;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.entity.MemoryBankEntry;
import com.fashion.supplychain.intelligence.mapper.AiConversationMemoryMapper;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import com.fashion.supplychain.intelligence.mapper.MemoryBankEntryMapper;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * soul.py 多锚点身份重建服务（五层记忆模型第七章）
 *
 * <p>4 个锚点：
 * <ul>
 *   <li>工厂画像 — t_factory 表（supplier_tier 非空记录）</li>
 *   <li>用户偏好 — t_user_profile 表（由 UserProfileEvolutionOrchestrator 维护）</li>
 *   <li>历史决策 — t_memory_bank_entry(category=decision_log) + memory-bank/decisionLog.md</li>
 *   <li>长期反思记忆 — t_ai_long_memory(layer=REFLECTIVE)</li>
 * </ul>
 *
 * <p>设计原则：
 * <ul>
 *   <li>只重建"已确认丢失"的锚点（count=0 或文件不存在）</li>
 *   <li>decisionLog 可完整重建（从 memory-bank/decisionLog.md 回灌，无 LLM）</li>
 *   <li>其他 3 个锚点：P2-1 升级为 LLM 重建（2026-07-28）</li>
 *   <li>所有操作多租户隔离（P0 铁律 4）</li>
 *   <li>Service 层无 @Transactional（D-001），单条失败不影响其他条</li>
 *   <li>LLM 调用失败/服务不可用 → 退化为告警模式（不抛异常）</li>
 * </ul>
 *
 * @author xiaoyun
 * @since 2026-07-26
 * @version P2-1 2026-07-28 4 锚点 LLM 重建
 */
@Slf4j
@Service
@Lazy
public class SoulAnchorRebuildService {

    private static final String CATEGORY_DECISION_LOG = "decision_log";
    private static final String CATEGORY_FACTORY_PROFILE = "factory_profile";
    private static final String CATEGORY_USER_PROFILE = "user_profile";
    private static final String LAYER_REFLECTIVE = "REFLECTIVE";
    private static final String LAYER_FACT = "FACT";
    private static final String SUBJECT_TYPE_FACTORY = "factory";

    /** LLM 重建单租户最大样本数（防止 token 超限） */
    private static final int LLM_SAMPLE_LIMIT = 20;

    /** LLM 重建场景标识 */
    private static final String SCENE_SOUL_REBUILD = "memory_summarize";

    @Autowired private FactoryMapper factoryMapper;
    @Autowired private AiLongMemoryMapper aiLongMemoryMapper;
    @Autowired private MemoryBankEntryMapper memoryBankEntryMapper;
    @Autowired private AiConversationMemoryMapper aiConversationMemoryMapper;
    @Autowired(required = false) private MemoryBankDbService memoryBankDbService;
    /** P2-1：LLM 推理服务（用于 4 锚点 LLM 重建） */
    @Autowired(required = false) @Lazy
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    /** P2-1：Qdrant 向量服务（用于从 L5 归档召回反思素材） */
    @Autowired(required = false) @Lazy
    private QdrantService qdrantService;

    @Value("${fashion.memory-bank.dir:memory-bank}")
    private String memoryBankDir;

    /** P2-1 开关：是否启用 LLM 重建（关闭则只走文件/告警路径，与原逻辑一致） */
    @Value("${xiaoyun.soul.llm-rebuild.enabled:true}")
    private boolean llmRebuildEnabled;

    /**
     * 检测指定租户的 4 个锚点完整性
     *
     * @param tenantId 租户ID（必填，P0 铁律 4）
     * @return 4 个锚点的检测结果（exist + count + hint）
     */
    public SoulAnchorStatus detectAnchors(Long tenantId) {
        SoulAnchorStatus status = new SoulAnchorStatus();
        status.setTenantId(tenantId);
        status.setCheckTime(LocalDateTime.now());

        // 锚点1: 工厂画像 — t_factory 表 supplier_tier 非空记录数
        long factoryCount = countFactoryProfiles(tenantId);
        status.setFactoryProfileExists(factoryCount > 0);
        status.setFactoryProfileCount(factoryCount);

        // 锚点2: 用户偏好 — t_user_profile 表记录数
        long userProfileCount = countUserProfiles(tenantId);
        status.setUserProfileExists(userProfileCount > 0);
        status.setUserProfileCount(userProfileCount);

        // 锚点3: 历史决策 — t_memory_bank_entry(category=decision_log)
        long decisionLogCount = countDecisionLogs(tenantId);
        status.setDecisionLogExists(decisionLogCount > 0);
        status.setDecisionLogCount(decisionLogCount);

        // 锚点4: 长期反思记忆 — t_ai_long_memory(layer=REFLECTIVE)
        long reflectiveCount = countReflectiveMemories(tenantId);
        status.setReflectiveMemExists(reflectiveCount > 0);
        status.setReflectiveMemCount(reflectiveCount);

        status.setAllExists(status.isFactoryProfileExists() && status.isUserProfileExists()
                && status.isDecisionLogExists() && status.isReflectiveMemExists());
        return status;
    }

    /**
     * 重建缺失的锚点
     *
     * <p>P2-1 升级（2026-07-28）：4 锚点 LLM 重建
     * <ul>
     *   <li>decisionLog: 从 memory-bank/decisionLog.md 回灌（完整重建，无 LLM）</li>
     *   <li>factoryProfile: 从 AiLongMemory(FACT, subjectType=factory) 调用 LLM 总结工厂画像</li>
     *   <li>userProfile: 从 t_ai_conversation_memory 历史摘要调用 LLM 推断用户偏好</li>
     *   <li>reflectiveMem: 从 L5 Archival 归档调用 LLM 反思重写</li>
     * </ul>
     *
     * <p>容错：LLM 调用失败/服务不可用 → 退化为告警模式（不影响其他锚点）
     *
     * @param tenantId 租户ID
     * @return 重建结果（含每个锚点的处理动作）
     */
    public RebuildResult rebuildMissingAnchors(Long tenantId) {
        RebuildResult result = new RebuildResult();
        result.setTenantId(tenantId);
        result.setRebuildTime(LocalDateTime.now());
        SoulAnchorStatus status = detectAnchors(tenantId);
        result.setStatusBefore(status);

        List<String> actions = new ArrayList<>();

        // 重建 decisionLog（可完整重建，无需 LLM）
        if (!status.isDecisionLogExists()) {
            int imported = rebuildDecisionLogFromFile(tenantId);
            actions.add(String.format("decisionLog: 从文件回灌 %d 条决策记录", imported));
            result.setDecisionLogRebuilt(imported > 0);
        }

        // P2-1：工厂画像 LLM 重建
        if (!status.isFactoryProfileExists()) {
            int rebuilt = rebuildFactoryProfileWithLLM(tenantId);
            if (rebuilt > 0) {
                actions.add(String.format("factoryProfile: LLM 重建 %d 条工厂画像", rebuilt));
                result.setFactoryProfileRebuilt(true);
            } else {
                actions.add("factoryProfile: LLM 重建失败或未启用，需人工录入工厂基础数据");
                log.warn("[SoulAnchor] 工厂画像 LLM 重建未成功 tenantId={}", tenantId);
            }
        }

        // P2-1：用户偏好 LLM 重建
        if (!status.isUserProfileExists()) {
            int rebuilt = rebuildUserProfileWithLLM(tenantId);
            if (rebuilt > 0) {
                actions.add(String.format("userProfile: LLM 重建 %d 条用户偏好", rebuilt));
                result.setUserProfileRebuilt(true);
            } else {
                actions.add("userProfile: LLM 重建失败或会话历史不足，将在用户下次对话时自动重建");
                log.warn("[SoulAnchor] 用户偏好 LLM 重建未成功 tenantId={}", tenantId);
            }
        }

        // P2-1：反思记忆 LLM 重建
        if (!status.isReflectiveMemExists()) {
            int rebuilt = rebuildReflectiveMemWithLLM(tenantId);
            if (rebuilt > 0) {
                actions.add(String.format("reflectiveMem: LLM 重建 %d 条反思记忆", rebuilt));
                result.setReflectiveMemRebuilt(true);
            } else {
                actions.add("reflectiveMem: L5 归档无素材或 LLM 重建失败，跳过");
                log.warn("[SoulAnchor] 反思记忆 LLM 重建未成功 tenantId={}", tenantId);
            }
        }

        result.setActions(actions);
        result.setStatusAfter(detectAnchors(tenantId));
        return result;
    }

    /**
     * 重建 decisionLog 锚点（从 memory-bank/decisionLog.md 回灌）
     *
     * <p>读取项目根目录下的 memory-bank/decisionLog.md，按 "## D-XXX" 分段，
     * 每段作为一个 decision_log 条目写入 t_memory_bank_entry。
     *
     * <p>幂等：已存在的 entry_key 跳过（按 tenantId+category+entryKey 唯一）。
     */
    public int rebuildDecisionLogFromFile(Long tenantId) {
        if (memoryBankDbService == null) {
            log.warn("[SoulAnchor] MemoryBankDbService 未就绪，跳过 decisionLog 重建");
            return 0;
        }
        try {
            Path file = Paths.get(memoryBankDir, "decisionLog.md");
            if (!Files.exists(file)) {
                log.warn("[SoulAnchor] decisionLog.md 不存在: {}", file);
                return 0;
            }
            String content = Files.readString(file, StandardCharsets.UTF_8);
            // 简单按 "## D-" 分段（与 MemoryBankMigrationRunner 策略一致）
            String[] sections = content.split("(?m)^## D-");
            int imported = 0;
            for (String section : sections) {
                String trimmed = section.trim();
                if (trimmed.isEmpty()) continue;
                // 第一段可能是文件头（无 D- 前缀），跳过
                // split 已去掉 "## D-"，所以 trimmed 应该是 "001 标题\n内容..."
                if (!Character.isDigit(trimmed.charAt(0))) continue;
                // 提取 entryKey（第一行第一个 token，如 "001"）
                String firstLine = trimmed.split("\\R", 2)[0];
                String entryKey = firstLine.split("[\\s\\(（]", 2)[0].trim();
                if (entryKey.isEmpty()) continue;
                String fullKey = "D-" + entryKey;
                // 提取标题（第一行剩余部分）
                String title = firstLine.length() > entryKey.length()
                        ? firstLine.substring(entryKey.length()).trim() : fullKey;
                try {
                    memoryBankDbService.upsertEntry(tenantId, CATEGORY_DECISION_LOG, fullKey,
                            title, trimmed, null);
                    imported++;
                } catch (Exception e) {
                    log.warn("[SoulAnchor] decisionLog 单条回灌失败 key={}: {}", fullKey, e.getMessage());
                }
            }
            log.info("[SoulAnchor] decisionLog 回灌完成 tenant={} imported={}", tenantId, imported);
            return imported;
        } catch (Exception e) {
            log.warn("[SoulAnchor] decisionLog 重建失败 tenant={}: {}", tenantId, e.getMessage());
            return 0;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // P2-1：4 锚点 LLM 重建（2026-07-28 升级）
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * P2-1：工厂画像 LLM 重建
     *
     * <p>从 AiLongMemory(FACT, subjectType=factory) 拉取所有工厂相关事实，
     * 拼装 prompt 调 LLM 总结工厂画像（专长/产能/历史交付/质量等级），
     * 写入 t_memory_bank_entry(category=factory_profile)。
     *
     * <p>容错：无素材/LLM不可用/调用失败 → 返回 0，不抛异常
     *
     * @param tenantId 租户ID
     * @return 重建条数（0 表示未重建）
     */
    public int rebuildFactoryProfileWithLLM(Long tenantId) {
        if (!llmRebuildEnabled || inferenceOrchestrator == null || memoryBankDbService == null) {
            log.debug("[SoulAnchor] 工厂画像 LLM 重建跳过（开关关闭或依赖未就绪）tenantId={}", tenantId);
            return 0;
        }
        try {
            // 拉取工厂相关事实
            List<AiLongMemory> facts = aiLongMemoryMapper.selectList(new LambdaQueryWrapper<AiLongMemory>()
                    .eq(AiLongMemory::getTenantId, tenantId)
                    .eq(AiLongMemory::getLayer, LAYER_FACT)
                    .eq(AiLongMemory::getSubjectType, SUBJECT_TYPE_FACTORY)
                    .eq(AiLongMemory::getDeleteFlag, 0)
                    .orderByDesc(AiLongMemory::getCreateTime)
                    .last("LIMIT " + LLM_SAMPLE_LIMIT));

            if (facts == null || facts.isEmpty()) {
                log.info("[SoulAnchor] 工厂画像 LLM 重建无素材 tenantId={}", tenantId);
                return 0;
            }

            // 拼装 prompt
            StringBuilder factBlock = new StringBuilder();
            for (AiLongMemory f : facts) {
                factBlock.append("- ").append(f.getContent() != null ? f.getContent() : "")
                        .append("\n");
            }

            String systemPrompt = "你是工厂画像分析助手。根据输入的工厂事实记录，"
                    + "总结该租户的工厂画像，包含：专长品类、产能规模、历史交付表现、质量等级、合作偏好。"
                    + "输出 JSON 格式：{\"specialty\":\"\",\"capacity\":\"\",\"delivery\":\"\",\"quality\":\"\",\"preference\":\"\"}";

            String userMessage = "租户ID: " + tenantId + "\n工厂事实记录:\n" + factBlock;

            IntelligenceInferenceResult result = inferenceOrchestrator.chat(
                    SCENE_SOUL_REBUILD, systemPrompt, userMessage);

            if (result == null || !result.isSuccess() || result.getContent() == null
                    || result.getContent().isBlank()) {
                log.warn("[SoulAnchor] 工厂画像 LLM 调用失败 tenantId={}: {}", tenantId,
                        result != null ? result.getErrorMessage() : "null result");
                return 0;
            }

            // 写入 memoryBankEntry
            String entryKey = "factory_profile_llm_" + tenantId;
            String title = "LLM 重建工厂画像（基于 " + facts.size() + " 条事实）";
            memoryBankDbService.upsertEntry(tenantId, CATEGORY_FACTORY_PROFILE, entryKey,
                    title, result.getContent(), null);
            log.info("[SoulAnchor] 工厂画像 LLM 重建成功 tenantId={} facts={}", tenantId, facts.size());
            return 1;
        } catch (Exception e) {
            log.warn("[SoulAnchor] 工厂画像 LLM 重建异常 tenantId={}: {}", tenantId, e.getMessage());
            return 0;
        }
    }

    /**
     * P2-1：用户偏好 LLM 重建
     *
     * <p>从 t_ai_conversation_memory 拉取最近会话摘要，调 LLM 推断用户偏好
     * （沟通风格/关注点/权限习惯），写入 t_memory_bank_entry(category=user_profile)。
     *
     * <p>容错：会话历史不足/LLM失败 → 返回 0，不抛异常
     *
     * @param tenantId 租户ID
     * @return 重建条数（0 表示未重建）
     */
    public int rebuildUserProfileWithLLM(Long tenantId) {
        if (!llmRebuildEnabled || inferenceOrchestrator == null || memoryBankDbService == null) {
            log.debug("[SoulAnchor] 用户偏好 LLM 重建跳过（开关关闭或依赖未就绪）tenantId={}", tenantId);
            return 0;
        }
        try {
            // 拉取最近会话摘要
            List<AiConversationMemory> summaries = aiConversationMemoryMapper.selectList(
                    new LambdaQueryWrapper<AiConversationMemory>()
                            .eq(AiConversationMemory::getTenantId, tenantId)
                            .eq(AiConversationMemory::getDeleteFlag, 0)
                            .orderByDesc(AiConversationMemory::getCreateTime)
                            .last("LIMIT " + LLM_SAMPLE_LIMIT));

            if (summaries == null || summaries.isEmpty()) {
                log.info("[SoulAnchor] 用户偏好 LLM 重建无会话历史 tenantId={}", tenantId);
                return 0;
            }

            // 拼装 prompt
            StringBuilder summaryBlock = new StringBuilder();
            for (AiConversationMemory s : summaries) {
                summaryBlock.append("- ").append(s.getMemorySummary() != null ? s.getMemorySummary() : "")
                        .append("\n");
            }

            String systemPrompt = "你是用户偏好分析助手。根据输入的会话摘要，"
                    + "推断用户偏好，包含：沟通风格（简洁/详细）、关注点（生产/质量/财务/交期）、"
                    + "权限习惯（只读/写操作）、决策风格（数据驱动/直觉）。"
                    + "输出 JSON 格式：{\"communicationStyle\":\"\",\"focusArea\":\"\",\"permissionHabit\":\"\",\"decisionStyle\":\"\"}";

            String userMessage = "租户ID: " + tenantId + "\n最近会话摘要:\n" + summaryBlock;

            IntelligenceInferenceResult result = inferenceOrchestrator.chat(
                    SCENE_SOUL_REBUILD, systemPrompt, userMessage);

            if (result == null || !result.isSuccess() || result.getContent() == null
                    || result.getContent().isBlank()) {
                log.warn("[SoulAnchor] 用户偏好 LLM 调用失败 tenantId={}: {}", tenantId,
                        result != null ? result.getErrorMessage() : "null result");
                return 0;
            }

            // 写入 memoryBankEntry
            String entryKey = "user_profile_llm_" + tenantId;
            String title = "LLM 重建用户偏好（基于 " + summaries.size() + " 条会话摘要）";
            memoryBankDbService.upsertEntry(tenantId, CATEGORY_USER_PROFILE, entryKey,
                    title, result.getContent(), null);
            log.info("[SoulAnchor] 用户偏好 LLM 重建成功 tenantId={} summaries={}", tenantId, summaries.size());
            return 1;
        } catch (Exception e) {
            log.warn("[SoulAnchor] 用户偏好 LLM 重建异常 tenantId={}: {}", tenantId, e.getMessage());
            return 0;
        }
    }

    /**
     * P2-1：反思记忆 LLM 重建
     *
     * <p>从 L5 Archival Qdrant 归档召回近期冷数据，调 LLM 做反思性总结，
     * 写入 t_ai_long_memory(layer=REFLECTIVE)。
     *
     * <p>容错：Qdrant不可用/无归档/LLM失败 → 返回 0，不抛异常
     *
     * @param tenantId 租户ID
     * @return 重建条数（0 表示未重建）
     */
    public int rebuildReflectiveMemWithLLM(Long tenantId) {
        if (!llmRebuildEnabled || inferenceOrchestrator == null || qdrantService == null) {
            log.debug("[SoulAnchor] 反思记忆 LLM 重建跳过（开关关闭或依赖未就绪）tenantId={}", tenantId);
            return 0;
        }
        try {
            // 用通用关键词召回 L5 归档
            List<com.fashion.supplychain.intelligence.service.QdrantService.ScoredPoint> archivals =
                    qdrantService.search(tenantId, "工厂历史会话反思总结", LLM_SAMPLE_LIMIT);

            if (archivals == null || archivals.isEmpty()) {
                log.info("[SoulAnchor] 反思记忆 LLM 重建无 L5 归档素材 tenantId={}", tenantId);
                return 0;
            }

            // 拼装 prompt
            StringBuilder archiveBlock = new StringBuilder();
            for (com.fashion.supplychain.intelligence.service.QdrantService.ScoredPoint sp : archivals) {
                String summary = sp.getPayload() != null ? sp.getPayload().get("summary") : null;
                if (summary != null && !summary.isBlank()) {
                    archiveBlock.append("- ").append(summary).append("\n");
                }
            }

            if (archiveBlock.length() == 0) {
                log.info("[SoulAnchor] 反思记忆 LLM 重建归档素材均为空 tenantId={}", tenantId);
                return 0;
            }

            String systemPrompt = "你是反思记忆重建助手。根据输入的归档历史摘要，"
                    + "提炼该租户的反思性记忆，包含：经验教训、改进方向、长期模式、需规避的陷阱。"
                    + "输出 3-5 条要点，每条不超过 100 字。";

            String userMessage = "租户ID: " + tenantId + "\n归档历史摘要:\n" + archiveBlock;

            IntelligenceInferenceResult result = inferenceOrchestrator.chat(
                    SCENE_SOUL_REBUILD, systemPrompt, userMessage);

            if (result == null || !result.isSuccess() || result.getContent() == null
                    || result.getContent().isBlank()) {
                log.warn("[SoulAnchor] 反思记忆 LLM 调用失败 tenantId={}: {}", tenantId,
                        result != null ? result.getErrorMessage() : "null result");
                return 0;
            }

            // 写入 AiLongMemory(REFLECTIVE)
            AiLongMemory reflectiveMem = new AiLongMemory();
            reflectiveMem.setTenantId(tenantId);
            reflectiveMem.setLayer(LAYER_REFLECTIVE);
            reflectiveMem.setSubjectType("soul");
            reflectiveMem.setSubjectId(String.valueOf(tenantId));
            reflectiveMem.setSubjectName("LLM 重建反思记忆");
            reflectiveMem.setContent(result.getContent());
            reflectiveMem.setConfidence(new java.math.BigDecimal("0.70"));
            reflectiveMem.setValidFrom(LocalDateTime.now());
            reflectiveMem.setHitCount(0);
            reflectiveMem.setLastHitTime(LocalDateTime.now());
            reflectiveMem.setSourceSessionId("soul-rebuild-" + System.currentTimeMillis());
            reflectiveMem.setVerified(0);
            reflectiveMem.setDeleteFlag(0);
            reflectiveMem.setCreateTime(LocalDateTime.now());
            aiLongMemoryMapper.insert(reflectiveMem);

            log.info("[SoulAnchor] 反思记忆 LLM 重建成功 tenantId={} archivals={}",
                    tenantId, archivals.size());
            return 1;
        } catch (Exception e) {
            log.warn("[SoulAnchor] 反思记忆 LLM 重建异常 tenantId={}: {}", tenantId, e.getMessage());
            return 0;
        }
    }

    private long countFactoryProfiles(Long tenantId) {
        try {
            return factoryMapper.selectCount(new LambdaQueryWrapper<Factory>()
                    .eq(Factory::getTenantId, tenantId)
                    .eq(Factory::getDeleteFlag, 0)
                    .eq(Factory::getSupplierType, "OUTSOURCE")
                    .isNotNull(Factory::getSupplierTier));
        } catch (Exception e) {
            log.warn("[SoulAnchor] countFactoryProfiles 失败 tenant={}: {}", tenantId, e.getMessage());
            return 0;
        }
    }

    private long countUserProfiles(Long tenantId) {
        // 用户偏好存储在 t_user_profile（由 UserProfileEvolutionOrchestrator 维护）
        // 此处通过 memoryBankEntry 的 user_profile category 计数（兼容现有数据）
        try {
            return memoryBankEntryMapper.selectCount(new LambdaQueryWrapper<MemoryBankEntry>()
                    .eq(MemoryBankEntry::getTenantId, tenantId)
                    .eq(MemoryBankEntry::getCategory, "user_profile"));
        } catch (Exception e) {
            log.debug("[SoulAnchor] countUserProfiles 失败 tenant={}: {}", tenantId, e.getMessage());
            return 0;
        }
    }

    private long countDecisionLogs(Long tenantId) {
        try {
            return memoryBankEntryMapper.selectCount(new LambdaQueryWrapper<MemoryBankEntry>()
                    .eq(MemoryBankEntry::getTenantId, tenantId)
                    .eq(MemoryBankEntry::getCategory, CATEGORY_DECISION_LOG));
        } catch (Exception e) {
            log.warn("[SoulAnchor] countDecisionLogs 失败 tenant={}: {}", tenantId, e.getMessage());
            return 0;
        }
    }

    private long countReflectiveMemories(Long tenantId) {
        try {
            return aiLongMemoryMapper.selectCount(new LambdaQueryWrapper<AiLongMemory>()
                    .eq(AiLongMemory::getTenantId, tenantId)
                    .eq(AiLongMemory::getLayer, LAYER_REFLECTIVE));
        } catch (Exception e) {
            log.warn("[SoulAnchor] countReflectiveMemories 失败 tenant={}: {}", tenantId, e.getMessage());
            return 0;
        }
    }

    /** 锚点状态检测结果 */
    @Data
    public static class SoulAnchorStatus {
        private Long tenantId;
        private LocalDateTime checkTime;
        private boolean factoryProfileExists;
        private long factoryProfileCount;
        private boolean userProfileExists;
        private long userProfileCount;
        private boolean decisionLogExists;
        private long decisionLogCount;
        private boolean reflectiveMemExists;
        private long reflectiveMemCount;
        private boolean allExists;

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tenantId", tenantId);
            m.put("checkTime", checkTime);
            m.put("factoryProfile", Map.of("exists", factoryProfileExists, "count", factoryProfileCount));
            m.put("userProfile", Map.of("exists", userProfileExists, "count", userProfileCount));
            m.put("decisionLog", Map.of("exists", decisionLogExists, "count", decisionLogCount));
            m.put("reflectiveMem", Map.of("exists", reflectiveMemExists, "count", reflectiveMemCount));
            m.put("allExists", allExists);
            return m;
        }
    }

    /** 重建结果 */
    @Data
    public static class RebuildResult {
        private Long tenantId;
        private LocalDateTime rebuildTime;
        private SoulAnchorStatus statusBefore;
        private SoulAnchorStatus statusAfter;
        private List<String> actions;
        private boolean decisionLogRebuilt;
        /** P2-1：工厂画像 LLM 重建结果 */
        private boolean factoryProfileRebuilt;
        /** P2-1：用户偏好 LLM 重建结果 */
        private boolean userProfileRebuilt;
        /** P2-1：反思记忆 LLM 重建结果 */
        private boolean reflectiveMemRebuilt;

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tenantId", tenantId);
            m.put("rebuildTime", rebuildTime);
            m.put("statusBefore", statusBefore != null ? statusBefore.toMap() : null);
            m.put("statusAfter", statusAfter != null ? statusAfter.toMap() : null);
            m.put("actions", actions);
            m.put("decisionLogRebuilt", decisionLogRebuilt);
            m.put("factoryProfileRebuilt", factoryProfileRebuilt);
            m.put("userProfileRebuilt", userProfileRebuilt);
            m.put("reflectiveMemRebuilt", reflectiveMemRebuilt);
            return m;
        }
    }
}
