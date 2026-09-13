package com.fashion.supplychain.intelligence.config;

import com.fashion.supplychain.intelligence.service.ProceduralMemoryService;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.intelligence.service.SchemaVectorManager;
import com.fashion.supplychain.service.RedisService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 稀疏（sparse）向量存量重灌。
 *
 * <p><b>背景</b>：sparse 向量此前从未写入过，混合检索一直在空转。
 * 写入侧已改造完成（{@code QdrantService.upsertVector} 支持同时写 dense + sparse），
 * 但受 {@code intelligence.qdrant.named-vectors} 开关控制且默认关闭。
 * 存量数据仍然只有 dense，切换新集合后必须重灌一次，sparse 才能真正参与检索。</p>
 *
 * <p><b>重灌范围</b>：
 * <ol>
 *   <li>阶段1 全库表结构（schema）—— 复用 {@link SchemaVectorManager#vectorizeAllSchemas()}，不重写</li>
 *   <li>阶段2 SOP 程序记忆 —— 复用 {@link ProceduralMemoryService#indexAllSopsToQdrant(int, int)}</li>
 * </ol>
 * 语义缓存（{@code SemanticCacheService}）<b>不重灌</b>：它是可失效缓存，
 * miss 后会自然重建，重灌反而会徒增 embedding 调用且没有任何收益。</p>
 *
 * <p><b>断点续跑</b>（照 {@code StyleVectorBackfillRunner} v3 模式）：
 * Redis 存 stage + 已处理 offset，每批结束写一次，实例重启/重新部署从断点继续，
 * 不会白烧 embedding 额度。进度 TTL 7 天，防止僵尸进度永久卡住。</p>
 *
 * <p><b>幂等</b>：底层是 upsert 同 pointId 覆盖，重复跑无脏数据，最多多烧一次额度。</p>
 *
 * <p><b>默认不自动跑</b>：{@code intelligence.qdrant.sparse-backfill.enabled} 默认 false，
 * 只能由超管手动调用 {@code POST /api/intelligence/qdrant/backfill-sparse-vectors} 触发。</p>
 */
@Slf4j
@Component
public class SparseVectorBackfillRunner implements ApplicationRunner {

    private static final String STAGE_KEY = "sparse-vector-backfill:stage:v1";
    private static final String SOP_OFFSET_KEY = "sparse-vector-backfill:sop-offset:v1";
    private static final String DONE_KEY = "sparse-vector-backfill:done:v1";

    private static final String STAGE_SCHEMA = "SCHEMA";
    private static final String STAGE_SOP = "SOP";
    private static final String STAGE_DONE = "DONE";

    /** 进度 TTL：7 天足够跑完，也避免过期进度永久卡住续跑 */
    private static final long PROGRESS_TTL_DAYS = 7;

    @Autowired(required = false)
    private RedisService redisService;

    @Autowired(required = false)
    private SchemaVectorManager schemaVectorManager;

    @Autowired
    private ProceduralMemoryService proceduralMemoryService;

    @Autowired(required = false)
    private QdrantService qdrantService;

    /** 是否在启动时自动跑一次。默认 false —— 重灌会调几百次 embedding API，只应手动触发。 */
    @Value("${intelligence.qdrant.sparse-backfill.enabled:false}")
    private boolean autoRunEnabled;

    /** SOP 每批条数（每条一次 embedding 调用） */
    @Value("${intelligence.qdrant.sparse-backfill.sop-batch-size:50}")
    private int sopBatchSize;

    /** SOP 最多批次（批次×条数=处理上限，防止超长占用） */
    @Value("${intelligence.qdrant.sparse-backfill.sop-max-batches:200}")
    private int sopMaxBatches;

    /** 并发保护：同一时刻只允许一个重灌任务在跑 */
    private final AtomicBoolean running = new AtomicBoolean(false);

    @Override
    public void run(ApplicationArguments args) {
        if (!autoRunEnabled) {
            log.info("[SparseVectorBackfill] 自动重灌未开启（intelligence.qdrant.sparse-backfill.enabled=false），跳过；"
                    + "如需重灌请由超管调用 POST /api/intelligence/qdrant/backfill-sparse-vectors");
            return;
        }
        startAsync();
    }

    /**
     * 异步触发一次重灌（分阶段 + 断点续跑）。
     *
     * @return true=已启动；false=已有任务在跑，本次忽略
     */
    public boolean startAsync() {
        if (!running.compareAndSet(false, true)) {
            log.warn("[SparseVectorBackfill] 已有重灌任务在执行，本次触发忽略（进度见 "
                    + "GET /api/intelligence/qdrant/backfill-sparse-vectors/progress）");
            return false;
        }
        Thread worker = new Thread(() -> {
            try {
                safeRun();
            } finally {
                running.set(false);
            }
        }, "sparse-vector-backfill");
        worker.setDaemon(true);
        worker.start();
        return true;
    }

    /** 查询当前重灌进度（供管理端点展示） */
    public Map<String, Object> getProgress() {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("running", running.get());
        p.put("qdrantAvailable", qdrantService != null && qdrantService.isAvailable());
        String stage = redisGet(STAGE_KEY);
        p.put("stage", (stage == null || stage.isBlank()) ? "NOT_STARTED" : stage);
        p.put("done", "1".equals(redisGet(DONE_KEY)));
        p.put("sopProcessed", readSopOffset());
        p.put("sopBatchSize", sopBatchSize);
        p.put("sopMaxBatches", sopMaxBatches);
        p.put("autoRunEnabled", autoRunEnabled);
        return p;
    }

    private void safeRun() {
        long start = System.currentTimeMillis();
        try {
            if (qdrantService == null || !qdrantService.isAvailable()) {
                log.warn("[SparseVectorBackfill] Qdrant 不可用，重灌终止（未写入任何数据，下次触发从头开始）");
                return;
            }
            if (redisService != null && "1".equals(redisGet(DONE_KEY))) {
                log.info("[SparseVectorBackfill] 已重灌过（Redis 标记 {} 存在），跳过；"
                        + "确需重跑请先删除该 key", DONE_KEY);
                return;
            }

            String stage = redisGet(STAGE_KEY);
            if (stage == null || stage.isBlank()) {
                stage = STAGE_SCHEMA;
            }
            log.info("[SparseVectorBackfill] 重灌开始，当前阶段={}", stage);

            // ── 阶段 1/2：全库表结构（schema） ──
            if (STAGE_SCHEMA.equals(stage)) {
                log.info("[SparseVectorBackfill] 阶段1/2 开始：全库表结构 schema 向量重灌");
                if (schemaVectorManager == null) {
                    log.warn("[SparseVectorBackfill] SchemaVectorManager 未启用，跳过阶段1");
                } else {
                    int tables = schemaVectorManager.vectorizeAllSchemas();
                    log.info("[SparseVectorBackfill] 阶段1/2 结束：schema 向量化 {} 张表", tables);
                }
                redisSet(STAGE_KEY, STAGE_SOP); // 阶段完成写进度：重启不会重跑 schema
                stage = STAGE_SOP;
            }

            // ── 阶段 2/2：SOP 程序记忆 ──
            int totalOk = 0;
            int totalFailed = 0;
            if (STAGE_SOP.equals(stage)) {
                int offset = readSopOffset();
                log.info("[SparseVectorBackfill] 阶段2/2 开始：SOP 重灌 batchSize={} maxBatches={} 起始offset={}",
                        sopBatchSize, sopMaxBatches, offset);
                for (int batch = 0; batch < sopMaxBatches; batch++) {
                    ProceduralMemoryService.SopIndexResult r =
                            proceduralMemoryService.indexAllSopsToQdrant(offset, sopBatchSize);
                    totalOk += r.getOk();
                    totalFailed += r.getFailed();
                    offset += r.getTotal();
                    log.info("[SparseVectorBackfill] SOP 批次{}/{} 本批total={} ok={} failed={} 累计offset={} 累计ok={} failed={}",
                            batch + 1, sopMaxBatches, r.getTotal(), r.getOk(), r.getFailed(), offset, totalOk, totalFailed);
                    redisSet(SOP_OFFSET_KEY, String.valueOf(offset)); // 断点：本批已完成
                    if (r.getTotal() < sopBatchSize) {
                        break; // 到底了
                    }
                }
                log.info("[SparseVectorBackfill] 阶段2/2 结束：SOP 累计 ok={} failed={}", totalOk, totalFailed);
                redisSet(STAGE_KEY, STAGE_DONE);
            }

            redisSet(DONE_KEY, "1");
            redisDelete(SOP_OFFSET_KEY);
            log.info("[SparseVectorBackfill] 全部阶段完成，SOP ok={} failed={}，耗时 {}s",
                    totalOk, totalFailed, (System.currentTimeMillis() - start) / 1000);
        } catch (Exception e) {
            log.warn("[SparseVectorBackfill] 执行失败（不影响主流程，下次触发从断点续跑）: {}", e.getMessage(), e);
        }
    }

    /** 读取已处理的 SOP 条数（断点续跑起点）；无记录或值损坏则从 0 开始 */
    private int readSopOffset() {
        if (redisService == null) {
            return 0;
        }
        try {
            String v = redisGet(SOP_OFFSET_KEY);
            if (v == null || v.isBlank()) {
                return 0;
            }
            return Math.max(0, Integer.parseInt(v.trim()));
        } catch (Exception e) {
            log.warn("[SparseVectorBackfill] 进度读取失败，从第 0 条开始: {}", e.getMessage());
            return 0;
        }
    }

    private String redisGet(String key) {
        if (redisService == null) {
            return null;
        }
        try {
            return redisService.get(key);
        } catch (Exception e) {
            log.warn("[SparseVectorBackfill] Redis 读取失败 key={}: {}", key, e.getMessage());
            return null;
        }
    }

    private void redisSet(String key, String value) {
        if (redisService == null) {
            return;
        }
        try {
            redisService.set(key, value, PROGRESS_TTL_DAYS, TimeUnit.DAYS);
        } catch (Exception e) {
            log.warn("[SparseVectorBackfill] Redis 写入失败 key={}（不影响本批结果）: {}", key, e.getMessage());
        }
    }

    private void redisDelete(String key) {
        if (redisService == null) {
            return;
        }
        try {
            redisService.delete(key);
        } catch (Exception e) {
            log.warn("[SparseVectorBackfill] Redis 删除失败 key={}: {}", key, e.getMessage());
        }
    }
}
