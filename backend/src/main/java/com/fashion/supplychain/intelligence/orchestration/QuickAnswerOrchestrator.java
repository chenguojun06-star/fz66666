package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.service.QuickAnswerCacheService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * QuickAnswer 编排器 — 事务边界管理
 *
 * <p>职责：
 * <ol>
 *   <li>管理秒答缓存写入的事务边界（P0铁律2：@Transactional仅在Orchestrator层）</li>
 *   <li>协调多个Service的写操作，确保原子性</li>
 * </ol>
 */
@Service
@Lazy
@Slf4j
public class QuickAnswerOrchestrator {

    @Autowired
    private QuickAnswerCacheService quickAnswerCacheService;

    /**
     * 保存业务快照（带事务）
     * 
     * <p>事务边界：先软删旧快照，再插入新快照，确保每租户只有1条有效快照
     */
    @Transactional(rollbackFor = Exception.class)
    public void saveSnapshotWithTransaction(Long tenantId, Map<String, Object> snapshotData,
                                            String summaryText, String evidenceJson) {
        quickAnswerCacheService.saveSnapshotInternal(tenantId, snapshotData, summaryText, evidenceJson);
    }

    /**
     * 保存预构建答案（带事务）
     */
    @Transactional(rollbackFor = Exception.class)
    public void savePrebuiltWithTransaction(Long tenantId, String questionPattern,
                                            String answerSummary, Map<String, Object> snapshotData,
                                            double confidence, String source) {
        quickAnswerCacheService.savePrebuilt(tenantId, questionPattern, answerSummary, 
                                            snapshotData, confidence, source);
    }

    /**
     * 清理过期缓存（带事务）。
     *
     * <p>D-882 接调度前此方法零调用——清理逻辑写好了（软删过期行 + 硬删已软删
     * 1 天以上的行）但没人执行，本地库实测 t_quick_answer 积了 387 行软删僵尸
     * （390 条 SNAPSHOT 里 387 条 delete_flag=1，硬删步骤从未跑过）。
     * 快照每次刷新都会软删旧行，僵尸行只增不减。
     *
     * <p>每小时 47 分执行（错开已占用的 0/10/15/20/23/25/30 分档）。
     */
    @Scheduled(cron = "0 47 * * * ?")
    @Transactional(rollbackFor = Exception.class)
    public int cleanExpiredWithTransaction() {
        return quickAnswerCacheService.cleanExpired();
    }

    // ===== 委托方法（只读操作，不需要事务）=====

    public QuickAnswerCacheService.HitResult tryHit(Long tenantId, String userMessage) {
        return quickAnswerCacheService.tryHit(tenantId, userMessage);
    }

    public void saveHotspot(Long tenantId, String pageKey, Map<String, Object> data, String summary) {
        quickAnswerCacheService.saveHotspot(tenantId, pageKey, data, summary);
    }

    public java.util.List<QuickAnswerCacheService.HitResult> getTopHits(Long tenantId, int limit) {
        return quickAnswerCacheService.getTopHits(tenantId, limit);
    }

    public boolean isEnabled() {
        return quickAnswerCacheService.isEnabled();
    }
}
