package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface MaterialPurchaseMapper extends BaseMapper<MaterialPurchase> {

    @Select({
            "<script>",
            "SELECT",
            "  p.order_id AS orderId,",
            "  MIN(CASE WHEN p.status = 'completed' OR p.received_time IS NOT NULL THEN COALESCE(p.received_time, p.update_time, p.create_time) END) AS procurementStartTime,",
            "  MAX(CASE WHEN p.status = 'completed' THEN COALESCE(p.actual_arrival_date, p.received_time, p.update_time) END) AS procurementEndTime,",
            "  SUBSTRING_INDEX(",
            "    MAX(CASE WHEN p.status = 'completed' THEN CONCAT(LPAD(UNIX_TIMESTAMP(COALESCE(p.actual_arrival_date, p.received_time, p.update_time)), 20, '0'), LPAD(UNIX_TIMESTAMP(p.update_time), 20, '0'), '|', IFNULL(p.receiver_name, '')) END),",
            "    '|', -1",
            "  ) AS procurementOperatorName,",
            "  SUM(IFNULL(p.purchase_quantity, 0)) AS purchaseQuantity,",
            "  SUM(IFNULL(p.arrived_quantity, 0)) AS arrivedQuantity",
            "FROM t_material_purchase p",
            "WHERE p.delete_flag = 0",
            "  AND p.order_id IS NOT NULL",
            "  AND p.order_id &lt;&gt; ''",
            "  AND p.order_id IN",
            "  <foreach collection='orderIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
            "GROUP BY p.order_id",
            "</script>"
    })
    List<Map<String, Object>> selectProcurementSnapshot(@Param("orderIds") List<String> orderIds);
}
