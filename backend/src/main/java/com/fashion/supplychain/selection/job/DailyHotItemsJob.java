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

/**
 * 今日热榜定时任务
 * 每天凌晨 2 点自动从 Google Shopping 拉取 10 大品类各 3 件热门商品（≈30件），
 * 写入 t_trend_snapshot（tenantId=0 系统级），供"今日热榜"接口读取。
 */
@Component
@Slf4j
public class DailyHotItemsJob {

    /** 与前端 HOT_KEYWORDS 保持一致 */
    static final List<String> HOT_KEYWORDS = List.of(
            "连衣裙", "卫衣", "外套", "牛仔裤", "T恤",
            "衬衫", "半身裙", "针织衫", "风衣", "西装");

    static final int ITEMS_PER_KEYWORD = 3;
    static final Long SYSTEM_TENANT_ID = 0L;

    @Autowired
    private SerpApiTrendService serpApiTrendService;

    @Autowired
    private TrendSnapshotService snapshotService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Scheduled(cron = "0 0 2 * * ?")
    public void scheduled() {
        execute();
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
                .eq(TrendSnapshot::getDataSource, "GOOGLE_SHOPPING")
                .eq(TrendSnapshot::getTrendType, "DAILY_HOT")
                .eq(TrendSnapshot::getSnapshotDate, today));

        int success = 0, failed = 0;
        for (String keyword : HOT_KEYWORDS) {
            try {
                List<Map<String, Object>> items = serpApiTrendService.searchShopping(keyword, ITEMS_PER_KEYWORD);
                int heatScore = serpApiTrendService.fetchTrendScore(keyword);

                TrendSnapshot snap = new TrendSnapshot();
                snap.setSnapshotDate(today);
                snap.setDataSource("GOOGLE_SHOPPING");
                snap.setTrendType("DAILY_HOT");
                snap.setKeyword(keyword);
                snap.setHeatScore(heatScore >= 0 ? heatScore : 50);
                snap.setTrendData(objectMapper.writeValueAsString(items));
                snap.setPeriod("day");
                snap.setTenantId(SYSTEM_TENANT_ID);
                snapshotService.save(snap);

                log.info("[DailyHotJob] {} → {}条商品, 热度={}", keyword, items.size(), heatScore);
                success++;
                Thread.sleep(1200);  // 避免 SerpApi 限流
            } catch (Exception e) {
                log.warn("[DailyHotJob] 关键词 {} 失败: {}", keyword, e.getMessage());
                failed++;
            }
        }
        log.info("[DailyHotJob] 完成 success={}, failed={}", success, failed);
        return Map.of("success", success, "failed", failed);
    }
}
