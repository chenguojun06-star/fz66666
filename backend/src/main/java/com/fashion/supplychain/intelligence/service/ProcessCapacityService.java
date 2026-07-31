package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.ProcessCapacity;
import com.fashion.supplychain.intelligence.mapper.ProcessCapacityMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 工序级产能配置服务（APS 排产引擎）
 *
 * <p>不加 @Transactional（D-001：Service 层禁止事务）</p>
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProcessCapacityService {

    private final ProcessCapacityMapper processCapacityMapper;

    /**
     * 按工厂名称查询启用的工序产能列表（P0铁律4：多租户隔离）
     *
     * @param factoryName 工厂名称
     * @return 工序产能列表
     */
    public List<ProcessCapacity> listByFactoryName(String factoryName) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || factoryName == null) {
            return List.of();
        }
        return processCapacityMapper.listByFactoryName(tenantId, factoryName);
    }

    /**
     * 查询租户下所有启用的工序产能（P0铁律4：多租户隔离）
     *
     * @return 工序产能列表
     */
    public List<ProcessCapacity> listAllEnabled() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return List.of();
        }
        return processCapacityMapper.listAllEnabled(tenantId);
    }

    /**
     * 按工厂名称分组查询工序产能（供 Orchestrator 快速查找）
     *
     * @return Map<工厂名称, Map<工序名称, ProcessCapacity>>
     */
    public Map<String, Map<String, ProcessCapacity>> loadCapacityByFactory() {
        return listAllEnabled().stream()
                .filter(c -> c.getFactoryName() != null && c.getProcessName() != null)
                .collect(Collectors.groupingBy(
                        ProcessCapacity::getFactoryName,
                        Collectors.toMap(ProcessCapacity::getProcessName, c -> c, (a, b) -> a)));
    }

    /**
     * 列表查询（带租户隔离）
     *
     * @param factoryName 工厂名称（可选）
     * @return 工序产能列表
     */
    public List<ProcessCapacity> list(String factoryName) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return List.of();
        }
        LambdaQueryWrapper<ProcessCapacity> wrapper = new LambdaQueryWrapper<ProcessCapacity>()
                .eq(ProcessCapacity::getTenantId, tenantId)
                .eq(ProcessCapacity::getDeleteFlag, 0);
        if (factoryName != null && !factoryName.isBlank()) {
            wrapper.eq(ProcessCapacity::getFactoryName, factoryName);
        }
        wrapper.orderByAsc(ProcessCapacity::getFactoryName)
               .orderByAsc(ProcessCapacity::getProcessName);
        return processCapacityMapper.selectList(wrapper);
    }

    /**
     * 保存工序产能配置（新增或更新，P0铁律4：多租户隔离）
     *
     * @param capacity 工序产能配置（tenantId 从 UserContext 获取，不信任外部传入）
     * @return 保存后的记录
     */
    public ProcessCapacity save(ProcessCapacity capacity) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("租户ID不能为空");
        }
        if (capacity.getFactoryId() == null) {
            throw new IllegalArgumentException("工厂ID不能为空");
        }
        if (capacity.getProcessName() == null || capacity.getProcessName().isBlank()) {
            throw new IllegalArgumentException("工序名称不能为空");
        }

        capacity.setTenantId(tenantId);
        capacity.setDeleteFlag(0);

        // 按 (tenantId, factoryId, processName) upsert
        LambdaQueryWrapper<ProcessCapacity> existsWrapper = new LambdaQueryWrapper<ProcessCapacity>()
                .eq(ProcessCapacity::getTenantId, tenantId)
                .eq(ProcessCapacity::getFactoryId, capacity.getFactoryId())
                .eq(ProcessCapacity::getProcessName, capacity.getProcessName())
                .eq(ProcessCapacity::getDeleteFlag, 0);
        ProcessCapacity existing = processCapacityMapper.selectOne(existsWrapper);

        if (existing != null) {
            capacity.setId(existing.getId());
            processCapacityMapper.updateById(capacity);
            log.info("[ProcessCapacity] 更新工序产能 id={} factory={} process={}",
                    existing.getId(), capacity.getFactoryName(), capacity.getProcessName());
        } else {
            processCapacityMapper.insert(capacity);
            log.info("[ProcessCapacity] 新增工序产能 id={} factory={} process={}",
                    capacity.getId(), capacity.getFactoryName(), capacity.getProcessName());
        }
        return capacity;
    }
}
