package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.RiskDetectionResultEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface RiskDetectionResultMapper extends BaseMapper<RiskDetectionResultEntity> {

    @Select("SELECT * FROM t_risk_detection_result WHERE tenant_id = #{tenantId} AND status = 'open' AND delete_flag = 0 ORDER BY risk_score DESC, detected_at DESC LIMIT #{limit}")
    List<RiskDetectionResultEntity> findOpenByTenant(@Param("tenantId") Long tenantId,
                                                         @Param("limit") int limit);

    @Select("SELECT * FROM t_risk_detection_result WHERE tenant_id = #{tenantId} AND risk_type = #{riskType} AND target_id = #{targetId} AND status = 'open' AND delete_flag = 0 ORDER BY detected_at DESC LIMIT 1")
    RiskDetectionResultEntity findOpenByTarget(@Param("tenantId") Long tenantId,
                                                  @Param("riskType") String riskType,
                                                  @Param("targetId") String targetId);

    @Update("UPDATE t_risk_detection_result SET status = 'resolved', resolved_at = NOW() WHERE id = #{id}")
    int resolveById(@Param("id") Long id);
}
