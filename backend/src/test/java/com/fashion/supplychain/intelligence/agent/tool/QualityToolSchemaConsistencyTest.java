package com.fashion.supplychain.intelligence.agent.tool;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-760：质检类工具查询的列/表必须与生产库真实结构一致。
 *
 * <p><b>事故</b>：工具里用 {@code QueryWrapper.eq("列名", …)} 传的是<b>字符串列名</b>，
 * 编译器完全不管 —— 列名写错时编译通过、门禁全过、单测也过，
 * <b>只有真被 LLM 选中并执行时才报 {@code ERROR 1054 Unknown column}</b>。
 *
 * <p>实测三个缺陷（2026-10-07 用生产库逐列核实）：
 * <ol>
 *   <li>{@code QualityStatisticsTool} 查 {@code quality_status}×6 / {@code order_no}×4 /
 *       {@code quality_remark}，且状态值 {@code REJECTED/REPAIRING/REPAIR_COMPLETED/SCRAPPED}
 *       在生产数据里一个都不存在</li>
 *   <li>{@code ComplianceExpertTool} 同样查 {@code quality_status/quality_remark}，
 *       另在 {@code t_product_warehousing} 上查不存在的 {@code factory_id}</li>
 *   <li>{@code BusinessSnapshotPrefetcher} 查不存在的表 {@code t_quality_inspection}
 *       → 兜底返回 -1 → 渲染成「暂无数据」，静默失效且零告警</li>
 * </ol>
 *
 * <p>本测试把「不得再引用这些不存在的列/表」钉死，防止重构或新需求时被重新引入。
 */
@DisplayName("D-760 质检工具列名/状态值必须与生产表一致")
class QualityToolSchemaConsistencyTest {

    /**
     * 生产 {@code t_cutting_bundle} 的真实列（2026-10-07 由 INFORMATION_SCHEMA 导出）。
     * 用于说明「哪些列真的存在」，测试只断言不存在的那几个不再被引用。
     */
    private static final Set<String> CUTTING_BUNDLE_REAL_COLUMNS = Set.of(
            "id", "production_order_id", "production_order_no", "style_id", "style_no",
            "color", "size", "bundle_no", "quantity", "bed_no", "qr_code", "status",
            "create_time", "update_time", "creator_id", "creator_name", "operator_id",
            "operator_name", "tenant_id", "root_bundle_id", "parent_bundle_id",
            "source_bundle_id", "bundle_label", "split_status", "split_seq", "bed_sub_no",
            "split_process_name", "split_process_order", "factory_id", "scan_blocked",
            "layer_count", "assignee_id", "assignee_name", "factory_name", "delegate_processes");

    /** 权威质检状态取值（与 production.service.impl.ProductWarehousingHelper 的常量一致） */
    private static final List<String> AUTHORITATIVE_STATUS =
            List.of("qualified", "unqualified", "repaired", "repaired_waiting_qc", "completed");

    /** 本工具实际按状态统计的取值（completed=已完成，本工具不按它统计） */
    private static final List<String> STATUS_USED_BY_TOOL =
            List.of("qualified", "unqualified", "repaired", "repaired_waiting_qc");

    /**
     * 读取源码并**去掉注释**后返回。
     *
     * <p>必须去注释：修复时在 javadoc 里记录了「原先查的是 quality_status / REJECTED」这类
     * 事故说明，若连同注释一起断言，测试会因为这些**说明文字**而假红。
     * 本测试要断言的是「真实代码不再查询这些列」，不是「文件里不能出现这个词」。
     */
    private static String read(String simpleName) throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/intelligence/agent/tool/" + simpleName,
                "backend/src/main/java/com/fashion/supplychain/intelligence/agent/tool/" + simpleName,
                "src/main/java/com/fashion/supplychain/intelligence/job/" + simpleName,
                "backend/src/main/java/com/fashion/supplychain/intelligence/job/" + simpleName)) {
            Path path = Path.of(p);
            if (Files.exists(path)) {
                return stripComments(Files.readString(path, StandardCharsets.UTF_8));
            }
        }
        throw new AssertionError("找不到 " + simpleName);
    }

    /** 去掉 // 行注释与 /* ... *&#47; 块注释（够用即可，不追求完整词法分析） */
    private static String stripComments(String src) {
        String noBlock = src.replaceAll("(?s)/\\*.*?\\*/", "");
        return noBlock.replaceAll("(?m)//.*$", "");
    }

    @Test
    @DisplayName("① 前提校验：被断言为「不存在」的列确实不在真实列集合里")
    void phantomColumnsAreTrulyPhantom() {
        assertThat(CUTTING_BUNDLE_REAL_COLUMNS)
                .as("quality_status 不应存在于 t_cutting_bundle")
                .doesNotContain("quality_status");
        assertThat(CUTTING_BUNDLE_REAL_COLUMNS)
                .as("quality_remark 不应存在于 t_cutting_bundle")
                .doesNotContain("quality_remark");
        assertThat(CUTTING_BUNDLE_REAL_COLUMNS)
                .as("订单号列是 production_order_no，不是 order_no")
                .contains("production_order_no")
                .doesNotContain("order_no");
    }

    @Test
    @DisplayName("② 质检工具不得再引用不存在的列（按各自查询的表区分）")
    void noPhantomColumnsInQualityTools() throws Exception {
        // quality_remark：t_cutting_bundle 与 t_product_warehousing **都没有**这一列 → 两个文件都不许有
        for (String f : List.of("QualityStatisticsTool.java", "ComplianceExpertTool.java")) {
            assertThat(read(f)).as(f + " 不得引用不存在的列 quality_remark").doesNotContain("quality_remark");
        }
        // quality_status：**只在 t_product_warehousing 上合法**（该表确实有这一列）。
        // QualityStatisticsTool 只查 t_cutting_bundle，而该表无此列 → 该文件不得出现。
        // ⚠️ 不能对整个 ComplianceExpertTool 禁 —— 它查 t_product_warehousing 时用 quality_status 是正确的。
        assertThat(read("QualityStatisticsTool.java"))
                .as("QualityStatisticsTool 只查 t_cutting_bundle，该表无 quality_status 列")
                .doesNotContain("quality_status");
    }

    @Test
    @DisplayName("③ 裁剪菲的订单号必须用 production_order_no")
    void cuttingBundleUsesProductionOrderNo() throws Exception {
        String src = read("QualityStatisticsTool.java");
        assertThat(src)
                .as("必须用真实列名 production_order_no")
                .contains("production_order_no");
    }

    @Test
    @DisplayName("④ 状态值必须用权威取值，不得再用不存在的 REJECTED/REPAIRING/SCRAPPED")
    void usesAuthoritativeStatusValues() throws Exception {
        String src = read("QualityStatisticsTool.java");
        for (String ok : STATUS_USED_BY_TOOL) {
            assertThat(src).as("应包含权威状态值 " + ok).contains(ok);
        }
        // 前提自检：这些值确实在权威集合里
        assertThat(AUTHORITATIVE_STATUS).containsAll(STATUS_USED_BY_TOOL);
        assertThat(src).as("不得再用不存在的状态值 REJECTED").doesNotContain("REJECTED");
        assertThat(src).as("不得再用不存在的状态值 REPAIRING").doesNotContain("REPAIRING");
        assertThat(src).as("不得再用不存在的状态值 SCRAPPED").doesNotContain("SCRAPPED");
    }

    @Test
    @DisplayName("⑤ t_product_warehousing 只有 factory_name，不得再按 factory_id 过滤")
    void productWarehousingFiltersByFactoryName() throws Exception {
        String src = read("ComplianceExpertTool.java");
        assertThat(src)
                .as("t_product_warehousing 无 factory_id 列，必须改用 factory_name")
                .doesNotContain("\"factory_id\"");
        assertThat(src).contains("\"factory_name\"");
    }

    @Test
    @DisplayName("⑥ 业务快照不得再引用不存在的表 t_quality_inspection")
    void snapshotPrefetcherNoPhantomTable() throws Exception {
        String src = read("BusinessSnapshotPrefetcher.java");
        assertThat(src)
                .as("t_quality_inspection 在生产库不存在，原查询必然静默失败")
                .doesNotContain("t_quality_inspection");
        assertThat(src)
                .as("应改查真实数据源 t_cutting_bundle")
                .contains("t_cutting_bundle");
    }
}
