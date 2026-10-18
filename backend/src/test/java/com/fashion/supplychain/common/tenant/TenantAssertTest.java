package com.fashion.supplychain.common.tenant;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("TenantAssert - 租户数据一致性防护")
class TenantAssertTest {

    @BeforeEach
    void setUp() {
        UserContext.clear();
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private void setTenantContext(Long tenantId, boolean superAdmin) {
        UserContext ctx = new UserContext();
        ctx.setUserId("testUser");
        ctx.setUsername("test");
        ctx.setRole(superAdmin ? "admin" : "admin");
        ctx.setTenantId(tenantId);
        ctx.setSuperAdmin(superAdmin);
        UserContext.set(ctx);
    }

    @Test
    @DisplayName("assertTenantContext - 有租户上下文时不抛异常")
    void assertTenantContext_withContext_noException() {
        setTenantContext(1L, false);
        assertDoesNotThrow(() -> TenantAssert.assertTenantContext());
    }

    @Test
    @DisplayName("assertTenantContext - 无租户上下文时抛BusinessException")
    void assertTenantContext_noContext_throwsException() {
        assertThrows(BusinessException.class, () -> TenantAssert.assertTenantContext());
    }

    @Test
    @DisplayName("requireTenantId - 返回当前租户ID")
    void requireTenantId_withContext_returnsTenantId() {
        setTenantContext(42L, false);
        assertEquals(42L, TenantAssert.requireTenantId());
    }

    @Test
    @DisplayName("requireTenantId - 无上下文时抛异常")
    void requireTenantId_noContext_throwsException() {
        assertThrows(BusinessException.class, () -> TenantAssert.requireTenantId());
    }

    @Test
    @DisplayName("requireTenantIdOrSuperAdmin - 超管返回null")
    void requireTenantIdOrSuperAdmin_superAdmin_returnsNull() {
        setTenantContext(null, true);
        assertNull(TenantAssert.requireTenantIdOrSuperAdmin());
    }

    @Test
    @DisplayName("requireTenantIdOrSuperAdmin - 普通租户返回tenantId")
    void requireTenantIdOrSuperAdmin_normalUser_returnsTenantId() {
        setTenantContext(1L, false);
        assertEquals(1L, TenantAssert.requireTenantIdOrSuperAdmin());
    }

    @Test
    @DisplayName("requireTenantIdOrSuperAdmin - 非超管且无tenantId时抛异常")
    void requireTenantIdOrSuperAdmin_noTenantNotSuper_throwsException() {
        UserContext ctx = new UserContext();
        ctx.setUserId("testUser");
        ctx.setUsername("test");
        ctx.setRole("worker");
        ctx.setTenantId(null);
        UserContext.set(ctx);
        assertThrows(BusinessException.class, () -> TenantAssert.requireTenantIdOrSuperAdmin());
    }

    @Test
    @DisplayName("assertBelongsToCurrentTenant - 同租户不抛异常")
    void assertBelongsToCurrentTenant_sameTenant_noException() {
        setTenantContext(1L, false);
        assertDoesNotThrow(() -> TenantAssert.assertBelongsToCurrentTenant(1L, "订单"));
    }

    @Test
    @DisplayName("assertBelongsToCurrentTenant - 跨租户抛异常")
    void assertBelongsToCurrentTenant_differentTenant_throwsException() {
        setTenantContext(1L, false);
        assertThrows(BusinessException.class,
                () -> TenantAssert.assertBelongsToCurrentTenant(2L, "订单"));
    }

    @Test
    @DisplayName("assertBelongsToCurrentTenant - entityTenantId为null时抛异常")
    void assertBelongsToCurrentTenant_nullEntityTenant_throwsException() {
        setTenantContext(1L, false);
        assertThrows(BusinessException.class,
                () -> TenantAssert.assertBelongsToCurrentTenant(null, "订单"));
    }

    @Test
    @DisplayName("assertSameTenant - 同一租户不抛异常")
    void assertSameTenant_sameTenant_noException() {
        assertDoesNotThrow(() -> TenantAssert.assertSameTenant(new Long[]{1L, 1L, 1L}, "测试操作"));
    }

    @Test
    @DisplayName("assertSameTenant - 跨租户抛异常")
    void assertSameTenant_differentTenant_throwsException() {
        assertThrows(BusinessException.class,
                () -> TenantAssert.assertSameTenant(new Long[]{1L, 2L}, "测试操作"));
    }

    @Test
    @DisplayName("assertSameTenant - 空数组不抛异常")
    void assertSameTenant_emptyArray_noException() {
        assertDoesNotThrow(() -> TenantAssert.assertSameTenant(new Long[]{}, "测试操作"));
    }

    @Test
    @DisplayName("assertAllBelongToCurrentTenant - 全部同租户不抛异常")
    void assertAllBelongToCurrentTenant_allSame_noException() {
        setTenantContext(1L, false);
        assertDoesNotThrow(() -> TenantAssert.assertAllBelongToCurrentTenant(List.of(1L, 1L), "删除"));
    }

    @Test
    @DisplayName("assertAllBelongToCurrentTenant - 包含其他租户抛异常")
    void assertAllBelongToCurrentTenant_containsOther_throwsException() {
        setTenantContext(1L, false);
        assertThrows(BusinessException.class,
                () -> TenantAssert.assertAllBelongToCurrentTenant(List.of(1L, 2L), "删除"));
    }
}
