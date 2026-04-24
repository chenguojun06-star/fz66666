package com.fashion.supplychain.selection.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.selection.entity.TrendSnapshot;
import com.fashion.supplychain.selection.service.SerpApiTrendService;
import com.fashion.supplychain.selection.service.TrendSnapshotService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import com.fashion.supplychain.common.lock.DistributedLockService;
import org.springframework.beans.factory.annotation.Value;

@Component
@Slf4j
public class DailyHotItemsJob {

    static final List<String> HOT_KEYWORDS = List.of(
            "连衣裙", "卫衣", "外套", "牛仔裤", "T恤",
            "衬衫", "半身裙", "针织衫", "风衣", "西装",
            "夹克", "羽绒服");

        static final int ITEMS_PER_SOURCE = 2;
    static final Long SYSTEM_TENANT_ID = 0L;

    @Autowired
    private SerpApiTrendService serpApiTrendService;

    @Autowired
    private TrendSnapshotService snapshotService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    @Value("${selection.daily-hot.cron-enabled:false}")
    private boolean cronEnabled;

    @Scheduled(cron = "0 0 2 * * ?")
    public void scheduled() {
        if (!cronEnabled) {
            log.debug("[DailyHotJob] 定时任务未启用，跳过（selection.daily-hot.cron-enabled=false）");
            return;
        }
        if (distributedLockService != null) {
            String lockValue = distributedLockService.tryLock("job:daily-hot-items", 30, TimeUnit.MINUTES);
            if (lockValue == null) {
                log.info("[DailyHotJob] 其他实例正在执行，跳过");
                return;
            }
            try {
                execute();
            } finally {
                distributedLockService.unlock("job:daily-hot-items", lockValue);
            }
        } else {
            execute();
        }
    }

    /**
     * 可手动调用（Controller 触发 / 测试用）。
     * @return { success: N, failed: M }
     */
    public Map<String, Integer> execute() {
        if (!serpApiTrendService.isReady()) {
            log.warn("[DailyHotJob] SerpApi 未配置，跳过今日热榜拉取");
            return Map.of("success", 0, "failed", 0);
        }

        LocalDate today = LocalDate.now();
        log.info("[DailyHotJob] 开始拉取今日热榜，日期={}", today);

        // 幂等：先清除当天旧数据，确保重跑安全
        snapshotService.remove(new LambdaQueryWrapper<TrendSnapshot>()
                .eq(TrendSnapshot::getTenantId, SYSTEM_TENANT_ID)
                .eq(TrendSnapshot::getTrendType, "DAILY_HOT")
                .eq(TrendSnapshot::getSnapshotDate, today));

        int success = 0, failed = 0;
        for (String keyword : HOT_KEYWORDS) {
            try {
                int heatScore = serpApiTrendService.fetchTrendScore(keyword);
                for (Map<String, String> source : serpApiTrendService.getMarketSourceSummaries()) {
                    String dataSource = source.get("dataSource");
                    List<Map<String, Object>> items = serpApiTrendService.searchBySource(dataSource, keyword, ITEMS_PER_SOURCE);
                    if (items.isEmpty()) {
                        failed++;
                        continue;
                    }

                    TrendSnapshot snap = new TrendSnapshot();
                    snap.setSnapshotDate(today);
                    snap.setDataSource(dataSource);
                    snap.setTrendType("DAILY_HOT");
                    snap.setKeyword(keyword);
                    snap.setHeatScore(heatScore >= 0 ? heatScore : 50);
                    snap.setTrendData(objectMapper.writeValueAsString(items));
                    snap.setAiSummary(source.get("label"));
                    snap.setPeriod("day");
                    snap.setTenantId(SYSTEM_TENANT_ID);
                    snapshotService.save(snap);

                    log.info("[DailyHotJob] {} {} → {}条商品, 热度={}", source.get("label"), keyword, items.size(), heatScore);
                    success++;
                    Thread.sleep(900);  // 避免 SerpApi 限流
                }
            } catch (Exception e) {
                log.warn("[DailyHotJob] 关键词 {} 失败: {}", keyword, e.getMessage());
                failed++;
            }
        }
        log.info("[DailyHotJob] 完成 success={}, failed={}", success, failed);
        return Map.of("success", success, "failed", failed);
    }
}
