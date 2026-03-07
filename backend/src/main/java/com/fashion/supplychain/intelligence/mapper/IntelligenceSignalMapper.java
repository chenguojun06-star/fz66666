package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.IntelligenceSignal;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface IntelligenceSignalMapper extends BaseMapper<IntelligenceSignal> {

    @Update("UPDATE t_intelligence_signal SET status='resolved', resolved_at=NOW() " +
            "WHERE id=#{id} AND tenant_id=#{tenantId}")
    int resolveSignal(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
