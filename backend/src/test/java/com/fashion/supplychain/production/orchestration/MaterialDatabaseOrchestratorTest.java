package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MaterialDatabaseOrchestratorTest {

    @InjectMocks
    private MaterialDatabaseOrchestrator orchestrator;

    @Mock private MaterialDatabaseService materialDatabaseService;

    // ── getById – validation ────────────────────────────────────────

    @Test
    void getById_emptyId_throwsIllegalArgumentException() {
        assertThatThrownBy(() -> orchestrator.getById(""))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("id不能为空");
    }

    @Test
    void getById_blankId_throwsIllegalArgumentException() {
        assertThatThrownBy(() -> orchestrator.getById("  "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void getById_nullId_throwsIllegalArgumentException() {
        assertThatThrownBy(() -> orchestrator.getById(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void getById_notFound_throwsNoSuchElementException() {
        when(materialDatabaseService.getById(anyString())).thenReturn(null);
        assertThatThrownBy(() -> orchestrator.getById("M001"))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("记录不存在");
    }

    @Test
    void getById_deletedRecord_throwsNoSuchElementException() {
        MaterialDatabase deleted = new MaterialDatabase();
        deleted.setDeleteFlag(1);
        when(materialDatabaseService.getById("M001")).thenReturn(deleted);

        assertThatThrownBy(() -> orchestrator.getById("M001"))
                .isInstanceOf(NoSuchElementException.class);
    }

    // ── save – validation (throws before lambdaQuery is called) ──────

    @Test
    void save_nullMaterial_throwsIllegalArgumentException() {
        assertThatThrownBy(() -> orchestrator.save(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("参数为空");
    }

    @Test
    void save_emptyMaterialCode_throwsIllegalArgumentException() {
        MaterialDatabase m = new MaterialDatabase();
        m.setMaterialCode("");
        assertThatThrownBy(() -> orchestrator.save(m))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("物料编码不能为空");
    }

    @Test
    void save_emptyMaterialName_throwsIllegalArgumentException() {
        MaterialDatabase m = new MaterialDatabase();
        m.setMaterialCode("CODE001");
        m.setMaterialName("");
        assertThatThrownBy(() -> orchestrator.save(m))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("物料名称不能为空");
    }

    @Test
    void save_emptyUnit_throwsIllegalArgumentException() {
        MaterialDatabase m = new MaterialDatabase();
        m.setMaterialCode("CODE001");
        m.setMaterialName("布料A");
        m.setUnit("");
        assertThatThrownBy(() -> orchestrator.save(m))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("单位不能为空");
    }

    @Test
    void save_emptySupplierName_throwsIllegalArgumentException() {
        MaterialDatabase m = new MaterialDatabase();
        m.setMaterialCode("CODE001");
        m.setMaterialName("布料A");
        m.setUnit("米");
        m.setSupplierName("");
        assertThatThrownBy(() -> orchestrator.save(m))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("供应商不能为空");
    }
}
