package com.fashion.supplychain.integration.record.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.integration.record.entity.IntegrationCallbackLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface IntegrationCallbackLogMapper extends BaseMapper<IntegrationCallbackLog> {

    @Select("SELECT * FROM t_integration_callback_log WHERE related_order_id = #{orderId} ORDER BY created_time DESC")
    List<IntegrationCallbackLog> findByOrderId(String orderId);

    @Select("SELECT * FROM t_integration_callback_log WHERE processed = 0 ORDER BY created_time ASC LIMIT #{limit}")
    List<IntegrationCallbackLog> findUnprocessed(int limit);
}
