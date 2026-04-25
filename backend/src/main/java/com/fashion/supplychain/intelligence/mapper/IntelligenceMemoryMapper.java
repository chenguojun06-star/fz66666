package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.IntelligenceMemory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface IntelligenceMemoryMapper extends BaseMapper<IntelligenceMemory> {

    @Update("UPDATE t_intelligence_memory SET recall_count = recall_count + 1 " +
            "WHERE id=#{id} AND tenant_id = #{tenantId}")
    int incrementRecall(@Param("id") Long id, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_intelligence_memory SET adopted_count = adopted_count + 1 " +
            "WHERE id=#{id} AND tenant_id = #{tenantId}")
    int incrementAdopted(@Param("id") Long id, @Param("tenantId") Long tenantId);

        default int incrementRecallCount(Long id) {
                return incrementRecall(id, com.fashion.supplychain.common.UserContext.tenantId());
        }

        default int incrementAdoptedCount(Long id) {
                return incrementAdopted(id, com.fashion.supplychain.common.UserContext.tenantId());
        }
}
