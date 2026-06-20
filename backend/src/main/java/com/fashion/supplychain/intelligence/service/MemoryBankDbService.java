package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.entity.MemoryBankEntry;
import com.fashion.supplychain.intelligence.entity.MemoryBankRelation;
import com.fashion.supplychain.intelligence.mapper.MemoryBankEntryMapper;
import com.fashion.supplychain.intelligence.mapper.MemoryBankRelationMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 数据库化记忆银行服务（ConPort 模式）。
 *
 * <p>借鉴 RooFlow Context Portal 2026-02-19 升级，将 memory-bank/*.md 数据库化：
 * <ul>
 *   <li>语义检索替代通读（当前 LIKE 全文搜索，未来接 Qdrant 向量搜索）</li>
 *   <li>知识图谱关系（decisions ↔ progress ↔ architecture 显式关系）</li>
 *   <li>多工作区支持（workspace_id = tenant_id，多租户隔离 P0 铁律）</li>
 * </ul>
 *
 * <p>与 {@link MemoryBankService} 双写兼容：本类负责结构化条目 + 关系图谱，
 * MemoryBankService 继续负责整段 Markdown 读写（向后兼容）。
 */
@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class MemoryBankDbService {

    private final MemoryBankEntryMapper entryMapper;
    private final MemoryBankRelationMapper relationMapper;
    private final ObjectMapper objectMapper;

    /** 语义搜索次数统计（D-021 统一可观测用，进程级） */
    private final AtomicLong semanticSearchCount = new AtomicLong(0);

    /** 图谱遍历最大深度（防爆炸） */
    private static final int MAX_TRAVERSE_DEPTH = 2;

    // ==================== 条目 CRUD ====================

    /**
     * 插入或更新条目（按 tenantId + category + entryKey 唯一键）。
     */
    public void upsertEntry(Long tenantId, String category, String entryKey,
                             String title, String content, List<String> tags) {
        if (tenantId == null || category == null || entryKey == null) {
            log.warn("[MemoryBankDb] upsert 拒绝：参数为空 tenantId={} category={} entryKey={}",
                    tenantId, category, entryKey);
            return;
        }
        MemoryBankEntry existing = entryMapper.selectByCategoryAndKey(tenantId, category, entryKey);
        if (existing == null) {
            MemoryBankEntry entry = buildEntry(tenantId, category, entryKey, title, content, tags);
            entryMapper.insert(entry);
            log.debug("[MemoryBankDb] 新增条目 tenant={} cat={} key={}", tenantId, category, entryKey);
        } else {
            existing.setTitle(title != null ? title : entryKey);
            existing.setContent(content != null ? content : "");
            if (tags != null) existing.setTags(toJson(tags));
            existing.setUpdateTime(LocalDateTime.now());
            entryMapper.updateById(existing);
            log.debug("[MemoryBankDb] 更新条目 tenant={} cat={} key={}", tenantId, category, entryKey);
        }
    }

    private MemoryBankEntry buildEntry(Long tenantId, String category, String entryKey,
                                        String title, String content, List<String> tags) {
        MemoryBankEntry entry = new MemoryBankEntry();
        entry.setId(genId());
        entry.setTenantId(tenantId);
        entry.setCategory(category);
        entry.setEntryKey(entryKey);
        entry.setTitle(title != null ? title : entryKey);
        entry.setContent(content != null ? content : "");
        if (tags != null) entry.setTags(toJson(tags));
        entry.setCreateTime(LocalDateTime.now());
        entry.setUpdateTime(LocalDateTime.now());
        entry.setDeleteFlag(0);
        return entry;
    }

    /**
     * 按 key 查询条目。
     */
    public Optional<MemoryBankEntry> getEntry(Long tenantId, String category, String entryKey) {
        if (tenantId == null) return Optional.empty();
        return Optional.ofNullable(entryMapper.selectByCategoryAndKey(tenantId, category, entryKey));
    }

    /**
     * 列出某分类下所有条目（按 update_time 降序）。
     */
    public List<MemoryBankEntry> listByCategory(Long tenantId, String category, int limit) {
        if (tenantId == null) return List.of();
        return entryMapper.listByCategory(tenantId, category, Math.min(limit, 200));
    }

    /**
     * 语义搜索（当前 LIKE 全文搜索，未来接 Qdrant 向量搜索）。
     * 搜索 title + content + tags。
     */
    public List<MemoryBankEntry> semanticSearch(Long tenantId, String query, int limit) {
        if (tenantId == null || query == null || query.isBlank()) return List.of();
        semanticSearchCount.incrementAndGet();
        return entryMapper.searchByContent(tenantId, query.trim(), Math.min(limit, 50));
    }

    // ==================== 知识图谱关系 ====================

    /**
     * 添加知识图谱关系（自动解析 sourceKey/targetKey 为 entryId）。
     */
    public void addRelation(Long tenantId, String sourceKey, String targetKey,
                             String relationType, double weight) {
        if (tenantId == null || sourceKey == null || targetKey == null) {
            log.warn("[MemoryBankDb] addRelation 拒绝：参数为空");
            return;
        }
        MemoryBankEntry source = findEntryByKey(tenantId, sourceKey);
        MemoryBankEntry target = findEntryByKey(tenantId, targetKey);
        if (source == null || target == null) {
            log.warn("[MemoryBankDb] addRelation 跳过：条目不存在 source={} target={}",
                    sourceKey, targetKey);
            return;
        }
        MemoryBankRelation existing = findRelation(tenantId, source.getId(), target.getId(), relationType);
        if (existing != null) {
            existing.setWeight(BigDecimal.valueOf(weight));
            relationMapper.updateById(existing);
            return;
        }
        MemoryBankRelation rel = new MemoryBankRelation();
        rel.setId(genId());
        rel.setTenantId(tenantId);
        rel.setSourceEntryId(source.getId());
        rel.setTargetEntryId(target.getId());
        rel.setRelationType(relationType);
        rel.setWeight(BigDecimal.valueOf(weight));
        rel.setCreateTime(LocalDateTime.now());
        relationMapper.insert(rel);
        log.debug("[MemoryBankDb] 新增关系 {} --{}--> {}", sourceKey, relationType, targetKey);
    }

    private MemoryBankEntry findEntryByKey(Long tenantId, String entryKey) {
        List<MemoryBankEntry> entries = entryMapper.selectList(
                new LambdaQueryWrapper<MemoryBankEntry>()
                        .eq(MemoryBankEntry::getTenantId, tenantId)
                        .eq(MemoryBankEntry::getEntryKey, entryKey)
                        .eq(MemoryBankEntry::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        return entries.isEmpty() ? null : entries.get(0);
    }

    private MemoryBankRelation findRelation(Long tenantId, String sourceId, String targetId, String type) {
        List<MemoryBankRelation> rels = relationMapper.selectList(
                new LambdaQueryWrapper<MemoryBankRelation>()
                        .eq(MemoryBankRelation::getTenantId, tenantId)
                        .eq(MemoryBankRelation::getSourceEntryId, sourceId)
                        .eq(MemoryBankRelation::getTargetEntryId, targetId)
                        .eq(MemoryBankRelation::getRelationType, type)
                        .last("LIMIT 1"));
        return rels.isEmpty() ? null : rels.get(0);
    }

    /**
     * 知识图谱遍历（CTE 递归，depth ≤2 防爆炸）。
     */
    public List<MemoryBankEntry> getRelatedEntries(Long tenantId, String entryKey, int depth) {
        if (tenantId == null || entryKey == null) return List.of();
        MemoryBankEntry start = findEntryByKey(tenantId, entryKey);
        if (start == null) return List.of();
        int safeDepth = Math.min(Math.max(depth, 1), MAX_TRAVERSE_DEPTH);
        return relationMapper.traverseGraph(tenantId, start.getId(), safeDepth);
    }

    // ==================== Markdown 导入 ====================

    /**
     * 从 Markdown 导入（按 ## 二级标题分割条目）。
     *
     * <p>解析规则：
     * <ul>
     *   <li>按 "## " 分割，每段第一个非空行作为 entry_key/title</li>
     *   <li>无二级标题时，整个文件作为一个条目，entry_key 用文件名</li>
     *   <li>幂等：相同 tenantId + category + entryKey 会更新而非重复插入</li>
     * </ul>
     */
    public int importFromMarkdown(Long tenantId, String category, String markdownContent, String fallbackKey) {
        if (markdownContent == null || markdownContent.isBlank()) return 0;
        List<Map<String, String>> sections = parseMarkdownSections(markdownContent, fallbackKey);
        int count = 0;
        for (Map<String, String> sec : sections) {
            String key = sec.get("key");
            String title = sec.get("title");
            String content = sec.get("content");
            upsertEntry(tenantId, category, key, title, content, null);
            count++;
        }
        log.info("[MemoryBankDb] Markdown 导入完成 tenant={} cat={} 条目数={}", tenantId, category, count);
        return count;
    }

    /**
     * 解析 Markdown 为条目列表（按 ## 二级标题分割）。
     */
    private List<Map<String, String>> parseMarkdownSections(String markdown, String fallbackKey) {
        List<Map<String, String>> sections = new ArrayList<>();
        String[] lines = markdown.split("\n");
        StringBuilder current = new StringBuilder();
        String currentKey = null;
        String currentTitle = null;
        boolean foundH2 = false;

        for (String line : lines) {
            if (line.startsWith("## ")) {
                if (currentKey != null) {
                    sections.add(buildSection(currentKey, currentTitle, current.toString()));
                }
                String heading = line.substring(3).trim();
                currentKey = extractKey(heading);
                currentTitle = heading;
                current = new StringBuilder();
                current.append(line).append("\n");
                foundH2 = true;
            } else {
                current.append(line).append("\n");
            }
        }
        if (currentKey != null) {
            sections.add(buildSection(currentKey, currentTitle, current.toString()));
        }
        if (!foundH2 && fallbackKey != null) {
            sections.add(buildSection(fallbackKey, fallbackKey, markdown));
        }
        return sections;
    }

    private Map<String, String> buildSection(String key, String title, String content) {
        Map<String, String> sec = new LinkedHashMap<>();
        sec.put("key", key);
        sec.put("title", title != null ? title : key);
        sec.put("content", content);
        return sec;
    }

    /** 从标题提取 key（如 "D-001：事务边界" → "D-001"） */
    private String extractKey(String heading) {
        if (heading == null || heading.isBlank()) return "section_" + System.nanoTime();
        int colon = heading.indexOf('：');
        if (colon < 0) colon = heading.indexOf(':');
        if (colon > 0) return heading.substring(0, colon).trim();
        return heading.length() > 100 ? heading.substring(0, 100) : heading;
    }

    // ==================== 统计（D-021 合规） ====================

    public long getEntryCount(Long tenantId) {
        if (tenantId == null) return 0;
        return entryMapper.countByTenant(tenantId);
    }

    public long getRelationCount(Long tenantId) {
        if (tenantId == null) return 0;
        return relationMapper.countByTenant(tenantId);
    }

    public long getSemanticSearchCount() {
        return semanticSearchCount.get();
    }

    public long getOrphanRelationCount(Long tenantId) {
        if (tenantId == null) return 0;
        try {
            return relationMapper.countOrphanRelations(tenantId);
        } catch (Exception e) {
            return 0;
        }
    }

    // ==================== 工具 ====================

    private String genId() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private String toJson(List<String> tags) {
        try {
            return objectMapper.writeValueAsString(tags);
        } catch (Exception e) {
            return "[]";
        }
    }
}
