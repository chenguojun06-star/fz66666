package com.fashion.supplychain.integration.logistics;

import com.fashion.supplychain.integration.logistics.LogisticsService.LogisticsException;
import com.fashion.supplychain.integration.logistics.LogisticsService.LogisticsType;
import com.fashion.supplychain.integration.logistics.impl.EMSAdapter;
import com.fashion.supplychain.integration.logistics.impl.JDAdapter;
import com.fashion.supplychain.integration.logistics.impl.JTAdapter;
import com.fashion.supplychain.integration.logistics.impl.SFExpressAdapter;
import com.fashion.supplychain.integration.logistics.impl.STOAdapter;
import com.fashion.supplychain.integration.logistics.impl.YDAdapter;
import com.fashion.supplychain.integration.logistics.impl.YTOAdapter;
import com.fashion.supplychain.integration.logistics.impl.ZTOAdapter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 物流适配器「fail-closed」守护测试
 *
 * <p>存在意义：8 家快递适配器曾长期返回编造数据（{@code "SF"+时间戳} 运单号、
 * 写死运费、编造轨迹、取消永远 true）。本测试把"未实现的能力必须显式报不可用、
 * 绝不返回编造数据"这条底线钉死——**任何人重新往适配器里塞 mock 返回值，这里就会红**。
 *
 * <p>设计要点：只对 {@code isRealImplementation() == false} 的渠道断言 fail-closed。
 * 将来某家真正接入后，其 {@code isRealImplementation()} 返回 true，本测试自动跳过它
 * （该渠道的行为应由它自己的真实实现测试覆盖），因此本测试长期有效、无需改写。
 */
@DisplayName("物流适配器 - 未实现必须显式不可用（fail-closed）")
class LogisticsAdapterFailClosedTest {

    /** 全部 8 家适配器；新增渠道时必须同步登记，见 {@link #shouldCoverAllLogisticsTypes()} */
    private static final List<Class<? extends LogisticsService>> ADAPTER_CLASSES = List.of(
            SFExpressAdapter.class,
            STOAdapter.class,
            YTOAdapter.class,
            ZTOAdapter.class,
            EMSAdapter.class,
            JDAdapter.class,
            YDAdapter.class,
            JTAdapter.class
    );

    private static LogisticsService instantiate(Class<? extends LogisticsService> type) {
        try {
            return type.getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            throw new IllegalStateException("适配器必须可无参实例化: " + type.getName(), e);
        }
    }

    private static ShippingRequest request(LogisticsType type) {
        ShippingRequest req = new ShippingRequest();
        req.setOrderId("PO2026001");
        req.setLogisticsType(type);
        return req;
    }

    @Test
    @DisplayName("适配器清单必须覆盖全部物流渠道（防止新增渠道漏登记）")
    void shouldCoverAllLogisticsTypes() {
        Set<LogisticsType> covered = ADAPTER_CLASSES.stream()
                .map(LogisticsAdapterFailClosedTest::instantiate)
                .map(LogisticsService::getLogisticsType)
                .collect(Collectors.toSet());

        assertThat(covered).containsExactlyInAnyOrderElementsOf(EnumSet.allOf(LogisticsType.class));
    }

    @Test
    @DisplayName("未接入真实API的渠道：下单/取消/查轨迹/运费必须抛异常，不得返回编造数据")
    void unconfiguredChannelsMustThrow() {
        for (Class<? extends LogisticsService> adapterClass : ADAPTER_CLASSES) {
            LogisticsService adapter = instantiate(adapterClass);
            String name = adapter.getCompanyName();
            LogisticsType type = adapter.getLogisticsType();

            if (adapter.isRealImplementation()) {
                // 已真接入：本测试不覆盖（应由该渠道自己的真实实现测试负责）
                continue;
            }

            assertThatThrownBy(() -> adapter.createShipment(request(type)))
                    .as("%s 下单必须显式报不可用，而不是返回假运单号", name)
                    .isInstanceOf(LogisticsException.class)
                    .hasMessageContaining("尚未接入真实第三方API");

            assertThatThrownBy(() -> adapter.cancelShipment("X1234567890", "用户取消"))
                    .as("%s 取消必须显式报不可用，而不是假报取消成功", name)
                    .isInstanceOf(LogisticsException.class);

            assertThatThrownBy(() -> adapter.trackShipment("X1234567890"))
                    .as("%s 查轨迹必须显式报不可用，而不是返回编造轨迹", name)
                    .isInstanceOf(LogisticsException.class);

            assertThatThrownBy(() -> adapter.estimateShippingFee(request(type)))
                    .as("%s 运费必须显式报不可用，而不是返回写死的假运费", name)
                    .isInstanceOf(LogisticsException.class);

            assertThat(adapter.validateAddress("广东省", "广州市", "白云区"))
                    .as("%s 未接入地址库时不得声称'可达'", name)
                    .isFalse();
        }
    }

    @Test
    @DisplayName("渠道标识（名称/代码）必须完整且不重复")
    void channelIdentityMustBeUniqueAndComplete() {
        List<LogisticsService> adapters = ADAPTER_CLASSES.stream()
                .map(LogisticsAdapterFailClosedTest::instantiate)
                .toList();

        assertThat(adapters).allSatisfy(a -> {
            assertThat(a.getCompanyName()).isNotBlank();
            assertThat(a.getCompanyCode()).isNotBlank();
            assertThat(a.getLogisticsType()).isNotNull();
        });

        assertThat(adapters.stream().map(LogisticsService::getCompanyCode).distinct().count())
                .as("渠道代码不得重复")
                .isEqualTo(adapters.size());
    }
}
