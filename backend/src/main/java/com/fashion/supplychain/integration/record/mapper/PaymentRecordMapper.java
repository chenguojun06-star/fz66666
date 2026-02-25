package com.fashion.supplychain.integration.record.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.integration.record.entity.PaymentRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface PaymentRecordMapper extends BaseMapper<PaymentRecord> {

    @Select("SELECT * FROM t_payment_record WHERE tenant_id = #{tenantId} AND order_id = #{orderId} ORDER BY created_time DESC")
    List<PaymentRecord> findByOrderId(Long tenantId, String orderId);

    @Select("SELECT * FROM t_payment_record WHERE third_party_order_id = #{thirdPartyOrderId} LIMIT 1")
    PaymentRecord findByThirdPartyOrderId(String thirdPartyOrderId);
}
