package com.fashion.supplychain.integration.record.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.integration.record.entity.LogisticsRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface LogisticsRecordMapper extends BaseMapper<LogisticsRecord> {

    @Select("SELECT * FROM t_logistics_record WHERE tenant_id = #{tenantId} AND order_id = #{orderId} ORDER BY created_time DESC")
    List<LogisticsRecord> findByOrderId(Long tenantId, String orderId);

    @Select("SELECT * FROM t_logistics_record WHERE tracking_number = #{trackingNumber} LIMIT 1")
    LogisticsRecord findByTrackingNumber(String trackingNumber);
}
