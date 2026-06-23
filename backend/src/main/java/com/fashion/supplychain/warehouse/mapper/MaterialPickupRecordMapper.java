package com.fashion.supplychain.warehouse.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.warehouse.entity.MaterialPickupRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * 面辅料领取记录 Mapper
 */
@Mapper
public interface MaterialPickupRecordMapper extends BaseMapper<MaterialPickupRecord> {

    /**
     * 查询订单未汇总的物料领取记录
     */
    @Select("SELECT * FROM t_material_pickup_record WHERE order_no = #{orderNo} AND tenant_id = #{tenantId} AND factory_type = #{factoryType} AND cost_settled = 0 AND delete_flag = 0")
    List<MaterialPickupRecord> selectUnsettledByOrderNo(@Param("orderNo") String orderNo, @Param("tenantId") Long tenantId, @Param("factoryType") String factoryType);

    /**
     * 标记物料记录已汇总
     */
    @Update("UPDATE t_material_pickup_record SET cost_settled = 1, update_time = NOW() WHERE id = #{id} AND tenant_id = #{tenantId}")
    int markCostSettled(@Param("id") String id, @Param("tenantId") Long tenantId);

    /**
     * 查询所有有未汇总物料成本的订单号
     */
    @Select("SELECT DISTINCT order_no FROM t_material_pickup_record WHERE tenant_id = #{tenantId} AND factory_type = #{factoryType} AND cost_settled = 0 AND delete_flag = 0")
    List<String> selectUnsettledOrderNos(@Param("tenantId") Long tenantId, @Param("factoryType") String factoryType);
}
