package com.fashion.supplychain.common.util;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * BatchQueryUtil单元测试
 */
@ExtendWith(MockitoExtension.class)
class BatchQueryUtilTest {

    @Mock
    private BaseMapper<TestEntity> mapper;

    // 测试实体类
    static class TestEntity {
        private Long id;
        private String name;
        private Long parentId;

        TestEntity(Long id, String name, Long parentId) {
            this.id = id;
            this.name = name;
            this.parentId = parentId;
        }

        Long getId() { return id; }
        String getName() { return name; }
        Long getParentId() { return parentId; }
    }

    @Test
    void testBatchQueryToMap() {
        // Given
        List<Long> ids = Arrays.asList(1L, 2L, 3L);
        List<TestEntity> entities = Arrays.asList(
            new TestEntity(1L, "Entity1", 10L),
            new TestEntity(2L, "Entity2", 20L),
            new TestEntity(3L, "Entity3", 30L)
        );
        
        when(mapper.selectList(any(QueryWrapper.class))).thenReturn(entities);

        // When
        Map<Long, TestEntity> result = BatchQueryUtil.batchQueryToMap(
            ids, mapper, TestEntity::getId
        );

        // Then
        assertEquals(3, result.size());
        assertEquals("Entity1", result.get(1L).getName());
        assertEquals("Entity2", result.get(2L).getName());
        assertEquals("Entity3", result.get(3L).getName());
    }

    @Test
    void testBatchQueryToMapWithEmptyIds() {
        // Given
        List<Long> ids = Collections.emptyList();

        // When
        Map<Long, TestEntity> result = BatchQueryUtil.batchQueryToMap(
            ids, mapper, TestEntity::getId
        );

        // Then
        assertTrue(result.isEmpty());
        verify(mapper, never()).selectList(any());
    }

    @Test
    void testBatchQueryToMapWithNullIds() {
        // When
        Map<Long, TestEntity> result = BatchQueryUtil.batchQueryToMap(
            null, mapper, TestEntity::getId
        );

        // Then
        assertTrue(result.isEmpty());
        verify(mapper, never()).selectList(any());
    }

    @Test
    void testBatchQueryByColumnToMap() {
        // Given
        List<Long> parentIds = Arrays.asList(10L, 20L);
        List<TestEntity> entities = Arrays.asList(
            new TestEntity(1L, "Entity1", 10L),
            new TestEntity(2L, "Entity2", 10L),
            new TestEntity(3L, "Entity3", 20L)
        );
        
        when(mapper.selectList(any(QueryWrapper.class))).thenReturn(entities);

        // When
        Map<Long, TestEntity> result = BatchQueryUtil.batchQueryByColumnToMap(
            parentIds, mapper, "parent_id", TestEntity::getId
        );

        // Then
        assertEquals(3, result.size());
        verify(mapper).selectList(any(QueryWrapper.class));
    }

    @Test
    void testBatchQueryGroupBy() {
        // Given
        List<Long> parentIds = Arrays.asList(10L, 20L);
        List<TestEntity> entities = Arrays.asList(
            new TestEntity(1L, "Entity1", 10L),
            new TestEntity(2L, "Entity2", 10L),
            new TestEntity(3L, "Entity3", 20L),
            new TestEntity(4L, "Entity4", 20L)
        );
        
        when(mapper.selectList(any(QueryWrapper.class))).thenReturn(entities);

        // When
        Map<Long, List<TestEntity>> result = BatchQueryUtil.batchQueryGroupBy(
            parentIds, mapper, "parent_id", TestEntity::getParentId
        );

        // Then
        assertEquals(2, result.size());
        assertEquals(2, result.get(10L).size());
        assertEquals(2, result.get(20L).size());
    }

    @Test
    void testBatchQueryInBatches() {
        // Given
        List<Long> ids = new ArrayList<>();
        for (long i = 1; i <= 150; i++) {
            ids.add(i);
        }
        
        List<TestEntity> batch1Entities = new ArrayList<>();
        for (long i = 1; i <= 100; i++) {
            batch1Entities.add(new TestEntity(i, "Entity" + i, i * 10));
        }
        
        List<TestEntity> batch2Entities = new ArrayList<>();
        for (long i = 101; i <= 150; i++) {
            batch2Entities.add(new TestEntity(i, "Entity" + i, i * 10));
        }
        
        when(mapper.selectList(any(QueryWrapper.class)))
            .thenReturn(batch1Entities)
            .thenReturn(batch2Entities);

        // When
        List<TestEntity> result = BatchQueryUtil.batchQueryInBatches(
            ids, mapper, 100
        );

        // Then
        assertEquals(150, result.size());
        verify(mapper, times(2)).selectList(any(QueryWrapper.class));
    }

    @Test
    void testSafeGet() {
        // Given
        Map<String, String> map = new HashMap<>();
        map.put("key1", "value1");

        // When & Then
        assertEquals("value1", BatchQueryUtil.safeGet(map, "key1"));
        assertNull(BatchQueryUtil.safeGet(map, "key2"));
        assertNull(BatchQueryUtil.safeGet(null, "key1"));
        assertNull(BatchQueryUtil.safeGet(map, null));
    }

    @Test
    void testSafeGetList() {
        // Given
        Map<String, List<String>> map = new HashMap<>();
        map.put("key1", Arrays.asList("value1", "value2"));

        // When & Then
        assertEquals(2, BatchQueryUtil.safeGetList(map, "key1").size());
        assertTrue(BatchQueryUtil.safeGetList(map, "key2").isEmpty());
        assertTrue(BatchQueryUtil.safeGetList(null, "key1").isEmpty());
    }

    @Test
    void testBatchQueryToMapWithDuplicateKeys() {
        // Given - 模拟有重复key的情况（虽然不应该发生）
        List<Long> ids = Arrays.asList(1L, 2L);
        List<TestEntity> entities = Arrays.asList(
            new TestEntity(1L, "Entity1", 10L),
            new TestEntity(1L, "Entity1_Duplicate", 10L), // 重复的key
            new TestEntity(2L, "Entity2", 20L)
        );
        
        when(mapper.selectList(any(QueryWrapper.class))).thenReturn(entities);

        // When
        Map<Long, TestEntity> result = BatchQueryUtil.batchQueryToMap(
            ids, mapper, TestEntity::getId
        );

        // Then - 应该保留第一个值
        assertEquals(2, result.size());
        assertEquals("Entity1", result.get(1L).getName());
    }

    @Test
    void testBatchQueryToMapWithNullInIds() {
        // Given
        List<Long> ids = Arrays.asList(1L, null, 2L, null);
        List<TestEntity> entities = Arrays.asList(
            new TestEntity(1L, "Entity1", 10L),
            new TestEntity(2L, "Entity2", 20L)
        );
        
        when(mapper.selectList(any(QueryWrapper.class))).thenReturn(entities);

        // When
        Map<Long, TestEntity> result = BatchQueryUtil.batchQueryToMap(
            ids, mapper, TestEntity::getId
        );

        // Then - null值应该被过滤
        assertEquals(2, result.size());
        verify(mapper).selectList(any(QueryWrapper.class));
    }
}
