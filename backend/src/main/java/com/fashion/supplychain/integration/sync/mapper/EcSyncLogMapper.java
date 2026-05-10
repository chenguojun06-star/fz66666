package com.fashion.supplychain.integration.sync.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.integration.sync.entity.EcSyncLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface EcSyncLogMapper extends BaseMapper<EcSyncLog> {

    @Select("SELECT COUNT(*) FROM t_ec_sync_log WHERE tenant_id = #{tenantId} AND status = #{status}")
    int countByStatus(@Param("tenantId") Long tenantId, @Param("status") String status);
}
