package com.fashion.supplychain.common.util;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import lombok.extern.slf4j.Slf4j;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 批量查询工具类
 * 解决N+1查询问题，提供批量查询和映射功能
 */
@Slf4j
public class BatchQueryUtil {

    /**
     * 批量查询并映射为Map
     *
     * @param ids 要查询的ID列表
     * @param mapper MyBatis Mapper
     * @param keyExtractor 提取key的函数
     * @param <T> 实体类型
     * @param <K> key类型
     * @return Map<key, Entity>
     */
    public static <T, K> Map<K, T> batchQueryToMap(
            Collection<K> ids,
            BaseMapper<T> mapper,
            Function<T, K> keyExtractor) {
        
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyMap();
        }

        // 去重并过滤null
        List<K> uniqueIds = ids.stream()
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        if (uniqueIds.isEmpty()) {
            return Collections.emptyMap();
        }

        // 批量查询
        QueryWrapper<T> wrapper = new QueryWrapper<>();
        wrapper.in("id", uniqueIds);
        List<T> entities = mapper.selectList(wrapper);

        // 转换为Map
        return entities.stream()
                .collect(Collectors.toMap(
                        keyExtractor,
                        Function.identity(),
                        (existing, replacement) -> existing  // 处理重复key
                ));
    }

    /**
     * 批量查询并映射为Map（根据指定字段）
     *
     * @param keys 要查询的key列表
     * @param mapper MyBatis Mapper
     * @param column 查询的字段名
     * @param keyExtractor 提取key的函数
     * @param <T> 实体类型
     * @param <K> key类型
     * @return Map<key, Entity>
     */
    public static <T, K> Map<K, T> batchQueryByColumnToMap(
            Collection<K> keys,
            BaseMapper<T> mapper,
            String column,
            Function<T, K> keyExtractor) {
        
        if (keys == null || keys.isEmpty()) {
            return Collections.emptyMap();
        }

        List<K> uniqueKeys = keys.stream()
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        if (uniqueKeys.isEmpty()) {
            return Collections.emptyMap();
        }

        QueryWrapper<T> wrapper = new QueryWrapper<>();
        wrapper.in(column, uniqueKeys);
        List<T> entities = mapper.selectList(wrapper);

        return entities.stream()
                .collect(Collectors.toMap(
                        keyExtractor,
                        Function.identity(),
                        (existing, replacement) -> existing
                ));
    }

    /**
     * 批量查询并分组
     *
     * @param keys 要查询的key列表
     * @param mapper MyBatis Mapper
     * @param column 查询的字段名
     * @param keyExtractor 提取key的函数
     * @param <T> 实体类型
     * @param <K> key类型
     * @return Map<key, List<Entity>>
     */
    public static <T, K> Map<K, List<T>> batchQueryGroupBy(
            Collection<K> keys,
            BaseMapper<T> mapper,
            String column,
            Function<T, K> keyExtractor) {
        
        if (keys == null || keys.isEmpty()) {
            return Collections.emptyMap();
        }

        List<K> uniqueKeys = keys.stream()
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        if (uniqueKeys.isEmpty()) {
            return Collections.emptyMap();
        }

        QueryWrapper<T> wrapper = new QueryWrapper<>();
        wrapper.in(column, uniqueKeys);
        List<T> entities = mapper.selectList(wrapper);

        return entities.stream()
                .collect(Collectors.groupingBy(keyExtractor));
    }

    /**
     * 分批查询（处理大量数据）
     *
     * @param ids 要查询的ID列表
     * @param mapper MyBatis Mapper
     * @param batchSize 每批大小
     * @param <T> 实体类型
     * @param <K> ID类型
     * @return List<Entity>
     */
    public static <T, K> List<T> batchQueryInBatches(
            Collection<K> ids,
            BaseMapper<T> mapper,
            int batchSize) {
        
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyList();
        }

        List<K> uniqueIds = ids.stream()
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        if (uniqueIds.isEmpty()) {
            return Collections.emptyList();
        }

        List<T> result = new ArrayList<>();
        int size = uniqueIds.size();

        for (int i = 0; i < size; i += batchSize) {
            List<K> batch = uniqueIds.subList(i, Math.min(i + batchSize, size));
            QueryWrapper<T> wrapper = new QueryWrapper<>();
            wrapper.in("id", batch);
            result.addAll(mapper.selectList(wrapper));
        }

        return result;
    }

    /**
     * 安全地获取关联数据
     *
     * @param map 数据Map
     * @param key 查询key
     * @param <K> key类型
     * @param <V> value类型
     * @return value或null
     */
    public static <K, V> V safeGet(Map<K, V> map, K key) {
        if (map == null || key == null) {
            return null;
        }
        return map.get(key);
    }

    /**
     * 安全地获取关联数据列表
     *
     * @param map 数据Map
     * @param key 查询key
     * @param <K> key类型
     * @param <V> value类型
     * @return List<value>或空列表
     */
    public static <K, V> List<V> safeGetList(Map<K, List<V>> map, K key) {
        if (map == null || key == null) {
            return Collections.emptyList();
        }
        return map.getOrDefault(key, Collections.emptyList());
    }
}
