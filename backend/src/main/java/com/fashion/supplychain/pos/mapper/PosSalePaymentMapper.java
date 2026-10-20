package com.fashion.supplychain.pos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.pos.entity.PosSalePayment;
import org.apache.ibatis.annotations.Mapper;

/** POS 销售单组合支付明细 Mapper（租户业务数据，保留租户隔离拦截器）。 */
@Mapper
public interface PosSalePaymentMapper extends BaseMapper<PosSalePayment> {
}
