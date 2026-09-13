package com.fashion.supplychain.config;

import com.fashion.supplychain.intelligence.orchestration.StyleDifficultyOrchestrator;
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

    private static final String MARKER_KEY = "style-vector-backfill:done:v1";

    @Autowired(required = false)
    private RedisService redisService;

    @Autowired
    private StyleDifficultyOrchestrator styleDifficultyOrchestrator;

    /** 每批条数（每款约 3~5 秒：视觉分析+向量化） */
    @Value("${fashion.qdrant.style-vector-backfill.batch-size:200}")
    private int batchSize;

    /** 最多批次（批次×条数=处理上限，防止超长占用） */
    @Value("${fashion.qdrant.style-vector-backfill.max-batches:15}")
    private int maxBatches;

    @Override
    public void run(ApplicationArguments args) {
        Thread worker = new Thread(this::safeRun, "style-vector-backfill");
        worker.setDaemon(true);
        worker.start();
    }

    private void safeRun() {
        try {
            if (redisService != null && "1".equals(redisService.get(MARKER_KEY))) {
                log.info("[StyleVectorBackfill] 已执行过（Redis标记存在），跳过");
                return;
            }
            log.info("[StyleVectorBackfill] 开始存量款式图片向量补齐 batchSize={} maxBatches={}", batchSize, maxBatches);
            int totalOk = 0;
            for (int batch = 0; batch < maxBatches; batch++) {
                var result = styleDifficultyOrchestrator.backfillStyleImageVectors(batchSize, batch * batchSize);
                int total = ((Number) result.get("total")).intValue();
                int ok = ((Number) result.get("ok")).intValue();
                int failed = ((Number) result.get("failed")).intValue();
                totalOk += ok;
                log.info("[StyleVectorBackfill] 批次{}/{} total={} ok={} failed={}",
                        batch + 1, maxBatches, total, ok, failed);
                if (total < batchSize) {
                    break; // 到底了
                }
            }
            if (redisService != null) {
                redisService.set(MARKER_KEY, "1");
            }
            log.info("[StyleVectorBackfill] 存量款式图片向量补齐完成，累计入库 {} 款", totalOk);
        } catch (Exception e) {
            log.warn("[StyleVectorBackfill] 执行失败（不影响启动，下次启动重试）: {}", e.getMessage());
        }
    }
}
