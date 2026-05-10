package com.fashion.supplychain.integration.sync.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.integration.sync.entity.EcSyncConfig;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EcSyncConfigMapper extends BaseMapper<EcSyncConfig> {
}
