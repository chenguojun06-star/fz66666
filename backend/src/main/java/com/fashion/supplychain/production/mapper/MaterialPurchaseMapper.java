package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MaterialPurchaseMapper extends BaseMapper<MaterialPurchase> {

    @Select({
            "<script>",
            "SELECT",
            "  p.order_id AS orderId,",
            "  MIN(CASE WHEN p.status = 'completed' OR p.received_time IS NOT NULL THEN COALESCE(p.received_time, p.update_time, p.create_time) END) AS procurementStartTime,",
            "  MAX(CASE WHEN p.status = 'completed' THEN COALESCE(p.actual_arrival_date, p.received_time, p.update_time) END) AS procurementEndTime,",
            "  SUBSTRING_INDEX(",
            "    MAX(CASE WHEN p.status = 'completed' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(COALESCE(p.actual_arrival_date, p.received_time, p.update_time)), 20, '0'), LPAD(UNIX_TIMESTAMP(p.update_time), 20, '0'), '|', IFNULL(p.receiver_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),",
            "    '|', -1",
            "  ) AS procurementOperatorName,",
            "  SUM(IFNULL(p.purchase_quantity, 0)) AS purchaseQuantity,",
            "  SUM(IFNULL(p.arrived_quantity, 0)) AS arrivedQuantity",
            "FROM t_material_purchase p",
            "WHERE p.delete_flag = 0",
            "  AND p.tenant_id = #{tenantId}",
            "  AND p.order_id IS NOT NULL",
            "  AND p.order_id &lt;&gt; ''",
            "  AND p.order_id IN",
            "  <foreach collection='orderIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
            "GROUP BY p.order_id",
            "</script>"
    })
    List<Map<String, Object>> selectProcurementSnapshot(@Param("orderIds") List<String> orderIds, @Param("tenantId") Long tenantId);

    @Select("SELECT COUNT(*) FROM t_material_purchase " +
            "WHERE DATE(actual_arrival_date) = #{today} AND delete_flag = 0" +
            " AND tenant_id = #{tenantId}")
    Integer selectTodayArrivalCount(@Param("today") LocalDate today, @Param("tenantId") Long tenantId);

    @Select("SELECT * FROM t_material_purchase " +
            "WHERE DATE(actual_arrival_date) = #{today} AND delete_flag = 0" +
            " AND tenant_id = #{tenantId}" +
            " ORDER BY actual_arrival_date DESC LIMIT 20")
    List<MaterialPurchase> selectTodayArrivals(@Param("today") LocalDate today, @Param("tenantId") Long tenantId);

    @Select("SELECT " +
            "  HOUR(actual_arrival_date) as hour, " +
            "  COUNT(*) as count " +
            "FROM t_material_purchase " +
            "WHERE DATE(actual_arrival_date) = #{today} " +
            "  AND delete_flag = 0 " +
            "  AND tenant_id = #{tenantId} " +
            "  AND (material_type LIKE CONCAT(#{materialType}, '%') " +
            "       OR (#{materialType} = 'fabric' AND material_type LIKE 'lining%') " +
            "       OR (#{materialType} = 'fabric' AND material_type = '面料') " +
            "       OR (#{materialType} = 'accessory' AND material_type = '辅料')) " +
            "GROUP BY HOUR(actual_arrival_date)")
    List<Map<String, Object>> selectTodayInboundByHourAndType(
        @Param("today") LocalDate today,
        @Param("materialType") String materialType,
        @Param("tenantId") Long tenantId
    );

    @Select("SELECT " +
            "  DATE(actual_arrival_date) as date, " +
            "  COUNT(*) as count " +
            "FROM t_material_purchase " +
            "WHERE actual_arrival_date >= #{startDate} " +
            "  AND actual_arrival_date <= #{endDate} " +
            "  AND delete_flag = 0 " +
            "  AND tenant_id = #{tenantId} " +
            "  AND (material_type LIKE CONCAT(#{materialType}, '%') " +
            "       OR (#{materialType} = 'fabric' AND material_type LIKE 'lining%') " +
            "       OR (#{materialType} = 'fabric' AND material_type = '面料') " +
            "       OR (#{materialType} = 'accessory' AND material_type = '辅料')) " +
            "GROUP BY DATE(actual_arrival_date)")
    List<Map<String, Object>> selectLast7DaysInboundByType(
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate,
        @Param("materialType") String materialType,
        @Param("tenantId") Long tenantId
    );

    @Select("SELECT " +
            "  DAY(actual_arrival_date) as day, " +
            "  COUNT(*) as count " +
            "FROM t_material_purchase " +
            "WHERE actual_arrival_date >= #{startDate} " +
            "  AND actual_arrival_date <= #{endDate} " +
            "  AND delete_flag = 0 " +
            "  AND tenant_id = #{tenantId} " +
            "  AND (material_type LIKE CONCAT(#{materialType}, '%') " +
            "       OR (#{materialType} = 'fabric' AND material_type LIKE 'lining%') " +
            "       OR (#{materialType} = 'fabric' AND material_type = '面料') " +
            "       OR (#{materialType} = 'accessory' AND material_type = '辅料')) " +
            "GROUP BY DAY(actual_arrival_date)")
    List<Map<String, Object>> selectLast30DaysInboundByType(
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate,
        @Param("materialType") String materialType,
        @Param("tenantId") Long tenantId
    );

    @Select("SELECT " +
            "  MONTH(actual_arrival_date) as month, " +
            "  COUNT(*) as count " +
            "FROM t_material_purchase " +
            "WHERE YEAR(actual_arrival_date) = #{year} " +
            "  AND delete_flag = 0 " +
            "  AND tenant_id = #{tenantId} " +
            "  AND (material_type LIKE CONCAT(#{materialType}, '%') " +
            "       OR (#{materialType} = 'fabric' AND material_type LIKE 'lining%') " +
            "       OR (#{materialType} = 'fabric' AND material_type = '面料') " +
            "       OR (#{materialType} = 'accessory' AND material_type = '辅料')) " +
            "GROUP BY MONTH(actual_arrival_date)")
    List<Map<String, Object>> selectYearInboundByMonthAndType(
        @Param("year") Integer year,
        @Param("materialType") String materialType,
        @Param("tenantId") Long tenantId
    );

    @Update("UPDATE t_material_purchase SET " +
            "arrived_quantity = COALESCE(arrived_quantity, 0) + #{delta}, " +
            "actual_arrival_date = NOW(), " +
            "update_time = NOW() " +
            "WHERE id = #{id} AND delete_flag = 0")
    int atomicAddArrivedQuantity(@Param("id") String id, @Param("delta") int delta);
}
