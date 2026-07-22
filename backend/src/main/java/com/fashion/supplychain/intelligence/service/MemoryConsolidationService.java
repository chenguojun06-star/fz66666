package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.intelligence.dto.ConsolidationResult;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

/**
 * 离线记忆巩固 Service（P1-5 Cognee 离线巩固方向）。
 *
 * <p>定时合并相似事实记忆，生成"精华版"记忆，提升检索质量。
 * <br>合并策略：同租户 + 同 subjectType+subjectId + content 前 50 字相同 + 数量 &gt; 5 时合并，
 * 取最新一条作为精华版（content 追加「(已合并 N 条相似记忆)」），旧记忆通过 P1-1 时序字段
 * （valid_to / superseded_by）标记失效。</p>
 *
 * <p><b>多租户隔离</b>：所有查询带 tenant_id WHERE（P0 铁律 #4）。</p>
 * <p><b>无 @Transactional</b>：Service 层禁止事务（D-001），事务边界由 Orchestrator 层负责。
 * 巩固操作本身是幂等的（valid_to 已设置的记忆不会再次被查询到），即使中途失败也不影响数据一致性。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Slf4j
@Service
@Lazy
public class MemoryConsolidationService {

    /** 查询窗口：最近 7 天的 FACT 记忆 */
    private static final int LOOKBACK_DAYS = 7;

    /** 相似分组阈值：组内记忆数 > 5 才触发合并 */
    private static final int SIMILAR_GROUP_THRESHOLD = 5;

    /** content 前缀比较长度（前 50 字相同视为相似） */
    private static final int PREFIX_LENGTH = 50;

    /** 每租户最多处理的相似分组数（防止任务过长） */
    private static final int MAX_GROUPS_PER_TENANT = 20;

    @Autowired
    private LongTermMemoryOrchestrator longTermMemoryOrchestrator;

    @Autowired
    private AiLongMemoryMapper aiLongMemoryMapper;

    /**
     * 对指定租户执行记忆巩固。
     *
     * <p>流程：
     * <ol>
     *   <li>查询该租户最近 7 天 layer='FACT' 且 valid_to IS NULL 的记忆</li>
     *   <li>按 subjectType + subjectId 分组</li>
     *   <li>组内再按 content 前 50 字分相似子组</li>
     *   <li>子组 size &gt; 5 时合并：最新一条作为精华版（content 追加合并标记），其余 valid_to=now、superseded_by=精华版id</li>
     *   <li>每租户最多处理 20 个子组</li>
     * </ol>
     *
     * @param tenantId 租户 ID（必填，P0 铁律 #4 多租户隔离）
     * @return 巩固结果统计
     */
    public ConsolidationResult consolidateForTenant(Long tenantId) {
        if (tenantId == null) {
            return ConsolidationResult.builder()
                    .tenantId(null)
                    .totalScanned(0)
                    .groupsProcessed(0)
                    .memoriesMerged(0)
                    .build();
        }

        int totalScanned = 0;
        int groupsProcessed = 0;
        int memoriesMerged = 0;

        try {
            // 1. 查询最近 7 天有效 FACT 记忆（多租户隔离：tenant_id 必填）
            LocalDateTime since = LocalDateTime.now().minusDays(LOOKBACK_DAYS);
            LambdaQueryWrapper<AiLongMemory> qw = new LambdaQueryWrapper<>();
            qw.eq(AiLongMemory::getTenantId, tenantId)
              .eq(AiLongMemory::getLayer, "FACT")
              .isNull(AiLongMemory::getValidTo)
              .gt(AiLongMemory::getCreateTime, since)
              .eq(AiLongMemory::getDeleteFlag, 0)
              .orderByDesc(AiLongMemory::getSubjectType)
              .orderByDesc(AiLongMemory::getSubjectId)
              .orderByDesc(AiLongMemory::getCreateTime);
            List<AiLongMemory> memories = aiLongMemoryMapper.selectList(qw);

            if (memories == null || memories.isEmpty()) {
                return ConsolidationResult.builder()
                        .tenantId(tenantId)
                        .totalScanned(0)
                        .groupsProcessed(0)
                        .memoriesMerged(0)
                        .build();
            }
            totalScanned = memories.size();

            // 2. 按 subjectType + subjectId 分组
            Map<String, List<AiLongMemory>> bySubject = memories.stream()
                    .filter(m -> m.getSubjectType() != null)
                    .collect(Collectors.groupingBy(
                            m -> m.getSubjectType() + "##" +
                                 (m.getSubjectId() != null ? m.getSubjectId() : ""),
                            Collectors.toList()));

            // 3. 每组内按 content 前 50 字分相似子组，子组 > 5 才合并
            for (Map.Entry<String, List<AiLongMemory>> entry : bySubject.entrySet()) {
                if (groupsProcessed >= MAX_GROUPS_PER_TENANT) {
                    break;
                }
                List<AiLongMemory> subjectGroup = entry.getValue();
                if (subjectGroup == null || subjectGroup.size() <= SIMILAR_GROUP_THRESHOLD) {
                    continue;
                }

                // 组内按 content 前缀分相似子组
                Map<String, List<AiLongMemory>> byPrefix = subjectGroup.stream()
                        .collect(Collectors.groupingBy(
                                m -> prefixOf(m.getContent()),
                                Collectors.toList()));

                for (List<AiLongMemory> similar : byPrefix.values()) {
                    if (groupsProcessed >= MAX_GROUPS_PER_TENANT) {
                        break;
                    }
                    if (similar.size() <= SIMILAR_GROUP_THRESHOLD) {
                        continue;
                    }

                    int merged = mergeSimilarGroup(similar, tenantId);
                    if (merged > 0) {
                        memoriesMerged += merged;
                        groupsProcessed++;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[MemoryConsolidation] 租户 {} 巩固失败(不影响主流程): {}", tenantId, e.getMessage());
        }

        return ConsolidationResult.builder()
                .tenantId(tenantId)
                .totalScanned(totalScanned)
                .groupsProcessed(groupsProcessed)
                .memoriesMerged(memoriesMerged)
                .build();
    }

    /**
     * 合并一个相似子组：最新一条作为精华版，其余标记失效。
     *
     * @param similar 相似记忆列表（已按 create_time DESC 排序，最新在前）
     * @return 被标记失效的记忆条数（不含精华版）
     */
    private int mergeSimilarGroup(List<AiLongMemory> similar, Long tenantId) {
        // 按 create_time DESC 排序，确保取到最新一条作为精华版
        similar.sort(Comparator.comparing(
                AiLongMemory::getCreateTime,
                Comparator.nullsLast(Comparator.reverseOrder())));

        AiLongMemory survivor = similar.get(0);
        Long survivorId = survivor.getId();
        if (survivorId == null) {
            return 0;
        }

        int n = similar.size();

        // 1. 更新精华版 content 追加 "(已合并 N 条相似记忆)"
        try {
            String originalContent = survivor.getContent() != null ? survivor.getContent() : "";
            String newContent = originalContent + "(已合并 " + n + " 条相似记忆)";
            LambdaUpdateWrapper<AiLongMemory> updSurvivor = new LambdaUpdateWrapper<>();
            updSurvivor.eq(AiLongMemory::getId, survivorId)
                       .eq(AiLongMemory::getTenantId, tenantId)
                       .set(AiLongMemory::getContent, newContent)
                       .set(AiLongMemory::getUpdateTime, LocalDateTime.now());
            aiLongMemoryMapper.update(null, updSurvivor);
        } catch (Exception e) {
            log.warn("[MemoryConsolidation] 更新精华版失败 survivorId={} tenant={} err={}",
                    survivorId, tenantId, e.getMessage());
            return 0;
        }

        // 2. 旧记忆 valid_to=now, superseded_by=survivorId（多租户隔离）
        List<Long> oldIds = similar.stream()
                .map(AiLongMemory::getId)
                .filter(id -> id != null && !id.equals(survivorId))
                .collect(Collectors.toList());
        if (oldIds.isEmpty()) {
            return 0;
        }

        try {
            LambdaUpdateWrapper<AiLongMemory> updOld = new LambdaUpdateWrapper<>();
            updOld.in(AiLongMemory::getId, oldIds)
                  .eq(AiLongMemory::getTenantId, tenantId)
                  .set(AiLongMemory::getValidTo, LocalDateTime.now())
                  .set(AiLongMemory::getSupersededBy, survivorId)
                  .set(AiLongMemory::getUpdateTime, LocalDateTime.now());
            aiLongMemoryMapper.update(null, updOld);
            log.info("[MemoryConsolidation] 租户 {} 合并 {} 条相似记忆 → 精华版 id={}",
                    tenantId, oldIds.size(), survivorId);
            return oldIds.size();
        } catch (Exception e) {
            log.warn("[MemoryConsolidation] 标记旧记忆失效失败 survivorId={} tenant={} err={}",
                    survivorId, tenantId, e.getMessage());
            return 0;
        }
    }

    /**
     * 取 content 前 50 字作为相似度比较键。
     * content 为 null 或空时返回空串，避免 NPE。
     */
    private String prefixOf(String content) {
        if (content == null || content.isEmpty()) {
            return "";
        }
        return content.substring(0, Math.min(PREFIX_LENGTH, content.length()));
    }
}
