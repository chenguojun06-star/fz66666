package com.fashion.supplychain.template.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.mapper.TemplateLibraryMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * TemplateLibraryServiceImpl单元测试
 */
@ExtendWith(MockitoExtension.class)
class TemplateLibraryServiceImplTest {

    @Mock
    private TemplateLibraryMapper templateLibraryMapper;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private TemplateLibraryServiceImpl templateLibraryService;

    private TemplateLibrary createTemplate(String id, String type, String key, String name, String content) {
        TemplateLibrary template = new TemplateLibrary();
        template.setId(id);
        template.setTemplateType(type);
        template.setTemplateKey(key);
        template.setTemplateName(name);
        template.setTemplateContent(content);
        template.setCreateTime(LocalDateTime.now());
        template.setUpdateTime(LocalDateTime.now());
        return template;
    }

    @Test
    void testQueryPage() {
        // Given
        Map<String, Object> params = new HashMap<>();
        params.put("page", "1");
        params.put("pageSize", "10");
        params.put("templateType", "progress");
        params.put("keyword", "test");

        Page<TemplateLibrary> page = new Page<>(1, 10);
        List<TemplateLibrary> records = Arrays.asList(
            createTemplate("1", "progress", "default", "Test Template", "{}")
        );
        page.setRecords(records);
        page.setTotal(1);

        when(templateLibraryMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class)))
            .thenReturn(page);

        // When
        IPage<TemplateLibrary> result = templateLibraryService.queryPage(params);

        // Then
        assertNotNull(result);
        assertEquals(1, result.getTotal());
        assertEquals(1, result.getRecords().size());
    }

    @Test
    void testListByType() {
        // Given
        String templateType = "progress";
        List<TemplateLibrary> templates = Arrays.asList(
            createTemplate("1", "progress", "key1", "Template 1", "{}"),
            createTemplate("2", "progress", "key2", "Template 2", "{}")
        );

        when(templateLibraryMapper.selectList(any(LambdaQueryWrapper.class)))
            .thenReturn(templates);

        // When
        List<TemplateLibrary> result = templateLibraryService.listByType(templateType);

        // Then
        assertNotNull(result);
        assertEquals(2, result.size());
    }

    @Test
    void testListByTypeWithEmptyType() {
        // Given
        String templateType = "   ";

        // When
        List<TemplateLibrary> result = templateLibraryService.listByType(templateType);

        // Then
        assertTrue(result.isEmpty());
    }

    @Test
    void testUpsertTemplate_NewTemplate() {
        // Given
        TemplateLibrary template = new TemplateLibrary();
        template.setTemplateType("progress");
        template.setTemplateKey("new-key");
        template.setTemplateName("New Template");
        template.setTemplateContent("{}");

        when(templateLibraryMapper.selectOne(any(LambdaQueryWrapper.class)))
            .thenReturn(null);
        when(templateLibraryMapper.insert(any(TemplateLibrary.class)))
            .thenReturn(1);

        // When
        boolean result = templateLibraryService.upsertTemplate(template);

        // Then
        assertTrue(result);
        verify(templateLibraryMapper).insert(any(TemplateLibrary.class));
    }

    @Test
    void testUpsertTemplate_ExistingTemplate() {
        // Given
        TemplateLibrary existing = createTemplate("1", "progress", "existing-key", "Old Name", "{}");

        TemplateLibrary update = new TemplateLibrary();
        update.setTemplateType("progress");
        update.setTemplateKey("existing-key");
        update.setTemplateName("Updated Name");
        update.setTemplateContent("{\"updated\": true}");

        when(templateLibraryMapper.selectOne(any(LambdaQueryWrapper.class)))
            .thenReturn(existing);
        when(templateLibraryMapper.updateById(any(TemplateLibrary.class)))
            .thenReturn(1);

        // When
        boolean result = templateLibraryService.upsertTemplate(update);

        // Then
        assertTrue(result);
        verify(templateLibraryMapper).updateById(any(TemplateLibrary.class));
    }

    @Test
    void testUpsertTemplate_InvalidParams() {
        // Given
        TemplateLibrary template = new TemplateLibrary();
        template.setTemplateType(null);
        template.setTemplateKey("key");

        // When & Then
        assertThrows(IllegalArgumentException.class, () -> {
            templateLibraryService.upsertTemplate(template);
        });
    }

    @Test
    void testParseProcessUnitPrices() {
        // Given
        String processJson = "{\"steps\": [{\"processName\": \"Cutting\", \"unitPrice\": 10.5}, {\"processName\": \"Sewing\", \"price\": 20.0}]}";

        Map<String, Object> content = new HashMap<>();
        List<Map<String, Object>> steps = new ArrayList<>();
        Map<String, Object> step1 = new HashMap<>();
        step1.put("processName", "Cutting");
        step1.put("unitPrice", 10.5);
        steps.add(step1);
        Map<String, Object> step2 = new HashMap<>();
        step2.put("processName", "Sewing");
        step2.put("price", 20.0);
        steps.add(step2);
        content.put("steps", steps);

        try {
            when(objectMapper.readValue(anyString(), any(com.fasterxml.jackson.core.type.TypeReference.class)))
                .thenReturn(content);
        } catch (Exception e) {
            fail("Mock setup failed");
        }

        // When
        Map<String, BigDecimal> result = templateLibraryService.parseProcessUnitPrices(processJson);

        // Then
        assertNotNull(result);
        assertEquals(2, result.size());
        assertEquals(new BigDecimal("10.5"), result.get("Cutting"));
        assertEquals(new BigDecimal("20.0"), result.get("Sewing"));
    }

    @Test
    void testParseProcessUnitPrices_EmptyJson() {
        // Given
        String processJson = "";

        // When
        Map<String, BigDecimal> result = templateLibraryService.parseProcessUnitPrices(processJson);

        // Then
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    @Test
    void testProgressStageNameMatches_ExactMatch() {
        // When & Then
        assertTrue(templateLibraryService.progressStageNameMatches("下单", "下单"));
        assertTrue(templateLibraryService.progressStageNameMatches("采购", "采购"));
    }

    @Test
    void testProgressStageNameMatches_ContainsMatch() {
        // When & Then
        assertTrue(templateLibraryService.progressStageNameMatches("物料采购", "采购"));
        assertTrue(templateLibraryService.progressStageNameMatches("采购", "物料采购"));
    }

    @Test
    void testProgressStageNameMatches_NoMatch() {
        // When & Then
        assertFalse(templateLibraryService.progressStageNameMatches("下单", "采购"));
        assertFalse(templateLibraryService.progressStageNameMatches("", "采购"));
        assertFalse(templateLibraryService.progressStageNameMatches("下单", ""));
    }

    @Test
    void testIsProgressQualityStageName() {
        // When & Then
        assertTrue(templateLibraryService.isProgressQualityStageName("质检"));
        assertTrue(templateLibraryService.isProgressQualityStageName("检验"));
        assertTrue(templateLibraryService.isProgressQualityStageName("品检"));
        assertTrue(templateLibraryService.isProgressQualityStageName("验货"));
        assertFalse(templateLibraryService.isProgressQualityStageName("车缝"));
    }

    @Test
    void testIsProgressPackagingStageName() {
        // When & Then
        assertTrue(templateLibraryService.isProgressPackagingStageName("包装"));
        assertTrue(templateLibraryService.isProgressPackagingStageName("后整"));
        assertTrue(templateLibraryService.isProgressPackagingStageName("打包"));
        assertFalse(templateLibraryService.isProgressPackagingStageName("车缝"));
    }

    @Test
    void testResolveProgressNodeIndexFromPercent() {
        // When & Then
        assertEquals(0, templateLibraryService.resolveProgressNodeIndexFromPercent(5, 0));
        assertEquals(0, templateLibraryService.resolveProgressNodeIndexFromPercent(5, 10));
        assertEquals(2, templateLibraryService.resolveProgressNodeIndexFromPercent(5, 50));
        assertEquals(4, templateLibraryService.resolveProgressNodeIndexFromPercent(5, 100));
    }

    @Test
    void testResolveProgressNodeIndexFromPercent_EdgeCases() {
        // When & Then
        assertEquals(0, templateLibraryService.resolveProgressNodeIndexFromPercent(1, 50));
        assertEquals(0, templateLibraryService.resolveProgressNodeIndexFromPercent(5, -10));
        assertEquals(4, templateLibraryService.resolveProgressNodeIndexFromPercent(5, 110));
    }
}
