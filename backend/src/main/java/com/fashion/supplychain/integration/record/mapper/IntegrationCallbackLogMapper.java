package com.fashion.supplychain.integration.record.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.integration.record.entity.IntegrationCallbackLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface IntegrationCallbackLogMapper extends BaseMapper<IntegrationCallbackLog> {

    @Select("SELECT * FROM t_integration_callback_log WHERE related_order_id = #{orderId} AND tenant_id = #{tenantId} ORDER BY created_time DESC")
    List<IntegrationCallbackLog> findByOrderId(@Param("orderId") String orderId, @Param("tenantId") Long tenantId);

    @Select("SELECT * FROM t_integration_callback_log WHERE processed = 0 AND tenant_id = #{tenantId} ORDER BY created_time ASC LIMIT #{limit}")
    List<IntegrationCallbackLog> findUnprocessed(@Param("limit") int limit, @Param("tenantId") Long tenantId);
}
