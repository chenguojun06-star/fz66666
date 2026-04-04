package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.production.dto.ExceptionReportRequest;
import com.fashion.supplychain.production.entity.ProductionExceptionReport;
import com.fashion.supplychain.production.orchestration.ExceptionReportOrchestrator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductionExceptionToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    ExceptionReportOrchestrator exceptionReportOrchestrator;

    @InjectMocks
    ProductionExceptionTool tool;

    // ——— 正常上报 ———

    @Test
    void reportSuccess_returnsReportId() throws Exception {
        ProductionExceptionReport report = new ProductionExceptionReport();
        report.setId(101L);
        when(exceptionReportOrchestrator.reportException(any(ExceptionReportRequest.class)))
                .thenReturn(report);

        String result = tool.execute(JSON.writeValueAsString(Map.of(
                "action", "report",
                "orderNo", "PO20260501001",
                "processName", "车缝",
                "exceptionType", "MACHINE_FAULT"
        )));

        JsonNode node = JSON.readTree(result);
        assertTrue(node.get("success").asBoolean(), "success应为true");
        assertEquals(101, node.get("data").get("reportId").asInt());
        assertEquals("PO20260501001", node.get("data").get("orderNo").asText());
        verify(exceptionReportOrchestrator).reportException(any());
    }

    @Test
    void reportWithDescription_succeeds() throws Exception {
        ProductionExceptionReport report = new ProductionExceptionReport();
        report.setId(202L);
        when(exceptionReportOrchestrator.reportException(any(ExceptionReportRequest.class)))
                .thenReturn(report);

        String result = tool.execute(JSON.writeValueAsString(Map.of(
                "action", "report",
                "orderNo", "PO20260501002",
                "processName", "裁剪",
                "exceptionType", "MATERIAL_SHORTAGE",
                "description", "面料不足，需要补料"
        )));

        JsonNode node = JSON.readTree(result);
        assertTrue(node.get("success").asBoolean());
        assertEquals(202, node.get("data").get("reportId").asInt());
        assertEquals("MATERIAL_SHORTAGE", node.get("data").get("exceptionType").asText());
    }

    @Test
    void reportNeedHelp_succeeds() throws Exception {
        ProductionExceptionReport report = new ProductionExceptionReport();
        report.setId(303L);
        when(exceptionReportOrchestrator.reportException(any(ExceptionReportRequest.class)))
                .thenReturn(report);

        String result = tool.execute(JSON.writeValueAsString(Map.of(
                "action", "report",
                "orderNo", "PO20260501003",
                "processName", "熨烫",
                "exceptionType", "NEED_HELP"
        )));

        JsonNode node = JSON.readTree(result);
        assertTrue(node.get("success").asBoolean());
        assertEquals(303, node.get("data").get("reportId").asInt());
    }

    // ——— 非法 exceptionType ———

    @Test
    void invalidExceptionType_returnsError() throws Exception {
        String result = tool.execute(JSON.writeValueAsString(Map.of(
                "action", "report",
                "orderNo", "PO20260501004",
                "processName", "车缝",
                "exceptionType", "UNKNOWN_TYPE"
        )));

        JsonNode node = JSON.readTree(result);
        assertFalse(node.get("success").asBoolean(), "非法exceptionType应返回error");
        verify(exceptionReportOrchestrator, never()).reportException(any());
    }

    @Test
    void emptyExceptionType_returnsError() throws Exception {
        String result = tool.execute(JSON.writeValueAsString(Map.of(
                "action", "report",
                "orderNo", "PO20260501005",
                "processName", "锁边",
                "exceptionType", ""
        )));

        JsonNode node = JSON.readTree(result);
        assertFalse(node.get("success").asBoolean());
    }

    // ——— 缺少必填字段 ———

    @Test
    void missingOrderNo_returnsError() throws Exception {
        String result = tool.execute(JSON.writeValueAsString(Map.of(
                "action", "report",
                "processName", "车缝",
                "exceptionType", "MACHINE_FAULT"
        )));

        JsonNode node = JSON.readTree(result);
        assertFalse(node.get("success").asBoolean());
        verify(exceptionReportOrchestrator, never()).reportException(any());
    }

    @Test
    void missingExceptionType_returnsError() throws Exception {
        String result = tool.execute(JSON.writeValueAsString(Map.of(
                "action", "report",
                "orderNo", "PO20260501006",
                "processName", "车缝"
        )));

        JsonNode node = JSON.readTree(result);
        assertFalse(node.get("success").asBoolean());
    }

    // ——— 未知 action ———

    @Test
    void unknownAction_returnsError() throws Exception {
        String result = tool.execute(JSON.writeValueAsString(Map.of(
                "action", "delete_exception"
        )));

        JsonNode node = JSON.readTree(result);
        assertFalse(node.get("success").asBoolean());
        verify(exceptionReportOrchestrator, never()).reportException(any());
    }
}
