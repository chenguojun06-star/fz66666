package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Mapper
public interface MaterialOutboundLogMapper extends BaseMapper<MaterialOutboundLog> {

    @Select("SELECT * FROM t_material_outbound_log " +
            "WHERE DATE(COALESCE(outbound_time, create_time)) = #{today} " +
            "AND (delete_flag IS NULL OR delete_flag = 0) " +
            "AND (#{tenantId} IS NULL OR tenant_id = #{tenantId}) " +
            "ORDER BY COALESCE(outbound_time, create_time) DESC LIMIT 20")
    List<MaterialOutboundLog> selectTodayOutbounds(@Param("today") LocalDate today, @Param("tenantId") Long tenantId);

    @Select("SELECT COUNT(*) FROM t_material_outbound_log " +
            "WHERE DATE(COALESCE(outbound_time, create_time)) = #{today} " +
            "AND (delete_flag IS NULL OR delete_flag = 0) " +
            "AND (#{tenantId} IS NULL OR tenant_id = #{tenantId})")
    Integer selectTodayOutboundCount(@Param("today") LocalDate today, @Param("tenantId") Long tenantId);

    @Select("SELECT HOUR(COALESCE(outbound_time, create_time)) AS hour, COUNT(*) AS count " +
            "FROM t_material_outbound_log " +
            "WHERE DATE(COALESCE(outbound_time, create_time)) = #{today} " +
            "AND (delete_flag IS NULL OR delete_flag = 0) " +
            "GROUP BY HOUR(COALESCE(outbound_time, create_time))")
    List<Map<String, Object>> selectTodayOutboundByHour(@Param("today") LocalDate today);

    @Select("SELECT DATE(COALESCE(outbound_time, create_time)) AS date, COUNT(*) AS count " +
            "FROM t_material_outbound_log " +
            "WHERE DATE(COALESCE(outbound_time, create_time)) BETWEEN #{startDate} AND #{today} " +
            "AND (delete_flag IS NULL OR delete_flag = 0) " +
            "GROUP BY DATE(COALESCE(outbound_time, create_time))")
    List<Map<String, Object>> selectLast7DaysOutbound(@Param("startDate") LocalDate startDate, @Param("today") LocalDate today);

    @Select("SELECT DAY(COALESCE(outbound_time, create_time)) AS day, COUNT(*) AS count " +
            "FROM t_material_outbound_log " +
            "WHERE DATE(COALESCE(outbound_time, create_time)) BETWEEN #{startDate} AND #{today} " +
            "AND (delete_flag IS NULL OR delete_flag = 0) " +
            "GROUP BY DAY(COALESCE(outbound_time, create_time))")
    List<Map<String, Object>> selectLast30DaysOutbound(@Param("startDate") LocalDate startDate, @Param("today") LocalDate today);

    @Select("SELECT MONTH(COALESCE(outbound_time, create_time)) AS month, COUNT(*) AS count " +
            "FROM t_material_outbound_log " +
            "WHERE YEAR(COALESCE(outbound_time, create_time)) = #{year} " +
            "AND (delete_flag IS NULL OR delete_flag = 0) " +
            "GROUP BY MONTH(COALESCE(outbound_time, create_time))")
    List<Map<String, Object>> selectYearOutboundByMonth(@Param("year") int year);

    @Select("SELECT HOUR(COALESCE(m.outbound_time, m.create_time)) AS hour, COUNT(*) AS count " +
            "FROM t_material_outbound_log m " +
            "JOIN t_material_stock s ON m.stock_id = s.id " +
            "WHERE DATE(COALESCE(m.outbound_time, m.create_time)) = #{today} " +
            "AND (s.material_type LIKE CONCAT(#{materialType}, '%') " +
            "     OR (#{materialType} = 'fabric' AND s.material_type LIKE 'lining%') " +
            "     OR (#{materialType} = 'fabric' AND s.material_type = '面料') " +
            "     OR (#{materialType} = 'accessory' AND s.material_type = '辅料')) " +
            "AND (m.delete_flag IS NULL OR m.delete_flag = 0) " +
            "AND (#{tenantId} IS NULL OR m.tenant_id = #{tenantId}) " +
            "GROUP BY HOUR(COALESCE(m.outbound_time, m.create_time))")
    List<Map<String, Object>> selectTodayOutboundByHourAndType(@Param("today") LocalDate today, @Param("materialType") String materialType, @Param("tenantId") Long tenantId);

    @Select("SELECT DATE(COALESCE(m.outbound_time, m.create_time)) AS date, COUNT(*) AS count " +
            "FROM t_material_outbound_log m " +
            "JOIN t_material_stock s ON m.stock_id = s.id " +
            "WHERE DATE(COALESCE(m.outbound_time, m.create_time)) BETWEEN #{startDate} AND #{today} " +
            "AND (s.material_type LIKE CONCAT(#{materialType}, '%') " +
            "     OR (#{materialType} = 'fabric' AND s.material_type LIKE 'lining%') " +
            "     OR (#{materialType} = 'fabric' AND s.material_type = '面料') " +
            "     OR (#{materialType} = 'accessory' AND s.material_type = '辅料')) " +
            "AND (m.delete_flag IS NULL OR m.delete_flag = 0) " +
            "AND (#{tenantId} IS NULL OR m.tenant_id = #{tenantId}) " +
            "GROUP BY DATE(COALESCE(m.outbound_time, m.create_time))")
    List<Map<String, Object>> selectLast7DaysOutboundByType(@Param("startDate") LocalDate startDate, @Param("today") LocalDate today, @Param("materialType") String materialType, @Param("tenantId") Long tenantId);

    @Select("SELECT DAY(COALESCE(m.outbound_time, m.create_time)) AS day, COUNT(*) AS count " +
            "FROM t_material_outbound_log m " +
            "JOIN t_material_stock s ON m.stock_id = s.id " +
            "WHERE DATE(COALESCE(m.outbound_time, m.create_time)) BETWEEN #{startDate} AND #{today} " +
            "AND (s.material_type LIKE CONCAT(#{materialType}, '%') " +
            "     OR (#{materialType} = 'fabric' AND s.material_type LIKE 'lining%') " +
            "     OR (#{materialType} = 'fabric' AND s.material_type = '面料') " +
            "     OR (#{materialType} = 'accessory' AND s.material_type = '辅料')) " +
            "AND (m.delete_flag IS NULL OR m.delete_flag = 0) " +
            "AND (#{tenantId} IS NULL OR m.tenant_id = #{tenantId}) " +
            "GROUP BY DAY(COALESCE(m.outbound_time, m.create_time))")
    List<Map<String, Object>> selectLast30DaysOutboundByType(@Param("startDate") LocalDate startDate, @Param("today") LocalDate today, @Param("materialType") String materialType, @Param("tenantId") Long tenantId);

    @Select("SELECT MONTH(COALESCE(m.outbound_time, m.create_time)) AS month, COUNT(*) AS count " +
            "FROM t_material_outbound_log m " +
            "JOIN t_material_stock s ON m.stock_id = s.id " +
            "WHERE YEAR(COALESCE(m.outbound_time, m.create_time)) = #{year} " +
            "AND (s.material_type LIKE CONCAT(#{materialType}, '%') " +
            "     OR (#{materialType} = 'fabric' AND s.material_type LIKE 'lining%') " +
            "     OR (#{materialType} = 'fabric' AND s.material_type = '面料') " +
            "     OR (#{materialType} = 'accessory' AND s.material_type = '辅料')) " +
            "AND (m.delete_flag IS NULL OR m.delete_flag = 0) " +
            "AND (#{tenantId} IS NULL OR m.tenant_id = #{tenantId}) " +
            "GROUP BY MONTH(COALESCE(m.outbound_time, m.create_time))")
    List<Map<String, Object>> selectYearOutboundByMonthAndType(@Param("year") int year, @Param("materialType") String materialType, @Param("tenantId") Long tenantId);
}
