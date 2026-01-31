package com.fashion.supplychain.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * RedisService单元测试
 */
@ExtendWith(MockitoExtension.class)
class RedisServiceTest {

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private ValueOperations<String, Object> valueOperations;

    @InjectMocks
    private RedisService redisService;

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void testSet() {
        // Given
        String key = "test:key";
        String value = "testValue";

        // When
        redisService.set(key, value);

        // Then
        verify(valueOperations).set(key, value);
    }

    @Test
    void testSetWithExpire() {
        // Given
        String key = "test:key";
        String value = "testValue";
        long timeout = 30;
        TimeUnit unit = TimeUnit.MINUTES;

        // When
        redisService.set(key, value, timeout, unit);

        // Then
        verify(valueOperations).set(key, value, timeout, unit);
    }

    @Test
    void testGet() {
        // Given
        String key = "test:key";
        String expectedValue = "testValue";
        when(valueOperations.get(key)).thenReturn(expectedValue);

        // When
        String result = redisService.get(key);

        // Then
        assertEquals(expectedValue, result);
        verify(valueOperations).get(key);
    }

    @Test
    void testGetNotFound() {
        // Given
        String key = "test:key:notfound";
        when(valueOperations.get(key)).thenReturn(null);

        // When
        String result = redisService.get(key);

        // Then
        assertNull(result);
    }

    @Test
    void testDelete() {
        // Given
        String key = "test:key";

        // When
        redisService.delete(key);

        // Then
        verify(redisTemplate).delete(key);
    }

    @Test
    void testDeleteBatch() {
        // Given
        Set<String> keys = new HashSet<>(Arrays.asList("key1", "key2", "key3"));

        // When
        redisService.delete(keys);

        // Then
        verify(redisTemplate).delete(keys);
    }

    @Test
    void testHasKey() {
        // Given
        String key = "test:key";
        when(redisTemplate.hasKey(key)).thenReturn(true);

        // When
        boolean result = redisService.hasKey(key);

        // Then
        assertTrue(result);
    }

    @Test
    void testHasKeyNotFound() {
        // Given
        String key = "test:key:notfound";
        when(redisTemplate.hasKey(key)).thenReturn(false);

        // When
        boolean result = redisService.hasKey(key);

        // Then
        assertFalse(result);
    }

    @Test
    void testExpire() {
        // Given
        String key = "test:key";
        long timeout = 30;
        TimeUnit unit = TimeUnit.MINUTES;
        when(redisTemplate.expire(key, timeout, unit)).thenReturn(true);

        // When
        boolean result = redisService.expire(key, timeout, unit);

        // Then
        assertTrue(result);
    }

    @Test
    void testIncrement() {
        // Given
        String key = "test:counter";
        long delta = 5;
        when(valueOperations.increment(key, delta)).thenReturn(10L);

        // When
        Long result = redisService.increment(key, delta);

        // Then
        assertEquals(10L, result);
    }

    @Test
    void testDecrement() {
        // Given
        String key = "test:counter";
        long delta = 3;
        when(valueOperations.decrement(key, delta)).thenReturn(7L);

        // When
        Long result = redisService.decrement(key, delta);

        // Then
        assertEquals(7L, result);
    }

    @Test
    void testHSet() {
        // Given
        String key = "test:hash";
        String hashKey = "field1";
        String value = "value1";

        // When
        redisService.hSet(key, hashKey, value);

        // Then
        verify(redisTemplate.opsForHash()).put(key, hashKey, value);
    }

    @Test
    void testHGet() {
        // Given
        String key = "test:hash";
        String hashKey = "field1";
        String expectedValue = "value1";
        when(redisTemplate.opsForHash().get(key, hashKey)).thenReturn(expectedValue);

        // When
        String result = redisService.hGet(key, hashKey);

        // Then
        assertEquals(expectedValue, result);
    }

    @Test
    void testSetWithException() {
        // Given
        String key = "test:key";
        String value = "testValue";
        doThrow(new RuntimeException("Redis connection failed"))
                .when(valueOperations).set(key, value);

        // When & Then - 应该捕获异常，不抛出
        assertDoesNotThrow(() -> redisService.set(key, value));
    }

    @Test
    void testGetWithException() {
        // Given
        String key = "test:key";
        when(valueOperations.get(key)).thenThrow(new RuntimeException("Redis connection failed"));

        // When
        Object result = redisService.get(key);

        // Then - 应该返回null，不抛出异常
        assertNull(result);
    }
}
