package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.entity.MemoryBankEntry;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import com.fashion.supplychain.intelligence.mapper.MemoryBankEntryMapper;
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
 *   <li>decisionLog 可完整重建（从 memory-bank/decisionLog.md 回灌）</li>
 *   <li>其他锚点：检测+告警+记录，完整重建需 LLM 推理（P3 阶段实现）</li>
 *   <li>所有操作多租户隔离（P0 铁律 4）</li>
 *   <li>Service 层无 @Transactional（D-001），单条失败不影响其他条</li>
 * </ul>
 *
 * @author xiaoyun
 * @since 2026-07-26
 */
@Slf4j
@Service
@Lazy
public class SoulAnchorRebuildService {

    private static final String CATEGORY_DECISION_LOG = "decision_log";
    private static final String LAYER_REFLECTIVE = "REFLECTIVE";

    @Autowired private FactoryMapper factoryMapper;
    @Autowired private AiLongMemoryMapper aiLongMemoryMapper;
    @Autowired private MemoryBankEntryMapper memoryBankEntryMapper;
    @Autowired(required = false) private MemoryBankDbService memoryBankDbService;

    @Value("${fashion.memory-bank.dir:memory-bank}")
    private String memoryBankDir;

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
     * <p>当前实现：
     * <ul>
     *   <li>decisionLog: 从 memory-bank/decisionLog.md 回灌（完整重建）</li>
     *   <li>其他: 仅 log.warn 告警，完整重建需 LLM 推理（P3 阶段）</li>
     * </ul>
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

        // 重建 decisionLog（可完整重建）
        if (!status.isDecisionLogExists()) {
            int imported = rebuildDecisionLogFromFile(tenantId);
            actions.add(String.format("decisionLog: 从文件回灌 %d 条决策记录", imported));
            result.setDecisionLogRebuilt(imported > 0);
        }

        // 其他锚点告警（完整重建需 LLM，P3 阶段实现）
        if (!status.isFactoryProfileExists()) {
            actions.add("factoryProfile: 缺失，需人工录入工厂基础数据（t_factory.supplier_tier）以启用画像");
            log.warn("[SoulAnchor] 工厂画像锚点缺失 tenantId={}，需人工录入工厂基础数据", tenantId);
        }
        if (!status.isUserProfileExists()) {
            actions.add("userProfile: 缺失，将在用户下次对话时由 UserProfileEvolutionOrchestrator 自动重建");
            log.warn("[SoulAnchor] 用户偏好锚点缺失 tenantId={}，将在下次对话时自动重建", tenantId);
        }
        if (!status.isReflectiveMemExists()) {
            actions.add("reflectiveMem: 缺失，可从 L5 Archival 归档召回（需 MemoryArchiveService 配合）");
            log.warn("[SoulAnchor] 反思记忆锚点缺失 tenantId={}，可从 L5 归档召回", tenantId);
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

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tenantId", tenantId);
            m.put("rebuildTime", rebuildTime);
            m.put("statusBefore", statusBefore != null ? statusBefore.toMap() : null);
            m.put("statusAfter", statusAfter != null ? statusAfter.toMap() : null);
            m.put("actions", actions);
            m.put("decisionLogRebuilt", decisionLogRebuilt);
            return m;
        }
    }
}
