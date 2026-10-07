package com.fashion.supplychain.intelligence.job;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-702：离线评测集防静默清空。
 *
 * <p>{@code t_eval_item} 曾长期恒为 0，而 {@link OfflineEvalJob} 每周抽样一次，
 * 采样为 0 时只 {@code log.info}「无对话可采样」——把「数据源未接通」说成
 * 「没人提问」，于是每周都跳过、看起来一切正常，没有任何告警。
 *
 * <p>真实原因：{@code sampleConversations} 从 {@code t_ai_conversation_memory}（MySQL）
 * 抽样，而 {@code AiAgentMemoryHelper.saveConversationTurn()} 只写 Redis
 * （{@code fashion:chat:memory:{tenant}:{user}}），MySQL 侧无任何写入方。
 * 生产实测：Redis 键有 31KB 内容且 TTL 正常，而 MySQL 表 0 行。
 *
 * <p>因此防复发靠两件事：
 * <ol>
 *   <li><b>人工沉淀的真实事故回归集</b>——不依赖对话采样，故障即用例；</li>
 *   <li><b>采样为 0 必须 WARN 并说明真实原因</b>，不得再伪装成「无提问」。</li>
 * </ol>
 */
@DisplayName("离线评测集防静默清空（D-702）")
class RegressionEvalDatasetGuardTest {

    private static String read(String rel) throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/intelligence/" + rel,
                "backend/src/main/java/com/fashion/supplychain/intelligence/" + rel,
                "src/main/resources/" + rel,
                "backend/src/main/resources/" + rel)) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 " + rel);
    }

    @Test
    @DisplayName("① 必须存在回归用例种子迁移，且覆盖今天两个真实事故")
    void regressionSeedMigrationExists() throws Exception {
        String sql = read("db/migration/V202611080000__seed_regression_eval_dataset_d702.sql");
        assertThat(sql)
                .as("数据集类型必须是 regression（不参与每周抽样）")
                .contains("'regression'");
        assertThat(sql).as("必须写入 t_eval_item").contains("INSERT INTO `t_eval_item`");

        // 今天两个真实事故各至少一条用例
        assertThat(sql)
                .as("必须含「空内容覆盖」事故用例（你会什么啊）")
                .contains("你会什么啊")
                .contains("小云暂时无法给出回答");
        assertThat(sql)
                .as("必须含「上下文劫持」事故用例（订单号被异常直查劫持）")
                .contains("PO20260901172615")
                .contains("D-755");
    }

    @Test
    @DisplayName("② 种子迁移必须幂等——Flyway 会重跑，且云端本地各跑一次")
    void seedMigrationIsIdempotent() throws Exception {
        String sql = read("db/migration/V202611080000__seed_regression_eval_dataset_d702.sql");
        assertThat(sql)
                .as("数据集插入必须带 NOT EXISTS 守卫")
                .contains("WHERE NOT EXISTS")
                .contains("t_eval_dataset");
        assertThat(sql)
                .as("用例插入必须按 session_id 去重")
                .contains("i.`session_id` = t.`session_id`");
        // 禁止裸 DELETE（校验脚本会判为全表删除告警，且语义危险）
        assertThat(sql).doesNotContain("DELETE FROM");
    }

    @Test
    @DisplayName("③ 临时表字符集必须显式对齐——否则云端报 ERROR 1267（实测踩过）")
    void tempTableCollationAligned() throws Exception {
        String sql = read("db/migration/V202611080000__seed_regression_eval_dataset_d702.sql");
        assertThat(sql)
                .as("必须显式指定字符集与业务表一致")
                .contains("COLLATE = utf8mb4_0900_ai_ci");
        assertThat(sql)
                .as("踩坑注释必须保留，避免后人删掉这行")
                .contains("Illegal mix of collations");
    }

    @Test
    @DisplayName("④ 采样为 0 必须 WARN 并说明真实原因，不得再伪装成「无提问」")
    void zeroSampleMustWarnWithRealCause() throws Exception {
        String job = read("job/OfflineEvalJob.java");
        int i = job.indexOf("sampled <= 0");
        assertThat(i).as("应存在采样为 0 的分支").isGreaterThan(0);
        String seg = job.substring(i, Math.min(i + 1600, job.length()));
        assertThat(seg)
                .as("必须是 WARN，info 会被淹没在海量日志里")
                .contains("log.warn");
        assertThat(seg)
                .as("必须点明真实原因是数据源未接通")
                .contains("t_ai_conversation_memory")
                .contains("非用户无提问");
    }
}
