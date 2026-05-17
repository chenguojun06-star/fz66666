package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SerialOrchestratorTest {

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private SerialOrchestrator serialOrchestrator;

    private MockedStatic<UserContext> mockedUserContext;

    @BeforeEach
    void setUp() {
        mockedUserContext = mockStatic(UserContext.class);
    }

    @AfterEach
    void tearDown() {
        mockedUserContext.close();
    }

    @Test
    void generate_shouldThrowExceptionWhenRuleCodeEmpty() {
        assertThrows(IllegalArgumentException.class, () -> serialOrchestrator.generate(null));
        assertThrows(IllegalArgumentException.class, () -> serialOrchestrator.generate(""));
        assertThrows(IllegalArgumentException.class, () -> serialOrchestrator.generate("   "));
    }

    @Test
    void generate_shouldThrowExceptionWhenRuleCodeUnknown() {
        assertThrows(IllegalArgumentException.class, () -> serialOrchestrator.generate("UNKNOWN_CODE"));
    }

    @Test
    void generate_shouldGenerateStyleNoWhenNoExistingRecords() {
        when(styleInfoService.getOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        when(styleInfoService.count(any(LambdaQueryWrapper.class))).thenReturn(0L);

        String result = serialOrchestrator.generate("STYLE_NO");

        assertNotNull(result);
        assertTrue(result.startsWith("ST"));
        assertTrue(result.matches("ST\\d{8}\\d{3}"));
    }

    @Test
    void generate_shouldGenerateNextStyleNoWhenExistingRecordExists() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String existingStyleNo = "ST" + today + "005";
        StyleInfo existing = new StyleInfo();
        existing.setStyleNo(existingStyleNo);

        when(styleInfoService.getOne(any(LambdaQueryWrapper.class))).thenReturn(existing);
        when(styleInfoService.count(any(LambdaQueryWrapper.class))).thenReturn(0L);

        String result = serialOrchestrator.generate("STYLE_NO");

        assertNotNull(result);
        assertEquals("ST" + today + "006", result);
    }

    @Test
    void generate_shouldHandleStyleNoConflictAndRetry() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String existingStyleNo = "ST" + today + "005";
        StyleInfo existing = new StyleInfo();
        existing.setStyleNo(existingStyleNo);

        when(styleInfoService.getOne(any(LambdaQueryWrapper.class))).thenReturn(existing);
        when(styleInfoService.count(any(LambdaQueryWrapper.class)))
                .thenReturn(1L)  // 006 已存在
                .thenReturn(1L)  // 007 已存在
                .thenReturn(0L); // 008 可用

        String result = serialOrchestrator.generate("STYLE_NO");

        assertNotNull(result);
        assertEquals("ST" + today + "008", result);
    }

    @Test
    void generate_shouldGenerateOrderNoWhenNoExistingRecords() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(1L);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(0);

        String result = serialOrchestrator.generate("ORDER_NO");

        assertNotNull(result);
        assertTrue(result.startsWith("PO"));
        assertTrue(result.matches("PO\\d{14}"));
    }

    @Test
    void generate_shouldGenerateNextOrderNoWhenConflictExists() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(1L);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(1)  // 基础号存在
                .thenReturn(1)  // 01 存在
                .thenReturn(0); // 02 可用

        String result = serialOrchestrator.generate("ORDER_NO");

        assertNotNull(result);
        assertTrue(result.startsWith("PO"));
        assertTrue(result.matches("PO\\d{14}02"));
    }

    @Test
    void generate_shouldGenerateOrderNoWithNullTenantId() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(null);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(0);

        String result = serialOrchestrator.generate("ORDER_NO");

        assertNotNull(result);
        assertTrue(result.startsWith("PO"));
        assertTrue(result.matches("PO\\d{14}"));
    }

    @Test
    void generate_shouldUseFallbackWhenTooManyStyleNoConflicts() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String existingStyleNo = "ST" + today + "200";
        StyleInfo existing = new StyleInfo();
        existing.setStyleNo(existingStyleNo);

        when(styleInfoService.getOne(any(LambdaQueryWrapper.class))).thenReturn(existing);
        when(styleInfoService.count(any(LambdaQueryWrapper.class))).thenReturn(1L); // 所有 200 以内的都已存在

        String result = serialOrchestrator.generate("STYLE_NO");

        assertNotNull(result);
        assertTrue(result.startsWith("ST" + today));
    }

    @Test
    void generate_shouldUseFallbackWhenTooManyOrderNoConflicts() {
        mockedUserContext.when(UserContext::tenantId).thenReturn(1L);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(1); // 所有 99 以内的都已存在

        String result = serialOrchestrator.generate("ORDER_NO");

        assertNotNull(result);
        assertTrue(result.startsWith("PO"));
    }

    @Test
    void generate_shouldHandleInvalidStyleNoFormatGracefully() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String invalidStyleNo = "ST" + today + "xxx"; // 非数字后缀
        StyleInfo existing = new StyleInfo();
        existing.setStyleNo(invalidStyleNo);

        when(styleInfoService.getOne(any(LambdaQueryWrapper.class))).thenReturn(existing);
        when(styleInfoService.count(any(LambdaQueryWrapper.class))).thenReturn(0L);

        String result = serialOrchestrator.generate("STYLE_NO");

        assertNotNull(result);
        assertEquals("ST" + today + "001", result); // 从 001 开始
    }

    @Test
    void generate_shouldHandleStyleNoTooShortGracefully() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String shortStyleNo = "ST" + today; // 没有后缀
        StyleInfo existing = new StyleInfo();
        existing.setStyleNo(shortStyleNo);

        when(styleInfoService.getOne(any(LambdaQueryWrapper.class))).thenReturn(existing);
        when(styleInfoService.count(any(LambdaQueryWrapper.class))).thenReturn(0L);

        String result = serialOrchestrator.generate("STYLE_NO");

        assertNotNull(result);
        assertEquals("ST" + today + "001", result); // 从 001 开始
    }
}
