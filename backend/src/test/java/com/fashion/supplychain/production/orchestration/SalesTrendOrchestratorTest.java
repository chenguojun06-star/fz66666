package com.fashion.supplychain.production.orchestration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.warehouse.constant.OutstockTypeConstants;

/**
 * D-800 销量趋势数据真实性守护测试
 *
 * <p>这些断言的意义不是「测算法对不对」，而是<b>锁死数据口径不被后人改回去</b>：
 * 历史上多处统计把「无数据」兜底成 0、把调拨当销量，导致下单人员看到假的经营数字。
 * 一旦有人把 hasData 改回恒 true、或把类型过滤去掉，本测试立即变红。
 */
class SalesTrendOrchestratorTest {

    @Mock
    private ProductOutstockService productOutstockService;

    private SalesTrendOrchestrator orchestrator;

    private static final Long TENANT = 2L;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        orchestrator = new SalesTrendOrchestrator();
        ReflectionTestUtils.setField(orchestrator, "productOutstockService", productOutstockService);
        UserContext ctx = new UserContext();
        ctx.setTenantId(TENANT);
        ctx.setUserId("u-test");
        UserContext.set(ctx);
    }

    private ProductOutstock row(String styleNo, String color, String size, int qty,
                                LocalDateTime time, String platform, String type) {
        ProductOutstock r = new ProductOutstock();
        r.setTenantId(TENANT);
        r.setStyleNo(styleNo);
        r.setStyleId("1");
        r.setColor(color);
        r.setSize(size);
        r.setOutstockQuantity(qty);
        r.setCreateTime(time);
        r.setPlatformCode(platform);
        r.setOutstockType(type);
        r.setDeleteFlag(0);
        return r;
    }

    @Test
    @DisplayName("无任何流水时 hasData=false —— 不得补零伪装成「销量为零」")
    void noRows_hasDataFalse() {
        when(productOutstockService.list(any(LambdaQueryWrapper.class))).thenReturn(new ArrayList<>());

        Map<String, Object> r = orchestrator.getStyleSalesTrend("ST-NONE", 30);

        assertThat(r.get("hasData")).isEqualTo(false);
        // 无数据时这些字段必须是 null/0，前端据此显示「暂无数据」而不是零线
        assertThat(r.get("totalQty")).isNull();
        assertThat(r.get("dataRange")).isNull();
        assertThat((List<?>) r.get("channels")).isEmpty();
        assertThat(r).containsKey("source");
    }

    @Test
    @DisplayName("查询异常时也返回 hasData=false，不得吞异常后编造数据")
    void queryThrows_hasDataFalse_notCrash() {
        when(productOutstockService.list(any(LambdaQueryWrapper.class)))
                .thenThrow(new RuntimeException("db down"));

        Map<String, Object> r = orchestrator.getStyleSalesTrend("ST-ERR", 30);

        assertThat(r.get("hasData")).isEqualTo(false);
        assertThat(r.get("totalQty")).isNull();
    }

    @Test
    @DisplayName("销售口径：调拨/报废/样衣/冲销 一律不算销量")
    void onlySaleTypesCounted() {
        assertThat(OutstockTypeConstants.isSale("shipment")).isTrue();
        assertThat(OutstockTypeConstants.isSale("free_outbound")).isTrue();
        assertThat(OutstockTypeConstants.isSale("scan_outbound")).isTrue();

        // 内部流转不是销售 —— 这是本次修复的核心口径
        assertThat(OutstockTypeConstants.isSale("transfer_out")).isFalse();
        assertThat(OutstockTypeConstants.isSale("damage_out")).isFalse();
        assertThat(OutstockTypeConstants.isSale("sample_out")).isFalse();
        assertThat(OutstockTypeConstants.isSale("reversal")).isFalse();
        // null 一律不算 —— 不兜底成「是」，避免未知类型被算成销量
        assertThat(OutstockTypeConstants.isSale(null)).isFalse();
    }

    @Test
    @DisplayName("渠道如实反映：取不到就是 null，不猜不兜底")
    void channelNotFabricated() {
        assertThat(OutstockTypeConstants.normalizeChannelForRead(null)).isNull();
        assertThat(OutstockTypeConstants.normalizeChannelForRead("  ")).isNull();
        assertThat(OutstockTypeConstants.normalizeChannelForRead("POS")).isEqualTo("POS");
        assertThat(OutstockTypeConstants.normalizeChannelForRead("SHOP")).isEqualTo("SHOP");
        // 历史裸平台码读取时归一为 EC: 前缀
        assertThat(OutstockTypeConstants.normalizeChannelForRead("TB")).isEqualTo("EC:TB");
        assertThat(OutstockTypeConstants.ecChannel("jd")).isEqualTo("EC:JD");
        assertThat(OutstockTypeConstants.ecChannel(null)).isNull();
    }

    @Test
    @DisplayName("有流水时给出真实总量与数据区间")
    void withRows_realTotals() {
        List<ProductOutstock> rows = List.of(
                row("ST-1", "象牙白", "M", 10, LocalDate.now().minusDays(2).atStartOfDay(), "POS", "free_outbound"),
                row("ST-1", "象牙白", "M", 5, LocalDate.now().minusDays(1).atStartOfDay(), "POS", "free_outbound"));
        when(productOutstockService.list(any(LambdaQueryWrapper.class))).thenReturn(rows);

        Map<String, Object> r = orchestrator.getStyleSalesTrend("ST-1", 30);

        assertThat(r.get("hasData")).isEqualTo(true);
        assertThat(r.get("totalQty")).isEqualTo(15);
        assertThat((Integer) r.get("recordCount")).isEqualTo(2);
        assertThat((String) r.get("dataRange")).isNotBlank();
    }

    @Test
    @DisplayName("色码矩阵：无流水的色码不出现（有流水的才有 key），绝不补全成 0")
    void sizeColorMatrix_onlyRealCells() {
        List<ProductOutstock> rows = List.of(
                row("ST-2", "象牙白", "M", 8, LocalDate.now().atStartOfDay(), "SHOP", "free_outbound"));
        when(productOutstockService.list(any(LambdaQueryWrapper.class))).thenReturn(rows);

        Map<String, Object> r = orchestrator.getStyleSizeColorSalesTrend("ST-2", 30, null, null);

        assertThat(r.get("hasData")).isEqualTo(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> matrix = (Map<String, Object>) r.get("matrix");
        // 只有真实有流水的「象牙白」出现；没有的其他颜色键都不存在（不是 0）
        assertThat(matrix).containsKey("象牙白");
        assertThat(matrix).doesNotContainKey("黑色");
        @SuppressWarnings("unchecked")
        Map<String, Object> sizeMap = (Map<String, Object>) matrix.get("象牙白");
        assertThat(sizeMap).containsKey("M");
        assertThat(sizeMap).doesNotContainKey("L");
        @SuppressWarnings("unchecked")
        Map<String, Object> cell = (Map<String, Object>) sizeMap.get("M");
        assertThat(cell.get("totalQty")).isEqualTo(8);
        assertThat(cell.get("hasData")).isEqualTo(true);
        // 该色码确实有流水，中间的空白日期补 0 是「那天真的没卖」，属事实陈述
        assertThat((List<?>) cell.get("points")).hasSize(30);
    }

    @Test
    @DisplayName("色码矩阵：有流水但全部缺色码时，明确说明原因而非返回空壳")
    void sizeColorMatrix_noColorSize_explainsWhy() {
        List<ProductOutstock> rows = List.of(
                row("ST-3", null, null, 3, LocalDate.now().atStartOfDay(), null, "shipment"));
        when(productOutstockService.list(any(LambdaQueryWrapper.class))).thenReturn(rows);

        Map<String, Object> r = orchestrator.getStyleSizeColorSalesTrend("ST-3", 30, null, null);

        assertThat(r.get("hasData")).isEqualTo(false);
        assertThat(r.get("noColorSizeReason")).isNotNull();
    }

    @Test
    @DisplayName("days 非法值回落到默认值，不抛异常也不返回空数据")
    void daysNormalized() {
        when(productOutstockService.list(any(LambdaQueryWrapper.class))).thenReturn(new ArrayList<>());
        assertThat(orchestrator.getStyleSalesTrend("ST-X", null).get("days")).isEqualTo(30);
        assertThat(orchestrator.getStyleSalesTrend("ST-X", 0).get("days")).isEqualTo(30);
        assertThat(orchestrator.getStyleSalesTrend("ST-X", 9999).get("days")).isEqualTo(180);
    }
}