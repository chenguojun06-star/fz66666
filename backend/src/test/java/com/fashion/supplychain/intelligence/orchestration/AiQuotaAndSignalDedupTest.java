package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AI 成本与信号数据准确性回归守护（D-702 P0）
 *
 * <p>本组修的是<b>系统性问题</b>，不是单点 bug —— 前几个提交都只解决了
 * 「工具能不能被调用」，而这里暴露的是**调用量本身失控**：
 *
 * <ol>
 *   <li><b>配额形同虚设</b>：{@code dailyQuotaPerTenant=50}，实际调用 209 次（超 4 倍）。
 *       根因是配额检查只在独立的 {@code checkAndConsumeQuota()} 里，由 19 个调用方
 *       「记得自己调」；而 {@code chat()} 等真正发请求的出口<b>完全不检查</b>。
 *       最典型：{@code IntelligenceSignalOrchestrator} 先 check 一次（计数 +1），
 *       随后 {@code enrichWithAiAnalysis} 用 {@code .limit(5)} 连发 5 次 chat，
 *       <b>5 次全部绕过配额</b>。</li>
 *   <li><b>信号表膨胀 15 万行</b>：{@code persistSignals} 是无条件 insert，
 *       采集任务每半小时跑一次 → 实测 155,276 行里只有 129 个真实信号，
 *       {@code stock_below_safety} 重复 41,588 次；又因全部 status='open'，
 *       {@code getOpenSignals(LIMIT 50)} 返回的很可能是同一信号的重复，
 *       前端「智能驾驶舱」看到的不是真实信号。</li>
 *   <li><b>AI 分析重复付费</b>：即使信号内容毫无变化，每轮仍重跑一遍 AI 分析。</li>
 * </ol>
 */
@DisplayName("AI 配额收口与信号去重（D-702 P0：配额超 4 倍 / 信号表膨胀 15 万行）")
class AiQuotaAndSignalDedupTest {

    private static final List<String> SIG_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/orchestration/IntelligenceSignalOrchestrator.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/IntelligenceSignalOrchestrator.java");
    private static final List<String> ADV_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/service/AiAdvisorService.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAdvisorService.java");
    private static final List<String> MIG_CANDIDATES = List.of(
            "src/main/resources/db/migration/V202610050001__dedupe_intelligence_signal.sql",
            "backend/src/main/resources/db/migration/V202610050001__dedupe_intelligence_signal.sql");

    private static String read(List<String> c) throws Exception {
        for (String p : c) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到文件: " + c);
    }

    private static String methodBody(String src, String signature) {
        int start = src.indexOf(signature);
        assertThat(start).as("应存在方法: %s", signature).isGreaterThan(0);
        int next = src.indexOf("\n    private ", start + signature.length());
        int nextPub = src.indexOf("\n    public ", start + signature.length());
        if (next < 0) next = src.length();
        if (nextPub > 0 && nextPub < next) next = nextPub;
        return src.substring(start, next);
    }

    @Test
    @DisplayName("① 配额必须在 invoke() 收口：真正发请求的出口不能不做检查")
    void quotaEnforcedAtInvoke() throws Exception {
        String s = read(ADV_CANDIDATES);
        String invoke = methodBody(s, "private IntelligenceInferenceResult invoke(");
        assertThat(invoke)
                .as("检查若只放在 checkAndConsumeQuota 里，调用方忘记调就完全绕过（实测超 4 倍）")
                .contains("tryConsumeQuotaInternal");
        assertThat(invoke)
                .as("超限必须构造失败结果，而不是继续发请求")
                .contains("daily-quota-exceeded")
                .contains("return result;");
    }

    @Test
    @DisplayName("① 无租户上下文必须归系统桶，不得直接放行不计量")
    void noTenantFallsIntoSystemBucket() throws Exception {
        String s = read(ADV_CANDIDATES);
        String invoke = methodBody(s, "private IntelligenceInferenceResult invoke(");
        assertThat(invoke)
                .as("与 AiAgentTokenBudgetService 的 SYSTEM_TENANT_ID=0 口径保持一致")
                .contains("UserContext.tenantId()")
                .contains("SYSTEM_TENANT_ID");
    }

    @Test
    @DisplayName("① checkAndConsumeQuota 只能查询、不得计数：否则与 invoke 双重计数吃掉一半额度")
    void preCheckMustNotDoubleCount() throws Exception {
        String s = read(ADV_CANDIDATES);
        String pre = methodBody(s, "public boolean checkAndConsumeQuota(Long tenantId)");
        assertThat(pre)
                .as("纯查询，不含 incrementAndGet")
                .doesNotContain("incrementAndGet")
                .contains("isQuotaAvailable");
        // 唯一计数点：tryConsumeQuotaInternal
        String consume = methodBody(s, "private boolean tryConsumeQuotaInternal(long effectiveTenantId)");
        assertThat(consume).contains("incrementAndGet");
        assertThat(consume)
                .as("被拒绝的请求必须回滚计数，不能白吃额度")
                .contains("count.decrementAndGet()");
    }

    @Test
    @DisplayName("② 统计上唯一的计数点：全类只允许一处 incrementAndGet")
    void onlyOneCountingSite() throws Exception {
        String s = read(ADV_CANDIDATES);
        long sites = s.lines().filter(l -> l.contains("incrementAndGet")).count();
        assertThat(sites)
                .as("多处计数 = 计数与真实调用脱节，配额再次失去意义")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("② persistSignals 必须是幂等 upsert，不得无条件 insert")
    void persistSignalsIsIdempotent() throws Exception {
        String s = read(SIG_CANDIDATES);
        String persist = methodBody(s, "private void persistSignals(List<SignalItem> items, Long tenantId)");
        assertThat(persist)
                .as("每半小时无条件 insert 是 15 万重复行的根因")
                .contains("findOpenSignal")
                .contains("updateById")
                .contains("continue;");
        // 存在性判断必须先于 insert
        assertThat(persist.indexOf("findOpenSignal"))
                .as("存在性检查必须在 insert 之前")
                .isLessThan(persist.indexOf("signalMapper.insert"));
    }

    @Test
    @DisplayName("② 去重键必须含 source_id：同一 signal_code 会对多个业务对象产生")
    void dedupeKeyIncludesSourceId() throws Exception {
        String s = read(SIG_CANDIDATES);
        String find = methodBody(s, "private IntelligenceSignal findOpenSignal(Long tenantId, String signalCode, String sourceId)");
        assertThat(find)
                .as("缺 source_id 会把 1.2 万个订单的 order_delay_risk 误合并成一条")
                .contains("tenant_id")
                .contains("signal_code")
                .contains("source_id")
                .contains("status")
                .contains("delete_flag");
    }

    @Test
    @DisplayName("③ AI 分析必须跳过已有结论的信号：内容未变就没必要重复付费")
    void aiAnalysisReusesExistingResult() throws Exception {
        String s = read(SIG_CANDIDATES);
        String enrich = methodBody(s, "private void enrichWithAiAnalysis(List<SignalItem> signals, Long tenantId)");
        assertThat(enrich)
                .as("每轮重跑 = 240 次/天的纯浪费")
                .contains("findExistingAnalysis");
        assertThat(enrich.indexOf("findExistingAnalysis"))
                .as("命中已有分析应直接复用并跳过调用")
                .isLessThan(enrich.indexOf("aiAdvisorService.chat"));
    }

    @Test
    @DisplayName("④ 迁移脚本必须先备份再删除，且带数据库级唯一约束兜底")
    void migrationBacksUpThenDedupesThenConstrains() throws Exception {
        String mig = read(MIG_CANDIDATES);
        int backup = mig.indexOf("t_intelligence_signal_bak_d702");
        int delete = mig.indexOf("DELETE t FROM t_intelligence_signal");
        int unique = mig.indexOf("uk_intelligence_signal_dedupe");
        assertThat(backup).as("必须备份，删除 15 万行不可逆").isGreaterThan(0);
        assertThat(delete).as("必须有去重删除").isGreaterThan(0);
        assertThat(unique).as("必须有唯一索引兜底").isGreaterThan(0);
        assertThat(backup).as("备份必须在删除之前").isLessThan(delete);
        assertThat(delete).as("删除必须在建索引之前，否则索引创建会因重复值失败").isLessThan(unique);
        // NULL 参与唯一索引的问题必须用生成列规避
        assertThat(mig)
                .as("source_id 可能为 NULL；MySQL 唯一索引里 NULL 互不相等，需生成列归一")
                .contains("GENERATED ALWAYS AS")
                .contains("IFNULL");
    }

    @Test
    @DisplayName("⑤ 配额字段默认值应贴合真实用量：50 次/租户/日与后台采集量不匹配")
    void quotaDefaultIsDocumentedNotSilentlyTiny() throws Exception {
        Field f = AiAdvisorService.class.getDeclaredField("dailyQuotaPerTenant");
        assertThat(Modifier.isPrivate(f.getModifiers())).isTrue();
        String s = read(ADV_CANDIDATES);
        assertThat(s)
                .as("默认值应可通过环境变量覆盖，并说明它约束的是什么")
                .contains("ai.deepseek.daily-quota-per-tenant");
        assertThat(methodBody(s, "private boolean isQuotaAvailable(long effectiveTenantId)"))
                .as("0=不限 的语义要保留，避免误配导致完全失效")
                .contains("dailyQuotaPerTenant <= 0");
    }
}