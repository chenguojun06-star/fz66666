package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AgentMemoryCore;
import com.fashion.supplychain.intelligence.entity.MemoryBankEntry;
import com.fashion.supplychain.intelligence.mapper.AgentMemoryCoreMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;

@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class MemoryBankService {

    private final AgentMemoryCoreMapper memoryCoreMapper;
    /** 用 ObjectProvider 注入避免循环依赖（DbService 也可能反向引用本类） */
    private final ObjectProvider<MemoryBankDbService> memoryBankDbServiceProvider;
    private final ObjectProvider<MemoryBankRelationService> memoryBankRelationServiceProvider;

    private static final String AGENT_ID = "xiaoyun";
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final ConcurrentHashMap<String, ReentrantLock> writeLocks = new ConcurrentHashMap<>();

    private ReentrantLock getLock(Long tenantId, Category category) {
        return writeLocks.computeIfAbsent(
                tenantId + ":" + category.key, k -> new ReentrantLock());
    }

    public enum Category {
        PRODUCT_CONTEXT("product_context", "项目全景：目标、架构、关键特性"),
        ACTIVE_CONTEXT("active_context", "当前会话快照：焦点、最近变更、待解决问题"),
        SYSTEM_PATTERNS("system_patterns", "编码模式、架构模式、测试模式"),
        DECISION_LOG("decision_log", "架构与实现决策记录"),
        PROGRESS("progress", "任务看板：已完成/进行中/下一步");

        final String key;
        final String description;

        Category(String key, String description) {
            this.key = key;
            this.description = description;
        }

        public String getKey() { return key; }
        public String getDescription() { return description; }
    }

    public String read(Long tenantId, Category category) {
        return memoryCoreMapper.selectList(
                new LambdaQueryWrapper<AgentMemoryCore>()
                        .eq(AgentMemoryCore::getTenantId, tenantId)
                        .eq(AgentMemoryCore::getAgentId, AGENT_ID)
                        .eq(AgentMemoryCore::getMemoryKey, category.key)
        ).stream().findFirst().map(AgentMemoryCore::getMemoryValue).orElse("");
    }

    public Map<String, String> readAll(Long tenantId) {
        List<String> keys = Arrays.stream(Category.values()).map(c -> c.key).toList();
        List<AgentMemoryCore> records = memoryCoreMapper.selectList(
                new LambdaQueryWrapper<AgentMemoryCore>()
                        .eq(AgentMemoryCore::getTenantId, tenantId)
                        .eq(AgentMemoryCore::getAgentId, AGENT_ID)
                        .in(AgentMemoryCore::getMemoryKey, keys)
        );
        Map<String, String> result = new LinkedHashMap<>();
        for (Category cat : Category.values()) {
            result.put(cat.key, records.stream()
                    .filter(r -> cat.key.equals(r.getMemoryKey()))
                    .findFirst().map(AgentMemoryCore::getMemoryValue).orElse(""));
        }
        return result;
    }

    public void write(Long tenantId, Category category, String content) {
        if (content == null || content.isBlank()) return;
        ReentrantLock lock = getLock(tenantId, category);
        lock.lock();
        try {
            List<AgentMemoryCore> existing = memoryCoreMapper.selectList(
                    new LambdaQueryWrapper<AgentMemoryCore>()
                            .eq(AgentMemoryCore::getTenantId, tenantId)
                            .eq(AgentMemoryCore::getAgentId, AGENT_ID)
                            .eq(AgentMemoryCore::getMemoryKey, category.key)
            );
            if (existing.isEmpty()) {
                AgentMemoryCore record = new AgentMemoryCore();
                record.setTenantId(tenantId);
                record.setAgentId(AGENT_ID);
                record.setMemoryKey(category.key);
                record.setMemoryValue(content);
                record.setUpdatedAt(LocalDateTime.now());
                memoryCoreMapper.insert(record);
            } else {
                AgentMemoryCore record = existing.get(0);
                record.setMemoryValue(content);
                record.setUpdatedAt(LocalDateTime.now());
                memoryCoreMapper.updateById(record);
            }
            log.info("[MemoryBank] 租户={} 类别={} 已更新 {}字符", tenantId, category.key, content.length());
            // 双写数据库（ConPort 模式，失败不影响主流程）
            try {
                MemoryBankDbService dbService = memoryBankDbServiceProvider.getIfAvailable();
                if (dbService != null) {
                    dbService.upsertEntry(tenantId, category.key, category.key,
                            category.description, content, null);
                }
            } catch (Exception e) {
                log.debug("[MemoryBank] 双写数据库失败（不影响主流程）: {}", e.getMessage());
            }
        } finally {
            lock.unlock();
        }
    }

    public void append(Long tenantId, Category category, String entry) {
        if (entry == null || entry.isBlank()) return;
        ReentrantLock lock = getLock(tenantId, category);
        lock.lock();
        try {
            String timestamp = LocalDateTime.now().format(FMT);
            String stampedEntry = String.format("[%s] - %s\n", timestamp, entry);
            String current = read(tenantId, category);
            String updated;
            if (current == null || current.isBlank()) {
                updated = stampedEntry;
            } else {
                int maxLen = category == Category.DECISION_LOG ? 8000 : 4000;
                if (current.length() + stampedEntry.length() > maxLen) {
                    String[] lines = current.split("\n");
                    int keepLines = category == Category.DECISION_LOG ? 50 : 30;
                    int start = Math.max(0, lines.length - keepLines);
                    StringBuilder sb = new StringBuilder();
                    for (int i = start; i < lines.length; i++) {
                        sb.append(lines[i]).append("\n");
                    }
                    updated = sb.append(stampedEntry).toString();
                } else {
                    updated = current + stampedEntry;
                }
            }
            write(tenantId, category, updated);
        } finally {
            lock.unlock();
        }
    }

    @Async("aiSelfCriticExecutor")
    public void appendAsync(Long tenantId, Category category, String entry) {
        append(tenantId, category, entry);
    }

    public String compileContextForPrompt(Long tenantId) {
        Map<String, String> bank = readAll(tenantId);
        StringBuilder sb = new StringBuilder();
        sb.append("【Memory Bank 状态】\n");
        boolean hasContent = false;
        for (Category cat : Category.values()) {
            String value = bank.getOrDefault(cat.key, "");
            if (!value.isBlank()) {
                hasContent = true;
                sb.append(String.format("\n=== %s (%s) ===\n%s\n", cat.name(), cat.description, value));
            }
        }
        if (!hasContent) {
            sb.append("Memory Bank 尚未初始化，无历史上下文。\n");
        }
        return sb.toString();
    }

    public void updateMemoryBank(Long tenantId, String sessionSummary,
                                  String recentChanges, String openQuestions,
                                  String decisions, String completedTasks,
                                  String nextSteps) {
        if (recentChanges != null && !recentChanges.isBlank()) {
            append(tenantId, Category.ACTIVE_CONTEXT, "变更: " + recentChanges);
        }
        if (openQuestions != null && !openQuestions.isBlank()) {
            append(tenantId, Category.ACTIVE_CONTEXT, "待解决: " + openQuestions);
        }
        if (decisions != null && !decisions.isBlank()) {
            append(tenantId, Category.DECISION_LOG, decisions);
        }
        if (completedTasks != null && !completedTasks.isBlank()) {
            append(tenantId, Category.PROGRESS, "✅ " + completedTasks);
        }
        if (nextSteps != null && !nextSteps.isBlank()) {
            append(tenantId, Category.PROGRESS, "⏭ " + nextSteps);
        }
        log.info("[MemoryBank] 租户={} UMB全量更新完成", tenantId);
    }

    public void onArchitecturalChange(Long tenantId, String change) {
        appendAsync(tenantId, Category.PRODUCT_CONTEXT, "架构变更: " + change);
    }

    public void onFocusChange(Long tenantId, String focus) {
        appendAsync(tenantId, Category.ACTIVE_CONTEXT, "焦点切换: " + focus);
    }

    public void onPatternDiscovered(Long tenantId, String pattern) {
        appendAsync(tenantId, Category.SYSTEM_PATTERNS, pattern);
    }

    public void onDecisionMade(Long tenantId, String decision, String rationale) {
        appendAsync(tenantId, Category.DECISION_LOG,
                String.format("决策: %s | 理由: %s", decision, rationale));
    }

    public void onTaskStatusChange(Long tenantId, String task, String status) {
        appendAsync(tenantId, Category.PROGRESS, String.format("%s %s", status, task));
    }

    public boolean isInitialized(Long tenantId) {
        long count = memoryCoreMapper.selectCount(
                new LambdaQueryWrapper<AgentMemoryCore>()
                        .eq(AgentMemoryCore::getTenantId, tenantId)
                        .eq(AgentMemoryCore::getAgentId, AGENT_ID)
                        .in(AgentMemoryCore::getMemoryKey,
                                Arrays.stream(Category.values()).map(c -> c.key).toList())
        );
        return count >= Category.values().length;
    }

    public void initializeIfAbsent(Long tenantId, String projectOverview) {
        if (isInitialized(tenantId)) return;
        if (projectOverview != null && !projectOverview.isBlank()) {
            write(tenantId, Category.PRODUCT_CONTEXT, projectOverview);
        }
        write(tenantId, Category.ACTIVE_CONTEXT, "[初始化] 系统首次启动，等待首次对话");
        write(tenantId, Category.SYSTEM_PATTERNS, "");
        write(tenantId, Category.DECISION_LOG, "");
        write(tenantId, Category.PROGRESS, "[初始化] Memory Bank 已创建");
        log.info("[MemoryBank] 租户={} 初始化完成", tenantId);
    }

    // ==================== ConPort 数据库化扩展（双写兼容） ====================

    /**
     * 语义搜索记忆条目（委托 MemoryBankDbService）。
     *
     * <p>当前为 LIKE 全文搜索，未来接 Qdrant 向量搜索。
     * 搜索 title + content + tags，跨所有 category。
     *
     * @param tenantId 租户ID（多租户隔离）
     * @param query    查询文本
     * @param limit    返回条数上限
     * @return 匹配的记忆条目列表
     */
    public List<MemoryBankEntry> semanticSearch(Long tenantId, String query, int limit) {
        MemoryBankDbService dbService = memoryBankDbServiceProvider.getIfAvailable();
        if (dbService == null) return List.of();
        return dbService.semanticSearch(tenantId, query, limit);
    }

    /**
     * 知识图谱遍历（委托 MemoryBankRelationService）。
     *
     * <p>从 entryKey 出发，CTE 递归遍历关联条目（depth ≤2 防爆炸）。
     *
     * @param tenantId 租户ID
     * @param entryKey 起始条目 key（如 D-020）
     * @param depth    遍历深度（强制 ≤2）
     * @return 关联条目列表（不含起点本身）
     */
    public List<MemoryBankEntry> getRelatedEntries(Long tenantId, String entryKey, int depth) {
        MemoryBankRelationService relService = memoryBankRelationServiceProvider.getIfAvailable();
        if (relService == null) return List.of();
        return relService.traverseGraph(tenantId, entryKey, depth);
    }
}
