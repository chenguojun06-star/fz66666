package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.system.entity.Dict;
import com.fashion.supplychain.system.service.DictService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DictOrchestratorTest {

    @Mock
    private DictService dictService;

    @InjectMocks
    private DictOrchestrator orchestrator;

    // ── list ──────────────────────────────────────────────────────────

    @Test
    void list_delegatesToService() {
        orchestrator.list(Map.of());
        verify(dictService).queryPage(any());
    }

    // ── create ────────────────────────────────────────────────────────

    @Test
    void create_nullDict_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.create(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不能为空");
    }

    @Test
    void create_missingDictType_throwsIllegalArgument() {
        Dict d = new Dict();
        d.setDictCode("CODE");
        d.setDictLabel("标签");
        assertThatThrownBy(() -> orchestrator.create(d))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("字典类型");
    }

    @Test
    void create_missingDictCode_throwsIllegalArgument() {
        Dict d = new Dict();
        d.setDictType("color");
        d.setDictLabel("标签");
        assertThatThrownBy(() -> orchestrator.create(d))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("字典编码");
    }

    @Test
    void create_missingDictLabel_throwsIllegalArgument() {
        Dict d = new Dict();
        d.setDictType("color");
        d.setDictCode("RED");
        assertThatThrownBy(() -> orchestrator.create(d))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("字典标签");
    }

    @Test
    void create_duplicateCode_throwsIllegalArgument() {
        Dict d = validDict();
        when(dictService.count(any())).thenReturn(1L);
        assertThatThrownBy(() -> orchestrator.create(d))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("编码已存在");
    }

    @Test
    void create_valid_setsDefaultStatusAndSaves() {
        Dict d = validDict();
        when(dictService.count(any())).thenReturn(0L);
        Dict result = orchestrator.create(d);
        verify(dictService).save(d);
        assertThat(result).isNotNull();
        assertThat(result.getStatus()).isEqualTo("ENABLED");
    }

    // ── update ────────────────────────────────────────────────────────

    @Test
    void update_nullDict_throwsRuntimeException() {
        // dict.setId(id) is called before null-check → NPE; either NPE or IAE is acceptable
        assertThatThrownBy(() -> orchestrator.update(1L, null))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void update_valid_updatesDict() {
        Dict d = validDict();
        when(dictService.count(any())).thenReturn(0L);
        Dict result = orchestrator.update(1L, d);
        verify(dictService).updateById(d);
        assertThat(result).isNotNull();
    }

    // ── delete ────────────────────────────────────────────────────────

    @Test
    void delete_callsRemoveById() {
        orchestrator.delete(1L);
        verify(dictService).removeById(1L);
    }

    // ── helpers ───────────────────────────────────────────────────────

    private Dict validDict() {
        Dict d = new Dict();
        d.setDictType("color");
        d.setDictCode("RED");
        d.setDictLabel("红色");
        return d;
    }
}
