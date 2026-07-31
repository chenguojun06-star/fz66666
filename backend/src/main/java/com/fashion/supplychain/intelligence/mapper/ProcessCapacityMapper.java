package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.ProcessCapacity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 工序级产能配置 Mapper（APS 排产引擎）
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Mapper
public interface ProcessCapacityMapper extends BaseMapper<ProcessCapacity> {

    /**
     * 按租户 + 工厂名称查询启用的工序产能（P0铁律4：多租户隔离）
     *
     * @param tenantId    租户ID
     * @param factoryName 工厂名称
     * @return 工序产能列表
     */
    @Select("SELECT * FROM t_process_capacity " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND factory_name = #{factoryName} " +
            "  AND enabled = 1 " +
            "  AND delete_flag = 0")
    List<ProcessCapacity> listByFactoryName(@Param("tenantId") Long tenantId,
                                            @Param("factoryName") String factoryName);

    /**
     * 按租户查询所有启用的工序产能（P0铁律4：多租户隔离）
     *
     * @param tenantId 租户ID
     * @return 工序产能列表
     */
    @Select("SELECT * FROM t_process_capacity " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND enabled = 1 " +
            "  AND delete_flag = 0 " +
            "ORDER BY factory_name, process_name")
    List<ProcessCapacity> listAllEnabled(@Param("tenantId") Long tenantId);
}
