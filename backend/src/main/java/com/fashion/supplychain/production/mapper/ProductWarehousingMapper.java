package com.fashion.supplychain.production.mapper;

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
    @Select("SELECT IFNULL(SUM(qualified_quantity), 0) FROM t_product_warehousing WHERE delete_flag = 0")
    Integer selectTotalQuantity();

    /**
     * 统计今日入库次数
     */
    @Select("SELECT COUNT(*) FROM t_product_warehousing " +
            "WHERE DATE(warehousing_end_time) = #{today} AND delete_flag = 0")
    Integer selectTodayInboundCount(@Param("today") LocalDate today);

    /**
     * 查询今日入库列表
     */
    @Select("SELECT * FROM t_product_warehousing " +
            "WHERE DATE(warehousing_end_time) = #{today} AND delete_flag = 0 " +
            "ORDER BY warehousing_end_time DESC LIMIT 20")
    List<ProductWarehousing> selectTodayInbound(@Param("today") LocalDate today);

    /**
     * 查询今日每小时入库数量
     */
    @Select("SELECT HOUR(warehousing_end_time) as hour, CAST(SUM(qualified_quantity) AS SIGNED) as count " +
            "FROM t_product_warehousing " +
            "WHERE DATE(warehousing_end_time) = #{today} AND delete_flag = 0 " +
            "GROUP BY HOUR(warehousing_end_time)")
    List<Map<String, Object>> selectTodayInboundByHour(@Param("today") LocalDate today);

    /**
     * 查询最近7天入库数量（按日期分组）
     */
    @Select("SELECT DATE(warehousing_end_time) as date, CAST(SUM(qualified_quantity) AS SIGNED) as count " +
            "FROM t_product_warehousing " +
            "WHERE warehousing_end_time >= DATE_SUB(#{today}, INTERVAL 7 DAY) AND delete_flag = 0 " +
            "GROUP BY DATE(warehousing_end_time)")
    List<Map<String, Object>> selectLast7DaysInbound(@Param("today") LocalDate today);

    /**
     * 查询最近30天入库数量（按日期分组）
     */
    @Select("SELECT DAY(warehousing_end_time) as day, CAST(SUM(qualified_quantity) AS SIGNED) as count " +
            "FROM t_product_warehousing " +
            "WHERE YEAR(warehousing_end_time) = YEAR(#{today}) " +
            "AND MONTH(warehousing_end_time) = MONTH(#{today}) AND delete_flag = 0 " +
            "GROUP BY DAY(warehousing_end_time)")
    List<Map<String, Object>> selectLast30DaysInbound(@Param("today") LocalDate today);

    /**
     * 查询年度入库数量（按月分组）
     */
    @Select("SELECT MONTH(warehousing_end_time) as month, CAST(SUM(qualified_quantity) AS SIGNED) as count " +
            "FROM t_product_warehousing " +
            "WHERE YEAR(warehousing_end_time) = #{year} AND delete_flag = 0 " +
            "GROUP BY MONTH(warehousing_end_time)")
    List<Map<String, Object>> selectYearInboundByMonth(@Param("year") int year);

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
            "WHERE (delete_flag = 0 OR delete_flag IS NULL)"
    })
    Map<String, Object> selectWarehousingStats();
}
