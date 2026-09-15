package com.fashion.supplychain.config;

import com.fashion.supplychain.intelligence.orchestration.StyleDifficultyOrchestrator;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.service.RedisService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * D-386：启动后自动为存量款式补齐图片向量（异步、一次性，Redis 标记防重）。
 * 目的：让"以图搜款"的向量检索无需人工调用管理端点即具备存量数据。
 * 幂等安全：upsert 同 ID 覆盖；标记丢失最多多跑一遍（覆盖式重灌，无脏数据）。
 */
@Component
@ConditionalOnProperty(name = "fashion.qdrant.style-vector-backfill.enabled", havingValue = "true", matchIfMissing = true)
@Slf4j
public class StyleVectorBackfillRunner implements ApplicationRunner {

    // v3：v2 只在全部 15 批跑完才写标记，实例重启/重新部署即清零重来。
    //     线上实测：2574 跑到一半被 2575 取代，进度全丢（2026-09-13）。
    //     v3 改为每批结束写一次进度 offset，重启从断点续跑，不再白烧 embedding 额度。
    private static final String MARKER_KEY = "style-vector-backfill:done:v3";
    private static final String OFFSET_KEY = "style-vector-backfill:offset:v3";

    @Autowired(required = false)
    private RedisService redisService;

    @Autowired
    private StyleDifficultyOrchestrator styleDifficultyOrchestrator;

    @Autowired
    private QdrantService qdrantService;

    /**
     * 每批条数（每款约 3~5 秒：视觉分析+向量化）。
     * 原为 200：backend 容器仅 1 核 2G 且未设 -Xmx，单批 200 款的内存峰值极高，
     * 与 OOM 重启嫌疑直接相关（线上观测到实例反复重建）。改为 50 降低单次峰值，
     * 同时把 maxBatches 提到 60，处理上限仍为 3000 款，覆盖量不变。
     */
    @Value("${fashion.qdrant.style-vector-backfill.batch-size:50}")
    private int batchSize;

    /** 最多批次（批次×条数=处理上限，防止超长占用） */
    @Value("${fashion.qdrant.style-vector-backfill.max-batches:60}")
    private int maxBatches;

    @Override
    public void run(ApplicationArguments args) {
        Thread worker = new Thread(this::safeRun, "style-vector-backfill");
        worker.setDaemon(true);
        worker.start();
    }

    private void safeRun() {
        try {
            // 数量自愈（D-386 续）：qdrant 容器随代码推送被重建会导致集合清空，
            // 完成标记会骗过重跑——改为对比「有封面款式数 vs style_images 向量条数」，
            // 缺口存在就清掉标记/进度重跑（upsert 同 ID 幂等覆盖，重灌无脏数据）
            long target = styleDifficultyOrchestrator.countStylesWithCover();
            if (target <= 0) {
                log.info("[StyleVectorBackfill] 无带封面款式，跳过");
                return;
            }
            long have = qdrantService.getStyleImagePointCount();
            if (have >= target) {
                log.info("[StyleVectorBackfill] 向量条数已齐 have={} target={}，跳过", have, target);
                return;
            }
            log.info("[StyleVectorBackfill] 检测到向量缺口 have={}/target={}，清除旧标记重新补齐", have, target);
            if (redisService != null) {
                redisService.delete(MARKER_KEY);
                redisService.delete(OFFSET_KEY);
            }
            int startBatch = readOffset();
            log.info("[StyleVectorBackfill] 开始存量款式图片向量补齐 batchSize={} maxBatches={} 起始批次={}",
                    batchSize, maxBatches, startBatch + 1);
            int totalOk = 0;
            for (int batch = startBatch; batch < maxBatches; batch++) {
                var result = styleDifficultyOrchestrator.backfillStyleImageVectors(batchSize, batch * batchSize);
                int total = ((Number) result.get("total")).intValue();
                int ok = ((Number) result.get("ok")).intValue();
                int failed = ((Number) result.get("failed")).intValue();
                totalOk += ok;
                log.info("[StyleVectorBackfill] 批次{}/{} total={} ok={} failed={}",
                        batch + 1, maxBatches, total, ok, failed);
                writeOffset(batch + 1); // 断点：本批已完成，下一批从这里开始
                if (total < batchSize) {
                    break; // 到底了
                }
            }
            if (redisService != null) {
                redisService.set(MARKER_KEY, "1");
                redisService.delete(OFFSET_KEY);
            }
            log.info("[StyleVectorBackfill] 存量款式图片向量补齐完成，累计入库 {} 款", totalOk);
        } catch (Exception e) {
            log.warn("[StyleVectorBackfill] 执行失败（不影响启动，下次启动从断点续跑）: {}", e.getMessage(), e);
        }
    }

    /** 读取已完成的批次数（断点续跑起点）；无记录或值损坏则从 0 开始 */
    private int readOffset() {
        if (redisService == null) {
            return 0;
        }
        try {
            String v = redisService.get(OFFSET_KEY);
            if (v == null || v.isBlank()) {
                return 0;
            }
            int off = Integer.parseInt(v.trim());
            return Math.max(0, Math.min(off, maxBatches));
        } catch (Exception e) {
            log.warn("[StyleVectorBackfill] 进度读取失败，从第 1 批开始: {}", e.getMessage());
            return 0;
        }
    }

    /** 记录已完成到的批次数（即下一批的起点），7 天 TTL 防止僵尸进度永久卡住续跑 */
    private void writeOffset(int nextBatch) {
        if (redisService == null) {
            return;
        }
        try {
            redisService.set(OFFSET_KEY, String.valueOf(nextBatch), 7, java.util.concurrent.TimeUnit.DAYS);
        } catch (Exception e) {
            log.warn("[StyleVectorBackfill] 进度写入失败（不影响本批结果）: {}", e.getMessage());
        }
    }
}
