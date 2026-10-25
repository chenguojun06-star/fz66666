package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.service.QuickAnswerCacheService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.scheduling.annotation.Scheduled;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 秒答缓存过期清理接线（D-882）。
 *
 * <p>背景：D-877 查出 {@code cleanExpiredWithTransaction} 零调用——清理逻辑本身
 * 写得很完整（软删过期行 + 硬删已软删 1 天以上的行），但没有任何调度或调用方。
 * 本地库实测 {@code t_quick_answer}：390 条 SNAPSHOT 里 387 条 {@code delete_flag=1}，
 * 硬删步骤从未执行过；快照每次刷新都会软删旧行，僵尸行只增不减。
 *
 * <p>两层验证：
 * <ol>
 *   <li>行为层：编排器把清理委托给 Service 并回传清理条数</li>
 *   <li>接线层：方法上必须真的有 {@code @Scheduled}（写了方法但没调度 = 本次要修的
 *       那类缺陷本身，光测方法体测不出来）</li>
 * </ol>
 */
@DisplayName("秒答缓存过期清理接线（D-882）：僵尸行不再只增不减")
class QuickAnswerCleanScheduleTest {

    @Test
    @DisplayName("行为：cleanExpiredWithTransaction 委托 Service 并回传清理条数")
    void delegatesToCacheService() {
        QuickAnswerCacheService cacheService = mock(QuickAnswerCacheService.class);
        when(cacheService.cleanExpired()).thenReturn(42);

        QuickAnswerOrchestrator orchestrator = new QuickAnswerOrchestrator();
        ReflectionTestUtils.setField(orchestrator, "quickAnswerCacheService", cacheService);

        int cleaned = orchestrator.cleanExpiredWithTransaction();

        assertEquals(42, cleaned, "必须回传 Service 的清理条数，否则调度方无法感知清理效果");
        verify(cacheService, times(1)).cleanExpired();
    }

    @Test
    @DisplayName("接线守护：方法上必须带 @Scheduled（没调度 = 清理永远不跑）")
    void methodCarriesScheduledAnnotation() throws Exception {
        Method method = QuickAnswerOrchestrator.class.getMethod("cleanExpiredWithTransaction");
        Scheduled scheduled = method.getAnnotation(Scheduled.class);
        assertNotNull(scheduled, "cleanExpiredWithTransaction 没有 @Scheduled——正是 D-877 查出的那类缺陷");

        String cron = scheduled.cron();
        // 与既有每小时任务（0/10/15/20/23/25/30 分档）错开，避免整点前后集中打库
        assertEquals("0 47 * * * ?", cron, "清理应每小时一次；分钟档位需与既有任务错开");
    }

    @Test
    @DisplayName("接线守护：Service 的清理逻辑必须是「软删 + 硬删」两步（只软删不硬删 = 僵尸行永久留存）")
    void cacheServiceCleansBothSoftAndHard() throws Exception {
        Path source = Paths.get("src/main/java/com/fashion/supplychain/intelligence/service/QuickAnswerCacheService.java");
        String code = Files.readString(source, StandardCharsets.UTF_8);
        if (!code.contains("softDeleteExpired") || !code.contains("hardDeleteSoftDeleted")) {
            fail("QuickAnswerCacheService.cleanExpired 缺少软删/硬删步骤——"
                    + "只软删不硬删会让 delete_flag=1 的僵尸行无限堆积（本地库已积 387 行）");
        }
    }
}
