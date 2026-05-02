package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.entity.ProcessParentMapping;
import com.fashion.supplychain.production.mapper.ProcessParentMappingMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class ProcessParentMappingService {

    @Autowired
    private ProcessParentMappingMapper mapper;

    private final Cache<String, String> cache = Caffeine.newBuilder()
            .maximumSize(2000)
            .refreshAfterWrite(10, TimeUnit.MINUTES)
            .build(this::loadSingle);

    private volatile Map<String, String> allMappingsSnapshot = new HashMap<>();

    private String loadSingle(String key) {
        Map<String, String> snap = allMappingsSnapshot;
        return snap.get(key);
    }

    @PostConstruct
    public void init() {
        reload();
    }

    public void reload() {
        try {
            List<ProcessParentMapping> all = mapper.selectList(null);
            Map<String, String> newMap = new HashMap<>();
            for (ProcessParentMapping m : all) {
                if (m.getProcessKeyword() != null && m.getParentNode() != null) {
                    newMap.put(m.getProcessKeyword().trim(), m.getParentNode().trim());
                }
            }
            this.allMappingsSnapshot = newMap;
            cache.invalidateAll();
            log.info("工序→父节点映射已加载: {} 条", newMap.size());
        } catch (Exception e) {
            log.warn("加载工序映射表失败（表可能不存在），将使用空缓存", e);
            this.allMappingsSnapshot = new HashMap<>();
            cache.invalidateAll();
        }
    }

    public String resolveParentNode(String processName) {
        if (processName == null || processName.trim().isEmpty()) {
            return null;
        }
        String pn = processName.trim();

        String exact = cache.getIfPresent(pn);
        if (exact != null) {
            return exact;
        }

        Map<String, String> snap = allMappingsSnapshot;
        String bestParent = null;
        int bestLen = 0;
        for (Map.Entry<String, String> entry : snap.entrySet()) {
            String keyword = entry.getKey();
            if (keyword.length() > bestLen && pn.contains(keyword)) {
                bestParent = entry.getValue();
                bestLen = keyword.length();
            }
        }
        return bestParent;
    }

    public Map<String, String> getAllMappings() {
        return Collections.unmodifiableMap(allMappingsSnapshot);
    }
}
