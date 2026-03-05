package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Permission;
import com.fashion.supplychain.system.service.PermissionService;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PermissionOrchestratorTest {

    @Mock
    private PermissionService permissionService;

    @InjectMocks
    private PermissionOrchestrator orchestrator;

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
        verify(permissionService).getPermissionPage(1L, 10L, null, null, null);
    }

    // ── tree ──────────────────────────────────────────────────────────

    @Test
    void tree_emptyList_returnsEmpty() {
        when(permissionService.list()).thenReturn(List.of());
        List<?> result = orchestrator.tree(null);
        assertThat(result).isEmpty();
    }

    @Test
    void tree_singleRoot_returnsOneNode() {
        Permission p = new Permission();
        p.setId(1L);
        p.setPermissionName("菜单权限");
        p.setPermissionCode("MENU_HOME");
        p.setParentId(0L);
        when(permissionService.list()).thenReturn(List.of(p));

        List<?> result = orchestrator.tree(null);

        assertThat(result).hasSize(1);
    }

    @Test
    void tree_filterByStatus_excludesNonMatchingNodes() {
        Permission active = new Permission();
        active.setId(1L);
        active.setPermissionName("激活菜单");
        active.setPermissionCode("MENU_A");
        active.setParentId(0L);
        active.setStatus("ENABLED");

        Permission inactive = new Permission();
        inactive.setId(2L);
        inactive.setPermissionName("禁用菜单");
        inactive.setPermissionCode("MENU_B");
        inactive.setParentId(0L);
        inactive.setStatus("DISABLED");

        when(permissionService.list()).thenReturn(List.of(active, inactive));

        List<?> result = orchestrator.tree("ENABLED");

        assertThat(result).hasSize(1);
    }

    // ── getById ───────────────────────────────────────────────────────

    @Test
    void getById_notFound_throwsNoSuchElement() {
        when(permissionService.getById(99L)).thenReturn(null);
        assertThatThrownBy(() -> orchestrator.getById(99L))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("权限不存在");
    }

    @Test
    void getById_found_returnsPermission() {
        Permission p = new Permission();
        p.setId(1L);
        p.setPermissionCode("MENU_HOME");
        when(permissionService.getById(1L)).thenReturn(p);

        Permission result = orchestrator.getById(1L);

        assertThat(result).isNotNull();
        assertThat(result.getPermissionCode()).isEqualTo("MENU_HOME");
    }

    // ── add ───────────────────────────────────────────────────────────

    @Test
    void add_notAdmin_throwsAccessDenied() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setRole("user");
        UserContext.set(ctx);

        assertThatThrownBy(() -> orchestrator.add(new Permission()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void add_admin_savesPermission() {
        Permission p = new Permission();
        when(permissionService.save(p)).thenReturn(true);

        boolean result = orchestrator.add(p);

        assertThat(result).isTrue();
        verify(permissionService).save(p);
    }
}
