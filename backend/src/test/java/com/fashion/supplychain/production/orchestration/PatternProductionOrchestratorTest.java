package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.PatternScanRecordService;
import com.fashion.supplychain.stock.mapper.SampleLoanMapper;
import com.fashion.supplychain.stock.mapper.SampleStockMapper;
import com.fashion.supplychain.stock.service.SampleStockService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PatternProductionOrchestratorTest {

    @InjectMocks
    PatternProductionOrchestrator orchestrator;

    @Mock PatternProductionService patternProductionService;
    @Mock StyleInfoService styleInfoService;
    @Mock StyleProcessService styleProcessService;
    @Mock MaterialPurchaseService materialPurchaseService;
    @Mock PatternScanRecordService patternScanRecordService;
    @Mock SampleStockService sampleStockService;
    @Mock SampleLoanMapper sampleLoanMapper;
    @Mock SampleStockMapper sampleStockMapper;
    @Spy  ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void listWithEnrichment_returnsNonNull() {
        when(patternProductionService.page(any(), any())).thenReturn(new Page<PatternProduction>());
        Map<String, Object> result = orchestrator.listWithEnrichment(1, 10, null, null, null, null);
        assertThat(result).isNotNull();
    }

    @Test
    void receivePattern_whenRecordNotFound_throwsIllegalArgument() {
        when(patternProductionService.getById(any())).thenReturn(null);
        assertThatThrownBy(() -> orchestrator.receivePattern("nonexistent-id", Map.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void updateProgress_whenRecordNotFound_throwsIllegalArgument() {
        when(patternProductionService.getById(any())).thenReturn(null);
        assertThatThrownBy(() -> orchestrator.updateProgress("nonexistent-id", Map.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
