package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
class ExcelImportOrchestratorTest {

    @InjectMocks
    private ExcelImportOrchestrator orchestrator;

    @Mock private StyleInfoService styleInfoService;
    @Mock private StyleAttachmentService styleAttachmentService;
    @Mock private StyleProcessService styleProcessService;
    @Mock private FactoryService factoryService;
    @Mock private UserService userService;
    @Mock private CosService cosService;

    // ── generateTemplate – pure in-memory POI, no mocks needed ───────

    @Test
    void generateTemplate_style_returnsNonEmptyByteArray() {
        byte[] result = orchestrator.generateTemplate("style");
        assertThat(result).isNotNull().hasSizeGreaterThan(0);
    }

    @Test
    void generateTemplate_factory_returnsNonEmptyByteArray() {
        byte[] result = orchestrator.generateTemplate("factory");
        assertThat(result).isNotNull().hasSizeGreaterThan(0);
    }

    @Test
    void generateTemplate_employee_returnsNonEmptyByteArray() {
        byte[] result = orchestrator.generateTemplate("employee");
        assertThat(result).isNotNull().hasSizeGreaterThan(0);
    }

    @Test
    void generateTemplate_process_returnsNonEmptyByteArray() {
        byte[] result = orchestrator.generateTemplate("process");
        assertThat(result).isNotNull().hasSizeGreaterThan(0);
    }

    @Test
    void generateTemplate_styleBytesContainXlsxSignature() {
        byte[] result = orchestrator.generateTemplate("style");
        // XLSX files start with PK (zip magic bytes 0x50 0x4B)
        assertThat(result[0]).isEqualTo((byte) 0x50);
        assertThat(result[1]).isEqualTo((byte) 0x4B);
    }

    @Test
    void generateTemplate_eachTypeDifferentContent() {
        byte[] style = orchestrator.generateTemplate("style");
        byte[] factory = orchestrator.generateTemplate("factory");
        // Different templates produce different byte arrays (different headers)
        assertThat(style).isNotEqualTo(factory);
    }
}
