package com.fashion.supplychain.template.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.util.Map;
import java.util.NoSuchElementException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

@ExtendWith(MockitoExtension.class)
class TemplateLibraryOrchestratorTest {

    @Mock
    private TemplateLibraryService templateLibraryService;

    @InjectMocks
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    @AfterEach
    void cleanup() {
        UserContext.clear();
    }

    @Test
    void update_whenLocked_throws() {
        UserContext ctx = new UserContext();
        ctx.setRole("admin");
        UserContext.set(ctx);

        TemplateLibrary current = new TemplateLibrary();
        current.setId("t1");
        current.setTemplateType("progress");
        current.setTemplateKey("k");
        current.setTemplateName("n");
        current.setTemplateContent("{}");
        current.setLocked(1);

        when(templateLibraryService.getById("t1")).thenReturn(current);

        TemplateLibrary input = new TemplateLibrary();
        input.setId("t1");
        input.setTemplateType("progress");
        input.setTemplateKey("k");
        input.setTemplateName("n2");
        input.setTemplateContent("{\"nodes\":[]}");

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> templateLibraryOrchestrator.update(input));
        assertEquals("模板已锁定，仅管理员可退回后修改", ex.getMessage());
    }

    @Test
    void rollback_whenNotAdmin_throws() {
        UserContext ctx = new UserContext();
        ctx.setRole("user");
        UserContext.set(ctx);

        assertThrows(AccessDeniedException.class, () -> templateLibraryOrchestrator.rollback("t1", "原因"));
    }

    @Test
    void rollback_whenMissingTemplate_throws() {
        UserContext ctx = new UserContext();
        ctx.setRole("admin");
        UserContext.set(ctx);

        when(templateLibraryService.getById("missing")).thenReturn(null);
        assertThrows(NoSuchElementException.class, () -> templateLibraryOrchestrator.rollback("missing", "原因"));
    }

    @Test
    void resolveProcessUnitPrices_whenBlankStyleNo_throws() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> templateLibraryOrchestrator.resolveProcessUnitPrices(" "));
        assertEquals("styleNo不能为空", ex.getMessage());
    }

    @Test
    void resolveProcessUnitPrices_delegatesToService() {
        when(templateLibraryService.resolveProcessUnitPrices("S1")).thenReturn(Map.of("裁剪", BigDecimal.ONE));

        Map<String, BigDecimal> out = templateLibraryOrchestrator.resolveProcessUnitPrices("S1");

        assertEquals(BigDecimal.ONE, out.get("裁剪"));
        verify(templateLibraryService).resolveProcessUnitPrices("S1");
    }

    @Test
    void create_acceptsProcessPriceType() {
        UserContext ctx = new UserContext();
        ctx.setRole("admin");
        UserContext.set(ctx);

        when(templateLibraryService.getOne(any())).thenReturn(null);
        when(templateLibraryService.save(any())).thenReturn(true);

        TemplateLibrary input = new TemplateLibrary();
        input.setTemplateType("process");
        input.setTemplateKey("k");
        input.setTemplateName("n");
        input.setTemplateContent("{}");
        input.setSourceStyleNo("S1");

        TemplateLibrary created = templateLibraryOrchestrator.create(input);

        assertEquals("process", created.getTemplateType());
    }
}
