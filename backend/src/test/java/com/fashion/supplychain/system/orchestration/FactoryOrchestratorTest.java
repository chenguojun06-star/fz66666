package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.LoginLogService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class FactoryOrchestratorTest {

    @Mock
    private FactoryService factoryService;

    @Mock
    private LoginLogService loginLogService;

    @InjectMocks
    private FactoryOrchestrator orchestrator;

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

    // ── getById ───────────────────────────────────────────────────────

    @Test
    void getById_blank_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.getById("  "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void getById_notFound_throwsNoSuchElement() {
        when(factoryService.getById("1")).thenReturn(null);
        assertThatThrownBy(() -> orchestrator.getById("1"))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("不存在");
    }

    @Test
    void getById_deleted_throwsNoSuchElement() {
        Factory f = new Factory();
        f.setId("1");
        f.setDeleteFlag(1);
        when(factoryService.getById("1")).thenReturn(f);
        assertThatThrownBy(() -> orchestrator.getById("1"))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void getById_found_returnsFactory() {
        Factory f = new Factory();
        f.setId("1");
        f.setDeleteFlag(0);
        f.setFactoryName("测试工厂");
        when(factoryService.getById("1")).thenReturn(f);

        Factory result = orchestrator.getById("1");

        assertThat(result.getFactoryName()).isEqualTo("测试工厂");
    }

    // ── save ──────────────────────────────────────────────────────────

    @Test
    void save_notAdmin_throwsAccessDenied() {
        switchToNonAdmin();
        assertThatThrownBy(() -> orchestrator.save(new Factory()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void save_nullFactory_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.save(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不能为空");
    }

    @Test
    void save_saveFails_throwsIllegalState() {
        when(factoryService.save(any())).thenReturn(false);
        assertThatThrownBy(() -> orchestrator.save(new Factory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("保存失败");
    }

    @Test
    void save_valid_returnsTrue() {
        when(factoryService.save(any())).thenReturn(true);
        Factory f = new Factory();
        f.setFactoryName("测试工厂");

        boolean result = orchestrator.save(f);

        assertThat(result).isTrue();
        assertThat(f.getStatus()).isEqualTo("active");
    }

    // ── update ────────────────────────────────────────────────────────

    @Test
    void update_notAdmin_throwsAccessDenied() {
        switchToNonAdmin();
        assertThatThrownBy(() -> orchestrator.update(new Factory()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void update_nullFactory_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.update(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void update_missingRemark_throwsIllegalArgument() {
        Factory f = new Factory();
        f.setId("1");
        assertThatThrownBy(() -> orchestrator.update(f))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("操作原因不能为空");
    }

    @Test
    void update_valid_returnsTrue() {
        Factory f = new Factory();
        f.setId("1");
        f.setOperationRemark("修正地址");
        when(factoryService.updateById(f)).thenReturn(true);

        boolean result = orchestrator.update(f);

        assertThat(result).isTrue();
        verify(factoryService).updateById(f);
    }

    // ── delete ────────────────────────────────────────────────────────

    @Test
    void delete_notAdmin_throwsAccessDenied() {
        switchToNonAdmin();
        assertThatThrownBy(() -> orchestrator.delete("1", "remark"))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void delete_blankId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.delete("  ", "remark"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void delete_missingRemark_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.delete("1", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("操作原因不能为空");
    }

    @Test
    void delete_valid_softDeletesFactory() {
        when(factoryService.getById("1")).thenReturn(null);
        when(factoryService.updateById(any())).thenReturn(true);

        boolean result = orchestrator.delete("1", "下线工厂");

        assertThat(result).isTrue();
        verify(factoryService).updateById(any());
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
