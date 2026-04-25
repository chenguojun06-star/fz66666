package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.MaterialRoll;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface MaterialRollMapper extends BaseMapper<MaterialRoll> {

    @Select("SELECT * FROM t_material_roll WHERE inbound_id = #{inboundId} AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId} ORDER BY create_time ASC")
    List<MaterialRoll> selectByInboundId(@Param("inboundId") String inboundId, @Param("tenantId") Long tenantId);

    @Select("SELECT * FROM t_material_roll WHERE material_code = #{materialCode} " +
            "AND status = 'IN_STOCK' AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId} ORDER BY create_time ASC")
    List<MaterialRoll> selectInStockByMaterialCode(@Param("materialCode") String materialCode,
                                                    @Param("tenantId") Long tenantId);
}
