package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.entity.ProcessParentMapping;
import com.fashion.supplychain.production.mapper.ProcessParentMappingMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 工序→父节点动态映射服务
 * <p>
 * 启动时从 t_process_parent_mapping 加载全部映射到内存缓存。
 * 通过 {@link #resolveParentNode(String)} 方法用 contains 匹配，
 * 替代所有硬编码关键词列表（isProgressIroningStageName 等）。
 * </p>
 * <p>
 * 新增工序名称时，只需 INSERT 一行数据 + 调用 {@link #reload()} 刷新缓存。
 * </p>
 */
@Slf4j
@Service
public class ProcessParentMappingService {

    @Autowired
    private ProcessParentMappingMapper mapper;

    /** keyword → parentNode（全局 + 当前租户） */
    private volatile Map<String, String> cache = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        reload();
    }

    /**
     * 从数据库重新加载全部映射到内存
     */
    public void reload() {
        try {
            List<ProcessParentMapping> all = mapper.selectList(null);
            Map<String, String> newCache = new ConcurrentHashMap<>();
            for (ProcessParentMapping m : all) {
                if (m.getProcessKeyword() != null && m.getParentNode() != null) {
                    newCache.put(m.getProcessKeyword().trim(), m.getParentNode().trim());
                }
            }
            this.cache = newCache;
            log.info("工序→父节点映射已加载: {} 条", newCache.size());
        } catch (Exception e) {
            log.warn("加载工序映射表失败（表可能不存在），将使用空缓存", e);
            this.cache = new ConcurrentHashMap<>();
        }
    }

    /**
     * 根据工序名称动态解析其所属的父进度节点
     * <p>
     * 匹配策略：processName.contains(keyword)，
     * 按关键词长度从长到短匹配（优先精确匹配）
     * </p>
     *
     * @param processName 子工序名称（如 "整烫"、"水洗质检"）
     * @return 父节点名称（如 "尾部"、"二次工艺"），未匹配返回 null
     */
    public String resolveParentNode(String processName) {
        if (processName == null || processName.trim().isEmpty()) {
            return null;
        }
        String pn = processName.trim();

        // 1. 精确匹配（最高优先级）
        String exact = cache.get(pn);
        if (exact != null) {
            return exact;
        }

        // 2. contains 匹配（按关键词长度降序，优先长关键词）
        String bestParent = null;
        int bestLen = 0;
        for (Map.Entry<String, String> entry : cache.entrySet()) {
            String keyword = entry.getKey();
            if (keyword.length() > bestLen && pn.contains(keyword)) {
                bestParent = entry.getValue();
                bestLen = keyword.length();
            }
        }
        return bestParent;
    }

    /**
     * 获取全部映射（供 API 接口返回给前端）
     *
     * @return keyword → parentNode 的完整映射
     */
    public Map<String, String> getAllMappings() {
        return Collections.unmodifiableMap(cache);
    }
}
