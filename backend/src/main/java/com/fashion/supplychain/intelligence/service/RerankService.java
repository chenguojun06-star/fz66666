package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

/**
 * Rerank 精排统一门面。
 *
 * <p>屏蔽底层 provider 差异（硅基流动 / Cohere），并对主链路提供统一的可灰度、可降级入口：
 * <ol>
 *   <li>{@code ai.rerank.enabled=false} → 全链路不调 rerank</li>
 *   <li>候选数 <= topN → 直接跳过，省一次 API 调用</li>
 *   <li>调用失败/超时 → 静默回退原排序，绝不抛出异常</li>
 * </ol>
 *
 * <p>配置（application.yml）：
 * <pre>
 * ai:
 *   rerank:
 *     enabled: true
 *     provider: siliconflow   # siliconflow / cohere
 *     top-n: 5
 * </pre>
 */
@Slf4j
@Service
@Lazy
public class RerankService {

    @Autowired(required = false) private SiliconFlowRerankService siliconFlowRerankService;
    @Autowired(required = false) private CohereRerankService cohereRerankService;

    @Value("${ai.rerank.enabled:true}")
    private boolean enabled;

    @Value("${ai.rerank.provider:siliconflow}")
    private String provider;

    @Value("${ai.rerank.top-n:5}")
    private int topN;

    /** 精排是否可用（总开关打开 + 对应 provider 已配置 API Key） */
    public boolean isAvailable() {
        if (!enabled) return false;
        if (provider == null) return false;
        return switch (provider.trim().toLowerCase()) {
            case "siliconflow" -> siliconFlowRerankService != null && siliconFlowRerankService.isAvailable();
            case "cohere" -> cohereRerankService != null && cohereRerankService.isAvailable();
            default -> false;
        };
    }

    /** 使用配置中的 top-n 执行精排 */
    public List<KnowledgeBase> rerank(String query, List<KnowledgeBase> candidates) {
        return rerank(query, candidates, topN);
    }

    /**
     * 执行精排；不可用 / 候选不足 / 调用失败时均返回原排序（截断到 topN）。
     *
     * @param query      查询文本
     * @param candidates 候选文档
     * @param topN       精排后返回条数；候选数 <= topN 时直接跳过
     * @return 精排后的列表（失败时为原排序）
     */
    public List<KnowledgeBase> rerank(String query, List<KnowledgeBase> candidates, int topN) {
        if (candidates == null || candidates.isEmpty()) return Collections.emptyList();

        int actualTopN = Math.min(topN, candidates.size());

        if (!enabled) {
            log.debug("[Rerank] 已关闭（ai.rerank.enabled=false），跳过精排 candidates={}", candidates.size());
            return candidates.subList(0, actualTopN);
        }
        if (!isAvailable()) {
            log.debug("[Rerank] provider={} 不可用（未配置 API Key），跳过精排 candidates={}",
                    provider, candidates.size());
            return candidates.subList(0, actualTopN);
        }
        // 候选数不足时精排无意义，直接跳过，省一次 API 调用
        if (candidates.size() <= topN) {
            log.debug("[Rerank] 跳过: 候选数 {} <= topN {}，无需精排", candidates.size(), topN);
            return candidates;
        }

        long start = System.currentTimeMillis();
        try {
            List<KnowledgeBase> reranked = switch (provider.trim().toLowerCase()) {
                case "siliconflow" -> siliconFlowRerankService.rerank(query, candidates, topN);
                case "cohere" -> cohereRerankService.rerank(query, candidates, topN);
                default -> null;
            };

            if (reranked == null || reranked.isEmpty()) {
                log.warn("[Rerank] provider={} 返回空，降级原排序 candidates={} 耗时={}ms",
                        provider, candidates.size(), System.currentTimeMillis() - start);
                return candidates.subList(0, actualTopN);
            }

            log.info("[Rerank] provider={} 命中: candidates={} topN={} → {} 条, 耗时={}ms",
                    provider, candidates.size(), topN, reranked.size(), System.currentTimeMillis() - start);
            return reranked;

        } catch (Exception e) {
            log.warn("[Rerank] provider={} 精排失败，降级返回原排序: candidates={} 耗时={}ms err={}",
                    provider, candidates.size(), System.currentTimeMillis() - start, e.getMessage());
            return candidates.subList(0, actualTopN);
        }
    }
}
