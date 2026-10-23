package com.fashion.supplychain.common.monitor;

import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.mapper.ProductSkuMapper;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import com.fashion.supplychain.system.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * D-846：库存对账巡检（DataConsistencyChecker 新增检查项）的单测。
 *
 * <p>背景（2026-10-23 报障）：11 个款有库存无入库单，对账公式 0 = 110 + 0 + 0，
 * 用户以为数据丢失。此前巡检器的空壳检查发现不了，本测试守护两个新检查项：
 * ① 有库存无入库单必须报出；② 有单但库存≠入库必须报出。
 */
@MockitoSettings(strictness = Strictness.LENIENT)
class DataConsistencyCheckerTest {

    @Mock private ProductionOrderMapper orderMapper;
    @Mock private ScanRecordMapper scanRecordMapper;
    @Mock private CuttingBundleMapper cuttingBundleMapper;
    @Mock private ProductWarehousingMapper warehousingMapper;
    @Mock private MaterialPurchaseMapper materialPurchaseMapper;
    @Mock private MaterialStockMapper materialStockMapper;
    @Mock private StyleInfoMapper styleInfoMapper;
    @Mock private FactoryMapper factoryMapper;
    @Mock private UserMapper userMapper;
    @Mock private ProductSkuMapper productSkuMapper;
    @Mock private com.fashion.supplychain.production.mapper.ProductOutstockMapper productOutstockMapper;

    @InjectMocks
    private DataConsistencyChecker checker;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        // 其他检查项涉及的表默认返回空，聚焦库存对账两个检查
        when(orderMapper.selectList(any())).thenReturn(List.of());
        when(scanRecordMapper.selectList(any())).thenReturn(List.of());
        when(cuttingBundleMapper.selectList(any())).thenReturn(List.of());
        when(materialPurchaseMapper.selectList(any())).thenReturn(List.of());
        when(materialStockMapper.selectList(any())).thenReturn(List.of());
        when(styleInfoMapper.selectList(any())).thenReturn(List.of());
        when(factoryMapper.selectList(any())).thenReturn(List.of());
        when(userMapper.selectList(any())).thenReturn(List.of());
        when(productOutstockMapper.selectList(any())).thenReturn(List.of());
    }

    private static ProductSku sku(String styleNo, int stock) {
        ProductSku s = new ProductSku();
        s.setStyleNo(styleNo);
        s.setStockQuantity(stock);
        return s;
    }

    private static ProductWarehousing inbound(String styleNo, int qty) {
        ProductWarehousing w = new ProductWarehousing();
        w.setStyleNo(styleNo);
        w.setQualifiedQuantity(qty);
        w.setDeleteFlag(0);
        return w;
    }

    private static ProductWarehousing inboundWithDefect(String styleNo, int qualified, int defect) {
        ProductWarehousing w = inbound(styleNo, qualified);
        w.setUnqualifiedQuantity(defect);
        return w;
    }

    private static com.fashion.supplychain.production.entity.ProductOutstock outstock(String styleNo, int qty) {
        com.fashion.supplychain.production.entity.ProductOutstock o =
                new com.fashion.supplychain.production.entity.ProductOutstock();
        o.setStyleNo(styleNo);
        o.setOutstockQuantity(qty);
        o.setDeleteFlag(0);
        return o;
    }

    private static List<String> issueTypes(DataConsistencyChecker.CheckResult r) {
        return r.issues.stream().map(i -> i.type).collect(Collectors.toList());
    }

    @Test
    @DisplayName("有库存无入库单：必须进 issues（本次事故的守护）")
    void flagsStockWithoutInbound() {
        when(productSkuMapper.selectList(any())).thenReturn(List.of(sku("BR26X1Q1011A", 110)));
        when(warehousingMapper.selectList(any())).thenReturn(List.of());

        DataConsistencyChecker.CheckResult r = checker.performFullCheck();

        assertThat(issueTypes(r)).contains("有库存无入库单");
        DataConsistencyChecker.Issue issue = r.issues.stream()
                .filter(i -> "有库存无入库单".equals(i.type)).findFirst().orElseThrow();
        assertThat(issue.detail).contains("BR26X1Q1011A").contains("110");
    }

    @Test
    @DisplayName("有入库单但库存≠入库总量：必须进 issues")
    void flagsStockVsInboundMismatch() {
        when(productSkuMapper.selectList(any())).thenReturn(List.of(sku("H0002", 83)));
        when(warehousingMapper.selectList(any())).thenReturn(List.of(inbound("H0002", 81)));

        DataConsistencyChecker.CheckResult r = checker.performFullCheck();

        assertThat(issueTypes(r)).contains("库存与入库不平");
    }

    @Test
    @DisplayName("账目闭合（库存=入库）时不得误报")
    void noFalsePositiveWhenBalanced() {
        when(productSkuMapper.selectList(any())).thenReturn(List.of(sku("OK-STYLE", 50)));
        when(warehousingMapper.selectList(any())).thenReturn(List.of(inbound("OK-STYLE", 50)));

        DataConsistencyChecker.CheckResult r = checker.performFullCheck();

        assertThat(issueTypes(r)).doesNotContain("有库存无入库单", "库存与入库不平");
    }

    @Test
    @DisplayName("有出库时按「合格入库-出库」判定；次品不参与（不进库存），不得误报")
    void noFalsePositiveWhenOutstockExists() {
        // 入库 100（含次品 5）、出库 30 → 期望库存 70（次品不参与）
        when(productSkuMapper.selectList(any())).thenReturn(List.of(sku("SHIPPED-STYLE", 70)));
        when(warehousingMapper.selectList(any())).thenReturn(List.of(inboundWithDefect("SHIPPED-STYLE", 100, 5)));
        when(productOutstockMapper.selectList(any())).thenReturn(List.of(outstock("SHIPPED-STYLE", 30)));

        DataConsistencyChecker.CheckResult r = checker.performFullCheck();

        assertThat(issueTypes(r)).doesNotContain("库存与入库不平");
    }

    @Test
    @DisplayName("真不平（库存比期望多 2）必须报出，并给出 入库-出库 明细")
    void flagsRealMismatchWithBreakdown() {
        when(productSkuMapper.selectList(any())).thenReturn(List.of(sku("BAD-STYLE", 92)));
        when(warehousingMapper.selectList(any())).thenReturn(List.of(inboundWithDefect("BAD-STYLE", 100, 5)));
        when(productOutstockMapper.selectList(any())).thenReturn(List.of(outstock("BAD-STYLE", 10)));
        // 期望 100-10=90，实际 92 → 差 2

        DataConsistencyChecker.CheckResult r = checker.performFullCheck();

        DataConsistencyChecker.Issue issue = r.issues.stream()
                .filter(i -> "库存与入库不平".equals(i.type)).findFirst().orElseThrow();
        assertThat(issue.detail).contains("BAD-STYLE").contains("入库100").contains("出库10");
    }
}
