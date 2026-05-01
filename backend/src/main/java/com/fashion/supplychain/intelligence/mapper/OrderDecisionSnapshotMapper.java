package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.OrderDecisionSnapshot;
import org.apache.ibatis.annotations.Mapper;

@Mapper
@InterceptorIgnore(tenantLine = "true")
public interface OrderDecisionSnapshotMapper extends BaseMapper<OrderDecisionSnapshot> {
}
