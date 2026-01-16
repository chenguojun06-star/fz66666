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
            "  v.order_id AS orderId,",
            "  v.procurement_start_time AS procurementStartTime,",
            "  v.procurement_end_time AS procurementEndTime,",
            "  v.procurement_operator_name AS procurementOperatorName,",
            "  v.purchase_quantity AS purchaseQuantity,",
            "  v.arrived_quantity AS arrivedQuantity",
            "FROM v_production_order_procurement_snapshot v",
            "WHERE v.order_id IN",
            "<foreach collection='orderIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
            "</script>"
    })
    List<Map<String, Object>> selectProcurementSnapshot(@Param("orderIds") List<String> orderIds);
}
