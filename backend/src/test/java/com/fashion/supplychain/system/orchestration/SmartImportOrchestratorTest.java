package com.fashion.supplychain.system.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fashion.supplychain.system.importer.CustomerExcelImporter;
import com.fashion.supplychain.system.importer.ExcelImportHelper;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

/**
 * D-751 二期：智能导入列映射（规则三层 + AI 兜底）与映射归一化导入单测
 */
@ExtendWith(MockitoExtension.class)
class SmartImportOrchestratorTest {

    @Spy
    private ExcelImportHelper importHelper = new ExcelImportHelper();

    @Mock
    private ExcelImportOrchestrator excelImportOrchestrator;

    @Mock
    private AiInferenceGateway aiInferenceGateway;

    @InjectMocks
    private SmartImportOrchestrator smartImportOrchestrator;

    @SuppressWarnings("unchecked")
    private MockMultipartFile arbitraryExcel(String... headerAndRows) throws Exception {
        // 表头在第 0 行，其余每行一行数据（列数=表头数）
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("老系统导出");
            int cols = 4;
            Row header = sheet.createRow(0);
            for (int c = 0; c < cols; c++) {
                header.createCell(c).setCellValue(headerAndRows[c]);
            }
            int r = 1;
            for (int i = cols; i + cols <= headerAndRows.length; i += cols) {
                Row row = sheet.createRow(r++);
                for (int c = 0; c < cols; c++) {
                    row.createCell(c).setCellValue(headerAndRows[i + c]);
                }
            }
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            wb.write(out);
            return new MockMultipartFile("file", "legacy.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        }
    }

    private void stubCustomerTemplate() {
        ExcelImportHelper.TemplateConfig config =
                new CustomerExcelImporter().getTemplateConfig();
        when(excelImportOrchestrator.templateConfigOf("customer")).thenReturn(config);
    }

    @Test
    void smartMap_rulesCoverExactAliasFuzzy() throws Exception {
        stubCustomerTemplate();
        MockMultipartFile file = arbitraryExcel(
                "公司名称", "联系人姓名", "电话", "店铺星级",
                "广州服饰", "陈总", "13900000000", "5星",
                "深圳贸易", "李经理", "13911111111", "4星");

        Map<String, Object> result = smartImportOrchestrator.smartMap("customer", file);

        @SuppressWarnings("unchecked")
        Map<String, String> mapping = (Map<String, String>) result.get("mapping");
        assertEquals("客户名称*", mapping.get("公司名称")); // 别名
        assertEquals("联系人", mapping.get("联系人姓名")); // 别名
        assertEquals("联系电话", mapping.get("电话")); // 别名
        // 模糊/精确都认不出 → AI 兜底；AI 也认不出保持 null
        assertNull(mapping.get("店铺星级"));
        assertEquals(2, result.get("totalRows"));
    }

    @Test
    void smartMap_aiFallbackFillsUnresolved() throws Exception {
        stubCustomerTemplate();
        MockMultipartFile file = arbitraryExcel(
                "公司名称", "特殊说明栏", "x", "y",
                "a", "b", "c", "d");

        IntelligenceInferenceResult ai = new IntelligenceInferenceResult();
        ai.setContent("```json\n{\"特殊说明栏\": \"备注\", \"x\": null}\n```");
        when(aiInferenceGateway.chat(eq("excel-import-mapping"), any(String.class), any(String.class)))
                .thenReturn(ai);

        Map<String, Object> result = smartImportOrchestrator.smartMap("customer", file);

        @SuppressWarnings("unchecked")
        Map<String, String> mapping = (Map<String, String>) result.get("mapping");
        assertEquals("备注", mapping.get("特殊说明栏"));

        @SuppressWarnings("unchecked")
        Map<String, String> matchedBy = (Map<String, String>) result.get("matchedBy");
        assertEquals("ai", matchedBy.get("特殊说明栏"));
    }

    @Test
    void smartMap_aiFailureFallsBackToRules() throws Exception {
        stubCustomerTemplate();
        MockMultipartFile file = arbitraryExcel(
                "公司名称", "奇奇怪怪的列", "x", "y",
                "a", "b", "c", "d");
        when(aiInferenceGateway.chat(eq("excel-import-mapping"), any(String.class), any(String.class)))
                .thenThrow(new RuntimeException("402 余额不足"));

        Map<String, Object> result = smartImportOrchestrator.smartMap("customer", file);

        @SuppressWarnings("unchecked")
        Map<String, String> mapping = (Map<String, String>) result.get("mapping");
        assertEquals("客户名称*", mapping.get("公司名称"));
        assertNull(mapping.get("奇奇怪怪的列"));
    }

    @Test
    void importMapped_rejectsWhenRequiredColumnUnmapped() throws Exception {
        stubCustomerTemplate();
        MockMultipartFile file = arbitraryExcel(
                "联系人", "电话", "x", "y",
                "陈总", "139", "c", "d");
        Map<String, String> mapping = new LinkedHashMap<>();
        mapping.put("联系人", "联系人");
        mapping.put("电话", "联系电话");

        assertThrows(IllegalArgumentException.class,
                () -> smartImportOrchestrator.importMapped(2L, "customer", file, mapping));
    }

    @Test
    @SuppressWarnings("unchecked")
    void importMapped_normalizesWorkbookAndCallsImporter() throws Exception {
        stubCustomerTemplate();
        MockMultipartFile file = arbitraryExcel(
                "公司名称", "联系人姓名", "电话", "扔掉的列",
                "广州服饰", "陈总", "13900000000", "多余",
                "深圳贸易", "李经理", "13911111111", "多余");
        Map<String, String> mapping = new LinkedHashMap<>();
        mapping.put("公司名称", "客户名称*");
        mapping.put("联系人姓名", "联系人");
        mapping.put("电话", "联系电话");
        // 扔掉的列不映射 → 不导入
        when(excelImportOrchestrator.importByType(eq(2L), eq("customer"), any()))
                .thenReturn(new HashMap<>(Map.of("total", 2, "successCount", 2, "failedCount", 0)));

        Map<String, Object> result = smartImportOrchestrator.importMapped(2L, "customer", file, mapping);

        assertEquals(2, result.get("total"));
        ArgumentCaptor<org.springframework.web.multipart.MultipartFile> captor =
                ArgumentCaptor.forClass(org.springframework.web.multipart.MultipartFile.class);
        verify(excelImportOrchestrator).importByType(eq(2L), eq("customer"), captor.capture());

        // 归一化工作簿可被真实 parseExcel 读回，且只含映射过的标准列
        ExcelImportHelper.LooseSheet normalized =
                importHelper.parseSheetLoose(captor.getValue());
        assertTrue(normalized.headers.contains("客户名称*"));
        assertTrue(normalized.headers.contains("联系人"));
        assertTrue(normalized.headers.contains("联系电话"));
        assertTrue(normalized.rows.stream().noneMatch(r -> r.containsValue("多余")));
        assertEquals("广州服饰", normalized.rows.get(0).get("客户名称*"));
    }
}
