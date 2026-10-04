package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fashion.supplychain.intelligence.entity.AiCostTracking;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Parameter;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Prompt 缓存可观测性回归守护（D-702）
 *
 * <p><b>为什么需要这个测试</b>：调研发现 Prompt Caching 可使 LLM 成本降低 45–80%
 * （arXiv 2601.06007），DeepSeek 缓存命中价约为未命中的 1/10 ——
 * 这是当前 ROI 最高的优化项。但项目此前<b>无法观测缓存命中率</b>：
 * <ol>
 *   <li>字段解析了（{@code prompt_cache_hit_tokens}），却只累计在内存 AtomicLong；</li>
 *   <li>唯一出口是管理接口，且被 {@code if (cacheObservedRequests.get() > 0)} 门控；</li>
 *   <li><b>唯一会打印 cacheHit 的日志行被 {@code shouldRecord()} 门控</b>，而
 *       {@code ai.observability.enabled} 默认 {@code false}、{@code provider} 默认
 *       {@code none}（线上未配置）→ <b>那行日志永远不执行</b>。</li>
 * </ol>
 * 结果是「解析了、统计了，但没人看得见」，等同于没有观测 —— 这正是
 * 「成本账单累计 ¥317 却答不出钱花在哪」的同一类问题。
 *
 * <p>本测试把三处关键事实钉死，使后续无法再退化回「不可观测」。
 */
@DisplayName("Prompt 缓存可观测性（D-702：解析了却没人看得见）")
class PromptCacheObservabilityTest {

    @Test
    @DisplayName("实体必须有 cacheHit/cacheMiss 两列，且列名与 Flyway 一致")
    void entityCarriesCacheTokenColumns() throws Exception {
        assertFieldColumn("promptCacheHitTokens", "prompt_cache_hit_tokens");
        assertFieldColumn("promptCacheMissTokens", "prompt_cache_miss_tokens");
    }

    /**
     * 最容易被忽略的一点：mapper 里是<b>手写 SQL</b>，不走实体的驼峰推导。
     * 实体改了列名而 SQL 没跟上，就会出现「未知列」运行时错误
     * —— 本项目已经踩过一次（{@code sumCostSince} 查 {@code estimated_cost_usd}，
     * 表里实际是 {@code estimated_cost}）。
     */
    @Test
    @DisplayName("手写 SQL 里的列名必须与表真实列名一致（实体映射救不了 @Select）")
    void manualSqlUsesRealColumnNames() throws Exception {
        Field cost = AiCostTracking.class.getDeclaredField("estimatedCostUsd");
        TableField ann = cost.getAnnotation(TableField.class);
        assertThat(ann).as("estimatedCostUsd 必须显式映射").isNotNull();
        assertThat(ann.value()).isEqualTo("estimated_cost");

        // sumCostSince 的 SQL 必须含 estimated_cost，且不得残留 *_usd 写法
        Method m = Class.forName("com.fashion.supplychain.intelligence.mapper.AiCostTrackingMapper")
                .getMethod("sumCostSince", Long.class, java.time.LocalDateTime.class);
        // @Select 的 value() 是 String[]（多行 SQL），必须 join 后再断言
        String sql = String.join("\n", m.getAnnotation(org.apache.ibatis.annotations.Select.class).value());
        assertThat(sql)
                .as("表里真实列名是 estimated_cost；查 estimated_cost_usd 会直接报未知列")
                .contains("estimated_cost")
                .doesNotContain("estimated_cost_usd");
    }

    @Test
    @DisplayName("recordAsync 收的是参数对象而非一长串位置参数")
    void recordAsyncTakesParameterObject() throws Exception {
        Method m = AiCostTrackingOrchestrator.class.getMethod("recordAsync", AiCostTrackingOrchestrator.InferenceCost.class);
        assertThat(m).as("应为单一 record 参数，避免 9 个位置参数被错位调用").isNotNull();

        for (java.lang.reflect.RecordComponent c : AiCostTrackingOrchestrator.InferenceCost.class.getRecordComponents()) {
            assertThat(c.getName()).as("record 组件名不应为空").isNotBlank();
        }
        // 缓存两列必须出现在 record 里，否则调用方无法传入
        boolean hasCache = java.util.Arrays.stream(AiCostTrackingOrchestrator.InferenceCost.class.getRecordComponents())
                .anyMatch(c -> c.getName().toLowerCase().contains("cache"));
        assertThat(hasCache).as("InferenceCost 必须能携带 cacheHit/cacheMiss").isTrue();
    }

    @Test
    @DisplayName("表名正确")
    void tableNameIsCorrect() {
        assertThat(AiCostTracking.class.getAnnotation(TableName.class).value()).isEqualTo("t_ai_cost_tracking");
    }

    private static void assertFieldColumn(String fieldName, String expectedColumn) throws Exception {
        Field f = AiCostTracking.class.getDeclaredField(fieldName);
        TableField ann = f.getAnnotation(TableField.class);
        assertThat(ann).as("%s 必须显式映射（camelCase→snake_case 推导虽恰好同名，但不应依赖巧合）", fieldName).isNotNull();
        assertThat(ann.value()).as("%s 的列名", fieldName).isEqualTo(expectedColumn);
        assertThat(f.getType()).isEqualTo(Integer.class);
    }
}