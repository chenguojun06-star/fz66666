package com.fashion.supplychain.integration.logistics;

import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * 物流渠道「真接入 / Mock」识别 + Mock 渠道拦截测试
 *
 * <p>存在意义：8 家快递适配器长期是 Mock 实现——运单号是 {@code "SF"+时间戳} 拼的、
 * 运费写死常量、轨迹编造、取消永远返回 true。这些假数据一旦外流：
 * <ul>
 *   <li>假运单号回传电商平台 → 污染平台侧真实订单；</li>
 *   <li>假取消成功 → 用户以为已取消，实际快递仍在途；</li>
 *   <li>假运费报价 → 比价决策失真。</li>
 * </ul>
 * 本测试把「Mock 渠道必须显式报不可用、绝不返回编造数据」这条边界钉死，
 * 防止将来有人为了"让演示看起来正常"而把守卫去掉。
 */
@DisplayName("LogisticsManager - 渠道真伪识别与Mock拦截")
class LogisticsManagerChannelTest {

    private LogisticsManager managerWith(LogisticsService... services) {
        return new LogisticsManager(List.of(services), mock(IntegrationRecordService.class));
    }

    /** 可配置真伪的假适配器；real=false 时方法体虽可返回数据，但管理器应在调用前拦截 */
    private static LogisticsService fake(LogisticsService.LogisticsType type,
                                         String code, String name, boolean real) {
        return new LogisticsService() {
            @Override public String getCompanyName() { return name; }
            @Override public String getCompanyCode() { return code; }
            @Override public LogisticsService.LogisticsType getLogisticsType() { return type; }
            @Override public boolean isRealImplementation() { return real; }
            @Override public ShippingResponse createShipment(ShippingRequest r) {
                return ShippingResponse.success(r.getOrderId(), code + "REAL0001", code);
            }
            @Override public boolean cancelShipment(String t, String r) { return true; }
            @Override public List<TrackingInfo> trackShipment(String t) { return List.of(); }
            @Override public Long estimateShippingFee(ShippingRequest r) { return 999L; }
            @Override public boolean validateAddress(String p, String c, String d) { return true; }
        };
    }

    private static ShippingRequest request(LogisticsService.LogisticsType type) {
        ShippingRequest req = new ShippingRequest();
        req.setOrderId("PO2026001");
        req.setLogisticsType(type);
        return req;
    }

    @Nested
    @DisplayName("isKnownMockChannel - 识别已知Mock渠道")
    class KnownMockChannelTest {

        private final LogisticsManager manager = managerWith(
                fake(LogisticsService.LogisticsType.SF, "SF", "顺丰速运", false),   // Mock
                fake(LogisticsService.LogisticsType.JT, "JT", "极兔速递", true)     // 已真接入
        );

        @Test
        @DisplayName("Mock渠道：按代码识别")
        void shouldDetectMockByCode() {
            assertThat(manager.isKnownMockChannel("SF")).isTrue();
        }

        @Test
        @DisplayName("Mock渠道：按中文名识别")
        void shouldDetectMockByChineseName() {
            assertThat(manager.isKnownMockChannel("顺丰速运")).isTrue();
        }

        @Test
        @DisplayName("Mock渠道：忽略大小写与首尾空白")
        void shouldBeCaseAndSpaceInsensitive() {
            assertThat(manager.isKnownMockChannel("  sf ")).isTrue();
        }

        @Test
        @DisplayName("已真接入的渠道：不视为Mock")
        void realChannelIsNotMock() {
            assertThat(manager.isKnownMockChannel("JT")).isFalse();
            assertThat(manager.isKnownMockChannel("极兔速递")).isFalse();
        }

        @Test
        @DisplayName("未注册的快递公司：不误判（避免误伤平台侧真实快递）")
        void unknownCompanyIsNotMock() {
            assertThat(manager.isKnownMockChannel("德邦快递")).isFalse();
            assertThat(manager.isKnownMockChannel("DHL")).isFalse();
        }

        @Test
        @DisplayName("空值：不误判")
        void blankIsNotMock() {
            assertThat(manager.isKnownMockChannel(null)).isFalse();
            assertThat(manager.isKnownMockChannel("")).isFalse();
            assertThat(manager.isKnownMockChannel("   ")).isFalse();
        }
    }

    @Nested
    @DisplayName("isRealImplementation - 单渠道真伪查询")
    class RealImplementationTest {

        private final LogisticsManager manager = managerWith(
                fake(LogisticsService.LogisticsType.SF, "SF", "顺丰速运", false),
                fake(LogisticsService.LogisticsType.JT, "JT", "极兔速递", true)
        );

        @Test
        @DisplayName("Mock渠道返回false")
        void mockChannelIsFalse() {
            assertThat(manager.isRealImplementation(LogisticsService.LogisticsType.SF)).isFalse();
        }

        @Test
        @DisplayName("真接入渠道返回true")
        void realChannelIsTrue() {
            assertThat(manager.isRealImplementation(LogisticsService.LogisticsType.JT)).isTrue();
        }

        @Test
        @DisplayName("未注册渠道与null：返回false（保守，不假定为真）")
        void unregisteredOrNullIsFalse() {
            assertThat(manager.isRealImplementation(LogisticsService.LogisticsType.YTO)).isFalse();
            assertThat(manager.isRealImplementation(null)).isFalse();
        }
    }

    @Nested
    @DisplayName("requireRealChannel - Mock渠道不得产生假数据")
    class GuardTest {

        private final LogisticsManager manager = managerWith(
                fake(LogisticsService.LogisticsType.SF, "SF", "顺丰速运", false),
                fake(LogisticsService.LogisticsType.JT, "JT", "极兔速递", true)
        );

        @Test
        @DisplayName("Mock渠道：下单寄件被拦截，不返回假运单号")
        void createShipmentBlockedForMock() {
            assertThatThrownBy(() -> manager.createShipment(request(LogisticsService.LogisticsType.SF)))
                    .isInstanceOf(LogisticsManager.LogisticsException.class)
                    .hasMessageContaining("尚未接入真实第三方API");
        }

        @Test
        @DisplayName("Mock渠道：取消运单被拦截，不假报取消成功")
        void cancelShipmentBlockedForMock() {
            assertThatThrownBy(() -> manager.cancelShipment("SF1234567890123", "用户取消",
                    LogisticsService.LogisticsType.SF))
                    .isInstanceOf(LogisticsManager.LogisticsException.class);
        }

        @Test
        @DisplayName("Mock渠道：查轨迹被拦截，不返回编造轨迹")
        void trackShipmentBlockedForMock() {
            assertThatThrownBy(() -> manager.trackShipment("SF1234567890123",
                    LogisticsService.LogisticsType.SF))
                    .isInstanceOf(LogisticsManager.LogisticsException.class);
        }

        @Test
        @DisplayName("Mock渠道：运费报价被拦截，不返回写死的假运费")
        void estimateFeeBlockedForMock() {
            assertThatThrownBy(() -> manager.estimateShippingFee(request(LogisticsService.LogisticsType.SF),
                    LogisticsService.LogisticsType.SF))
                    .isInstanceOf(LogisticsManager.LogisticsException.class);
        }

        @Test
        @DisplayName("比价：Mock渠道返回-1（不可用），不把假报价当真")
        void compareFeesReturnsMinusOneForMock() {
            assertThat(manager.compareShippingFees(request(LogisticsService.LogisticsType.SF)))
                    .containsEntry("顺丰速运", -1L);
        }

        @Test
        @DisplayName("真接入渠道：守卫放行，正常返回")
        void realChannelPassesThrough() {
            ShippingResponse resp = manager.createShipment(request(LogisticsService.LogisticsType.JT));
            assertThat(resp.getTrackingNumber()).isEqualTo("JTREAL0001");
            assertThat(manager.estimateShippingFee(request(LogisticsService.LogisticsType.JT),
                    LogisticsService.LogisticsType.JT)).isEqualTo(999L);
        }
    }
}
