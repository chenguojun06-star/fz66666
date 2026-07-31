package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.FactoryCalendar;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;

/**
 * 工厂工作日历 Mapper（APS 排产引擎）
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Mapper
public interface FactoryCalendarMapper extends BaseMapper<FactoryCalendar> {

    /**
     * 查询工厂在某日期范围内的工作日（P0铁律4：多租户隔离）
     *
     * @param tenantId  租户ID
     * @param factoryId 工厂ID
     * @param startDate 开始日期
     * @param endDate   结束日期
     * @return 工作日列表
     */
    @Select("SELECT * FROM t_factory_calendar " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND factory_id = #{factoryId} " +
            "  AND calendar_date BETWEEN #{startDate} AND #{endDate} " +
            "  AND is_workday = 1 " +
            "ORDER BY calendar_date")
    List<FactoryCalendar> listWorkdays(@Param("tenantId") Long tenantId,
                                       @Param("factoryId") String factoryId,
                                       @Param("startDate") LocalDate startDate,
                                       @Param("endDate") LocalDate endDate);

    /**
     * 查询工厂在某日期是否为工作日（P0铁律4：多租户隔离）
     *
     * @param tenantId 租户ID
     * @param factoryId 工厂ID（UUID）
     * @param date 日期
     * @return 工作日历记录（null 表示未配置，调用方应按工作日处理）
     */
    @Select("SELECT * FROM t_factory_calendar " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND factory_id = #{factoryId} " +
            "  AND calendar_date = #{date} " +
            "LIMIT 1")
    FactoryCalendar findByDate(@Param("tenantId") Long tenantId,
                               @Param("factoryId") String factoryId,
                               @Param("date") LocalDate date);
}
