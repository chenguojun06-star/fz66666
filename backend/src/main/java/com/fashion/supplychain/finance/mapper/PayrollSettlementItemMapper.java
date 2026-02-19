package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.finance.entity.PayrollSettlementItem;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface PayrollSettlementItemMapper extends BaseMapper<PayrollSettlementItem> {
    @Select("SELECT * FROM t_payroll_settlement_item WHERE settlement_id = #{settlementId} ORDER BY operator_name, process_name")
    List<PayrollSettlementItem> selectBySettlementId(@Param("settlementId") String settlementId);
}
