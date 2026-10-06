package com.fashion.supplychain.intelligence.orchestration.agent;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 巡检会诊去重回归守护（D-702）
 *
 * <p><b>这个缺陷是"花钱花错地方"的典型</b>，靠人工 review 很难持续发现：
 * 代码完全正常、没有报错、巡检照常运行，只是<b>钱花在了重复劳动上</b>。
 *
 * <p><b>生产实测</b>：
 * <pre>
 *   巡检 4 个部门 agent（pmc/qc/finance/ceo）= 今日 35.9 万 tokens
 *   占全部 AI 消耗的 95%（37.8 万中 35.9 万）
 *   而 t_ai_decision_card 近 7 天只新增 2 条
 * </pre>
 *
 * <p><b>根因</b>：{@code isAtRisk} 只看<b>当前</b>的 plannedEndDate 与 productionProgress，
 * <b>不与上次诊断结果比较</b>。已逾期订单（{@code daysToDeadline < 0}）会<b>永远</b>返回 true，
 * 于是每 6 小时把同一批订单重新送进 4 路多智能体辩论 ——
 * 同样的输入必然得到同样的结论。且此处<b>无 LIMIT 上限</b>，订单越多越贵。
 *
 * <p><b>修法要点</b>：用「状态指纹」（进度档位 + 距截止天数档位）做去重键，
 * 状态一变指纹就变 → 自动重新会诊，<b>不损失发现能力</b>。
 */
@DisplayName("巡检去重（D-702：95% token 花在重复会诊上）")
class ProactivePatrolDedupTest {

    private static String source() throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/intelligence/orchestration/agent/ProactivePatrolAgent.java",
                "backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/agent/ProactivePatrolAgent.java")) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 ProactivePatrolAgent.java");
    }

    @Test
    @DisplayName("① 必须在进入多智能体辩论之前做去重判断（否则省不下 token）")
    void dedupRunsBeforeDebate() throws Exception {
        String s = source();
        int atRisk = s.indexOf("if (isAtRisk(order, context))");
        int dedup = s.indexOf("shouldSkipDuplicatedDiagnosis(tenantId, order)");
        int debate = s.indexOf("diagnoseOrderWithMultiAgent(");
        assertThat(atRisk).as("应存在高危判断").isGreaterThan(0);
        assertThat(dedup).as("应存在去重判断").isGreaterThan(0);
        assertThat(debate).as("应存在多智能体辩论调用").isGreaterThan(0);
        assertThat(dedup)
                .as("去重必须在 debate 之前，否则照样花钱")
                .isLessThan(debate);
    }

    @Test
    @DisplayName("② 安全底线：Redis 不可用/异常时必须【不去重】，绝不能漏掉高危订单")
    void dedupFailsOpen() throws Exception {
        String s = source();
        int start = s.indexOf("private boolean shouldSkipDuplicatedDiagnosis");
        assertThat(start).as("应存在去重方法").isGreaterThan(0);
        String m = s.substring(start, Math.min(start + 1500, s.length()));
        assertThat(m)
                .as("去重开关关闭或 Redis 未注入 → 不去重（宁可多花钱）")
                .contains("return false;");
        assertThat(m)
                .as("Redis 异常必须被捕获并按未诊断处理")
                .contains("catch (Exception e)")
                .contains("return false;");
        assertThat(m)
                .as("注入必须 required=false，避免 Redis 缺失导致 Bean 创建失败")
                .doesNotContain("@Autowired\n    private org.springframework.data.redis.core.StringRedisTemplate patrolDedupRedis;");
    }

    @Test
    @DisplayName("③ 去重键必须含状态指纹：状态恶化时要能重新会诊，不能被时间窗永久压住")
    void dedupKeyIncludesStateFingerprint() throws Exception {
        String s = source();
        assertThat(s)
                .as("去重键必须带 orderNo + 指纹")
                .contains("patrol:dedup:")
                .contains("fingerprint(order)");
        int fp = s.indexOf("private String fingerprint");
        assertThat(fp).as("应存在指纹计算方法").isGreaterThan(0);
        String m = s.substring(fp, Math.min(fp + 700, s.length()));
        assertThat(m)
                .as("指纹需含进度与距截止天数两个维度")
                .contains("progressBucket")
                .contains("daysBucket");
    }

    @Test
    @DisplayName("④ 指纹必须按档位取整：进度 31%→32% 属噪声，不该触发重判")
    void fingerprintUsesBuckets() throws Exception {
        String s = source();
        int fp = s.indexOf("private String fingerprint");
        String m = s.substring(fp, Math.min(fp + 700, s.length()));
        assertThat(m)
                .as("按 10% 一档取进度档位，避免小幅波动触发重复会诊")
                .contains("/ 10");
        assertThat(m)
                .as("逾期统一归 -1 档，避免逾期天数天天变化导致每天都重判")
                .contains("days <= 0 ? -1");
    }

    @Test
    @DisplayName("⑤ 去重窗口可配置，且默认 24h（与原先每天 4 轮相比，同单每天只判 1 次）")
    void dedupWindowConfigurable() throws Exception {
        String s = source();
        assertThat(s)
                .as("必须可配置，运维才能按实际需要调整")
                .contains("ai.proactive-patrol.dedup-hours:24");
        assertThat(s).contains("TimeUnit.HOURS");
    }

    @Test
    @DisplayName("⑥ 巡检原有语义不得改动：仍是每 6 小时、仍只诊断高危订单")
    void existingPatrolSemanticsUnchanged() throws Exception {
        String s = source();
        assertThat(s)
                .as("D-700 已把频率降到每 6 小时，不应被回退")
                .contains("ai.proactive-patrol.cron:0 5 0/6 * * ?");
        assertThat(s)
                .as("高危判定逻辑本身不改，只在命中后加去重")
                .contains("daysToDeadline < 0) return true");
    }
}