package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.RolePermissionService;
import com.fashion.supplychain.system.service.RoleService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.List;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RoleOrchestratorTest {

    @Mock
    private RoleService roleService;

    @Mock
    private RolePermissionService rolePermissionService;

    @Mock
    private LoginLogService loginLogService;

    @InjectMocks
    private RoleOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setRole("admin");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ── list ──────────────────────────────────────────────────────────

    @Test
    void list_delegatesToService() {
        orchestrator.list(1L, 10L, null, null, null);
        verify(roleService).getRolePage(1L, 10L, null, null, null);
    }

    // ── getById ───────────────────────────────────────────────────────

    @Test
    void getById_notFound_throwsNoSuchElement() {
        when(roleService.getById(99L)).thenReturn(null);
        assertThatThrownBy(() -> orchestrator.getById(99L))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("角色不存在");
    }

    @Test
    void getById_found_returnsRole() {
        Role role = new Role();
        role.setId(1L);
        role.setRoleName("运营");
        when(roleService.getById(1L)).thenReturn(role);

        Role result = orchestrator.getById(1L);

        assertThat(result.getRoleName()).isEqualTo("运营");
    }

    // ── add ───────────────────────────────────────────────────────────

    @Test
    void add_notAdmin_throwsAccessDenied() {
        switchToNonAdmin();
        assertThatThrownBy(() -> orchestrator.add(new Role()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void add_saveFails_throwsIllegalState() {
        when(roleService.save(new Role())).thenReturn(false);
        assertThatThrownBy(() -> orchestrator.add(new Role()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("新增失败");
    }

    @Test
    void add_valid_returnsTrue() {
        Role role = new Role();
        role.setRoleName("仓管");
        when(roleService.save(role)).thenReturn(true);

        boolean result = orchestrator.add(role);

        assertThat(result).isTrue();
    }

    // ── update ────────────────────────────────────────────────────────

    @Test
    void update_notAdmin_throwsAccessDenied() {
        switchToNonAdmin();
        Role role = new Role();
        role.setOperationRemark("remark");
        assertThatThrownBy(() -> orchestrator.update(role))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void update_missingRemark_throwsIllegalArgument() {
        Role role = new Role();
        // no remark
        assertThatThrownBy(() -> orchestrator.update(role))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("操作原因不能为空");
    }

    @Test
    void update_valid_returnsTrue() {
        Role role = new Role();
        role.setId(1L);
        role.setRoleName("修改后角色");
        role.setOperationRemark("权限调整");
        when(roleService.updateById(role)).thenReturn(true);

        boolean result = orchestrator.update(role);

        assertThat(result).isTrue();
        verify(roleService).updateById(role);
    }

    // ── delete ────────────────────────────────────────────────────────

    @Test
    void delete_notAdmin_throwsAccessDenied() {
        switchToNonAdmin();
        assertThatThrownBy(() -> orchestrator.delete(1L, "remark"))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void delete_missingRemark_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.delete(1L, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("操作原因不能为空");
    }

    @Test
    void delete_removeByIdFails_throwsIllegalState() {
        when(roleService.removeById(1L)).thenReturn(false);
        assertThatThrownBy(() -> orchestrator.delete(1L, "清理旧角色"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("删除失败");
    }

    @Test
    void delete_valid_returnsTrue() {
        when(roleService.removeById(1L)).thenReturn(true);

        boolean result = orchestrator.delete(1L, "清理旧角色");

        assertThat(result).isTrue();
    }

    // ── permissionIds ─────────────────────────────────────────────────

    @Test
    void permissionIds_nullId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.permissionIds(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不能为空");
    }

    @Test
    void permissionIds_valid_delegatesToService() {
        when(rolePermissionService.getPermissionIdsByRoleId(1L)).thenReturn(List.of(10L, 20L));

        List<Long> result = orchestrator.permissionIds(1L);

        assertThat(result).containsExactly(10L, 20L);
    }

    // ── updatePermissionIds ───────────────────────────────────────────

    @Test
    void updatePermissionIds_notAdmin_throwsAccessDenied() {
        switchToNonAdmin();
        assertThatThrownBy(() -> orchestrator.updatePermissionIds(1L, List.of(), "remark"))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void updatePermissionIds_nullId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.updatePermissionIds(null, List.of(), "remark"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void updatePermissionIds_valid_replacesPermissions() {
        when(rolePermissionService.replaceRolePermissions(1L, List.of(10L, 20L))).thenReturn(true);

        boolean result = orchestrator.updatePermissionIds(1L, List.of(10L, 20L), "更新权限");

        assertThat(result).isTrue();
    }

    // ── helpers ───────────────────────────────────────────────────────

    private void switchToNonAdmin() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setRole("user");
        UserContext.set(ctx);
    }
}
