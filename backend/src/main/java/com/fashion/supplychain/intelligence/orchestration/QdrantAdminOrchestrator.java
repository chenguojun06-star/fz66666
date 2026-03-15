package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.service.QdrantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Qdrant 向量库管理编排器。
 *
 * <p>职责：集合初始化（启动自愈）、健康检查、向量统计、租户向量清理。
 * {@link QdrantService} 只做底层 HTTP 单条操作，本编排器负责库级管理视图。
 *
 * <p>配置项：{@code intelligence.qdrant.*}（已在 application.yml 定义）
 */
@Service
@Slf4j
public class QdrantAdminOrchestrator {

    @Autowired
    private QdrantService qdrantService;

    @Value("${intelligence.qdrant.url:http://localhost:6333}")
    private String qdrantUrl;

    @Value("${intelligence.qdrant.collection:fashion_memory}")
    private String collectionName;

    // ──────────────────────────────────────────────────────────────
    //  启动自愈
    // ──────────────────────────────────────────────────────────────

    /**
     * Spring 启动后自动检查集合是否存在；不存在则创建。
     * Qdrant 不可用时静默跳过，不阻塞 Spring 初始化。
     */
    @PostConstruct
    public void ensureCollectionReady() {
        try {
            if (!qdrantService.isAvailable()) {
                log.info("[QdrantAdmin] Qdrant 不可用（未启动或未配置），跳过集合初始化。url={}", qdrantUrl);
                return;
            }
            boolean created = qdrantService.ensureCollection();
            if (created) {
                log.info("[QdrantAdmin] 集合已自动新建 collection={}", collectionName);
            } else {
                log.debug("[QdrantAdmin] 集合已存在 collection={}", collectionName);
            }
        } catch (Exception e) {
            log.warn("[QdrantAdmin] 集合初始化异常（不影响业务）: {}", e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  健康状态
    // ──────────────────────────────────────────────────────────────

    /** @return Qdrant 实例是否可正常连接 */
    public boolean isHealthy() {
        return qdrantService.isAvailable();
    }

    // ──────────────────────────────────────────────────────────────
    //  统计汇总
    // ──────────────────────────────────────────────────────────────

    /**
     * 向量库统计概览：可用状态、集合名、向量总数。
     * 用于智能驾驶舱神经状态面板展示。
     */
    public Map<String, Object> summary() {
        boolean available = qdrantService.isAvailable();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("available", available);
        result.put("url", qdrantUrl);
        result.put("collection", collectionName);
        if (available) {
            long count = qdrantService.countVectors();
            result.put("vectorCount", count);
            result.put("status", count >= 0 ? "ready" : "error");
        } else {
            result.put("vectorCount", 0);
            result.put("status", "offline");
        }
        return result;
    }

    // ──────────────────────────────────────────────────────────────
    //  租户向量管理
    // ──────────────────────────────────────────────────────────────

    /**
     * 清理指定租户的全部向量（适用于租户注销或数据迁移场景）。
     * 由超管接口或定时任务调用，不暴露给普通租户。
     *
     * @return 操作状态：0=成功触发；-1=失败
     */
    public int clearTenantVectors(Long tenantId) {
        if (!qdrantService.isAvailable()) {
            log.warn("[QdrantAdmin] Qdrant 不可用，跳过租户向量清理 tenantId={}", tenantId);
            return -1;
        }
        int result = qdrantService.deleteVectorsByTenant(tenantId);
        if (result >= 0) {
            log.info("[QdrantAdmin] 已触发租户向量清理 tenantId={}", tenantId);
        }
        return result;
    }
}
