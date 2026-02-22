package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * ScanRecordServiceImpl单元测试
 */
@ExtendWith(MockitoExtension.class)
class ScanRecordServiceImplTest {

    @Mock
    private ScanRecordMapper scanRecordMapper;

    @InjectMocks
    private ScanRecordServiceImpl scanRecordService;

    private ScanRecord createScanRecord(String id, String orderId, String orderNo, String scanType, String scanResult) {
        ScanRecord record = new ScanRecord();
        record.setId(id);
        record.setOrderId(orderId);
        record.setOrderNo(orderNo);
        record.setScanType(scanType);
        record.setScanResult(scanResult);
        record.setScanTime(LocalDateTime.now());
        record.setCreateTime(LocalDateTime.now());
        return record;
    }

    @Test
    void testGetScanStatsByOrder() {
        // Given
        String orderNo = "ORDER001";
        List<Map<String, Object>> stats = Arrays.asList(
            Map.of("color", "Red", "size", "L", "count", 10),
            Map.of("color", "Blue", "size", "M", "count", 5)
        );

        when(scanRecordMapper.selectMaps(any(QueryWrapper.class)))
            .thenReturn(stats);

        // When
        List<Map<String, Object>> result = scanRecordService.getScanStatsByOrder(orderNo);

        // Then
        assertNotNull(result);
        assertEquals(2, result.size());
    }

    @Test
    void testGetScanStatsByOrder_EmptyOrderNo() {
        // Given
        String orderNo = "";

        // When
        List<Map<String, Object>> result = scanRecordService.getScanStatsByOrder(orderNo);

        // Then
        assertTrue(result.isEmpty());
        verify(scanRecordMapper, never()).selectMaps(any());
    }

    @Test
    void testListByCondition() {
        // Given
        String orderId = "ORDER001";
        String cuttingBundleId = "BUNDLE001";
        String scanType = "production";
        String scanResult = "success";
        String excludeProcessCode = "warehouse_rollback";

        List<ScanRecord> records = Arrays.asList(
            createScanRecord("1", orderId, "ORDER001", scanType, scanResult),
            createScanRecord("2", orderId, "ORDER001", scanType, scanResult)
        );

        when(scanRecordMapper.selectList(any(LambdaQueryWrapper.class)))
            .thenReturn(records);

        // When
        List<ScanRecord> result = scanRecordService.listByCondition(orderId, cuttingBundleId, scanType, scanResult, excludeProcessCode);

        // Then
        assertNotNull(result);
        assertEquals(2, result.size());
    }

    @Test
    void testListQualityWarehousingRecords() {
        // Given
        String orderId = "ORDER001";
        String cuttingBundleId = "BUNDLE001";

        List<ScanRecord> records = Arrays.asList(
            createScanRecord("1", orderId, "ORDER001", "quality", "success"),
            createScanRecord("2", orderId, "ORDER001", "quality", "success")
        );
        records.get(0).setProcessCode("quality_warehousing");
        records.get(1).setProcessCode("quality_warehousing");

        when(scanRecordMapper.selectList(any(LambdaQueryWrapper.class)))
            .thenReturn(records);

        // When
        List<ScanRecord> result = scanRecordService.listQualityWarehousingRecords(orderId, cuttingBundleId);

        // Then
        assertNotNull(result);
        assertEquals(2, result.size());
    }

    @Test
    @Disabled("updateBatchById 依赖 SqlSession，Mockito 单元测试无法支持，需集成测试覆盖")
    void testBatchUpdateRecords() {
        // Given
        List<ScanRecord> records = Arrays.asList(
            createScanRecord("1", "ORDER001", "ORDER001", "production", "success"),
            createScanRecord("2", "ORDER001", "ORDER001", "production", "success")
        );

        when(scanRecordMapper.updateById(any(ScanRecord.class)))
            .thenReturn(1);

        // When
        boolean result = scanRecordService.batchUpdateRecords(records);

        // Then
        assertTrue(result);
    }

    @Test
    void testBatchUpdateRecords_EmptyList() {
        // Given
        List<ScanRecord> records = Collections.emptyList();

        // When
        boolean result = scanRecordService.batchUpdateRecords(records);

        // Then
        assertTrue(result);
    }

    @Test
    void testBatchUpdateRecords_NullList() {
        // Given
        List<ScanRecord> records = null;

        // When
        boolean result = scanRecordService.batchUpdateRecords(records);

        // Then
        assertTrue(result);
    }
}
