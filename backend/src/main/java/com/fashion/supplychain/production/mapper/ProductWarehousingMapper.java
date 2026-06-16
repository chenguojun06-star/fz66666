package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Mapper
public interface ProductWarehousingMapper extends BaseMapper<ProductWarehousing> {

    /**
     * 统计成品总数
     */
    @Select("SELECT IFNULL(SUM(qualified_quantity), 0) FROM t_product_warehousing WHERE delete_flag = 0" +
            " AND tenant_id = #{tenantId}")
    Integer selectTotalQuantity(@Param("tenantId") Long tenantId);

    /**
     * 统计今日入库次数
     */
    @Select("SELECT COUNT(*) FROM t_product_warehousing " +
            "WHERE warehousing_end_time >= #{today} AND warehousing_end_time < DATE_ADD(#{today}, INTERVAL 1 DAY) AND delete_flag = 0" +
            " AND tenant_id = #{tenantId}")
    Integer selectTodayInboundCount(@Param("today") LocalDate today, @Param("tenantId") Long tenantId);

    /**
     * 查询今日入库列表
     */
    @Select("SELECT * FROM t_product_warehousing " +
            "WHERE warehousing_end_time >= #{today} AND warehousing_end_time < DATE_ADD(#{today}, INTERVAL 1 DAY) AND delete_flag = 0" +
            " AND tenant_id = #{tenantId}" +
            " ORDER BY warehousing_end_time DESC LIMIT 20")
    List<ProductWarehousing> selectTodayInbound(@Param("today") LocalDate today, @Param("tenantId") Long tenantId);

    /**
     * 查询今日每小时入库数量
     */
    @Select("SELECT HOUR(warehousing_end_time) as hour, CAST(SUM(qualified_quantity) AS SIGNED) as count " +
            "FROM t_product_warehousing " +
            "WHERE warehousing_end_time >= #{today} AND warehousing_end_time < DATE_ADD(#{today}, INTERVAL 1 DAY) AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId} " +
            "GROUP BY HOUR(warehousing_end_time)")
    List<Map<String, Object>> selectTodayInboundByHour(@Param("today") LocalDate today, @Param("tenantId") Long tenantId);

    /**
     * 查询最近7天入库数量（按日期分组）
     * 用范围查询替代 DATE() 函数，允许走 warehousing_end_time 索引
     */
    @Select("SELECT DATE(warehousing_end_time) as date, CAST(SUM(qualified_quantity) AS SIGNED) as count " +
            "FROM t_product_warehousing " +
            "WHERE warehousing_end_time >= DATE_SUB(#{today}, INTERVAL 7 DAY) " +
            "AND warehousing_end_time < DATE_ADD(#{today}, INTERVAL 1 DAY) AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId} " +
            "GROUP BY DATE(warehousing_end_time)")
    List<Map<String, Object>> selectLast7DaysInbound(@Param("today") LocalDate today, @Param("tenantId") Long tenantId);

    /**
     * 查询最近30天入库数量（按日期分组）
     * 用范围查询替代 YEAR()/MONTH() 函数，允许走索引
     */
    @Select("SELECT DAY(warehousing_end_time) as day, CAST(SUM(qualified_quantity) AS SIGNED) as count " +
            "FROM t_product_warehousing " +
            "WHERE warehousing_end_time >= DATE_FORMAT(#{today}, '%Y-%m-01') " +
            "AND warehousing_end_time < DATE_ADD(DATE_FORMAT(#{today}, '%Y-%m-01'), INTERVAL 1 MONTH) AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId} " +
            "GROUP BY DAY(warehousing_end_time)")
    List<Map<String, Object>> selectLast30DaysInbound(@Param("today") LocalDate today, @Param("tenantId") Long tenantId);

    /**
     * 查询年度入库数量（按月分组）
     * 用范围查询替代 YEAR() 函数，允许走索引
     */
    @Select("SELECT MONTH(warehousing_end_time) as month, CAST(SUM(qualified_quantity) AS SIGNED) as count " +
            "FROM t_product_warehousing " +
            "WHERE warehousing_end_time >= CONCAT(#{year}, '-01-01 00:00:00') " +
            "AND warehousing_end_time < CONCAT(#{year} + 1, '-01-01 00:00:00') AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId} " +
            "GROUP BY MONTH(warehousing_end_time)")
    List<Map<String, Object>> selectYearInboundByMonth(@Param("year") int year, @Param("tenantId") Long tenantId);

    /**
     * 质检入库页面顶部统计：用SQL聚合替代全量加载到内存
     * 返回: totalCount, totalOrders, totalQuantity, qualifiedCount, qualifiedQuantity,
     *       unqualifiedCount, unqualifiedQuantity, todayCount, todayOrders, todayQuantity
     */
    @Select({
            "SELECT",
            "  COUNT(*) AS totalCount,",
            "  COUNT(DISTINCT CASE WHEN order_no IS NOT NULL AND order_no != '' THEN order_no END) AS totalOrders,",
            "  COALESCE(SUM(warehousing_quantity), 0) AS totalQuantity,",
            "  SUM(CASE WHEN LOWER(COALESCE(quality_status,'')) != 'unqualified' THEN 1 ELSE 0 END) AS qualifiedCount,",
            "  COALESCE(SUM(CASE WHEN LOWER(COALESCE(quality_status,'')) != 'unqualified'",
            "    THEN COALESCE(qualified_quantity, warehousing_quantity, 0) ELSE 0 END), 0) AS qualifiedQuantity,",
            "  SUM(CASE WHEN LOWER(COALESCE(quality_status,'')) = 'unqualified' THEN 1 ELSE 0 END) AS unqualifiedCount,",
            "  COALESCE(SUM(CASE WHEN LOWER(COALESCE(quality_status,'')) = 'unqualified'",
            "    THEN COALESCE(unqualified_quantity, 0) ELSE 0 END), 0) AS unqualifiedQuantity,",
            "  SUM(CASE WHEN create_time >= CURDATE() AND create_time < DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS todayCount,",
            "  COUNT(DISTINCT CASE WHEN create_time >= CURDATE() AND create_time < DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
            "    AND order_no IS NOT NULL AND order_no != '' THEN order_no END) AS todayOrders,",
            "  COALESCE(SUM(CASE WHEN create_time >= CURDATE() AND create_time < DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
            "    THEN warehousing_quantity ELSE 0 END), 0) AS todayQuantity",
            "FROM t_product_warehousing",
            "WHERE (delete_flag = 0 OR delete_flag IS NULL)",
            "AND tenant_id = #{tenantId}"
    })
    Map<String, Object> selectWarehousingStats(@Param("tenantId") Long tenantId);

    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT cb.size AS size, pw.qualified_quantity AS qualified_quantity " +
            "FROM t_product_warehousing pw " +
            "JOIN t_cutting_bundle cb ON pw.cutting_bundle_id = cb.id " +
            "WHERE pw.tenant_id = #{tenantId} AND cb.tenant_id = #{tenantId} AND pw.delete_flag = 0 " +
            "AND pw.style_no = #{styleNo} AND pw.create_time >= #{start} " +
            "LIMIT 5000")
    List<Map<String, Object>> selectSizeQuantityByStyleNo(
            @Param("tenantId") Long tenantId,
            @Param("styleNo") String styleNo,
            @Param("start") java.time.LocalDateTime start);
}
