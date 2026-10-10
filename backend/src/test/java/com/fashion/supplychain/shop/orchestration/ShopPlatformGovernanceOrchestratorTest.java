package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 平台治理（一键下架 / 恢复上架）单测。
 *
 * <p>要守住的口径：
 * <ol>
 *   <li><b>必须填原因</b>，且原因要真的发给商家 —— 不告诉原因，治理就是猫鼠游戏；</li>
 *   <li>下架只改 {@code shop_listed}，不碰商品资料；</li>
 *   <li>下架**可逆**（否则平台能一键把别人的生意做没）；</li>
 *   <li>通知只发给该商品所属租户，不是全站广播；</li>
 *   <li>通知失败不得让下架失败。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopPlatformGovernanceOrchestratorTest {

    @Mock
    private ShopPlatformMapper platformMapper;

    @Mock
    private SysNoticeOrchestrator sysNoticeOrchestrator;

    /** 真实例：类目中文化本身要被验证（mock 会让 categoryName 恒为 null） */
    @org.mockito.Spy
    private ShopCategorySupport categorySupport = new ShopCategorySupport();

    @InjectMocks
    private ShopPlatformGovernanceOrchestrator orchestrator;

    private Map<String, Object> brief(long tenantId, String styleNo, int listed) {
        Map<String, Object> m = new HashMap<>();
        m.put("styleId", 100L);
        m.put("tenantId", tenantId);
        m.put("styleNo", styleNo);
        m.put("styleName", "桑蚕丝连衣裙");
        m.put("shopListed", listed);
        return m;
    }

    @Test
    @DisplayName("① 下架：只改在架状态 + 给所属租户发通知（原因必须带上）")
    void takedownNotifiesOwnerTenant() {
        when(platformMapper.findStyleBrief(100L)).thenReturn(brief(9L, "SN100", 1));

        Map<String, Object> out = orchestrator.takedown(100L, "详情页含极限词");

        verify(platformMapper).updateListed(100L, 0);
        ArgumentCaptor<String> content = ArgumentCaptor.forClass(String.class);
        verify(sysNoticeOrchestrator).sendToTenant(eq(9L), eq("platform_governance"), anyString(),
                content.capture());
        assertTrue(content.getValue().contains("详情页含极限词"), "原因必须随通知发给商家");
        assertTrue(content.getValue().contains("SN100"), "通知要说清是哪一件");
        assertEquals(9L, out.get("notifiedTenantId"));
        assertEquals(0, out.get("shopListed"));
    }

    @Test
    @DisplayName("② 不填原因直接拒绝（没原因的治理商家无法整改）")
    void takedownRequiresReason() {
        assertThrows(IllegalArgumentException.class, () -> orchestrator.takedown(100L, "   "));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.takedown(100L, null));
        verify(platformMapper, never()).updateListed(anyLong(), anyInt());
    }

    @Test
    @DisplayName("③ 原因超长拒绝（通知里要完整展示，太长商家看不完）")
    void takedownRejectsTooLongReason() {
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.takedown(100L, "x".repeat(201)));
    }

    @Test
    @DisplayName("④ 商品不存在 / 已下架：拒绝并给出可读原因")
    void takedownGuards() {
        when(platformMapper.findStyleBrief(100L)).thenReturn(null);
        assertThrows(IllegalArgumentException.class, () -> orchestrator.takedown(100L, "违规"));

        when(platformMapper.findStyleBrief(100L)).thenReturn(brief(9L, "SN100", 0));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.takedown(100L, "违规"));
    }

    @Test
    @DisplayName("⑤ 恢复上架：把在架状态改回来并通知商家（下架必须可逆）")
    void relistRestores() {
        when(platformMapper.findStyleBrief(100L)).thenReturn(brief(9L, "SN100", 0));

        Map<String, Object> out = orchestrator.relist(100L);

        verify(platformMapper).updateListed(100L, 1);
        verify(sysNoticeOrchestrator).sendToTenant(eq(9L), anyString(), anyString(), anyString());
        assertEquals(1, out.get("shopListed"));
    }

    @Test
    @DisplayName("⑥ 已在架的商品不能重复恢复")
    void relistGuardsAlreadyListed() {
        when(platformMapper.findStyleBrief(100L)).thenReturn(brief(9L, "SN100", 1));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.relist(100L));
        verify(platformMapper, never()).updateListed(anyLong(), anyInt());
    }

    @Test
    @DisplayName("⑦ 通知发送失败不得让下架失败（治理动作优先于配套通知）")
    void notifyFailureDoesNotBreakTakedown() {
        when(platformMapper.findStyleBrief(100L)).thenReturn(brief(9L, "SN100", 1));
        // void 方法不能用 when(...) 打桩，必须 doThrow(...).when(...)
        org.mockito.Mockito.doThrow(new RuntimeException("notice db down"))
                .when(sysNoticeOrchestrator)
                .sendToTenant(anyLong(), anyString(), anyString(), anyString());

        Map<String, Object> out = orchestrator.takedown(100L, "违规");

        verify(platformMapper).updateListed(100L, 0);
        assertEquals(0, out.get("shopListed"));
    }

    @Test
    @DisplayName("⑧ 平台管理列表：shopListed 归一为 0/1，供前端显示在架状态")
    void adminStylesNormalizesListed() {
        Map<String, Object> listed = new HashMap<>();
        listed.put("styleId", 1L);
        listed.put("shopListed", "1");
        Map<String, Object> unlisted = new HashMap<>();
        unlisted.put("styleId", 2L);
        unlisted.put("shopListed", null);

        when(platformMapper.countStylesForAdmin(null, null)).thenReturn(2L);
        when(platformMapper.pageStylesForAdmin(eq(null), eq(null), anyInt(), anyInt()))
                .thenReturn(List.of(listed, unlisted));

        Map<String, Object> resp = orchestrator.adminStyles(1, 20, null, null);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) resp.get("records");
        assertEquals(1, rows.get(0).get("shopListed"));
        assertEquals(0, rows.get(1).get("shopListed"));
        assertEquals(2L, resp.get("total"));
    }
}
