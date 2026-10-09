package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.system.entity.Factory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-779：外发工厂产能台账。
 *
 * <p><b>为什么先做台账，而不是直接做「对外发布」</b>：实测生产库
 * {@code t_factory} 有 25 家 EXTERNAL 工厂，但<b>只有 1 家配了 daily_capacity</b>，
 * {@code t_factory_calendar} 0 行、{@code t_factory_shipment} 0 行。
 * 在没有产能数据的��况下做「对外发布」，发布出来是空的 ——
 * 那种「看起来做完了、实际没有任何东西可发」的功能最坑人。
 *
 * <p>所以先把最缺的东西补上：<b>一眼看清哪家能接、哪家超载、哪家压根没填产能</b>。
 * 这也是决定「要不要外推」的前提。
 */
@DisplayName("外发工厂产能台账（D-779）")
class FactoryCapacityLedgerTest {

    /** 台账行的构造方式与编排器保持一致，便于单测直接验证判定口径 */
    private static FactoryCapacityOrchestrator.CapacityLedgerRow row(
            String id, String name, Integer dailyCapacity, int inProgressQty,
            double realDailyOutput, boolean loadDataMissing) {
        FactoryCapacityOrchestrator.CapacityLedgerRow r =
                new FactoryCapacityOrchestrator.CapacityLedgerRow();
        r.setFactoryId(id);
        r.setFactoryName(name);
        r.setDailyCapacity(dailyCapacity);
        r.setInProgressQuantity(inProgressQty);
        r.setRealDailyOutput(realDailyOutput);
        r.setLoadDataMissing(loadDataMissing);
        return r;
    }

    @Test
    @DisplayName("① 未配置产能且无真实扫码数据 → UNCONFIGURED（不得冒充有余量）")
    void unconfiguredCapacityMustNotLookAvailable() {
        FactoryCapacityOrchestrator.CapacityLedgerRow r =
                row("F1", "外部甲厂", null, 0, 0, false);
        FactoryCapacityOrchestrator.applyLedgerStatus(r);
        assertThat(r.getStatus()).isEqualTo("UNCONFIGURED");
        // 没有产能就不能给可用量，避免把「未知」显示成「有」
        assertThat(r.getFreeCapacity30d()).isNull();
        assertThat(r.getLoadRate()).isNull();
    }

    @Test
    @DisplayName("② 配了产能且有排产 → 负荷率与 30 天余量按真实数字算")
    void loadRateAndFreeCapacityComputed() {
        // 日产能 100，在制 1000 件 → 月产能 3000，负荷率 33.3%
        FactoryCapacityOrchestrator.CapacityLedgerRow r =
                row("F2", "外部乙厂", 100, 1000, 0, false);
        FactoryCapacityOrchestrator.applyLedgerStatus(r);
        assertThat(r.getEffectiveDailyCapacity()).isEqualTo(100.0);
        assertThat(r.getCapacity30d()).isEqualTo(3000);
        assertThat(r.getLoadRate()).isEqualTo(33.3);
        assertThat(r.getFreeCapacity30d()).isEqualTo(2000);
        assertThat(r.getStatus()).isEqualTo("AVAILABLE");
    }

    @Test
    @DisplayName("③ 负荷率 > 100% → OVERLOADED（正是需要外推的信号）")
    void overloadedDetected() {
        // 日产能 100，在制 6000 → 月 3000，负荷 200%
        FactoryCapacityOrchestrator.CapacityLedgerRow r =
                row("F3", "外部丙厂", 100, 6000, 0, false);
        FactoryCapacityOrchestrator.applyLedgerStatus(r);
        assertThat(r.getLoadRate()).isEqualTo(200.0);
        assertThat(r.getFreeCapacity30d()).isEqualTo(-3000);
        assertThat(r.getStatus()).isEqualTo("OVERLOADED");
    }

    @Test
    @DisplayName("④ 80%~100% → TIGHT；正好 100% 不算 OVERLOADED")
    void tightBoundary() {
        FactoryCapacityOrchestrator.CapacityLedgerRow tight =
                row("F4", "外部丁厂", 100, 2700, 0, false); // 90%
        FactoryCapacityOrchestrator.applyLedgerStatus(tight);
        assertThat(tight.getStatus()).isEqualTo("TIGHT");

        FactoryCapacityOrchestrator.CapacityLedgerRow full =
                row("F5", "外部戊厂", 100, 3000, 0, false); // 100%
        FactoryCapacityOrchestrator.applyLedgerStatus(full);
        assertThat(full.getStatus()).isEqualTo("TIGHT");
        assertThat(full.getFreeCapacity30d()).isEqualTo(0);
    }

    @Test
    @DisplayName("⑤ 真实扫码产能优先于配置值（实测数据比拍脑袋的配置可信）")
    void realOutputBeatsConfiguredCapacity() {
        FactoryCapacityOrchestrator.CapacityLedgerRow r =
                row("F6", "外部庚厂", 100, 600, 200, false); // 实测 200 > 配置 100
        FactoryCapacityOrchestrator.applyLedgerStatus(r);
        assertThat(r.getEffectiveDailyCapacity()).isEqualTo(200.0);
        assertThat(r.getCapacitySource()).isEqualTo("real");
    }

    @Test
    @DisplayName("⑥ 负载数据缺失时不得按 0% 负荷报 AVAILABLE")
    void missingLoadDataMustNotReportAvailable() {
        FactoryCapacityOrchestrator.CapacityLedgerRow r =
                row("F7", "外部辛厂", 500, 0, 0, true);
        FactoryCapacityOrchestrator.applyLedgerStatus(r);
        assertThat(r.getStatus()).isEqualTo("UNKNOWN");
        // 有产能但没有排产数据 → 余量不可知，不给数字
        assertThat(r.getLoadRate()).isNull();
    }

    @Test
    @DisplayName("⑦ 台账只含外发工厂：内部工厂不得混入对外承接名单")
    void ledgerOnlyExternalFactories() {
        Factory internal = new Factory();
        internal.setFactoryType("INTERNAL");
        internal.setSupplierType(null);
        assertThat(FactoryCapacityOrchestrator.isOutsourceFactory(internal)).isFalse();

        Factory external = new Factory();
        external.setFactoryType("EXTERNAL");
        assertThat(FactoryCapacityOrchestrator.isOutsourceFactory(external)).isTrue();

        // supplierType=OUTSOURCE 也算外发（沿用既有口径）
        Factory bySupplier = new Factory();
        bySupplier.setFactoryType(null);
        bySupplier.setSupplierType("OUTSOURCE");
        assertThat(FactoryCapacityOrchestrator.isOutsourceFactory(bySupplier)).isTrue();

        // 未标注的既不算内部也不算外发，不能猜
        Factory unknown = new Factory();
        assertThat(FactoryCapacityOrchestrator.isOutsourceFactory(unknown)).isFalse();
    }
}