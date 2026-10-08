package com.fashion.supplychain.shop.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-769：跨款式批量调价。
 *
 * <p>批量调价是<b>直接动钱</b>的高危操作，一次可能影响几十上百个 SKU。
 * 因此这里的守护重点不是「新功能能不能跑」，而是<b>出错的代价是否被限制</b>：
 * <ol>
 *   <li>必须能<b>先试算后执行</b>（dryRun），不能一步改钱；</li>
 *   <li>试算必须能<b>提前告知哪些款会转为亏损</b>；</li>
 *   <li>参数必须防<b>误输入</b>（百分比填成 1500、原价未设置时不能瞎猜）；</li>
 *   <li>成本缺失时不得用 0 冒充（否则预警会给出错误结论）。</li>
 * </ol>
 */
@DisplayName("批量调价（D-769：动钱操作必须可控）")
class BatchAdjustPriceTest {

    private static String orch() throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/shop/orchestration/ShopAdminOrchestrator.java",
                "backend/src/main/java/com/fashion/supplychain/shop/orchestration/ShopAdminOrchestrator.java")) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 ShopAdminOrchestrator.java");
    }

    private static String controller() throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/shop/controller/ShopAdminController.java",
                "backend/src/main/java/com/fashion/supplychain/shop/controller/ShopAdminController.java")) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 ShopAdminController.java");
    }

    @Test
    @DisplayName("① 必须支持试算/执行两阶段（dryRun），不能一步改钱")
    void mustSupportDryRun() throws Exception {
        String s = orch();
        assertThat(s)
                .as("必须有 dryRun 参数")
                .contains("boolean dryRun");
        assertThat(s)
                .as("试算时绝不能落库：更新必须被 !dryRun 拦住")
                .contains("if (!dryRun) {")
                .contains("toUpdate.add(k)");
        assertThat(s)
                .as("写库必须只在非试算时执行")
                .contains("if (!dryRun && !toUpdate.isEmpty())");
    }

    @Test
    @DisplayName("② 试算必须提前告知哪些款会转为亏损（专业 ERP 的售价试算）")
    void mustFlagStylesBecomingLoss() throws Exception {
        String s = orch();
        assertThat(s).as("必须有 becomesLoss 判定").contains("becomesLoss");
        assertThat(s).as("必须有亏损计数").contains("lossCount");
        // 口径必须是「调后最低售价 − 最高成本」，与前端毛利列一致
        assertThat(s)
                .as("必须用保守口径，避免『算出来赚钱实际有 SKU 在亏』")
                .contains("marginProfit(newMin, newCostMax)");
        assertThat(s)
                .as("保守口径注释要写明")
                .contains("保守毛利 = 最低售价 − 最高成本");
    }

    @Test
    @DisplayName("③ 成本缺失时不得用 0 冒充（否则亏损预警会给出错误结论）")
    void costMissingMustNotBeTreatedAsZero() throws Exception {
        String s = orch();
        int m = s.indexOf("private static java.math.BigDecimal marginProfit");
        assertThat(m).as("应存在 marginProfit").isGreaterThan(0);
        String body = s.substring(m, Math.min(m + 700, s.length()));
        assertThat(body)
                .as("任一缺失必须返回 null")
                .contains("if (minPrice == null || maxCost == null)")
                .contains("return null");
        assertThat(body).doesNotContain("BigDecimal.ZERO);");
        // 结果里必须显式带上成本是否已知
        assertThat(s).as("结果需带 costKnown").contains("costKnown");
    }

    @Test
    @DisplayName("④ 参数必须有防误输入边界")
    void mustGuardAgainstMistypedInput() throws Exception {
        String s = orch();
        assertThat(s)
                .as("百分比超过 ±100% 必为误操作，必须拦")
                .contains("百分比调整幅度不得超过 100%");
        assertThat(s)
                .as("款式数量上限，防止一次锁表")
                .contains("单次最多批量调整 200 个款式");
        assertThat(s)
                .as("调价方式必须白名单")
                .contains("不支持的调价方式");
        assertThat(s)
                .as("SET 模式售价必须为正")
                .contains("统一设售价必须大于 0");
    }

    /**
     * 原价未设置时不得瞎猜：百分比调整无从算起（0 的 10% 还是 0 吗？），
     * 若按 SET 值填充，等于用一次批量操作「顺手定价」——这是越权猜测。
     */
    @Test
    @DisplayName("⑤ 原价未设置时百分比模式必须跳过，不得顺手定价")
    void percentModeMustSkipUnpricedSku() throws Exception {
        String s = orch();
        assertThat(s)
                .as("百分比模式遇到无原价必须跳过")
                .contains("原价未设置：不猜它应该是多少")
                .contains("if (isPercent) {")
                .contains("continue;");
    }

    @Test
    @DisplayName("⑥ 必须按租户隔离查询（不能批量改动别人的 SKU）")
    void mustScopeByTenant() throws Exception {
        String s = orch();
        int m = s.indexOf("batchAdjustPrice");
        String body = s.substring(m, Math.min(m + 2600, s.length()));
        assertThat(body)
                .as("必须用当前租户过滤")
                .contains("UserContext.tenantId()")
                .contains("ProductSku::getTenantId, tenantId");
    }

    @Test
    @DisplayName("⑦ 端点必须默认试算（漏传 dryRun 时不得直接改钱）")
    void endpointDefaultsToDryRun() throws Exception {
        String s = controller();
        assertThat(s)
                .as("只有显式传 dryRun=false 才允许执行")
                .contains("Boolean.FALSE.equals(body.get(\"dryRun\"))");
        assertThat(s)
                .as("非法数值应返回 400 而不是静默")
                .contains("调价数值格式不正确");
    }
}