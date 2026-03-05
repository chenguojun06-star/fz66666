package com.fashion.supplychain.system.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.RoleService;
import com.fashion.supplychain.system.service.UserService;
import com.fashion.supplychain.system.orchestration.PermissionCalculationEngine;
import java.util.NoSuchElementException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

@ExtendWith(MockitoExtension.class)
class UserOrchestratorTest {

    @Mock
    private UserService userService;

    @Mock
    private RoleService roleService;

    @Mock
    private LoginLogService loginLogService;

    @Mock
    private AuthTokenService authTokenService;

    @Mock
    private PermissionCalculationEngine permissionEngine;

    @InjectMocks
    private UserOrchestrator orchestrator;

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ─────────────────── getById() ───────────────────

    @Test
    void getById_throwsWhenNotFound() {
        setTenantContext(1L);
        when(userService.getById(99L)).thenReturn(null);
        assertThrows(NoSuchElementException.class, () -> orchestrator.getById(99L));
    }

    @Test
    void getById_throwsOnCrossTenantAccess() {
        setTenantContext(1L);
        User other = buildUser(5L, "other", 2L); // 属于 tenantId=2
        when(userService.getById(5L)).thenReturn(other);
        assertThrows(AccessDeniedException.class, () -> orchestrator.getById(5L));
    }

    @Test
    void getById_returnsUserInSameTenant() {
        setTenantContext(1L);
        User u = buildUser(1L, "alice", 1L);
        when(userService.getById(1L)).thenReturn(u);

        User result = orchestrator.getById(1L);
        assertNotNull(result);
        assertEquals("alice", result.getUsername());
    }

    // ─────────────────── add() ───────────────────

    @Test
    void add_throwsWhenNotTopAdmin() {
        setTenantContext(1L); // role 未设置 → isTopAdmin() = false
        User u = buildUser(null, "bob", 1L);
        assertThrows(AccessDeniedException.class, () -> orchestrator.add(u));
    }

    @Test
    void add_syncsRoleNameWhenRoleIdPresent() {
        setAdminContext(1L);
        User u = buildUser(null, "carol", 1L);
        u.setRoleId(10L);
        u.setOperationRemark("测试新增");

        Role role = new Role();
        role.setId(10L);
        role.setRoleName("生产主管");
        role.setDataScope("self");
        when(roleService.getById(10L)).thenReturn(role);
        when(userService.saveUser(u)).thenReturn(true);

        boolean result = orchestrator.add(u);
        assertTrue(result);
        assertEquals("生产主管", u.getRoleName());
        assertEquals("self", u.getPermissionRange());
    }

    @Test
    void add_successWithoutRole() {
        setAdminContext(1L);
        User u = buildUser(null, "dave", 1L);
        u.setOperationRemark("批量导入");
        when(userService.saveUser(u)).thenReturn(true);

        assertTrue(orchestrator.add(u));
    }

    // ─────────────────── update() ───────────────────

    @Test
    void update_throwsWhenNotTopAdmin() {
        setTenantContext(1L);
        User u = buildUser(1L, "alice", 1L);
        u.setOperationRemark("修改信息");
        assertThrows(AccessDeniedException.class, () -> orchestrator.update(u));
    }

    @Test
    void update_throwsWhenNullUser() {
        setAdminContext(1L);
        assertThrows(IllegalArgumentException.class, () -> orchestrator.update(null));
    }

    @Test
    void update_throwsWhenRemarkBlank() {
        setAdminContext(1L);
        User u = buildUser(1L, "alice", 1L);
        u.setOperationRemark(""); // 空白原因
        assertThrows(IllegalArgumentException.class, () -> orchestrator.update(u));
    }

    @Test
    void update_success() {
        setAdminContext(1L);
        User u = buildUser(1L, "alice", 1L);
        u.setOperationRemark("更新角色");
        when(userService.updateUser(u)).thenReturn(true);

        assertTrue(orchestrator.update(u));
        verify(userService).updateUser(u);
    }

    // ─────────────────── delete() ───────────────────

    @Test
    void delete_throwsWhenNotTopAdmin() {
        setTenantContext(1L);
        assertThrows(AccessDeniedException.class, () -> orchestrator.delete(1L, "要删除"));
    }

    @Test
    void delete_throwsWhenRemarkBlank() {
        setAdminContext(1L);
        assertThrows(IllegalArgumentException.class, () -> orchestrator.delete(1L, ""));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.delete(1L, null));
    }

    @Test
    void delete_success() {
        setAdminContext(1L);
        when(userService.deleteUser(1L)).thenReturn(true);

        assertTrue(orchestrator.delete(1L, "离职处理"));
        verify(userService).deleteUser(1L);
    }

    // ─────────────────── toggleStatus() ───────────────────

    @Test
    void toggleStatus_throwsWhenNotTopAdmin() {
        setTenantContext(1L);
        assertThrows(AccessDeniedException.class,
                () -> orchestrator.toggleStatus(1L, "disable", "停用原因"));
    }

    @Test
    void toggleStatus_throwsWhenRemarkBlank() {
        setAdminContext(1L);
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.toggleStatus(1L, "disable", "   "));
    }

    @Test
    void toggleStatus_success() {
        setAdminContext(1L);
        when(userService.toggleUserStatus(1L, "disable")).thenReturn(true);

        assertTrue(orchestrator.toggleStatus(1L, "disable", "违规停用"));
        verify(userService).toggleUserStatus(1L, "disable");
    }

    // ─────────────────── 辅助方法 ───────────────────

    private void setTenantContext(Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenantId);
        ctx.setUserId("T001");
        ctx.setUsername("普通管理员");
        UserContext.set(ctx);
    }

    private void setAdminContext(Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenantId);
        ctx.setUserId("A001");
        ctx.setUsername("超管");
        ctx.setRole("admin"); // 触发 isTopAdmin() = true
        UserContext.set(ctx);
    }

    private User buildUser(Long id, String username, Long tenantId) {
        User u = new User();
        u.setId(id);
        u.setUsername(username);
        u.setTenantId(tenantId);
        return u;
    }
}
